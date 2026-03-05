import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// Since app.js is a monolith with eager side-effects, we can't import it
// directly. Instead, we extract the pure logic functions and test them in
// isolation. For stateful logic (tabs, LRU, session), we reimplement the
// minimal state machine and test the behaviour.
// =============================================================================

// ---------------------------------------------------------------------------
// 1. resolveRelativePath  (lines 522-531 of app.js)
// ---------------------------------------------------------------------------

function resolveRelativePath(base, relative) {
  const dir = base.substring(0, base.lastIndexOf('/'));
  const parts = (dir + '/' + relative).split('/');
  const resolved = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return '/' + resolved.join('/');
}

describe('resolveRelativePath', () => {
  it('resolves a basic relative path', () => {
    expect(resolveRelativePath('/foo/bar.md', 'baz.md')).toBe('/foo/baz.md');
  });

  it('resolves parent directory with ..', () => {
    expect(resolveRelativePath('/foo/bar/file.md', '../other.md')).toBe('/foo/other.md');
  });

  it('resolves multiple parent directories', () => {
    expect(resolveRelativePath('/a/b/c/d.md', '../../e.md')).toBe('/a/e.md');
  });

  it('resolves dot-prefixed relative path', () => {
    expect(resolveRelativePath('/foo/bar.md', './baz.md')).toBe('/foo/baz.md');
  });

  it('resolves nested relative path', () => {
    expect(resolveRelativePath('/foo/bar.md', 'sub/file.md')).toBe('/foo/sub/file.md');
  });

  it('resolves to root when climbing above root', () => {
    expect(resolveRelativePath('/a/b.md', '../../c.md')).toBe('/c.md');
  });
});

// ---------------------------------------------------------------------------
// 2. getTabName  (lines 721-729)
// ---------------------------------------------------------------------------

function getTabName(tab) {
  if (tab.filePath) return tab.filePath.split('/').pop();
  if (tab.pluginData) {
    for (const data of Object.values(tab.pluginData)) {
      if (data && data.pageTitle) return data.pageTitle;
    }
  }
  return 'Untitled';
}

describe('getTabName', () => {
  it('returns filename from filePath', () => {
    expect(getTabName({ filePath: '/Users/me/docs/readme.md' })).toBe('readme.md');
  });

  it('returns pageTitle from pluginData when no filePath', () => {
    const tab = {
      filePath: null,
      pluginData: {
        myPlugin: { pageTitle: 'My Page' },
      },
    };
    expect(getTabName(tab)).toBe('My Page');
  });

  it('returns "Untitled" when no filePath and no pluginData pageTitle', () => {
    expect(getTabName({ filePath: null, pluginData: {} })).toBe('Untitled');
  });

  it('returns "Untitled" when pluginData is missing entirely', () => {
    expect(getTabName({ filePath: null })).toBe('Untitled');
  });

  it('returns first found pageTitle among multiple plugins', () => {
    const tab = {
      filePath: null,
      pluginData: {
        first: { someOtherProp: 'x' },
        second: { pageTitle: 'From Second' },
      },
    };
    expect(getTabName(tab)).toBe('From Second');
  });

  it('prefers filePath over pluginData', () => {
    const tab = {
      filePath: '/path/to/file.md',
      pluginData: { p: { pageTitle: 'Plugin Title' } },
    };
    expect(getTabName(tab)).toBe('file.md');
  });
});

// ---------------------------------------------------------------------------
// 3. checkLargeFile / large file threshold  (lines 293-298)
// ---------------------------------------------------------------------------

const LARGE_FILE_THRESHOLD = 200 * 1024; // 204800

function checkLargeFile(length) {
  return length > LARGE_FILE_THRESHOLD;
}

describe('checkLargeFile', () => {
  it('returns false below threshold', () => {
    expect(checkLargeFile(100 * 1024)).toBe(false);
  });

  it('returns false at exactly the threshold', () => {
    expect(checkLargeFile(LARGE_FILE_THRESHOLD)).toBe(false);
  });

  it('returns true above threshold', () => {
    expect(checkLargeFile(LARGE_FILE_THRESHOLD + 1)).toBe(true);
  });

  it('returns false for zero length', () => {
    expect(checkLargeFile(0)).toBe(false);
  });

  it('threshold equals 204800', () => {
    expect(LARGE_FILE_THRESHOLD).toBe(204800);
  });
});

// ---------------------------------------------------------------------------
// 4. Tab lifecycle: createTab, closeTab basics  (lines 788-836)
// ---------------------------------------------------------------------------

// Minimal tab model that mirrors the real logic
function makeTabModel() {
  let tabs = [];
  let activeTabId = null;
  let nextTabId = 1;

  function createTab(filePath, content) {
    const tab = {
      id: nextTabId++,
      filePath: filePath || null,
      content: content || '',
      isDirty: false,
      hasExternalChange: false,
      pluginData: {},
      scrollTop: 0,
      selectionMain: { anchor: 0, head: 0 },
      lastSavedContent: content || '',
    };
    tabs.push(tab);
    return tab;
  }

  function closeTab(tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    const idx = tabs.indexOf(tab);
    tabs.splice(idx, 1);

    if (tabs.length === 0) {
      const newTab = createTab(null, '');
      activeTabId = newTab.id;
    } else if (tabId === activeTabId) {
      const newIdx = Math.min(idx, tabs.length - 1);
      activeTabId = tabs[newIdx].id;
    }
    // If closing a non-active tab, activeTabId stays the same
  }

  return {
    get tabs() { return tabs; },
    get activeTabId() { return activeTabId; },
    set activeTabId(v) { activeTabId = v; },
    createTab,
    closeTab,
  };
}

describe('Tab lifecycle', () => {
  let model;

  beforeEach(() => {
    model = makeTabModel();
  });

  describe('createTab', () => {
    it('returns a tab with correct defaults', () => {
      const tab = model.createTab(null, '');
      expect(tab.id).toBe(1);
      expect(tab.filePath).toBeNull();
      expect(tab.content).toBe('');
      expect(tab.isDirty).toBe(false);
      expect(tab.hasExternalChange).toBe(false);
      expect(tab.pluginData).toEqual({});
      expect(tab.scrollTop).toBe(0);
      expect(tab.selectionMain).toEqual({ anchor: 0, head: 0 });
      expect(tab.lastSavedContent).toBe('');
    });

    it('uses provided filePath and content', () => {
      const tab = model.createTab('/path/file.md', '# Hello');
      expect(tab.filePath).toBe('/path/file.md');
      expect(tab.content).toBe('# Hello');
      expect(tab.lastSavedContent).toBe('# Hello');
    });

    it('assigns incrementing ids', () => {
      const t1 = model.createTab(null, '');
      const t2 = model.createTab(null, '');
      const t3 = model.createTab(null, '');
      expect(t1.id).toBe(1);
      expect(t2.id).toBe(2);
      expect(t3.id).toBe(3);
    });

    it('adds tab to tabs array', () => {
      model.createTab(null, '');
      model.createTab(null, '');
      expect(model.tabs.length).toBe(2);
    });

    it('treats null/undefined filePath as null', () => {
      const t1 = model.createTab(null, 'a');
      const t2 = model.createTab(undefined, 'b');
      expect(t1.filePath).toBeNull();
      expect(t2.filePath).toBeNull();
    });
  });

  describe('closeTab', () => {
    it('closing last tab creates a new empty tab', () => {
      const tab = model.createTab(null, '');
      model.activeTabId = tab.id;
      model.closeTab(tab.id);

      expect(model.tabs.length).toBe(1);
      expect(model.tabs[0].filePath).toBeNull();
      expect(model.tabs[0].content).toBe('');
    });

    it('closing non-active tab preserves activeTabId', () => {
      const t1 = model.createTab('/a.md', 'a');
      const t2 = model.createTab('/b.md', 'b');
      model.activeTabId = t1.id;
      model.closeTab(t2.id);

      expect(model.tabs.length).toBe(1);
      expect(model.activeTabId).toBe(t1.id);
    });

    it('closing active tab selects adjacent tab', () => {
      const t1 = model.createTab(null, 'a');
      const t2 = model.createTab(null, 'b');
      const t3 = model.createTab(null, 'c');
      model.activeTabId = t2.id;
      model.closeTab(t2.id);

      // t2 was at index 1, so new active should be at min(1, 1) = index 1 → t3
      expect(model.activeTabId).toBe(t3.id);
      expect(model.tabs.length).toBe(2);
    });

    it('closing active tab at end selects previous tab', () => {
      const t1 = model.createTab(null, 'a');
      const t2 = model.createTab(null, 'b');
      model.activeTabId = t2.id;
      model.closeTab(t2.id);

      // t2 was at index 1, tabs.length is now 1, min(1, 0) = 0 → t1
      expect(model.activeTabId).toBe(t1.id);
    });

    it('does nothing for non-existent tabId', () => {
      const t1 = model.createTab(null, 'a');
      model.activeTabId = t1.id;
      model.closeTab(999);
      expect(model.tabs.length).toBe(1);
      expect(model.activeTabId).toBe(t1.id);
    });
  });
});

// ---------------------------------------------------------------------------
// 5. addRecentFile  (lines 986-992)
// ---------------------------------------------------------------------------

function makeRecentFiles(initial = []) {
  const MAX_RECENT_FILES = 20;
  let recentFiles = [...initial];

  function addRecentFile(filePath) {
    if (!filePath) return;
    recentFiles = recentFiles.filter(f => f !== filePath);
    recentFiles.unshift(filePath);
    if (recentFiles.length > MAX_RECENT_FILES) recentFiles.length = MAX_RECENT_FILES;
  }

  return {
    get files() { return recentFiles; },
    addRecentFile,
    MAX_RECENT_FILES,
  };
}

describe('addRecentFile', () => {
  it('adds file to front of list', () => {
    const r = makeRecentFiles(['/a.md', '/b.md']);
    r.addRecentFile('/c.md');
    expect(r.files[0]).toBe('/c.md');
    expect(r.files).toEqual(['/c.md', '/a.md', '/b.md']);
  });

  it('deduplicates existing entry', () => {
    const r = makeRecentFiles(['/a.md', '/b.md', '/c.md']);
    r.addRecentFile('/b.md');
    expect(r.files).toEqual(['/b.md', '/a.md', '/c.md']);
  });

  it('caps at MAX_RECENT_FILES (20)', () => {
    const initial = Array.from({ length: 20 }, (_, i) => `/file${i}.md`);
    const r = makeRecentFiles(initial);
    r.addRecentFile('/new.md');
    expect(r.files.length).toBe(20);
    expect(r.files[0]).toBe('/new.md');
    // last old entry should have been dropped
    expect(r.files).not.toContain('/file19.md');
  });

  it('ignores null filePath', () => {
    const r = makeRecentFiles(['/a.md']);
    r.addRecentFile(null);
    expect(r.files).toEqual(['/a.md']);
  });

  it('ignores undefined filePath', () => {
    const r = makeRecentFiles(['/a.md']);
    r.addRecentFile(undefined);
    expect(r.files).toEqual(['/a.md']);
  });

  it('works with empty initial list', () => {
    const r = makeRecentFiles();
    r.addRecentFile('/first.md');
    expect(r.files).toEqual(['/first.md']);
  });
});

// ---------------------------------------------------------------------------
// 6. Tab LRU eviction  (lines 314-344)
// ---------------------------------------------------------------------------

function makeLRU() {
  const MAX_CACHED_TAB_STATES = 5;
  let tabs = [];
  let activeTabId = null;
  let tabAccessOrder = [];

  function touchTab(tabId) {
    tabAccessOrder = tabAccessOrder.filter(id => id !== tabId);
    tabAccessOrder.push(tabId);
    evictStaleTabStates();
  }

  function evictStaleTabStates() {
    if (tabAccessOrder.length <= MAX_CACHED_TAB_STATES) return;
    const toEvict = tabAccessOrder.slice(0, tabAccessOrder.length - MAX_CACHED_TAB_STATES);
    if (toEvict.length === 0) return;
    // Synchronous version for testability (real code uses requestIdleCallback)
    for (const id of toEvict) {
      const tab = tabs.find(t => t.id === id);
      if (tab && tab.editorState && tab.id !== activeTabId) {
        tab.content = tab.editorState.doc;
        tab.editorState = null;
      }
    }
  }

  return {
    get tabs() { return tabs; },
    get tabAccessOrder() { return tabAccessOrder; },
    get activeTabId() { return activeTabId; },
    set activeTabId(v) { activeTabId = v; },
    set tabs(v) { tabs = v; },
    touchTab,
    MAX_CACHED_TAB_STATES,
  };
}

describe('Tab LRU eviction', () => {
  let lru;

  beforeEach(() => {
    lru = makeLRU();
  });

  it('touchTab moves tab to end of access order', () => {
    lru.touchTab(1);
    lru.touchTab(2);
    lru.touchTab(3);
    expect(lru.tabAccessOrder).toEqual([1, 2, 3]);

    lru.touchTab(1);
    expect(lru.tabAccessOrder).toEqual([2, 3, 1]);
  });

  it('no eviction when at or below MAX_CACHED_TAB_STATES', () => {
    lru.tabs = [
      { id: 1, editorState: { doc: 'a' }, content: '' },
      { id: 2, editorState: { doc: 'b' }, content: '' },
      { id: 3, editorState: { doc: 'c' }, content: '' },
      { id: 4, editorState: { doc: 'd' }, content: '' },
      { id: 5, editorState: { doc: 'e' }, content: '' },
    ];
    lru.activeTabId = 5;

    for (let i = 1; i <= 5; i++) lru.touchTab(i);

    // All 5 should still have editorState
    expect(lru.tabs.every(t => t.editorState !== null)).toBe(true);
  });

  it('evicts oldest tab when exceeding MAX_CACHED_TAB_STATES', () => {
    lru.tabs = [
      { id: 1, editorState: { doc: 'a' }, content: '' },
      { id: 2, editorState: { doc: 'b' }, content: '' },
      { id: 3, editorState: { doc: 'c' }, content: '' },
      { id: 4, editorState: { doc: 'd' }, content: '' },
      { id: 5, editorState: { doc: 'e' }, content: '' },
      { id: 6, editorState: { doc: 'f' }, content: '' },
    ];
    lru.activeTabId = 6;

    // Touch tabs 1-6 in order
    for (let i = 1; i <= 6; i++) lru.touchTab(i);

    // Tab 1 (oldest, not active) should be evicted
    const tab1 = lru.tabs.find(t => t.id === 1);
    expect(tab1.editorState).toBeNull();
    expect(tab1.content).toBe('a');
  });

  it('does not evict the active tab', () => {
    lru.tabs = [
      { id: 1, editorState: { doc: 'a' }, content: '' },
      { id: 2, editorState: { doc: 'b' }, content: '' },
      { id: 3, editorState: { doc: 'c' }, content: '' },
      { id: 4, editorState: { doc: 'd' }, content: '' },
      { id: 5, editorState: { doc: 'e' }, content: '' },
      { id: 6, editorState: { doc: 'f' }, content: '' },
    ];
    // Tab 1 is active even though it's oldest
    lru.activeTabId = 1;

    for (let i = 1; i <= 6; i++) lru.touchTab(i);

    // Tab 1 should NOT be evicted because it's active
    const tab1 = lru.tabs.find(t => t.id === 1);
    expect(tab1.editorState).not.toBeNull();
  });

  it('does not evict tab without editorState', () => {
    lru.tabs = [
      { id: 1, editorState: null, content: 'already evicted' },
      { id: 2, editorState: { doc: 'b' }, content: '' },
      { id: 3, editorState: { doc: 'c' }, content: '' },
      { id: 4, editorState: { doc: 'd' }, content: '' },
      { id: 5, editorState: { doc: 'e' }, content: '' },
      { id: 6, editorState: { doc: 'f' }, content: '' },
    ];
    lru.activeTabId = 6;

    for (let i = 1; i <= 6; i++) lru.touchTab(i);

    // Tab 1 already had null editorState — content should be unchanged
    const tab1 = lru.tabs.find(t => t.id === 1);
    expect(tab1.content).toBe('already evicted');
  });

  it('deduplicates in access order', () => {
    lru.touchTab(1);
    lru.touchTab(2);
    lru.touchTab(1);
    lru.touchTab(3);
    expect(lru.tabAccessOrder).toEqual([2, 1, 3]);
  });
});

// ---------------------------------------------------------------------------
// 7. cycleTab logic  (lines 838-843)
// ---------------------------------------------------------------------------

function cycleTab(tabs, activeTabId, direction) {
  if (tabs.length <= 1) return activeTabId;
  const idx = tabs.findIndex(t => t.id === activeTabId);
  const newIdx = (idx + direction + tabs.length) % tabs.length;
  return tabs[newIdx].id;
}

describe('cycleTab', () => {
  const tabs3 = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('cycles forward from first to second', () => {
    expect(cycleTab(tabs3, 1, 1)).toBe(2);
  });

  it('wraps forward from last to first', () => {
    expect(cycleTab(tabs3, 3, 1)).toBe(1);
  });

  it('cycles backward from second to first', () => {
    expect(cycleTab(tabs3, 2, -1)).toBe(1);
  });

  it('wraps backward from first to last', () => {
    expect(cycleTab(tabs3, 1, -1)).toBe(3);
  });

  it('no-op with single tab', () => {
    const singleTab = [{ id: 42 }];
    expect(cycleTab(singleTab, 42, 1)).toBe(42);
    expect(cycleTab(singleTab, 42, -1)).toBe(42);
  });

  it('cycles correctly with two tabs', () => {
    const tabs2 = [{ id: 1 }, { id: 2 }];
    expect(cycleTab(tabs2, 1, 1)).toBe(2);
    expect(cycleTab(tabs2, 2, 1)).toBe(1);
    expect(cycleTab(tabs2, 1, -1)).toBe(2);
    expect(cycleTab(tabs2, 2, -1)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 8. Session save/restore data structure  (lines 1317-1390)
// ---------------------------------------------------------------------------

describe('Session save/restore', () => {
  // Reimplement the serialization shape from saveSession
  function buildSaveData(tabs, activeTabId, nextTabId) {
    return {
      tabs: tabs.map(t => ({
        id: t.id,
        filePath: t.filePath,
        content: t.editorState ? t.editorState.doc : (t.content || ''),
        isDirty: t.isDirty,
        hasExternalChange: Boolean(t.hasExternalChange),
        pluginData: t.pluginData || {},
        scrollTop: t.scrollTop,
        selectionMain: t.selectionMain,
        lastSavedContent: t.lastSavedContent || '',
      })),
      activeTabId,
      nextTabId,
    };
  }

  // Reimplement the deserialization from restoreSession
  function parseRestoreData(data) {
    if (!data || !data.tabs || data.tabs.length === 0) return null;

    const tabs = data.tabs.map(t => ({
      ...t,
      hasExternalChange: Boolean(t.hasExternalChange),
      pluginData: t.pluginData || {},
      lastSavedContent: t.lastSavedContent ?? t.content ?? '',
    }));
    const nextTabId = data.nextTabId || (Math.max(...tabs.map(t => t.id)) + 1);
    const targetId = data.activeTabId || tabs[0].id;
    const activeTab = tabs.find(t => t.id === targetId) || tabs[0];

    return { tabs, nextTabId, activeTabId: activeTab.id };
  }

  describe('saveSession data shape', () => {
    it('produces correct data shape', () => {
      const tabs = [
        {
          id: 1,
          filePath: '/test.md',
          content: 'old content',
          editorState: { doc: 'live content' },
          isDirty: true,
          hasExternalChange: false,
          pluginData: { myPlugin: { foo: 'bar' } },
          scrollTop: 100,
          selectionMain: { anchor: 5, head: 10 },
          lastSavedContent: 'saved content',
        },
      ];

      const data = buildSaveData(tabs, 1, 2);

      expect(data.activeTabId).toBe(1);
      expect(data.nextTabId).toBe(2);
      expect(data.tabs).toHaveLength(1);

      const t = data.tabs[0];
      expect(t.id).toBe(1);
      expect(t.filePath).toBe('/test.md');
      expect(t.content).toBe('live content'); // from editorState.doc
      expect(t.isDirty).toBe(true);
      expect(t.hasExternalChange).toBe(false);
      expect(t.pluginData).toEqual({ myPlugin: { foo: 'bar' } });
      expect(t.scrollTop).toBe(100);
      expect(t.selectionMain).toEqual({ anchor: 5, head: 10 });
      expect(t.lastSavedContent).toBe('saved content');
    });

    it('uses tab.content when editorState is null', () => {
      const tabs = [{
        id: 1,
        filePath: null,
        content: 'fallback content',
        editorState: null,
        isDirty: false,
        hasExternalChange: false,
        pluginData: {},
        scrollTop: 0,
        selectionMain: { anchor: 0, head: 0 },
        lastSavedContent: '',
      }];

      const data = buildSaveData(tabs, 1, 2);
      expect(data.tabs[0].content).toBe('fallback content');
    });

    it('defaults lastSavedContent to empty string', () => {
      const tabs = [{
        id: 1,
        filePath: null,
        content: '',
        editorState: null,
        isDirty: false,
        hasExternalChange: false,
        pluginData: {},
        scrollTop: 0,
        selectionMain: { anchor: 0, head: 0 },
        // lastSavedContent intentionally missing
      }];

      const data = buildSaveData(tabs, 1, 2);
      expect(data.tabs[0].lastSavedContent).toBe('');
    });

    it('coerces hasExternalChange to boolean', () => {
      const tabs = [{
        id: 1,
        filePath: null,
        content: '',
        editorState: null,
        isDirty: false,
        hasExternalChange: undefined,
        pluginData: {},
        scrollTop: 0,
        selectionMain: { anchor: 0, head: 0 },
        lastSavedContent: '',
      }];

      const data = buildSaveData(tabs, 1, 2);
      expect(data.tabs[0].hasExternalChange).toBe(false);
    });
  });

  describe('restoreSession parsing', () => {
    it('returns null for empty data', () => {
      expect(parseRestoreData(null)).toBeNull();
      expect(parseRestoreData(undefined)).toBeNull();
      expect(parseRestoreData({})).toBeNull();
      expect(parseRestoreData({ tabs: [] })).toBeNull();
    });

    it('restores tabs with correct defaults', () => {
      const data = {
        tabs: [
          {
            id: 1,
            filePath: '/test.md',
            content: 'hello',
            isDirty: false,
            // hasExternalChange intentionally missing
            // pluginData intentionally missing
            // lastSavedContent intentionally missing
          },
        ],
        activeTabId: 1,
        nextTabId: 2,
      };

      const result = parseRestoreData(data);
      expect(result).not.toBeNull();
      expect(result.tabs[0].hasExternalChange).toBe(false);
      expect(result.tabs[0].pluginData).toEqual({});
      expect(result.tabs[0].lastSavedContent).toBe('hello'); // falls back to content
    });

    it('computes nextTabId when missing', () => {
      const data = {
        tabs: [{ id: 5 }, { id: 10 }, { id: 3 }],
        activeTabId: 5,
        // nextTabId intentionally missing
      };

      const result = parseRestoreData(data);
      expect(result.nextTabId).toBe(11); // max(5,10,3) + 1
    });

    it('falls back to first tab when activeTabId not found', () => {
      const data = {
        tabs: [{ id: 1 }, { id: 2 }],
        activeTabId: 999,
        nextTabId: 3,
      };

      const result = parseRestoreData(data);
      expect(result.activeTabId).toBe(1);
    });

    it('falls back to first tab when activeTabId is missing', () => {
      const data = {
        tabs: [{ id: 7 }, { id: 8 }],
        nextTabId: 9,
      };

      const result = parseRestoreData(data);
      expect(result.activeTabId).toBe(7);
    });

    it('preserves lastSavedContent when explicitly set', () => {
      const data = {
        tabs: [{
          id: 1,
          content: 'current',
          lastSavedContent: 'saved',
        }],
        activeTabId: 1,
        nextTabId: 2,
      };

      const result = parseRestoreData(data);
      expect(result.tabs[0].lastSavedContent).toBe('saved');
    });
  });
});

// ---------------------------------------------------------------------------
// 9. updateTitle format  (lines 700-709)
// ---------------------------------------------------------------------------

function formatTitle(filePath, isDirty) {
  const name = filePath
    ? filePath.split('/').pop()
    : 'Untitled';
  const prefix = isDirty ? '\u25cf ' : '';
  return `${prefix}${name} \u2014 Cog`;
}

describe('updateTitle format', () => {
  it('shows filename from path', () => {
    expect(formatTitle('/path/to/readme.md', false)).toBe('readme.md \u2014 Cog');
  });

  it('shows "Untitled" when no path', () => {
    expect(formatTitle(null, false)).toBe('Untitled \u2014 Cog');
  });

  it('adds dirty prefix when dirty', () => {
    expect(formatTitle('/path/file.md', true)).toBe('\u25cf file.md \u2014 Cog');
  });

  it('adds dirty prefix with Untitled', () => {
    expect(formatTitle(null, true)).toBe('\u25cf Untitled \u2014 Cog');
  });

  it('has no prefix when clean', () => {
    const title = formatTitle('/path/file.md', false);
    expect(title.startsWith('\u25cf')).toBe(false);
  });

  it('uses em dash separator', () => {
    expect(formatTitle('/f.md', false)).toContain('\u2014');
  });
});

// ---------------------------------------------------------------------------
// 10. handleSyncCheck flow — state machine  (lines 1087-1137)
// ---------------------------------------------------------------------------

describe('handleSyncCheck state machine', () => {
  // Model the sync check as a pure state transition function
  function syncCheck(tab, diskContent) {
    const baseContent = tab.lastSavedContent || '';

    if (diskContent === baseContent) {
      // No external change
      return { ...tab, hasExternalChange: false };
    }

    // External change detected
    return { ...tab, hasExternalChange: true };
  }

  function syncMerge(tab, diskContent, mergedText) {
    return {
      ...tab,
      content: mergedText,
      isDirty: mergedText !== diskContent,
      lastSavedContent: diskContent,
      hasExternalChange: false,
    };
  }

  it('no external change when disk matches base', () => {
    const tab = {
      filePath: '/test.md',
      lastSavedContent: 'hello world',
      hasExternalChange: false,
    };
    const result = syncCheck(tab, 'hello world');
    expect(result.hasExternalChange).toBe(false);
  });

  it('detects external change when disk differs from base', () => {
    const tab = {
      filePath: '/test.md',
      lastSavedContent: 'hello world',
      hasExternalChange: false,
    };
    const result = syncCheck(tab, 'hello universe');
    expect(result.hasExternalChange).toBe(true);
  });

  it('uses empty string as base when lastSavedContent is missing', () => {
    const tab = {
      filePath: '/test.md',
      hasExternalChange: false,
    };
    // Disk has content, base is empty → external change
    const result = syncCheck(tab, 'some content');
    expect(result.hasExternalChange).toBe(true);
  });

  it('no external change when both base and disk are empty', () => {
    const tab = {
      filePath: '/test.md',
      lastSavedContent: '',
      hasExternalChange: false,
    };
    const result = syncCheck(tab, '');
    expect(result.hasExternalChange).toBe(false);
  });

  it('after merge sync, hasExternalChange is cleared', () => {
    const tab = {
      filePath: '/test.md',
      lastSavedContent: 'base',
      hasExternalChange: true,
      content: 'mine',
    };
    const result = syncMerge(tab, 'disk content', 'merged content');
    expect(result.hasExternalChange).toBe(false);
    expect(result.lastSavedContent).toBe('disk content');
    expect(result.content).toBe('merged content');
  });

  it('after merge, isDirty reflects whether merged differs from disk', () => {
    const tab = {
      filePath: '/test.md',
      lastSavedContent: 'base',
      hasExternalChange: true,
      content: 'mine',
    };

    // Case 1: merged text equals disk → not dirty
    const clean = syncMerge(tab, 'disk', 'disk');
    expect(clean.isDirty).toBe(false);

    // Case 2: merged text differs from disk → dirty
    const dirty = syncMerge(tab, 'disk', 'disk + my changes');
    expect(dirty.isDirty).toBe(true);
  });

  it('full flow: detect → sync → clean state', () => {
    // Step 1: initial state
    let tab = {
      filePath: '/test.md',
      lastSavedContent: 'original',
      hasExternalChange: false,
      content: 'my edits',
      isDirty: true,
    };

    // Step 2: detect external change
    tab = syncCheck(tab, 'someone else edited');
    expect(tab.hasExternalChange).toBe(true);

    // Step 3: merge and sync
    tab = syncMerge(tab, 'someone else edited', 'merged result');
    expect(tab.hasExternalChange).toBe(false);
    expect(tab.lastSavedContent).toBe('someone else edited');
    expect(tab.content).toBe('merged result');
    expect(tab.isDirty).toBe(true); // merged differs from disk
  });
});
