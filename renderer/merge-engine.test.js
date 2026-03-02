import { describe, it, expect } from 'vitest';
import { threeWayMerge } from './merge-engine.js';

describe('threeWayMerge', () => {
  it('identical base/mine/theirs — no changes', () => {
    const text = 'line1\nline2\nline3';
    const result = threeWayMerge(text, text, text);
    expect(result.mergedText).toBe(text);
    expect(result.hasConflicts).toBe(false);
    expect(result.conflictCount).toBe(0);
  });

  it('only mine changed — takes mine', () => {
    const base = 'line1\nline2\nline3';
    const mine = 'line1\nmodified\nline3';
    const result = threeWayMerge(base, mine, base);
    expect(result.mergedText).toBe(mine);
    expect(result.hasConflicts).toBe(false);
  });

  it('only theirs changed — takes theirs', () => {
    const base = 'line1\nline2\nline3';
    const theirs = 'line1\nmodified\nline3';
    const result = threeWayMerge(base, base, theirs);
    expect(result.mergedText).toBe(theirs);
    expect(result.hasConflicts).toBe(false);
  });

  it('both changed same lines differently — conflict markers', () => {
    const base = 'line1\nline2\nline3';
    const mine = 'line1\nmine-edit\nline3';
    const theirs = 'line1\ntheirs-edit\nline3';
    const result = threeWayMerge(base, mine, theirs);
    expect(result.hasConflicts).toBe(true);
    expect(result.conflictCount).toBe(1);
    expect(result.mergedText).toContain('<<<<<<< MINE');
    expect(result.mergedText).toContain('mine-edit');
    expect(result.mergedText).toContain('=======');
    expect(result.mergedText).toContain('theirs-edit');
    expect(result.mergedText).toContain('>>>>>>> THEIRS');
  });

  it('both made identical change — no conflict', () => {
    const base = 'line1\nline2\nline3';
    const both = 'line1\nsame-edit\nline3';
    const result = threeWayMerge(base, both, both);
    expect(result.mergedText).toBe(both);
    expect(result.hasConflicts).toBe(false);
  });

  it('changes at different locations — clean merge, both applied', () => {
    const base = 'line1\nline2\nline3\nline4\nline5';
    const mine = 'line1\nmine-edit\nline3\nline4\nline5';
    const theirs = 'line1\nline2\nline3\nline4\ntheirs-edit';
    const result = threeWayMerge(base, mine, theirs);
    expect(result.hasConflicts).toBe(false);
    expect(result.mergedText).toContain('mine-edit');
    expect(result.mergedText).toContain('theirs-edit');
  });

  it('deletion — clean merge', () => {
    const base = 'line1\nline2\nline3';
    const mine = 'line1\nline3';
    const result = threeWayMerge(base, mine, base);
    expect(result.mergedText).toBe('line1\nline3');
    expect(result.hasConflicts).toBe(false);
  });

  it('insertion — clean merge', () => {
    const base = 'line1\nline3';
    const mine = 'line1\nline2\nline3';
    const result = threeWayMerge(base, mine, base);
    expect(result.mergedText).toBe('line1\nline2\nline3');
    expect(result.hasConflicts).toBe(false);
  });

  it('empty strings — handles gracefully', () => {
    const result = threeWayMerge('', '', '');
    expect(result.hasConflicts).toBe(false);
    expect(result.mergedText).toBe('');
  });

  it('conflictCount — accurate count', () => {
    const base = 'a\nb\nc\nd\ne';
    const mine = 'a\nmine-b\nc\nmine-d\ne';
    const theirs = 'a\ntheirs-b\nc\ntheirs-d\ne';
    const result = threeWayMerge(base, mine, theirs);
    expect(result.hasConflicts).toBe(true);
    expect(result.conflictCount).toBe(2);
  });

  it('single-line documents', () => {
    const base = 'hello';
    const mine = 'hello world';
    const result = threeWayMerge(base, mine, base);
    expect(result.mergedText).toBe('hello world');
    expect(result.hasConflicts).toBe(false);
  });
});
