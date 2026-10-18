import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, type ColumnDef, type ColumnState, type DisplayedRows, type Intent, type SpanCtx } from '@dzgrid/core';
import { buildSpanMap, navigate, type SpanCell, type SpanInput, type SpanMap } from '@dzgrid/core/spans';
import { nodeRows, rng, type Row } from './support/spans.js';

/**
 * Differential tests: buildSpanMap against an oracle written from first
 * principles (an HTML-table-like placement over a dense grid of slots), the
 * memo against a fresh build, navigate against slot-level expectations.
 */

type Rand = ReturnType<typeof rng>;
const VALUES = ['a', 'a', 'b', '', 'A', null] as const;

interface Case {
  readonly defs: ColumnDef<Row>[];
  readonly nodes: { kind: string; level: number; data: Row }[];
  readonly fwIds: Set<string>;
  readonly state: ColumnState[];
  readonly tables: Map<string, { rowSpan?: unknown[]; colSpan?: unknown[] }>;
}

const val = (t: unknown[], i: number): number => {
  const v = t[i];
  if (v === 'throw') throw new Error('boom');
  return v as number;
};

function randomCase(r: Rand): Case {
  const nCols = 1 + r.int(7);
  const nRows = 1 + r.int(25);
  const ids = Array.from({ length: nCols }, (_, c) => `c${c}`);
  const tables = new Map<string, { rowSpan?: unknown[]; colSpan?: unknown[] }>();
  const spanVal = () => {
    const x = r.next();
    return x < 0.6 ? 1 : x < 0.85 ? 1 + r.int(5) : r.pick([0, 2.5, -1, 'throw', Number.NaN, 30]);
  };
  const defs: ColumnDef<Row>[] = ids.map((id) => {
    const kind = r.int(9);
    const t = { rowSpan: Array.from({ length: nRows }, spanVal), colSpan: Array.from({ length: nRows }, spanVal) };
    tables.set(id, t);
    const rs = (x: SpanCtx<Row>) => val(t.rowSpan, x.index);
    const cs = (x: SpanCtx<Row>) => val(t.colSpan, x.index);
    const other = r.pick(ids);
    return {
      id,
      ...(r.next() < 0.3 && { pinned: r.pick(['start', 'end'] as const) }),
      ...(r.next() < 0.15 && { hidden: true }),
      ...(kind === 1 && { merge: true as const }),
      ...(kind === 2 && { merge: { within: [other] } }),
      ...(kind === 3 && { merge: (a: SpanCtx<Row>, b: SpanCtx<Row>) => String(a.value).toLowerCase() === String(b.value).toLowerCase() }),
      ...(kind === 4 && { rowSpan: rs }),
      ...(kind === 5 && { colSpan: cs }),
      ...(kind === 6 && { rowSpan: rs, colSpan: cs }),
      // Refused: merge with a span function.
      ...(kind === 7 && { merge: true as const, rowSpan: rs }),
    } as ColumnDef<Row>;
  });
  const grouped = r.next() < 0.4;
  const nodes = Array.from({ length: nRows }, (_, i) => {
    const data: Row = { id: `r${i}` };
    for (const id of ids) data[id] = r.pick(VALUES);
    return { kind: grouped && r.next() < 0.15 ? 'group' : 'data', level: grouped ? r.int(2) : 0, data };
  });
  const fwIds = new Set(nodes.filter(() => r.next() < 0.1).map((n) => n.data.id));
  const state: ColumnState[] = r.next() < 0.5 ? ids.filter(() => r.next() < 0.3).map((id) => ({ id, order: r.next() * nCols })) : [];
  return { defs, nodes, fwIds, state, tables };
}

function inputOf(k: Case, version = 1) {
  const columns = createColumnModel<Row>(k.defs);
  if (k.state.length) columns.apply(k.state, 'api');
  const rows: DisplayedRows<Row> = nodeRows(k.nodes, version);
  const fullWidth = k.fwIds.size ? (row: Row) => k.fwIds.has(row.id) : undefined;
  const input: SpanInput<Row> = { rows, columns, ctx: localeCtx({ locale: 'en-US' }), ...(fullWidth && { fullWidth }) };
  return input;
}

interface Oracle {
  owner: (SpanCell | null)[][];
  overlaps: string[];
  clipped: Set<string>;
  nCols: number;
}

/** The placement, from first principles: a dense grid of slots, filled row by row, start to end. */
function oracle(k: Case, input: SpanInput<Row>): Oracle {
  const { start, center, end } = input.columns.layout;
  const vis = [...start.columns, ...center.columns, ...end.columns];
  const nCols = vis.length;
  const seg = vis.map((_, c) => (c < start.columns.length ? 0 : c < start.columns.length + center.columns.length ? 1 : 2));
  const n = k.nodes.length;
  const isFw = (i: number) => k.nodes[i]!.kind === 'data' && k.fwIds.has(k.nodes[i]!.data.id);
  const spannable = (i: number) => k.nodes[i]!.kind === 'data' && !isFw(i);
  const sameBlock = (i: number, j: number) => spannable(i) && spannable(j) && k.nodes[i]!.level === k.nodes[j]!.level;
  const text = (id: string, i: number): string | null => {
    const v = k.nodes[i]!.data[id];
    return v === '' || v === null || v === undefined ? null : String(v);
  };
  const owner: (SpanCell | null)[][] = Array.from({ length: n }, () => new Array(nCols).fill(null));
  const overlaps: string[] = [];
  const perCol = new Map<string, number>();
  const clipped = new Set<string>();
  for (let i = 0; i < n; i++) if (isFw(i)) owner[i]!.fill({ row: i, col: 0, rows: 1, cols: nCols });

  for (let row = 0; row < n; row++) {
    if (!spannable(row)) continue;
    for (let c = 0; c < nCols; c++) {
      const d = vis[c]!.def;
      const id = vis[c]!.id;
      if (d.merge !== undefined && (d.rowSpan || d.colSpan)) continue;
      if (d.merge === undefined && !d.rowSpan && !d.colSpan) continue;
      if (owner[row]![c]) continue;
      let h = 1;
      let w = 1;
      if (d.merge !== undefined) {
        const m = d.merge;
        const same = typeof m === 'function' ? m : typeof m === 'object' ? (m.same ?? null) : null;
        const within = typeof m === 'object' ? (m.within ?? []) : [];
        const joins = (i: number) => {
          if (!sameBlock(i, i + 1)) return false;
          const a = text(id, i);
          const b = text(id, i + 1);
          if (a === null || b === null) return false;
          for (const wid of within) {
            if (text(wid, i) === null || text(wid, i) !== text(wid, i + 1)) return false;
          }
          if (!same) return a === b;
          const ctx = (j: number) => ({ row: k.nodes[j]!.data, value: k.nodes[j]!.data[id], index: j }) as unknown as SpanCtx<Row>;
          return same(ctx(i), ctx(i + 1)) === true;
        };
        while (row + h < n && joins(row + h - 1)) h++;
      } else {
        const t = k.tables.get(id)!;
        const ok = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 ? (v as number) : 1);
        if (d.rowSpan) h = t.rowSpan![row] === 'throw' ? 1 : ok(t.rowSpan![row]);
        if (d.colSpan) w = t.colSpan![row] === 'throw' ? 1 : ok(t.colSpan![row]);
      }
      // Clip to the run of data rows of one level.
      let maxH = 1;
      while (row + maxH < n && sameBlock(row + maxH - 1, row + maxH)) maxH++;
      if (h > maxH) {
        h = maxH;
        clipped.add(`${id}|rows`);
      }
      let maxW = 1;
      while (c + maxW < nCols && seg[c + maxW] === seg[c]) maxW++;
      if (w > maxW) {
        w = maxW;
        clipped.add(`${id}|segment`);
      }
      if (h === 1 && w === 1) continue;
      let free = true;
      for (let rr = row; rr < row + h; rr++) for (let cc = c; cc < c + w; cc++) if (owner[rr]![cc]) free = false;
      if (!free) {
        const cnt = (perCol.get(id) ?? 0) + 1;
        perCol.set(id, cnt);
        if (cnt <= 10) overlaps.push(`rows[${row}].${id}|${h}x${w}`);
        continue;
      }
      const cell = { row, col: c, rows: h, cols: w };
      for (let rr = row; rr < row + h; rr++) for (let cc = c; cc < c + w; cc++) owner[rr]![cc] = cell;
    }
  }
  return { owner, overlaps, clipped, nCols };
}

const spansOf = (m: SpanMap, n: number, nCols: number) => Array.from({ length: n }, (_, r) => Array.from({ length: nCols }, (_, c) => m.ownerAt(r, c)));

const SEEDS = Array.from({ length: 400 }, (_, i) => 31337 + i * 13);

describe('buildSpanMap against a first-principles placement', () => {
  it('every slot has the owner the oracle places, over random rules, pins, hidden columns, group rows and full-width rows', () => {
    for (const seed of SEEDS) {
      const k = randomCase(rng(seed));
      const input = inputOf(k);
      const m = buildSpanMap(input);
      const o = oracle(k, input);
      const n = k.nodes.length;
      expect(spansOf(m, n, o.nCols), `seed ${seed}`).toEqual(o.owner);
      // fullWidth agrees, and a non-data row is never full width.
      for (let i = 0; i < n; i++) expect(m.fullWidth(i), `seed ${seed} row ${i} cols ${o.nCols}`).toBe(o.nCols > 0 && k.nodes[i]!.kind === 'data' && k.fwIds.has(k.nodes[i]!.data.id));
      const overlaps = m.problems.filter((p) => p.code === 'span-overlap' && p.path.startsWith('rows[')).map((p) => `${p.path}|${p.detail}`);
      expect(overlaps.sort(), `seed ${seed} overlaps`).toEqual([...o.overlaps].sort());
      const clipped = new Set(m.problems.filter((p) => p.code === 'span-clipped').map((p) => `${p.path.slice('columns.'.length)}|${p.detail}`));
      expect(clipped, `seed ${seed} clipped`).toEqual(o.clipped);
      // inRow over any window equals the distinct owners met there, by column.
      const r = rng(seed ^ 0xabc);
      for (let t = 0; t < 5 && n && o.nCols; t++) {
        const row = r.int(n);
        const a = r.int(o.nCols);
        const b = a + r.int(o.nCols - a);
        const want: SpanCell[] = [];
        for (let c = a; c <= b; c++) {
          const x = o.owner[row]![c];
          if (x && !want.includes(x)) want.push(x);
        }
        expect(m.inRow(row, a, b), `seed ${seed} inRow ${row} ${a}-${b}`).toEqual(want);
        const above: SpanCell[] = [];
        for (let c = 0; c < o.nCols; c++) {
          const x = o.owner[row]![c];
          if (x && x.row < row && !above.includes(x)) above.push(x);
        }
        expect(m.coveringAbove(row), `seed ${seed} coveringAbove ${row}`).toEqual(above);
      }
    }
  });
});

describe('the memo through prev', () => {
  it('a map built through a chain of random changes equals a fresh build of the same input', () => {
    for (const seed of SEEDS.slice(0, 150)) {
      const r = rng(seed);
      const k = randomCase(r);
      const columns = createColumnModel<Row>(k.defs);
      let version = 1;
      let nodes = k.nodes;
      let rows: DisplayedRows<Row> = nodeRows(nodes, version);
      let fullWidth: SpanInput<Row>['fullWidth'] = k.fwIds.size ? (row: Row) => k.fwIds.has(row.id) : undefined;
      let locale = 'en-US';
      let text: SpanInput<Row>['text'];
      let prev: SpanMap | null = null;
      for (let step = 0; step < 8; step++) {
        const what = r.int(8);
        const ids = columns.state().map((s) => s.id);
        if (what === 0) columns.apply([{ id: r.pick(ids), hidden: r.next() < 0.5 }], 'api');
        else if (what === 1) columns.apply([{ id: r.pick(ids), pinned: r.pick(['start', 'end', null] as const) }], 'api');
        else if (what === 2) columns.apply([{ id: r.pick(ids), order: r.next() * ids.length }], 'api');
        else if (what === 3) {
          // A sort: new order, new version.
          nodes = [...nodes].sort(() => r.next() - 0.5);
          rows = nodeRows(nodes, ++version);
        } else if (what === 4) {
          const ids2 = new Set(nodes.filter(() => r.next() < 0.2).map((x) => x.data.id));
          fullWidth = r.next() < 0.3 ? undefined : (row: Row) => ids2.has(row.id);
        } else if (what === 5) text = r.next() < 0.5 ? undefined : (col, row) => (row[col.id] ? String(row[col.id]).toUpperCase() : null);
        else if (what === 6) locale = r.pick(['en-US', 'fr-FR']);
        // what === 7: nothing changes; the memo must give prev back.
        const input: SpanInput<Row> = { rows, columns, ctx: localeCtx({ locale }), ...(fullWidth && { fullWidth }), ...(text && { text }) };
        const memo: SpanMap = buildSpanMap(input, prev);
        const fresh = buildSpanMap(input);
        const nCols = columns.layout.start.columns.length + columns.layout.center.columns.length + columns.layout.end.columns.length;
        expect(spansOf(memo, nodes.length, nCols), `seed ${seed} step ${step} change ${what}`).toEqual(spansOf(fresh, nodes.length, nCols));
        expect(memo.none).toBe(fresh.none);
        for (let i = 0; i < nodes.length; i++) expect(memo.fullWidth(i)).toBe(fresh.fullWidth(i));
        // The problems other than the clipped ones (told once per column layout) are the fresh ones.
        const notClipped = (m: SpanMap) => m.problems.filter((p) => p.code !== 'span-clipped');
        if (memo !== prev) expect(notClipped(memo)).toEqual(notClipped(fresh));
        if (what === 7 && prev) expect(memo).toBe(prev);
        prev = memo;
      }
    }
  });
});

describe('navigate under random spans', () => {
  const intents: Intent[] = [
    { kind: 'move', axis: 'row', delta: 1 },
    { kind: 'move', axis: 'row', delta: -1 },
    { kind: 'move', axis: 'col', delta: 1 },
    { kind: 'move', axis: 'col', delta: -1 },
    { kind: 'edge', axis: 'row', to: 'first' },
    { kind: 'edge', axis: 'row', to: 'last' },
    { kind: 'edge', axis: 'col', to: 'first' },
    { kind: 'edge', axis: 'col', to: 'last' },
    { kind: 'edge', axis: 'both', to: 'first' },
    { kind: 'edge', axis: 'both', to: 'last' },
    { kind: 'page', delta: 1 },
    { kind: 'page', delta: -1 },
  ] as Intent[];

  it('every key from every cell, aimed at any of its slots, lands on an origin whose cell owns the new goal', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const k = randomCase(rng(seed));
      const input = inputOf(k);
      const m = buildSpanMap(input);
      const o = oracle(k, input);
      const n = k.nodes.length;
      if (!o.nCols) continue;
      const shape = { rows: n, cols: o.nCols, page: 1 + (seed % 5) };
      const ownerOf = (r: number, c: number) => o.owner[r]![c] ?? { row: r, col: c, rows: 1, cols: 1 };
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < o.nCols; c++) {
          const cell = ownerOf(r, c);
          const from = { row: cell.row, col: cell.col };
          const goal = { row: r, col: c };
          for (const intent of intents) {
            const mv = navigate(m, shape, from, goal, intent)!;
            const tag = `seed ${seed} from ${r},${c} ${JSON.stringify(intent)}`;
            if (mv.to.row === -1) {
              // Only Up from a cell touching the first row reaches the header row, in the goal column.
              expect(intent, tag).toEqual({ kind: 'move', axis: 'row', delta: -1 });
              expect(cell.row, tag).toBe(0);
              expect(mv.to.col, tag).toBe(c);
              continue;
            }
            expect(mv.to.row >= 0 && mv.to.row < n && mv.to.col >= 0 && mv.to.col < o.nCols, tag).toBe(true);
            // Never a covered slot: the target is its own cell's origin.
            const t = ownerOf(mv.to.row, mv.to.col);
            expect({ row: t.row, col: t.col }, tag).toEqual(mv.to);
            // The goal is inside the cell focused.
            expect(mv.goal.row >= 0 && mv.goal.row < n && mv.goal.col >= 0 && mv.goal.col < o.nCols, tag).toBe(true);
            const g = ownerOf(mv.goal.row, mv.goal.col);
            expect({ row: g.row, col: g.col }, tag).toEqual(mv.to);
            // Slot-level expectations.
            if (intent.kind === 'move' && intent.axis === 'row') {
              expect(mv.goal.col, tag).toBe(c);
              const want = intent.delta > 0 ? Math.min(n - 1, cell.row + cell.rows) : cell.row - 1;
              expect(ownerOf(want, c), tag).toEqual(t);
            } else if (intent.kind === 'move') {
              const want = intent.delta > 0 ? Math.min(o.nCols - 1, cell.col + cell.cols) : Math.max(0, cell.col - 1);
              expect(ownerOf(r, want), tag).toEqual(t);
              if (t.row !== cell.row || t.col !== cell.col) expect(mv.goal.row, tag).toBe(r);
            } else if (intent.kind === 'edge') {
              const er = intent.axis === 'col' ? r : intent.to === 'first' ? 0 : n - 1;
              const ec = intent.axis === 'row' ? c : intent.to === 'first' ? 0 : o.nCols - 1;
              expect(ownerOf(er, ec), tag).toEqual(t);
              // A row edge aims at the slot reached, even inside the cell (fix 1); Home and End keep the goal there.
              if (intent.axis !== 'col' || t.row !== cell.row || t.col !== cell.col) expect(mv.goal, tag).toEqual({ row: er, col: ec });
              else expect(mv.goal, tag).toEqual(goal);
            } else if (intent.kind === 'page') {
              const pr = Math.max(0, Math.min(n - 1, r + intent.delta * shape.page));
              expect(ownerOf(pr, c), tag).toEqual(t);
              // A page key always aims at the slot reached: inside a cell taller than a page, the goal walks on (fix 1).
              expect(mv.goal, tag).toEqual({ row: pr, col: c });
            }
            // An arrow that stays put keeps the goal.
            if (intent.kind === 'move' && t.row === cell.row && t.col === cell.col) expect(mv.goal, tag).toEqual(goal);
          }
        }
      }
    }
  });

  it('a goal that the cell no longer owns is replaced by the origin', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const k = randomCase(rng(seed));
      const input = inputOf(k);
      const m = buildSpanMap(input);
      const o = oracle(k, input);
      const n = k.nodes.length;
      if (!o.nCols) continue;
      const shape = { rows: n, cols: o.nCols, page: 3 };
      const r = rng(seed + 1);
      for (let t = 0; t < 20; t++) {
        const a = { row: r.int(n), col: r.int(o.nCols) };
        const goal = { row: r.int(n), col: r.int(o.nCols) };
        const ca = o.owner[a.row]![a.col] ?? { row: a.row, col: a.col, rows: 1, cols: 1 };
        const cg = o.owner[goal.row]![goal.col] ?? { row: goal.row, col: goal.col, rows: 1, cols: 1 };
        if (ca.row === cg.row && ca.col === cg.col) continue;
        const down = navigate(m, shape, a, goal, { kind: 'move', axis: 'row', delta: 1 } as Intent)!;
        const from0 = navigate(m, shape, { row: ca.row, col: ca.col }, null, { kind: 'move', axis: 'row', delta: 1 } as Intent)!;
        expect(down, `seed ${seed}`).toEqual(from0);
      }
    }
  });
});

