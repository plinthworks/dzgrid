import type { AggFuncName, ColumnOrGroup, ResolvedColumn } from '../columns/defs.js';
import { groupKey } from '../ids.js';
import { canonical } from '../model/query.js';
import type { PivotCrossings, PivotOptions, PivotSeries, PivotShape } from '../pivot/shape.js';
import { problem, type Problem } from '../problems.js';
import type { GroupNode } from '../row/node.js';
import { NAMES, fits } from '../grouping/agg.js';
import { fitsColumn, okValue, plain, tag, type ServerPivotPlug } from '../server/server-side.js';
import type { GroupValue, PivotPart } from '../server/source.js';
import type { SortItem } from '../sort/compile.js';

/** The label column `@dzgrid/dom/pivot` makes: a sort on it is a sort on the grouping columns. */
const LABEL = '~p:rows';

/**
 * `serverPivot()` (server-pivot.md; owner Q-SP2 A): handed to `serverSideRows(data, { pivot: serverPivot() })`, it links
 * the model to the rows' pivot shape (`grouping({ pivot })`). Each request carries the pivot part; the first level's
 * first block brings the crossings, made into created columns by `@dzgrid/core/pivot`'s own code; each group's `cells`
 * land in its totals by created column id. Cells and totals are the server's, never computed here (Q-TOT A).
 */
export function serverPivot(): ServerPivotPlug {
  return {
    link(env, m) {
      const s = env.shape as PivotShape<unknown> | undefined;
      if (!s?.serve) return null;
      const o = (s.options ?? {}) as PivotOptions;
      // No values given: the shown columns with a total, taken now (a fold must not shrink them; pivot.md 11).
      if (!Object.keys(s.valueFns()).length) s.setValueFns(Object.fromEntries(env.columns.visible().flatMap((c) => (c.def.aggFunc === undefined ? [] : [[c.id, c.def.aggFunc]]))));
      /** The pivot columns in use and the grouping columns, as last asked. */
      let pc: ResolvedColumn<unknown>[] = [];
      let by: readonly string[] = [];
      /** The epoch's list as sent (its canonical text: a later block's must equal it) and the crossings accepted. */
      let list: unknown;
      let listKey = '';
      let known: (readonly GroupValue[])[] = [];
      /** By the server's crossing index: each value column's created id; the indices refused (their cells ignored, not told again). */
      let at: (Map<string, string> | undefined)[] = [];
      let bad = new Set<number>();
      /** A created column's crossing (typed path) and value column, for the sort; a deepest one's name, for the chart. */
      let where = new Map<string, readonly [readonly GroupValue[], string]>();
      let names = new Map<string, string>();
      /** The grand total row's cells (none until the server sends them: no empty totals row). */
      let grand: Readonly<Record<string, unknown>> | undefined;
      /** The list's standing problem (above the limit), told once besides. */
      let standing: Problem[] = [];
      let ctx = m.ctx();
      const blank = o.labels?.blank ?? '';
      const label = (c: ResolvedColumn<unknown>, v: GroupValue): string => {
        try {
          return v === null ? '' : String(c.codec.format(v as never, ctx));
        } catch {
          return String(v);
        }
      };

      /** The chart (pivot.md 16): the groups held at `level` in the order shown, one series per created column of one value. */
      const series = (so: { readonly value?: string; readonly level?: number }): PivotSeries => {
        const v = so.value ?? Object.keys(s.valueFns())[0];
        const ids: string[] = [];
        const walk = (t: readonly ColumnOrGroup<unknown>[]): void => t.forEach((n) => ('children' in n ? walk(n.children) : n.id[1] == 'p' && where.get(n.id)?.[1] === v && ids.push(n.id)));
        walk(s.generated().columns);
        const d = m.view();
        const depth = Math.min(Math.max((so.level ?? 1) - 1, 0), by.length - 1);
        const gs: GroupNode[] = [];
        for (let i = 0; i < d.count; i++) {
          const n = d.nodeAt(i as never);
          if (n.kind == 'group' && n.level === depth) gs.push(n);
        }
        const num = (y: unknown): number | null => (typeof y == 'number' ? y : null);
        return {
          categories: by.length ? gs.map((g) => g.path.map((p) => p || blank).join(' › ')) : [''],
          series: ids.map((id) => ({ id, name: names.get(id)!, values: by.length ? gs.map((g) => num(g.aggs?.[id])) : [num(grand?.[id])] })),
        };
      };
      const cross = s.serve({ kick: m.again, series });
      /** The values a server computes and their columns: named functions that fit (an application's is refused, Q-TOT A). */
      const specs = (): { col: ResolvedColumn<unknown>; fn: AggFuncName }[] =>
        Object.entries(s.valueFns()).flatMap(([id, fn]) => {
          const col = m.columns().get(id);
          return col && NAMES.includes(fn as string) && fits(col, fn as AggFuncName) ? [{ col, fn: fn as AggFuncName }] : [];
        });

      /** The epoch's crossings (`xs`), or none (`count`: the server's number above the limit), made into created columns. */
      const build = (xs: unknown, told: Problem[], count?: number): void => {
        list = xs;
        listKey = canonical(xs ?? null);
        known = [];
        at = [];
        bad = new Set();
        where = new Map();
        names = new Map();
        standing = [];
        if (!Array.isArray(xs) || !pc.length) return void (cross(null, specs(), pc.length, standing, count), told.push(...standing));
        // A tree of the paths, numbered parents first, in the order sent (pivot.md 5 is the server's contract).
        const C = { G: 0, lv: [] as number[], ks: [0], kids: [] as number[], val: [] as GroupValue[], label: [] as string[], key: [] as string[] };
        const ch: number[][] = [[]];
        const path: (readonly GroupValue[])[] = [];
        /** Each crossing's name for a chart: its labels joined, the empty one's as the host writes it. */
        const nm: string[] = [];
        const node = new Map<string, number>();
        const of: number[] = [];
        const met = new Set<number>();
        xs.forEach((p: unknown, i) => {
          // Too long, empty, of no group type or not of its column's type (Q-SP5 A): told by place, never with the value.
          if (!Array.isArray(p) || !p.length || p.length > pc.length || !p.every((v, l) => okValue(v) && fitsColumn(pc[l]!, v, ctx))) return void (told.push(problem('invalid-page-response', 'warning', `response.pivot.crossings[${i}]`)), bad.add(i));
          let c = -1;
          const segs: string[] = [];
          p.forEach((v: GroupValue, l) => {
            segs.push(pc[l]!.id, tag(v));
            const k = groupKey(segs);
            let x = node.get(k);
            if (x === undefined) {
              node.set(k, (x = C.G++));
              C.lv.push(l), C.val.push(v), C.key.push(k), C.label.push(label(pc[l]!, v)), ch.push([]), ch[c + 1]!.push(x), path.push(p.slice(0, l + 1));
              nm.push((c < 0 ? '' : nm[c] + ' › ') + (v === null ? blank : C.label[x]));
            }
            c = x;
          });
          if (met.has(c)) told.push(problem('invalid-page-response', 'warning', `response.pivot.crossings[${i}]`)), bad.add(i);
          else met.add(c), (of[i] = c), known.push(p);
        });
        for (const k of ch) C.kids.push(...k), C.ks.push(C.kids.length);
        const { n, slot, ids } = cross(C as PivotCrossings, specs(), pc.length, standing);
        told.push(...standing);
        // The export's crossings are the screen's columns: none above the limit.
        if (!ids.length) known = [];
        // Each crossing's ids: its slot's run of one id per value (none above the limit, or for a band not sub-totalled).
        const V = n && ids.length / n;
        of.forEach((c, i) => {
          const byValue = new Map<string, string>();
          for (const id of slot[c]! < 0 ? [] : ids.slice(slot[c]! * V, slot[c]! * V + V)) {
            const v = s.valueColumn(id)!;
            byValue.set(v, id);
            where.set(id, [path[c]!, v]);
            names.set(id, nm[c]!);
          }
          at[i] = byValue;
        });
      };

      return {
        part(next, sort, told) {
          by = next;
          const columns = m.columns();
          pc = [];
          // The pivot columns used: known, groupable, once, not grouping the rows (told by id, never a value).
          for (const id of s.pivotBy) {
            const c = columns.get(id);
            if (!c) told.push(problem('unknown-column', 'warning', 'pivot.columns', typeof id == 'string' ? id : typeof id));
            else if (c.def.groupable === false || pc.includes(c) || by.includes(id)) told.push(problem('invalid-setting', 'warning', 'pivot.columns', id));
            else pc.push(c);
          }
          // Another language: the crossings' labels made again (no request: the same list).
          if (m.ctx() !== ctx) (ctx = m.ctx()), list !== undefined && build(list, []);
          if (!pc.length) build(undefined, []);
          if (!s.on || (!pc.length && !by.length)) return null;
          const fns = s.valueFns();
          const ids = pc.map((c) => c.id);
          const desc = ids.filter((id) => s.pivotDesc.includes(id) || sort?.some((x) => x.column === id && x.dir === 'desc'));
          // The sort translated (Q-SP6 A): no created id on the wire.
          const out: SortItem[] = [];
          let ps: PivotPart['sort'];
          for (const x of sort ?? []) {
            const w = where.get(x.column);
            if (x.column === LABEL) out.push(...by.map((column) => ({ column, dir: x.dir })));
            else if (!s.made(x.column)) out.push(x);
            else if (!ps && w) ps = { crossing: w[0], column: w[1], dir: x.dir };
          }
          const V = Object.values(fns).filter((f) => typeof f == 'string').length;
          const pivot: PivotPart = { columns: ids, ...(desc.length && { desc }), ...(o.subtotals === true && { subtotals: true }), limit: Math.floor((o.maxColumns ?? 200) / Math.max(V, 1)), ...(ps && { sort: ps }) };
          // A sort sent as without the pivot (`[]` when none), less the created columns'.
          return { pivot, ...(sort && { sort: out }), fns };
        },
        root(raw, first, told) {
          const p = raw.pivot;
          const xs = plain(p) ? p.crossings : undefined;
          if (first) {
            grand = undefined;
            // No `pivot` while pivot columns were asked: told, no created column; `count` alone: above the limit (Q-SP4 A).
            if (!plain(p) && pc.length) told.push(problem('invalid-page-response', 'warning', 'response.pivot'));
            const n = plain(p) && Number.isInteger(p.count) && (p.count as number) >= 0 && xs === undefined ? (p.count as number) : undefined;
            build(xs, told, n);
          } else if (xs !== undefined && canonical(xs) !== listKey) told.push(problem('invalid-page-response', 'warning', 'response.pivot.crossings'));
          if (plain(p) && p.totals !== undefined) grand = this.cells(p.totals, 'response.pivot.totals', told);
          return grand;
        },
        cells(x, path, told) {
          const out: Record<string, unknown> = {};
          // No list (above the limit, or none sent): no cell read.
          if (x === undefined || !Array.isArray(list)) return out;
          // Told by place only: an index is the server's, kept out of the problem (it might hold anything).
          if (!plain(x)) return told.push(problem('invalid-page-response', 'warning', path)), out;
          for (const i in x) {
            const ids = at[/^\d+$/.test(i) ? +i : -1];
            if (!ids) {
              if (!bad.has(+i)) told.push(problem('invalid-page-response', 'warning', path));
              continue;
            }
            const r = x[i];
            if (plain(r)) for (const v in r) ids.has(v) && (out[ids.get(v)!] = r[v]);
          }
          return out;
        },
        full: (p) => ({ ...p, crossings: known }),
        get problems() { return standing; },
      };
    },
  };
}
