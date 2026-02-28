// Plugin Event Bus — lightweight pub/sub for CogMD plugins
// Hook points: document:change, document:save, document:open, document:render, toolbar:init

export class PluginBus {
  constructor() {
    this._listeners = new Map();
    this._pluginListeners = new Map(); // pluginId -> Set of { event, fn }
  }

  on(event, fn, pluginId) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(fn);

    if (pluginId) {
      if (!this._pluginListeners.has(pluginId)) {
        this._pluginListeners.set(pluginId, new Set());
      }
      this._pluginListeners.get(pluginId).add({ event, fn });
    }
  }

  off(event, fn) {
    const set = this._listeners.get(event);
    if (set) set.delete(fn);
  }

  emit(event, data) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(data);
      } catch (_) {
        // Plugin errors should not crash the host
      }
    }
  }

  removeAllForPlugin(pluginId) {
    const entries = this._pluginListeners.get(pluginId);
    if (!entries) return;
    for (const { event, fn } of entries) {
      this.off(event, fn);
    }
    this._pluginListeners.delete(pluginId);
  }

  get listenerCount() {
    let count = 0;
    for (const set of this._listeners.values()) count += set.size;
    return count;
  }
}

// Singleton instance
export const pluginBus = new PluginBus();
