import type { AggFn, AggFuncName, ResolvedColumn } from '../columns/defs.js';
import type { ColumnLookup } from '../columns/model.js';
import { groupKey, idOfDataKey, type DisplayIndex, type RowKey } from '../ids.js';
import type { ClientModel, RowShape, ShapeInput } from '../model/client.js';
import type { ColumnEnv } from '../model/column-cache.js';
import type { ChangeSource } from '../model/types.js';
import { problem, type Problem } from '../problems.js';
import type { FooterNode, GroupNode, RowNode } from '../row/node.js';
import type { RowSnapshot } from '../row/store.js';
import type { TreeRows } from '../tree/shape.js';
import { ctxKey } from '../value/locale.js';
import { totalsOf, valueAt, type Totals } from './agg.js';

/** How rows are grouped and totalled (row-grouping.md, aggregation.md; ARCHITECTURE §3.13, Phase 7). Bad values never throw: told and bent. */
export interface GroupingOptions {
  /** The grouping columns' ids, the first level first; empty (default): the rows flat. */
  readonly by?: readonly string[];
  /** Totals by column id; they win over a column's own `aggFunc`. */
  readonly aggFuncs?: Readonly<Record<string, AggFuncName | AggFn>>;
  /** What is open at the first load: nothing (default, owner Q-E1 A), everything, or the levels above a depth (1: the first). */
  readonly expanded?: 'none' | 'all' | number;
  /** Totals rows: none (default), a footer per open group, the grand total, or both (aggregation.md 9–10). */
  readonly footers?: 'none' | 'group' | 'grand' | 'both';
  /** Where the grand total sits: after the rows (default) or before them. */
  readonly grandTotal?: 'top' | 'bottom';
}

/** The grouped rows as shown: a tree's rows (the tree painter draws them), groups and totals rows included. */
export type GroupedRows<T> = TreeRows<T>;

export interface GroupShape<T> extends RowShape<T> {
  readonly kind: 'group';
  /** The options it was made with (Phase 8: a server-side model groups on the server by them: its totals, its totals rows). */
  readonly options?: GroupingOptions;
  /** The grouping columns as given (the last `setBy`); unknown or refused ones are told, and skipped when grouping. */
  readonly by: readonly string[];
  /** Groups by other columns, at once (told as a `rows` change); the open groups are kept (a group's key names its column). */
  setBy(by: readonly string[], source?: ChangeSource): void;
  /** The grand totals by column id, over the rows the filters keep, whatever the footers (aggregation.md 11); `{}` before any build. */
  totals(): Readonly<Record<string, unknown>>;
  /**
   * Grouping steps aside for good (a server source, a tree beside it; plan D16, D20): the rows flat, no totals rows, no
   * totals, `setBy` ignored. Told as a `rows` change.
   */
  off(): void;
  /** Work done, for tests: structures built (a regroup), totals computed, flattens. */
  readonly diagnostics: { readonly builds: number; readonly aggs: number; readonly flattens: number };
}

/** A setting's text for a problem: a string or a number as is, anything else by its type (never a throw). */
export const named = (v: unknown): string => (typeof v == 'string' || typeof v == 'number' ? String(v) : typeof v);

/** Types whose sort key is the value itself, one to one: grouped by it. Every other type by its export text. */
const BY_KEY = /^(number|day|instant|boolean)$/;

/** What a row is grouped by in a column (D3, Q-G3 A): its sort key (NaN when empty) or its export text (null when empty). */
const identity = <T>(c: ResolvedColumn<T>, env: ColumnEnv<T>): ((src: number) => unknown) => {
  if (BY_KEY.test(c.type)) {
    const k = env.cache.keys(c, env).keys;
    return (s) => k[s];
  }
  return (s) => {
    const v = valueAt(c, env, s);
    return v === null ? null : c.codec.toExport(v as never);
  };
};
const FOOTERS = ['none', 'group', 'grand', 'both'];

/**
 * One grouping of one order (row-grouping.md 1–4): groups numbered in the order they are met, each with its level, its
 * parent (-1: none), a row holding its value, and its value's identity; children sorted by value; the leaves of the
 * all-open order, each group's a contiguous range of them.
 */
interface Groups<T> {
  readonly snap: RowSnapshot<T>;
  readonly order: Uint32Array | null;
  readonly cols: readonly ResolvedColumn<T>[];
  readonly G: number;
  readonly lv: Int32Array;
  readonly up: Int32Array;
  /** Children of the root (index 0) and of group g (index g + 1): `kids[ks[x] .. ks[x + 1])`, sorted. Deepest groups have none. */
  readonly ks: Int32Array;
  readonly kids: Int32Array;
  readonly lo: Int32Array;
  readonly hi: Int32Array;
  readonly leaves: Uint32Array;
  /** Each group's value (typed), label and key, from its first row. */
  readonly val: unknown[];
  readonly label: string[];
  readonly key: RowKey[];
  /** Each group's value identity (`identity`), for a live update's check. */
  readonly gid: unknown[];
  /** The deepest group of a row, by source index (-1: not in the grouping), made when asked. */
  of?: Int32Array;
  byKey?: Map<string, number>;
}

/**
 * The grouping (D2, owner answers 2026-11-04): a row shape over the filtered, sorted rows. Each stage keeps its result
 * while its inputs keep their identity: opening a group only flattens again; a live update or an edit that moves no
 * grouping value totals again without regrouping.
 */
export function groupShape<T>(o: GroupingOptions = {}): GroupShape<T> {
  const d = { builds: 0, aggs: 0, flattens: 0 };
  const told: Problem[] = [];
  const bad = (path: string, v: unknown): void => void told.push(problem('invalid-setting', 'warning', `grouping.${path}`, named(v)));
  let by: readonly string[] = [];
  if (Array.isArray(o.by)) by = o.by.slice();
  else if (o.by !== undefined) bad('by', typeof o.by);
  let footers = o.footers ?? 'none';
  if (!FOOTERS.includes(footers)) bad('footers', footers), (footers = 'none');
  let top = o.grandTotal === 'top';
  if (o.grandTotal !== undefined && !top && o.grandTotal !== 'bottom') bad('grandTotal', o.grandTotal);
  let expanded = o.expanded;
  if (expanded !== undefined && expanded !== 'none' && expanded !== 'all' && !(typeof expanded == 'number' && expanded >= 1)) bad('expanded', expanded), (expanded = undefined);
  let aggFuncs = o.aggFuncs;
  if (aggFuncs !== undefined && (aggFuncs === null || typeof aggFuncs != 'object')) bad('aggFuncs', typeof aggFuncs), (aggFuncs = undefined);
  let footG = footers === 'group' || footers === 'both';
  let footT = footers === 'grand' || footers === 'both';
  let off = false;

  let model: ClientModel<T> | null = null;
  let redraw: ((kind?: 'rows' | 'expand', source?: ChangeSource) => void) | null = null;
  /** Bumped by `setBy`: the grouping is built again. */
  let byV = 0;
  /** An edit moved a grouping value: regroup at the next whole run (the order no longer stale). */
  let pending = false;
  /** The grouping columns as used and what refusing others told, for the `by` and the columns they were read under. */
  let used: { byV: number; cols: unknown; dv: number; list: ResolvedColumn<T>[]; ps: Problem[] } | null = null;
  let S: (Groups<T> & { byV: number; ctx: string; colsRef: unknown; dv: number; desc: string }) | null = null;
  let A: { S: Groups<T>; reader: number; snap: RowSnapshot<T>; t: Totals } | null = null;
  let open: Uint8Array | null = null;
  let last: GroupedRows<T> | null = null;
  let all: GroupedRows<T> | null = null;
  let flat: (all: boolean) => GroupedRows<T> = null as never;
  let P: { u: unknown; a: unknown; n: number; list: readonly Problem[] } = { u: null, a: null, n: -1, list: told };

  const columnsOf = (env: ColumnEnv<T>): ResolvedColumn<T>[] => {
    if (used?.byV !== byV || used.cols !== env.columns || used.dv !== env.columns.dataVersion) {
      const list: ResolvedColumn<T>[] = [];
      const ps: Problem[] = [];
      for (const id of by) {
        const col = env.columns.get(id);
        // A column the grid does not know, one refused, or one given twice: dropped, told by its id.
        if (!col) ps.push(problem('unknown-column', 'warning', 'grouping.by', named(id)));
        else if (col.def.groupable === false || list.includes(col)) ps.push(problem('invalid-setting', 'warning', 'grouping.by', id));
        else list.push(col);
      }
      used = { byV, cols: env.columns, dv: env.columns.dataVersion, list, ps };
    }
    return used.list;
  };

  /** Groups `order` (null: every row in source order) by `cols` (row-grouping.md 1–4). */
  const group = (env: ColumnEnv<T>, order: Uint32Array | null, cols: readonly ResolvedColumn<T>[], desc: string): Groups<T> => {
    d.builds++;
    const snap = env.source;
    const N = order ? order.length : snap.count;
    const L = cols.length;
    const ident = cols.map((c) => identity(c, env));
    const up: number[] = [];
    const lv: number[] = [];
    const first: number[] = [];
    const gid: unknown[] = [];
    const maps: Map<unknown, number>[] = [];
    const deep = new Int32Array(N);
    for (let k = 0; k < N; k++) {
      const s = order ? order[k]! : k;
      let g = -1;
      for (let l = 0; l < L; l++) {
        const m = (maps[g + 1] ??= new Map());
        const v = ident[l]!(s);
        let c = m.get(v);
        if (c === undefined) m.set(v, (c = up.push(g) - 1)), lv.push(l), first.push(s), gid.push(v);
        g = c;
      }
      deep[k] = g;
    }
    const G = up.length;
    // Children by parent (index 0: the root), in the order met, then sorted by value (row-grouping.md 4).
    const ks = new Int32Array(G + 2);
    for (let g = 0; g < G; g++) ks[up[g]! + 2] = ks[up[g]! + 2]! + 1;
    for (let x = 1; x < G + 2; x++) ks[x] = ks[x]! + ks[x - 1]!;
    const fill = ks.slice(0, G + 1);
    const kids = new Int32Array(G);
    for (let g = 0; g < G; g++) kids[fill[up[g]! + 1]!] = g, (fill[up[g]! + 1] = fill[up[g]! + 1]! + 1);
    // A group's sort key: the column's own (a number, or a text's rank under the collation, shared with the sort's
    // cache), NaN for the empty group, which stays last both ways; collation ties (distinct values) by code units.
    const sk = new Float64Array(G);
    const sorters = cols.map((c) => (c.codec.keyKind === 'number' ? env.cache.keys(c, env).keys : env.cache.ranks(c, env).ranks));
    for (let g = 0; g < G; g++) sk[g] = sorters[lv[g]!]![first[g]!]!;
    for (let x = 0; x <= G; x++) {
      const from = ks[x]!;
      const to = ks[x + 1]!;
      if (to - from < 2) continue;
      const dir = desc[lv[kids[from]!]!] === '1' ? -1 : 1;
      const part = Array.from(kids.subarray(from, to));
      part.sort((a, b) => {
        const p = sk[a]!;
        const q = sk[b]!;
        if (p !== p || q !== q) return p !== p ? (q !== q ? 0 : 1) : -1;
        const x2 = gid[a] as string;
        const y2 = gid[b] as string;
        return (p - q) * dir || (x2 < y2 ? -1 : x2 > y2 ? 1 : 0);
      });
      kids.set(part, from);
    }
    // Leaf ranges: each group's rows counted, then placed depth first in the sorted order.
    const n = new Int32Array(G);
    for (let k = 0; k < N; k++) if (deep[k]! >= 0) n[deep[k]!] = n[deep[k]!]! + 1;
    const lo = new Int32Array(G);
    const hi = new Int32Array(G);
    let at = 0;
    const place = (x: number): void => {
      for (let c = ks[x]!; c < ks[x + 1]!; c++) {
        const g = kids[c]!;
        lo[g] = at;
        if (lv[g] === L - 1) at += n[g]!;
        else place(g + 1);
        hi[g] = at;
      }
    };
    place(0);
    let leaves: Uint32Array;
    if (L) {
      leaves = new Uint32Array(N);
      const pos = lo.slice();
      for (let k = 0; k < N; k++) leaves[pos[deep[k]!]!] = order ? order[k]! : k, (pos[deep[k]!] = pos[deep[k]!]! + 1);
    } else leaves = order ?? Uint32Array.from({ length: N }, (_, k) => k);
    // Values, labels and keys: one read per group; a key is its parent's and its own column and value (D3).
    const val: unknown[] = [];
    const label: string[] = [];
    const key: RowKey[] = [];
    const segs: string[][] = [];
    for (let g = 0; g < G; g++) {
      const c = cols[lv[g]!]!;
      const v = valueAt(c, env, first[g]!);
      val[g] = v;
      label[g] = v === null ? '' : c.codec.format(v as never, env.ctx);
      // Parents are numbered before their children: theirs is ready.
      segs[g] = [...(up[g]! < 0 ? [] : segs[up[g]!]!), c.id, v === null ? '' : c.type[0] + c.codec.toExport(v as never)];
      key[g] = groupKey(segs[g]!);
    }
    return { snap, order, cols, G, lv: Int32Array.from(lv), up: Int32Array.from(up), ks, kids, lo, hi, leaves, val, label, key, gid };
  };

  /**
   * Whether a new generation of the rows keeps every row in its group (Q-T A): same rows in the same order (an update),
   * and each changed row's grouping values unchanged. Then the grouping is kept and only the totals follow.
   */
  const keeps = (S: Groups<T>, env: ColumnEnv<T>, order: Uint32Array | null): boolean => {
    const was = S.snap;
    const now = env.source;
    if (order !== S.order || now.ids !== was.ids || now.count !== was.count) return false;
    const of = (S.of ??= ofRows(S));
    const ident = S.cols.map((c) => identity(c, env));
    for (let s = 0; s < now.count; s++) {
      if (now.rows[s] === was.rows[s] || of[s]! < 0) continue;
      // Up the chain from its deepest group: each level's identity read again on the new row.
      for (let g = of[s]!; g >= 0; g = S.up[g]!) if (!Object.is(ident[S.lv[g]!]!(s), S.gid[g])) return false;
    }
    return true;
  };
  const ofRows = (S: Groups<T>): Int32Array => {
    const of = new Int32Array(S.snap.count).fill(-1);
    for (let g = 0; g < S.G; g++) if (S.lv[g] === S.cols.length - 1) for (let j = S.lo[g]!; j < S.hi[g]!; j++) of[S.leaves[j]!] = g;
    return of;
  };

  /** The columns a grid sorts descending among the grouping columns, as '0' / '1' per level. */
  const descOf = (cols: readonly ResolvedColumn<T>[]): string => {
    const sort = model?.query.sort ?? [];
    return cols.map((c) => +(sort.find((s) => s.column === c.id)?.dir === 'desc')).join('');
  };

  const groupsOf = (env: ColumnEnv<T>, order: Uint32Array | null): Groups<T> => {
    const cols = columnsOf(env);
    const ctx = ctxKey(env.ctx);
    const desc = descOf(cols);
    // An edited grouping value is applied at the next whole run only (K.14): while the order is stale, kept.
    const regroup = pending && !model?.orderStale;
    if (!S || regroup || S.byV !== byV || S.ctx !== ctx || S.colsRef !== env.columns || S.dv !== env.columns.dataVersion || S.desc !== desc || (S.snap !== env.source || S.order !== order ? !keeps(S, env, order) : false)) {
      pending = false;
      S = { ...group(env, order, cols, desc), byV, ctx, colsRef: env.columns, dv: env.columns.dataVersion, desc };
    } else if (S.snap !== env.source) S = { ...S, snap: env.source };
    return S;
  };

  const shape: GroupShape<T> = {
    kind: 'group',
    options: o,
    ...(expanded !== undefined && { initial: expanded }),
    get by() { return by; },
    get diagnostics() { return { ...d }; },
    get problems() {
      // One list per change of what it is made of: the model tells a list again only when it is another.
      if (P.u !== used || P.a !== A || P.n !== told.length) P = { u: used, a: A, n: told.length, list: [...told, ...(used?.ps ?? []), ...(A?.t.problems ?? [])] };
      return P.list;
    },
    reads: () => (used ? used.list.map((c) => c.id) : [...new Set(by)]),
    values(changed) {
      const ids = shape.reads!();
      if (!changed || changed.some((c) => ids.includes(c))) pending = true;
      // Totals follow an edit at once (owner Q-ED A): shown again when a totalled column (or any, unnamed) moved.
      if (!changed || changed.some((c) => A?.t.columns.includes(c))) redraw?.();
    },
    attach(m, r) {
      model = m;
      redraw = r;
    },
    off() {
      off = true;
      by = [];
      byV++;
      footG = footT = false;
      redraw?.('rows', 'host');
    },
    setBy(next, source = 'api') {
      if (off) return;
      // Not a list (untyped code): no grouping, told.
      if (!Array.isArray(next)) bad('by', typeof next), (next = []);
      if (next.length === by.length && next.every((c, i) => c === by[i])) return;
      by = next.slice();
      byV++;
      // While an edit keeps the order stale, regrouping applies the edits: through « Réappliquer », so the groups and
      // the stale mark agree (review 2026-11-04). Otherwise a regroup alone, told as `rows`.
      if (model?.orderStale) model.reapply(source);
      else redraw?.('rows', source);
    },
    totals: () => (off ? {} : A?.t.grand ?? {}),
    parents(snap, depth, shown, env) {
      // At the first load (no build yet), the groups of every row; afterwards, the last build's.
      const s = S && (shown || !env || S.snap === snap) ? S : env ? groupsOf(env, null) : null;
      const out: RowKey[] = [];
      if (s) for (let g = 0; g < s.G; g++) if (s.lv[g]! < depth) out.push(s.key[g]!);
      return out;
    },
    isOpen: (key) => {
      const g = S ? gOf(S, key) : -1;
      return g >= 0 && open?.[g] === 1;
    },
    opens: (key) => (S ? gOf(S, key) >= 0 : false),
    refresh() {
      S = A = null;
    },
    build(i: ShapeInput<T>): GroupedRows<T> {
      const env = i.env!;
      const s = groupsOf(env, i.order);
      if (A?.S !== s || A.reader !== env.reader.version || A.snap !== env.source) {
        d.aggs++;
        A = { S: s, reader: env.reader.version, snap: env.source, t: off ? { at: [], grand: {}, columns: [], problems: [] } : totalsOf(s, env, aggFuncs) };
      }
      const t = A.t;
      const isOpen = new Uint8Array(s.G);
      for (let g = 0; g < s.G; g++) isOpen[g] = +i.expansion.has(s.key[g]!);
      open = isOpen;
      flat = (every) => flatten(s, t, every ? null : isOpen, i.version, footG, footT, top);
      all = null;
      return (last = flat(false));
    },
    all: () => (all ??= flat(true)),
  };
  const gOf = (s: Groups<T>, key: RowKey): number => {
    if (!s.byKey) {
      s.byKey = new Map();
      for (let g = 0; g < s.G; g++) s.byKey.set(s.key[g]!, g);
    }
    return s.byKey.get(key) ?? -1;
  };

  /** The rows shown: groups in order, each open one's children (groups or rows), its footer, the grand total. */
  const flatten = (s: Groups<T>, t: Totals, isOpen: Uint8Array | null, version: number, fg: boolean, ft: boolean, atTop: boolean): GroupedRows<T> => {
    d.flattens++;
    const { G, lv, ks, kids, lo, hi, leaves, snap } = s;
    const L = s.cols.length;
    const N = leaves.length;
    const grand = ft && N > 0;
    // Codes: a row by its source index (>= 0); group g: -1 - g; its footer: -1 - G - g; the grand total: -1 - 2G.
    const cap = N + 2 * G + 1;
    const at = new Int32Array(cap);
    const lev = new Int32Array(cap);
    const pos = new Int32Array(cap);
    const size = new Int32Array(cap);
    let m = 0;
    let data = 0;
    const emit = (c: number, l: number, p: number, z: number): void => void ((at[m] = c), (lev[m] = l), (pos[m] = p), (size[m++] = z));
    const GT = -1 - 2 * G;
    const topSize = (L ? ks[1]! - ks[0]! : N) + 1;
    const kidsOfG = (g: number): number => (lv[g] === L - 1 ? hi[g]! - lo[g]! : ks[g + 2]! - ks[g + 1]!);
    const walk = (x: number): void => {
      const g = x - 1;
      const foot = g >= 0 && fg ? 1 : 0;
      // Under the root, the grand total is one more sibling of the first level.
      const extra = g < 0 && grand ? 1 : 0;
      const shift = extra && atTop ? 1 : 0;
      if (shift) emit(GT, 0, 1, topSize);
      if (g >= 0 ? lv[g] === L - 1 : !L) {
        const a = g < 0 ? 0 : lo[g]!;
        const b = g < 0 ? N : hi[g]!;
        const z = b - a + foot + extra;
        for (let j = a; j < b; j++) emit(leaves[j]!, L, j - a + 1 + shift, z), data++;
      } else {
        const z = ks[x + 1]! - ks[x]! + foot + extra;
        for (let c = ks[x]!; c < ks[x + 1]!; c++) {
          const h = kids[c]!;
          emit(-1 - h, lv[h]!, c - ks[x]! + 1 + shift, z);
          if (!isOpen || isOpen[h]) walk(h + 1);
        }
      }
      // A footer is its group's children's last sibling; the grand total the first level's.
      if (foot) emit(-1 - G - g, lv[g]! + 1, kidsOfG(g) + 1, kidsOfG(g) + 1);
      else if (extra && !atTop) emit(GT, 0, topSize, topSize);
    };
    walk(0);
    const check = (i: number): number => {
      if (!Number.isInteger(i) || i < 0 || i >= m) throw new RangeError(`no displayed row ${i}`);
      return at[i]!;
    };
    const keyOfCode = (c: number): RowKey =>
      c >= 0 ? snap.keyAt(c as never) : c > -1 - G ? s.key[-1 - c]! : c === GT ? (`t:${atTop ? 'top' : 'bottom'}` as RowKey) : (`f:${s.key[-1 - G - c]}` as RowKey);
    const nodeAt = (i: number): RowNode<T> => {
      const c = check(i);
      if (c >= 0) return { key: snap.keyAt(c as never), kind: 'data', level: lev[i]!, id: snap.ids[c]!, data: snap.rows[c]! };
      if (c > -1 - G) {
        const g = -1 - c;
        const path: string[] = [];
        for (let u = g; u >= 0; u = s.up[u]!) path.unshift(s.label[u]!);
        return { key: s.key[g]!, kind: 'group', level: lev[i]!, label: s.label[g]!, path, column: s.cols[lv[g]!]!.id, value: s.val[g], count: hi[g]! - lo[g]!, aggs: t.at[g]! } satisfies GroupNode;
      }
      const g = c === GT ? -1 : -1 - G - c;
      return { key: keyOfCode(c), kind: 'footer', level: lev[i]!, group: g < 0 ? null : s.key[g]!, label: g < 0 ? '' : s.label[g]!, count: g < 0 ? N : hi[g]! - lo[g]!, aggs: g < 0 ? t.grand : t.at[g]! } satisfies FooterNode;
    };
    let back: Int32Array | null = null;
    let others: Map<string, number> | null = null;
    const indexOf = (key: RowKey): DisplayIndex | -1 => {
      const id = idOfDataKey(key);
      if (id !== null) {
        const src = snap.lookup(id);
        if (src < 0) return -1;
        if (!back) {
          back = new Int32Array(snap.count).fill(-1);
          for (let i = 0; i < m; i++) if (at[i]! >= 0) back[at[i]!] = i;
        }
        return back[src]! as DisplayIndex | -1;
      }
      if (!others) {
        others = new Map();
        for (let i = 0; i < m; i++) if (at[i]! < 0) others.set(keyOfCode(at[i]!), i);
      }
      return (others.get(key) ?? -1) as DisplayIndex | -1;
    };
    return {
      version,
      count: m,
      dataCount: data,
      nodeAt,
      keyAt: (i) => keyOfCode(check(i)),
      index: (i) => (Number.isInteger(i) && i >= 0 && i < m ? (i as DisplayIndex) : null),
      indexOf,
      nextData: (i, delta) => (i + delta >= 0 && i + delta < m ? (nodeAt(i + delta) as never) : null),
      parentOf(key) {
        const id = idOfDataKey(key);
        if (id !== null) {
          const src = snap.lookup(id);
          const of = (s.of ??= ofRows(s));
          return src < 0 || !L || of[src]! < 0 ? null : s.key[of[src]!]!;
        }
        if (key.startsWith('f:')) {
          const k = key.slice(2) as RowKey;
          return gOf(s, k) >= 0 ? k : null;
        }
        const g = gOf(s, key);
        return g < 0 || s.up[g]! < 0 ? null : s.key[s.up[g]!]!;
      },
      levelAt: (i) => (check(i), lev[i]!),
      posAt: (i) => (check(i), pos[i]!),
      sizeAt: (i) => (check(i), size[i]!),
      childrenAt: (i) => {
        const c = check(i);
        return c < 0 && c > -1 - G ? kidsOfG(-1 - c) : 0;
      },
      kidsOf: (key) => {
        const g = gOf(s, key);
        return g < 0 ? 0 : kidsOfG(g);
      },
      expandedAt: (i) => {
        const c = check(i);
        return c < 0 && c > -1 - G && (!isOpen || isOpen[-1 - c] === 1);
      },
      matchedAt: (i) => (check(i), true),
    };
  };
  return shape;
}

/**
 * What grouping refuses beside it (plan D20; owner Q-PG A, Q-SRV A): told by the grid, which shows its rows grouped
 * without the other feature — or flat, on a server (`source`). Never a throw.
 */
export function groupConflicts(o: { readonly tree?: boolean; readonly detail?: boolean; readonly spans?: boolean; readonly page?: boolean; readonly server?: boolean }): Problem[] {
  return (['tree', 'detail', 'spans', 'page', 'server'] as const)
    .filter((f) => o[f])
    .map((f) => problem('unsupported-combination', 'warning', f === 'page' ? 'pagination' : f === 'server' ? 'source' : f, 'grouping'));
}

/**
 * A saved state's `rowGroups` (any JSON) checked against the grid's columns (grid-state.md « Row grouping » 2): the
 * known, groupable ids, once each, in order. An unknown id: `state-column` (path `rowGroups.<i>`, the id); not a text,
 * given twice, `groupable: false`: `state-field` (no detail); not a list: `by` null and `state-field` at `rowGroups`.
 * Never a value of a row: a state holds column ids only.
 */
export function checkRowGroups<T>(raw: unknown, columns: Pick<ColumnLookup<T>, 'get'>): { readonly by: readonly string[] | null; readonly problems: readonly Problem[] } {
  const problems: Problem[] = [];
  if (!Array.isArray(raw)) return { by: null, problems: [problem('state-field', 'warning', 'rowGroups')] };
  const by = raw.filter((id, i) => {
    const p = `rowGroups.${i}`;
    const col = typeof id == 'string' ? columns.get(id) : undefined;
    const ok = !!col && col.def.groupable !== false && raw.indexOf(id) === i;
    if (!ok) problems.push(typeof id == 'string' && !col ? problem('state-column', 'warning', p, id) : problem('state-field', 'warning', p));
    return ok;
  });
  return { by, problems };
}
