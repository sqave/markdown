import { describe, it, expect } from 'vitest';
import { computeUnifiedDiff } from './diff-engine.js';

describe('computeUnifiedDiff', () => {
  // --- Basic cases ---

  it('identical texts — returns empty array (no hunks)', () => {
    const text = 'line1\nline2\nline3';
    const result = computeUnifiedDiff(text, text);
    expect(result).toEqual([]);
  });

  it('single line changed — returns one hunk with the change', () => {
    const old = 'line1\nline2\nline3';
    const now = 'line1\nchanged\nline3';
    const result = computeUnifiedDiff(old, now);
    expect(result).toHaveLength(1);
    const hunk = result[0];
    const removes = hunk.lines.filter(l => l.type === 'remove');
    const adds = hunk.lines.filter(l => l.type === 'add');
    expect(removes).toHaveLength(1);
    expect(removes[0].text).toBe('line2');
    expect(adds).toHaveLength(1);
    expect(adds[0].text).toBe('changed');
  });

  it('single line added — returns hunk with add line', () => {
    const old = 'line1\nline3';
    const now = 'line1\nline2\nline3';
    const result = computeUnifiedDiff(old, now);
    expect(result).toHaveLength(1);
    const adds = result[0].lines.filter(l => l.type === 'add');
    expect(adds).toHaveLength(1);
    expect(adds[0].text).toBe('line2');
  });

  it('single line removed — returns hunk with remove line', () => {
    const old = 'line1\nline2\nline3';
    const now = 'line1\nline3';
    const result = computeUnifiedDiff(old, now);
    expect(result).toHaveLength(1);
    const removes = result[0].lines.filter(l => l.type === 'remove');
    expect(removes).toHaveLength(1);
    expect(removes[0].text).toBe('line2');
  });

  it('multiple changes in different locations — returns multiple hunks', () => {
    const lines = [];
    for (let i = 1; i <= 20; i++) lines.push(`line${i}`);
    const old = lines.join('\n');
    const modified = [...lines];
    modified[1] = 'changed2';   // line near top
    modified[18] = 'changed19'; // line near bottom
    const now = modified.join('\n');
    const result = computeUnifiedDiff(old, now);
    // With default context=3, these changes are far enough apart to be separate hunks
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  // --- Hunk structure ---

  it('each hunk has correct oldStart and newStart', () => {
    const old = 'a\nb\nc\nd\ne';
    const now = 'a\nb\nX\nd\ne';
    const result = computeUnifiedDiff(old, now);
    expect(result).toHaveLength(1);
    expect(result[0].oldStart).toBeDefined();
    expect(result[0].newStart).toBeDefined();
    expect(typeof result[0].oldStart).toBe('number');
    expect(typeof result[0].newStart).toBe('number');
  });

  it('lines have correct type values (context, add, remove)', () => {
    const old = 'a\nb\nc';
    const now = 'a\nX\nc';
    const result = computeUnifiedDiff(old, now);
    const types = result[0].lines.map(l => l.type);
    expect(types).toContain('context');
    expect(types).toContain('remove');
    expect(types).toContain('add');
    // No unexpected types
    for (const t of types) {
      expect(['context', 'add', 'remove']).toContain(t);
    }
  });

  it('lines have correct text content', () => {
    const old = 'alpha\nbeta\ngamma';
    const now = 'alpha\nBETA\ngamma';
    const result = computeUnifiedDiff(old, now);
    const hunk = result[0];
    const contextTexts = hunk.lines.filter(l => l.type === 'context').map(l => l.text);
    expect(contextTexts).toContain('alpha');
    expect(contextTexts).toContain('gamma');
    expect(hunk.lines.find(l => l.type === 'remove').text).toBe('beta');
    expect(hunk.lines.find(l => l.type === 'add').text).toBe('BETA');
  });

  it('context lines surround changes (default 3 lines of context)', () => {
    const lines = [];
    for (let i = 0; i < 10; i++) lines.push(`line${i}`);
    const old = lines.join('\n');
    const modified = [...lines];
    modified[5] = 'CHANGED';
    const now = modified.join('\n');
    const result = computeUnifiedDiff(old, now);
    expect(result).toHaveLength(1);
    const contextBefore = [];
    const contextAfter = [];
    let seenChange = false;
    for (const l of result[0].lines) {
      if (l.type === 'context' && !seenChange) contextBefore.push(l);
      if (l.type !== 'context') seenChange = true;
      if (l.type === 'context' && seenChange) contextAfter.push(l);
    }
    // Should have up to 3 context lines before and after
    expect(contextBefore.length).toBeLessThanOrEqual(3);
    expect(contextAfter.length).toBeLessThanOrEqual(3);
    expect(contextBefore.length).toBeGreaterThan(0);
    expect(contextAfter.length).toBeGreaterThan(0);
  });

  // --- Context lines parameter ---

  it('contextLines=0 — only shows changed lines, no context', () => {
    const old = 'a\nb\nc\nd\ne';
    const now = 'a\nb\nX\nd\ne';
    const result = computeUnifiedDiff(old, now, 0);
    expect(result).toHaveLength(1);
    const contextLines = result[0].lines.filter(l => l.type === 'context');
    expect(contextLines).toHaveLength(0);
    expect(result[0].lines.filter(l => l.type === 'remove')).toHaveLength(1);
    expect(result[0].lines.filter(l => l.type === 'add')).toHaveLength(1);
  });

  it('contextLines=1 — shows 1 line of context around changes', () => {
    const lines = [];
    for (let i = 0; i < 10; i++) lines.push(`line${i}`);
    const old = lines.join('\n');
    const modified = [...lines];
    modified[5] = 'CHANGED';
    const now = modified.join('\n');
    const result = computeUnifiedDiff(old, now, 1);
    expect(result).toHaveLength(1);
    const contextBefore = [];
    const contextAfter = [];
    let seenChange = false;
    for (const l of result[0].lines) {
      if (l.type === 'context' && !seenChange) contextBefore.push(l);
      if (l.type !== 'context') seenChange = true;
      if (l.type === 'context' && seenChange) contextAfter.push(l);
    }
    expect(contextBefore.length).toBeLessThanOrEqual(1);
    expect(contextAfter.length).toBeLessThanOrEqual(1);
  });

  it('nearby changes merge into a single hunk when context overlaps', () => {
    // Two changes separated by 2 lines, with contextLines=3 they should merge
    const old = 'a\nb\nc\nd\ne\nf\ng';
    const now = 'a\nB\nc\nd\ne\nF\ng';
    const result = computeUnifiedDiff(old, now, 3);
    // 'b' at index 1 and 'f' at index 5, separated by 3 equal lines (c,d,e)
    // context of 3 around each means they overlap and merge into one hunk
    expect(result).toHaveLength(1);

    // But with contextLines=0 they should be separate
    const result0 = computeUnifiedDiff(old, now, 0);
    expect(result0.length).toBe(2);
  });

  // --- Edge cases ---

  it('empty old text, non-empty new text — all lines are additions', () => {
    const result = computeUnifiedDiff('', 'line1\nline2\nline3');
    expect(result).toHaveLength(1);
    const adds = result[0].lines.filter(l => l.type === 'add');
    expect(adds).toHaveLength(3);
    expect(adds.map(l => l.text)).toEqual(['line1', 'line2', 'line3']);
    const removes = result[0].lines.filter(l => l.type === 'remove');
    // The empty string splits to [''], so there may be a remove for the empty line
    // or not, depending on implementation. Either way, there should be no
    // non-empty removes.
    for (const r of removes) {
      expect(r.text).toBe('');
    }
  });

  it('non-empty old text, empty new text — all lines are removals', () => {
    const result = computeUnifiedDiff('line1\nline2\nline3', '');
    expect(result).toHaveLength(1);
    const removes = result[0].lines.filter(l => l.type === 'remove');
    expect(removes).toHaveLength(3);
    expect(removes.map(l => l.text)).toEqual(['line1', 'line2', 'line3']);
    const adds = result[0].lines.filter(l => l.type === 'add');
    for (const a of adds) {
      expect(a.text).toBe('');
    }
  });

  it('both texts empty — no hunks', () => {
    const result = computeUnifiedDiff('', '');
    expect(result).toEqual([]);
  });

  it('single line documents', () => {
    const result = computeUnifiedDiff('hello', 'world');
    expect(result).toHaveLength(1);
    const removes = result[0].lines.filter(l => l.type === 'remove');
    const adds = result[0].lines.filter(l => l.type === 'add');
    expect(removes).toHaveLength(1);
    expect(removes[0].text).toBe('hello');
    expect(adds).toHaveLength(1);
    expect(adds[0].text).toBe('world');
  });

  it('moderately large input (100+ lines) — does not crash', () => {
    const oldLines = [];
    const newLines = [];
    for (let i = 0; i < 200; i++) {
      oldLines.push(`line ${i}`);
      // Change every 20th line
      if (i % 20 === 10) {
        newLines.push(`CHANGED ${i}`);
      } else {
        newLines.push(`line ${i}`);
      }
    }
    const result = computeUnifiedDiff(oldLines.join('\n'), newLines.join('\n'));
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // Each hunk should have the expected structure
    for (const hunk of result) {
      expect(hunk).toHaveProperty('oldStart');
      expect(hunk).toHaveProperty('newStart');
      expect(hunk).toHaveProperty('lines');
      expect(Array.isArray(hunk.lines)).toBe(true);
    }
  });

  // --- Line numbering ---

  it('oldLine and newLine numbers are 1-based', () => {
    const old = 'first\nsecond\nthird';
    const now = 'first\nSECOND\nthird';
    const result = computeUnifiedDiff(old, now);
    expect(result).toHaveLength(1);
    const hunk = result[0];

    // Check context lines have both oldLine and newLine
    const contextLines = hunk.lines.filter(l => l.type === 'context');
    for (const cl of contextLines) {
      expect(cl.oldLine).toBeGreaterThanOrEqual(1);
      expect(cl.newLine).toBeGreaterThanOrEqual(1);
    }

    // Check remove lines have oldLine
    const removes = hunk.lines.filter(l => l.type === 'remove');
    for (const rl of removes) {
      expect(rl.oldLine).toBeGreaterThanOrEqual(1);
    }

    // Check add lines have newLine
    const adds = hunk.lines.filter(l => l.type === 'add');
    for (const al of adds) {
      expect(al.newLine).toBeGreaterThanOrEqual(1);
    }

    // Specifically, 'first' is line 1 in both
    const firstCtx = hunk.lines.find(l => l.text === 'first');
    expect(firstCtx.oldLine).toBe(1);
    expect(firstCtx.newLine).toBe(1);

    // 'second' was old line 2, 'SECOND' is new line 2
    const removedLine = hunk.lines.find(l => l.type === 'remove' && l.text === 'second');
    expect(removedLine.oldLine).toBe(2);
    const addedLine = hunk.lines.find(l => l.type === 'add' && l.text === 'SECOND');
    expect(addedLine.newLine).toBe(2);

    // 'third' is line 3 in both
    const thirdCtx = hunk.lines.find(l => l.text === 'third');
    expect(thirdCtx.oldLine).toBe(3);
    expect(thirdCtx.newLine).toBe(3);

    // oldStart and newStart should also be 1-based
    expect(hunk.oldStart).toBe(1);
    expect(hunk.newStart).toBe(1);
  });
});
