import { describe, it, expect, afterEach } from 'vitest';
import type { AnyFilterKind, ColumnDef, ColumnFilter, GridEvent } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { UPDATE_POLICY } from '../src/update.js';
import { EN } from '../src/locales/en.js';

/** docs/behaviors/filter-custom.md */
type R = { id: string; n: number };
let grids: GridInstance<R, any>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

const atLeast: AnyFilterKind = { name: 'atLeast', types: ['number'], read: (s) => (typeof s === 'number' ? s : 'invalid'), active: () => true, test: (s) => (v) => v !== null && v >= s, wire: (s) => ({ min: s }) };
const custom = (kind: string, state: unknown) => ({ type: 'custom', kind, state }) as unknown as ColumnFilter;
const ROWS: R[] = [{ id: 'a', n: 1 }, { id: 'b', n: 5 }, { id: 'c', n: 9 }];

function make(more: object) {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [{ id: 'n', type: 'number' }];
  const g = createGrid<R>(host, { getRowId: (r: R) => r.id, columns, messages: EN, onEvent: (e: GridEvent<R>) => events.push(e), ...more } as never, { geometry, sync: true }) as GridInstance<R, any>;
  grids.push(g);
  return { g, events };
}

describe('filterKinds on the grid', () => {
  it('reach the browser model', () => {
    const { g } = make({ rows: ROWS, filterKinds: [atLeast] });
    g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom('atLeast', 5) }, 'user');
    expect(g.kernel.rows.counts.filtered).toBe(2);
    expect(g.kernel.rows.problems).toEqual([]);
  });

  it("reach a server's model: the wire form is the kind's", () => {
    const reqs: DataRequest[] = [];
    const data: DataSource<R> = { fetch: (req) => (reqs.push(req), { rows: ROWS, total: 3 }) };
    const { g } = make({ source: sourceRows(data), operations: 'server', filterKinds: [atLeast] });
    g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom('atLeast', 5) }, 'user');
    expect(reqs.at(-1)!.filter).toEqual({ n: { type: 'custom', kind: 'atLeast', value: { min: 5 } } });
    expect(g.kernel.rows.problems).toEqual([]);
  });

  it("reach the browser part of a server's model (a fetched set filtered in the browser)", () => {
    const data: DataSource<R> = { fetch: () => ({ rows: ROWS }) };
    const { g } = make({ source: sourceRows(data), operations: { page: 'off' }, filterKinds: [atLeast] });
    g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom('atLeast', 5) }, 'user');
    expect(g.kernel.rows.counts.filtered).toBe(2);
  });

  it('are set once: a live change is refused and said', () => {
    expect(UPDATE_POLICY.filterKinds).toBe('fixed');
    const { g, events } = make({ rows: ROWS, filterKinds: [atLeast] });
    g.update({ filterKinds: [] } as never);
    expect(events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string }[] }).problems.map((p) => [p.code, p.path]))).toEqual([['unsupported-live-change', 'settings.filterKinds']]);
    g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom('atLeast', 5) }, 'user');
    expect(g.kernel.rows.counts.filtered).toBe(2);
  });

  it('a bad registry is told at creation', () => {
    const { events, g } = make({ rows: ROWS, filterKinds: [atLeast, { ...atLeast }, { ...atLeast, name: 'text' }] });
    const told = events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string; detail?: string }[] }).problems);
    expect(told).toEqual([
      { code: 'invalid-filter', severity: 'error', path: 'filterKinds[1]', detail: 'duplicate' },
      { code: 'invalid-filter', severity: 'error', path: 'filterKinds[2]', detail: 'name' },
    ]);
    g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom('atLeast', 9) }, 'user');
    expect(g.kernel.rows.counts.filtered).toBe(1);
  });
});
