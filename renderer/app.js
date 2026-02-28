import { EditorView, keymap, highlightActiveLine, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language';
import { closeBrackets } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';
import markdownIt from 'markdown-it';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

// ===== Markdown renderer =====

const md = markdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (_) {}
    }
    return '';
  },
});

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
let currentViewMode = localStorage.getItem('cogmd-view-mode') || 'split';

// ===== Tab Model =====

let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let isTabSwitching = false;

// ===== Editor Setup =====

const previewEl = document.getElementById('previewContent');
const editorPane = document.getElementById('editorPane');
const themeToggle = document.getElementById('themeToggle');
const copyBtn = document.getElementById('copyBtn');
const modeBtns = document.querySelectorAll('.mode-btn');

function makeExtensions() {
  return [
    themeCompartment.of(getThemeExtensions(currentTheme === 'dark')),
    fontSizeCompartment.of(makeFontSizeTheme(currentFontSize)),
    markdown({ codeLanguages: languages }),
    history(),
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
          // Only re-render tab bar when dirty state changes
          if (!wasDirty) renderTabBar();
        }
        window.api.setDocumentEdited(true);
        updateTitle();
        renderPreview(update.state.doc.toString());
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

// ===== Preview =====

function renderPreview(text) {
  const rawHtml = md.render(text);
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ['input'],
    ADD_ATTR: ['type', 'checked', 'disabled'],
  });
  previewEl.innerHTML = cleanHtml;
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
}

document.getElementById('fontDecrease').addEventListener('click', () => applyFontSize(currentFontSize - 1));
document.getElementById('fontIncrease').addEventListener('click', () => applyFontSize(currentFontSize + 1));

// Set initial preview font size
previewEl.style.fontSize = (currentFontSize + 1) + 'px';

// ===== Copy Button =====

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(view.state.doc.toString());
  copyBtn.classList.add('copied');
  setTimeout(() => copyBtn.classList.remove('copied'), 1500);
});

// ===== Title =====

function updateTitle() {
  const name = currentFilePath
    ? currentFilePath.split('/').pop()
    : 'Untitled';
  const prefix = isDirty ? '● ' : '';
  window.api.setTitle(`${prefix}${name} — CogMD`);
}

// ===== Tab Core Functions =====

function getTabName(tab) {
  return tab.filePath ? tab.filePath.split('/').pop() : 'Untitled';
}

function snapshotCurrentTab() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  tab.editorState = view.state;
  tab.content = view.state.doc.toString();
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

  // Use setState for full state swap (preserves per-tab undo history)
  if (tab.editorState) {
    view.setState(tab.editorState);
    // Sync compartments to current global settings (theme/font may have changed)
    view.dispatch({
      effects: [
        themeCompartment.reconfigure(getThemeExtensions(currentTheme === 'dark')),
        fontSizeCompartment.reconfigure(makeFontSizeTheme(currentFontSize)),
      ],
    });
  } else {
    // First activation — create fresh state from content
    view.setState(makeEditorState(tab.content));
  }

  isTabSwitching = false;

  activeTabId = tabId;
  currentFilePath = tab.filePath;
  isDirty = tab.isDirty;
  window.api.setDocumentEdited(isDirty);
  updateTitle();
  renderPreview(tab.content);
  renderTabBar();

  // Scroll active tab into view
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
    scrollTop: 0,
    selectionMain: { anchor: 0, head: 0 },
  };
  tabs.push(tab);
  return tab;
}

function closeTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  if (tabId === activeTabId) snapshotCurrentTab();

  if (tab.isDirty) {
    if (!confirm(`"${getTabName(tab)}" has unsaved changes. Close anyway?`)) return;
  }

  const idx = tabs.indexOf(tab);
  tabs.splice(idx, 1);

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
    btn.className = 'tab' + (tab.id === activeTabId ? ' active' : '') + (tab.isDirty ? ' dirty' : '');
    btn.dataset.tabId = tab.id;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = getTabName(tab);
    btn.appendChild(nameSpan);

    const dirtyDot = document.createElement('span');
    dirtyDot.className = 'tab-dirty';
    btn.appendChild(dirtyDot);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    // Safe: static SVG content, no user data
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

// Horizontal wheel scroll for tabs
tabBar.addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault();
    tabBar.scrollLeft += e.deltaY;
  }
}, { passive: false });

// ===== File Ops =====

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
    isTabSwitching = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: result.content } });
    isTabSwitching = false;
    active.filePath = result.filePath;
    active.content = result.content;
    currentFilePath = result.filePath;
    isDirty = false;
    window.api.setDocumentEdited(false);
    updateTitle();
    renderPreview(result.content);
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
  if (currentFilePath) {
    await window.api.saveFile(currentFilePath, content);
    isDirty = false;
    if (tab) tab.isDirty = false;
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
    }
    window.api.setDocumentEdited(false);
    updateTitle();
    renderTabBar();
    scheduleSessionSave();
  }
}

// ===== Session Persistence =====

let sessionSaveTimer = null;

function scheduleSessionSave() {
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(saveSession, 500);
}

function saveSession() {
  snapshotCurrentTab();
  const data = {
    tabs: tabs.map(t => ({
      id: t.id,
      filePath: t.filePath,
      content: t.content,
      isDirty: t.isDirty,
      scrollTop: t.scrollTop,
      selectionMain: t.selectionMain,
    })),
    activeTabId,
    nextTabId,
  };
  try {
    localStorage.setItem('cogmd-session', JSON.stringify(data));
  } catch (e) {
    // localStorage quota exceeded — silently fail
  }
}

function restoreSession() {
  const raw = localStorage.getItem('cogmd-session');
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    if (!data.tabs || data.tabs.length === 0) return false;
    tabs = data.tabs;
    nextTabId = data.nextTabId || (Math.max(...tabs.map(t => t.id)) + 1);

    const targetId = data.activeTabId || tabs[0].id;
    const tab = tabs.find(t => t.id === targetId) || tabs[0];

    // Create a fresh EditorState for the restored tab (with undo history starting clean)
    isTabSwitching = true;
    const state = makeEditorState(tab.content);
    view.setState(state);
    isTabSwitching = false;

    activeTabId = tab.id;
    currentFilePath = tab.filePath;
    isDirty = tab.isDirty;
    window.api.setDocumentEdited(isDirty);
    updateTitle();
    renderPreview(tab.content);
    renderTabBar();

    requestAnimationFrame(() => {
      view.scrollDOM.scrollTop = tab.scrollTop || 0;
    });

    return true;
  } catch (e) {
    return false;
  }
}

// ===== Reset Settings =====

function resetAllSettings() {
  if (!confirm('Reset all settings to defaults? This will clear your tabs and preferences.')) return;
  localStorage.removeItem('cogmd-theme');
  localStorage.removeItem('cogmd-font-size');
  localStorage.removeItem('cogmd-view-mode');
  localStorage.removeItem('cogmd-session');
  location.reload();
}

// ===== Menu Actions =====

window.api.onMenuAction((action) => {
  switch (action) {
    case 'new': handleNew(); break;
    case 'open': handleOpen(); break;
    case 'save': handleSave(); break;
    case 'saveAs': handleSaveAs(); break;
    case 'closeTab': closeTab(activeTabId); break;
    case 'nextTab': cycleTab(1); break;
    case 'prevTab': cycleTab(-1); break;
    case 'toggleTheme': {
      const next = { auto: 'light', light: 'dark', dark: 'auto' };
      applyTheme(next[themeMode]);
      break;
    }
    case 'viewEditor': applyViewMode('editor'); break;
    case 'viewSplit': applyViewMode('split'); break;
    case 'viewPreview': applyViewMode('preview'); break;
    case 'fontIncrease': applyFontSize(currentFontSize + 1); break;
    case 'fontDecrease': applyFontSize(currentFontSize - 1); break;
    case 'fontReset': applyFontSize(FONT_SIZE_DEFAULT); break;
    case 'resetSettings': resetAllSettings(); break;
    case 'checkForUpdates': window.api.checkForUpdates(); break;
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

// ===== Auto-Update =====

window.api.onUpdateNotAvailable(() => {
  alert('You\'re up to date!');
});

window.api.onUpdateDownloaded(() => {
  if (confirm('A new update is ready. Restart now to install?')) {
    window.api.installUpdate();
  }
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
  }
});

// ===== View Mode System =====

const previewPane = document.querySelector('.preview-pane');

function applyViewMode(mode) {
  if (mode !== 'editor' && mode !== 'split' && mode !== 'preview') mode = 'split';
  currentViewMode = mode;
  localStorage.setItem('cogmd-view-mode', mode);

  // Update active button
  modeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Reset visibility
  editorPane.style.display = '';
  divider.style.display = '';
  previewPane.style.display = '';

  if (mode === 'split') {
    container.style.gridTemplateColumns = '1fr auto 1fr';
  } else if (mode === 'preview') {
    editorPane.style.display = 'none';
    divider.style.display = 'none';
    container.style.gridTemplateColumns = '1fr';
  } else {
    divider.style.display = 'none';
    previewPane.style.display = 'none';
    container.style.gridTemplateColumns = '1fr';
  }
}

// Mode toggle click handlers
modeBtns.forEach(btn => {
  btn.addEventListener('click', () => applyViewMode(btn.dataset.mode));
});

// ===== Startup =====

// Restore session or create initial tab
if (!restoreSession()) {
  const tab = createTab(null, '');
  activeTabId = tab.id;
  currentFilePath = null;
  isDirty = false;
  updateTitle();
  renderTabBar();
}

// Apply saved mode on startup
applyViewMode(currentViewMode);

// Dismiss splash screen
requestAnimationFrame(() => {
  const splash = document.getElementById('splash');
  splash.classList.add('hidden');
  setTimeout(() => splash.remove(), 300);
});
