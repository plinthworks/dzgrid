// A floor for a header with a button (column-resize.md 21–24, owner 2026-11-12): the DOM layer gives the column model the
// smallest width each column's header needs; it is the default minimum, a `minWidth` given wins. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { createColumnModel, type ColumnLayout, type ResolvedColumn } from '@dzgrid/core';

const floor = (c: ResolvedColumn<unknown>) => (c.id === 'name' || c.id === 'qty' ? 80 : 0);
const width = (m: { layout: ColumnLayout }, id: string) => {
  const s = m.layout.center;
  return s.widths.sizeAt(s.columns.findIndex((c) => c.id === id));
};

describe('the floor (column-resize.md 21–24)', () => {
  it('a flexible column sharing little room stops at its floor, not at 40', () => {
    const m = createColumnModel([{ id: 'name', flex: 1 }, { id: 'note', flex: 1 }], { availableInline: 60 });
    expect(width(m, 'name')).toBe(40);
    m.floor!(floor);
    expect(width(m, 'name')).toBe(80);
    expect(width(m, 'note')).toBe(40); // no button: the default 40 still
  });

  it('a user width under it is raised; above it, kept', () => {
    const m = createColumnModel([{ id: 'qty', width: 120 }]);
    m.floor!(floor);
    m.apply([{ id: 'qty', width: 30 }], 'user');
    expect(width(m, 'qty')).toBe(80);
    m.apply([{ id: 'qty', width: 95 }], 'user');
    expect(width(m, 'qty')).toBe(95);
  });

  it('a minWidth the application gives wins, smaller too', () => {
    const m = createColumnModel([{ id: 'qty', width: 120, minWidth: 50 }]);
    m.floor!(floor);
    m.apply([{ id: 'qty', width: 30 }], 'user');
    expect(width(m, 'qty')).toBe(50);
  });

  it('a maxWidth under it is raised to it', () => {
    const m = createColumnModel([{ id: 'qty', width: 60, maxWidth: 60 }]);
    m.floor!(floor);
    expect(width(m, 'qty')).toBe(80);
  });

  it('minOf says the bound in force; null turns the floor off', () => {
    const m = createColumnModel([{ id: 'qty', width: 120 }, { id: 'note', width: 120, minWidth: 10 }]);
    expect(m.minOf!('qty')).toBe(40);
    m.floor!(floor);
    expect(m.minOf!('qty')).toBe(80);
    expect(m.minOf!('note')).toBe(10);
    m.apply([{ id: 'qty', width: 30 }], 'user');
    m.floor!(null);
    expect(width(m, 'qty')).toBe(40);
  });

  it('a floor that changes nothing changes no version', () => {
    const m = createColumnModel([{ id: 'qty', width: 120 }]);
    const v = m.version;
    expect(m.floor!(floor).layoutChanged).toBe(false);
    expect(m.version).toBe(v);
  });
});
