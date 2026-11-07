/**
 * A server that pivots (server-pivot.md, plan S16): row i is computed from i, never held, so a million rows cost
 * nothing but a pass. For each query (grouping, pivot columns, values, sub-totals, order, search) it computes the cube
 * once — nested maps written by hand, the **oracle** of the seeded test — and keeps it; it answers the levels by block:
 * the groups with their row totals and sparse `cells` by crossing index, the first level's first block with
 * `pivot.crossings` (or `count` alone above `limit`) and the grand total row's cells. Groups and crossings in the sheet's
 * order: by value, the empty one last, `desc` reversing a pivot column; groups by a row total or a crossing's total when
 * asked (`sort`, `pivot.sort`), the empty ones last both ways.
 *
 * Modes: `sync` (the answer itself), `timers` (after `latency` ms), `hold` (each request waits for `release()`). Planted:
 * a wrong cell (`plant.cell`), a crossing of the wrong type (`plant.type`), a list that changes in a later block
 * (`plant.list`). Every request is logged. Made-up data only.
 */
import type { DataRequest, DataSource } from '@dzgrid/core/server';
import type { GroupValue, PivotPart } from '@dzgrid/core/server-side';

export interface PivotRow {
  readonly id: string;
  readonly region: string;
  readonly city: string | null;
  readonly year: number;
  readonly month: number;
  readonly amount: number;
  readonly visits: number;
}

const REGIONS = ['Nord', 'Sud', 'Est', 'Ouest', 'Centre'];
/** Row i: five regions, four towns each (none every 53rd row: the empty group), three years of twelve months each. */
export function pivotRow(i: number): PivotRow {
  const region = REGIONS[i % 5]!;
  return { id: `r${i}`, region, city: i % 53 === 0 ? null : `${region} ${'ABCD'[(i >> 2) % 4]}`, year: 2024 + (i % 3), month: 1 + ((Math.floor(i / 3) * 7) % 12), amount: (i * 37) % 1000, visits: 1 + (i % 4) };
}

type Fn = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'first' | 'last';
/** One total being made: rows, numbers, sum, min, max, first and last value. */
interface Acc { n: number; k: number; sum: number; min: number; max: number; first: unknown; last: unknown }
const acc = (): Acc => ({ n: 0, k: 0, sum: 0, min: Infinity, max: -Infinity, first: undefined, last: undefined });
const add = (a: Acc, v: unknown): void => {
  a.n++;
  if (a.first === undefined) a.first = v;
  a.last = v;
  if (typeof v == 'number') (a.k++, (a.sum += v), v < a.min && (a.min = v), v > a.max && (a.max = v));
};
const out = (a: Acc, fn: Fn): number | unknown =>
  fn === 'count' ? a.n : fn === 'first' ? a.first : fn === 'last' ? a.last : !a.k ? null : fn === 'sum' ? a.sum : fn === 'avg' ? a.sum / a.k : fn === 'min' ? a.min : a.max;

/** A group of the cube: its value, rows, totals per value, cells per crossing key, children by value key. */
export interface CubeNode {
  readonly value: GroupValue;
  count: number;
  readonly totals: Acc[];
  readonly cells: Map<string, Acc[]>;
  readonly kids: Map<string, CubeNode>;
}
export interface Cube {
  readonly root: CubeNode;
  /** The crossings in the sheet's order (with the band paths when sub-totalled). */
  readonly crossings: GroupValue[][];
  readonly aggs: readonly { readonly column: string; readonly fn: Fn }[];
}

const node = (value: GroupValue): CubeNode => ({ value, count: 0, totals: [], cells: new Map(), kids: new Map() });
const key = (p: readonly GroupValue[]): string => JSON.stringify(p);
/** By value, the empty one last whatever the direction. */
const byValue = (dir: number) => (a: GroupValue, b: GroupValue): number => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : (a < b ? -1 : a > b ? 1 : 0) * dir);

export interface FakePivotOptions {
  /** Rows behind (1 000 000 by default). */
  readonly rows?: number;
  readonly mode?: 'sync' | 'timers' | 'hold';
  readonly latency?: number;
  readonly plant?: { readonly cell?: boolean; readonly type?: boolean; readonly list?: boolean };
}

export function fakePivotServer(o: FakePivotOptions = {}) {
  const N = o.rows ?? 1_000_000;
  const cubes = new Map<string, Cube>();
  const requests: DataRequest[] = [];
  const held: (() => void)[] = [];
  let built = 0;

  /** The cube of a query: one pass over the rows the search keeps. */
  const cubeOf = (by: readonly string[], p: PivotPart, aggs: Cube['aggs'], quick: string | undefined): Cube => {
    const k = JSON.stringify([by, p.columns, p.desc ?? [], p.subtotals ?? false, aggs, quick ?? '']);
    let c = cubes.get(k);
    if (c) return c;
    built++;
    const root = node(null);
    const crossings = new Map<string, GroupValue[]>();
    const q = quick?.trim().toLowerCase();
    for (let i = 0; i < N; i++) {
      const r = pivotRow(i) as unknown as Record<string, GroupValue>;
      if (q && !`${r.region} ${r.city ?? ''}`.toLowerCase().includes(q)) continue;
      const xp = p.columns.map((id) => r[id] ?? null);
      // The crossing and, sub-totalled, its bands: each a cell key.
      const xs: string[] = [];
      for (let l = p.subtotals ? 1 : xp.length; l <= xp.length && xp.length; l++) {
        const path = xp.slice(0, l);
        const xk = key(path);
        xs.push(xk);
        if (!crossings.has(xk)) crossings.set(xk, path);
      }
      const vals = aggs.map((a) => r[a.column]);
      const visit = (n: CubeNode): void => {
        n.count++;
        vals.forEach((v, j) => add((n.totals[j] ??= acc()), v));
        for (const xk of xs) {
          const cell = n.cells.get(xk) ?? (n.cells.set(xk, []), n.cells.get(xk)!);
          vals.forEach((v, j) => add((cell[j] ??= acc()), v));
        }
      };
      visit(root);
      let n = root;
      for (const id of by) {
        const v = r[id] ?? null;
        const vk = key([v]);
        n = n.kids.get(vk) ?? (n.kids.set(vk, node(v)), n.kids.get(vk)!);
        visit(n);
      }
    }
    // The sheet's order of the crossings: level by level by value, `desc` reversing, the empty one last; a band first.
    const cmp = (a: GroupValue[], b: GroupValue[]): number => {
      for (let l = 0; l < Math.min(a.length, b.length); l++) {
        const d = byValue(p.desc?.includes(p.columns[l]!) ? -1 : 1)(a[l]!, b[l]!);
        if (d) return d;
      }
      return a.length - b.length;
    };
    c = { root, crossings: [...crossings.values()].sort(cmp), aggs };
    cubes.set(k, c);
    return c;
  };

  const totalsOf = (c: Cube, n: CubeNode): Record<string, unknown> => Object.fromEntries(c.aggs.map((a, j) => [a.column, n.totals[j] ? out(n.totals[j]!, a.fn) : null]));
  const cellsOf = (c: Cube, n: CubeNode): Record<string, Record<string, unknown>> => {
    const r: Record<string, Record<string, unknown>> = {};
    c.crossings.forEach((x, i) => {
      const cell = n.cells.get(key(x));
      if (cell) r[i] = Object.fromEntries(c.aggs.map((a, j) => [a.column, out(cell[j]!, a.fn)]));
    });
    return r;
  };

  const answer = (req: DataRequest): unknown => {
    const g = req.group;
    const page = req.page!;
    if (!g) {
      // Not grouped: the rows themselves.
      const rows = Array.from({ length: Math.max(0, Math.min(page.size, N - page.offset)) }, (_, j) => pivotRow(page.offset + j));
      return { rows, total: N };
    }
    const p = g.pivot ?? { columns: [], limit: Infinity };
    const c = cubeOf(g.by, p, g.aggs as Cube['aggs'], req.quick);
    let n: CubeNode | undefined = c.root;
    for (const v of g.path) n = n?.kids.get(key([v]));
    if (!n) return { groups: [], total: 0 };
    if (!g.pivot && g.path.length >= g.by.length) {
      // The rows of a group (a grouping without the pivot): scanned.
      const rows: PivotRow[] = [];
      for (let i = 0; i < N && rows.length < page.offset + page.size; i++) {
        const r = pivotRow(i) as unknown as Record<string, GroupValue>;
        if (g.by.every((id, l) => (r[id] ?? null) === g.path[l])) rows.push(r as unknown as PivotRow);
      }
      return { rows: rows.slice(page.offset), total: n.count };
    }
    // The children in order: by value (a sort on the grouping column reverses), by a row total, or by a crossing's total.
    const kids = [...n.kids.values()];
    const s = req.sort?.find((x) => g.aggs.some((a) => a.column === x.column) || g.by.includes(x.column));
    const ps = g.pivot?.sort;
    const total = (k: CubeNode): unknown => {
      if (ps) {
        const j = c.aggs.findIndex((a) => a.column === ps.column);
        const cell = k.cells.get(key(ps.crossing as GroupValue[]));
        return cell && j >= 0 ? out(cell[j]!, c.aggs[j]!.fn) : null;
      }
      const j = c.aggs.findIndex((a) => a.column === s!.column);
      return out(k.totals[j]!, c.aggs[j]!.fn);
    };
    if (ps || (s && !g.by.includes(s.column))) {
      const dir = (ps ?? s)!.dir === 'desc' ? -1 : 1;
      kids.sort((a, b) => byValue(dir)(total(a) as GroupValue, total(b) as GroupValue));
    } else kids.sort((a, b) => byValue(s?.dir === 'desc' ? -1 : 1)(a.value, b.value));
    const slice = kids.slice(page.offset, page.offset + page.size);
    const first = page.offset === 0 && g.path.length === 0;
    const over = c.crossings.length > p.limit;
    const groups = slice.map((k, j) => {
      const cells = over ? undefined : cellsOf(c, k);
      if (o.plant?.cell && first && j === 0 && cells?.[0]) cells[0] = { ...cells[0], [c.aggs[0]!.column]: 999_999 };
      return { value: k.value, count: k.count, aggs: totalsOf(c, k), ...(cells && { cells }) };
    });
    const r: Record<string, unknown> = { groups, total: kids.length };
    if (g.path.length === 0) {
      r.totals = totalsOf(c, c.root);
      let list: unknown[] = c.crossings;
      if (o.plant?.type && list.length) list = [[String((list[0] as GroupValue[])[0]), ...(list[0] as GroupValue[]).slice(1)], ...list.slice(1)];
      if (first) r.pivot = over ? { count: c.crossings.length } : { crossings: list, totals: cellsOf(c, c.root) };
      else if (o.plant?.list) r.pivot = { crossings: [...list].reverse() };
    }
    return r;
  };

  const source: DataSource<PivotRow> = {
    fetch(req) {
      requests.push(req);
      if (o.mode === 'timers') return new Promise((ok) => setTimeout(() => ok(answer(req) as never), o.latency ?? 150));
      if (o.mode === 'hold') {
        // A thenable answered inside `release` (no microtask): the walk stays synchronous.
        let ok: ((v: unknown) => void) | undefined;
        held.push(() => ok?.(answer(req)));
        return { then: (f: (v: unknown) => void) => void (ok = f) } as never;
      }
      return answer(req) as never;
    },
  };
  return {
    source,
    requests,
    /** The oracle: the cube of a request (built if needed). */
    cube: (req: DataRequest): Cube => cubeOf(req.group!.by, req.group!.pivot ?? { columns: [], limit: Infinity }, req.group!.aggs as Cube['aggs'], req.quick),
    /** Hold mode: answers the oldest request waiting (all with `all`); how many were answered. */
    release(all = false): number {
      const n = all ? held.length : Math.min(1, held.length);
      for (const f of held.splice(0, n)) f();
      return n;
    },
    /** Hold mode: answers the request waiting at place `i` (the permutations pick the order). */
    releaseAt(i: number): void {
      held.splice(i, 1)[0]?.();
    },
    get waiting() { return held.length; },
    get built() { return built; },
    out,
    key,
  };
}
