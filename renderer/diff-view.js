// Diff/Compare View — lazy-loaded CodeMirror MergeView
// Compares current editor content against git HEAD or last save

import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { MergeView } from '@codemirror/merge';

let mergeView = null;
let diffContainer = null;

export function isDiffActive() {
  return mergeView !== null;
}

export async function showDiff(currentContent, originalContent, isDark, container) {
  destroyDiff();

  diffContainer = container;
  container.style.display = '';

  const theme = EditorView.theme({
    '&': { height: '100%' },
    '.cm-content': {
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: '10px',
      lineHeight: '1.6',
    },
    '.cm-gutters': { display: 'none' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
    },
    '.cm-changedLine': {
      backgroundColor: isDark ? 'rgba(67, 164, 114, 0.08)' : 'rgba(67, 164, 114, 0.06)',
    },
    '.cm-changedText': {
      backgroundColor: isDark ? 'rgba(67, 164, 114, 0.2)' : 'rgba(67, 164, 114, 0.15)',
    },
    '.cm-deletedChunk': {
      backgroundColor: isDark ? 'rgba(255, 100, 100, 0.08)' : 'rgba(255, 100, 100, 0.06)',
    },
  }, { dark: isDark });

  mergeView = new MergeView({
    a: {
      doc: originalContent,
      extensions: [
        theme,
        EditorView.editable.of(false),
        EditorView.lineWrapping,
      ],
    },
    b: {
      doc: currentContent,
      extensions: [
        theme,
        EditorView.editable.of(false),
        EditorView.lineWrapping,
      ],
    },
    parent: container,
    highlightChanges: true,
    gutter: true,
  });
}

export function destroyDiff() {
  if (mergeView) {
    mergeView.destroy();
    mergeView = null;
  }
  if (diffContainer) {
    diffContainer.replaceChildren();
    diffContainer.style.display = 'none';
    diffContainer = null;
  }
}

export async function getGitContent(filePath) {
  if (!filePath || !window.api.gitShow) return null;
  try {
    return await window.api.gitShow(filePath);
  } catch (_) {
    return null;
  }
}
