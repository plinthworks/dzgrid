// `@dzgrid/dom/filters-base` (1.2.0, owner 2026-11-02; docs/behaviors/filter-ui.md « Without tzslot »): `filters()`
// without the date kits, so an application without `@tzslot/*` installed builds. Text, number, set and yes/no filters
// as with `filters()`; a day or instant column gets no date form (no popup, no button) and one `missing-feature`
// warning, unless `loadDates` brings the kits. `@dzgrid/dom/filters` is unchanged.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { filters as baseFilters } from '../src/filters-base.js';
import { cleanup, make, type R } from './support-filters.js';

afterEach(() => (cleanup(), vi.useRealTimers()));

type Row = R & { d: string; t: string };
const ROWS: Row[] = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, name: `p${i}`, n: i, d: `2026-10-0${1 + (i % 9)}`, t: '2026-10-01T10:00:00Z' }) as Row);
const COLS: ColumnOrGroup<Row>[] = [
  { id: 'name', header: 'Name' },
  { id: 'n', header: 'N', type: 'number' },
  { id: 'd', header: 'D', type: 'day' },
  { id: 't', header: 'T', type: 'instant' },
  { id: 'off', header: 'Off', type: 'day', filter: false },
];

function grid(o: object = {}) {
  const feature = baseFilters({ floating: true, ...o });
  // `make` is typed for its own row shape (R); these rows add date columns.
  const t = make({ columns: COLS as never, rows: ROWS as never, features: [feature], settings: { clock: () => Date.UTC(2026, 9, 19) } as never });
  return { ...t, feature };
}

describe('filters-base', () => {
  it('text and number filter as with filters()', () => {
    vi.useFakeTimers();
    const t = grid();
    t.type('name', 'p1');
    vi.advanceTimersByTime(200);
    expect(t.g.kernel.query.filter).toMatchObject({ name: { type: 'text', value: 'p1' } });
    expect(t.feature.openFilter('n')).toBe(true);
  });

  it('a day or instant column: no date form, one missing-feature warning per filterable column', () => {
    const t = grid();
    expect(t.feature.openFilter('d')).toBe(false);
    expect(t.feature.openFilter('t')).toBe(false);
    expect(t.problems().filter((p) => p.code === 'missing-feature').map((p) => [p.path, p.detail])).toEqual([
      ['columns.d.filter', '@dzgrid/dom/filters'],
      ['columns.t.filter', '@dzgrid/dom/filters'],
    ]);
  });

  it('with loadDates: the date forms, no warning', () => {
    const t = grid({ loadDates: () => new Promise(() => {}) });
    expect(t.feature.openFilter('d')).toBe(true);
    expect(t.problems().filter((p) => p.code === 'missing-feature')).toEqual([]);
  });
});
