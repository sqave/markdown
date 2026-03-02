// Plugin API — creates a PluginContext for each plugin
import { pluginBus } from './plugin-bus.js';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { threeWayMerge } from '../merge-engine.js';
import DOMPurify from 'dompurify';

// IndexedDB helpers for plugin settings (scoped per plugin)
const PLUGIN_DB_NAME = 'cogmd-plugins';
const PLUGIN_DB_VERSION = 1;

let pluginDb = null;

function openPluginDB() {
  if (pluginDb) return Promise.resolve(pluginDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PLUGIN_DB_NAME, PLUGIN_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    };
    req.onsuccess = () => {
      pluginDb = req.result;
      resolve(pluginDb);
    };
    req.onerror = () => reject(req.error);
  });
}

async function pluginSettingsGet(pluginId, key) {
  const db = await openPluginDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get(`${pluginId}:${key}`);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function pluginSettingsSet(pluginId, key, value) {
  const db = await openPluginDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(value, `${pluginId}:${key}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// App bridge — set by plugin-manager during init
let appBridge = null;

export function setAppBridge(bridge) {
  appBridge = bridge;
}

export function createPluginContext(pluginId) {
  const ctx = {
    pluginId,

    // Scoped event bus
    on(event, fn) {
      pluginBus.on(event, fn, pluginId);
    },
    off(event, fn) {
      pluginBus.off(event, fn);
    },
    emit(event, data) {
      pluginBus.emit(event, data);
    },

    // UI API
    ui: {
      addToolbarButton({ id, icon, title, onClick, hidden }) {
        const slot = document.getElementById('pluginToolbarSlot');
        if (!slot) return null;
        const btn = document.createElement('button');
        btn.className = 'sync-btn';
        btn.id = id;
        btn.title = title || '';
        btn.dataset.pluginId = pluginId;
        if (hidden) btn.classList.add('hidden');
        if (typeof icon === 'string') {
          // Sanitize SVG/HTML icon strings before inserting
          const sanitized = DOMPurify.sanitize(icon, { USE_PROFILES: { svg: true, html: true } });
          const temp = document.createElement('template');
          temp.innerHTML = sanitized;
          btn.appendChild(temp.content);
        } else if (icon instanceof Element) {
          btn.appendChild(icon);
        }
        btn.addEventListener('click', onClick);
        slot.appendChild(btn);
        return btn;
      },

      removeToolbarButton(id) {
        const btn = document.getElementById(id);
        if (btn && btn.dataset.pluginId === pluginId) {
          btn.remove();
        }
      },

      addModal(id, htmlString) {
        const container = document.getElementById('pluginModalContainer');
        if (!container) return null;
        const wrapper = document.createElement('div');
        wrapper.id = id;
        wrapper.dataset.pluginId = pluginId;
        // Sanitize modal HTML before inserting into the DOM
        const sanitized = DOMPurify.sanitize(htmlString, {
          ADD_TAGS: ['input'],
          ADD_ATTR: ['type', 'checked', 'disabled', 'class', 'style', 'placeholder', 'aria-label', 'aria-hidden', 'aria-busy', 'aria-haspopup', 'aria-expanded', 'role', 'tabindex', 'target', 'rel', 'href'],
        });
        const temp = document.createElement('template');
        temp.innerHTML = sanitized;
        wrapper.appendChild(temp.content);
        container.appendChild(wrapper);
        return wrapper;
      },

      removeModal(id) {
        const el = document.getElementById(id);
        if (el && el.dataset.pluginId === pluginId) {
          el.remove();
        }
      },

      addStyles(cssString) {
        const style = document.createElement('style');
        style.dataset.pluginId = pluginId;
        style.textContent = cssString;
        document.head.appendChild(style);
        return style;
      },
    },

    // Document API
    document: {
      getText() {
        return appBridge ? appBridge.getText() : '';
      },
      setText(text) {
        if (appBridge) appBridge.setText(text);
      },
      getFilePath() {
        return appBridge ? appBridge.getFilePath() : null;
      },
    },

    // Tab API
    tabs: {
      getActive() {
        return appBridge ? appBridge.getActiveTab() : null;
      },
      getAll() {
        return appBridge ? appBridge.tabs : [];
      },
      getPluginData(tabId) {
        if (!appBridge) return null;
        const tab = appBridge.getTab(tabId);
        return tab ? (tab.pluginData[pluginId] || null) : null;
      },
      setPluginData(tabId, data) {
        if (!appBridge) return;
        const tab = appBridge.getTab(tabId);
        if (tab) {
          tab.pluginData[pluginId] = data;
        }
      },
      activateTab(tabId) {
        if (appBridge) appBridge.activateTab(tabId);
      },
      createNewTab() {
        if (!appBridge) return null;
        appBridge.snapshotCurrentTab();
        const tab = appBridge.createTab(null, '');
        appBridge.activateTab(tab.id);
        return tab;
      },
    },

    // Settings API (IndexedDB, scoped to pluginId)
    settings: {
      get: (key) => pluginSettingsGet(pluginId, key),
      set: (key, value) => pluginSettingsSet(pluginId, key, value),
    },

    // Backend invoke (trusted plugins)
    backend: {
      invoke: (cmd, args) => invoke(cmd, args),
    },

    // App utilities
    app: {
      confirmAction: (msg, opts) => ask(msg, opts),
      scheduleSessionSave() {
        if (appBridge) appBridge.scheduleSessionSave();
      },
    },

    // Merge utility
    merge: {
      threeWayMerge,
    },
  };

  return ctx;
}
