// Lightweight line-based three-way merge with conflict markers.
// base: last saved content, mine: current editor content, theirs: disk content.

export function threeWayMerge(baseText, mineText, theirsText) {
  const base = baseText.split('\n');
  const mine = mineText.split('\n');
  const theirs = theirsText.split('\n');

  const mineEdits = buildEdits(base, mine);
  const theirEdits = buildEdits(base, theirs);

  const merged = [];
  let conflictCount = 0;
  let pos = 0;
  let mi = 0;
  let ti = 0;

  while (pos <= base.length) {
    const mineAtPos = mi < mineEdits.length && mineEdits[mi].start === pos;
    const theirsAtPos = ti < theirEdits.length && theirEdits[ti].start === pos;

    if (!mineAtPos && !theirsAtPos) {
      if (pos < base.length) {
        merged.push(base[pos]);
      }
      pos += 1;
      continue;
    }

    const regionStart = pos;
    let regionEnd = pos;
    let mineEndIdx = mi;
    let theirsEndIdx = ti;

    if (mineAtPos) {
      regionEnd = Math.max(regionEnd, mineEdits[mineEndIdx].end);
      mineEndIdx += 1;
    }
    if (theirsAtPos) {
      regionEnd = Math.max(regionEnd, theirEdits[theirsEndIdx].end);
      theirsEndIdx += 1;
    }

    if (regionEnd > regionStart) {
      let expanded = true;
      while (expanded) {
        expanded = false;
        while (mineEndIdx < mineEdits.length && mineEdits[mineEndIdx].start < regionEnd) {
          regionEnd = Math.max(regionEnd, mineEdits[mineEndIdx].end);
          mineEndIdx += 1;
          expanded = true;
        }
        while (theirsEndIdx < theirEdits.length && theirEdits[theirsEndIdx].start < regionEnd) {
          regionEnd = Math.max(regionEnd, theirEdits[theirsEndIdx].end);
          theirsEndIdx += 1;
          expanded = true;
        }
      }
    } else {
      while (mineEndIdx < mineEdits.length && mineEdits[mineEndIdx].start === regionStart && mineEdits[mineEndIdx].end === regionStart) {
        mineEndIdx += 1;
      }
      while (theirsEndIdx < theirEdits.length && theirEdits[theirsEndIdx].start === regionStart && theirEdits[theirsEndIdx].end === regionStart) {
        theirsEndIdx += 1;
      }
    }

    const mineRegion = applyEditsToRange(base, mineEdits.slice(mi, mineEndIdx), regionStart, regionEnd);
    const theirRegion = applyEditsToRange(base, theirEdits.slice(ti, theirsEndIdx), regionStart, regionEnd);
    const baseRegion = base.slice(regionStart, regionEnd);

    if (linesEqual(mineRegion, theirRegion)) {
      merged.push(...mineRegion);
    } else if (linesEqual(mineRegion, baseRegion)) {
      merged.push(...theirRegion);
    } else if (linesEqual(theirRegion, baseRegion)) {
      merged.push(...mineRegion);
    } else {
      conflictCount += 1;
      merged.push('<<<<<<< MINE');
      merged.push(...mineRegion);
      merged.push('=======');
      merged.push(...theirRegion);
      merged.push('>>>>>>> THEIRS');
    }

    mi = mineEndIdx;
    ti = theirsEndIdx;
    if (regionEnd > regionStart) {
      pos = regionEnd;
    }
  }

  return {
    mergedText: merged.join('\n'),
    hasConflicts: conflictCount > 0,
    conflictCount,
  };
}

function buildEdits(baseLines, variantLines) {
  const ops = diffOps(baseLines, variantLines);
  const edits = [];
  let bi = 0;

  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type === 'equal') {
      bi += 1;
      continue;
    }

    const start = bi;
    const replacement = [];

    while (i < ops.length && ops[i].type !== 'equal') {
      const op = ops[i];
      if (op.type === 'delete') {
        bi += 1;
      } else if (op.type === 'insert') {
        replacement.push(variantLines[op.newIdx]);
      }
      i += 1;
    }

    edits.push({ start, end: bi, replacement });
    i -= 1;
  }

  return edits;
}

function applyEditsToRange(baseLines, edits, start, end) {
  const out = [];
  let cursor = start;

  for (const edit of edits) {
    if (edit.start > cursor) {
      out.push(...baseLines.slice(cursor, edit.start));
    }
    out.push(...edit.replacement);
    cursor = edit.end;
  }

  if (cursor < end) {
    out.push(...baseLines.slice(cursor, end));
  }

  return out;
}

function linesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function diffOps(oldLines, newLines) {
  const oldLen = oldLines.length;
  const newLen = newLines.length;

  if (oldLen === newLen) {
    let same = true;
    for (let i = 0; i < oldLen; i++) {
      if (oldLines[i] !== newLines[i]) {
        same = false;
        break;
      }
    }
    if (same) {
      return oldLines.map((_, i) => ({ type: 'equal', oldIdx: i, newIdx: i }));
    }
  }

  const lcs = computeLCS(oldLines, newLines);
  const ops = [];
  let oi = 0;
  let ni = 0;
  let li = 0;

  while (oi < oldLen || ni < newLen) {
    if (li < lcs.length && oi === lcs[li][0] && ni === lcs[li][1]) {
      ops.push({ type: 'equal', oldIdx: oi, newIdx: ni });
      oi += 1;
      ni += 1;
      li += 1;
    } else if (li < lcs.length) {
      while (oi < lcs[li][0]) {
        ops.push({ type: 'delete', oldIdx: oi });
        oi += 1;
      }
      while (ni < lcs[li][1]) {
        ops.push({ type: 'insert', newIdx: ni });
        ni += 1;
      }
    } else {
      while (oi < oldLen) {
        ops.push({ type: 'delete', oldIdx: oi });
        oi += 1;
      }
      while (ni < newLen) {
        ops.push({ type: 'insert', newIdx: ni });
        ni += 1;
      }
    }
  }

  return ops;
}

function computeLCS(oldLines, newLines) {
  const oldLen = oldLines.length;
  const newLen = newLines.length;
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

  const result = [];
  let i = oldLen;
  let j = newLen;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      result.push([i - 1, j - 1]);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  result.reverse();
  return result;
}
