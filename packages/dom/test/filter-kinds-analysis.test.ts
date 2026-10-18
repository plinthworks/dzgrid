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

const zoned: AnyFilterKind = { name: 'zoned', read: (s) => s, active: () => true, test: (_s, ctx) => (v) => (ctx.timeZone === 'UTC' ? v === 1 : v !== 1) };
const lang: AnyFilterKind = { name: 'lang', read: (s) => s, active: () => true, test: (_s, ctx) => (v) => (ctx.locale.startsWith('fr') ? v === 9 : v !== 9) };
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

describe('filterKinds and the grid language (step 8 test analysis)', () => {
  it('a kind whose rule reads the zone runs again when the grid zone changes', () => {
    const { g } = make({ rows: ROWS, filterKinds: [zoned], timeZone: 'UTC' });
    g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom('zoned', 1) }, 'user');
    expect(g.kernel.rows.counts.filtered).toBe(1);
    g.update({ timeZone: 'Asia/Tokyo' } as never);
    expect(g.kernel.rows.counts.filtered).toBe(2);
  });

  it('a kind whose rule reads the language runs again when the grid locale changes', () => {
    const { g } = make({ rows: ROWS, filterKinds: [lang] });
    g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom('lang', 1) }, 'user');
    expect(g.kernel.rows.counts.filtered).toBe(2);
    g.update({ locale: 'fr-FR' } as never);
    expect(g.kernel.rows.counts.filtered).toBe(1);
  });

  it('the same refused filter dispatched twice is told once through onEvent', () => {
    const serverOnly: AnyFilterKind = { name: 'so', read: (s) => s, active: () => true };
    const { g, events } = make({ rows: ROWS, filterKinds: [serverOnly] });
    g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom('so', 1) }, 'user');
    g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: custom('so', 2) }, 'user');
    expect(events.filter((e) => e.type === 'problems').length).toBe(1);
  });
});
