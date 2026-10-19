import { describe, it, expect, afterEach } from 'vitest';
import { parseInstant, type ColumnDef } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { UPDATE_POLICY } from '../src/update.js';
import { EN } from '../src/locales/en.js';

/** docs/behaviors/filter-relative.md: the grid's `clock` setting reaches the model. */
type R = { id: string; t: string };
let grids: GridInstance<R, any>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

const at = (s: string) => parseInstant(s)!;
const ROWS: R[] = [{ id: 'a', t: '2026-10-19T10:00:00Z' }, { id: 'b', t: '2026-10-20T10:00:00Z' }];
const TODAY = { type: 'instant', op: 'relative', range: 'today' } as const;

function make(more: object) {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = [{ id: 't', type: 'instant' }];
  const g = createGrid<R>(host, { getRowId: (r: R) => r.id, columns, messages: EN, timeZone: 'Africa/Algiers', ...more } as never, { geometry, sync: true }) as GridInstance<R, any>;
  grids.push(g);
  return g;
}

describe('the clock setting', () => {
  it('is what a browser grid counts today from; kernel.tick() moves it at midnight', () => {
    const clock = { t: at('2026-10-19T12:00:00Z') };
    const g = make({ rows: ROWS, clock: () => clock.t });
    g.kernel.dispatch({ type: 'filter.column', column: 't', filter: TODAY }, 'user');
    expect(g.kernel.rows.counts.filtered).toBe(1);
    expect(g.kernel.rows.problems).toEqual([]);
    clock.t = at('2026-10-19T23:00:00Z');
    g.kernel.tick();
    expect(g.kernel.rows.counts.filtered).toBe(1);
    clock.t = at('2026-10-21T00:00:00Z');
    g.kernel.tick();
    expect(g.kernel.rows.counts.filtered).toBe(0);
  });

  it("is what a server grid's wire form is resolved against", () => {
    const reqs: DataRequest[] = [];
    const data: DataSource<R> = { fetch: (req) => (reqs.push(req), { rows: ROWS, total: 2 }) };
    const g = make({ source: sourceRows(data), clock: () => at('2026-10-19T12:00:00Z') });
    g.kernel.dispatch({ type: 'filter.column', column: 't', filter: TODAY }, 'user');
    expect((reqs.at(-1)!.filter as any).t.resolved).toEqual({ from: '2026-10-18T23:00:00.000Z', to: '2026-10-19T23:00:00.000Z' });
  });

  it('defaults to the real clock, and is fixed', () => {
    const g = make({ rows: ROWS });
    g.kernel.dispatch({ type: 'filter.column', column: 't', filter: TODAY }, 'user');
    expect(g.kernel.rows.problems).toEqual([]);
    expect(UPDATE_POLICY.clock).toBe('fixed');
  });
});
