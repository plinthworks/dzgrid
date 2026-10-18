import { describe, it, expect } from 'vitest';
import type { ColumnDef, Intent } from '@dzgrid/core';
import { buildSpanMap, navigate, type SpanCell, type SpanMap } from '@dzgrid/core/spans';
import { cellsOf, rng, spanGrid, type Row } from './support/spans.js';

/**
 * The span map's invariants (step 9b blueprint A, I1-I5) over random grids:
 * random values, random rules, random pins, random full-width rows; seeded,
 * so a failure names its seed.
 */

const SEEDS = Array.from({ length: 60 }, (_, i) => 9001 + i * 7);

function randomGrid(seed: number) {
  const r = rng(seed);
  const nCols = 2 + r.int(5);
  const nRows = 1 + r.int(30);
  const pins = ['start', null, null, 'end'] as const;
  const defs: ColumnDef<Row>[] = [];
  for (let c = 0; c < nCols; c++) {
    const kind = r.int(5);
    const sizes = Array.from({ length: nRows }, () => (r.next() < 0.3 ? 1 + r.int(5) : 1));
    const widths = Array.from({ length: nRows }, () => (r.next() < 0.25 ? 1 + r.int(4) : 1));
    const def: ColumnDef<Row> = {
      id: `c${c}`,
      pinned: r.pick(pins),
      ...(kind === 1 && { merge: true as const }),
      ...(kind === 2 && { rowSpan: (x) => sizes[x.index]! }),
      ...(kind === 3 && { colSpan: (x) => widths[x.index]! }),
      ...(kind === 4 && { rowSpan: (x) => sizes[x.index]!, colSpan: (x) => widths[x.index]! }),
    };
    defs.push(def);
  }
  const data = Array.from({ length: nRows }, () => defs.map(() => r.pick(['a', 'a', 'b', '', 'c'])));
  const fw = new Set(Array.from({ length: nRows }, (_, i) => i).filter(() => r.next() < 0.08));
  const order = Array.from({ length: nRows }, (_, i) => i).sort(() => r.next() - 0.5);
  const g = spanGrid(defs, data, { order, ...(fw.size && { fullWidth: (row: Row) => fw.has(Number(row.id.slice(1))) }) });
  const segs = [g.columns.layout.start.columns.length, g.columns.layout.center.columns.length, g.columns.layout.end.columns.length];
  return { g, nRows, nCols, segs, r };
}

const segOf = (segs: number[], c: number) => (c < segs[0]! ? 0 : c < segs[0]! + segs[1]! ? 1 : 2);

describe('span map invariants', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: no overlap, one owner per slot, inside a segment and the rows, origin top-start`, () => {
      const { g, nRows, nCols, segs } = randomGrid(seed);
      const m = buildSpanMap(g.input);
      const cover = Array.from({ length: nRows }, () => new Array<SpanCell | null>(nCols).fill(null));
      const spans = cellsOf(m, nRows, nCols);
      for (const s of spans) {
        // I4: the origin is the top-start slot; I3: inside the rows and one segment (full-width rows aside).
        expect(s.rows >= 1 && s.cols >= 1 && (s.rows > 1 || s.cols > 1)).toBe(true);
        expect(s.row + s.rows).toBeLessThanOrEqual(nRows);
        expect(s.col + s.cols).toBeLessThanOrEqual(nCols);
        if (!m.fullWidth(s.row)) expect(segOf(segs, s.col)).toBe(segOf(segs, s.col + s.cols - 1));
        else expect(s).toEqual({ row: s.row, col: 0, rows: 1, cols: nCols });
        for (let r = s.row; r < s.row + s.rows; r++) {
          if (r > s.row) expect(m.fullWidth(r)).toBe(false);
          for (let c = s.col; c < s.col + s.cols; c++) {
            // I1: no slot covered twice.
            expect(cover[r]![c], `slot ${r},${c}`).toBeNull();
            cover[r]![c] = s;
          }
        }
      }
      // I2: every slot's owner is the one span covering it, or none.
      for (let r = 0; r < nRows; r++) for (let c = 0; c < nCols; c++) expect(m.ownerAt(r, c)).toEqual(cover[r]![c]);
    });

    it(`seed ${seed}: the queries agree with ownerAt, whatever order they are asked in`, () => {
      const { g, nRows, nCols, r } = randomGrid(seed);
      const a = buildSpanMap(g.input);
      const b = buildSpanMap(g.input);
      // Ask b in a random order first, with the other queries mixed in.
      const slots = Array.from({ length: nRows * nCols }, (_, i) => [Math.floor(i / nCols), i % nCols] as const).sort(() => r.next() - 0.5);
      const asked = slots.map(([row, c]) => (b.coveringAbove(row), b.inRow(row, 0, nCols - 1), [row, c, b.ownerAt(row, c)] as const));
      for (const [row, c, o] of asked) expect(o).toEqual(a.ownerAt(row, c));
      expect(b.problems).toEqual(a.problems);
      for (let row = 0; row < nRows; row++) {
        const above = new Map<string, SpanCell>();
        const inRow = new Map<string, SpanCell>();
        for (let c = 0; c < nCols; c++) {
          const o = a.ownerAt(row, c);
          if (o && o.row < row) above.set(`${o.row},${o.col}`, o);
          if (o) inRow.set(`${o.row},${o.col}`, o);
        }
        expect(a.coveringAbove(row).filter((s) => s.rows > 1)).toEqual([...above.values()].sort((x, y) => x.col - y.col));
        expect(a.inRow(row, 0, nCols - 1)).toEqual([...inRow.values()].sort((x, y) => x.col - y.col));
      }
    });

    it(`seed ${seed}: arrow round trips come back to the same cell, the crossing axis kept`, () => {
      const { g, nRows, nCols, r } = randomGrid(seed);
      const m: SpanMap = buildSpanMap(g.input);
      const shape = { rows: nRows, cols: nCols, page: 3 };
      const pairs: [Intent, Intent, 'row' | 'col'][] = [
        [{ kind: 'move', axis: 'row', delta: 1 }, { kind: 'move', axis: 'row', delta: -1 }, 'col'],
        [{ kind: 'move', axis: 'row', delta: -1 }, { kind: 'move', axis: 'row', delta: 1 }, 'col'],
        [{ kind: 'move', axis: 'col', delta: 1 }, { kind: 'move', axis: 'col', delta: -1 }, 'row'],
        [{ kind: 'move', axis: 'col', delta: -1 }, { kind: 'move', axis: 'col', delta: 1 }, 'row'],
      ];
      for (let t = 0; t < 40; t++) {
        const slot = { row: r.int(nRows), col: r.int(nCols) };
        const o = m.ownerAt(slot.row, slot.col);
        const from = o ? { row: o.row, col: o.col } : slot;
        const goal = slot;
        for (const [go, back, kept] of pairs) {
          const a = navigate(m, shape, from, goal, go)!;
          if (a.to.row < 0) continue;
          // A full-width row has no columns to move along: Left and Right stay.
          if (a.to.row === from.row && a.to.col === from.col) {
            expect(a.goal).toEqual(goal);
            continue;
          }
          expect(a.goal[kept]).toBe(goal[kept]);
          const b = navigate(m, shape, a.to, a.goal, back)!;
          expect(b.to, `seed ${seed} from ${JSON.stringify(from)} ${JSON.stringify(go)}`).toEqual(from);
          expect(b.goal[kept]).toBe(goal[kept]);
        }
      }
    });
  }

  it('a sorted merge column has as many cells as distinct non-blank values, plus one per blank', () => {
    for (const seed of SEEDS) {
      const r = rng(seed);
      const n = 1 + r.int(200);
      const values = Array.from({ length: n }, () => r.pick(['', 'a', 'b', 'c', 'd', 'É', 'e', '1', '01']));
      const order = values.map((_, i) => i).sort((x, y) => (values[x]! < values[y]! ? -1 : values[x]! > values[y]! ? 1 : x - y));
      const g = spanGrid([{ id: 'v', merge: true }], values.map((v) => [v]), { order });
      const m = buildSpanMap(g.input);
      const owners = new Set<string>();
      let blanks = 0;
      for (let i = 0; i < n; i++) {
        if (values[order[i]!] === '') blanks++;
        else owners.add(JSON.stringify(m.ownerAt(i, 0) ?? i));
      }
      expect(owners.size, `seed ${seed}`).toBe(new Set(values.filter((v) => v !== '')).size);
      expect(blanks).toBe(values.filter((v) => v === '').length);
      for (let i = 0; i < n; i++) if (values[order[i]!] === '') expect(m.ownerAt(i, 0)).toBeNull();
    }
  });
});
