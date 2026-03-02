import './api.js';
import { EditorView, keymap, highlightActiveLine, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { LanguageDescription } from '@codemirror/language';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language';
import { closeBrackets } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';
import markdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import morphdom from 'morphdom';
import { threeWayMerge } from './merge-engine.js';

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

async function initShiki() {
  const { createHighlighterCore } = await import('shiki/core');
  const { createJavaScriptRegExpEngine } = await import('shiki/engine/javascript');

  shikiHighlighter = await createHighlighterCore({
    themes: [import('shiki/dist/themes/one-dark-pro.mjs'), import('shiki/dist/themes/one-light.mjs')],
    langs: [
      import('shiki/dist/langs/javascript.mjs'),
      import('shiki/dist/langs/typescript.mjs'),
      import('shiki/dist/langs/python.mjs'),
      import('shiki/dist/langs/html.mjs'),
      import('shiki/dist/langs/css.mjs'),
      import('shiki/dist/langs/json.mjs'),
      import('shiki/dist/langs/rust.mjs'),
      import('shiki/dist/langs/java.mjs'),
      import('shiki/dist/langs/bash.mjs'),
      import('shiki/dist/langs/yaml.mjs'),
      import('shiki/dist/langs/sql.mjs'),
      import('shiki/dist/langs/go.mjs'),
    ],
    engine: createJavaScriptRegExpEngine(),
  });

  shikiReady = true;
  // Re-render preview with syntax highlighting now available
  schedulePreviewRender();
}

function shikiHighlight(str, lang) {
  if (!shikiReady || !shikiHighlighter) return '';
  try {
    const loadedLangs = shikiHighlighter.getLoadedLanguages();
    if (!loadedLangs.includes(lang)) return '';
    const theme = currentTheme === 'dark' ? 'one-dark-pro' : 'one-light';
    return shikiHighlighter.codeToHtml(str, { lang, theme });
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

const FONT_SIZE_MIN = 8, FONT_SIZE_MAX = 18, FONT_SIZE_DEFAULT = 10;
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
      padding: '0 32px',
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

function makeHighlightStyle(isDark) {
  if (isDark) {
    return HighlightStyle.define([
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
  }
  return HighlightStyle.define([
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
  for (const id of toEvict) {
    const tab = tabs.find(t => t.id === id);
    if (tab && tab.editorState && tab.id !== activeTabId) {
      // Preserve content string, drop heavy EditorState
      tab.content = tab.editorState.doc.toString();
      tab.editorState = null;
    }
  }
}

// ===== Editor Setup =====

const previewEl = document.getElementById('previewContent');
const editorPane = document.getElementById('editorPane');
const themeToggle = document.getElementById('themeToggle');
const copyBtn = document.getElementById('copyBtn');
const openFolderBtn = document.getElementById('openFolderBtn');
const syncBtn = document.getElementById('syncBtn');
const notionBtn = document.getElementById('notionBtn');
const notionSyncBtn = document.getElementById('notionSyncBtn');
const layoutBtns = document.querySelectorAll('.mode-btn[data-layout]');
const rightBtns = document.querySelectorAll('.mode-btn[data-right]');
const notionModal = document.getElementById('notionModal');
const notionTokenModal = document.getElementById('notionTokenModal');
const notionTokenInput = document.getElementById('notionTokenInput');
const notionStatusDot = document.getElementById('notionStatusDot');
const notionDisconnectBtn = document.getElementById('notionDisconnectBtn');
const notionConnectCtaBtn = document.getElementById('notionConnectCtaBtn');
const notionDisconnectedState = document.getElementById('notionDisconnectedState');
const notionConnectedState = document.getElementById('notionConnectedState');
const notionSearchInput = document.getElementById('notionSearchInput');
const notionSearchBtn = document.getElementById('notionSearchBtn');
const notionResults = document.getElementById('notionResults');
const notionCloseBtn = document.getElementById('notionCloseBtn');
const notionTokenCloseBtn = document.getElementById('notionTokenCloseBtn');
const notionTokenConnectBtn = document.getElementById('notionTokenConnectBtn');

let notionAuth = { connected: false, workspaceName: null, botName: null };
let notionImportInProgress = false;
let notionSyncInProgress = false;

function setNotionImportBusy(isBusy) {
  notionImportInProgress = isBusy;
  notionModal.classList.toggle('busy', isBusy);
  notionSearchInput.disabled = isBusy;
  notionSearchBtn.disabled = isBusy;
  notionDisconnectBtn.disabled = isBusy;
  notionCloseBtn.disabled = isBusy;
}

function setNotionSyncBusy(isBusy) {
  notionSyncInProgress = isBusy;
  notionSyncBtn.classList.toggle('syncing', isBusy);
  notionSyncBtn.disabled = isBusy;
  notionSyncBtn.title = isBusy
    ? 'Syncing Notion changes...'
    : 'Check Notion page changes and sync';
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
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !isTabSwitching) {
        isDirty = true;
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          const wasDirty = tab.isDirty;
          tab.isDirty = true;
          if (!wasDirty) renderTabBar();
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
    const diffEl = document.getElementById('diffContent');
    renderDiff(currentText, baseText, diffEl);
  }, 80);
}

// Immediate preview for tab switch / file open
function renderPreviewImmediate(text) {
  checkLargeFile(text.length);
  if (isLargeFile) {
    const msg = document.createElement('p');
    msg.style.cssText = 'color:var(--text-muted);font-style:italic';
    msg.textContent = 'Large file \u2014 preview on save (\u2318\u21e7R to refresh)';
    previewEl.replaceChildren(msg);
    return;
  }
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
  morphdom(previewEl, wrapper, {
    childrenOnly: true,
    onBeforeElUpdated(fromEl, toEl) {
      if (fromEl.isEqualNode(toEl)) return false;
      return true;
    },
  });
}

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
  previewEl.style.fontSize = (currentFontSize + 1) + 'px';
  document.getElementById('diffContent').style.fontSize = (currentFontSize + 1) + 'px';
}

document.getElementById('fontDecrease').addEventListener('click', () => applyFontSize(currentFontSize - 1));
document.getElementById('fontIncrease').addEventListener('click', () => applyFontSize(currentFontSize + 1));

// Set initial preview / diff font size
previewEl.style.fontSize = (currentFontSize + 1) + 'px';
document.getElementById('diffContent').style.fontSize = (currentFontSize + 1) + 'px';

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

notionBtn.addEventListener('click', async () => {
  await refreshNotionAuthStatus();
  notionModal.classList.add('visible');
  if (notionAuth.connected) {
    await loadRecentNotionPages();
  }
});

notionSyncBtn.addEventListener('click', async () => {
  if (notionSyncInProgress) return;
  await handleNotionSync();
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

function updateNotionButtons() {
  notionBtn.classList.toggle('connected', Boolean(notionAuth.connected));
  const tab = tabs.find(t => t.id === activeTabId);
  const hasNotionPage = Boolean(tab && tab.notionPageId);
  const hasNotionExternalChange = Boolean(tab && tab.notionHasExternalChange);
  notionSyncBtn.classList.toggle('hidden', !hasNotionPage);
  notionSyncBtn.classList.toggle('warn', hasNotionExternalChange);
  notionSyncBtn.classList.toggle('syncing', notionSyncInProgress);
  notionSyncBtn.disabled = notionSyncInProgress;
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
  updateNotionButtons();
  const tab = tabs.find(t => t.id === activeTabId);
  const name = currentFilePath
    ? currentFilePath.split('/').pop()
    : (tab?.notionPageTitle || 'Untitled');
  const prefix = isDirty ? '\u25cf ' : '';
  window.api.setTitle(`${prefix}${name} \u2014 CogMD`);
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
  return tab.filePath ? tab.filePath.split('/').pop() : (tab.notionPageTitle || 'Untitled');
}

function createNotionIconSvg(className = 'notion-logo') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute(
    'd',
    'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z'
  );

  svg.appendChild(path);
  return svg;
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
  renderTabBar();

  const activeEl = tabBar.querySelector('.tab.active');
  if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

  requestAnimationFrame(() => {
    view.scrollDOM.scrollTop = tab.scrollTop || 0;
  });

  scheduleSessionSave();
}

function createTab(filePath, content) {
  const tab = {
    id: nextTabId++,
    filePath: filePath || null,
    content: content || '',
    isDirty: false,
    hasExternalChange: false,
    notionPageId: null,
    notionPageTitle: null,
    notionLastSyncedContent: '',
    notionLastEditedTime: null,
    notionHasExternalChange: false,
    scrollTop: 0,
    selectionMain: { anchor: 0, head: 0 },
    lastSavedContent: content || '',
  };
  tabs.push(tab);
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

  tab.editorState = null;

  const idx = tabs.indexOf(tab);
  tabs.splice(idx, 1);
  tabAccessOrder = tabAccessOrder.filter(id => id !== tabId);

  if (tabs.length === 0) {
    const newTab = createTab(null, '');
    activeTabId = null;
    activateTab(newTab.id);
  } else if (tabId === activeTabId) {
    const newIdx = Math.min(idx, tabs.length - 1);
    activeTabId = null;
    activateTab(tabs[newIdx].id);
  } else {
    renderTabBar();
  }
  scheduleSessionSave();
}

function cycleTab(direction) {
  if (tabs.length <= 1) return;
  const idx = tabs.findIndex(t => t.id === activeTabId);
  const newIdx = (idx + direction + tabs.length) % tabs.length;
  activateTab(tabs[newIdx].id);
}

// ===== Tab Bar Rendering =====

const tabBar = document.getElementById('tabBar');
const tabNewBtn = document.getElementById('tabNewBtn');

function renderTabBar() {
  tabBar.querySelectorAll('.tab').forEach(el => el.remove());

  tabs.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'tab'
      + (tab.id === activeTabId ? ' active' : '')
      + (tab.isDirty ? ' dirty' : '')
      + ((tab.hasExternalChange || tab.notionHasExternalChange) ? ' remote-dirty' : '');
    btn.dataset.tabId = tab.id;
    btn.title = tab.filePath || tab.notionPageTitle || 'Untitled';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = getTabName(tab);

    if (tab.notionPageId) {
      const notionIcon = createNotionIconSvg('notion-logo tab-remote-icon');
      btn.appendChild(notionIcon);
    }

    btn.appendChild(nameSpan);

    const dirtyDot = document.createElement('span');
    dirtyDot.className = 'tab-dirty';
    btn.appendChild(dirtyDot);

    const remoteDirtyDot = document.createElement('span');
    remoteDirtyDot.className = 'tab-remote-dirty';
    btn.appendChild(remoteDirtyDot);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    const closeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    closeSvg.setAttribute('width', '14');
    closeSvg.setAttribute('height', '14');
    closeSvg.setAttribute('viewBox', '0 0 24 24');
    closeSvg.setAttribute('fill', 'none');
    closeSvg.setAttribute('stroke', 'currentColor');
    closeSvg.setAttribute('stroke-width', '2.5');
    closeSvg.setAttribute('stroke-linecap', 'round');
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '6'); line1.setAttribute('y1', '6');
    line1.setAttribute('x2', '18'); line1.setAttribute('y2', '18');
    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '18'); line2.setAttribute('y1', '6');
    line2.setAttribute('x2', '6'); line2.setAttribute('y2', '18');
    closeSvg.appendChild(line1);
    closeSvg.appendChild(line2);
    closeBtn.appendChild(closeSvg);
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    btn.appendChild(closeBtn);

    btn.addEventListener('click', () => activateTab(tab.id));
    tabBar.insertBefore(btn, tabNewBtn);
  });
}

tabNewBtn.addEventListener('click', () => handleNew());

tabBar.addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault();
    tabBar.scrollLeft += e.deltaY;
  }
}, { passive: false });

// ===== File Ops =====

function setActiveTabState({
  content,
  dirty,
  lastSavedContent,
  hasExternalChange,
  notionLastSyncedContent,
  notionHasExternalChange,
  notionLastEditedTime,
  notionPageTitle,
}) {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;

  replaceEditorContent(content);
  tab.content = content;
  tab.isDirty = dirty;
  tab.lastSavedContent = lastSavedContent;
  tab.hasExternalChange = hasExternalChange;
  if (typeof notionLastSyncedContent === 'string') tab.notionLastSyncedContent = notionLastSyncedContent;
  if (typeof notionHasExternalChange === 'boolean') tab.notionHasExternalChange = notionHasExternalChange;
  if (typeof notionLastEditedTime === 'string' || notionLastEditedTime === null) {
    tab.notionLastEditedTime = notionLastEditedTime;
  }
  if (typeof notionPageTitle === 'string' && notionPageTitle) {
    tab.notionPageTitle = notionPageTitle;
  }

  isDirty = dirty;
  window.api.setDocumentEdited(dirty);
  updateTitle();
  renderTabBar();

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

  let disk;
  try {
    disk = await window.api.readFileSnapshot(tab.filePath);
  } catch (e) {
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
    updateSyncButton();
    renderTabBar();
    scheduleSessionSave();
    return;
  }

  tab.hasExternalChange = true;
  updateSyncButton();
  renderTabBar();
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

function renderNotionResults(items) {
  notionResults.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'notion-empty';
    empty.textContent = 'No pages found. Please make sure the integration connection is enabled for this page in Notion.';
    notionResults.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const existingLinkedTab = tabs.find(t => t.notionPageId === item.id);
    const row = document.createElement('div');
    row.className = `notion-result-row${existingLinkedTab ? ' already-imported' : ''}`;
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute(
      'aria-label',
      existingLinkedTab
        ? `Open imported Notion page ${item.title || 'Untitled'}`
        : `Link Notion page ${item.title || 'Untitled'}`
    );

    const name = document.createElement('div');
    name.className = 'notion-result-title';
    name.textContent = item.title || 'Untitled';

    const meta = document.createElement('div');
    meta.className = 'notion-result-meta';
    if (item.lastEditedTime) {
      const dt = new Date(item.lastEditedTime);
      meta.textContent = Number.isNaN(dt.getTime())
        ? `Edited: ${item.lastEditedTime}`
        : `Edited ${dt.toLocaleString()}`;
    } else {
      meta.textContent = item.id;
    }

    const check = document.createElement('span');
    check.className = 'notion-result-check';
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');

    const handleLink = async () => {
      const linkedTab = tabs.find(t => t.notionPageId === item.id);
      if (linkedTab) {
        activateTab(linkedTab.id);
        notionModal.classList.remove('visible');
        return;
      }

      if (notionImportInProgress) return;
      if (row.classList.contains('loading')) return;
      setNotionImportBusy(true);
      notionResults.classList.add('is-busy');
      row.classList.add('loading');
      row.setAttribute('aria-busy', 'true');
      const previousMeta = meta.textContent;
      meta.textContent = 'Importing...';

      try {
        const pulled = await window.api.notionPullPage(item.id);
        let tab = tabs.find(t => t.id === activeTabId);
        if (!tab) return;

        const isReusable = !tab.filePath && !tab.notionPageId && !tab.isDirty && view.state.doc.length === 0;
        if (!isReusable) {
          snapshotCurrentTab();
          tab = createTab(null, '');
          activateTab(tab.id);
          tab = tabs.find(t => t.id === activeTabId);
        }
        if (!tab) return;

        setActiveTabState({
          content: pulled.content || '',
          dirty: false,
          lastSavedContent: tab.lastSavedContent || '',
          hasExternalChange: false,
          notionLastSyncedContent: pulled.content || '',
          notionHasExternalChange: false,
          notionLastEditedTime: pulled.lastEditedTime || null,
          notionPageTitle: pulled.title || 'Untitled',
        });

        tab.notionPageId = pulled.pageId;
        tab.notionPageTitle = pulled.title || 'Untitled';
        tab.notionLastSyncedContent = pulled.content || '';
        tab.notionLastEditedTime = pulled.lastEditedTime || null;
        tab.notionHasExternalChange = false;
        tab.filePath = null;
        currentFilePath = null;
        renderTabBar();
        updateTitle();
        scheduleSessionSave();
        notionModal.classList.remove('visible');
      } catch (e) {
        console.error('Failed to link Notion page:', e);
        meta.textContent = previousMeta;
        await window.api.confirmAction(
          `Could not pull page from Notion: ${String(e)}`,
          { title: 'Notion Error', kind: 'warning', okLabel: 'OK', cancelLabel: 'Dismiss' }
        );
      } finally {
        notionResults.classList.remove('is-busy');
        row.classList.remove('loading');
        row.removeAttribute('aria-busy');
        setNotionImportBusy(false);
      }
    };

    row.addEventListener('click', handleLink);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleLink();
      }
    });

    row.appendChild(name);
    row.appendChild(meta);
    if (existingLinkedTab) {
      row.appendChild(check);
    }
    notionResults.appendChild(row);
  });
}

function renderNotionLoading() {
  notionResults.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'notion-loading-state';

  const spinner = document.createElement('div');
  spinner.className = 'notion-spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.className = 'notion-loading-label';
  label.textContent = 'Loading pages...';

  loading.appendChild(spinner);
  loading.appendChild(label);
  notionResults.appendChild(loading);
}

async function loadRecentNotionPages() {
  renderNotionLoading();
  try {
    const results = await window.api.notionSearchPages('');
    renderNotionResults(results || []);
  } catch (e) {
    console.error('Notion recent pages load failed:', e);
    renderNotionResults([]);
  }
}

async function refreshNotionAuthStatus() {
  try {
    notionAuth = await window.api.notionAuthStatus();
  } catch (_) {
    notionAuth = { connected: false, workspaceName: null, botName: null };
  }
  notionStatusDot.textContent = notionAuth.connected ? '\u2713' : '\u2715';
  notionStatusDot.classList.toggle('connected', notionAuth.connected);
  notionDisconnectedState.classList.toggle('hidden', notionAuth.connected);
  notionConnectedState.classList.toggle('hidden', !notionAuth.connected);
  notionDisconnectBtn.classList.toggle('hidden', !notionAuth.connected);
  updateNotionButtons();
}

async function handleNotionSearch() {
  if (notionImportInProgress) return;
  const query = notionSearchInput.value.trim();
  renderNotionLoading();
  try {
    const results = await window.api.notionSearchPages(query);
    renderNotionResults(results || []);
  } catch (e) {
    console.error('Notion search failed:', e);
    await window.api.confirmAction(
      `Search failed: ${String(e)}`,
      { title: 'Notion Error', kind: 'warning', okLabel: 'OK', cancelLabel: 'Dismiss' }
    );
  }
}

async function handleNotionSync() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab || !tab.notionPageId) return;
  setNotionSyncBusy(true);
  try {
    let remote;
    try {
      remote = await window.api.notionPullPage(tab.notionPageId);
    } catch (e) {
      console.error('Notion pull failed:', e);
      await window.api.confirmAction(
        `Could not read remote Notion page for sync: ${String(e)}`,
        { title: 'Sync Failed', kind: 'warning', okLabel: 'OK', cancelLabel: 'Dismiss' }
      );
      return;
    }

    const remoteContent = remote.content || '';
    const baseContent = tab.notionLastSyncedContent || '';
    const mineContent = view.state.doc.toString();
    const remoteChanged = remoteContent !== baseContent;
    const localChanged = mineContent !== baseContent;

    if (remoteChanged && !localChanged) {
      setActiveTabState({
        content: remoteContent,
        dirty: false,
        lastSavedContent: tab.lastSavedContent || '',
        hasExternalChange: tab.hasExternalChange || false,
        notionLastSyncedContent: remoteContent,
        notionHasExternalChange: false,
        notionLastEditedTime: remote.lastEditedTime || null,
        notionPageTitle: remote.title || tab.notionPageTitle || 'Untitled',
      });
      return;
    }

    if (!localChanged) {
      tab.notionHasExternalChange = false;
      updateNotionButtons();
      renderTabBar();
      scheduleSessionSave();
      return;
    }

    if (remoteChanged) {
      const merge = threeWayMerge(baseContent, mineContent, remoteContent);
      tab.notionHasExternalChange = true;
      updateNotionButtons();
      renderTabBar();
      scheduleSessionSave();

      if (!merge.hasConflicts) {
        try {
          const pushed = await window.api.notionPushPage(tab.notionPageId, merge.mergedText);
          setActiveTabState({
            content: merge.mergedText,
            dirty: false,
            lastSavedContent: tab.lastSavedContent || '',
            hasExternalChange: false,
            notionLastSyncedContent: merge.mergedText,
            notionHasExternalChange: false,
            notionLastEditedTime: pushed.lastEditedTime || null,
            notionPageTitle: pushed.title || remote.title || tab.notionPageTitle || 'Untitled',
          });
        } catch (e) {
          console.error('Notion push after auto-merge failed:', e);
          await window.api.confirmAction(
            `Could not push merged changes to Notion: ${String(e)}`,
            { title: 'Push Failed', kind: 'warning', okLabel: 'OK', cancelLabel: 'Dismiss' }
          );
        }
        return;
      }

      const doMerge = await window.api.confirmAction(
        'Conflicting changes were detected between local edits and Notion. Merge into the editor?',
        { title: 'External Changes Detected', kind: 'warning', okLabel: 'Merge Changes', cancelLabel: 'More Options' }
      );
      if (doMerge) {
        setActiveTabState({
          content: merge.mergedText,
          dirty: true,
          lastSavedContent: tab.lastSavedContent || '',
          hasExternalChange: tab.hasExternalChange || false,
          notionLastSyncedContent: remoteContent,
          notionHasExternalChange: false,
          notionLastEditedTime: remote.lastEditedTime || null,
          notionPageTitle: remote.title || tab.notionPageTitle || 'Untitled',
        });
        return;
      }

      const doOverwrite = await window.api.confirmAction(
        'Overwrite Notion changes with your current local content?',
        { title: 'Sync Options', kind: 'warning', okLabel: 'Overwrite', cancelLabel: 'Cancel' }
      );
      if (!doOverwrite) return;
    }

    try {
      const pushed = await window.api.notionPushPage(tab.notionPageId, mineContent);
      setActiveTabState({
        content: mineContent,
        dirty: false,
        lastSavedContent: tab.lastSavedContent || '',
        hasExternalChange: false,
        notionLastSyncedContent: mineContent,
        notionHasExternalChange: false,
        notionLastEditedTime: pushed.lastEditedTime || null,
        notionPageTitle: pushed.title || tab.notionPageTitle || 'Untitled',
      });
    } catch (e) {
      console.error('Notion push failed:', e);
      await window.api.confirmAction(
        `Could not push changes to Notion: ${String(e)}`,
        { title: 'Push Failed', kind: 'warning', okLabel: 'OK', cancelLabel: 'Dismiss' }
      );
    }
  } finally {
    setNotionSyncBusy(false);
  }
}

notionCloseBtn.addEventListener('click', () => {
  if (notionImportInProgress) return;
  notionModal.classList.remove('visible');
});
notionModal.addEventListener('click', (e) => {
  if (notionImportInProgress) return;
  if (e.target === notionModal) notionModal.classList.remove('visible');
});

notionTokenCloseBtn.addEventListener('click', () => notionTokenModal.classList.remove('visible'));
notionTokenModal.addEventListener('click', (e) => {
  if (e.target === notionTokenModal) notionTokenModal.classList.remove('visible');
});

notionTokenConnectBtn.addEventListener('click', async () => {
  const token = notionTokenInput.value.trim();
  if (!token) return;
  try {
    await window.api.notionConnect(token);
    notionTokenInput.value = '';
    notionTokenModal.classList.remove('visible');
    await refreshNotionAuthStatus();
  } catch (e) {
    console.error('Notion connect failed:', e);
    await window.api.confirmAction(
      `Connection failed: ${String(e)}`,
      { title: 'Notion Error', kind: 'warning', okLabel: 'OK', cancelLabel: 'Dismiss' }
    );
  }
});

notionConnectCtaBtn.addEventListener('click', () => {
  notionTokenInput.value = '';
  notionTokenModal.classList.add('visible');
  notionTokenInput.focus();
});

notionDisconnectBtn.addEventListener('click', async () => {
  try {
    await window.api.notionDisconnect();
    await refreshNotionAuthStatus();
    renderNotionResults([]);
  } catch (e) {
    console.error('Notion disconnect failed:', e);
  }
});

notionSearchBtn.addEventListener('click', handleNotionSearch);
notionSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleNotionSearch();
  }
});

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
    active.notionPageId = null;
    active.notionPageTitle = null;
    active.notionLastSyncedContent = '';
    active.notionLastEditedTime = null;
    active.notionHasExternalChange = false;
    currentFilePath = result.filePath;
    isDirty = false;
    window.api.setDocumentEdited(false);
    updateTitle();
    if (layoutMode === 'split' && rightPaneContent === 'diff') {
      scheduleDiffRender();
    } else {
      renderPreviewImmediate(result.content);
    }
    renderTabBar();
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
  if (!currentFilePath && tab?.notionPageId) {
    await handleNotionSync();
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
        renderTabBar();
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
    renderTabBar();
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
    renderTabBar();
    scheduleSessionSave();
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
  sessionSaveTimer = setTimeout(saveSession, 2000);
}

function saveSession() {
  snapshotCurrentTab();
  const data = {
    tabs: tabs.map(t => ({
      id: t.id,
      filePath: t.filePath,
      content: t.editorState ? t.editorState.doc.toString() : (t.content || ''),
      isDirty: t.isDirty,
      hasExternalChange: Boolean(t.hasExternalChange),
      notionPageId: t.notionPageId || null,
      notionPageTitle: t.notionPageTitle || null,
      notionLastSyncedContent: t.notionLastSyncedContent || '',
      notionLastEditedTime: t.notionLastEditedTime || null,
      notionHasExternalChange: Boolean(t.notionHasExternalChange),
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
    notionPageId: t.notionPageId || null,
    notionPageTitle: t.notionPageTitle || null,
    notionLastSyncedContent: t.notionLastSyncedContent ?? '',
    notionLastEditedTime: t.notionLastEditedTime ?? null,
    notionHasExternalChange: Boolean(t.notionHasExternalChange),
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
  renderTabBar();
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
    case 'resetSettings': resetAllSettings(); break;
    case 'checkForUpdates': window.api.checkForUpdates(true); break;
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

divider.addEventListener('mousedown', (e) => {
  isDragging = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const rect = container.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  const clamped = Math.max(0.2, Math.min(0.8, ratio));
  container.style.gridTemplateColumns = `${clamped}fr auto ${1 - clamped}fr`;
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
const diffContent = document.getElementById('diffContent');
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
    destroyDiff(diffContent);
    diffContent.style.display = 'none';
    previewContent.style.display = '';
  } else {
    // Split mode — restore saved divider ratio
    const r = savedDividerRatio;
    container.style.gridTemplateColumns = `${r}fr auto ${1 - r}fr`;

    if (rightPane === 'preview') {
      diffContent.style.display = 'none';
      previewContent.style.display = '';
      const { destroyDiff } = await import('./diff-view.js');
      destroyDiff(diffContent);
      renderPreviewImmediate(view.state.doc.toString());
    } else {
      // diff
      previewContent.style.display = 'none';
      diffContent.style.display = '';
      // Render diff
      const { renderDiff, getDiffBase } = await import('./diff-view.js');
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) {
        const baseText = getDiffBase(tab);
        const currentText = view.state.doc.toString();
        renderDiff(currentText, baseText, diffContent);
      }
    }
  }
}

// Layout buttons: set layout mode
layoutBtns.forEach(btn => {
  btn.addEventListener('click', () => applyView(btn.dataset.layout, rightPaneContent));
});

// Right-pane buttons: set content type and flip to split if in single mode
rightBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const newRight = btn.dataset.right;
    // If already in split+this, toggle to single
    if (layoutMode === 'split' && rightPaneContent === newRight) {
      applyView('single', rightPaneContent);
    } else {
      applyView('split', newRight);
    }
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
  await window.api.normalizeWebviewZoom();

  const restored = await restoreSession();
  if (!restored) {
    const tab = createTab(null, '');
    activeTabId = tab.id;
    currentFilePath = null;
    isDirty = false;
    updateTitle();
    renderTabBar();
  }

  applyView(layoutMode, rightPaneContent);
  await refreshNotionAuthStatus();

  window.api.showWindow();

  performance.mark('editor-ready');
  performance.measure('startup', 'startup-begin', 'editor-ready');

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
