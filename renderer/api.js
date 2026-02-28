// Tauri API shim — exposes window.api compatible with the existing renderer
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { check } from '@tauri-apps/plugin-updater';
import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

const appWindow = getCurrentWebviewWindow();

// Track update state for the notification bar
let pendingUpdate = null;

window.api = {
  openFile: () => invoke('open_file'),
  saveFile: (filePath, content) => invoke('save_file', { filePath, content }),
  saveFileAs: (content) => invoke('save_file_as', { content }),
  setTitle: (title) => invoke('set_window_title', { title }),
  setDocumentEdited: (edited) => invoke('set_document_edited', { edited }),
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

  checkForUpdates: async () => {
    try {
      const update = await check();
      if (update) {
        pendingUpdate = update;
        window.dispatchEvent(new CustomEvent('cogmd-update-available', { detail: { version: update.version } }));
        await update.downloadAndInstall();
        window.dispatchEvent(new CustomEvent('cogmd-update-downloaded', { detail: { version: update.version } }));
      } else {
        window.dispatchEvent(new CustomEvent('cogmd-update-not-available'));
      }
    } catch (_) {
      window.dispatchEvent(new CustomEvent('cogmd-update-not-available'));
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

  onUpdateNotAvailable: (callback) => {
    window.addEventListener('cogmd-update-not-available', () => callback());
  },

  onFullscreenChanged: (callback) => {
    appWindow.onResized(async () => {
      const isFullscreen = await appWindow.isFullscreen();
      callback(isFullscreen);
    });
  },
};

