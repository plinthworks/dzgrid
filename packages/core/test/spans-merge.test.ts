import { describe, it, expect } from 'vitest';
import { localeCtx, resolveColumns } from '@dzgrid/core';
import { exportText, runEnds } from '../src/spans/merge.js';

/** The run index alone (what the 1M-row bench measures) and the default text. */
describe('runEnds', () => {
  it('gives each row the last row of its run, asking each pair once, top to bottom', () => {
    const t = ['a', 'a', 'b', 'c', 'c', 'c'];
    const asked: number[] = [];
    expect([...runEnds(t.length, (i) => (asked.push(i), t[i] === t[i + 1]))]).toEqual([1, 1, 2, 5, 5, 5]);
    expect(asked).toEqual([0, 1, 2, 3, 4]);
  });

  it('no rows, one row', () => {
    expect([...runEnds(0, () => true)]).toEqual([]);
    expect([...runEnds(1, () => true)]).toEqual([0]);
  });
});

describe('exportText', () => {
  const col = (def: object) => resolveColumns<Record<string, unknown>>([{ id: 'v', ...def }]).columns[0]!;
  const text = exportText<Record<string, unknown>>(localeCtx({ locale: 'en-US' }));

  it('is the codec export of the value, null for a blank, an unreadable value or a throw', () => {
    expect(text(col({}), { v: 'é' })).toBe('é');
    expect(text(col({}), { v: '' })).toBeNull();
    expect(text(col({}), { v: null })).toBeNull();
    expect(text(col({ type: 'number' }), { v: 'zz' })).toBeNull();
    expect(text(col({ type: 'number' }), { v: '1.50' })).toBe('1.5');
    expect(text(col({ value: () => { throw new Error('x'); } }), {})).toBeNull();
  });
});
