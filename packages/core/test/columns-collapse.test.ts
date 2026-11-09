// Columns that collapse under their rows (responsive-columns.md, 1.9.0 lot B): the column model takes the order and drops
// centre columns until the rest fit the room. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, localeCtx, makeQuery, type ResolvedColumn } from '@dzgrid/core';
import { csvColumns } from '@dzgrid/core/csv';

const defs = [
  { id: 'name', width: 200 },
  { id: 'city', width: 120 },
  { id: 'qty', width: 100, collapsePriority: 3 },
  { id: 'note', width: 160 },
  { id: 'code', width: 80, collapsePriority: 0 },
];
const ids = (m: { visible(): readonly ResolvedColumn<any>[] }) => m.visible().map((c) => c.id);
const rank = (c: ResolvedColumn<unknown>) => c.def.collapsePriority ?? 1;

describe('collapse (responsive-columns.md 1)', () => {
  it('everything fits (660 ≤ 660): nothing collapsed', () => {
    const m = createColumnModel(defs, { availableInline: 660 });
    m.collapse!(rank);
    expect(ids(m)).toEqual(['name', 'city', 'qty', 'note', 'code']);
    expect([...m.collapsed!]).toEqual([]);
  });

  it('one pixel less: the highest priority first (qty, 3)', () => {
    const m = createColumnModel(defs, { availableInline: 659 });
    m.collapse!(rank);
    expect(ids(m)).toEqual(['name', 'city', 'note', 'code']);
    expect([...m.collapsed!]).toEqual(['qty']);
  });

  it('then among equals the last on screen first (note, then city); never the first, never priority 0', () => {
    const m = createColumnModel(defs, { availableInline: 400 });
    m.collapse!(rank);
    // 660 − 100 (qty) − 160 (note) = 400.
    expect(ids(m)).toEqual(['name', 'city', 'code']);
    m.setAvailableInline(100);
    expect(ids(m)).toEqual(['name', 'code']);
    expect([...m.collapsed!].sort()).toEqual(['city', 'note', 'qty']);
  });

  it('the user’s order counts: the last on screen collapses first', () => {
    const m = createColumnModel(defs, { availableInline: 500 });
    m.apply([{ id: 'note', order: 1 }, { id: 'city', order: 2 }], 'user');
    m.collapse!(rank);
    // name, note, city, qty, code: qty (3) then city (the last of priority 1) → 660 − 100 − 120 = 440.
    expect(ids(m)).toEqual(['name', 'note', 'code']);
  });

  it('pinned columns never collapse; their release (L4a) still comes after', () => {
    const m = createColumnModel([{ id: 'a', width: 200, pinned: 'start' as const }, { id: 'b', width: 150 }, { id: 'c', width: 150 }, { id: 'z', width: 200, pinned: 'end' as const }], { availableInline: 450 });
    m.collapse!(() => 1);
    expect([m.layout.start, m.layout.center, m.layout.end].map((s) => s.columns.map((c) => c.id))).toEqual([['a'], [], ['z']]);
    expect([...m.collapsed!]).toEqual(['c', 'b']);
    // Still too narrow for the pins alone: released into the centre, as before.
    m.setAvailableInline(300);
    expect([m.layout.start, m.layout.center, m.layout.end].map((s) => s.columns.map((c) => c.id))).toEqual([[], ['a', 'z'], []]);
  });

  it('a flexible column needs its minWidth, else its width; it grows again once others collapse', () => {
    const m = createColumnModel([{ id: 'a', width: 100 }, { id: 'b', flex: 1, minWidth: 120 }, { id: 'c', flex: 1, width: 200 }], { availableInline: 419 });
    m.collapse!(() => 1);
    expect(ids(m)).toEqual(['a', 'b']);
    expect(m.layout.center.width).toBe(419);
  });

  it('the state, the user’s widths and `hidden` untouched; off again: everything back', () => {
    const m = createColumnModel(defs, { availableInline: 300 });
    m.apply([{ id: 'city', width: 140 }], 'user');
    const c = m.collapse!(rank);
    expect(c.layoutChanged).toBe(true);
    expect(m.state().map((s) => s.hidden ?? false)).toEqual([false, false, false, false, false]);
    m.collapse!(null);
    expect(ids(m)).toEqual(['name', 'city', 'qty', 'note', 'code']);
    expect(m.layout.center.widths.sizeAt(1)).toBe(140);
  });

  it('no room known yet: nothing collapses', () => {
    const m = createColumnModel(defs);
    m.collapse!(rank);
    expect(ids(m)).toHaveLength(5);
  });

  it('the same set keeps the same object; `withCollapsed()` lists them in their places; `dataVersion` does not move', () => {
    const m = createColumnModel(defs, { availableInline: 600 });
    const dv = m.dataVersion;
    m.collapse!(rank);
    const s = m.collapsed!;
    m.setAvailableInline(601);
    expect(m.collapsed!).toBe(s);
    expect(m.withCollapsed!().map((c) => c.id)).toEqual(['name', 'city', 'qty', 'note', 'code']);
    expect(m.dataVersion).toBe(dv);
    // A hidden column is not among them.
    m.apply([{ id: 'note', hidden: true }], 'user');
    expect(m.withCollapsed!().map((c) => c.id)).toEqual(['name', 'city', 'qty', 'code']);
  });
});

describe('what reads collapsed columns (responsive-columns.md 9, 11)', () => {
  it('the quick search still finds a value of a collapsed column', () => {
    const columns = createColumnModel<{ id: string; name: string; city: string }>([{ id: 'name', width: 200 }, { id: 'city', width: 200 }], { availableInline: 250 });
    columns.collapse!(() => 1);
    expect(ids(columns)).toEqual(['name']);
    const m = clientRows({ rows: [{ id: '1', name: 'Ada', city: 'Lyon' }, { id: '2', name: 'Bob', city: 'Oran' }], getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) });
    m.setQuery(makeQuery({ quick: 'oran' }));
    expect(m.displayed.count).toBe(1);
  });

  it('a file’s columns, none named: the collapsed ones too, in their places', () => {
    const m = createColumnModel(defs, { availableInline: 300 });
    m.collapse!(rank);
    expect(csvColumns(m).columns.map((c) => c.id)).toEqual(['name', 'city', 'qty', 'note', 'code']);
  });
});
