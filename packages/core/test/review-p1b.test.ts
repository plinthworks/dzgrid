import { describe, it, expect, expectTypeOf } from 'vitest';
import { clientRows, createColumnModel, localeCtx, makeQuery, resolveInstantRange, parseInstant, type DisplayIndex, type ClientModel } from '@dzgrid/core';
import type { RowSnapshot } from '@dzgrid/core/internal';

/** Findings of the Phase 1 end-of-phase architect review, each pinned by a test that failed first. */

type Row = { id: string; v: number; d?: string };
const cols = () => createColumnModel<Row>([{ id: 'v', type: 'number' }, { id: 'd', type: 'day' }]);

describe('the client model', () => {
  it('reports the problems of the rows it was first given', () => {
    const m = clientRows<Row>({ rows: [{ id: 'a', v: 1 }, { id: 'a', v: 2 }], getRowId: (r) => r.id, columns: cols(), ctx: localeCtx({ locale: 'en-US' }) });
    expect(m.problems.map((p) => [p.code, p.path])).toEqual([['duplicate-row-id', 'rows[1]']]);
  });

  it('does not filter or sort again when a column is only resized', () => {
    const columns = cols();
    const m = clientRows<Row>({ rows: [{ id: 'a', v: 2 }, { id: 'b', v: 1 }], getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
    m.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }));
    const { filterRuns, sortRuns } = m.diagnostics;
    columns.apply([{ id: 'v', width: 300 }], 'user');
    m.setColumns(columns);
    expect(m.diagnostics.filterRuns).toBe(filterRuns);
    expect(m.diagnostics.sortRuns).toBe(sortRuns);
  });

  it('searches formatted values again after the digits change', () => {
    const m = clientRows<Row>({ rows: [{ id: 'a', v: 12 }], getRowId: (r) => r.id, columns: cols(), ctx: localeCtx({ locale: 'ar-EG' }) });
    m.setQuery(makeQuery({ quick: '12' }));
    expect(m.counts.filtered).toBe(1);
    m.setContext(localeCtx({ locale: 'ar-EG', numerals: 'locale' }));
    // Written ١٢ now; folding turns its digits back to 12, so the row still matches — through a rebuilt display.
    expect(m.counts.filtered).toBe(1);
    // Two number and day columns, each displayed again under the new digits.
    expect(m.diagnostics.displayBuilds).toBe(4);
  });

  it('re-sorts on new columns and invalidate()', () => {
    const m = clientRows<Row>({ rows: [{ id: 'a', v: 2 }, { id: 'b', v: 1 }], getRowId: (r) => r.id, columns: cols(), ctx: localeCtx({ locale: 'en-US' }) });
    m.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }));
    m.setColumns(createColumnModel<Row>([{ id: 'v', type: 'number', value: (r) => -r.v }]));
    expect((m.displayed.nodeAt(m.displayed.index(0)!) as { id: unknown }).id).toBe('a');
    const before = m.diagnostics.keyBuilds;
    m.invalidate();
    expect(m.diagnostics.keyBuilds).toBe(before + 1);
  });

  it('exposes no source positions', () => {
    expectTypeOf<ClientModel<Row>>().not.toHaveProperty('store');
    expectTypeOf<ClientModel<Row>['displayed']>().not.toHaveProperty('sourceOf');
  });
});

describe('source and display positions', () => {
  it('cannot be confused at compile time', () => {
    const snap = null as unknown as RowSnapshot<Row>;
    const i = 0 as DisplayIndex;
    // @ts-expect-error — a display position is not a source index (bug 1 of ngx-sheetgrid)
    const f = () => snap.nodeAt(i);
    void f;
  });
});

describe('instant ranges, as they travel to a server', () => {
  it('are half-open with finite or null ends — no Infinity, no exclusive start', () => {
    const at = parseInstant('2026-03-05T10:00:00Z')!;
    expect(resolveInstantRange({ type: 'instant', op: 'after', at: '2026-03-05T10:00:00Z' }, 'UTC').range).toEqual({ from: at + 1, to: null });
    expect(resolveInstantRange({ type: 'instant', op: 'before', at: '2026-03-05T10:00:00Z' }, 'UTC').range).toEqual({ from: null, to: at });
    expect(JSON.parse(JSON.stringify(resolveInstantRange({ type: 'instant', op: 'after', day: '2026-03-05' }, 'UTC').range))).toEqual({ from: Date.UTC(2026, 2, 6), to: null });
  });
});
