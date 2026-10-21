import { describe, it, expect } from 'vitest';
import { buildSpanMap } from '@dzgrid/core/spans';
import { toCsv } from '@dzgrid/core/csv';
import { mulberry32 } from '../support/rng.js';
import { parseCsv } from '../support/rfc4180.js';
import { EN, grid, type Row } from './support.js';

/**
 * Oracle: the map's own ownerAt (a lookup the writer does not use) and each
 * row's own values. repeat: a covered slot holds its origin's value as the
 * origin column writes it; first: empty, unless rows were picked (`at`).
 */
describe('spans repeat/first vs an ownerAt oracle (300 random grids)', () => {
  it('random rowSpan, colSpan, merges, column lists and row picks', () => {
    let covered = 0;
    let firsts = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = mulberry32(seed * 4099);
      const nCols = 2 + Math.floor(r() * 4);
      const nRows = 1 + Math.floor(r() * 9);
      const cols = Array.from({ length: nCols }, (_, c) => `c${c}`);
      const data = Array.from({ length: nRows }, (_, i) => {
        const o: Record<string, unknown> = {};
        for (const c of cols) {
          o[c] = r() < 0.4 ? 'S' : `${c}r${i}`;
          o[`rs_${c}`] = r() < 0.25 ? 1 + Math.floor(r() * 4) : 1;
          o[`cs_${c}`] = r() < 0.2 ? 1 + Math.floor(r() * 3) : 1;
        }
        return o;
      });
      const defs = cols.map((c, j) => {
        const kind = r();
        if (kind < 0.25) return { id: c, header: c, merge: true as const };
        if (kind < 0.6) return { id: c, header: c, rowSpan: (x: { row: Row }) => x.row[`rs_${c}`] as number, colSpan: (x: { row: Row }) => x.row[`cs_${c}`] as number };
        if (kind < 0.7 && j === 0) return { id: c, header: c, hide: true };
        return { id: c, header: c };
      });
      const g = grid(defs as never, data);
      const map = buildSpanMap({ rows: g.model.displayed, columns: g.columns, ctx: EN });
      const spanColumns = g.columns.visible().map((c) => c.id);
      const value = (row: number, id: string) => String(((g.model.displayed.nodeAt(row as never) as { data: any }).data as Row)[id]);
      // the columns written: default, or a shuffled subset that may name the hidden one
      const named = r() < 0.5 ? null : cols.filter(() => r() < 0.8).sort(() => r() - 0.5);
      const outCols = named ?? spanColumns;
      const at = r() < 0.3 ? Array.from({ length: nRows }, (_, i) => i).filter(() => r() < 0.6) : null;
      for (const spans of ['repeat', 'first'] as const) {
        const text = toCsv({ rows: g.model.displayed, at: at && Uint32Array.from(at), columns: g.columns, ctx: EN, spans: map, spanColumns }, { bom: false, header: false, spans, ...(named && { columns: named }) });
        const back = outCols.length ? parseCsv(text, ',') : [];
        const want = !outCols.length ? [] : (at ?? Array.from({ length: nRows }, (_, i) => i)).map((row) =>
          outCols.map((id) => {
            const p = spanColumns.indexOf(id);
            const o = p < 0 || map.none || map.fullWidth(row) ? null : map.ownerAt(row, p);
            if (!o || (o.rows === 1 && o.cols === 1) || (o.row === row && o.col === p)) return value(row, id);
            covered++;
            if (spans === 'first' && !at) { firsts++; return ''; }
            return value(o.row, spanColumns[o.col]!);
          }),
        );
        const where = `seed ${seed} ${spans} cols=${outCols.join('|')} at=${at?.join('|') ?? 'all'}`;
        expect(back.map((rec) => (rec.length === 1 && rec[0] === '' && outCols.length === 1 ? [''] : rec)), where).toEqual(want);
      }
    }
    expect(covered).toBeGreaterThan(200);
    expect(firsts).toBeGreaterThan(50);
  });
});
