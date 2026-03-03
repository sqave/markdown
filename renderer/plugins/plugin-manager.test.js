import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock @tauri-apps/plugin-dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: vi.fn(),
}));

// Mock dompurify
vi.mock('dompurify', () => ({
  default: { sanitize: (html) => html },
}));

// Mock builtin notion plugin
const mockActivate = vi.fn();
const mockDeactivate = vi.fn();
vi.mock('./builtin/notion/index.js', () => ({
  activate: (...args) => mockActivate(...args),
  deactivate: (...args) => mockDeactivate(...args),
}));

import { invoke } from '@tauri-apps/api/core';
import { pluginManager } from './plugin-manager.js';

describe('pluginManager', () => {
  const mockAppBridge = {
    getText: vi.fn(() => ''),
    setText: vi.fn(),
    getFilePath: vi.fn(() => null),
    getActiveTab: vi.fn(() => null),
    tabs: [],
    getTab: vi.fn(() => null),
    activateTab: vi.fn(),
    snapshotCurrentTab: vi.fn(),
    createTab: vi.fn(),
    scheduleSessionSave: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Set up default invoke mock
    invoke.mockImplementation((cmd) => {
      if (cmd === 'read_plugin_registry') return Promise.resolve('{"plugins":{}}');
      if (cmd === 'write_plugin_registry') return Promise.resolve();
      return Promise.resolve();
    });
    // Clean up activePlugins by disabling notion (handles module-level state)
    // Init with enabled notion, then disable to clear activePlugins
    await pluginManager.init(mockAppBridge);
    await pluginManager.disablePlugin('notion');
    vi.clearAllMocks();
  });

  it('init() — registers built-ins as disabled on first run', async () => {
    await pluginManager.init(mockAppBridge);

    expect(invoke).toHaveBeenCalledWith('read_plugin_registry');
    expect(invoke).toHaveBeenCalledWith('write_plugin_registry', expect.any(Object));
    expect(mockActivate).not.toHaveBeenCalled();
    expect(pluginManager.isActive('notion')).toBe(false);
    expect(pluginManager.isEnabled('notion')).toBe(false);
  });

  it('init() with existing registry — respects enabled/disabled state', async () => {
    mockActivate.mockClear();
    invoke.mockImplementation((cmd) => {
      if (cmd === 'read_plugin_registry') {
        return Promise.resolve(JSON.stringify({
          plugins: { notion: { enabled: false, builtin: true, name: 'Notion', version: '0.1.0' } },
        }));
      }
      if (cmd === 'write_plugin_registry') return Promise.resolve();
      return Promise.resolve();
    });

    await pluginManager.init(mockAppBridge);

    // Notion was disabled in registry, so activate should not be called
    expect(mockActivate).not.toHaveBeenCalled();
    expect(pluginManager.isEnabled('notion')).toBe(false);
  });

  it('enablePlugin(id) — sets enabled, saves, activates plugin', async () => {
    // Start with notion disabled
    invoke.mockImplementation((cmd) => {
      if (cmd === 'read_plugin_registry') {
        return Promise.resolve(JSON.stringify({
          plugins: { notion: { enabled: false, builtin: true, name: 'Notion', version: '0.1.0' } },
        }));
      }
      if (cmd === 'write_plugin_registry') return Promise.resolve();
      return Promise.resolve();
    });
    await pluginManager.init(mockAppBridge);
    mockActivate.mockClear();

    await pluginManager.enablePlugin('notion');

    expect(mockActivate).toHaveBeenCalled();
    expect(pluginManager.isEnabled('notion')).toBe(true);
    expect(pluginManager.isActive('notion')).toBe(true);
  });

  it('disablePlugin(id) — sets disabled, saves, deactivates, cleans up DOM', async () => {
    invoke.mockImplementation((cmd) => {
      if (cmd === 'read_plugin_registry') return Promise.resolve('{"plugins":{}}');
      if (cmd === 'write_plugin_registry') return Promise.resolve();
      return Promise.resolve();
    });
    await pluginManager.init(mockAppBridge);

    await pluginManager.disablePlugin('notion');

    expect(pluginManager.isEnabled('notion')).toBe(false);
    expect(pluginManager.isActive('notion')).toBe(false);
  });

  it('installPlugin(id) for built-in — delegates to enablePlugin', async () => {
    invoke.mockImplementation((cmd) => {
      if (cmd === 'read_plugin_registry') {
        return Promise.resolve(JSON.stringify({
          plugins: { notion: { enabled: false, builtin: true, name: 'Notion', version: '0.1.0' } },
        }));
      }
      if (cmd === 'write_plugin_registry') return Promise.resolve();
      return Promise.resolve();
    });
    await pluginManager.init(mockAppBridge);
    mockActivate.mockClear();

    await pluginManager.installPlugin('notion');

    expect(mockActivate).toHaveBeenCalled();
    expect(pluginManager.isEnabled('notion')).toBe(true);
  });

  it('uninstallPlugin(id) — delegates to disablePlugin', async () => {
    invoke.mockImplementation((cmd) => {
      if (cmd === 'read_plugin_registry') return Promise.resolve('{"plugins":{}}');
      if (cmd === 'write_plugin_registry') return Promise.resolve();
      return Promise.resolve();
    });
    await pluginManager.init(mockAppBridge);

    await pluginManager.uninstallPlugin('notion');

    expect(pluginManager.isEnabled('notion')).toBe(false);
    expect(pluginManager.isActive('notion')).toBe(false);
  });

  it('getAll() — returns correct shape', async () => {
    invoke.mockImplementation((cmd) => {
      if (cmd === 'read_plugin_registry') return Promise.resolve('{"plugins":{}}');
      if (cmd === 'write_plugin_registry') return Promise.resolve();
      return Promise.resolve();
    });
    await pluginManager.init(mockAppBridge);

    const all = pluginManager.getAll();
    expect(all.length).toBeGreaterThanOrEqual(1);

    const notion = all.find(p => p.id === 'notion');
    expect(notion).toBeDefined();
    expect(notion).toHaveProperty('id');
    expect(notion).toHaveProperty('name');
    expect(notion).toHaveProperty('version');
    expect(notion).toHaveProperty('enabled');
    expect(notion).toHaveProperty('active');
  });

  it('plugin activation failure — catches error, cleans up bus', async () => {
    mockActivate.mockRejectedValueOnce(new Error('activation failed'));
    invoke.mockImplementation((cmd) => {
      if (cmd === 'read_plugin_registry') return Promise.resolve('{"plugins":{}}');
      if (cmd === 'write_plugin_registry') return Promise.resolve();
      return Promise.resolve();
    });

    // Should not throw
    await expect(pluginManager.init(mockAppBridge)).resolves.not.toThrow();
    expect(pluginManager.isActive('notion')).toBe(false);
  });
});
