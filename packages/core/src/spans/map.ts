import type { ResolvedColumn, SpanCtx } from '../columns/defs.js';
import type { DisplayIndex, RowKey } from '../ids.js';
import { problem, type Problem, type ProblemCode } from '../problems.js';
import type { DisplayedRows } from '../row/displayed.js';
import type { DataNode, RowNode } from '../row/node.js';
import { ctxKey, type LocaleCtx } from '../value/locale.js';
import { exportText, runEnds } from './merge.js';

/** A spanned cell: its origin (top-start slot) and how many rows and columns it covers. */
export interface SpanCell {
  readonly row: number;
  readonly col: number;
  readonly rows: number;
  readonly cols: number;
}

/** What moving needs from a span map: the cell owning a slot, null for a plain one. */
export interface SpanLookup {
  ownerAt(row: number, col: number): SpanCell | null;
}

/**
 * Where the cells span, for one displayed order and one set of visible
 * columns: positions are display indices and visible-column indices (start,
 * centre, end), never the window or the scroll.
 */
export interface SpanMap extends SpanLookup {
  /** Bumped by every new map. */
  readonly version: number;
  /** No span rule on a visible column and no full-width rule: nothing spans. */
  readonly none: boolean;
  /** The origins above `firstRow` of the spans reaching it, by column (at most one per column). */
  coveringAbove(firstRow: number): SpanCell[];
  /** The spans of a row meeting the columns `colFirst` to `colLast`, once each, by column. */
  inRow(row: number, colFirst: number, colLast: number): SpanCell[];
  /** The row is one cell over every column (its owner covers them all). */
  fullWidth(row: number): boolean;
  /**
   * What this map has to tell: the refused rules and answers, the overlaps,
   * and the clipped spans not already told under the same column layout
   * (which columns show, where, in what order; widths do not count).
   */
  readonly problems: readonly Problem[];
}

/** The columns a map is built on: what a `ColumnModel` gives. */
export interface SpanColumns<T> {
  readonly layout: {
    readonly start: { readonly columns: readonly ResolvedColumn<T>[] };
    readonly center: { readonly columns: readonly ResolvedColumn<T>[] };
    readonly end: { readonly columns: readonly ResolvedColumn<T>[] };
  };
  get(id: string): ResolvedColumn<T> | undefined;
}

export interface SpanInput<T> {
  /** The rows as displayed (sorted, filtered, the page). */
  readonly rows: DisplayedRows<T>;
  readonly columns: SpanColumns<T>;
  readonly ctx: LocaleCtx;
  /**
   * `settings.fullWidth`: a row that is one wide cell. A function is the
   * rule; `undefined`, `null` or `false`: no full-width row; anything else is
   * refused (`invalid-span` at `settings.fullWidth`).
   */
  readonly fullWidth?: ((row: Readonly<T>) => boolean | { readonly part?: string }) | null | undefined;
  /**
   * A cell's stable export text, null for a blank (an export cache, through
   * the edit overlay). Defaults to the column's codec. Part of the memo key:
   * a new reader is a new map. One that throws costs its slot (a blank), told
   * once per column.
   */
  readonly text?: ((col: ResolvedColumn<T>, row: Readonly<T>, index: number) => string | null) | undefined;
  /**
   * A row that never continues a span from the row above, in any column (a gap before it, row-gaps.md); a span
   * may start on it. Must not throw. Part of the memo key (identity).
   */
  readonly apart?: ((row: number) => boolean) | undefined;
  /**
   * A tree's column (spans.md « In a tree »): there, a parent's slot and the slot under it never continue a span
   * from the row above (a parent keeps its cell; a lazy one not loaded counts); a column span starting on it or
   * covering it is refused (`invalid-span`, detail `tree`), its cell drawn alone. Part of the memo key.
   */
  readonly treeColumn?: string | undefined;
}

/** At most this many problems of one code per column are told; the rest are counted. */
const MAX_TOLD = 10;

interface Memo {
  /** The rows, their version, the full-width rule, the text reader, `apart`, the tree column, the language. */
  readonly deps: readonly unknown[];
  readonly columns: SpanColumns<unknown>;
  /** The visible columns of each segment, in order: new definitions are new objects, so this also tells them (widths do not count). */
  readonly segs: readonly (readonly unknown[])[];
  /** The clipped spans told under this column layout. */
  readonly told: Set<string>;
}
const MEMO = new WeakMap<SpanMap, Memo>();

/** The map was built for exactly these rows. */
export const builtFor = (map: SpanMap, rows: DisplayedRows<unknown>): boolean => {
  const m = MEMO.get(map);
  return !!m && m.deps[0] === rows && m.deps[1] === rows.version;
};

type Same<T> = (a: SpanCtx<T>, b: SpanCtx<T>) => boolean;
interface Rule<T> {
  readonly col: ResolvedColumn<T>;
  /** Visible index, and the last visible index of its segment. */
  readonly at: number;
  readonly segEnd: number;
  readonly merge?: { readonly same: Same<T> | null; readonly within: readonly ResolvedColumn<T>[] };
  readonly rowSpan?: (ctx: SpanCtx<T>) => number;
  readonly colSpan?: (ctx: SpanCtx<T>) => number;
  ends?: Uint32Array;
  /** Where a span starting on a row may end, at most: the run of one level, cut by `apart` (and parents in the tree column). */
  lim?: Uint32Array;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The span map of the displayed rows over the visible columns (step 9b
 * blueprint A). `prev`, the map last built: it is given back when nothing it
 * depends on changed (rows and their version; the columns object and the
 * visible columns of each segment, in order and by identity, so a resize or a
 * flex reshare keeps the map and new definitions do not; the full-width rule, the text reader, the
 * language), and it carries which clipped spans were told.
 *
 * Placement is in reading order (row by row, start to end): an earlier span
 * wins, a later one asked over it drops to one cell (`span-overlap`). Spans
 * stay inside their segment and inside a run of data rows of one level, not
 * crossing a full-width row (`span-clipped`, told once per column layout).
 * Pure: the same input gives the same map.
 */
export function buildSpanMap<T>(input: SpanInput<T>, prev?: SpanMap | null): SpanMap {
  const { rows, columns } = input;
  const deps = [rows, rows.version, input.fullWidth, input.text, input.apart, input.treeColumn, ctxKey(input.ctx)];
  const last = prev ? MEMO.get(prev) : undefined;
  const { start, center, end } = columns.layout;
  const segs = [start.columns, center.columns, end.columns];
  const sameLayout =
    !!last && last.columns === columns &&
    last.segs.every((s, i) => s.length === segs[i]!.length && s.every((c, j) => c === segs[i]![j]));
  if (sameLayout && prev && deps.every((x, j) => x === last!.deps[j])) return prev;
  const told = new Set(sameLayout ? last!.told : []);

  const problems: Problem[] = [];
  const counts = new Map<string, number>();
  // Ten per code and column, then a count.
  const say = (code: ProblemCode, col: string, path: string, detail?: string): void => {
    const k = `${code}|${col}`;
    const n = (counts.get(k) ?? 0) + 1;
    counts.set(k, n);
    if (n <= MAX_TOLD) problems.push(problem(code, code === 'invalid-span' ? 'error' : 'warning', path, detail));
  };

  const visible = [...start.columns, ...center.columns, ...end.columns];
  const nCols = visible.length;
  const segEnds = [start.columns.length, start.columns.length + center.columns.length, nCols];

  // The rules of the visible columns; a refused one is said and dropped.
  const rules: Rule<T>[] = [];
  visible.forEach((col, at) => {
    const d = col.def;
    const at_ = `columns.${col.id}`;
    if (d.merge !== undefined && (d.rowSpan !== undefined || d.colSpan !== undefined)) return void say('invalid-span', col.id, at_, 'merge with rowSpan or colSpan');
    const segEnd = segEnds.find((e) => at < e)! - 1;
    const rule: { -readonly [K in keyof Rule<T>]: Rule<T>[K] } = { col, at, segEnd };
    for (const k of ['rowSpan', 'colSpan'] as const) {
      if (d[k] === undefined) continue;
      if (typeof d[k] === 'function') rule[k] = d[k];
      else say('invalid-span', col.id, `${at_}.${k}`);
    }
    if (d.merge !== undefined) {
      const m: unknown = d.merge;
      let same: Same<T> | null = null;
      let within: unknown = undefined;
      if (typeof m === 'function') same = m as Same<T>;
      else if (isObj(m)) {
        if (m.same !== undefined && typeof m.same !== 'function') return void say('invalid-span', col.id, `${at_}.merge.same`);
        same = (m.same as Same<T> | undefined) ?? null;
        within = m.within;
      } else if (m !== true) return void say('invalid-span', col.id, `${at_}.merge`);
      if (within !== undefined && !(Array.isArray(within) && within.every((w) => typeof w === 'string'))) return void say('invalid-span', col.id, `${at_}.merge.within`);
      const cuts: ResolvedColumn<T>[] = [];
      for (const id of (within as readonly string[] | undefined) ?? []) {
        const w = columns.get(id);
        if (w) cuts.push(w);
        else say('invalid-span', col.id, `${at_}.merge.within`, id);
      }
      rule.merge = { same, within: cuts };
    }
    if (rule.merge || rule.rowSpan || rule.colSpan) rules.push(rule);
  });

  const fwIn: unknown = input.fullWidth;
  const fwRule = typeof fwIn === 'function' ? input.fullWidth! : null;
  if (!fwRule && fwIn != null && fwIn !== false) say('invalid-span', '', 'settings.fullWidth', 'not a function');
  const none = !rules.length && !fwRule;
  const n = none ? 0 : rows.count;

  // Pass 1: the nodes, the full-width rows, and where each run of data rows of one level ends.
  const nodes: RowNode<T>[] = new Array(n);
  // Spans are refused with trees and details (D9): a row that is not data reads as none.
  const dataOf = (i: number): T | null => (nodes[i]!.kind === 'data' ? (nodes[i] as DataNode<T>).data : null);
  const fw = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const node = rows.nodeAt(i as DisplayIndex);
    nodes[i] = node;
    if (fwRule && node.kind === 'data') {
      try {
        if (fwRule(node.data)) fw[i] = 1;
      } catch {
        say('invalid-span', '', `rows[${i}]`, 'fullWidth threw');
      }
    }
  }
  const spannable = (i: number) => nodes[i]!.kind === 'data' && !fw[i];
  // A run is of one level (siblings, in a tree's order), cut before a row `apart` (a gap); in the tree column, also around a parent.
  // A parent: children shown, or not known yet (-1, a lazy one).
  const lone = (i: number) => !!(rows as { childrenAt?: (i: DisplayIndex) => number }).childrenAt?.(i as DisplayIndex);
  const ends = (tree: boolean): Uint32Array => {
    const e = new Uint32Array(n);
    for (let i = n - 1; i >= 0; i--) e[i] = i < n - 1 && spannable(i) && spannable(i + 1) && nodes[i + 1]!.level === nodes[i]!.level && !input.apart?.(i + 1) && !(tree && (lone(i) || lone(i + 1))) ? e[i + 1]! : i;
    return e;
  };
  const blockEnd = ends(false);
  let treeEnd: Uint32Array | undefined;
  for (const rule of rules) rule.lim = rule.col.id === input.treeColumn ? (treeEnd ??= ends(true)) : blockEnd;
  const treeAt = visible.findIndex((c) => c.id === input.treeColumn);

  // What a rule is told: two reused objects (a merge compares two cells).
  const ctxA = { row: null as unknown, value: undefined as unknown, key: '' as RowKey, index: 0, column: '', prev: null as unknown, next: null as unknown };
  const ctxB = { ...ctxA };
  const fill = (c: typeof ctxA, col: ResolvedColumn<T>, i: number): SpanCtx<T> => {
    const row = dataOf(i);
    c.row = row;
    try {
      c.value = col.read(row as T);
    } catch {
      c.value = undefined;
    }
    c.key = nodes[i]!.key;
    c.index = i;
    c.column = col.id;
    c.prev = i > 0 ? dataOf(i - 1) : null;
    c.next = i < n - 1 ? dataOf(i + 1) : null;
    return c as SpanCtx<T>;
  };

  // The run index of each merging column, on the stable texts.
  const read = input.text ?? exportText<T>(input.ctx);
  const texts = new Map<string, (string | null)[]>();
  const textsOf = (col: ResolvedColumn<T>): (string | null)[] => {
    let t = texts.get(col.id);
    if (!t) {
      t = new Array(n);
      let told = false;
      for (let i = 0; i < n; i++) {
        try {
          t[i] = read(col, dataOf(i) as T, i);
        } catch {
          t[i] = null;
          if (!told) say('invalid-span', col.id, `columns.${col.id}`, 'threw');
          told = true;
        }
      }
      texts.set(col.id, t);
    }
    return t;
  };
  for (const rule of rules) {
    if (!rule.merge) continue;
    const { same, within } = rule.merge;
    const t = textsOf(rule.col);
    const cuts = within.map(textsOf);
    const lim = rule.lim!;
    rule.ends = runEnds(n, (i) => {
      if (lim[i]! <= i || t[i] === null || t[i + 1] === null) return false;
      for (const w of cuts) if (w[i] === null || w[i] !== w[i + 1]) return false;
      if (!same) return t[i] === t[i + 1];
      try {
        return same(fill(ctxA, rule.col, i), fill(ctxB, rule.col, i + 1)) === true;
      } catch {
        say('invalid-span', rule.col.id, `rows[${i}].${rule.col.id}.merge`, 'threw');
        return false;
      }
    });
  }

  // Pass 2, in reading order. `until[c]`: the last row column c is covered to, by a span placed already.
  const until = new Int32Array(nCols).fill(-1);
  const sRow: number[] = [];
  const sCol: number[] = [];
  const sRows: number[] = [];
  const sCols: number[] = [];
  const colStarts: number[][] = visible.map(() => []);
  const colIds: number[][] = visible.map(() => []);
  const ask = (fn: (c: SpanCtx<T>) => number, col: ResolvedColumn<T>, i: number, k: string): number => {
    let v: unknown;
    try {
      v = fn(fill(ctxA, col, i));
    } catch {
      say('invalid-span', col.id, `rows[${i}].${col.id}.${k}`, 'threw');
      return 1;
    }
    if (Number.isInteger(v) && (v as number) >= 1) return v as number;
    say('invalid-span', col.id, `rows[${i}].${col.id}.${k}`, 'not a whole number');
    return 1;
  };
  const clipped = (col: string, why: 'rows' | 'segment'): void => {
    const k = `${col}|${why}`;
    if (told.has(k)) return;
    told.add(k);
    problems.push(problem('span-clipped', 'warning', `columns.${col}`, why));
  };
  for (let r = 0; r < n; r++) {
    if (!spannable(r)) continue;
    for (const rule of rules) {
      const c = rule.at;
      if (until[c]! >= r) continue;
      let h = 1;
      let w = 1;
      if (rule.ends) h = rule.ends[r]! - r + 1;
      else {
        if (rule.rowSpan) h = ask(rule.rowSpan, rule.col, r, 'rowSpan');
        if (rule.colSpan) w = ask(rule.colSpan, rule.col, r, 'colSpan');
      }
      const most = rule.lim![r]! - r + 1;
      if (h > most) {
        h = most;
        clipped(rule.col.id, 'rows');
      }
      if (w > rule.segEnd - c + 1) {
        w = rule.segEnd - c + 1;
        clipped(rule.col.id, 'segment');
      }
      if (h === 1 && w === 1) continue;
      // A column span on or over a tree's column: refused, the cell alone.
      if (w > 1 && treeAt >= c && treeAt < c + w) {
        say('invalid-span', rule.col.id, `rows[${r}].${rule.col.id}.colSpan`, 'tree');
        continue;
      }
      let free = true;
      for (let k = c + 1; k < c + w && free; k++) free = until[k]! < r;
      if (!free) {
        say('span-overlap', rule.col.id, `rows[${r}].${rule.col.id}`, `${h}x${w}`);
        continue;
      }
      const id = sRow.length;
      sRow.push(r);
      sCol.push(c);
      sRows.push(h);
      sCols.push(w);
      for (let k = c; k < c + w; k++) {
        until[k] = r + h - 1;
        colStarts[k]!.push(r);
        colIds[k]!.push(id);
      }
    }
  }
  for (const [k, count] of counts) {
    if (count <= MAX_TOLD) continue;
    const [code, col] = k.split('|') as [ProblemCode, string];
    problems.push(problem(code, code === 'invalid-span' ? 'error' : 'warning', col ? `rows.${col}` : 'rows', `${count - MAX_TOLD} more`));
  }

  const cell = (id: number): SpanCell => ({ row: sRow[id]!, col: sCol[id]!, rows: sRows[id]!, cols: sCols[id]! });
  const inRange = (r: number, c: number) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < n && c >= 0 && c < nCols;
  // The id of the span covering a slot, -1 for none; -2 for a full-width row.
  const idAt = (r: number, c: number): number => {
    if (!inRange(r, c)) return -1;
    if (fw[r]) return -2;
    const starts = colStarts[c]!;
    let lo = 0;
    let hi = starts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid]! <= r) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found < 0) return -1;
    const id = colIds[c]![found]!;
    return r < sRow[id]! + sRows[id]! ? id : -1;
  };
  const ownerAt = (r: number, c: number): SpanCell | null => {
    const id = idAt(r, c);
    return id === -2 ? { row: r, col: 0, rows: 1, cols: nCols } : id < 0 ? null : cell(id);
  };
  const spanned = colStarts.flatMap((s, c) => (s.length ? [c] : []));
  const map: SpanMap = {
    version: (prev?.version ?? 0) + 1,
    none,
    ownerAt,
    coveringAbove(first) {
      const out: SpanCell[] = [];
      const seen = new Set<number>();
      for (const c of spanned) {
        const id = idAt(first, c);
        if (id >= 0 && sRow[id]! < first && !seen.has(id)) {
          seen.add(id);
          out.push(cell(id));
        }
      }
      return out;
    },
    inRow(row, colFirst, colLast) {
      const out: SpanCell[] = [];
      const seen = new Set<number>();
      for (let c = Math.max(0, colFirst); c <= Math.min(nCols - 1, colLast); c++) {
        const id = idAt(row, c);
        if (id === -1 || seen.has(id)) continue;
        seen.add(id);
        out.push(id === -2 ? ownerAt(row, c)! : cell(id));
      }
      return out;
    },
    fullWidth: (r) => inRange(r, 0) && fw[r] === 1,
    problems,
  };
  MEMO.set(map, { deps, columns: columns as SpanColumns<unknown>, segs, told });
  return map;
}

/** The cell owning a slot, as `api.spanOf` answers it (positions; the grid turns them into a row key and a column id). */
export const spanAt = (map: SpanMap | null, row: number, col: number): SpanCell | null => (map ? map.ownerAt(row, col) : null);
