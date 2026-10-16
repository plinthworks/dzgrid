import { describe, it, expect } from 'vitest';
import { selectAll, toggle, selectionCount, isSelected, selectOnly, NO_SELECTION, dataKey } from '@dzgrid/core';

const k = (id: string) => dataKey(id)!;

describe('selection', () => {
  it('counts everything-except against the total, and gives null without one', () => {
    const s = toggle(selectAll(), k('b'));
    expect(selectionCount(s, 10)).toBe(9);
    expect(selectionCount(s, null)).toBeNull();
    expect(isSelected(s, k('a'))).toBe(true);
    expect(isSelected(s, k('b'))).toBe(false);
  });

  it('never changes a state it was given', () => {
    const s = selectOnly([k('a')]);
    const t = toggle(s, k('b'));
    expect([...s.keys]).toEqual([k('a')]);
    expect([...t.keys]).toEqual([k('a'), k('b')]);
    expect(NO_SELECTION.keys.size).toBe(0);
  });

  it('selects ten million rows without holding ten million keys', () => {
    const s = selectAll();
    expect(s.keys.size).toBe(0);
    expect(selectionCount(s, 10_000_000)).toBe(10_000_000);
  });
});
