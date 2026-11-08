// A view too narrow for its pins (pinned-columns.md, Phase 11 L4a, owner A 2026-11-08): while the pinned columns would
// leave the centre less room than its widest column, they are released into the centre, in screen order; the state
// still says pinned. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { createColumnModel } from '@dzgrid/core';

const defs = [
  { id: 'name', width: 220, pinned: 'start' as const },
  { id: 'city', width: 130 },
  { id: 'qty', width: 150 },
  { id: 'price', width: 110, pinned: 'end' as const },
];
const ids = (m: ReturnType<typeof createColumnModel>) => [m.layout.start, m.layout.center, m.layout.end].map((s) => s.columns.map((c) => c.id));

describe('pinned columns in a view too narrow for them', () => {
  it('room for the widest centre column: pinned as asked (220 + 110 + 150 = 480 ≤ 480)', () => {
    const m = createColumnModel(defs, { availableInline: 480 });
    expect(ids(m)).toEqual([['name'], ['city', 'qty'], ['price']]);
  });

  it('one pixel less: released into the centre, start first and end last; widths kept', () => {
    const m = createColumnModel(defs, { availableInline: 479 });
    expect(ids(m)).toEqual([[], ['name', 'city', 'qty', 'price'], []]);
    expect(m.layout.center.width).toBe(610);
    expect(m.layout.totalWidth).toBe(610);
  });

  it('the state still says pinned; widening the view pins them again', () => {
    const m = createColumnModel(defs, { availableInline: 320 });
    expect(ids(m)[0]).toEqual([]);
    expect(m.state().map((s) => [s.id, s.pinned])).toEqual([['name', undefined], ['city', undefined], ['qty', undefined], ['price', undefined]]);
    m.apply([{ id: 'qty', pinned: 'start' }], 'user');
    expect(m.state().find((s) => s.id === 'qty')!.pinned).toBe('start');
    expect(ids(m)).toEqual([[], ['name', 'qty', 'city', 'price'], []]);
    const c = m.setAvailableInline(1200);
    expect(c.layoutChanged).toBe(true);
    expect(ids(m)).toEqual([['name', 'qty'], ['city'], ['price']]);
  });

  it('no room known yet, or nothing pinned: as asked', () => {
    expect(ids(createColumnModel(defs))).toEqual([['name'], ['city', 'qty'], ['price']]);
    expect(ids(createColumnModel(defs.map(({ pinned, ...d }) => d), { availableInline: 100 }))).toEqual([[], ['name', 'city', 'qty', 'price'], []]);
  });
});
