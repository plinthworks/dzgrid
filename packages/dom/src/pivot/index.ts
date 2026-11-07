import { fold, isBlank, REJECTED, type AggFn, type AggFuncName, type ColumnDef, type ColumnLookup, type ColumnOrGroup, type GridKernel, type ResolvedColumn, type ValueCodec } from '@dzgrid/core';
import type { GroupingOptions, GroupShape } from '@dzgrid/core/grouping';
import { pivotShape, pivotState, type PivotOptions, type PivotSeries, type PivotShape } from '@dzgrid/core/pivot';
import type { GridContext } from '../context.js';
import type { FeatureHandle } from '../features.js';
import type { PivotMessageKey } from '../part-texts.js';

/** The texts `pivot()` needs, from `@dzgrid/dom/locales/<lang>-pivot`. */
export const PIVOT_KEYS = ['pivot.total', 'pivot.subtotal', 'pivot.count', 'pivot.tooMany', 'pivot.switch', 'pivot.valueChip'] as const satisfies readonly PivotMessageKey[];

type Fns = Readonly<Record<string, AggFuncName | AggFn>>;
type Grid = { readonly kernel: GridKernel<any, any> };

/** A pivot (docs/behaviors/pivot.md 17–30): `@dzgrid/core/pivot`'s options but the grouping's (given to `grouping()`) and the texts. */
export interface PivotFeatureOptions extends Omit<PivotOptions, keyof GroupingOptions | 'labels'> {
  /**
   * A « Tableau croisé » switch for the user (pivot.md 24, 35; Q-P6 A: none by default, the mode the application's):
   * `true` or `'inside'` in the pivot's strip above the rows (in the bar with `pivotBar()`), an element: appended into it.
   */
  readonly toggle?: boolean | 'inside' | HTMLElement;
  /**
   * The value columns' headers (pivot.md 38): `'auto'` (default) « sum(Amount) » when there are several values, the short
   * name otherwise; `'fn'` the function form always; `'name'` the short name (`headerShort`, else `header`) only.
   */
  readonly valueHeaders?: 'auto' | 'fn' | 'name';
  /** The label column's width (default 200). */
  readonly labelWidth?: number;
}

/** A grid's pivot (pivot.md 17–30), for the « Colonnes » band, the column menu and the application. */
export interface PivotApi {
  on(): boolean;
  /** Pivot mode on or off (`user`: a gesture, `stateChanged` follows). */
  setOn(on: boolean, o?: { readonly user?: boolean }): void;
  /** The pivot columns as given, the first band first. */
  by(): readonly string[];
  /** Pivots by these columns at once; `user`: the number of created columns said. */
  setBy(by: readonly string[], o?: { readonly user?: boolean }): void;
  /** The pivot columns whose created columns run in reverse (pivot.md 33). */
  desc(): readonly string[];
  setDesc(ids: readonly string[], o?: { readonly user?: boolean }): void;
  /** A column's short name as the application gave it (`headerShort`, else `header`, else its id; pivot.md 38). */
  name(id: string): string;
  /** Whether a column may become a pivot column: known, groupable, not one the pivot made, not grouping the rows. */
  accepts(id: string): boolean;
  /** The values and their functions. */
  values(): Fns;
  setValues(values: Fns, o?: { readonly user?: boolean }): void;
  /** The value column of a created column (undefined: not one). */
  valueColumn(id: string): string | undefined;
  /** Created columns, made or not (above `maxColumns`: how many there would be). */
  count(): number;
  /** The table for a chart (pivot.md 16). */
  series(o?: { readonly value?: string; readonly level?: number }): PivotSeries;
}

/** What `grouping({ pivot })` asks of it: its shape at creation, then its setup beside the grouping's. */
export interface PivotFeature {
  readonly id: 'pivot';
  /** The pivot of a grid it is set up on; null before, after, on a server, or where grouping stepped aside. */
  api(grid: Grid): PivotApi | null;
  /** @internal For `grouping()`: the shape, made with the grouping's options. */
  make(o: GroupingOptions): GroupShape<unknown>;
  /** @internal For `grouping()`: set up beside it; the label column while pivot mode is on. */
  setup(g: GridContext<unknown>, s: GroupShape<unknown>): (FeatureHandle & { column(): string | undefined; by(): readonly string[] }) | null;
}

/** The label column's id: a made id (`~p…`), so never in a saved state. */
const LABEL = '~p:rows';
/** The empty crossing's header and a sub-total's, as the core writes them: translated when the columns are set. */
const BLANK = '\u0000';
const SUB = '\u0001';
const NUM = /^(number|day|instant)$/;
const ID = (r: unknown): unknown => r;
const leaves = (t: readonly ColumnOrGroup<unknown>[]): ColumnDef<unknown>[] => t.flatMap((n) => ('children' in n ? leaves(n.children) : [n as ColumnDef<unknown>]));
const strip = (t: readonly ColumnOrGroup<unknown>[], out: readonly string[]): ColumnOrGroup<unknown>[] =>
  t.flatMap((n) => ('children' in n ? ((n = { ...n, children: strip(n.children, out) }), n.children.length ? [n] : []) : out.includes(n.id) ? [] : [n]));

/**
 * `pivot(options)`: a pivot table (docs/behaviors/pivot.md; Phase 10), handed to `grouping({ by, pivot: p })`. The rows are
 * the groups, the values of the pivot columns become created columns with a total at each crossing; a label column at
 * the start, the data columns folded away, the value columns under « Total » at the end; `spans()` draws the bands.
 *
 * ```ts
 * import { grouping } from '@dzgrid/dom/grouping';
 * import { pivot } from '@dzgrid/dom/pivot';
 * import { spans } from '@dzgrid/dom/spans';
 * import { FR_PIVOT } from '@dzgrid/dom/locales/fr-pivot';
 * const p = pivot({ columns: ['month'], values: { amount: 'sum' } });
 * createGrid(host, { …, features: [spans(), grouping({ by: ['region'], pivot: p })] });
 * ```
 */
export function pivot(o: PivotFeatureOptions = {}): PivotFeature {
  let made: PivotShape<unknown> | undefined;
  const apis = new WeakMap<object, PivotApi>();
  return {
    id: 'pivot',
    api: (grid) => apis.get(grid.kernel) ?? null,
    make: (go) => (made = pivotShape({ ...go, ...o, labels: { blank: BLANK, total: SUB + '{name}' } })),
    setup(g, s) {
      if (s !== made) return null;
      made = undefined;
      return setup(g, o, s as PivotShape<unknown>, apis);
    },
  };
}

function setup(g: GridContext<unknown>, o: PivotFeatureOptions, shape: PivotShape<unknown>, apis: WeakMap<object, PivotApi>): FeatureHandle & { column(): string | undefined; by(): readonly string[] } {
  const missing = PIVOT_KEYS.filter((k) => g.settings.messages.text[k] === undefined);
  if (missing.length) throw new TypeError(`pivot: missing ${missing.join(', ')}`);
  const { kernel, columns: m, doc } = g;
  /** The application's columns: what the pivot composes its own from. */
  let host = g.settings.columns as readonly ColumnOrGroup<unknown>[];
  /** The columns the pivot set (null: none, pivot off), what they were made of, the data columns searched. */
  let eff: readonly ColumnOrGroup<unknown>[] | null = null;
  let made = '';
  let tell = false;
  let warned = '';
  /** The application's own definitions: the short names (pivot.md 38). */
  let defs = new Map<string, ColumnDef<unknown>>();
  const name = (id: string): string => { const d = defs.get(id); return d?.headerShort ?? d?.header ?? id; };
  /** A value's header: « sum(Amount) » (`full`: the full header, for the tooltip) or its short name. */
  const vhead = (id: string, fn: boolean, full?: boolean): string => {
    const col = (full && defs.get(id)?.header) || name(id);
    // The function's name (an application's own has none: the column alone).
    const t = fn && g.settings.messages.text[`fn.${shape.valueFns()[id]}` as 'fn.sum'];
    return typeof t == 'string' ? g.msg('pivot.valueChip', { fn: t.toLocaleLowerCase(g.settings.messages.locale), column: col }) : col;
  };
  /** The user's or the definition's hidden (one read of the states per call: `sig` runs at each paint). */
  const shownOf = (ds: readonly ColumnDef<unknown>[]): ColumnDef<unknown>[] => {
    const st = new Map(m.state().map((x) => [x.id, x.hidden]));
    return ds.filter((d) => !(st.get(d.id) ?? d.hidden));
  };
  /** The data columns searched in pivot mode (pivot.md 25): those folded away that the user had shown. */
  let searched: string[] = [];
  const read = (c: ResolvedColumn<unknown>, row: unknown): unknown => {
    try {
      const raw = c.read(row as object);
      return isBlank(raw) ? null : c.codec.coerce(raw, g.ctx);
    } catch {
      return null;
    }
  };
  /** A row's data as the quick search reads it (quick-filter.md): texts and lists always, numbers and dates by their digit-bearing pieces. */
  const hay = (row: unknown): string => {
    const out: string[] = [];
    for (const id of searched) {
      const c = m.get(id);
      const v = c ? read(c, row) : null;
      if (v === null) continue;
      else if (NUM.test(c!.type)) for (const t of [c!.codec.format(v, g.ctx), c!.codec.toExport(v)]) out.push(...fold(t).split(/\s+/).filter((w) => /[0-9]/.test(w)));
      else if (c!.type === 'enum') out.push(c!.codec.format(v, g.ctx), c!.codec.toExport(v));
      else if (c!.type === 'text' || (c!.type === 'custom' && c!.codec.keyKind === 'text')) out.push(String(v));
    }
    return out.join(' ');
  };
  // The label column's values: the row itself, read for the search only (a sort on it reads one empty key).
  const codec: ValueCodec<{ toString(): string }> = {
    kind: 'custom', keyKind: 'text',
    coerce: (r) => (r == null ? null : { toString: () => hay(r) }),
    parse: () => REJECTED, format: String, sortKey: () => '', compare: () => 0, isEmpty: (v) => v == null, equals: () => true, toExport: String,
  };
  /** A created header as shown: the empty crossing's « (Vide) », a sub-total's « Total 2025 ». */
  const head = (h: string | undefined): string => (h === BLANK ? g.msg('group.blank') : h?.[0] === SUB ? g.msg('pivot.subtotal', { name: head(h.slice(1)) }) : h ?? '');
  /** The created tree as shown (pivot.md 34, 38): headers translated, the value headers, tooltips, widths, bands that fold. */
  const relabel = (t: readonly ColumnOrGroup<unknown>[], fn: boolean, many: boolean, up: string[] = []): ColumnOrGroup<unknown>[] =>
    t.map((n, i) => {
      // A row total (under « Total ») is its own value.
      const vc = shape.valueColumn(n.id) ?? (n.id[0] != '~' && n.id);
      const own = vc == n.id;
      // Several values or a row total: the value's header; one value: the crossing's label.
      const h = vc && (many || own) ? vhead(vc, fn) : head(n.header);
      const x: Record<string, unknown> = { ...n, header: h };
      if ('children' in n) (x.children = relabel(n.children, fn, many, [...up, h])), (x.collapsible = true);
      else if (vc) (x.headerTooltip = [...up, ...(many || own ? [] : [h]), vhead(vc, true, true)].join(' › ')), own || o.width || (x.width = Math.min(240, Math.max(120, h.length * 9 + 64)));
      if (i && up.length && !own) x.groupShow = 'open';
      return x as unknown as ColumnOrGroup<unknown>;
    });
  const setTree = (t: readonly ColumnOrGroup<unknown>[]): void => {
    g.settings = { ...g.settings, columns: t as never };
    kernel.dispatch({ type: 'columns.set', defs: t }, 'host');
  };
  /** The pivot's fold, joined with collapsible groups' (`groups()`): never `hidden` (pivot.md 18). */
  const foldTo = (f: ReadonlySet<string>): void => {
    g.foldExtra = f;
    const r = g.refold ? g.refold() : m.fold(f);
    if (r.layoutChanged) kernel.dispatch({ type: 'column.state', patch: [] }, 'host');
  };
  /** What the effective columns are made of: the created columns, the grouping, the values, the language, the searched columns. */
  const sig = (): string => [shape.on, shape.generated().key, shape.reads!().join('\0'), Object.entries(shape.valueFns()).map((e) => e.join('\u0003')).join('\0'), g.settings.messages.locale, shownOf(leaves(host)).map((d) => d.id).join('\0')].join('\u0002');

  /** The effective columns made again from the application's (pivot.md 17, 18, 29). */
  const derive = (): void => {
    made = sig();
    const all = leaves(host);
    defs = new Map(all.map((d) => [d.id, d]));
    const gen = shape.generated();
    // Off, or both bands emptied: the application's columns back (owner, 2026-11-07).
    if (!shape.on || (!shape.pivotBy.length && !shape.reads!().length)) {
      if (eff) (eff = null), (g.rowText = undefined), setTree(host), foldTo(new Set());
      return;
    }
    const vals = Object.keys(shape.valueFns()).filter((id) => m.get(id));
    const many = vals.length > 1;
    const fn = o.valueHeaders === 'fn' || (o.valueHeaders !== 'name' && many);
    const folded = all.filter((d) => !vals.includes(d.id));
    const label: ColumnDef<unknown> = {
      id: LABEL, header: shape.reads!().map(name).join(' / '), pinned: 'start', width: o.labelWidth ?? 200, movable: false, hideable: false, chooser: false,
      filter: false, groupable: false, type: 'custom', codec, value: ID,
    } as ColumnDef<unknown>;
    // The row totals: the value columns under « Total », their headers the values' (38).
    const tot = g.msg('pivot.total');
    const total = vals.length ? [{ id: '~b:total', header: tot, children: relabel(all.filter((d) => vals.includes(d.id)), fn, many, [tot]) }] : [];
    searched = shownOf(folded).map((d) => d.id);
    setTree((eff = [label, ...strip(host, vals), ...relabel(gen.columns, fn, many), ...total]));
    foldTo(new Set(folded.map((d) => d.id)));
    // Find (pivot.md 25): the cells shown, and on a last row's label cell the data of its rows.
    g.rowText = (n, vis) =>
      n.kind === 'group' || n.kind === 'footer'
        ? vis.map((c) => {
          const t = g.grouped!.cell(n, c);
          return c.id === LABEL && n.kind === 'group' && n.level === shape.reads!().length - 1 ? [t, ...shape.rows(n.key).flatMap((r) => searched.map((id) => { const x = m.get(id); const v = x ? read(x, r) : null; return v === null ? '' : x!.codec.format(v as never, g.ctx); }))].join('\u0003') : t;
        })
        : undefined;
    // Said once (pivot.md 23): above the limit, its count; after a user's change, how many columns were made.
    const over = gen.key[0] === '>';
    if (over && warned !== gen.key) warned && g.live.announce(g.msg('pivot.tooMany', { n: gen.count })), (warned = gen.key);
    else if (tell && !over) g.live.announce(g.msg('pivot.count', { n: gen.count }));
    if (!over) warned = '-';
    tell = false;
    paint();
  };

  // ---- the strip: the switch (24) and the limit's note (23) ----
  const bar = doc.createElement('div');
  // The bands' strip and look (`@dzgrid/theme/grouping.css`).
  bar.className = 'dzg-gzone dzg-pbar';
  // The switch (pivot.md 35): in the strip, in the application's element, or none; a track and a knob drawn by the theme.
  const inside = o.toggle === true || o.toggle === 'inside';
  const sw = o.toggle ? (inside ? bar : (o.toggle as HTMLElement)).appendChild(doc.createElement('button')) : null;
  const track = doc.createElement('span');
  track.className = 'dzg-pswitch-track';
  const note = bar.appendChild(doc.createElement('span'));
  note.className = 'dzg-pnote';
  if (sw) (sw.type = 'button'), (sw.className = 'dzg-chip dzg-pswitch'), sw.setAttribute('role', 'switch');
  g.el.root.insertBefore(bar, g.el.viewport);
  const paint = (): void => {
    const gen = shape.generated();
    const t = gen.key[0] === '>' ? g.msg('pivot.tooMany', { n: gen.count }) : '';
    if (note.textContent !== t) note.textContent = t;
    if (sw) sw.replaceChildren(track, g.msg('pivot.switch')), sw.setAttribute('aria-checked', String(shape.on));
    // The band's own `display` would beat `hidden`.
    bar.hidden = !inside && !t;
    bar.style.display = bar.hidden ? 'none' : '';
  };
  const gesture = (user: boolean | undefined, f: (source: 'user' | 'api') => void): void => {
    tell = !!user;
    f(user ? 'user' : 'api');
    if (sig() !== made) derive();
    // Nothing changed: nothing to say later either (review R1).
    tell = false;
    if (user) g.saved?.('user');
  };
  if (sw) g.scope.on(sw, 'click', () => gesture(true, (s) => shape.setOn(!shape.on, s)));

  const off = kernel.subscribe((e) => {
    // The application's own columns: the pivot's made again from them (two `columns.set`, rare).
    if (e.type === 'columnsChanged' && e.source === 'host' && g.settings.columns !== eff) {
      host = g.settings.columns as readonly ColumnOrGroup<unknown>[];
      if (eff || shape.on) derive();
    } else if ((e.type === 'modelUpdated' || e.type === 'columnsChanged') && sig() !== made) derive();
  });
  // What the export and print read (aggregation by the pivot's functions), and the state's part (grid-state.md « Pivot »).
  if (g.grouped) Object.defineProperty(g.grouped, 'aggFuncs', { get: () => shape.valueFns() });
  g.exportColumns = () => {
    // CSV's one header line (pivot.md 27): a created column's whole chain of headers.
    const chain = new Map<string, string>();
    const walk = (t: readonly ColumnOrGroup<unknown>[], up: string[]): void => t.forEach((n) => ('children' in n ? walk(n.children, [...up, n.header ?? '']) : up.length && chain.set(n.id, [...up, n.header ?? n.id].join(' › '))));
    walk(eff ?? [], []);
    const cut = (c: ResolvedColumn<unknown> | undefined): ResolvedColumn<unknown> | undefined => (c && chain.has(c.id) ? { ...c, def: { ...c.def, header: chain.get(c.id)! } } : c);
    return Object.create(m, { get: { value: (id: string) => cut(m.get(id)) }, visible: { value: () => m.visible().map(cut) } }) as ColumnLookup<unknown>;
  };
  g.colName = (id) => defs.get(id)?.header;
  const st = pivotState(shape, m);
  g.pivotState = { ...st, initial: st.get() };

  apis.set(kernel, {
    on: () => shape.on,
    setOn: (on, x) => gesture(x?.user, (s) => shape.setOn(on, s)),
    by: () => shape.pivotBy,
    setBy: (by, x) => gesture(x?.user, (s) => shape.setPivotBy(by, s)),
    desc: () => shape.pivotDesc,
    setDesc: (d, x) => gesture(x?.user, (s) => shape.set({ desc: d }, s)),
    name,
    accepts: (id) => !!m.get(id) && m.get(id)!.def.groupable !== false && !shape.made(id) && !shape.reads!().includes(id),
    values: () => shape.valueFns(),
    setValues: (v, x) => gesture(x?.user, (s) => shape.setValueFns(v, s)),
    valueColumn: (id) => (Object.hasOwn(shape.valueFns(), id) ? undefined : shape.valueColumn(id)),
    count: () => shape.generated().count,
    series: (so) => {
      const r = shape.series(so);
      const fix = (x: string): string => x.split(' › ').map(head).join(' › ');
      return { categories: r.categories.map(fix), series: r.series.map((x) => ({ ...x, name: fix(x.name) })) };
    },
  });
  derive();

  return {
    column: () => (shape.on ? LABEL : undefined),
    by: () => shape.pivotBy,
    afterRows() {
      // Another language: the headers the pivot writes, again.
      if (sig() !== made) derive();
      else paint();
    },
    destroy() {
      off();
      apis.delete(kernel);
      bar.remove();
      sw?.remove();
      delete g.rowText;
      delete g.exportColumns;
      delete g.pivotState;
      delete g.colName;
      delete g.foldExtra;
    },
  };
}
