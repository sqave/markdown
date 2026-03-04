use serde::{Deserialize, Serialize};
use serde_json::json;
use std::env;
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    window::Color,
    AppHandle, DragDropEvent, Emitter, Manager, RunEvent, State, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
};

// -- App state --

struct AppState {
    pending_file: Mutex<Option<PendingFile>>,
    notion_auth: Mutex<Option<NotionAuth>>,
    notion_env_disabled: Mutex<bool>,
}

#[derive(Clone, Serialize, Deserialize)]
struct PendingFile {
    #[serde(rename = "filePath")]
    file_path: String,
    content: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct FileResult {
    #[serde(rename = "filePath")]
    file_path: String,
    content: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct FileSnapshot {
    #[serde(rename = "filePath")]
    file_path: String,
    content: String,
    #[serde(rename = "modifiedMs")]
    modified_ms: u128,
    size: u64,
}

#[derive(Clone, Serialize, Deserialize)]
struct NotionAuth {
    token: String,
    #[serde(rename = "workspaceName")]
    workspace_name: Option<String>,
    #[serde(rename = "botName")]
    bot_name: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct NotionAuthDisk {
    #[serde(rename = "workspaceName")]
    workspace_name: Option<String>,
    #[serde(rename = "botName")]
    bot_name: Option<String>,
}

#[derive(Clone, Serialize)]
struct NotionAuthStatus {
    connected: bool,
    #[serde(rename = "workspaceName")]
    workspace_name: Option<String>,
    #[serde(rename = "botName")]
    bot_name: Option<String>,
}

#[derive(Clone, Serialize)]
struct MdDirEntry {
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "filePath")]
    file_path: String,
}

#[derive(Clone, Serialize)]
struct NotionPageSummary {
    id: String,
    title: String,
    #[serde(rename = "lastEditedTime")]
    last_edited_time: Option<String>,
}

#[derive(Clone, Serialize)]
struct NotionPageDocument {
    #[serde(rename = "pageId")]
    page_id: String,
    title: String,
    content: String,
    #[serde(rename = "lastEditedTime")]
    last_edited_time: Option<String>,
}

// -- Tauri commands --

#[tauri::command]
async fn open_file(app: AppHandle) -> Result<Option<FileResult>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app
        .dialog()
        .file()
        .blocking_pick_file();

    match file_path {
        Some(path) => {
            let path_str = path.to_string();
            let content =
                fs::read_to_string(&path_str).map_err(|e| format!("Failed to read file: {e}"))?;
            Ok(Some(FileResult {
                file_path: path_str,
                content,
            }))
        }
        None => Ok(None),
    }
}

#[tauri::command]
async fn save_file(file_path: String, content: String) -> Result<bool, String> {
    fs::write(&file_path, &content).map_err(|e| format!("Failed to write file: {e}"))?;
    Ok(true)
}

#[tauri::command]
async fn save_file_as(app: AppHandle, content: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app
        .dialog()
        .file()
        .set_file_name("untitled.md")
        .blocking_save_file();

    match file_path {
        Some(path) => {
            let path_str = path.to_string();
            fs::write(&path_str, &content).map_err(|e| format!("Failed to write file: {e}"))?;
            Ok(Some(path_str))
        }
        None => Ok(None),
    }
}

#[tauri::command]
async fn read_file_snapshot(file_path: String) -> Result<FileSnapshot, String> {
    let content = fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {e}"))?;
    let metadata = fs::metadata(&file_path).map_err(|e| format!("Failed to stat file: {e}"))?;
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|mtime| mtime.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);

    Ok(FileSnapshot {
        file_path,
        content,
        modified_ms,
        size: metadata.len(),
    })
}

#[tauri::command]
fn set_window_title(app: AppHandle, title: String) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&title);
    }
}

#[tauri::command]
fn set_document_edited(_app: AppHandle, _edited: bool) {
    // TODO: macOS NSWindow document-edited indicator via raw objc call
    // The title prefix "● " already indicates unsaved changes in the tab/title
}

#[tauri::command]
fn open_file_folder(file_path: String) -> Result<bool, String> {
    let parent = std::path::Path::new(&file_path)
        .parent()
        .ok_or("Invalid file path")?;

    #[cfg(target_os = "macos")]
    let status = Command::new("open")
        .arg(parent)
        .status()
        .map_err(|e| format!("Failed to open folder: {e}"))?;

    #[cfg(target_os = "windows")]
    let status = Command::new("explorer")
        .arg(parent)
        .status()
        .map_err(|e| format!("Failed to open folder: {e}"))?;

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open")
        .arg(parent)
        .status()
        .map_err(|e| format!("Failed to open folder: {e}"))?;

    if !status.success() {
        return Err("Failed to open containing folder".to_string());
    }

    Ok(true)
}

#[tauri::command]
fn get_pending_file(state: State<AppState>) -> Option<PendingFile> {
    state.pending_file.lock().ok().and_then(|mut g| g.take())
}

#[tauri::command]
fn git_show(file_path: String) -> Result<String, String> {
    // Get the directory containing the file for git context
    let dir = std::path::Path::new(&file_path)
        .parent()
        .ok_or("Invalid file path")?;

    // Get relative path from git root
    let git_root = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git error: {e}"))?;

    if !git_root.status.success() {
        return Err("Not a git repository".to_string());
    }

    let root = String::from_utf8_lossy(&git_root.stdout).trim().to_string();
    let rel_path = file_path
        .strip_prefix(&root)
        .unwrap_or(&file_path)
        .trim_start_matches('/');

    let output = Command::new("git")
        .args(["show", &format!("HEAD:{rel_path}")])
        .current_dir(&root)
        .output()
        .map_err(|e| format!("git error: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
async fn list_md_files(dir_path: String) -> Result<Vec<MdDirEntry>, String> {
    let entries =
        fs::read_dir(&dir_path).map_err(|e| format!("Failed to read directory: {e}"))?;

    let mut files: Vec<MdDirEntry> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if !path.is_file() {
                return None;
            }
            let ext = path.extension()?.to_str()?.to_lowercase();
            if ext != "md" && ext != "markdown" {
                return None;
            }
            let file_name = entry.file_name().to_string_lossy().to_string();
            let file_path = path.to_string_lossy().to_string();
            Some(MdDirEntry {
                file_name,
                file_path,
            })
        })
        .collect();

    files.sort_by(|a, b| a.file_name.to_lowercase().cmp(&b.file_name.to_lowercase()));
    Ok(files)
}

// -- VSIX extraction for plugin system --

#[derive(Clone, Serialize)]
struct ExtensionInfo {
    name: String,
    #[serde(rename = "displayName")]
    display_name: String,
    themes: Vec<String>,
    grammars: Vec<String>,
    snippets: Vec<String>,
    #[serde(rename = "installPath")]
    install_path: String,
}

#[tauri::command]
async fn extract_vsix(app: AppHandle, vsix_path: String) -> Result<ExtensionInfo, String> {
    use std::io::Read;

    let extensions_dir = app
        .path()
        .home_dir()
        .map_err(|e| format!("Cannot find home dir: {e}"))?
        .join(".cogmd")
        .join("extensions");

    let file = std::fs::File::open(&vsix_path).map_err(|e| format!("Cannot open VSIX: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Invalid VSIX archive: {e}"))?;

    // Read package.json from the VSIX
    let package_json: serde_json::Value = {
        let mut entry = archive
            .by_name("extension/package.json")
            .map_err(|_| "VSIX missing extension/package.json".to_string())?;
        let mut content = String::new();
        entry
            .read_to_string(&mut content)
            .map_err(|e| format!("Read error: {e}"))?;
        serde_json::from_str(&content).map_err(|e| format!("Invalid package.json: {e}"))?
    };

    let name = package_json["name"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();
    let display_name = package_json["displayName"]
        .as_str()
        .unwrap_or(&name)
        .to_string();
    let contributes = &package_json["contributes"];

    let install_path = extensions_dir.join(&name);
    fs::create_dir_all(&install_path).map_err(|e| format!("Cannot create dir: {e}"))?;

    let mut themes = Vec::new();
    let mut grammars = Vec::new();
    let mut snippets = Vec::new();

    // Extract theme files
    if let Some(theme_arr) = contributes["themes"].as_array() {
        for theme in theme_arr {
            if let Some(path) = theme["path"].as_str() {
                let full_path = format!("extension/{path}");
                if let Ok(mut entry) = archive.by_name(&full_path) {
                    let dest = install_path.join(path);
                    if let Some(parent) = dest.parent() {
                        fs::create_dir_all(parent).ok();
                    }
                    if let Ok(mut dest_file) = fs::File::create(&dest) {
                        std::io::copy(&mut entry, &mut dest_file).ok();
                    }
                    themes.push(path.to_string());
                }
            }
        }
    }

    // Extract grammar files
    if let Some(grammar_arr) = contributes["grammars"].as_array() {
        for grammar in grammar_arr {
            if let Some(path) = grammar["path"].as_str() {
                let full_path = format!("extension/{path}");
                if let Ok(mut entry) = archive.by_name(&full_path) {
                    let dest = install_path.join(path);
                    if let Some(parent) = dest.parent() {
                        fs::create_dir_all(parent).ok();
                    }
                    if let Ok(mut dest_file) = fs::File::create(&dest) {
                        std::io::copy(&mut entry, &mut dest_file).ok();
                    }
                    grammars.push(path.to_string());
                }
            }
        }
    }

    // Extract snippet files
    if let Some(snippet_arr) = contributes["snippets"].as_array() {
        for snip in snippet_arr {
            if let Some(path) = snip["path"].as_str() {
                let full_path = format!("extension/{path}");
                if let Ok(mut entry) = archive.by_name(&full_path) {
                    let dest = install_path.join(path);
                    if let Some(parent) = dest.parent() {
                        fs::create_dir_all(parent).ok();
                    }
                    if let Ok(mut dest_file) = fs::File::create(&dest) {
                        std::io::copy(&mut entry, &mut dest_file).ok();
                    }
                    snippets.push(path.to_string());
                }
            }
        }
    }

    Ok(ExtensionInfo {
        name,
        display_name,
        themes,
        grammars,
        snippets,
        install_path: install_path.to_string_lossy().to_string(),
    })
}

// -- Plugin registry --

fn plugin_registry_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .home_dir()
        .map_err(|e| format!("Cannot find home dir: {e}"))?
        .join(".cogmd")
        .join("plugins");
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create plugins dir: {e}"))?;
    Ok(dir.join("registry.json"))
}

#[tauri::command]
async fn read_plugin_registry(app: AppHandle) -> Result<String, String> {
    let path = plugin_registry_path(&app)?;
    if !path.exists() {
        return Ok(r#"{"plugins":{}}"#.to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("Cannot read plugin registry: {e}"))
}

#[tauri::command]
async fn write_plugin_registry(app: AppHandle, data: String) -> Result<bool, String> {
    let path = plugin_registry_path(&app)?;
    fs::write(&path, &data).map_err(|e| format!("Cannot write plugin registry: {e}"))?;
    Ok(true)
}

fn is_plugin_enabled(app: &AppHandle, plugin_id: &str) -> bool {
    let path = match plugin_registry_path(app) {
        Ok(p) => p,
        Err(_) => return false,
    };
    if !path.exists() {
        return false;
    }
    let raw = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let parsed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return false,
    };
    parsed["plugins"][plugin_id]["enabled"]
        .as_bool()
        .unwrap_or(false)
}

// -- Notion integration --

fn notion_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .home_dir()
        .map_err(|e| format!("Cannot find home dir: {e}"))?
        .join(".cogmd");
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create CogMD config dir: {e}"))?;
    Ok(dir)
}

fn notion_auth_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(notion_config_dir(app)?.join("notion-auth.json"))
}

fn notion_env_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(notion_config_dir(app)?.join(".env"))
}

fn notion_env_keys_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(notion_config_dir(app)?.join(".env.keys"))
}

fn load_notion_token_from_env() -> Option<String> {
    if let Ok(value) = env::var("NOTION_TOKEN") {
        let token = value.trim().to_string();
        if !token.is_empty() {
            return Some(token);
        }
    }
    None
}

fn set_owner_only_permissions(path: &PathBuf) -> Result<(), String> {
    #[cfg(unix)]
    {
        let mut perms = fs::metadata(path)
            .map_err(|e| format!("Cannot read permissions for {}: {e}", path.display()))?
            .permissions();
        perms.set_mode(0o600);
        fs::set_permissions(path, perms)
            .map_err(|e| format!("Cannot set permissions for {}: {e}", path.display()))?;
    }
    Ok(())
}

fn parse_env_value(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() >= 2 {
        if (trimmed.starts_with('"') && trimmed.ends_with('"'))
            || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
        {
            return trimmed[1..trimmed.len() - 1].to_string();
        }
    }
    trimmed.to_string()
}

fn read_env_var_from_cogmd_env(app: &AppHandle, env_key: &str) -> Result<Option<String>, String> {
    let env_file = notion_env_file(app)?;
    if !env_file.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&env_file)
        .map_err(|e| format!("Cannot read {}: {e}", env_file.display()))?;
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((line_key, value)) = trimmed.split_once('=') {
            let parsed_key = line_key.trim().trim_start_matches("export ").trim();
            if parsed_key == env_key {
                let token = parse_env_value(value);
                if token.is_empty() {
                    return Ok(None);
                }
                return Ok(Some(token));
            }
        }
    }
    Ok(None)
}

fn write_env_var_to_cogmd_env(app: &AppHandle, key: &str, value: &str) -> Result<(), String> {
    let env_file = notion_env_file(app)?;
    if value.contains('\n') || value.contains('\r') {
        return Err("Invalid env value.".to_string());
    }

    let content = format!("{key}={value}\n");
    fs::write(&env_file, content).map_err(|e| format!("Cannot save {}: {e}", env_file.display()))?;
    set_owner_only_permissions(&env_file)?;
    Ok(())
}

fn clear_notion_token_in_cogmd_env(app: &AppHandle) -> Result<(), String> {
    let env_file = notion_env_file(app)?;
    let env_keys = notion_env_keys_file(app)?;

    if env_file.exists() {
        fs::remove_file(&env_file)
            .map_err(|e| format!("Cannot remove {}: {e}", env_file.display()))?;
    }
    if env_keys.exists() {
        fs::remove_file(&env_keys)
            .map_err(|e| format!("Cannot remove {}: {e}", env_keys.display()))?;
    }
    Ok(())
}

fn load_notion_auth_metadata_from_disk(app: &AppHandle) -> Result<Option<NotionAuthDisk>, String> {
    let path = notion_auth_file(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path).map_err(|e| format!("Cannot read Notion auth: {e}"))?;
    let auth = serde_json::from_str::<NotionAuthDisk>(&raw)
        .map_err(|e| format!("Cannot parse Notion auth: {e}"))?;
    Ok(Some(auth))
}

fn save_notion_auth_metadata_to_disk(app: &AppHandle, auth: &NotionAuthDisk) -> Result<(), String> {
    let path = notion_auth_file(app)?;
    let raw = serde_json::to_string(auth).map_err(|e| format!("Cannot encode Notion auth: {e}"))?;
    fs::write(path, raw).map_err(|e| format!("Cannot save Notion auth: {e}"))?;
    Ok(())
}

fn clear_notion_auth_metadata_on_disk(app: &AppHandle) -> Result<(), String> {
    let path = notion_auth_file(app)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("Cannot remove Notion auth: {e}"))?;
    }
    Ok(())
}

fn notion_auth_status(auth: Option<&NotionAuth>) -> NotionAuthStatus {
    match auth {
        Some(auth) => NotionAuthStatus {
            connected: true,
            workspace_name: auth.workspace_name.clone(),
            bot_name: auth.bot_name.clone(),
        },
        None => NotionAuthStatus {
            connected: false,
            workspace_name: None,
            bot_name: None,
        },
    }
}

fn get_notion_auth(app: &AppHandle, state: &State<AppState>) -> Result<NotionAuth, String> {
    if let Some(auth) = state.notion_auth.lock().ok().and_then(|g| g.clone()) {
        return Ok(auth);
    }

    let metadata = load_notion_auth_metadata_from_disk(app)?;

    let env_disabled = state.notion_env_disabled.lock().ok().map(|g| *g).unwrap_or(false);
    let token = if env_disabled {
        None
    } else {
        load_notion_token_from_env().or(read_env_var_from_cogmd_env(app, "NOTION_TOKEN")?)
    };

    let Some(token) = token else {
        return Err("Notion is not connected. Set NOTION_TOKEN or connect in-app.".to_string());
    };

    let auth = NotionAuth {
        token,
        workspace_name: metadata.as_ref().and_then(|m| m.workspace_name.clone()),
        bot_name: metadata.as_ref().and_then(|m| m.bot_name.clone()),
    };
    if let Ok(mut g) = state.notion_auth.lock() { *g = Some(auth.clone()); }
    Ok(auth)
}

fn notion_api(
    method: &str,
    path: &str,
    token: &str,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let url = format!("https://api.notion.com/v1{path}");
    let mut cmd = Command::new("curl");
    cmd.arg("-sS")
        .arg("-X")
        .arg(method)
        .arg(&url)
        .arg("-H")
        .arg(format!("Authorization: Bearer {token}"))
        .arg("-H")
        .arg("Notion-Version: 2022-06-28")
        .arg("-H")
        .arg("Content-Type: application/json");

    if let Some(payload) = body {
        let raw = serde_json::to_string(&payload)
            .map_err(|e| format!("Cannot encode Notion request body: {e}"))?;
        cmd.arg("--data").arg(raw);
    }

    let out = cmd
        .output()
        .map_err(|e| format!("Failed to call Notion API (curl): {e}"))?;

    if !out.status.success() {
        return Err(format!(
            "Notion API request failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }

    let raw = String::from_utf8_lossy(&out.stdout).to_string();
    let parsed: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Invalid Notion API response: {e}"))?;

    if parsed["object"].as_str() == Some("error") {
        let message = parsed["message"]
            .as_str()
            .unwrap_or("Notion API error");
        return Err(message.to_string());
    }

    Ok(parsed)
}

fn extract_notion_title(page: &serde_json::Value) -> String {
    if let Some(props) = page["properties"].as_object() {
        for value in props.values() {
            if value["type"].as_str() == Some("title") {
                let mut full = String::new();
                if let Some(arr) = value["title"].as_array() {
                    for item in arr {
                        if let Some(text) = item["plain_text"].as_str() {
                            full.push_str(text);
                        }
                    }
                }
                if !full.trim().is_empty() {
                    return full;
                }
            }
        }
    }
    "Untitled".to_string()
}

fn notion_rich_text_to_string(rich: &serde_json::Value) -> String {
    let mut out = String::new();
    if let Some(arr) = rich.as_array() {
        for item in arr {
            if let Some(text) = item["plain_text"].as_str() {
                out.push_str(text);
            }
        }
    }
    out
}

fn chunk_text_for_notion(text: &str, max_chars: usize) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }
    let mut chunks = Vec::new();
    let mut current = String::with_capacity(max_chars.min(2048));
    let mut current_len = 0usize;
    for ch in text.chars() {
        if current_len >= max_chars {
            chunks.push(current);
            current = String::with_capacity(max_chars.min(2048));
            current_len = 0;
        }
        current.push(ch);
        current_len += 1;
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

fn notion_text_objects(text: &str) -> Vec<serde_json::Value> {
    chunk_text_for_notion(text, 1800)
        .into_iter()
        .map(|chunk| {
            json!({
                "type": "text",
                "text": { "content": chunk }
            })
        })
        .collect()
}

fn notion_block_with_text(block_type: &str, text: &str) -> serde_json::Value {
    let rich = notion_text_objects(text);
    match block_type {
        "paragraph" => json!({ "object": "block", "type": "paragraph", "paragraph": { "rich_text": rich } }),
        "heading_1" => json!({ "object": "block", "type": "heading_1", "heading_1": { "rich_text": rich } }),
        "heading_2" => json!({ "object": "block", "type": "heading_2", "heading_2": { "rich_text": rich } }),
        "heading_3" => json!({ "object": "block", "type": "heading_3", "heading_3": { "rich_text": rich } }),
        "quote" => json!({ "object": "block", "type": "quote", "quote": { "rich_text": rich } }),
        "bulleted_list_item" => json!({ "object": "block", "type": "bulleted_list_item", "bulleted_list_item": { "rich_text": rich } }),
        "numbered_list_item" => json!({ "object": "block", "type": "numbered_list_item", "numbered_list_item": { "rich_text": rich } }),
        _ => json!({ "object": "block", "type": "paragraph", "paragraph": { "rich_text": rich } }),
    }
}

fn markdown_to_notion_blocks(content: &str) -> Vec<serde_json::Value> {
    let mut blocks = Vec::with_capacity(content.lines().count() / 2 + 1);
    let mut lines = content.lines().peekable();

    while let Some(line) = lines.next() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            continue;
        }

        if let Some(code_lang) = trimmed.strip_prefix("```") {
            let mut code_text = String::new();
            while let Some(next_line) = lines.peek() {
                if next_line.trim_start().starts_with("```") {
                    let _ = lines.next();
                    break;
                }
                if !code_text.is_empty() { code_text.push('\n'); }
                code_text.push_str(lines.next().unwrap_or_default());
            }
            blocks.push(json!({
                "object": "block",
                "type": "code",
                "code": {
                    "rich_text": notion_text_objects(&code_text),
                    "language": if code_lang.trim().is_empty() { "plain text" } else { code_lang.trim() }
                }
            }));
            continue;
        }

        if trimmed == "---" || trimmed == "***" {
            blocks.push(json!({ "object": "block", "type": "divider", "divider": {} }));
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix("# ") {
            blocks.push(notion_block_with_text("heading_1", rest));
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("## ") {
            blocks.push(notion_block_with_text("heading_2", rest));
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("### ") {
            blocks.push(notion_block_with_text("heading_3", rest));
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("> ") {
            blocks.push(notion_block_with_text("quote", rest));
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("- [ ] ") {
            blocks.push(json!({
                "object": "block",
                "type": "to_do",
                "to_do": { "rich_text": notion_text_objects(rest), "checked": false }
            }));
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("- [x] ") {
            blocks.push(json!({
                "object": "block",
                "type": "to_do",
                "to_do": { "rich_text": notion_text_objects(rest), "checked": true }
            }));
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("- ") {
            blocks.push(notion_block_with_text("bulleted_list_item", rest));
            continue;
        }

        if let Some(dot_pos) = trimmed.find(". ") {
            let (prefix, rest) = trimmed.split_at(dot_pos);
            if !prefix.is_empty() && prefix.chars().all(|c| c.is_ascii_digit()) {
                let body = rest.strip_prefix(". ").unwrap_or(rest);
                blocks.push(notion_block_with_text("numbered_list_item", body));
                continue;
            }
        }

        let mut paragraph = trimmed.to_string();
        while let Some(peek) = lines.peek() {
            let next = peek.trim_end();
            if next.is_empty() || next.starts_with('#') || next.starts_with("- ") || next.starts_with("> ")
            {
                break;
            }
            if next.starts_with("```") || next == "---" || next == "***" {
                break;
            }
            paragraph.push('\n');
            paragraph.push_str(lines.next().unwrap_or_default().trim_end());
        }
        blocks.push(notion_block_with_text("paragraph", &paragraph));
    }

    blocks
}

fn notion_blocks_to_markdown(blocks: &[serde_json::Value]) -> String {
    let mut out = Vec::new();
    for block in blocks {
        let block_type = block["type"].as_str().unwrap_or_default();
        let line = match block_type {
            "paragraph" => notion_rich_text_to_string(&block["paragraph"]["rich_text"]),
            "heading_1" => format!("# {}", notion_rich_text_to_string(&block["heading_1"]["rich_text"])),
            "heading_2" => format!("## {}", notion_rich_text_to_string(&block["heading_2"]["rich_text"])),
            "heading_3" => format!("### {}", notion_rich_text_to_string(&block["heading_3"]["rich_text"])),
            "quote" => format!("> {}", notion_rich_text_to_string(&block["quote"]["rich_text"])),
            "bulleted_list_item" => {
                format!("- {}", notion_rich_text_to_string(&block["bulleted_list_item"]["rich_text"]))
            }
            "numbered_list_item" => {
                format!("1. {}", notion_rich_text_to_string(&block["numbered_list_item"]["rich_text"]))
            }
            "to_do" => {
                let checked = block["to_do"]["checked"].as_bool().unwrap_or(false);
                let prefix = if checked { "- [x] " } else { "- [ ] " };
                format!("{prefix}{}", notion_rich_text_to_string(&block["to_do"]["rich_text"]))
            }
            "code" => {
                let lang = block["code"]["language"].as_str().unwrap_or("plain text");
                let text = notion_rich_text_to_string(&block["code"]["rich_text"]);
                format!("```{lang}\n{text}\n```")
            }
            "divider" => "---".to_string(),
            _ => continue,
        };
        out.push(line);
    }
    out.join("\n\n")
}

fn notion_fetch_all_children(token: &str, parent_id: &str) -> Result<Vec<serde_json::Value>, String> {
    let mut all = Vec::with_capacity(100);
    let mut cursor: Option<String> = None;
    loop {
        let mut path = format!("/blocks/{parent_id}/children?page_size=100");
        if let Some(ref c) = cursor {
            path.push_str("&start_cursor=");
            path.push_str(&c);
        }
        let response = notion_api("GET", &path, token, None)?;
        if let Some(arr) = response["results"].as_array() {
            all.extend(arr.iter().cloned());
        }
        let has_more = response["has_more"].as_bool().unwrap_or(false);
        if !has_more {
            break;
        }
        cursor = response["next_cursor"].as_str().map(|s| s.to_string());
        if cursor.is_none() {
            break;
        }
    }
    Ok(all)
}

fn notion_append_blocks(token: &str, page_id: &str, blocks: &[serde_json::Value]) -> Result<(), String> {
    if blocks.is_empty() {
        return Ok(());
    }
    for chunk in blocks.chunks(50) {
        notion_api(
            "PATCH",
            &format!("/blocks/{page_id}/children"),
            token,
            Some(json!({ "children": chunk })),
        )?;
    }
    Ok(())
}

#[tauri::command]
async fn notion_auth_status_command(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<NotionAuthStatus, String> {
    if !is_plugin_enabled(&app, "notion") {
        return Err("Notion plugin is not enabled".to_string());
    }
    let auth = get_notion_auth(&app, &state).ok();
    Ok(notion_auth_status(auth.as_ref()))
}

#[tauri::command]
async fn notion_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    token: String,
) -> Result<NotionAuthStatus, String> {
    if !is_plugin_enabled(&app, "notion") {
        return Err("Notion plugin is not enabled".to_string());
    }
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("Notion token is required.".to_string());
    }

    let me = notion_api("GET", "/users/me", &token, None)?;
    let workspace_name = me["bot"]["workspace_name"].as_str().map(|s| s.to_string());
    let bot_name = me["name"].as_str().map(|s| s.to_string());
    let auth = NotionAuth {
        token,
        workspace_name,
        bot_name,
    };
    write_env_var_to_cogmd_env(&app, "NOTION_TOKEN", &auth.token)?;
    save_notion_auth_metadata_to_disk(
        &app,
        &NotionAuthDisk {
            workspace_name: auth.workspace_name.clone(),
            bot_name: auth.bot_name.clone(),
        },
    )?;
    if let Ok(mut g) = state.notion_env_disabled.lock() { *g = false; }
    if let Ok(mut g) = state.notion_auth.lock() { *g = Some(auth.clone()); }
    Ok(notion_auth_status(Some(&auth)))
}

#[tauri::command]
async fn notion_disconnect(app: AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    if !is_plugin_enabled(&app, "notion") {
        return Err("Notion plugin is not enabled".to_string());
    }
    clear_notion_token_in_cogmd_env(&app)?;
    clear_notion_auth_metadata_on_disk(&app)?;
    if let Ok(mut g) = state.notion_env_disabled.lock() { *g = true; }
    if let Ok(mut g) = state.notion_auth.lock() { *g = None; }
    Ok(true)
}

#[tauri::command]
async fn notion_search_pages(
    app: AppHandle,
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<NotionPageSummary>, String> {
    if !is_plugin_enabled(&app, "notion") {
        return Err("Notion plugin is not enabled".to_string());
    }
    let auth = get_notion_auth(&app, &state)?;
    let trimmed = query.trim().to_string();
    let page_size = if trimmed.is_empty() { 5 } else { 20 };
    let mut body = json!({
        "filter": { "property": "object", "value": "page" },
        "sort": { "timestamp": "last_edited_time", "direction": "descending" },
        "page_size": page_size
    });
    if !trimmed.is_empty() {
        body["query"] = serde_json::Value::String(trimmed);
    }
    let response = notion_api(
        "POST",
        "/search",
        &auth.token,
        Some(body),
    )?;

    let mut pages = Vec::new();
    if let Some(results) = response["results"].as_array() {
        for page in results {
            if page["object"].as_str() != Some("page") {
                continue;
            }
            let id = page["id"].as_str().unwrap_or_default().to_string();
            if id.is_empty() {
                continue;
            }
            pages.push(NotionPageSummary {
                id,
                title: extract_notion_title(page),
                last_edited_time: page["last_edited_time"].as_str().map(|s| s.to_string()),
            });
        }
    }
    Ok(pages)
}

#[tauri::command]
async fn notion_pull_page(
    app: AppHandle,
    state: State<'_, AppState>,
    page_id: String,
) -> Result<NotionPageDocument, String> {
    if !is_plugin_enabled(&app, "notion") {
        return Err("Notion plugin is not enabled".to_string());
    }
    let auth = get_notion_auth(&app, &state)?;
    let page = notion_api("GET", &format!("/pages/{page_id}"), &auth.token, None)?;
    let blocks = notion_fetch_all_children(&auth.token, &page_id)?;
    Ok(NotionPageDocument {
        page_id: page_id.clone(),
        title: extract_notion_title(&page),
        content: notion_blocks_to_markdown(&blocks),
        last_edited_time: page["last_edited_time"].as_str().map(|s| s.to_string()),
    })
}

#[tauri::command]
async fn notion_push_page(
    app: AppHandle,
    state: State<'_, AppState>,
    page_id: String,
    content: String,
) -> Result<NotionPageDocument, String> {
    if !is_plugin_enabled(&app, "notion") {
        return Err("Notion plugin is not enabled".to_string());
    }
    let auth = get_notion_auth(&app, &state)?;
    let existing = notion_fetch_all_children(&auth.token, &page_id)?;
    for block in existing {
        if let Some(id) = block["id"].as_str() {
            let _ = notion_api(
                "PATCH",
                &format!("/blocks/{id}"),
                &auth.token,
                Some(json!({ "archived": true })),
            );
        }
    }

    let blocks = markdown_to_notion_blocks(&content);
    notion_append_blocks(&auth.token, &page_id, &blocks)?;

    let page = notion_api("GET", &format!("/pages/{page_id}"), &auth.token, None)?;
    Ok(NotionPageDocument {
        page_id,
        title: extract_notion_title(&page),
        content,
        last_edited_time: page["last_edited_time"].as_str().map(|s| s.to_string()),
    })
}

// -- Menu --

fn build_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let menu = MenuBuilder::new(app);

    // App submenu
    let app_menu = SubmenuBuilder::new(app, "CogMD")
        .about(None)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    // File submenu
    let file_new = MenuItemBuilder::with_id("menu_new", "New")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let file_open = MenuItemBuilder::with_id("menu_open", "Open…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let file_save = MenuItemBuilder::with_id("menu_save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let file_save_as = MenuItemBuilder::with_id("menu_save_as", "Save As…")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    let file_open_folder = MenuItemBuilder::with_id("menu_open_folder", "Open Containing Folder")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;
    let file_plugins =
        MenuItemBuilder::with_id("menu_plugins", "Plugins…").build(app)?;
    let file_check_updates =
        MenuItemBuilder::with_id("menu_check_updates", "Check for Updates…").build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&file_new)
        .item(&file_open)
        .separator()
        .item(&file_save)
        .item(&file_save_as)
        .item(&file_open_folder)
        .separator()
        .item(&file_plugins)
        .item(&file_check_updates)
        .build()?;

    // Edit submenu
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // View submenu
    let view_editor = MenuItemBuilder::with_id("menu_view_single", "Editor Only")
        .accelerator("CmdOrCtrl+1")
        .build(app)?;
    let view_split = MenuItemBuilder::with_id("menu_view_split", "Split View")
        .accelerator("CmdOrCtrl+2")
        .build(app)?;
    let view_preview = MenuItemBuilder::with_id("menu_view_preview", "Split + Preview")
        .accelerator("CmdOrCtrl+3")
        .build(app)?;
    let view_diff = MenuItemBuilder::with_id("menu_view_diff", "Split + Changes")
        .accelerator("CmdOrCtrl+4")
        .build(app)?;
    let view_toggle_theme = MenuItemBuilder::with_id("menu_toggle_theme", "Toggle Theme")
        .accelerator("CmdOrCtrl+Shift+T")
        .build(app)?;
    let view_font_increase = MenuItemBuilder::with_id("menu_font_increase", "Increase Font Size")
        .accelerator("CmdOrCtrl+=")
        .build(app)?;
    let view_font_decrease = MenuItemBuilder::with_id("menu_font_decrease", "Decrease Font Size")
        .accelerator("CmdOrCtrl+-")
        .build(app)?;
    let view_font_reset = MenuItemBuilder::with_id("menu_font_reset", "Reset Font Size")
        .accelerator("CmdOrCtrl+0")
        .build(app)?;
    let view_close_tab = MenuItemBuilder::with_id("menu_close_tab", "Close Tab")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;
    let view_next_tab = MenuItemBuilder::with_id("menu_next_tab", "Next Tab")
        .accelerator("CmdOrCtrl+Shift+]")
        .build(app)?;
    let view_prev_tab = MenuItemBuilder::with_id("menu_prev_tab", "Previous Tab")
        .accelerator("CmdOrCtrl+Shift+[")
        .build(app)?;
    let view_toggle_sidebar =
        MenuItemBuilder::with_id("menu_toggle_sidebar", "Toggle Sidebar")
            .accelerator("CmdOrCtrl+Shift+E")
            .build(app)?;
    let view_reset_settings =
        MenuItemBuilder::with_id("menu_reset_settings", "Reset All Settings").build(app)?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&view_toggle_sidebar)
        .separator()
        .item(&view_editor)
        .item(&view_split)
        .item(&view_preview)
        .item(&view_diff)
        .separator()
        .item(&view_toggle_theme)
        .separator()
        .item(&view_font_increase)
        .item(&view_font_decrease)
        .item(&view_font_reset)
        .separator()
        .item(&view_close_tab)
        .item(&view_next_tab)
        .item(&view_prev_tab)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .separator()
        .item(&view_reset_settings)
        .build()?;

    // Window submenu
    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .close_window()
        .build()?;

    menu.item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .build()
}

fn handle_menu_event(app: &AppHandle, event: &tauri::menu::MenuEvent) {
    let action = match event.id().0.as_str() {
        "menu_new" => "new",
        "menu_open" => "open",
        "menu_save" => "save",
        "menu_save_as" => "saveAs",
        "menu_open_folder" => "openContainingFolder",
        "menu_close_tab" => "closeTab",
        "menu_next_tab" => "nextTab",
        "menu_prev_tab" => "prevTab",
        "menu_check_updates" => "checkForUpdates",
        "menu_view_single" => "viewSingle",
        "menu_view_split" => "viewSplit",
        "menu_view_preview" => "viewPreview",
        "menu_view_diff" => "viewDiff",
        "menu_toggle_theme" => "toggleTheme",
        "menu_font_increase" => "fontIncrease",
        "menu_font_decrease" => "fontDecrease",
        "menu_font_reset" => "fontReset",
        "menu_toggle_sidebar" => "toggleSidebar",
        "menu_reset_settings" => "resetSettings",
        "menu_plugins" => "managePlugins",
        _ => return,
    };

    let _ = app.emit("menu-action", action);
}

// -- Run --

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .manage(AppState {
            pending_file: Mutex::new(None),
            notion_auth: Mutex::new(None),
            notion_env_disabled: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            open_file,
            save_file,
            save_file_as,
            read_file_snapshot,
            set_window_title,
            set_document_edited,
            open_file_folder,
            get_pending_file,
            git_show,
            extract_vsix,
            notion_auth_status_command,
            notion_connect,
            notion_disconnect,
            notion_search_pages,
            notion_pull_page,
            notion_push_page,
            read_plugin_registry,
            write_plugin_registry,
            list_md_files,
        ])
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;

            app.on_menu_event(|app, event| {
                handle_menu_event(app, &event);
            });

            // Create main window
            let _window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("CogMD")
                .inner_size(1200.0, 800.0)
                .visible(false)
                .min_inner_size(600.0, 400.0)
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .background_color(Color(20, 20, 20, 255))
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[allow(clippy::single_match)]
            match &event {
                RunEvent::WindowEvent {
                    event: WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }),
                    ..
                } => {
                    const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10 MB

                    for path in paths {
                        // Skip files larger than 10 MB
                        if let Ok(meta) = fs::metadata(&path) {
                            if meta.len() > MAX_FILE_SIZE {
                                continue;
                            }
                        }
                        let path_str = path.to_string_lossy().to_string();
                        // fs::read_to_string rejects non-UTF-8 binary files
                        if let Ok(content) = fs::read_to_string(&path_str) {
                            let _ = app.emit(
                                "file-opened",
                                FileResult {
                                    file_path: path_str,
                                    content,
                                },
                            );
                        }
                    }
                }
                RunEvent::Opened { urls } => {
                    // Handle file open from OS (double-click .md file or drag to dock)
                    for url in urls {
                        if let Ok(path) = url.to_file_path() {
                            let path_str = path.to_string_lossy().to_string();
                            if let Ok(content) = fs::read_to_string(&path_str) {
                                // Always store as pending (frontend checks after startup)
                                if let Some(state) = app.try_state::<AppState>() {
                                    if let Ok(mut g) = state.pending_file.lock() {
                                        *g = Some(PendingFile {
                                            file_path: path_str.clone(),
                                            content: content.clone(),
                                        });
                                    }
                                }

                                // Also emit for the "app already running" case
                                let _ = app.emit(
                                    "file-opened",
                                    FileResult {
                                        file_path: path_str,
                                        content,
                                    },
                                );
                            }
                        }
                    }
                }
                _ => {}
            }
        });
}
