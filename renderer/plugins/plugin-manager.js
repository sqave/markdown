// Plugin Manager — lifecycle, registry, loading
import { pluginBus } from './plugin-bus.js';
import { createPluginContext, setAppBridge } from './plugin-api.js';
import { invoke } from '@tauri-apps/api/core';

const BUILTIN_PLUGINS = {
  notion: {
    load: () => import('./builtin/notion/index.js'),
    manifest: {
      id: 'notion',
      name: 'Notion',
      version: '0.1.0',
      description: 'Sync markdown documents with Notion pages',
      author: 'Cog',
      builtin: true,
      beta: true,
    },
  },
};

// Active plugin instances: pluginId -> { manifest, context, module }
const activePlugins = new Map();

// Registry cache
let registry = null;

async function loadRegistry() {
  try {
    const raw = await invoke('read_plugin_registry');
    registry = JSON.parse(raw);
  } catch (_) {
    registry = { plugins: {} };
  }
  return registry;
}

async function saveRegistry() {
  try {
    await invoke('write_plugin_registry', { data: JSON.stringify(registry, null, 2) });
  } catch (e) {
    console.error('Failed to save plugin registry:', e);
  }
}

function isPluginEnabled(id) {
  if (!registry || !registry.plugins[id]) return false;
  return registry.plugins[id].enabled === true;
}

async function loadPlugin(id, manifest, module) {
  if (activePlugins.has(id)) return;
  const ctx = createPluginContext(id);
  try {
    await module.activate(ctx);
    activePlugins.set(id, { manifest, context: ctx, module });
  } catch (e) {
    console.error(`Plugin "${id}" activation failed:`, e);
    pluginBus.removeAllForPlugin(id);
  }
}

async function unloadPlugin(id) {
  const entry = activePlugins.get(id);
  if (!entry) return;
  try {
    if (entry.module.deactivate) {
      await entry.module.deactivate();
    }
  } catch (e) {
    console.error(`Plugin "${id}" deactivation failed:`, e);
  }
  pluginBus.removeAllForPlugin(id);
  // Remove any plugin-owned styles
  document.querySelectorAll(`style[data-plugin-id="${id}"]`).forEach(s => s.remove());
  // Remove any plugin-owned toolbar buttons
  document.querySelectorAll(`#pluginToolbarSlot [data-plugin-id="${id}"]`).forEach(b => b.remove());
  // Remove any plugin-owned modals
  document.querySelectorAll(`#pluginModalContainer [data-plugin-id="${id}"]`).forEach(m => m.remove());
  activePlugins.delete(id);
}

// Public API
export const pluginManager = {
  async init(appBridge) {
    setAppBridge(appBridge);
    await loadRegistry();

    // Register built-in plugins on first run (disabled by default)
    let dirty = false;
    for (const [id, builtin] of Object.entries(BUILTIN_PLUGINS)) {
      if (!(id in registry.plugins)) {
        registry.plugins[id] = {
          enabled: false,
          builtin: true,
          name: builtin.manifest.name,
          version: builtin.manifest.version,
        };
        dirty = true;
      }
    }
    if (dirty) await saveRegistry();

    // Load enabled built-in plugins
    for (const [id, builtin] of Object.entries(BUILTIN_PLUGINS)) {
      if (isPluginEnabled(id)) {
        const module = await builtin.load();
        await loadPlugin(id, builtin.manifest, module);
      }
    }
  },

  async enablePlugin(id) {
    if (!registry.plugins[id]) return;
    registry.plugins[id].enabled = true;
    await saveRegistry();

    // Load built-in plugin
    if (BUILTIN_PLUGINS[id]) {
      const builtin = BUILTIN_PLUGINS[id];
      const module = await builtin.load();
      await loadPlugin(id, builtin.manifest, module);
    }
  },

  async disablePlugin(id) {
    if (!registry.plugins[id]) return;
    registry.plugins[id].enabled = false;
    await saveRegistry();
    await unloadPlugin(id);
  },

  async installPlugin(id) {
    if (BUILTIN_PLUGINS[id]) {
      await this.enablePlugin(id);
      return;
    }
  },

  async uninstallPlugin(id) {
    await this.disablePlugin(id);
  },

  getAll() {
    const result = [];

    // Built-in plugins
    for (const [id, builtin] of Object.entries(BUILTIN_PLUGINS)) {
      const regEntry = registry?.plugins[id];
      result.push({
        id,
        ...builtin.manifest,
        enabled: regEntry ? regEntry.enabled : false,
        active: activePlugins.has(id),
      });
    }

    // Third-party plugins from registry
    if (registry) {
      for (const [id, entry] of Object.entries(registry.plugins)) {
        if (BUILTIN_PLUGINS[id]) continue; // skip built-ins already added
        result.push({
          id,
          name: entry.name || id,
          version: entry.version || '0.0.0',
          description: entry.description || '',
          builtin: false,
          enabled: entry.enabled,
          active: activePlugins.has(id),
        });
      }
    }

    return result;
  },

  isActive(id) {
    return activePlugins.has(id);
  },

  isEnabled(id) {
    return isPluginEnabled(id);
  },
};
