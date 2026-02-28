// Compact unified diff view — HTML-based, no CodeMirror dependency
// Renders only changed hunks with context lines and line numbers

import { computeUnifiedDiff } from './diff-engine.js';

/**
 * Get the base content to diff against.
 * Uses lastSavedContent — shows changes since open/save, not git history.
 */
export function getDiffBase(tab) {
  return tab.lastSavedContent || '';
}

/**
 * Render a compact unified diff into the container.
 * @param {string} currentText - current editor content
 * @param {string} baseText - base content to diff against
 * @param {HTMLElement} container - target DOM element
 */
export function renderDiff(currentText, baseText, container) {
  container.replaceChildren();

  const hunks = computeUnifiedDiff(baseText, currentText, 3);

  if (hunks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'diff-empty';
    empty.textContent = 'No changes';
    container.appendChild(empty);
    return;
  }

  const oldLines = baseText.split('\n');
  const newLines = currentText.split('\n');
  let prevHunkEnd = 0; // track old-line index of previous hunk end

  hunks.forEach((hunk, hunkIdx) => {
    // Collapsed separator between hunks
    if (hunkIdx > 0) {
      const gapStart = prevHunkEnd;
      const gapEnd = hunk.oldStart - 1;
      const gapCount = gapEnd - gapStart;
      if (gapCount > 0) {
        const collapse = document.createElement('div');
        collapse.className = 'diff-collapse';
        collapse.textContent = `\u00b7\u00b7\u00b7 ${gapCount} unchanged line${gapCount !== 1 ? 's' : ''} \u00b7\u00b7\u00b7`;
        container.appendChild(collapse);
      }
    }

    // Hunk header
    const header = document.createElement('div');
    header.className = 'diff-hunk-header';
    const oldCount = hunk.lines.filter(l => l.type === 'context' || l.type === 'remove').length;
    const newCount = hunk.lines.filter(l => l.type === 'context' || l.type === 'add').length;
    header.textContent = `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`;
    container.appendChild(header);

    // Hunk lines
    const hunkEl = document.createElement('div');
    hunkEl.className = 'diff-hunk';

    for (const line of hunk.lines) {
      const row = document.createElement('div');
      row.className = 'diff-line diff-' + line.type;

      const oldNum = document.createElement('span');
      oldNum.className = 'diff-line-num';
      oldNum.textContent = line.oldLine != null ? String(line.oldLine) : '';

      const newNum = document.createElement('span');
      newNum.className = 'diff-line-num';
      newNum.textContent = line.newLine != null ? String(line.newLine) : '';

      const prefix = document.createElement('span');
      prefix.className = 'diff-line-prefix';
      prefix.textContent = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

      const text = document.createElement('span');
      text.className = 'diff-line-text';
      text.textContent = line.text;

      row.appendChild(oldNum);
      row.appendChild(newNum);
      row.appendChild(prefix);
      row.appendChild(text);
      hunkEl.appendChild(row);
    }

    container.appendChild(hunkEl);

    // Track where this hunk ends (old-line-wise) for gap calculation
    const lastOldLine = hunk.lines.filter(l => l.oldLine != null).pop();
    prevHunkEnd = lastOldLine ? lastOldLine.oldLine : hunk.oldStart;
  });
}

/**
 * Clear diff content from container.
 */
export function destroyDiff(container) {
  if (container) {
    container.replaceChildren();
  }
}
