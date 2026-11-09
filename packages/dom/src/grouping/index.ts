import { formattersFor, intentFor, problem, type ChangeSource, type DisplayIndex, type FocusPos, type GridKernel, type KeyOwner, type ResolvedColumn, type RowKey, type RowNode } from '@dzgrid/core';
import { emit, positions } from '@dzgrid/core/internal';
import { checkRowGroups, groupConflicts, groupShape, type GroupedRows, type GroupingOptions, type GroupShape } from '@dzgrid/core/grouping';
import type { ServerSideModel } from '@dzgrid/core/server-side';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { GroupMessageKey } from '../part-texts.js';
import type { CellView, Frame, RowView } from '../render/rows.js';
import { isolationFor } from '../render/bidi.js';
import { injectTreeStyles } from '../tree/styles.js';
import { stickyStack } from '../tree/sticky.js';

/** The texts `grouping()` needs, from `@dzgrid/dom/locales/<lang>-group`. */
export const GROUP_KEYS = ['group.label', 'group.blank', 'group.total', 'group.grandTotal', 'group.expanded', 'group.collapsed', 'group.expandedSome'] as const satisfies readonly GroupMessageKey[];

export interface GroupingFeatureOptions extends GroupingOptions {
  /** The column that shows the groups' labels and chevrons: the first visible one by default (row-grouping.md 15). */
  readonly column?: string;
  /** Pixels per level of indent (16 by default). */
  readonly indent?: number;
  /** Group rows kept pinned under the header while their rows scroll, the nearest first: 0 none, 3 by default. */
  readonly sticky?: number;
  /** A pivot table over the groups (`pivot()` from `@dzgrid/dom/pivot`, pivot.md 17–30); on a server only with `serverPivot()` (told). */
  readonly pivot?: {
    make(o: GroupingOptions): GroupShape<unknown>;
    setup(g: GridContext<unknown>, s: GroupShape<unknown>): (FeatureHandle & { column(): string | undefined; by(): readonly string[] }) | null;
  };
}

/** A grid's grouping (row-grouping.md 22), for the zone, the column menu and the application. */
export interface GroupingApi {
  /** The grouping columns as given, the first level first. */
  by(): readonly string[];
  /**
   * Groups by these columns at once, told by `groupByChanged` (source `api`; `user` with `user`; `host` with `host`, a
   * binding's write such as Angular's `[groupBy]`, which `stateChanged` does not follow); the open groups are kept.
   */
  setBy(by: readonly string[], o?: { readonly user?: boolean; readonly host?: boolean }): void;
  /** Opens every group, or the levels above `depth` (1: the first level). */
  expandAll(depth?: number): void;
  /** Closes every group. */
  collapseAll(): void;
  /** The grand totals by column id, over the rows the filters keep (aggregation.md 11). */
  totals(): Readonly<Record<string, unknown>>;
  /** Whether the band's « + » may offer a column (not a pivot column; group-drop-zone.md 18). */
  accepts?(id: string): boolean;
}
export interface GroupingFeature extends GridFeature {
  /** The grouping of a grid this feature is set up on; null before its setup, after it is destroyed, and where it stepped aside. */
  api(grid: { readonly kernel: GridKernel<any, any> }): GroupingApi | null;
}

/**
 * `grouping(options)`: rows grouped by columns, with totals (docs/behaviors/row-grouping.md, aggregation.md; Phase 7
 * step 5). Hands `groupShape` from `@dzgrid/core/grouping` to the grid's rows at creation; draws the group column (indent,
 * chevron, « value (n) »), the totals in the group and totals rows' cells, the rows' level, place and open state; opens
 * and closes by the chevron, Enter on a group row and the keys of the group column (mirrored right to left); keeps group
 * rows pinned under the header; says each opening. The tree's chevron styles and pinned-rows layout are shared.
 *
 * ```ts
 * import { grouping } from '@dzgrid/dom/grouping';
 * import { FR_GROUP } from '@dzgrid/dom/locales/fr-group';
 * import '@dzgrid/theme/grouping.css';
 * createGrid(host, { …, messages: { ...FR, text: { ...FR.text, ...FR_GROUP.text } }, features: [grouping({ by: ['ward'], footers: 'grand' })] });
 * ```
 */
export function grouping(o: GroupingFeatureOptions = {}): GroupingFeature {
  // Made by `shape()` for the grid being created: a shape the grid did not take (another feature's came first) leaves none.
  let made: GroupShape<unknown> | undefined;
  const apis = new WeakMap<object, GroupingApi>();
  return {
    id: 'grouping',
    // A tree wins the rows in either order (row-grouping.md 21): grouping then gives no shape and steps aside.
    shapeAfter: ['tree'],
    api: (grid) => apis.get(grid.kernel) ?? null,
    shape: () => (made = o.pivot ? o.pivot.make(o) : groupShape(o)) as never,
    setup(g) {
      const s = made;
      made = undefined;
      return setup(g, o, s, apis);
    },
  };
}

type Rows = GroupedRows<unknown>;
const PAD = 'padding-inline-start';
/** The cell's indent, read by the field's place (after the chevron, the tree's CSS). */
const VAR = '--dzg-tree-pad';

function setup(g: GridContext<unknown>, o: GroupingFeatureOptions, s: GroupShape<unknown> | undefined, apis: WeakMap<object, GroupingApi>): FeatureHandle {
  const missing = GROUP_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
  if (missing.length) throw new TypeError(`grouping: missing ${missing.join(', ')}`);
  const { kernel, el, rowRenderer, doc } = g;
  // What grouping refuses beside it (row-grouping.md 13, 21): told once. Beside a tree (which took the rows) or on a server it steps aside.
  const has = (id: string): boolean => !!g.settings.features?.some((f) => f.id === id);
  const tree = has('tree');
  // A list grouped on the server (`serverSideRows`, server-side-groups.md): the model groups, this feature draws and forwards.
  const side = typeof (g.rows as Partial<ServerSideModel<unknown>>).setBy == 'function' ? (g.rows as ServerSideModel<unknown>) : null;
  const server = g.rows.kind === 'source' && !side;
  // Merged cells only (pivot.md 21): header bands are drawn beside grouping.
  const spans = has('spans') && (!!g.settings.fullWidth || g.columns.visible().some((c) => c.def.merge || c.def.rowSpan || c.def.colSpan));
  const told = groupConflicts({ tree, detail: has('detail') || has('responsive'), spans, server });
  // A pivot on a server (pivot.md 26): not made, the grid as grouping alone shows it — unless the server pivots (server-pivot.md).
  if (o.pivot && g.rows.kind === 'source' && !side?.pivot) told.push(problem('unsupported-combination', 'warning', 'source', 'pivot'));
  if (told.length) emit(kernel, { type: 'problems', source: 'host', problems: told });
  if (!s || tree || server) return s?.off(), { destroy() {} };
  const shape: Pick<GroupShape<unknown>, 'by' | 'setBy' | 'reads' | 'totals'> = side ? { get by() { return side.by; }, setBy: (by, x) => side.setBy(by, x), reads: () => side.by, totals: () => side.totals() } : s;
  injectTreeStyles(el.root.getRootNode() as Document | ShadowRoot, g.settings.nonce);

  const rows = (): Rows | null => {
    const d = g.rows.displayed as Partial<Rows>;
    return d.posAt ? (d as Rows) : null;
  };
  /** At least one grouping column in use (refused ones dropped): a tree grid. */
  const grouped = (): boolean => shape.reads!().length > 0;
  let pv: ReturnType<NonNullable<GroupingFeatureOptions['pivot']>['setup']> = null;
  const labelColumn = (): string | undefined => {
    const shown = g.columns.visible();
    const want = pv?.column() ?? o.column;
    return (shown.some((c) => c.id === want) ? want : shown[0]?.id);
  };
  const indent = o.indent === +o.indent! && o.indent >= 0 && o.indent <= 1000 ? o.indent : 16;
  const expand = (keys: readonly RowKey[], expanded: boolean): void => void kernel.dispatch({ type: 'rows.expand', rows: keys, expanded }, 'user');
  const nameOf = (n: { readonly label: string }): string => n.label || g.msg('group.blank');
  /** What the group column shows on a group or totals row. */
  const labelOf = (n: RowNode<unknown>): string =>
    n.kind === 'group' ? g.msg('group.label', { name: nameOf(n), n: n.count ?? 0 }) : n.kind === 'footer' ? (n.group === null ? g.msg('group.grandTotal') : g.msg('group.total', { name: nameOf(n) })) : '';
  /** A column's total function, as the core reads it (the options win). */
  const fnOf = (col: ResolvedColumn<unknown>): unknown => {
    const f = g.grouped?.aggFuncs;
    return f && Object.hasOwn(f, col.id) ? f[col.id] : col.def.aggFunc;
  };
  /** A total as its cell shows it (aggregation.md 1, row-grouping.md 16): the column's format; a count, a number of the language. */
  const textOf = (col: ResolvedColumn<unknown>, v: unknown): string => {
    if (v === null || v === undefined) return '';
    const fn = fnOf(col);
    try {
      if (fn === 'count' && col.type !== 'number') return formattersFor(g.ctx).number()(v as number);
      // The core's totals are typed values; an application's function, or a server, may give anything the column can read.
      const x = typeof fn == 'function' || side ? col.codec.coerce(v, g.ctx) : v;
      return x === null ? (typeof v == 'string' ? v : '') : col.codec.format(x as never, g.ctx);
    } catch {
      return '';
    }
  };
  /** A cell's text written as the base writes it: the text node, isolated when the value needs it. */
  const put = (cv: CellView, type: string, text: string): void => {
    if (cv.text.data !== text) cv.text.data = text;
    const iso = isolationFor(text, type, g.dir);
    if (iso) {
      if (!cv.value) cv.value = doc.createElement('span');
      const cls = iso === 'free' ? 'dzg-free' : 'dzg-num';
      if (cv.value.className !== cls) cv.value.className = cls;
      if (cv.text.parentNode !== cv.value) cv.value.append(cv.text);
      if (cv.value.parentNode !== cv.el) cv.el.append(cv.value);
    } else if (cv.text.parentNode !== cv.el) {
      cv.el.append(cv.text);
      cv.value?.remove();
    }
  };

  /** A group opened on a server: said once its first block is in (its loading row gone), with its children's number. */
  let wait: RowKey | null = null;
  const said = (key: RowKey, expanded: boolean): void => {
    const d = rows();
    const i = (d ? d.indexOf(key) : -1) as DisplayIndex;
    const n = i < 0 ? null : d!.nodeAt(i);
    const next = expanded && i >= 0 && i + 1 < d!.count ? d!.nodeAt((i + 1) as DisplayIndex) : null;
    wait = next?.kind === 'loading' && next.parent === key ? key : null;
    if (n?.kind === 'group' && !wait) g.live.announce(expanded ? g.msg('group.expanded', { name: nameOf(n), n: d!.childrenAt(i) }) : g.msg('group.collapsed', { name: nameOf(n) }));
  };
  // A user's opening or closing, said once (screen readers do not all say aria-expanded): the value, without its count.
  const off = kernel.subscribe((e) => {
    if (e.type === 'modelUpdated' && wait) said(wait, true);
    if (e.type !== 'rowExpanded' || e.source !== 'user' || !grouped()) return;
    if (e.rows.length > 1) return void (e.expanded && g.live.announce(g.msg('group.expandedSome', { n: e.rows.length })));
    said(e.rows[0]!, e.expanded);
  });
  /** Regroups, told once when the columns changed (grid-state.md « Row grouping » 4): column ids only. */
  const setBy = (by: readonly string[], source: ChangeSource): void => {
    const was = shape.by;
    shape.setBy(by, source);
    if (shape.by !== was) emit(kernel, { type: 'groupByChanged', source, by: shape.by });
  };
  // What print and the export read, and the state's part (checked by the core; a restore is the host's).
  g.grouped = { column: labelColumn, by: () => shape.reads!(), label: labelOf, cell: (n, c) => (c.id === labelColumn() ? labelOf(n) : textOf(c, n.aggs?.[c.id])), aggFuncs: o.aggFuncs };
  const initial = shape.by;
  g.rowGroups = {
    initial,
    // The columns in use (refused ones dropped), so a state restores without a word.
    get: () => shape.reads!(),
    set(raw) {
      const r = checkRowGroups(raw, g.columns);
      if (r.by) setBy(r.by, 'host');
      return r.problems;
    },
  };
  // A state restored before this setup (`gridState` listed first): its part applied now, what it skipped told.
  if (g.rowGroupsLater !== undefined) {
    const ps = g.rowGroups.set(g.rowGroupsLater);
    delete g.rowGroupsLater;
    if (ps.length) emit(kernel, { type: 'problems', source: 'host', problems: ps });
  }
  apis.set(kernel, {
    by: () => shape.by,
    setBy: (by, x) => setBy(by, x?.user ? 'user' : x?.host ? 'host' : 'api'),
    expandAll: (depth) => void kernel.dispatch({ type: 'rows.expandAll', expanded: true, ...(depth !== undefined && { depth }) }, 'api'),
    collapseAll: () => void kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'api'),
    totals: () => shape.totals(),
    accepts: (id) => !pv?.by().includes(id),
  });

  // The pointer on a group's chevron opens or closes it, and nothing else (no selection, no row click).
  g.scope.on(el.viewport, 'click', (e) => {
    const t = (e.target as Element).closest?.('.dzg-toggle');
    const row = t && !t.hasAttribute('data-leaf') ? t.closest('.dzg-row') : null;
    const key = row ? rowRenderer.keyOf(row) : undefined;
    const d = rows();
    const i = key && d ? d.indexOf(key) : -1;
    if (i === -1) return;
    e.stopPropagation();
    expand([key!], !d!.expandedAt(i));
  }, { capture: true });

  // Group rows pinned under the header (tree-sticky.md, the tree's layer and stack): 0 makes none.
  const up = (d: Rows, i: number): number => {
    const p = d.parentOf(d.keyAt(i as DisplayIndex));
    return p === null ? -1 : d.indexOf(p);
  };
  const sticky = o.sticky === +o.sticky! ? Math.max(0, Math.floor(o.sticky)) : 3;
  let last: unknown[] = [];
  let layer: HTMLElement | null = null;
  const stack = sticky ? rowRenderer.spawn((layer = doc.createElement('div'))) : null;
  if (layer) {
    layer.className = 'dzg-sticky';
    layer.setAttribute('aria-hidden', 'true');
    el.header.append(layer);
    g.insetFor = (i) => {
      const d = grouped() ? rows() : null;
      let y = 0;
      for (let c = d ? Math.min(sticky, Math.floor(g.viewBlock / 2 / g.rowHeight()), d.levelAt(i as DisplayIndex)) : 0; c-- > 0 && y + g.layout!.heightOf(up(d!, i) as DisplayIndex) <= g.viewBlock / 2; ) y += g.layout!.heightOf((i = up(d!, i)) as DisplayIndex);
      return y;
    };
    const no = (e: Event): void => e.preventDefault();
    g.scope.on(layer, 'pointerdown', no);
    g.scope.on(layer, 'mousedown', no);
    // A copy goes to its real row: its chevron opens or closes it; elsewhere the real row's cell is focused, never selected.
    g.scope.on(layer, 'click', (e) => {
      e.stopPropagation();
      const t = e.target as Element;
      const row = t.closest('.dzg-row');
      const key = row ? stack!.keyOf(row) : undefined;
      const d = rows();
      const i = key && d ? d.indexOf(key) : -1;
      if (i === -1 || t.closest('.dzg-check')) return;
      if (t.closest('.dzg-toggle')) return expand([key!], !d!.expandedAt(i));
      const c = t.closest<HTMLElement>('.dzg-cell')?.dataset['col'] ?? labelColumn();
      if (c && kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: key!, column: c } }, 'user').ok) g.restoreFocus();
    }, { capture: true });
  }

  /** `*`: every closed sibling group opens (tree-keys.md). */
  // The closed sibling groups of a row (`*`): the rows held walked once, a parent's level ending a run (R2: a list from a
  // server never walks its loading rows).
  const siblings = (d: Rows, i: DisplayIndex): void => {
    const level = d.levelAt(i);
    let out: RowKey[] = [];
    for (const j of positions(d)) {
      const l = d.levelAt(j);
      if (l < level) {
        if (j > i) break;
        out = [];
      } else if (l === level && d.childrenAt(j) > 0 && !d.expandedAt(j)) out.push(d.keyAt(j));
    }
    if (out.length) expand(out, true);
  };

  const set = (x: Element, name: string, v: string | null): void => {
    if (v === null) x.removeAttribute(name);
    else if (x.getAttribute(name) !== v) x.setAttribute(name, v);
  };
  const labelIn = (cell: HTMLElement): Element | null => cell.querySelector(':scope > .dzg-label');
  const undecorate = (cell: HTMLElement): void => {
    labelIn(cell)?.remove();
    const t = cell.firstElementChild;
    if (t?.classList.contains('dzg-toggle')) t.remove();
    cell.style.removeProperty(PAD);
    cell.style.removeProperty(VAR);
  };
  const ROW_ATTRS = ['aria-level', 'aria-posinset', 'aria-setsize', 'aria-expanded'];
  // The pivot beside it (browser rows, or a server that pivots), once what it reads is set.
  if (!side || side.pivot) pv = o.pivot?.setup(g, s) ?? null;
  let decorated = new Set<HTMLElement>();
  let leveled = new Set<HTMLElement>();

  return {
    // Merged cells are off beside grouping (row-grouping.md 21): the grid paints without them.
    beforeRows() {
      if (spans) g.spans = null;
    },
    afterRows(f: Frame<unknown>) {
      const d = rows();
      const tg = grouped();
      set(el.viewport, 'role', tg ? 'treegrid' : 'grid');
      const col = labelColumn();
      const now = new Set<HTMLElement>();
      const lv = new Set<HTMLElement>();
      if (stack) {
        const r = d && tg ? stickyStack({ top: g.scroll.logicalTop, n: sticky, viewBlock: g.viewBlock, h: g.rowHeight(), count: d.count, layout: g.layout!, levelAt: (i) => d.levelAt(i as DisplayIndex), ancestorOf: (i) => up(d, i) }) : { at: [] as number[], y: [] as number[], height: 0 };
        const inset = `${(g.inset = r.height)}px`;
        if (el.root.style.getPropertyValue('--dzg-inset') !== inset) el.root.style.setProperty('--dzg-inset', inset);
        const sig = [d, f.epoch, f.cols?.first, f.cols?.last, kernel.selection, stack.rev, g.dir, col, ...r.at, ...r.y];
        if (sig.length !== last.length || sig.some((x, j) => x !== last[j])) {
          last = sig;
          stack.render({ ...f, rowTop: (i) => r.y[r.at.indexOf(i)]!, partFor: () => null, spans: null, focusRow: null, focusCenter: -1, focusColumn: null, rowAttrs: (key, row) => (f.rowAttrs(key, row), row.removeAttribute('aria-rowindex')) }, r.at, []);
          r.at.forEach((i, j) => (stack.mounted.get(d!.keyAt(i as DisplayIndex))!.el.style.zIndex = String(r.at.length - j)));
        }
        if (el.header.lastChild !== layer) el.header.append(layer!);
      }
      const decorate = (key: RowKey, v: RowView, copy?: boolean): void => {
        const i = d ? d.indexOf(key) : -1;
        if (i === -1) return;
        const node = d!.nodeAt(i);
        const level = d!.levelAt(i);
        const kids = d!.childrenAt(i) > 0;
        const open = kids && d!.expandedAt(i);
        if (!copy && tg) {
          lv.add(v.el);
          set(v.el, 'aria-level', String(level + 1));
          set(v.el, 'aria-posinset', String(d!.posAt(i)));
          set(v.el, 'aria-setsize', String(d!.sizeAt(i)));
          // A pivot's last rows hold nothing to open (pivot.md 2): no state.
          set(v.el, 'aria-expanded', node.kind === 'group' && d!.childrenAt(i) !== 0 ? String(open) : null);
        }
        const totals = node.kind === 'group' || node.kind === 'footer' ? node.aggs ?? {} : null;
        // The totals in the other cells (aggregation.md 1); the group column holds the label.
        if (totals) for (const [id, cv] of v.cells) if (cv.col && id !== col) put(cv, cv.col.type, textOf(cv.col, totals[id]));
        const cell = col === undefined ? undefined : v.cells.get(col);
        if (!cell || (!tg && !totals)) return;
        const c = cell.el;
        now.add(c);
        let t = c.firstElementChild;
        if (tg) {
          if (!t?.classList.contains('dzg-toggle')) {
            t = doc.createElement('span');
            t.className = 'dzg-toggle';
            t.setAttribute('aria-hidden', 'true');
            c.prepend(t);
          }
          set(t, 'data-open', open ? '' : null);
          set(t, 'data-leaf', kids ? null : '');
        } else if (t?.classList.contains('dzg-toggle')) t.remove();
        let l = labelIn(c);
        if (totals) {
          // The group column's own text stays empty: the label is in its own span (free text, its own direction).
          put(cell, cell.col!.type, '');
          if (!l) (l = doc.createElement('span')), (l.className = 'dzg-free dzg-label'), c.firstElementChild?.classList.contains('dzg-toggle') ? c.firstElementChild.after(l) : c.prepend(l);
          const text = labelOf(node);
          if (l.textContent !== text) l.textContent = text;
        } else l?.remove();
        const pad = `calc(var(--dzg-cell-padding-inline, 0.5rem) + ${tg ? level * indent : 0}px)`;
        if (c.style.getPropertyValue(PAD) !== pad) c.style.setProperty(PAD, pad), c.style.setProperty(VAR, pad);
      };
      for (const [key, v] of rowRenderer.mounted) decorate(key, v);
      if (stack) for (const [key, v] of stack.mounted) decorate(key, v, true);
      for (const c of decorated) if (!now.has(c)) undecorate(c);
      for (const r of leveled) if (!lv.has(r)) for (const a of ROW_ATTRS) r.removeAttribute(a);
      decorated = now;
      leveled = lv;
      pv?.afterRows?.(f);
    },
    keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
      const d = rows();
      if (!d || !grouped() || owner !== 'cell' || at?.kind !== 'cell' || e.ctrlKey || e.altKey || e.metaKey) return false;
      const i = d.indexOf(at.row);
      if (i === -1) return false;
      const kids = d.childrenAt(i) > 0;
      const open = kids && d.expandedAt(i);
      // Enter on a group row, in any column: opens or closes it (owner Q-K1 A; nothing to edit there).
      if (e.key === 'Enter' && !e.shiftKey && d.nodeAt(i).kind === 'group') return expand([at.row], !open), true;
      if (at.column !== labelColumn()) return false;
      if (e.key === '*') return siblings(d, i), true;
      // The grid's own reading of the key: forward and back mirrored right to left (Shift: no move).
      const step = intentFor(e, { dir: g.dir, owner, mac: g.mac });
      if (step?.kind !== 'move' || step.axis !== 'col') return false;
      if (step.delta > 0) return kids && !open && (expand([at.row], true), true);
      if (open) return expand([at.row], false), true;
      // Back on a closed group, a row or a footer: its group, same column (a first-level group: nothing).
      const parent = d.parentOf(at.row);
      if (parent !== null && kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: parent, column: at.column } }, 'user').ok) g.restoreFocus();
      return true;
    },
    destroy() {
      pv?.destroy();
      off();
      apis.delete(kernel);
      delete g.grouped;
      delete g.rowGroups;
      stack?.clear();
      layer?.remove();
      g.inset = 0;
      el.root.style.removeProperty('--dzg-inset');
      delete g.insetFor;
      for (const c of decorated) undecorate(c);
      for (const r of leveled) for (const a of ROW_ATTRS) r.removeAttribute(a);
      el.viewport.setAttribute('role', 'grid');
    },
  };
}
