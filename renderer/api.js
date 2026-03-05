// Tauri API shim — exposes window.api compatible with the existing renderer
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

const appWindow = getCurrentWebviewWindow();

// Track update state for the notification bar
let pendingUpdate = null;

window.api = {
  openFile: () => invoke('open_file'),
  saveFile: (filePath, content) => invoke('save_file', { filePath, content }),
  saveFileAs: (content) => invoke('save_file_as', { content }),
  readFileSnapshot: (filePath) => invoke('read_file_snapshot', { filePath }),
  setTitle: (title) => invoke('set_window_title', { title }),
  setDocumentEdited: (edited) => invoke('set_document_edited', { edited }),
  openFileFolder: (filePath) => invoke('open_file_folder', { filePath }),
  getPendingFile: () => invoke('get_pending_file'),
  gitShow: (filePath) => invoke('git_show', { filePath }),
  extractVsix: (vsixPath) => invoke('extract_vsix', { vsixPath }),
  listMdFiles: (dirPath) => invoke('list_md_files', { dirPath }),
  readPluginRegistry: () => invoke('read_plugin_registry'),
  writePluginRegistry: (data) => invoke('write_plugin_registry', { data }),
  confirmClose: async (filename) => {
    const { ask } = await import('@tauri-apps/plugin-dialog');
    return ask(`"${filename}" has unsaved changes. Close anyway?`, { title: 'Unsaved Changes', kind: 'warning', okLabel: 'Close', cancelLabel: 'Cancel' });
  },
  confirmAction: async (message, options) => {
    const { ask } = await import('@tauri-apps/plugin-dialog');
    return ask(message, options);
  },

  onMenuAction: (callback) => {
    listen('menu-action', (e) => callback(e.payload));
  },

  onFileOpened: (callback) => {
    listen('file-opened', (e) => callback(e.payload));
  },

  checkForUpdates: async (manual = false) => {
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        pendingUpdate = update;
        window.dispatchEvent(new CustomEvent('cogmd-update-available', { detail: { version: update.version } }));
        await update.downloadAndInstall();
        window.dispatchEvent(new CustomEvent('cogmd-update-downloaded', { detail: { version: update.version } }));
      } else if (manual) {
        window.dispatchEvent(new CustomEvent('cogmd-update-none'));
      }
    } catch (e) {
      console.error('Update check failed:', e);
      if (manual) {
        const message = e instanceof Error ? e.message : String(e);
        window.dispatchEvent(new CustomEvent('cogmd-update-error', { detail: { message } }));
      }
    }
  },

  installUpdate: async () => {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  },

  onUpdateAvailable: (callback) => {
    window.addEventListener('cogmd-update-available', () => callback());
  },

  onUpdateDownloaded: (callback) => {
    window.addEventListener('cogmd-update-downloaded', () => callback());
  },

  onUpdateError: (callback) => {
    window.addEventListener('cogmd-update-error', (e) => callback(e.detail?.message));
  },

  onUpdateNone: (callback) => {
    window.addEventListener('cogmd-update-none', () => callback());
  },

  onFullscreenChanged: (callback) => {
    appWindow.onResized(async () => {
      const isFullscreen = await appWindow.isFullscreen();
      callback(isFullscreen);
    });
  },
};
