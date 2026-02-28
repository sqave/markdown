// Pure unified-diff computation (Myers / LCS-based)
// No external dependencies

/**
 * Compute a unified diff between two texts.
 * @param {string} oldText
 * @param {string} newText
 * @param {number} contextLines - lines of context around each change
 * @returns {Array<{oldStart: number, newStart: number, lines: Array<{type: 'context'|'add'|'remove', text: string, oldLine?: number, newLine?: number}>}>}
 */
export function computeUnifiedDiff(oldText, newText, contextLines = 3) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Build edit script via LCS
  const ops = diffLines(oldLines, newLines);

  // Group into hunks with context
  return buildHunks(ops, oldLines, newLines, contextLines);
}

/**
 * Compute line-level edit operations using an O(ND) Myers-like approach.
 * Returns array of { type: 'equal'|'insert'|'delete', oldIdx?, newIdx? }
 */
function diffLines(oldLines, newLines) {
  const oldLen = oldLines.length;
  const newLen = newLines.length;

  // Fast path: identical
  if (oldLen === newLen) {
    let same = true;
    for (let i = 0; i < oldLen; i++) {
      if (oldLines[i] !== newLines[i]) { same = false; break; }
    }
    if (same) {
      return oldLines.map((_, i) => ({ type: 'equal', oldIdx: i, newIdx: i }));
    }
  }

  // LCS via Hunt-Szymanski / simple DP for reasonable sizes
  // For large files, use a diagonal-based approach
  const lcs = computeLCS(oldLines, newLines);

  // Build ops from LCS
  const ops = [];
  let oi = 0, ni = 0, li = 0;

  while (oi < oldLen || ni < newLen) {
    if (li < lcs.length && oi === lcs[li][0] && ni === lcs[li][1]) {
      ops.push({ type: 'equal', oldIdx: oi, newIdx: ni });
      oi++; ni++; li++;
    } else if (li < lcs.length) {
      // Emit deletes then inserts until we reach the next LCS pair
      while (oi < lcs[li][0]) {
        ops.push({ type: 'delete', oldIdx: oi });
        oi++;
      }
      while (ni < lcs[li][1]) {
        ops.push({ type: 'insert', newIdx: ni });
        ni++;
      }
    } else {
      // Past LCS — remaining lines
      while (oi < oldLen) {
        ops.push({ type: 'delete', oldIdx: oi });
        oi++;
      }
      while (ni < newLen) {
        ops.push({ type: 'insert', newIdx: ni });
        ni++;
      }
    }
  }

  return ops;
}

/**
 * Compute LCS indices using standard DP.
 * Returns array of [oldIdx, newIdx] pairs.
 */
function computeLCS(oldLines, newLines) {
  const oldLen = oldLines.length;
  const newLen = newLines.length;

  // For very large files, skip DP and treat everything as changed
  if (oldLen * newLen > 10_000_000) {
    return computeLCSDiagonal(oldLines, newLines);
  }

  // Standard DP table (space-optimized: 2 rows)
  let prev = new Uint32Array(newLen + 1);
  let curr = new Uint32Array(newLen + 1);

  // We need to reconstruct, so keep full table for backtracking
  const dp = [];
  for (let i = 0; i <= oldLen; i++) {
    dp.push(new Uint32Array(newLen + 1));
  }

  for (let i = 1; i <= oldLen; i++) {
    for (let j = 1; j <= newLen; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const result = [];
  let i = oldLen, j = newLen;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      result.push([i - 1, j - 1]);
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  result.reverse();
  return result;
}

/**
 * Fallback LCS for large files using a greedy/diagonal approach.
 * Less optimal but avoids O(n*m) memory.
 */
function computeLCSDiagonal(oldLines, newLines) {
  const result = [];
  const oldLen = oldLines.length;
  const newLen = newLines.length;

  // Build index of new lines for quick lookup
  const newIndex = new Map();
  for (let j = 0; j < newLen; j++) {
    if (!newIndex.has(newLines[j])) newIndex.set(newLines[j], []);
    newIndex.get(newLines[j]).push(j);
  }

  // Patience-like: match unique lines first, then fill in
  let lastJ = -1;
  for (let i = 0; i < oldLen; i++) {
    const positions = newIndex.get(oldLines[i]);
    if (!positions) continue;
    // Find first position > lastJ (greedy LCS)
    for (const j of positions) {
      if (j > lastJ) {
        result.push([i, j]);
        lastJ = j;
        break;
      }
    }
  }

  return result;
}

/**
 * Build hunks from edit operations with context lines.
 */
function buildHunks(ops, oldLines, newLines, contextLines) {
  // Find change ranges (non-equal ops)
  const changes = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type !== 'equal') {
      const start = i;
      while (i < ops.length && ops[i].type !== 'equal') i++;
      changes.push([start, i - 1]);
      i--; // back up since for loop will increment
    }
  }

  if (changes.length === 0) return [];

  // Merge nearby changes into hunks
  const hunkRanges = [];
  let currentStart = Math.max(0, changes[0][0] - contextLines);
  let currentEnd = Math.min(ops.length - 1, changes[0][1] + contextLines);

  for (let c = 1; c < changes.length; c++) {
    const nextStart = Math.max(0, changes[c][0] - contextLines);
    const nextEnd = Math.min(ops.length - 1, changes[c][1] + contextLines);

    if (nextStart <= currentEnd + 1) {
      // Merge
      currentEnd = nextEnd;
    } else {
      hunkRanges.push([currentStart, currentEnd]);
      currentStart = nextStart;
      currentEnd = nextEnd;
    }
  }
  hunkRanges.push([currentStart, currentEnd]);

  // Build hunk objects
  const hunks = [];
  for (const [start, end] of hunkRanges) {
    const lines = [];
    let oldStart = null, newStart = null;

    for (let i = start; i <= end; i++) {
      const op = ops[i];
      if (op.type === 'equal') {
        if (oldStart === null) oldStart = op.oldIdx + 1;
        if (newStart === null) newStart = op.newIdx + 1;
        lines.push({ type: 'context', text: oldLines[op.oldIdx], oldLine: op.oldIdx + 1, newLine: op.newIdx + 1 });
      } else if (op.type === 'delete') {
        if (oldStart === null) oldStart = op.oldIdx + 1;
        if (newStart === null) {
          // Look ahead for an insert or equal to find newStart
          for (let j = i + 1; j <= end; j++) {
            if (ops[j].newIdx !== undefined) { newStart = ops[j].newIdx + 1; break; }
          }
          if (newStart === null) newStart = newLines.length + 1;
        }
        lines.push({ type: 'remove', text: oldLines[op.oldIdx], oldLine: op.oldIdx + 1 });
      } else if (op.type === 'insert') {
        if (newStart === null) newStart = op.newIdx + 1;
        if (oldStart === null) {
          for (let j = i + 1; j <= end; j++) {
            if (ops[j].oldIdx !== undefined) { oldStart = ops[j].oldIdx + 1; break; }
          }
          if (oldStart === null) oldStart = oldLines.length + 1;
        }
        lines.push({ type: 'add', text: newLines[op.newIdx], newLine: op.newIdx + 1 });
      }
    }

    hunks.push({ oldStart: oldStart || 1, newStart: newStart || 1, lines });
  }

  return hunks;
}
