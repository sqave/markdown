// Tauri API shim — exposes window.api compatible with the existing renderer
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { check } from '@tauri-apps/plugin-updater';
import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

const appWindow = getCurrentWebviewWindow();
const appWebview = getCurrentWebview();

// Track update state for the notification bar
let pendingUpdate = null;

window.api = {
  openFile: () => invoke('open_file'),
  saveFile: (filePath, content) => invoke('save_file', { filePath, content }),
  saveFileAs: (content) => invoke('save_file_as', { content }),
  setTitle: (title) => invoke('set_window_title', { title }),
  setDocumentEdited: (edited) => invoke('set_document_edited', { edited }),
  openFileFolder: (filePath) => invoke('open_file_folder', { filePath }),
  getPendingFile: () => invoke('get_pending_file'),
  gitShow: (filePath) => invoke('git_show', { filePath }),
  extractVsix: (vsixPath) => invoke('extract_vsix', { vsixPath }),
  confirmClose: (filename) => ask(`"${filename}" has unsaved changes. Close anyway?`, { title: 'Unsaved Changes', kind: 'warning', okLabel: 'Close', cancelLabel: 'Cancel' }),

  onMenuAction: (callback) => {
    listen('menu-action', (e) => callback(e.payload));
  },

  onFileOpened: (callback) => {
    listen('file-opened', (e) => callback(e.payload));
  },

  checkForUpdates: async (manual = false) => {
    try {
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

  normalizeWebviewZoom: async () => {
    await appWebview.setZoom(1);
  },

  showWindow: () => appWindow.show(),

  onFullscreenChanged: (callback) => {
    appWindow.onResized(async () => {
      const isFullscreen = await appWindow.isFullscreen();
      callback(isFullscreen);
    });
  },
};
