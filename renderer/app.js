import './api.js';
import { convertFileSrc } from '@tauri-apps/api/core';
import { EditorView, keymap, highlightActiveLine, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { LanguageDescription } from '@codemirror/language';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language';
import { closeBrackets } from '@codemirror/autocomplete';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import markdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import morphdom from 'morphdom';
import { threeWayMerge } from './merge-engine.js';
// [hidden] Plugin system — temporarily disabled
// import { pluginBus } from './plugins/plugin-bus.js';
// import { pluginManager } from './plugins/plugin-manager.js';
// import { initManagePluginsButton, showManagePlugins } from './plugins/manage-plugins-ui.js';

// ===== Performance instrumentation =====

performance.mark('bundle-parse-end');

// ===== Manual language imports (replaces @codemirror/language-data) =====

const codeLanguages = [
  LanguageDescription.of({ name: 'JavaScript', alias: ['js', 'jsx'], extensions: ['js', 'mjs', 'jsx'], load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true })) }),
  LanguageDescription.of({ name: 'TypeScript', alias: ['ts', 'tsx'], extensions: ['ts', 'tsx'], load: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true, typescript: true })) }),
  LanguageDescription.of({ name: 'Python', alias: ['py'], extensions: ['py'], load: () => import('@codemirror/lang-python').then(m => m.python()) }),
  LanguageDescription.of({ name: 'HTML', alias: ['htm'], extensions: ['html', 'htm'], load: () => import('@codemirror/lang-html').then(m => m.html()) }),
  LanguageDescription.of({ name: 'CSS', extensions: ['css'], load: () => import('@codemirror/lang-css').then(m => m.css()) }),
  LanguageDescription.of({ name: 'JSON', extensions: ['json'], load: () => import('@codemirror/lang-json').then(m => m.json()) }),
  LanguageDescription.of({ name: 'Rust', alias: ['rs'], extensions: ['rs'], load: () => import('@codemirror/lang-rust').then(m => m.rust()) }),
  LanguageDescription.of({ name: 'Java', extensions: ['java'], load: () => import('@codemirror/lang-java').then(m => m.java()) }),
];

// ===== Shiki (deferred initialization) =====

let shikiHighlighter = null;
let shikiReady = false;

const _shikiLangLoaders = {
  javascript: () => import('shiki/dist/langs/javascript.mjs'),
  typescript: () => import('shiki/dist/langs/typescript.mjs'),
  python: () => import('shiki/dist/langs/python.mjs'),
  html: () => import('shiki/dist/langs/html.mjs'),
  css: () => import('shiki/dist/langs/css.mjs'),
  json: () => import('shiki/dist/langs/json.mjs'),
  rust: () => import('shiki/dist/langs/rust.mjs'),
  java: () => import('shiki/dist/langs/java.mjs'),
  bash: () => import('shiki/dist/langs/bash.mjs'),
  yaml: () => import('shiki/dist/langs/yaml.mjs'),
  sql: () => import('shiki/dist/langs/sql.mjs'),
  go: () => import('shiki/dist/langs/go.mjs'),
};
// Common aliases
_shikiLangLoaders.js = _shikiLangLoaders.javascript;
_shikiLangLoaders.ts = _shikiLangLoaders.typescript;
_shikiLangLoaders.py = _shikiLangLoaders.python;
_shikiLangLoaders.sh = _shikiLangLoaders.bash;
_shikiLangLoaders.shell = _shikiLangLoaders.bash;
_shikiLangLoaders.yml = _shikiLangLoaders.yaml;
_shikiLangLoaders.jsonc = _shikiLangLoaders.json;
const _shikiLangLoading = new Set();

async function initShiki() {
  const [{ createHighlighterCore }, { createJavaScriptRegExpEngine }] = await Promise.all([
    import('shiki/core'),
    import('shiki/engine/javascript'),
  ]);

  const [themeDark, themeLight] = await Promise.all([
    import('shiki/dist/themes/one-dark-pro.mjs'),
    import('shiki/dist/themes/one-light.mjs'),
  ]);

  shikiHighlighter = await createHighlighterCore({
    themes: [themeDark, themeLight],
    langs: [],
    engine: createJavaScriptRegExpEngine(),
  });

  shikiReady = true;
  schedulePreviewRender();
}

async function shikiLoadLang(lang) {
  if (_shikiLangLoading.has(lang)) return;
  const loader = _shikiLangLoaders[lang];
  if (!loader) return;
  _shikiLangLoading.add(lang);
  try {
    const mod = await loader();
    await shikiHighlighter.loadLanguage(mod);
    schedulePreviewRender();
  } catch (_) {
    _shikiLangLoading.delete(lang);
  }
}

const _highlightCache = new Map();
const _HIGHLIGHT_CACHE_MAX = 200;

function shikiHighlight(str, lang) {
  if (!shikiReady || !shikiHighlighter) return '';
  try {
    const loadedLangs = shikiHighlighter.getLoadedLanguages();
    if (!loadedLangs.includes(lang)) {
      shikiLoadLang(lang);
      return '';
    }
    const theme = currentTheme === 'dark' ? 'one-dark-pro' : 'one-light';
    const key = `${theme}:${lang}:${str}`;
    const cached = _highlightCache.get(key);
    if (cached !== undefined) return cached;
    const html = shikiHighlighter.codeToHtml(str, { lang, theme });
    if (_highlightCache.size >= _HIGHLIGHT_CACHE_MAX) _highlightCache.clear();
    _highlightCache.set(key, html);
    return html;
  } catch (_) {
    return '';
  }
}

// ===== Markdown renderer =====

const md = markdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    if (!lang) return '';
    const html = shikiHighlight(str, lang);
    if (html) {
      // Shiki returns a full <pre><code>...</code></pre> block.
      // Extract just the inner HTML of the <code> element so markdown-it
      // can wrap it in its own <pre><code> tags (avoids double-wrapping).
      const match = html.match(/<code[^>]*>([\s\S]*)<\/code>/);
      return match ? match[1] : html;
    }
    return '';
  },
});
md.disable('lheading');

// ===== Font Size =====

const FONT_SIZE_MIN = 8, FONT_SIZE_MAX = 18, FONT_SIZE_DEFAULT = 9;
let currentFontSize = parseInt(localStorage.getItem('cogmd-font-size'), 10) || FONT_SIZE_DEFAULT;
const fontSizeCompartment = new Compartment();

function makeFontSizeTheme(size) {
  const px = size + 'px';
  return EditorView.theme({
    '&': { fontSize: px },
    '.cm-content': { fontSize: px },
  });
}

// ===== CodeMirror Themes =====

const themeCompartment = new Compartment();

function makeEditorTheme(isDark) {
  return EditorView.theme({
    '&': {
      height: '100%',
    },
    '.cm-content': {
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
      padding: '0 34px',
      caretColor: isDark ? '#e0ddd8' : '#1a1a1a',
      lineHeight: '1.6',
    },
    '.cm-cursor': {
      borderLeftColor: isDark ? '#e0ddd8' : '#1a1a1a',
      borderLeftWidth: '1.5px',
    },
    '.cm-activeLine': {
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: isDark ? 'rgba(67,164,114,0.18)' : 'rgba(67,164,114,0.12)',
    },
    '.cm-gutters': {
      display: 'none',
    },
    '.cm-line': {
      padding: '0',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
    },
  }, { dark: isDark });
}

const _darkHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '600', color: '#e0ddd8' },
  { tag: tags.heading1, fontSize: '1.4em' },
  { tag: tags.heading2, fontSize: '1.2em' },
  { tag: tags.heading3, fontSize: '1.08em' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#c9c5bf' },
  { tag: tags.strong, fontWeight: '600', color: '#e0ddd8' },
  { tag: tags.keyword, color: '#c678dd' },
  { tag: tags.string, color: '#98c379' },
  { tag: tags.comment, color: '#5c6370', fontStyle: 'italic' },
  { tag: tags.number, color: '#d19a66' },
  { tag: tags.link, color: '#43A472', textDecoration: 'underline' },
  { tag: tags.url, color: '#43A472' },
  { tag: tags.monospace, color: '#61afef', fontFamily: 'inherit' },
  { tag: tags.quote, color: '#8a8680', fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.meta, color: '#5c6370' },
  { tag: tags.processingInstruction, color: '#5c6370' },
]);

const _lightHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '600', color: '#1a1a1a' },
  { tag: tags.heading1, fontSize: '1.4em' },
  { tag: tags.heading2, fontSize: '1.2em' },
  { tag: tags.heading3, fontSize: '1.08em' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#4a4844' },
  { tag: tags.strong, fontWeight: '600', color: '#1a1a1a' },
  { tag: tags.keyword, color: '#a626a4' },
  { tag: tags.string, color: '#50a14f' },
  { tag: tags.comment, color: '#9b9690', fontStyle: 'italic' },
  { tag: tags.number, color: '#986801' },
  { tag: tags.link, color: '#43A472', textDecoration: 'underline' },
  { tag: tags.url, color: '#43A472' },
  { tag: tags.monospace, color: '#4078f2', fontFamily: 'inherit' },
  { tag: tags.quote, color: '#6b6965', fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.meta, color: '#9b9690' },
  { tag: tags.processingInstruction, color: '#9b9690' },
]);

function makeHighlightStyle(isDark) {
  return isDark ? _darkHighlightStyle : _lightHighlightStyle;
}

function getThemeExtensions(isDark) {
  return [
    makeEditorTheme(isDark),
    syntaxHighlighting(makeHighlightStyle(isDark)),
  ];
}

// ===== State =====

let currentFilePath = null;
let isDirty = false;
let themeMode = localStorage.getItem('cogmd-theme') || 'auto';
let currentTheme = themeMode === 'auto'
  ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  : themeMode;
// Two-dimensional view state
let layoutMode, rightPaneContent;
{
  // Migrate old single key to new pair
  const oldMode = localStorage.getItem('cogmd-view-mode');
  if (oldMode) {
    localStorage.removeItem('cogmd-view-mode');
    if (oldMode === 'editor') {
      layoutMode = 'single';
      rightPaneContent = 'preview';
    } else if (oldMode === 'split') {
      layoutMode = 'split';
      rightPaneContent = 'preview';
    } else if (oldMode === 'preview') {
      layoutMode = 'split';
      rightPaneContent = 'preview';
    } else if (oldMode === 'diff') {
      layoutMode = 'split';
      rightPaneContent = 'diff';
    } else {
      layoutMode = 'split';
      rightPaneContent = 'preview';
    }
    localStorage.setItem('cogmd-layout', layoutMode);
    localStorage.setItem('cogmd-right-pane', rightPaneContent);
  } else {
    layoutMode = localStorage.getItem('cogmd-layout') || 'split';
    rightPaneContent = localStorage.getItem('cogmd-right-pane') || 'preview';
  }
}

let savedDividerRatio = parseFloat(localStorage.getItem('cogmd-divider-ratio')) || 0.5;

// ===== Large file mode =====

const LARGE_FILE_THRESHOLD = 200 * 1024; // 200 KB
let isLargeFile = false;

function checkLargeFile(length) {
  isLargeFile = length > LARGE_FILE_THRESHOLD;
}

// ===== Tab Model =====

let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let isTabSwitching = false;

// ===== Sidebar State =====

let sidebarOpen = localStorage.getItem('cogmd-sidebar') !== 'closed';
const MAX_RECENT_FILES = 20;
let recentFiles = JSON.parse(localStorage.getItem('cogmd-recent-files') || '[]');
let favoriteFiles = JSON.parse(localStorage.getItem('cogmd-favorite-files') || '[]');
let folderFiles = [];

// ===== Tab LRU eviction =====

const MAX_CACHED_TAB_STATES = 5;
let tabAccessOrder = []; // most recent at end

function touchTab(tabId) {
  tabAccessOrder = tabAccessOrder.filter(id => id !== tabId);
  tabAccessOrder.push(tabId);
  evictStaleTabStates();
}

function evictStaleTabStates() {
  if (tabAccessOrder.length <= MAX_CACHED_TAB_STATES) return;
  const toEvict = tabAccessOrder.slice(0, tabAccessOrder.length - MAX_CACHED_TAB_STATES);
  if (toEvict.length === 0) return;
  // Defer heavy toString() work to idle time to avoid blocking tab switch
  const doEvict = () => {
    for (const id of toEvict) {
      const tab = tabs.find(t => t.id === id);
      if (tab && tab.editorState && tab.id !== activeTabId) {
        tab.content = tab.editorState.doc.toString();
        tab.editorState = null;
      }
    }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(doEvict);
  } else {
    setTimeout(doEvict, 0);
  }
}

// ===== Editor Setup =====

const previewEl = document.getElementById('previewContent');
const editorPane = document.getElementById('editorPane');
const displayMenu = document.getElementById('displayMenu');
const displayMenuToggle = document.getElementById('displayMenuToggle');
const splitMenu = document.getElementById('splitMenu');
const splitMenuToggle = document.getElementById('splitMenuToggle');
const themeToggle = document.getElementById('themeToggle');
const copyBtn = document.getElementById('copyBtn');
const openFolderBtn = document.getElementById('openFolderBtn');
const syncBtn = document.getElementById('syncBtn');
const layoutBtns = document.querySelectorAll('.mode-btn[data-layout]');
const rightBtns = document.querySelectorAll('.split-option-btn[data-right]');

function focusNativeReplaceInput(view) {
  openSearchPanel(view);
  requestAnimationFrame(() => {
    const root = view.dom.closest('.cm-editor');
    const replaceInput = root ? root.querySelector('.cm-search input[name="replace"]') : null;
    if (replaceInput) {
      replaceInput.focus();
      replaceInput.select();
    }
  });
  return true;
}

function makeExtensions() {
  return [
    themeCompartment.of(getThemeExtensions(currentTheme === 'dark')),
    fontSizeCompartment.of(makeFontSizeTheme(currentFontSize)),
    markdown({ codeLanguages, extensions: { remove: ['SetextHeading'] } }),
    history({ minDepth: 200 }),
    drawSelection(),
    highlightActiveLine(),
    closeBrackets(),
    bracketMatching(),
    search(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
      { key: 'Mod-r', run: focusNativeReplaceInput },
    ]),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !isTabSwitching) {
        isDirty = true;
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          const wasDirty = tab.isDirty;
          tab.isDirty = true;
          if (!wasDirty) renderSidebar();
        }
        window.api.setDocumentEdited(true);
        updateTitle();
        // Debounced preview / diff — no string copy per keystroke
        if (layoutMode === 'split' && rightPaneContent === 'diff') {
          scheduleDiffRender();
        } else {
          schedulePreviewRender();
        }
        scheduleSessionSave();
      }
    }),
  ];
}

function makeEditorState(doc) {
  return EditorState.create({ doc, extensions: makeExtensions() });
}

const view = new EditorView({
  state: makeEditorState(''),
  parent: editorPane,
});

// ===== Debounced Preview Rendering =====

let previewRenderTimer = null;

function schedulePreviewRender() {
  if (isLargeFile) return; // Large file mode: no live preview
  if (previewRenderTimer) clearTimeout(previewRenderTimer);

  previewRenderTimer = setTimeout(() => {
    renderPreview(view.state.doc.toString());
  }, 80);
}

// ===== Debounced Diff Rendering =====

let diffRenderTimer = null;

function scheduleDiffRender() {
  if (diffRenderTimer) clearTimeout(diffRenderTimer);
  diffRenderTimer = setTimeout(async () => {
    const { renderDiff, getDiffBase } = await import('./diff-view.js');
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    const baseText = getDiffBase(tab);
    const currentText = view.state.doc.toString();
    renderDiff(currentText, baseText, diffContentEl);
  }, 80);
}

// Immediate preview for tab switch / file open
let _lastPreviewText = null;

function renderPreviewImmediate(text) {
  checkLargeFile(text.length);
  if (isLargeFile) {
    _lastPreviewText = null;
    const msg = document.createElement('p');
    msg.style.cssText = 'color:var(--text-muted);font-style:italic';
    msg.textContent = 'Large file \u2014 preview on save (\u2318\u21e7R to refresh)';
    previewEl.replaceChildren(msg);
    return;
  }
  if (text === _lastPreviewText) return;
  _lastPreviewText = text;
  renderPreview(text);
}

// ===== Preview =====

function renderPreview(text) {
  const rawHtml = md.render(text);
  // DOMPurify sanitizes all HTML before DOM insertion — safe against XSS
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ['input'],
    ADD_ATTR: ['type', 'checked', 'disabled', 'class', 'style'],
  });

  // Use morphdom for incremental DOM updates (preserves scroll position)
  const wrapper = document.createElement('div');
  wrapper.innerHTML = cleanHtml; // Safe: content sanitized by DOMPurify above

  // Resolve image paths to asset protocol URLs so local images render in preview
  if (currentFilePath) {
    wrapper.querySelectorAll('img[src]').forEach(img => {
      const src = img.getAttribute('src');
      const assetUrl = toAssetImageUrl(currentFilePath, src);
      if (assetUrl) img.setAttribute('src', assetUrl);
    });
  }

  // Convert local .md links: move href → data-href so the webview can't navigate.
  // Also catch auto-linked bare names like "AGENTS.md" which linkify turns into
  // "http://AGENTS.md" (because .md is Moldova's TLD).
  wrapper.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return;

    let localPath = null;
    const isMdExt = p => /\.(?:md|markdown)$/i.test(p);

    if (/^https?:\/\//.test(href)) {
      // Auto-linked ".md" domain — linkify made "FOO.md" into "http://FOO.md"
      const text = a.textContent.trim();
      if (isMdExt(text) && href === `http://${text}`) localPath = text;
    } else if (isMdExt(href)) {
      localPath = href;
    }

    if (localPath) {
      a.setAttribute('data-href', localPath);
      a.removeAttribute('href');
      a.style.cursor = 'pointer';
    }
  });

  morphdom(previewEl, wrapper, {
    childrenOnly: true,
    onBeforeElUpdated(fromEl, toEl) {
      if (fromEl.isEqualNode(toEl)) return false;
      return true;
    },
  });
}

// ===== Preview link handling =====

function resolveRelativePath(base, relative) {
  const normalizedBase = base.replace(/\\/g, '/');
  const normalizedRelative = relative.replace(/\\/g, '/');
  const dir = normalizedBase.substring(0, normalizedBase.lastIndexOf('/'));
  const joined = normalizedRelative.startsWith('/')
    ? normalizedRelative
    : `${dir}/${normalizedRelative}`;
  const parts = joined.split('/');
  const resolved = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return '/' + resolved.join('/');
}

function splitUrlSuffix(url) {
  const match = url.match(/^([^?#]*)([?#].*)?$/);
  return {
    path: match?.[1] || '',
    suffix: match?.[2] || '',
  };
}

function toAssetImageUrl(baseFilePath, src) {
  if (!src) return null;
  const value = src.trim();
  if (!value || value.startsWith('#')) return null;

  // Keep web/data/blob/asset URLs unchanged.
  if (/^(?:https?:|data:|asset:|blob:|mailto:|tel:|javascript:|\/\/)/i.test(value)) {
    return null;
  }

  if (value.startsWith('file://')) {
    try {
      const fileUrl = new URL(value);
      return convertFileSrc(decodeURIComponent(fileUrl.pathname));
    } catch {
      return null;
    }
  }

  const { path, suffix } = splitUrlSuffix(value);
  if (!path) return null;

  const resolvedPath = resolveRelativePath(baseFilePath, path);
  return `${convertFileSrc(resolvedPath)}${suffix}`;
}

previewEl.addEventListener('click', async (e) => {
  const anchor = e.target.closest('a[data-href]');
  if (!anchor) return;

  const href = anchor.getAttribute('data-href');
  if (!href || !currentFilePath) return;

  const resolvedPath = resolveRelativePath(currentFilePath, href);

  // If already open, just switch to it
  const existing = tabs.find(t => t.filePath === resolvedPath);
  if (existing) {
    activateTab(existing.id);
    return;
  }

  try {
    const snapshot = await window.api.readFileSnapshot(resolvedPath);
    snapshotCurrentTab();
    const tab = createTab(resolvedPath, snapshot.content);
    activateTab(tab.id);
  } catch (err) {
    console.warn('Could not open linked file:', resolvedPath, err);
  }
});

// ===== Theme =====

const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function resolveTheme(mode) {
  if (mode === 'auto') return systemDarkQuery.matches ? 'dark' : 'light';
  return mode;
}

function applyTheme(mode) {
  themeMode = mode;
  currentTheme = resolveTheme(mode);
  const isDark = currentTheme === 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  document.documentElement.setAttribute('data-theme-mode', mode);
  localStorage.setItem('cogmd-theme', mode);
  view.dispatch({
    effects: themeCompartment.reconfigure(getThemeExtensions(isDark)),
  });
  // Invalidate caches that depend on theme
  _highlightCache.clear();
  _lastPreviewText = null;
}

function setDisplayMenuOpen(isOpen) {
  displayMenu.classList.toggle('open', isOpen);
  displayMenuToggle.setAttribute('aria-expanded', String(isOpen));
}

function closeDisplayMenu() {
  setDisplayMenuOpen(false);
}

function setSplitMenuOpen(isOpen) {
  splitMenu.classList.toggle('open', isOpen);
  splitMenuToggle.setAttribute('aria-expanded', String(isOpen));
}

function closeSplitMenu() {
  setSplitMenuOpen(false);
}

applyTheme(themeMode);

systemDarkQuery.addEventListener('change', () => {
  if (themeMode === 'auto') applyTheme('auto');
});

themeToggle.addEventListener('click', () => {
  const next = { auto: 'light', light: 'dark', dark: 'auto' };
  applyTheme(next[themeMode]);
});

// ===== Font Size =====

function applyFontSize(size) {
  currentFontSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
  localStorage.setItem('cogmd-font-size', currentFontSize);
  view.dispatch({
    effects: fontSizeCompartment.reconfigure(makeFontSizeTheme(currentFontSize)),
  });
  previewEl.style.fontSize = currentFontSize + 'px';
  diffContentEl.style.fontSize = currentFontSize + 'px';
}

const diffContentEl = document.getElementById('diffContent');

document.getElementById('fontDecrease').addEventListener('click', () => {
  applyFontSize(currentFontSize - 1);
});
document.getElementById('fontIncrease').addEventListener('click', () => {
  applyFontSize(currentFontSize + 1);
});

displayMenuToggle.addEventListener('click', (event) => {
  event.stopPropagation();
  closeSplitMenu();
  setDisplayMenuOpen(!displayMenu.classList.contains('open'));
});

document.addEventListener('click', (event) => {
  if (!displayMenu.contains(event.target)) closeDisplayMenu();
  if (!splitMenu.contains(event.target)) closeSplitMenu();
});

// Consolidated keydown handler (Escape + Cmd/Ctrl+F)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeDisplayMenu();
    closeSplitMenu();
  } else if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    openSearchPanel(view);
    view.focus();
  }
}, true);

// Set initial preview / diff font size
previewEl.style.fontSize = currentFontSize + 'px';
diffContentEl.style.fontSize = currentFontSize + 'px';

// ===== Copy Button =====

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(view.state.doc.toString());
  copyBtn.classList.add('copied');
  setTimeout(() => copyBtn.classList.remove('copied'), 1500);
});

openFolderBtn.addEventListener('click', async () => {
  await handleOpenContainingFolder();
});

syncBtn.addEventListener('click', async () => {
  await handleSyncCheck();
});

function updateOpenFolderButton() {
  const hasFileOnDisk = Boolean(currentFilePath);
  openFolderBtn.classList.toggle('hidden', !hasFileOnDisk);
}

function updateSyncButton() {
  const tab = tabs.find(t => t.id === activeTabId);
  const hasFileOnDisk = Boolean(currentFilePath);
  const hasExternalChange = Boolean(tab && tab.hasExternalChange);
  syncBtn.classList.toggle('hidden', !hasFileOnDisk);
  syncBtn.classList.toggle('warn', hasExternalChange);
}

async function handleOpenContainingFolder() {
  if (!currentFilePath) return;
  try {
    await window.api.openFileFolder(currentFilePath);
  } catch (e) {
    console.error('Failed to open containing folder:', e);
  }
}

// ===== Title =====

function updateTitle() {
  updateOpenFolderButton();
  updateSyncButton();
  const tab = tabs.find(t => t.id === activeTabId);
  const name = currentFilePath
    ? currentFilePath.split('/').pop()
    : 'Untitled';
  const prefix = isDirty ? '\u25cf ' : '';
  window.api.setTitle(`${prefix}${name} \u2014 Cog`);
}

function replaceEditorContent(nextContent) {
  isTabSwitching = true;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: nextContent },
  });
  isTabSwitching = false;
}

// ===== Tab Core Functions =====

function getTabName(tab) {
  if (tab.filePath) return tab.filePath.split('/').pop();
  if (tab.pluginData) {
    for (const data of Object.values(tab.pluginData)) {
      if (data && data.pageTitle) return data.pageTitle;
    }
  }
  return 'Untitled';
}

function snapshotCurrentTab() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  tab.editorState = view.state;
  const sel = view.state.selection.main;
  tab.selectionMain = { anchor: sel.anchor, head: sel.head };
  tab.scrollTop = view.scrollDOM.scrollTop;
}

function activateTab(tabId) {
  if (activeTabId === tabId) return;
  snapshotCurrentTab();

  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  isTabSwitching = true;
  touchTab(tabId);

  if (tab.editorState) {
    view.setState(tab.editorState);
    view.dispatch({
      effects: [
        themeCompartment.reconfigure(getThemeExtensions(currentTheme === 'dark')),
        fontSizeCompartment.reconfigure(makeFontSizeTheme(currentFontSize)),
      ],
    });
  } else {
    view.setState(makeEditorState(tab.content || ''));
  }

  isTabSwitching = false;

  activeTabId = tabId;
  currentFilePath = tab.filePath;
  isDirty = tab.isDirty;
  window.api.setDocumentEdited(isDirty);
  updateTitle();

  const content = tab.editorState ? tab.editorState.doc.toString() : (tab.content || '');
  if (layoutMode === 'split' && rightPaneContent === 'diff') {
    scheduleDiffRender();
  } else {
    renderPreviewImmediate(content);
  }
  renderSidebar();

  requestAnimationFrame(() => {
    view.scrollDOM.scrollTop = tab.scrollTop || 0;
  });

  scheduleSessionSave();
  // [hidden] pluginBus.emit('tab:activated', { tabId });
  refreshFolderFiles().then(() => renderSidebar());
  handleSyncCheck();
}

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
  // [hidden] pluginBus.emit('tab:created', { tab });
  return tab;
}

async function closeTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  if (tabId === activeTabId) snapshotCurrentTab();

  if (tab.isDirty) {
    const shouldClose = await window.api.confirmClose(getTabName(tab));
    if (!shouldClose) return;
  }

  addRecentFile(tab.filePath);
  tab.editorState = null;

  const idx = tabs.indexOf(tab);
  tabs.splice(idx, 1);
  tabAccessOrder = tabAccessOrder.filter(id => id !== tabId);
  // [hidden] pluginBus.emit('tab:closed', { tabId });

  if (tabs.length === 0) {
    const newTab = createTab(null, '');
    activeTabId = null;
    activateTab(newTab.id);
  } else if (tabId === activeTabId) {
    const newIdx = Math.min(idx, tabs.length - 1);
    activeTabId = null;
    activateTab(tabs[newIdx].id);
  } else {
    renderSidebar();
  }
  scheduleSessionSave();
}

function cycleTab(direction) {
  if (tabs.length <= 1) return;
  const idx = tabs.findIndex(t => t.id === activeTabId);
  const newIdx = (idx + direction + tabs.length) % tabs.length;
  activateTab(tabs[newIdx].id);
}

// ===== Sidebar Rendering =====

const sidebar = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const sidebarNewBtn = document.getElementById('sidebarNewBtn');
const sidebarOpened = document.getElementById('sidebarOpened');
const sidebarRecent = document.getElementById('sidebarRecent');
const sidebarRecentSection = document.getElementById('sidebarRecentSection');
const sidebarFolder = document.getElementById('sidebarFolder');
const sidebarFolderSection = document.getElementById('sidebarFolderSection');
const sidebarFavorites = document.getElementById('sidebarFavorites');
const sidebarFavoritesSection = document.getElementById('sidebarFavoritesSection');
const sidebarFavoritesHeader = document.getElementById('sidebarFavoritesHeader');
const sidebarOpenedSection = document.getElementById('sidebarOpenedSection');
const sidebarOpenedHeader = document.getElementById('sidebarOpenedHeader');
const sidebarRecentHeader = document.getElementById('sidebarRecentHeader');
const sidebarFolderHeader = document.getElementById('sidebarFolderHeader');

sidebarFavoritesHeader.addEventListener('click', () => {
  sidebarFavoritesSection.classList.toggle('collapsed');
});
sidebarOpenedHeader.addEventListener('click', () => {
  sidebarOpenedSection.classList.toggle('collapsed');
});
sidebarRecentHeader.addEventListener('click', () => {
  sidebarRecentSection.classList.toggle('collapsed');
});
sidebarFolderHeader.addEventListener('click', () => {
  sidebarFolderSection.classList.toggle('collapsed');
});


function makeCloseSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l1.setAttribute('x1', '6'); l1.setAttribute('y1', '6');
  l1.setAttribute('x2', '18'); l1.setAttribute('y2', '18');
  const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l2.setAttribute('x1', '18'); l2.setAttribute('y1', '6');
  l2.setAttribute('x2', '6'); l2.setAttribute('y2', '18');
  svg.appendChild(l1);
  svg.appendChild(l2);
  return svg;
}

function makeStarSvg(filled) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', filled ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  p.setAttribute('points', '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2');
  svg.appendChild(p);
  return svg;
}

function toggleFavorite(filePath) {
  if (!filePath) return;
  const idx = favoriteFiles.indexOf(filePath);
  if (idx >= 0) {
    favoriteFiles.splice(idx, 1);
  } else {
    favoriteFiles.push(filePath);
  }
  localStorage.setItem('cogmd-favorite-files', JSON.stringify(favoriteFiles));
  renderSidebar();
}

function makeStarBtn(filePath) {
  const isFav = favoriteFiles.includes(filePath);
  const btn = document.createElement('button');
  btn.className = 'sidebar-item-star' + (isFav ? ' favorited' : '');
  btn.dataset.starPath = filePath;
  btn.appendChild(makeStarSvg(isFav));
  return btn;
}

// Event delegation: single listener per sidebar list (no per-item listeners)

sidebarFavorites.addEventListener('click', (e) => {
  const starBtn = e.target.closest('.sidebar-item-star');
  if (starBtn) {
    e.stopPropagation();
    toggleFavorite(starBtn.dataset.starPath);
    return;
  }
  const item = e.target.closest('.sidebar-item');
  if (item && item.dataset.filePath) openFavoriteFile(item.dataset.filePath);
});

sidebarOpened.addEventListener('click', (e) => {
  const starBtn = e.target.closest('.sidebar-item-star');
  if (starBtn) {
    e.stopPropagation();
    toggleFavorite(starBtn.dataset.starPath);
    return;
  }
  const closeBtn = e.target.closest('.sidebar-item-close');
  if (closeBtn) {
    e.stopPropagation();
    const item = closeBtn.closest('.sidebar-item');
    if (item) closeTab(parseInt(item.dataset.tabId));
    return;
  }
  const item = e.target.closest('.sidebar-item');
  if (item && item.dataset.tabId) activateTab(parseInt(item.dataset.tabId));
});

sidebarRecent.addEventListener('click', (e) => {
  const starBtn = e.target.closest('.sidebar-item-star');
  if (starBtn) {
    e.stopPropagation();
    toggleFavorite(starBtn.dataset.starPath);
    return;
  }
  const item = e.target.closest('.sidebar-item');
  if (item && item.dataset.filePath) openRecentFile(item.dataset.filePath);
});

sidebarFolder.addEventListener('click', (e) => {
  const starBtn = e.target.closest('.sidebar-item-star');
  if (starBtn) {
    e.stopPropagation();
    toggleFavorite(starBtn.dataset.starPath);
    return;
  }
  const item = e.target.closest('.sidebar-item');
  if (item && item.dataset.filePath) openFolderFile(item.dataset.filePath);
});

function getParentFolder(filePath) {
  const parts = filePath.split('/');
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

function makePathSpan(filePath) {
  const folder = getParentFolder(filePath);
  if (!folder) return null;
  const span = document.createElement('span');
  span.className = 'sidebar-item-path';
  span.textContent = folder;
  return span;
}

function makeNameText(text) {
  const span = document.createElement('span');
  span.className = 'sidebar-item-name-text';
  span.textContent = text;
  return span;
}

function renderSidebar() {
  // --- Favorites section ---
  if (favoriteFiles.length > 0) {
    sidebarFavoritesSection.style.display = '';
    sidebarFavorites.textContent = '';
    favoriteFiles.forEach(filePath => {
      const item = document.createElement('div');
      item.className = 'sidebar-item';
      item.title = filePath;
      item.dataset.filePath = filePath;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'sidebar-item-name';
      nameSpan.appendChild(makeNameText(filePath.split('/').pop()));
      const pathSpan = makePathSpan(filePath);
      if (pathSpan) nameSpan.appendChild(pathSpan);
      item.appendChild(nameSpan);
      item.appendChild(makeStarBtn(filePath));
      sidebarFavorites.appendChild(item);
    });
  } else {
    sidebarFavoritesSection.style.display = 'none';
  }

  // --- Opened section ---
  sidebarOpened.textContent = '';

  tabs.forEach(tab => {
    const item = document.createElement('div');
    item.className = 'sidebar-item'
      + (tab.id === activeTabId ? ' active' : '')
      + (tab.isDirty ? ' dirty' : '')
      + (tab.hasExternalChange ? ' remote-dirty' : '');
    item.dataset.tabId = tab.id;
    item.title = tab.filePath || getTabName(tab);

    const dirtyDot = document.createElement('span');
    dirtyDot.className = 'sidebar-item-dirty';
    item.appendChild(dirtyDot);

    const remoteDirtyDot = document.createElement('span');
    remoteDirtyDot.className = 'sidebar-item-remote-dirty';
    item.appendChild(remoteDirtyDot);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'sidebar-item-name';
    nameSpan.appendChild(makeNameText(getTabName(tab)));
    if (tab.filePath) {
      const pathSpan = makePathSpan(tab.filePath);
      if (pathSpan) nameSpan.appendChild(pathSpan);
    }
    item.appendChild(nameSpan);

    if (tab.filePath) {
      item.appendChild(makeStarBtn(tab.filePath));
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sidebar-item-close';
    closeBtn.appendChild(makeCloseSvg());
    item.appendChild(closeBtn);

    sidebarOpened.appendChild(item);
  });

  // --- Recently Opened section (just show the 5 most recent, no filtering) ---
  sidebarRecentSection.style.display = '';
  sidebarRecent.textContent = '';
  recentFiles.slice(0, 5).forEach(filePath => {
    const item = document.createElement('div');
    item.className = 'sidebar-item';
    item.title = filePath;
    item.dataset.filePath = filePath;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'sidebar-item-name';
    nameSpan.appendChild(makeNameText(filePath.split('/').pop()));
    const pathSpan = makePathSpan(filePath);
    if (pathSpan) nameSpan.appendChild(pathSpan);
    item.appendChild(nameSpan);
    item.appendChild(makeStarBtn(filePath));
    sidebarRecent.appendChild(item);
  });

  // --- In Folder section (all files in folder, always) ---
  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeFilePath = activeTab?.filePath;
  if (activeFilePath && folderFiles.length > 0) {
    sidebarFolderSection.style.display = '';
    sidebarFolder.textContent = '';
    folderFiles.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'sidebar-item';
      item.title = entry.filePath;
      item.dataset.filePath = entry.filePath;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'sidebar-item-name';
      nameSpan.appendChild(makeNameText(entry.fileName));
      item.appendChild(nameSpan);
      item.appendChild(makeStarBtn(entry.filePath));
      sidebarFolder.appendChild(item);
    });
  } else {
    sidebarFolderSection.style.display = 'none';
  }
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  sidebar.classList.toggle('collapsed', !sidebarOpen);
  localStorage.setItem('cogmd-sidebar', sidebarOpen ? 'open' : 'closed');
}

function addRecentFile(filePath) {
  if (!filePath) return;
  recentFiles = recentFiles.filter(f => f !== filePath);
  recentFiles.unshift(filePath);
  if (recentFiles.length > MAX_RECENT_FILES) recentFiles.length = MAX_RECENT_FILES;
  localStorage.setItem('cogmd-recent-files', JSON.stringify(recentFiles));
}

async function refreshFolderFiles() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  const filePath = activeTab?.filePath;
  if (!filePath) {
    folderFiles = [];
    return;
  }
  const parts = filePath.split('/');
  parts.pop();
  const dirPath = parts.join('/');
  if (!dirPath) {
    folderFiles = [];
    return;
  }
  try {
    folderFiles = await window.api.listMdFiles(dirPath);
  } catch (e) {
    console.error('Failed to list folder files:', e);
    folderFiles = [];
  }
}

async function openRecentFile(filePath) {
  const existing = tabs.find(t => t.filePath === filePath);
  if (existing) {
    activateTab(existing.id);
    return;
  }
  try {
    const snapshot = await window.api.readFileSnapshot(filePath);
    snapshotCurrentTab();
    const tab = createTab(snapshot.filePath, snapshot.content);
    tab.lastSavedContent = snapshot.content;
    activateTab(tab.id);
  } catch (e) {
    console.error('Failed to open recent file:', e);
    recentFiles = recentFiles.filter(f => f !== filePath);
    localStorage.setItem('cogmd-recent-files', JSON.stringify(recentFiles));
    renderSidebar();
  }
}

async function openFavoriteFile(filePath) {
  const existing = tabs.find(t => t.filePath === filePath);
  if (existing) {
    activateTab(existing.id);
    return;
  }
  try {
    const snapshot = await window.api.readFileSnapshot(filePath);
    snapshotCurrentTab();
    const tab = createTab(snapshot.filePath, snapshot.content);
    tab.lastSavedContent = snapshot.content;
    activateTab(tab.id);
  } catch (e) {
    console.error('Failed to open favorite file:', e);
    favoriteFiles = favoriteFiles.filter(f => f !== filePath);
    localStorage.setItem('cogmd-favorite-files', JSON.stringify(favoriteFiles));
    renderSidebar();
  }
}

async function openFolderFile(filePath) {
  const existing = tabs.find(t => t.filePath === filePath);
  if (existing) {
    activateTab(existing.id);
    return;
  }
  try {
    const snapshot = await window.api.readFileSnapshot(filePath);
    snapshotCurrentTab();
    const tab = createTab(snapshot.filePath, snapshot.content);
    tab.lastSavedContent = snapshot.content;
    activateTab(tab.id);
  } catch (e) {
    console.error('Failed to open folder file:', e);
  }
}

sidebarToggleBtn.addEventListener('click', toggleSidebar);
sidebarNewBtn.addEventListener('click', () => handleNew());

// ===== File Ops =====

function setActiveTabState({
  content,
  dirty,
  lastSavedContent,
  hasExternalChange,
}) {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;

  replaceEditorContent(content);
  tab.content = content;
  tab.isDirty = dirty;
  tab.lastSavedContent = lastSavedContent;
  tab.hasExternalChange = hasExternalChange;

  isDirty = dirty;
  window.api.setDocumentEdited(dirty);
  updateTitle();
  renderSidebar();

  if (layoutMode === 'split' && rightPaneContent === 'diff') {
    scheduleDiffRender();
  } else {
    renderPreviewImmediate(content);
  }

  scheduleSessionSave();
}

async function handleSyncCheck() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab || !tab.filePath) return;

  syncBtn.classList.add('syncing');
  let disk;
  try {
    disk = await window.api.readFileSnapshot(tab.filePath);
  } catch (e) {
    syncBtn.classList.remove('syncing');
    console.error('Sync check failed:', e);
    await window.api.confirmAction(
      'Could not read the file from disk for sync.',
      { title: 'Sync Failed', kind: 'warning', okLabel: 'OK', cancelLabel: 'Dismiss' }
    );
    return;
  }

  const diskContent = disk.content;
  const baseContent = tab.lastSavedContent || '';
  const mineContent = view.state.doc.toString();

  if (diskContent === baseContent) {
    tab.hasExternalChange = false;
    syncBtn.classList.remove('syncing');
    updateSyncButton();
    renderSidebar();
    scheduleSessionSave();
    return;
  }

  tab.hasExternalChange = true;
  syncBtn.classList.remove('syncing');
  updateSyncButton();
  renderSidebar();
  scheduleSessionSave();

  const shouldSync = await window.api.confirmAction(
    'External changes were detected on disk. Sync changes now?',
    { title: 'External Changes Detected', kind: 'warning', okLabel: 'Sync', cancelLabel: 'Later' }
  );
  if (!shouldSync) return;

  const merge = threeWayMerge(baseContent, mineContent, diskContent);
  setActiveTabState({
    content: merge.mergedText,
    dirty: merge.mergedText !== diskContent,
    lastSavedContent: diskContent,
    hasExternalChange: false,
  });
}

async function handleNew() {
  snapshotCurrentTab();
  const tab = createTab(null, '');
  activateTab(tab.id);
}

async function handleOpen() {
  const result = await window.api.openFile();
  if (!result) return;

  const existing = tabs.find(t => t.filePath === result.filePath);
  if (existing) {
    activateTab(existing.id);
    return;
  }

  const active = tabs.find(t => t.id === activeTabId);
  if (active && !active.isDirty && !active.filePath && view.state.doc.length === 0) {
    replaceEditorContent(result.content);
    active.filePath = result.filePath;
    active.content = result.content;
    active.hasExternalChange = false;
    active.lastSavedContent = result.content;
    currentFilePath = result.filePath;
    isDirty = false;
    window.api.setDocumentEdited(false);
    updateTitle();
    if (layoutMode === 'split' && rightPaneContent === 'diff') {
      scheduleDiffRender();
    } else {
      renderPreviewImmediate(result.content);
    }
    renderSidebar();
    scheduleSessionSave();
    return;
  }

  snapshotCurrentTab();
  const tab = createTab(result.filePath, result.content);
  activateTab(tab.id);
}

async function handleSave() {
  const content = view.state.doc.toString();
  const tab = tabs.find(t => t.id === activeTabId);
  if (!currentFilePath) {
    // [hidden] pluginBus.emit('document:save', { tab, content });
    await handleSaveAs();
    return;
  }
  if (currentFilePath) {
    let disk = null;
    try {
      disk = await window.api.readFileSnapshot(currentFilePath);
    } catch (e) {
      console.error('Pre-save sync check failed:', e);
    }

    if (disk && tab) {
      const diskContent = disk.content;
      const baseContent = tab.lastSavedContent || '';
      if (diskContent !== baseContent) {
        tab.hasExternalChange = true;
        updateSyncButton();
        renderSidebar();
        scheduleSessionSave();

        const doSync = await window.api.confirmAction(
          'External changes were detected on disk. Sync changes instead of overwrite?',
          { title: 'External Changes Detected', kind: 'warning', okLabel: 'Sync Changes', cancelLabel: 'More Options' }
        );

        if (doSync) {
          const merge = threeWayMerge(baseContent, content, diskContent);
          setActiveTabState({
            content: merge.mergedText,
            dirty: merge.mergedText !== diskContent,
            lastSavedContent: diskContent,
            hasExternalChange: false,
          });
          return;
        }

        const doOverwrite = await window.api.confirmAction(
          'Overwrite disk changes with your current editor content?',
          { title: 'Save Options', kind: 'warning', okLabel: 'Overwrite', cancelLabel: 'Cancel' }
        );

        if (!doOverwrite) {
          return;
        }
      }
    }

    await window.api.saveFile(currentFilePath, content);
    isDirty = false;
    if (tab) {
      tab.isDirty = false;
      tab.hasExternalChange = false;
      tab.lastSavedContent = content;
    }
    window.api.setDocumentEdited(false);
    updateTitle();
    renderSidebar();
    scheduleSessionSave();
  } else {
    await handleSaveAs();
  }
}

async function handleSaveAs() {
  const content = view.state.doc.toString();
  const filePath = await window.api.saveFileAs(content);
  if (filePath) {
    currentFilePath = filePath;
    isDirty = false;
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
      tab.filePath = filePath;
      tab.isDirty = false;
      tab.hasExternalChange = false;
      tab.lastSavedContent = content;
    }
    window.api.setDocumentEdited(false);
    updateTitle();
    renderSidebar();
    scheduleSessionSave();
    refreshFolderFiles().then(() => renderSidebar());
  }
}

// ===== Session Persistence (IndexedDB) =====

const DB_NAME = 'cogmd';
const DB_STORE = 'session';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

let sessionSaveTimer = null;

function scheduleSessionSave() {
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(saveSession, 5000);
}

window.addEventListener('beforeunload', () => {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
  }
  saveSession();
});

function saveSession() {
  snapshotCurrentTab();
  const data = {
    tabs: tabs.map(t => ({
      id: t.id,
      filePath: t.filePath,
      content: t.editorState ? t.editorState.doc.toString() : (t.content || ''),
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
  idbSet('session', data).catch(() => {
    try {
      localStorage.setItem('cogmd-session', JSON.stringify(data));
    } catch (_) {}
  });
}

async function restoreSession() {
  let data;
  try {
    data = await idbGet('session');
  } catch (_) {}

  // Fallback: migrate from localStorage
  if (!data) {
    const raw = localStorage.getItem('cogmd-session');
    if (raw) {
      try {
        data = JSON.parse(raw);
        localStorage.removeItem('cogmd-session');
      } catch (_) {}
    }
  }

  if (!data || !data.tabs || data.tabs.length === 0) return false;

  tabs = data.tabs.map(t => ({
    ...t,
    hasExternalChange: Boolean(t.hasExternalChange),
    pluginData: t.pluginData || {},
    lastSavedContent: t.lastSavedContent ?? t.content ?? '',
  }));
  nextTabId = data.nextTabId || (Math.max(...tabs.map(t => t.id)) + 1);

  const targetId = data.activeTabId || tabs[0].id;
  const tab = tabs.find(t => t.id === targetId) || tabs[0];

  isTabSwitching = true;
  const state = makeEditorState(tab.content);
  view.setState(state);
  isTabSwitching = false;

  activeTabId = tab.id;
  currentFilePath = tab.filePath;
  isDirty = tab.isDirty;
  window.api.setDocumentEdited(isDirty);
  updateTitle();
  renderPreviewImmediate(tab.content);
  renderSidebar();
  touchTab(tab.id);

  requestAnimationFrame(() => {
    view.scrollDOM.scrollTop = tab.scrollTop || 0;
  });

  return true;
}

// ===== Reset Settings =====

function resetAllSettings() {
  if (!confirm('Reset all settings to defaults? This will clear your tabs and preferences.')) return;
  localStorage.removeItem('cogmd-theme');
  localStorage.removeItem('cogmd-font-size');
  localStorage.removeItem('cogmd-layout');
  localStorage.removeItem('cogmd-right-pane');
  localStorage.removeItem('cogmd-view-mode');
  localStorage.removeItem('cogmd-divider-ratio');
  localStorage.removeItem('cogmd-session');
  localStorage.removeItem('cogmd-sidebar');
  localStorage.removeItem('cogmd-recent-files');
  localStorage.removeItem('cogmd-favorite-files');
  idbSet('session', null).catch(() => {});
  location.reload();
}

// ===== Menu Actions =====

window.api.onMenuAction((action) => {
  switch (action) {
    case 'new': handleNew(); break;
    case 'open': handleOpen(); break;
    case 'save': handleSave(); break;
    case 'saveAs': handleSaveAs(); break;
    case 'openContainingFolder': handleOpenContainingFolder(); break;
    case 'closeTab': closeTab(activeTabId); break;
    case 'nextTab': cycleTab(1); break;
    case 'prevTab': cycleTab(-1); break;
    case 'toggleTheme': {
      const next = { auto: 'light', light: 'dark', dark: 'auto' };
      applyTheme(next[themeMode]);
      break;
    }
    case 'viewSingle': applyView('single', rightPaneContent); break;
    case 'viewSplit': applyView('split', rightPaneContent); break;
    case 'viewPreview': applyView('split', 'preview'); break;
    case 'viewDiff': applyView('split', 'diff'); break;
    case 'fontIncrease': applyFontSize(currentFontSize + 1); break;
    case 'fontDecrease': applyFontSize(currentFontSize - 1); break;
    case 'fontReset': applyFontSize(FONT_SIZE_DEFAULT); break;
    case 'toggleSidebar': toggleSidebar(); break;
    case 'resetSettings': resetAllSettings(); break;
    case 'checkForUpdates': window.api.checkForUpdates(true); break;
    // [hidden] case 'managePlugins': showManagePlugins(); break;
    case 'refreshPreview': {
      const text = view.state.doc.toString();
      isLargeFile = false;
      renderPreview(text);
      break;
    }
  }
});

window.api.onFileOpened(({ filePath, content }) => {
  const existing = tabs.find(t => t.filePath === filePath);
  if (existing) {
    activateTab(existing.id);
    return;
  }
  snapshotCurrentTab();
  const tab = createTab(filePath, content);
  activateTab(tab.id);
});

// ===== Fullscreen =====

window.api.onFullscreenChanged((isFullscreen) => {
  document.documentElement.classList.toggle('fullscreen', isFullscreen);
});

// ===== Auto-Update Notification Bar =====

const updateBar = document.getElementById('updateBar');
const updateMsg = document.getElementById('updateMsg');
const updateAction = document.getElementById('updateAction');
const updateDismiss = document.getElementById('updateDismiss');

function showUpdateBar(message, actionText, onAction) {
  if (!updateBar) return;
  updateMsg.textContent = message;
  if (actionText && onAction) {
    updateAction.textContent = actionText;
    updateAction.style.display = '';
    updateAction.onclick = onAction;
  } else {
    updateAction.style.display = 'none';
  }
  updateBar.classList.add('visible');
}

function hideUpdateBar() {
  if (!updateBar) return;
  updateBar.classList.remove('visible');
}

if (updateDismiss) {
  updateDismiss.addEventListener('click', hideUpdateBar);
}

window.api.onUpdateAvailable(() => {
  showUpdateBar('Downloading update\u2026', null, null);
});

window.api.onUpdateDownloaded(() => {
  showUpdateBar('Update ready \u2014 restart to install', 'Restart', () => {
    window.api.installUpdate();
  });
});

window.api.onUpdateError((message) => {
  const reason = message ? `: ${message}` : '';
  showUpdateBar(`Update check failed${reason}`, null, null);
  setTimeout(hideUpdateBar, 5000);
});

window.api.onUpdateNone(() => {
  showUpdateBar('You\u2019re on the latest version', null, null);
  setTimeout(hideUpdateBar, 5000);
});

// ===== File Drop Overlay =====

const dropOverlay = document.getElementById('dropOverlay');
let dragCounter = 0;

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  dropOverlay.classList.add('visible');
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropOverlay.classList.remove('visible');
  }
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.remove('visible');
});

// ===== Divider Drag =====

const divider = document.getElementById('divider');
const container = document.querySelector('.container');

let isDragging = false;
let _dragRaf = null;

divider.addEventListener('mousedown', (e) => {
  isDragging = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  if (_dragRaf) return;
  const clientX = e.clientX;
  _dragRaf = requestAnimationFrame(() => {
    _dragRaf = null;
    const rect = container.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const clamped = Math.max(0.2, Math.min(0.8, ratio));
    container.style.gridTemplateColumns = `${clamped}fr auto ${1 - clamped}fr`;
  });
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // Persist divider ratio
    const cols = container.style.gridTemplateColumns;
    const m = cols.match(/([\d.]+)fr/);
    if (m) {
      savedDividerRatio = parseFloat(m[1]);
      localStorage.setItem('cogmd-divider-ratio', savedDividerRatio);
    }
  }
});

// ===== View Mode System (two-dimensional: layout + right pane content) =====

const previewPane = document.querySelector('.preview-pane');
const previewContent = document.getElementById('previewContent');

async function applyView(layout, rightPane) {
  // Validate
  if (layout !== 'single' && layout !== 'split') layout = 'split';
  if (rightPane !== 'preview' && rightPane !== 'diff') rightPane = 'preview';

  layoutMode = layout;
  rightPaneContent = rightPane;
  localStorage.setItem('cogmd-layout', layout);
  localStorage.setItem('cogmd-right-pane', rightPane);

  // Update layout button active states
  layoutBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layout === layout);
  });

  // Update right-pane button active states + dimmed when single
  rightBtns.forEach(btn => {
    btn.classList.toggle('active', layout === 'split' && btn.dataset.right === rightPane);
    btn.classList.toggle('dimmed', layout === 'single');
  });

  // Animate layout transitions (removed after transition to avoid drag lag)
  container.classList.add('animate-columns');
  setTimeout(() => container.classList.remove('animate-columns'), 250);

  // Reset visibility
  editorPane.style.display = '';
  divider.style.display = '';
  previewPane.style.display = '';

  if (layout === 'single') {
    // Editor only
    divider.style.display = 'none';
    previewPane.style.display = 'none';
    container.style.gridTemplateColumns = '1fr';
    // Clean up diff content
    const { destroyDiff } = await import('./diff-view.js');
    destroyDiff(diffContentEl);
    diffContentEl.style.display = 'none';
    previewContent.style.display = '';
  } else {
    // Split mode — restore saved divider ratio
    const r = savedDividerRatio;
    container.style.gridTemplateColumns = `${r}fr auto ${1 - r}fr`;

    if (rightPane === 'preview') {
      diffContentEl.style.display = 'none';
      previewContent.style.display = '';
      const { destroyDiff } = await import('./diff-view.js');
      destroyDiff(diffContentEl);
      renderPreviewImmediate(view.state.doc.toString());
    } else {
      // diff
      previewContent.style.display = 'none';
      diffContentEl.style.display = '';
      // Render diff
      const { renderDiff, getDiffBase } = await import('./diff-view.js');
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) {
        const baseText = getDiffBase(tab);
        const currentText = view.state.doc.toString();
        renderDiff(currentText, baseText, diffContentEl);
      }
    }
  }
}

// Layout buttons: set layout mode
layoutBtns.forEach(btn => {
  if (btn === splitMenuToggle) return;
  btn.addEventListener('click', () => {
    closeSplitMenu();
    applyView(btn.dataset.layout, rightPaneContent);
  });
});

splitMenuToggle.addEventListener('click', (event) => {
  event.stopPropagation();
  if (layoutMode !== 'split') applyView('split', rightPaneContent);
  closeDisplayMenu();
  setSplitMenuOpen(!splitMenu.classList.contains('open'));
});

// Split dropdown options: set right pane content and ensure split layout
rightBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    applyView('split', btn.dataset.right);
    closeSplitMenu();
  });
});

// Keep window chrome proportions stable when using overlay titlebar.
document.addEventListener('keydown', (e) => {
  if (!e.metaKey || e.altKey || e.ctrlKey) return;
  if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0') {
    e.preventDefault();
  }
});

// ===== Startup =====

performance.mark('startup-begin');

async function startup() {
  // Apply initial sidebar state and layout
  sidebar.classList.toggle('collapsed', !sidebarOpen);
  applyView(layoutMode, rightPaneContent);

  performance.mark('editor-ready');
  performance.measure('startup', 'startup-begin', 'editor-ready');

  // Load content after window is visible
  // [hidden] Plugin manager init temporarily disabled
  const restored = await restoreSession();

  if (!restored) {
    const tab = createTab(null, '');
    activeTabId = tab.id;
    currentFilePath = null;
    isDirty = false;
    updateTitle();
    renderSidebar();
  }

  refreshFolderFiles().then(() => renderSidebar());
  // [hidden] initManagePluginsButton();

  // Open any file passed via Finder "Open With" before frontend was ready
  const pending = await window.api.getPendingFile();
  if (pending) {
    const existing = tabs.find(t => t.filePath === pending.filePath);
    if (existing) {
      activateTab(existing.id);
    } else {
      snapshotCurrentTab();
      const tab = createTab(pending.filePath, pending.content);
      activateTab(tab.id);
    }
  }

  // Defer non-critical work to after first paint
  setTimeout(() => {
    initShiki();
    window.api.checkForUpdates();
  }, 100);
}

startup();
