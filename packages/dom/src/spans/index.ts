import type { DisplayedRows, FocusPos, RowKey } from '@dzgrid/core';
import { emit, sameFocus, setFocusOwner } from '@dzgrid/core/internal';
import { buildSpanMap, navigate, ownerFocus, rowPlanner, type RowSpanPlan, type SpanMap } from '@dzgrid/core/spans';
import type { GridContext } from '../context.js';
import { setPx } from '../render/write.js';
import type { FeatureHandle, GridFeature, MoveFn, SpanFeature } from '../features.js';
import { createBands } from './bands.js';
import { createBody } from './body.js';
import { injectSpanStyles } from './styles.js';

/**
 * `spans()`: cells spanning rows and columns (docs/behaviors/spans.md) — identical
 * values merged (`merge`), spans decided by the data (`rowSpan`, `colSpan`),
 * full-width rows (`settings.fullWidth`), grouped headers (groups in `columns`,
 * `./bands.ts`). The map comes from the core
 * (`buildSpanMap`), on the rows as displayed and the visible columns; this
 * feature lays it out under virtual scrolling, moves the keys over it and
 * maps a click on a tall cell to the row under the pointer.
 *
 * ```ts
 * import { spans } from '@dzgrid/dom/spans';
 * createGrid(host, { columns: [{ id: 'ward', merge: true }, …], features: [spans()], … });
 * ```
 */
export function spans(): GridFeature {
  return { id: 'spans', setup };
}

/** Plans kept per map: a long scroll forgets the oldest at this size. */
const MAX_PLANS = 4096;

function setup(g: GridContext<unknown>): FeatureHandle {
  const { kernel, columns } = g;
  const root = g.el.root.getRootNode();
  if (g.settings.injectStyles !== false) injectSpanStyles(root.nodeType === 11 ? (root as ShadowRoot) : g.doc, g.settings.nonce);
  const body = createBody(g);
  // Grouped headers: the group rows, when the columns come in groups.
  const bands = createBands(g);
  // For the collapsible groups' feature (`@dzgrid/dom/groups`, Phase 6 step 7): where a group shows.
  if (bands) g.groupBands = bands;

  // ---- the map (the core gives the last one back while nothing it depends on changed) ----
  let map: SpanMap | null = null;
  function mapFor(rows: DisplayedRows<unknown>): SpanMap {
    const next = buildSpanMap({ rows, columns, ctx: g.ctx, fullWidth: g.settings.fullWidth }, map);
    if (next !== map && next.problems.length) emit(kernel, { type: 'problems', source: 'host', problems: next.problems });
    return (map = next);
  }
  const current = () => mapFor(g.rows.displayed);

  // ---- per-row plans, by display index, for one map and one column layout ----
  let planned: { map: SpanMap; version: number; plan: (row: number) => RowSpanPlan | null } | null = null;
  let plans = new Map<number, RowSpanPlan | null>();
  function planFor(m: SpanMap, i: number): RowSpanPlan | null {
    if (planned?.map !== m || planned.version !== columns.version || plans.size > MAX_PLANS) {
      planned = { map: m, version: columns.version, plan: rowPlanner(m, columns.layout) };
      plans = new Map();
    }
    let p = plans.get(i);
    if (p === undefined) plans.set(i, (p = planned.plan(i)));
    return p;
  }

  // A focus left on a covered slot (a sort, an update) goes to the cell owning it.
  setFocusOwner(kernel, (f, rows) => ownerFocus(mapFor(rows), columns.visible().map((c) => c.id))(f, rows));

  // ---- the keys: body moves over spans; the rest is the grid's ----
  /**
   * The last move into a cell, or click on a tall cell (`click`): the row aimed at, brought
   * into view instead of the cell's first. A click's row is where the next key starts from
   * (the grid's own goal is the keys' last one).
   */
  let aimed: { readonly focus: FocusPos; readonly row: RowKey; readonly click?: true } | null = null;
  const move: MoveFn = (_, s, from, goal, intent, base) => {
    // The group rows' keys, and Up from a column header into them.
    const b = bands?.move(_, s, from, goal, intent, base);
    if (b !== undefined) return b;
    const m = current();
    const d = s.rows;
    const r = from.kind === 'cell' ? d.indexOf(from.row) : -1;
    const c = s.cols.indexOf(from.column);
    if (r !== -1 && c !== -1) {
      if (aimed?.click && sameFocus(from, aimed.focus)) goal = { rowKey: aimed.row, colIndex: c };
      const gr = goal?.rowKey != null ? d.indexOf(goal.rowKey) : -1;
      const n = navigate(m, { rows: d.count, cols: s.cols.length, page: s.page }, { row: r, col: c }, gr === -1 ? null : { row: gr, col: goal!.colIndex }, intent);
      // Above the first row is the header's: the grid's own move goes there.
      if (n && n.to.row >= 0) {
        const key = (i: number) => d.keyAt(d.index(i)!);
        const to: FocusPos = { kind: 'cell', row: key(n.to.row), column: s.cols[n.to.col]! };
        aimed = { focus: to, row: key(n.goal.row) };
        return { to, goal: { rowKey: aimed.row, colIndex: n.goal.col } };
      }
    }
    return base!(m, s, from, goal, intent);
  };

  const feature: SpanFeature = {
    move,
    // The map of the rows shown now, for what reads cells by position (`@dzgrid/dom/print`, Phase 6 step 11).
    get map() {
      return current();
    },
    anchors(first, last) {
      win = { first, last };
      const d = g.rows.displayed;
      return current().coveringAbove(first).map((s) => d.keyAt(d.index(s.row)!));
    },
    plan: (i) => planFor(current(), i),
    at(x) {
      if (typeof x !== 'string') {
        // A click: the row under the pointer; on the focused tall cell, the keys start there.
        const u = body.under(x);
        if (u && sameFocus(kernel.focus, u.at)) aimed = { focus: u.at, row: u.row, click: true };
        return u?.row;
      }
      // A focus on the cell the keys last moved into: the row they aim at.
      return aimed && (aimed.focus as { row: RowKey }).row === x && sameFocus(kernel.focus, aimed.focus) ? aimed.row : undefined;
    },
  };
  let win: { first: number; last: number } | null = null;

  // The view's width, for full-width cells (no layout read in the paint).
  const RO = (g.win as (Window & { ResizeObserver?: typeof ResizeObserver }) | null)?.ResizeObserver;
  if (RO) {
    const ro = new RO(([e]) => setPx(g.el.root, '--dzg-view-w', e!.contentRect.width));
    ro.observe(g.el.viewport);
    g.scope.observe(ro);
  }

  // ---- hover: the row under the pointer (a tall cell lives in its first row: :hover would light that one) ----
  let hovered: { readonly el: HTMLElement; readonly key: RowKey } | null = null;
  const hover = (el: HTMLElement | null | undefined) => {
    if (el === hovered?.el) return;
    hovered?.el.removeAttribute('data-hover');
    const key = el ? g.rowRenderer.keyOf(el) : undefined;
    hovered = el && key !== undefined ? { el, key } : null;
    hovered?.el.setAttribute('data-hover', '');
  };
  const track = (e: Event) => {
    const u = body.under(e as MouseEvent);
    hover(u ? g.rowRenderer.mounted.get(u.row)?.el : (e.target as Element).closest?.<HTMLElement>('.dzg-row'));
  };
  g.scope.on(g.el.body, 'pointerover', track);
  g.scope.on(g.el.body, 'pointermove', track);
  g.scope.on(g.el.body, 'pointerleave', () => hover(null));

  return {
    spans: feature,
    ...(bands && { bands: bands.specs }),
    afterRows(f) {
      bands?.stretch(g.rowHeight());
      // A focused header moved to another segment or made again (a pin, a move, a group cut in
      // two) lost the DOM focus: the paint gives it back (`pendingFocus`, without scrolling).
      const h = kernel.focus;
      if (g.hasFocus && h?.kind === 'header' && !g.el.viewport.contains((root as Document).activeElement)) g.pendingFocus = { header: h.column, level: h.level ?? 0 };
      body.paint(f, win);
      // A hovered row element reused for another row (a scroll, a sort): the pointer is not over that one.
      if (hovered && (hovered.el.parentNode !== g.el.layer || g.rowRenderer.keyOf(hovered.el) !== hovered.key)) hover(null);
    },
    destroy() {
      setFocusOwner(kernel);
    },
  };
}
