import type { AggFn, AggFuncName, ColumnDef, ColumnOrGroup, ResolvedColumn } from '../columns/defs.js';
import type { ColumnLookup } from '../columns/model.js';
import { groupKey, type RowKey } from '../ids.js';
import type { ClientModel } from '../model/client.js';
import type { ColumnEnv } from '../model/column-cache.js';
import type { ChangeSource } from '../model/types.js';
import type { PivotState } from '../state/state.js';
import { problem, type Problem } from '../problems.js';
import { ctxKey } from '../value/locale.js';
import { fits, NAMES, valueAt, type Totals } from '../grouping/agg.js';
import { group, grouped, keeps, named, ofRows, type GroupingOptions, type Groups, type GroupShape, type Seam } from '../grouping/shape.js';

type Fns = Readonly<Record<string, AggFuncName | AggFn>>;

/** A pivot (docs/behaviors/pivot.md; plan D2–D8, D14): a grouping with crossings. Bad values never throw: told and bent. */
export interface PivotOptions extends GroupingOptions {
  /** Pivot mode (default true): off, the grouping as without the pivot. */
  readonly on?: boolean;
  /** The pivot columns' ids, the first band first. */
  readonly columns?: readonly string[];
  /** The values and their functions, in order (default: the options' `aggFuncs`, then the shown columns with an `aggFunc`). */
  readonly values?: Fns;
  /** A sub-total after each pivot band, per value (pivot.md 8). */
  readonly subtotals?: boolean;
  /** Above this many created columns (crossings × values, sub-totals counted), none is made (default 200; pivot.md 9). */
  readonly maxColumns?: number;
  /** A created column's width (default 120). */
  readonly width?: number;
  /** Headers the pivot writes, translated by the host: the empty crossing's (default '') and a sub-total's (`{name}`, default 'Σ {name}'). */
  readonly labels?: { readonly blank?: string; readonly total?: string };
}

/** The created columns: bands and leaves in order, a key that moves only when their list does, how many there are. */
export interface PivotColumns<T> {
  /** Empty when off, without pivot column or value, or above `maxColumns`. */
  readonly columns: readonly ColumnOrGroup<T>[];
  /** Changes only when the ids, headers or types of the columns do: the same object otherwise. */
  readonly key: string;
  /** Created columns, made or not (above the limit: how many there would be). */
  readonly count: number;
}

/** A pivot ready for a chart (pivot.md 16): categories (groups) and one series per created column of one value. */
export interface PivotSeries {
  readonly categories: readonly string[];
  readonly series: readonly { readonly id: string; readonly name: string; readonly values: readonly (number | null)[] }[];
}

export interface PivotShape<T> extends GroupShape<T> {
  readonly on: boolean;
  /** Turns pivot mode on or off, told as a `rows` change. */
  setOn(on: boolean, source?: ChangeSource): void;
  /** The pivot columns as given (unknown or refused ones told, skipped). */
  readonly pivotBy: readonly string[];
  setPivotBy(columns: readonly string[], source?: ChangeSource): void;
  /** The values and their functions now. */
  valueFns(): Fns;
  setValueFns(values: Fns, source?: ChangeSource): void;
  /** Several at once, one build (a restored state); what is given is set, what is wrong told. */
  set(p: { readonly on?: boolean; readonly columns?: readonly string[]; readonly values?: Fns }, source?: ChangeSource): void;
  /** The created columns of the last build. */
  generated(): PivotColumns<T>;
  /** Whether an id is one the pivot makes (a created column, band or sub-total): kept out of the saved state. */
  made(id: string): boolean;
  /** The value column of a created column or a sub-total (undefined: not one the last build made). */
  valueColumn(id: string): string | undefined;
  /** The data rows of a group in the last build, in order (none: unknown, or pivot off): what find reads (pivot.md 25). */
  rows(key: RowKey): readonly T[];
  /** The last build for a chart: groups at `level` (1: the first, default), the created columns of `value` (default the first). */
  series(o?: { readonly value?: string; readonly level?: number }): PivotSeries;
  /** Work done, for tests: crossing passes. */
  readonly passes: number;
}

/** A created column's cells read nothing: the pivot hands them through its group's totals. */
const NONE = (): null => null;
const FORMAT = ['type', 'codec', 'enumOptions', 'numberFormat', 'instantFormat', 'assumeZone', 'align'] as const;
const E: Readonly<Record<string, unknown>> = {};
const EMPTY = { columns: [], key: '', count: 0 };
/** A length-prefixed segment, as group keys write them. */
const seg = (s: string): string => groupKey([s]).slice(2);
const isObj = (v: unknown): v is Fns => !!v && typeof v == 'object' && !Array.isArray(v);

interface Spec<T> { readonly col: ResolvedColumn<T>; readonly fn: AggFuncName | AggFn }

/**
 * A pivot (D2 A): `grouped` with its deepest groups as the last rows, and one bucketed pass — every row once per value,
 * added at its crossing into its deepest group, every group above it and the grand total — whose cells sit under each
 * group's totals by created column id. The crossings are a grouping of the grouped rows by the pivot columns (the same
 * identity, order and keys as groups), so a pivot column's order, « (Vide) » and `1` vs `'1'` are the groups' own.
 */
export function pivotShape<T>(o: PivotOptions = {}): PivotShape<T> {
  const told: Problem[] = [];
  const bad = (path: string, v: unknown): void => void told.push(problem('invalid-setting', 'warning', `pivot.${path}`, named(v)));
  let on = o.on !== false;
  if (o.on !== undefined && typeof o.on != 'boolean') bad('on', typeof o.on);
  let by: readonly string[] = [];
  if (Array.isArray(o.columns)) by = o.columns.slice();
  else if (o.columns !== undefined) bad('columns', typeof o.columns);
  let vals: Fns | undefined;
  if (isObj(o.values)) vals = { ...o.values };
  else if (o.values !== undefined) bad('values', typeof o.values);
  let max = o.maxColumns ?? 200;
  if (!(Number.isInteger(max) && max >= 1)) bad('maxColumns', max), (max = 200);
  let width = o.width ?? 120;
  if (!(width > 0 && width < Infinity)) bad('width', width), (width = 120);
  const sub = o.subtotals === true;
  const blank = o.labels?.blank ?? '';
  const total = o.labels?.total ?? 'Σ {name}';

  let model: ClientModel<T> | null = null;
  let redraw: ((kind?: 'rows' | 'expand', source?: ChangeSource) => void) | null = null;
  let passes = 0;
  /** The last pass: its inputs, its cells, its columns (with each deepest crossing's leaves for `series`). */
  let X: { k: unknown[]; t: Totals; specs: Spec<T>[]; leaves: { id: string; name: string; v: number }[]; of: Map<string, string> } | null = null;
  /** The crossings and what they were made of: kept while a live update moves no row's crossing (as groups, Q-T A). */
  let K: { k: unknown[]; C: Groups<T> } | null = null;
  let out: PivotColumns<T> = EMPTY;
  let last: { s: Groups<T>; t: Totals; k: Int32Array } | null = null;

  const valuesOf = (env: ColumnEnv<T>): Fns =>
    (vals ??= { ...Object.fromEntries(env.columns.visible().filter((c) => c.def.aggFunc !== undefined).map((c) => [c.id, c.def.aggFunc!])), ...o.aggFuncs });
  const kick = (source: ChangeSource): void => {
    seam.v++;
    if (model?.orderStale) model.reapply(source);
    else redraw?.('rows', source);
  };

  const seam: Seam<T> = {
    v: 0,
    // Both bands empty (no pivot column, no group): the rows themselves, the grand total kept (owner, 2026-11-07).
    flat: (G) => on && (by.length > 0 || G > 0),
    fns: (env) => (on ? { ...o.aggFuncs, ...valuesOf(env) } : undefined),
    cells(s, env) {
      if (!on) return told.length ? { at: Array(s.G).fill(E), grand: E, columns: [], problems: told } : undefined;
      const ps: Problem[] = [...told];
      // The pivot columns used: known, groupable, once, not grouping the rows (told by id, never a value).
      const pc: ResolvedColumn<T>[] = [];
      for (const id of by) {
        const col = env.columns.get(id);
        if (!col) ps.push(problem('unknown-column', 'warning', 'pivot.columns', named(id)));
        else if (col.def.groupable === false || pc.includes(col) || s.cols.includes(col)) ps.push(problem('invalid-setting', 'warning', 'pivot.columns', id));
        else pc.push(col);
      }
      // The values that can be totalled (the others are told by the totals, at `columns.<id>.aggFunc`).
      const specs: Spec<T>[] = [];
      for (const [id, fn] of Object.entries(valuesOf(env))) {
        const col = env.columns.get(id);
        if (col && (typeof fn == 'function' || (NAMES.includes(fn as string) && fits(col, fn)))) specs.push({ col, fn });
      }
      const sort = model?.query.sort ?? [];
      const desc = pc.map((c) => +(sort.find((x) => x.column === c.id)?.dir === 'desc')).join('');
      const same = (a: unknown[] | undefined, b: unknown[]): boolean | undefined => a && a.length === b.length && a.every((v, i) => v === b[i]);
      const ck = [s.leaves, env.reader.version, ctxKey(env.ctx), desc, ...pc.map((c) => c.def)];
      const k = [s.snap, seam.v, ...ck, ...specs.flatMap((x) => [x.col.def, x.fn])];
      if (same(X?.k, k)) return X!.t;
      passes++;

      const PL = pc.length;
      const V = specs.length;
      const { G, lv, lo, hi, up, leaves } = s;
      const L = s.cols.length;
      // The crossings: the grouped rows grouped again by the pivot columns (their own sort direction).
      let C: Groups<T> | null = null;
      if (PL) {
        // The same columns' definitions: their newest objects read (the key cache knows those).
        const c0 = same(K?.k, ck) ? { ...K!.C, cols: pc } : null;
        C = c0 && keeps(c0, env, leaves) ? { ...c0, snap: env.source } : group(env, leaves, pc, desc);
        K = { k: ck, C };
      }
      const n = !C || !V ? 0 : sub ? C.G : C.lv.reduce((a, l) => a + +(l === PL - 1), 0);
      const count = n * V;
      const at: Record<string, unknown>[] = Array.from({ length: G }, () => ({}));
      const grand: Record<string, unknown> = {};
      const leafs: { id: string; name: string; v: number }[] = [];
      let tree: ColumnOrGroup<T>[] = [];
      const ids: string[] = [];
      let key = '';
      if (count > max) {
        // Checked before any column or cell is made (pivot.md 9): told by the count.
        ps.push(problem('pivot-too-many', 'warning', 'pivot.columns', String(count)));
        key = `>${count}`;
      } else if (C && n) {
        const slot = new Int32Array(C.G).fill(-1);
        const heads = specs.map((x) => x.col.def.header ?? x.col.id);
        const label = (c: number): string => (C.val[c] === null ? blank : C.label[c]!);
        const def = (id: string, header: string, x: Spec<T>): ColumnDef<T> => {
          const d: Record<string, unknown> = { id, header, value: NONE, width, filter: false, groupable: false };
          if (x.fn === 'count') d.type = 'number';
          else for (const f of FORMAT) if (x.col.def[f] !== undefined) d[f] = x.col.def[f];
          key += `\0${id}\0${header}\0${d.type}`;
          return d as unknown as ColumnDef<T>;
        };
        // One slot per deepest crossing (and per band when sub-totalled), numbered in the order shown.
        const cols = (c: number, pre: string, head: string, path: string[]): ColumnOrGroup<T>[] => {
          const segs = C.key[c]!.slice(2);
          slot[c] = ids.length / V;
          const made = specs.map((x, v) => {
            const id = pre + segs + seg(x.col.id);
            ids.push(id);
            if (pre == '~p') leafs.push({ id, name: path.join(' › '), v });
            return def(id, V > 1 ? heads[v]! : head, x);
          });
          if (V < 2) return made;
          key += `\0${pre}${segs}\0${head}`;
          return [{ id: (pre == '~p' ? '~b' : pre) + segs, header: head, children: made }];
        };
        const walk = (x: number, path: string[]): ColumnOrGroup<T>[] => {
          const list: ColumnOrGroup<T>[] = [];
          for (let j = C.ks[x]!; j < C.ks[x + 1]!; j++) {
            const c = C.kids[j]!;
            const l = label(c);
            if (C.lv[c] === PL - 1) list.push(...cols(c, '~p', l, [...path, l]));
            else {
              key += `\0~b${C.key[c]!.slice(2)}\0${l}`;
              list.push({ id: `~b${C.key[c]!.slice(2)}`, header: l, children: walk(c + 1, [...path, l]) });
              if (sub) list.push(...cols(c, '~t', total.replace('{name}', l), []));
            }
          }
          return list;
        };
        tree = walk(0, []);
        // The bucketed pass: per value, per (group or grand total, slot) cell; the grand total is row G.
        const cells = (G + 1) * n;
        const xof = (C.of ??= ofRows(C));
        const rows = new Int32Array(cells);
        const acc = specs.map(({ col, fn }) => {
          const kind = typeof fn == 'function' ? 'fn' : fn;
          const keys = /^(sum|avg|min|max)$/.test(kind) ? (col.codec.keyKind === 'number' ? env.cache.keys(col, env).keys : env.cache.ranks(col, env).ranks) : null;
          const sum = new Float64Array(kind == 'sum' || kind == 'avg' || kind == 'min' || kind == 'max' ? cells : 0);
          const fix = new Float64Array(kind == 'sum' || kind == 'avg' ? cells : 0);
          const k = new Int32Array(kind == 'count' || kind == 'fn' ? 0 : cells).fill(-1);
          const lists: unknown[][] = [];
          return { col, fn, kind, keys, sum, fix, k, lists };
        });
        const read = new Array<unknown>(V);
        const visit = (j: number, gd: number): void => {
          const src = leaves[j]!;
          for (let v = 0; v < V; v++) {
            const a = acc[v]!;
            read[v] = a.keys ? a.keys[src] : a.kind == 'count' ? 0 : valueAt(a.col, env, src);
          }
          for (let c = xof[src]!; c >= 0; c = sub ? C.up[c]! : -1) {
            const p = slot[c]!;
            for (let g = gd; ; g = up[g]!) {
              const cell = (g < 0 ? G : g) * n + p;
              rows[cell]!++;
              for (let v = 0; v < V; v++) {
                const a = acc[v]!;
                const x = read[v];
                switch (a.kind) {
                  case 'sum':
                  case 'avg': {
                    const y = x as number;
                    if (y !== y) break;
                    // Counted in `k` from -1: k + 1 numbers; Neumaier as `totalsOf`.
                    const s0 = a.sum[cell]!;
                    const t = s0 + y;
                    if (Number.isFinite(t)) a.fix[cell] = a.fix[cell]! + (Math.abs(s0) >= Math.abs(y) ? s0 - t + y : y - t + s0);
                    a.sum[cell] = t;
                    a.k[cell] = a.k[cell]! + 1;
                    break;
                  }
                  case 'min':
                  case 'max': {
                    const y = x as number;
                    if (y === y && (a.k[cell]! < 0 || (a.kind == 'min' ? y < a.sum[cell]! : y > a.sum[cell]!))) (a.k[cell] = src), (a.sum[cell] = y);
                    break;
                  }
                  case 'first':
                  case 'last':
                    if (x !== null && (a.kind == 'last' || a.k[cell]! < 0)) a.k[cell] = src;
                    break;
                  case 'fn':
                    (a.lists[cell] ??= []).push(x);
                }
              }
              if (g < 0) break;
            }
          }
        };
        if (L) {
          for (let g = 0; g < G; g++) if (lv[g] === L - 1) for (let j = lo[g]!; j < hi[g]!; j++) visit(j, g);
        } else for (let j = 0; j < leaves.length; j++) visit(j, -1);
        for (let v = 0; v < V; v++) {
          const a = acc[v]!;
          let threw = false;
          for (let p = 0; p < n; p++) {
            const id = ids[p * V + v]!;
            for (let g = 0; g <= G; g++) {
              const cell = g * n + p;
              if (!rows[cell]) continue;
              let y: unknown = null;
              if (a.kind == 'count') y = rows[cell];
              else if (a.kind == 'fn') {
                try {
                  y = (a.fn as AggFn)(a.lists[cell]!, { column: a.col.id, level: g < G ? lv[g]! : null });
                } catch {
                  threw = true;
                }
              } else if (a.k[cell]! >= 0) {
                if (a.kind == 'sum' || a.kind == 'avg') {
                  const t = Number.isFinite(a.sum[cell]!) ? a.sum[cell]! + a.fix[cell]! : a.sum[cell]!;
                  y = a.kind == 'sum' ? t : t / (a.k[cell]! + 1);
                } else y = valueAt(a.col, env, a.k[cell]!);
              }
              if (y !== null && y !== undefined) (g < G ? at[g]! : grand)[id] = y;
            }
          }
          if (threw) ps.push(problem('agg-threw', 'warning', `columns.${a.col.id}.aggFunc`));
        }
      }
      // Another list of columns only when it differs (pivot.md 13): the host sets columns again only then.
      if (key !== out.key) out = { columns: tree, key, count };
      X = { k, t: { at, grand, columns: [], problems: ps }, specs, leaves: leafs, of: new Map(ids.map((id, i) => [id, specs[i % V]!.col.id])) };
      return X.t;
    },
    kids(s, t) {
      let k: Int32Array | undefined;
      // A sort on a created column or a value orders the groups by that total at every level (pivot.md 10), the
      // empty ones last both ways, ties in the groups' own order.
      const it = on ? model?.query.sort.find((x) => shape.made(x.column) || Object.hasOwn(vals ?? E, x.column)) : undefined;
      if (it) {
        k = s.kids.slice();
        const dir = it.dir === 'desc' ? -1 : 1;
        // The label column (the DOM's `~p:rows`): by value, the groups' own order or its reverse, the blank one last.
        const pos = new Int32Array(s.G);
        s.kids.forEach((g, j) => (pos[g] = j));
        const of = (g: number): unknown => (it.column === '~p:rows' ? (s.val[g] === null ? null : pos[g]) : t.at[g]![it.column]);
        for (let x = 0; x <= s.G; x++) {
          const part = Array.from(k.subarray(s.ks[x]!, s.ks[x + 1]!)).sort((a, b) => {
            const p = of(a);
            const q = of(b);
            if (p == null || q == null) return p == null ? (q == null ? 0 : 1) : -1;
            return (typeof p == 'number' && typeof q == 'number' ? p - q : String(p) < String(q) ? -1 : String(p) > String(q) ? 1 : 0) * dir;
          });
          k.set(part, s.ks[x]!);
        }
      }
      last = { s, t, k: k ?? s.kids };
      return k;
    },
  };

  const g = grouped<T>({ footers: 'grand', ...o }, seam);
  const attach = g.attach!;
  const vf = g.values!;
  // Defined, not assigned: the getters stay live.
  const shape = Object.defineProperties(g, Object.getOwnPropertyDescriptors({
    attach(m: ClientModel<T>, r: (kind?: 'rows' | 'expand', source?: ChangeSource) => void) {
      model = m;
      redraw = r;
      attach(m, r);
    },
    values(changed?: readonly string[]) {
      vf(changed);
      // A pivot column edited: its row changes crossing at once, as totals follow an edit (aggregation.md 13).
      if (on && changed?.some((c) => by.includes(c))) redraw?.();
    },
    get on() { return on; },
    setOn: (next: boolean, source?: ChangeSource) => shape.set({ on: next }, source),
    get pivotBy() { return by; },
    setPivotBy: (next: readonly string[], source?: ChangeSource) => shape.set({ columns: next }, source),
    valueFns: () => vals ?? o.aggFuncs ?? {},
    setValueFns: (next: Fns, source?: ChangeSource) => shape.set({ values: next }, source),
    set(p: { readonly on?: boolean; readonly columns?: readonly string[]; readonly values?: Fns }, source: ChangeSource = 'api') {
      // Something told counts as a change: shown at the next build.
      const n = told.length;
      let moved = false;
      if (p.on !== undefined) typeof p.on != 'boolean' ? bad('on', typeof p.on) : p.on !== on && ((on = p.on), (moved = true));
      if (p.columns !== undefined) {
        if (!Array.isArray(p.columns)) bad('columns', typeof p.columns);
        else if (p.columns.length !== by.length || p.columns.some((c, i) => c !== by[i])) (by = p.columns.slice()), (moved = true);
      }
      if (p.values !== undefined) isObj(p.values) ? ((vals = { ...p.values }), (moved = true)) : bad('values', typeof p.values);
      // One build for all of them (a restored state).
      if (moved || told.length > n) kick(source);
    },
    generated: () => (on ? out : EMPTY),
    made: (id: string) => /^~[pbt]/.test(id),
    valueColumn: (id: string) => X?.of.get(id),
    rows(key: RowKey): readonly T[] {
      const s = on && last?.s;
      if (!s) return [];
      const g = (s.byKey ??= new Map(s.key.map((k, i) => [k, i]))).get(key) ?? -1;
      return g < 0 ? [] : Array.from(s.leaves.subarray(s.lo[g], s.hi[g]), (i) => s.snap.rows[i]!);
    },
    series(so: { readonly value?: string; readonly level?: number } = {}): PivotSeries {
      if (!on || !last || !X) return { categories: [], series: [] };
      const { s, t, k } = last;
      const L = s.cols.length;
      const depth = Math.min(Math.max((so.level ?? 1) - 1, 0), L - 1);
      const gs: number[] = [];
      const walk = (x: number): void => {
        for (let j = s.ks[x]!; j < s.ks[x + 1]!; j++) s.lv[k[j]!] === depth ? gs.push(k[j]!) : walk(k[j]! + 1);
      };
      if (L) walk(0);
      const name = (g: number): string => {
        const p: string[] = [];
        for (let u = g; u >= 0; u = s.up[u]!) p.unshift(s.val[u] === null ? blank : s.label[u]!);
        return p.join(' › ');
      };
      const v = so.value === undefined ? 0 : X.specs.findIndex((x) => x.col.id === so.value);
      const num = (y: unknown): number | null => (typeof y == 'number' ? y : null);
      return {
        categories: L ? gs.map(name) : [''],
        series: X.leaves.filter((l) => l.v === v).map((l) => ({ id: l.id, name: l.name, values: L ? gs.map((g) => num(t.at[g]![l.id])) : [num(t.grand[l.id])] })),
      };
    },
    get passes() { return passes; },
  })) as PivotShape<T>;
  return shape;
}

/**
 * A saved state's `pivot` (any JSON) checked against the grid's columns (grid-state.md « Pivot » 3): the mode, the known
 * groupable pivot columns once each in order, the values with a built-in function's name. Never a value of a row: a
 * state holds column ids and names only.
 */
export function checkPivot<T>(raw: unknown, columns: Pick<ColumnLookup<T>, 'get'>): {
  readonly pivot: { readonly on?: boolean; readonly columns?: readonly string[]; readonly values?: Readonly<Record<string, AggFuncName>> } | null;
  readonly problems: readonly Problem[];
} {
  const problems: Problem[] = [];
  const field = (path: string): void => void problems.push(problem('state-field', 'warning', path));
  if (!isObj(raw)) return { pivot: null, problems: [problem('state-field', 'warning', 'pivot')] };
  const r = raw as Record<string, unknown>;
  const out: { on?: boolean; columns?: string[]; values?: Record<string, AggFuncName> } = {};
  if (r.on !== undefined) typeof r.on == 'boolean' ? (out.on = r.on) : field('pivot.on');
  if (r.columns !== undefined) {
    if (!Array.isArray(r.columns)) field('pivot.columns');
    else
      out.columns = r.columns.filter((id, i, a) => {
        const p = `pivot.columns.${i}`;
        const col = typeof id == 'string' ? columns.get(id) : undefined;
        const ok = !!col && col.def.groupable !== false && a.indexOf(id) === i;
        if (!ok) typeof id == 'string' && !col ? problems.push(problem('state-column', 'warning', p, id)) : field(p);
        return ok;
      });
  }
  if (r.values !== undefined) {
    if (!isObj(r.values)) field('pivot.values');
    else {
      out.values = {};
      for (const [id, fn] of Object.entries(r.values)) {
        if (!columns.get(id)) problems.push(problem('state-column', 'warning', 'pivot.values', id));
        else if (NAMES.includes(fn as string)) out.values[id] = fn as AggFuncName;
        else field(`pivot.values.${id}`);
      }
    }
  }
  return { pivot: out, problems };
}

/**
 * A pivot as `@dzgrid/core/state` saves it (`StateEnv.pivot`; grid-state.md « Pivot »): the mode, the pivot columns, the
 * built-in functions by value (an application's own function has no name: never saved, kept at a restore, which merges
 * the state's functions with the grid's), and the ids it creates, left out of the state.
 */
export function pivotState<T>(shape: PivotShape<T>, columns: Pick<ColumnLookup<T>, 'get'>): {
  get(): PivotState;
  set(raw: unknown): readonly Problem[];
  made(id: string): boolean;
} {
  return {
    get: () => ({ on: shape.on, columns: shape.pivotBy, values: Object.fromEntries(Object.entries(shape.valueFns()).filter((e) => typeof e[1] == 'string')) as Record<string, AggFuncName> }),
    set(raw) {
      const r = checkPivot(raw, columns);
      if (r.pivot) shape.set({ ...r.pivot, ...(r.pivot.values && { values: { ...shape.valueFns(), ...r.pivot.values } }) }, 'host');
      return r.problems;
    },
    made: shape.made,
  };
}
