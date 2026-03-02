import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock @tauri-apps/plugin-dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  ask: vi.fn(),
}));

// Mock dompurify — pass-through sanitizer for testing
vi.mock('dompurify', () => ({
  default: { sanitize: (html) => html },
}));

// Mock merge-engine
vi.mock('../merge-engine.js', () => ({
  threeWayMerge: vi.fn(() => ({ mergedText: '', hasConflicts: false, conflictCount: 0 })),
}));

import { createPluginContext, setAppBridge } from './plugin-api.js';
import { pluginBus } from './plugin-bus.js';

describe('createPluginContext', () => {
  let ctx;

  beforeEach(() => {
    // Reset pluginBus
    pluginBus._listeners.clear();
    pluginBus._pluginListeners.clear();

    // Set up minimal DOM
    document.body.innerHTML = `
      <div id="pluginToolbarSlot"></div>
      <div id="pluginModalContainer"></div>
    `;

    ctx = createPluginContext('test-plugin');
  });

  it('returns object with correct pluginId', () => {
    expect(ctx.pluginId).toBe('test-plugin');
  });

  describe('on/off/emit', () => {
    it('on — delegates to pluginBus with pluginId scope', () => {
      const fn = vi.fn();
      ctx.on('test', fn);
      pluginBus.emit('test', 'data');
      expect(fn).toHaveBeenCalledWith('data');
    });

    it('off — removes listener from pluginBus', () => {
      const fn = vi.fn();
      ctx.on('test', fn);
      ctx.off('test', fn);
      pluginBus.emit('test', 'data');
      expect(fn).not.toHaveBeenCalled();
    });

    it('emit — delegates to pluginBus', () => {
      const fn = vi.fn();
      pluginBus.on('test', fn);
      ctx.emit('test', 'data');
      expect(fn).toHaveBeenCalledWith('data');
    });
  });

  describe('ui.addToolbarButton', () => {
    it('creates button in #pluginToolbarSlot with data-plugin-id', () => {
      const btn = ctx.ui.addToolbarButton({
        id: 'btn-test',
        icon: '<svg></svg>',
        title: 'Test',
        onClick: vi.fn(),
      });

      expect(btn).not.toBeNull();
      expect(btn.id).toBe('btn-test');
      expect(btn.dataset.pluginId).toBe('test-plugin');
      expect(btn.title).toBe('Test');
      expect(document.getElementById('btn-test')).toBe(btn);
    });
  });

  describe('ui.removeToolbarButton', () => {
    it('only removes own plugin\'s button', () => {
      ctx.ui.addToolbarButton({
        id: 'btn-mine',
        icon: '<svg></svg>',
        title: 'Mine',
        onClick: vi.fn(),
      });

      // Create a button from another plugin
      const otherCtx = createPluginContext('other-plugin');
      otherCtx.ui.addToolbarButton({
        id: 'btn-other',
        icon: '<svg></svg>',
        title: 'Other',
        onClick: vi.fn(),
      });

      // Try to remove other plugin's button — should not work
      ctx.ui.removeToolbarButton('btn-other');
      expect(document.getElementById('btn-other')).not.toBeNull();

      // Remove own button — should work
      ctx.ui.removeToolbarButton('btn-mine');
      expect(document.getElementById('btn-mine')).toBeNull();
    });
  });

  describe('ui.addModal', () => {
    it('appends sanitized content to #pluginModalContainer with data-plugin-id', () => {
      const modal = ctx.ui.addModal('modal-test', '<div class="content">Hello</div>');
      expect(modal).not.toBeNull();
      expect(modal.id).toBe('modal-test');
      expect(modal.dataset.pluginId).toBe('test-plugin');
      expect(modal.textContent).toContain('Hello');
      expect(document.getElementById('modal-test')).toBe(modal);
    });
  });

  describe('ui.removeModal', () => {
    it('only removes own plugin\'s modal', () => {
      ctx.ui.addModal('modal-mine', '<div>Mine</div>');
      const otherCtx = createPluginContext('other-plugin');
      otherCtx.ui.addModal('modal-other', '<div>Other</div>');

      ctx.ui.removeModal('modal-other');
      expect(document.getElementById('modal-other')).not.toBeNull();

      ctx.ui.removeModal('modal-mine');
      expect(document.getElementById('modal-mine')).toBeNull();
    });
  });

  describe('ui.addStyles', () => {
    it('creates <style> with data-plugin-id in <head>', () => {
      const style = ctx.ui.addStyles('.test { color: red; }');
      expect(style.tagName).toBe('STYLE');
      expect(style.dataset.pluginId).toBe('test-plugin');
      expect(style.textContent).toBe('.test { color: red; }');
      expect(document.head.contains(style)).toBe(true);
    });
  });

  describe('document API', () => {
    it('getText/setText — delegates to appBridge', () => {
      const mockBridge = {
        getText: vi.fn(() => 'hello'),
        setText: vi.fn(),
        getFilePath: vi.fn(),
      };
      setAppBridge(mockBridge);

      const freshCtx = createPluginContext('bridge-test');
      expect(freshCtx.document.getText()).toBe('hello');

      freshCtx.document.setText('world');
      expect(mockBridge.setText).toHaveBeenCalledWith('world');
    });

    it('getText returns empty string when no bridge', () => {
      setAppBridge(null);
      const freshCtx = createPluginContext('no-bridge');
      expect(freshCtx.document.getText()).toBe('');
    });
  });

  describe('tabs API', () => {
    it('delegates to appBridge methods', () => {
      const mockTab = { id: 'tab1', pluginData: {} };
      const mockBridge = {
        getText: vi.fn(),
        setText: vi.fn(),
        getFilePath: vi.fn(),
        getActiveTab: vi.fn(() => mockTab),
        tabs: [mockTab],
        getTab: vi.fn(() => mockTab),
        activateTab: vi.fn(),
        snapshotCurrentTab: vi.fn(),
        createTab: vi.fn(() => ({ id: 'new-tab', pluginData: {} })),
        scheduleSessionSave: vi.fn(),
      };
      setAppBridge(mockBridge);

      const freshCtx = createPluginContext('tabs-test');
      expect(freshCtx.tabs.getActive()).toBe(mockTab);
      expect(freshCtx.tabs.getAll()).toEqual([mockTab]);

      freshCtx.tabs.activateTab('tab1');
      expect(mockBridge.activateTab).toHaveBeenCalledWith('tab1');
    });
  });
});
