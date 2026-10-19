import { describe, it, expect } from 'vitest';
import { dataKey, makeQuery, selectOnly, type RowKey } from '@dzgrid/core';
import { csvRows, toCsv } from '@dzgrid/core/csv';
import { mulberry32 } from '../support/rng.js';
import { EN, grid } from './support.js';

/** Oracle: an unpaged twin under the same query; and the pages walked one by one, concatenated. */
const ids = (rows: { count: number; keyAt(i: never): unknown }) => Array.from({ length: rows.count }, (_, i) => String(rows.keyAt(i as never)));
const DEFS = [{ id: 'n', header: 'N' }, { id: 'v', header: 'V', type: 'number' as const }, { id: 'w', header: 'W', type: 'number' as const }];

describe('scopes and allRows after filter, sort, page and data changes', () => {
  it('random sequences of operations (200 seeds)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = mulberry32(seed);
      const n = Math.floor(r() * 30);
      const data = Array.from({ length: n }, (_, i) => ({ id: `k${i}`, n: `k${i}`, v: Math.floor(r() * 6), w: Math.floor(r() * 4) }));
      const size = 1 + Math.floor(r() * 7);
      const paged = grid(DEFS, data, EN, { pageSize: size });
      const flat = grid(DEFS, data, EN);
      let next = n;
      for (let step = 0; step < 12; step++) {
        const op = Math.floor(r() * 6);
        const where = `seed ${seed} step ${step} op ${op}`;
        if (op === 0) {
          const q = makeQuery({
            sort: r() < 0.7 ? [{ column: r() < 0.5 ? 'v' : 'w', dir: r() < 0.5 ? 'asc' : 'desc' }] : [],
            filter: r() < 0.6 ? { v: { type: 'number', op: r() < 0.5 ? 'greaterThan' : 'notEqual', value: Math.floor(r() * 6) } } : {},
          } as never);
          paged.model.setQuery(q);
          flat.model.setQuery(q);
        } else if (op === 1) {
          paged.model.setPage({ index: Math.floor(r() * 6) });
        } else if (op === 2) {
          paged.model.setPage({ size: 1 + Math.floor(r() * 7) });
        } else if (op === 3 && next > 0) {
          const k = `k${Math.floor(r() * next)}`;
          const row = { id: k, n: k, v: Math.floor(r() * 6), w: Math.floor(r() * 4) };
          if (paged.model.row(dataKey(k)!)) {
            paged.model.applyTransaction({ update: [row] } as never);
            flat.model.applyTransaction({ update: [row] } as never);
          }
        } else if (op === 4) {
          const row = { id: `k${next}`, n: `k${next}`, v: Math.floor(r() * 6), w: Math.floor(r() * 4) };
          next++;
          paged.model.applyTransaction({ add: [row] } as never);
          flat.model.applyTransaction({ add: [row] } as never);
        } else if (op === 5 && next > 0) {
          const k = `k${Math.floor(r() * next)}`;
          paged.model.applyTransaction({ remove: [k] } as never);
          flat.model.applyTransaction({ remove: [k] } as never);
        }
        // read allRows sometimes before the change (the cache), always after
        const want = ids(flat.model.displayed as never);
        expect(ids(paged.model.allRows as never), where).toEqual(want);
        // the values too, through the file: not a stale snapshot
        const csvOf = (m: typeof paged.model) => { const s = csvRows(m, 'all', { mode: 'include', keys: new Set() } as never)!; return toCsv({ rows: s.rows, at: s.at, columns: paged.columns, ctx: EN }, { bom: false }); };
        expect(csvOf(paged.model), where).toBe(csvOf(flat.model));
        // walking the pages, concatenated
        const pg = paged.model.page!;
        const before = pg.index;
        const walked: string[] = [];
        for (let p = 0; p < pg.pageCount!; p++) {
          paged.model.setPage({ index: p });
          walked.push(...ids(paged.model.displayed as never));
        }
        paged.model.setPage({ index: before });
        expect(walked, where).toEqual(want);
        // selected: a random set, in screen order, hidden rows dropped
        const chosen = Array.from({ length: next }, (_, i) => `k${i}`).filter(() => r() < 0.3);
        const sel = csvRows(paged.model, 'selected', selectOnly(chosen.map((c) => dataKey(c)! as RowKey)))!;
        const got = Array.from(sel.at!, (i) => String(sel.rows.keyAt(i as never)));
        expect(got, where).toEqual(want.filter((k) => chosen.some((c) => String(dataKey(c)) === k)));
        expect(sel.count).toBe(got.length);
        // displayed is the current page
        const d = csvRows(paged.model, 'displayed', selectOnly([]))!;
        expect(d.rows).toBe(paged.model.displayed);
      }
    }
  });
});
