// A floor for a header with a button (column-resize.md 21–24, owner 2026-11-12): a column whose header carries the filter
// button is never narrower than the button, the grip, the start padding and one button's width for the title —
// 24 × 3 + 8 = 80 px at the default sizes. Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { filters } from '../src/filters.js';
import { cleanup, make, type R } from './support-filters.js';
import { widthOf } from '../src/render/header-decor.js';
import type { GridContext } from '../src/context.js';

afterEach(cleanup);

// The grid's context, where the column model lives (the API gives no width by id).
const ctx = (g: unknown) => (g as { context: GridContext<R> }).context;
const cols: ColumnOrGroup<R>[] = [
  { id: 'name', header: 'Name', flex: 1 },
  { id: 'n', header: 'N', type: 'number', flex: 1 },
  { id: 'd', header: 'Day', flex: 1, filter: false },
];

describe('the floor of a header with a button (column-resize.md 21–24)', () => {
  it('flexible columns in little room: a filterable one stops at 80, one with no button at 40', () => {
    const t = make({ columns: cols, inline: 60, features: [filters()] });
    expect(widthOf(ctx(t.g), 'name')).toBe(80);
    expect(widthOf(ctx(t.g), 'n')).toBe(80);
    expect(widthOf(ctx(t.g), 'd')).toBe(40);
  });

  it('a drag under it stops at it', () => {
    const t = make({ columns: [{ id: 'name', header: 'Name', width: 150 }], features: [filters()] });
    t.g.kernel.dispatch({ type: 'column.resize', column: 'name', width: 20, finished: true }, 'user');
    expect(widthOf(ctx(t.g), 'name')).toBe(80);
  });

  it('a minWidth the application gives wins, smaller too', () => {
    const t = make({ columns: [{ id: 'name', header: 'Name', flex: 1, minWidth: 50 }], inline: 20, features: [filters()] });
    expect(widthOf(ctx(t.g), 'name')).toBe(50);
  });

  it('the header box in place of the button (`header.filterBox`), or no filters feature: no floor', () => {
    const boxed: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name', flex: 1, ui: { header: 'header.filterBox' } }];
    const t = make({ columns: boxed, inline: 20, features: [filters({ floating: true })] });
    expect(widthOf(ctx(t.g), 'name')).toBe(40);
    const u = make({ columns: [{ id: 'name', header: 'Name', flex: 1 }], inline: 20, features: [] });
    expect(widthOf(ctx(u.g), 'name')).toBe(40);
  });
});
