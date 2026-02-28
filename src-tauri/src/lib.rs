use serde::{Deserialize, Serialize};
use std::fs;
use std::process::Command;
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    window::Color,
    AppHandle, Emitter, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder,
};

// Traffic light (window controls) position constants
const TRAFFIC_LIGHT_X: f64 = 16.0;
const TRAFFIC_LIGHT_Y: f64 = 15.0;

/// Reposition macOS traffic light buttons to our custom offset.
/// Called after set_title() which can reset them to the system default.
#[cfg(target_os = "macos")]
fn reposition_traffic_lights(window: &tauri::WebviewWindow) {
    use objc2::runtime::AnyObject;

    let ns_window_ptr = match window.ns_window() {
        Ok(ptr) => ptr as *const AnyObject,
        Err(_) => return,
    };

    unsafe {
        let ns_window = &*ns_window_ptr;

        // Get the three standard window buttons (close=0, miniaturize=1, zoom=2)
        let close: *const AnyObject =
            objc2::msg_send![ns_window, standardWindowButton: 0usize];
        let mini: *const AnyObject =
            objc2::msg_send![ns_window, standardWindowButton: 1usize];
        let zoom: *const AnyObject =
            objc2::msg_send![ns_window, standardWindowButton: 2usize];

        if close.is_null() || mini.is_null() || zoom.is_null() {
            return;
        }

        // Get title bar container view: close -> superview -> superview
        let close_super: *const AnyObject = objc2::msg_send![&*close, superview];
        if close_super.is_null() {
            return;
        }
        let title_bar_container: *const AnyObject = objc2::msg_send![&*close_super, superview];
        if title_bar_container.is_null() {
            return;
        }

        // NSRect is { origin: { x, y }, size: { width, height } } = 4 x f64
        let close_frame: [f64; 4] = objc2::msg_send![&*close, frame];
        let mini_frame: [f64; 4] = objc2::msg_send![&*mini, frame];
        let window_frame: [f64; 4] = objc2::msg_send![ns_window, frame];
        let tb_frame: [f64; 4] = objc2::msg_send![&*title_bar_container, frame];

        // Resize title bar container to fit the new Y offset
        let title_bar_height = close_frame[3] + TRAFFIC_LIGHT_Y; // button height + y inset
        let new_tb_frame: [f64; 4] = [
            tb_frame[0],
            window_frame[3] - title_bar_height, // origin.y = window height - bar height
            tb_frame[2],
            title_bar_height,
        ];
        let _: () = objc2::msg_send![&*title_bar_container, setFrame: new_tb_frame];

        // Reposition each button horizontally
        let space_between = mini_frame[0] - close_frame[0];
        for (i, button) in [close, mini, zoom].iter().enumerate() {
            let btn_frame: [f64; 4] = objc2::msg_send![&**button, frame];
            let origin: [f64; 2] = [
                TRAFFIC_LIGHT_X + (i as f64 * space_between),
                btn_frame[1],
            ];
            let _: () = objc2::msg_send![&**button, setFrameOrigin: origin];
        }
    }
}

// -- App state --

struct AppState {
    pending_file: Mutex<Option<PendingFile>>,
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

// -- Tauri commands --

#[tauri::command]
async fn open_file(app: AppHandle) -> Result<Option<FileResult>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
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
        .add_filter("Markdown", &["md", "markdown"])
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
fn set_window_title(app: AppHandle, title: String) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&title);
        #[cfg(target_os = "macos")]
        reposition_traffic_lights(&window);
    }
}

#[tauri::command]
fn set_document_edited(_app: AppHandle, _edited: bool) {
    // TODO: macOS NSWindow document-edited indicator via raw objc call
    // The title prefix "● " already indicates unsaved changes in the tab/title
}

#[tauri::command]
fn get_pending_file(state: State<AppState>) -> Option<PendingFile> {
    state.pending_file.lock().unwrap().take()
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
                    let mut content = Vec::new();
                    entry.read_to_end(&mut content).ok();
                    fs::write(&dest, &content).ok();
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
                    let mut content = Vec::new();
                    entry.read_to_end(&mut content).ok();
                    fs::write(&dest, &content).ok();
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
                    let mut content = Vec::new();
                    entry.read_to_end(&mut content).ok();
                    fs::write(&dest, &content).ok();
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
    let file_close_tab = MenuItemBuilder::with_id("menu_close_tab", "Close Tab")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;
    let file_next_tab = MenuItemBuilder::with_id("menu_next_tab", "Next Tab")
        .accelerator("CmdOrCtrl+Shift+]")
        .build(app)?;
    let file_prev_tab = MenuItemBuilder::with_id("menu_prev_tab", "Previous Tab")
        .accelerator("CmdOrCtrl+Shift+[")
        .build(app)?;
    let file_check_updates =
        MenuItemBuilder::with_id("menu_check_updates", "Check for Updates…").build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&file_new)
        .item(&file_open)
        .separator()
        .item(&file_save)
        .item(&file_save_as)
        .separator()
        .item(&file_close_tab)
        .separator()
        .item(&file_next_tab)
        .item(&file_prev_tab)
        .separator()
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
    let view_editor = MenuItemBuilder::with_id("menu_view_editor", "Editor Only")
        .accelerator("CmdOrCtrl+1")
        .build(app)?;
    let view_split = MenuItemBuilder::with_id("menu_view_split", "Split View")
        .accelerator("CmdOrCtrl+2")
        .build(app)?;
    let view_preview = MenuItemBuilder::with_id("menu_view_preview", "Preview Only")
        .accelerator("CmdOrCtrl+3")
        .build(app)?;
    let view_diff = MenuItemBuilder::with_id("menu_view_diff", "Diff View")
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
    let view_reset_settings =
        MenuItemBuilder::with_id("menu_reset_settings", "Reset All Settings").build(app)?;

    let view_menu = SubmenuBuilder::new(app, "View")
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
        "menu_close_tab" => "closeTab",
        "menu_next_tab" => "nextTab",
        "menu_prev_tab" => "prevTab",
        "menu_check_updates" => "checkForUpdates",
        "menu_view_editor" => "viewEditor",
        "menu_view_split" => "viewSplit",
        "menu_view_preview" => "viewPreview",
        "menu_view_diff" => "viewDiff",
        "menu_toggle_theme" => "toggleTheme",
        "menu_font_increase" => "fontIncrease",
        "menu_font_decrease" => "fontDecrease",
        "menu_font_reset" => "fontReset",
        "menu_reset_settings" => "resetSettings",
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
        .manage(AppState {
            pending_file: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            open_file,
            save_file,
            save_file_as,
            set_window_title,
            set_document_edited,
            get_pending_file,
            git_show,
            extract_vsix,
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
                .min_inner_size(600.0, 400.0)
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .traffic_light_position(tauri::Position::Logical(tauri::LogicalPosition::new(TRAFFIC_LIGHT_X, TRAFFIC_LIGHT_Y)))
                .background_color(Color(20, 20, 20, 255))
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[allow(clippy::single_match)]
            match &event {
                RunEvent::Opened { urls } => {
                    // Handle file open from OS (double-click .md file or drag to dock)
                    for url in urls {
                        if let Ok(path) = url.to_file_path() {
                            let path_str = path.to_string_lossy().to_string();
                            if let Ok(content) = fs::read_to_string(&path_str) {
                                let data = PendingFile {
                                    file_path: path_str.clone(),
                                    content: content.clone(),
                                };

                                // Try to emit to frontend; if not ready, store as pending
                                if app
                                    .emit(
                                        "file-opened",
                                        FileResult {
                                            file_path: path_str,
                                            content,
                                        },
                                    )
                                    .is_err()
                                {
                                    if let Some(state) = app.try_state::<AppState>() {
                                        *state.pending_file.lock().unwrap() = Some(data);
                                    }
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        });
}
