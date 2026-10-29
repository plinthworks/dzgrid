import { clientRows, createColumnModel, createKernel, problem, resolveOperations, type ClientModel, type GridKernel, type RowKey, type RowModel } from '@dzgrid/core';
import { emit, filterKindLookup, missingFeatureProblems } from '@dzgrid/core/internal';
import { sortAnnouncer, selectionAnnouncer } from './a11y/announce.js';
import { LiveRegion } from './a11y/live-region.js';
import type { GridContext, GridEnv } from './context.js';
import { watchDirection, type Dir } from './dir.js';
import { installHeaderClick } from './interact/header-click.js';
import { ScrollController } from './interact/scroll.js';
import { installScrolling } from './interact/scrolling.js';
import { installSelect } from './interact/select.js';
import { installTooltips } from './interact/tooltips.js';
import { installFocus } from './keys/focus.js';
import { isMac } from './keys/owner.js';
import { installKeys } from './keys/router.js';
import { checkMessages, msg } from './messages.js';
import { HeaderRenderer } from './render/header.js';
import { domGeometry } from './render/measure.js';
import { RowRenderer, setAttr } from './render/rows.js';
import { FrameScheduler } from './render/scheduler.js';
import { Scope } from './render/scope.js';
import { Tooltip } from './render/tooltip.js';
import { featureParts, unslotted } from './part.js';
import { createPainter } from './render/viewport.js';
import { ROW_HEIGHT, rowPx, type GridSettings } from './settings.js';
import { injectStyles } from './styles.js';
import { installWarmup } from './warmup.js';
import { applyUpdate, closed, ctxOf, rowHeightProblems } from './update.js';
import { shapeOf } from './features.js';

export interface GridApi {
  focusCell(row: RowKey, column: string): void;
  ensureVisible(row: RowKey, column?: string): void; /** Sideways only, no row (column-layout.md, 16d); always set on a grid's api. */ ensureColumnVisible?(column: string): void;
  refresh(): void;
  announce(text: string): void;
}

export interface GridInstance<T, M extends RowModel<T> = ClientModel<T>> {
  /** On the browser's rows, or on a server's model when the grid was given a `source`. */
  readonly kernel: GridKernel<T, M>;
  readonly api: GridApi;
  update(patch: Partial<GridSettings<T>>): void;
  destroy(): void;
}

function element(doc: Document, className: string, role?: string): HTMLElement {
  const el = doc.createElement('div');
  el.className = className;
  if (role) el.setAttribute('role', role);
  return el;
}

/**
 * A grid in `host`. Tree (S4): `.dzg[dir]` holds the scroller with
 * `role="grid"` (header and body row groups), and beside it — never inside —
 * the overlay, the tooltip and the live region. This function only builds
 * and assembles; each behaviour is a module of the shared `GridContext`.
 */
/** `M`: the model the grid's kernel holds — the browser's rows, or `SourceHandle<T>` with a `source`. */
export function createGrid<T, M extends RowModel<T> = ClientModel<T>>(host: HTMLElement, initial: GridSettings<T>, env: GridEnv = {}): GridInstance<T, M> {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  checkMessages(initial.messages);
  const scope = new Scope();
  const styleRoot = host.getRootNode();
  if (initial.injectStyles !== false) injectStyles(styleRoot.nodeType === 11 ? (styleRoot as ShadowRoot) : doc, initial.nonce);

  // ---------- tree ----------
  const root = element(doc, 'dzg');
  const viewport = element(doc, 'dzg-viewport', 'grid');
  // Read-only until a column is editable (the paint says which, editing.md 3).
  viewport.setAttribute('aria-readonly', 'true');
  viewport.tabIndex = -1;
  const header = element(doc, 'dzg-header', 'rowgroup');
  const body = element(doc, 'dzg-body', 'rowgroup');
  const layer = element(doc, 'dzg-layer');
  body.append(layer);
  viewport.append(header, body);
  const overlay = element(doc, 'dzg-overlay');
  overlay.hidden = true;
  const tooltip = element(doc, 'dzg-tooltip', 'tooltip');
  tooltip.hidden = true;
  const live = new LiveRegion(doc, scope);
  root.append(viewport, overlay, tooltip, live.el);
  host.append(root);

  // ---------- model ----------
  const columns = createColumnModel<T>(initial.columns);
  const ctx = ctxOf(initial);
  // A server's model from its binding (the base knows only its type), the browser's rows otherwise.
  const page = initial.pagination && { page: initial.pagination };
  const kinds = filterKindLookup(initial.filterKinds);
  // A feature's shape (a tree) goes to either model: a server's rows can be a tree too (tree-lazy.md).
  const shared = { ...(initial.filterKinds && { filterKinds: kinds.get }), now: initial.clock ?? Date.now, ...shapeOf(initial.features), sameRow: initial.sameRow };
  const rows: RowModel<T> = initial.source
    ? initial.source.create({ getRowId: initial.getRowId, columns, ctx, ...page, ...shared, ...(initial.operations !== undefined && { operations: initial.operations }), ...(win?.AbortController && { abort: () => new win.AbortController() }), held: initial.features?.some((f) => f.held) })
    : clientRows<T>({ rows: initial.rows ?? [], getRowId: initial.getRowId, columns, ctx, ...page, ...shared });
  const kernel = createKernel<T, RowModel<T>>({ rows, columns, keepSelectionOnFilter: initial.selection?.keepOnFilter !== false, multiSort: initial.multiSort });
  if (initial.context !== undefined) kernel.dispatch({ type: 'context.app', value: initial.context }, 'host'); // editable rules, custom kinds (Q12)
  // Operations without a source run in the browser, and are told (a source's model tells its own); the filter kinds refused too.
  const told = [...kinds.problems, ...(initial.source ? [] : resolveOperations(initial.operations, false).problems), ...rowHeightProblems(initial.rowHeight)];

  let dir: Dir = 'ltr';
  const geometry = env.geometry ?? domGeometry(viewport, header, () => dir, live.el);
  const g: GridContext<T> = {
    doc, win, env, scope,
    el: { root, viewport, header, body, layer, overlay, tooltip },
    live, tip: new Tooltip(tooltip, scope, (t) => !!g.slots?.tooltip(t)),
    columns, rows, kernel, geometry,
    scheduler: new FrameScheduler(env.raf ?? win, env.sync === true),
    scroll: new ScrollController(geometry),
    headerRenderer: new HeaderRenderer(doc, header),
    rowRenderer: new RowRenderer<T>(doc, layer, (err) => report(err)),
    mac: isMac(win?.navigator),
    settings: closed(initial), ctx, headerRows: [], bands: [], spans: null, slots: null, features: [],
    get dir() { return dir; },
    set dir(d) { dir = d; },
    pendingFocus: null, queued: false, hasFocus: false, viewBlock: 0,
    intentAt: -1e9, keyboardAt: -1e9, scrolledAt: -1e9, speed: 0, remPx: geometry.read().remPx ?? 16,
    schedule, report, restoreFocus: () => {}, warm: null!, reveal: null!, ensureVisible: null!, retip: null!, parts: featureParts(initial.features, () => g.settings.parts),
    now: () => win?.performance.now() ?? 0,
    // `rowHeight` or the density's, at 16 px text, scaled with the default text size, whole px, ≥ 24 (WCAG 2.5.8).
    rowHeight: () => Math.max(24, Math.round(((rowPx(g.settings.rowHeight) ?? ROW_HEIGHT[g.settings.density ?? 'comfortable']) * g.remPx) / 16)),
    msg: (key, params = {}) => msg(g.settings.messages, key, params, g.ctx),
  };

  // ---------- direction ----------
  let watched: Dir = 'ltr';
  const applyDir = (): void => {
    const d = g.settings.direction ?? 'auto';
    const next = d === 'auto' ? watched : d;
    if (next === dir && root.getAttribute('dir') === dir) return;
    // The browser flips the inline scroll when the direction changes: keep it logically.
    const keep = geometry.read().scrollInline;
    dir = next;
    setAttr(root, 'dir', dir);
    if (keep) geometry.writeScrollInline(keep);
  };
  const direction = watchDirection(host, (d) => {
    watched = d;
    applyDir();
    schedule();
  }, scope);
  watched = direction.dir;
  applyDir();

  // ---------- behaviours ----------
  const focus = installFocus(g);
  const painter = createPainter(g, focus);
  // The grid takes the focus back (`hasFocus`: a focus the kernel is about to move, its column hidden, follows).
  g.restoreFocus = () => void ((g.hasFocus = true), g.kernel.focus ? focus.focusTo(g.kernel.focus) : viewport.focus({ preventScroll: true }));
  const job = { read: () => geometry.read(), write: (box: ReturnType<typeof geometry.read>) => { g.queued = false; painter.paint(box); for (let n = 0; g.again?.(); ) n++ < 3 ? painter.paint(box) : schedule(); } }; // `again`: a feature measured what the paint wrote (auto height), painted again in this frame, 3 times at most
  function schedule(): void {
    if (scope.isDisposed || g.queued) return;
    g.queued = true;
    g.scheduler.schedule(job);
  }
  function report(err: unknown): void {
    const w = win as (Window & { reportError?: (e: unknown) => void }) | null;
    if (w?.reportError) w.reportError(err);
    else setTimeout(() => { throw err; }, 0);
  }
  installScrolling(g, focus);
  installTooltips(g);
  const select = installSelect(g);
  installKeys(g, focus, select.toggleAll);
  installHeaderClick(g, select.toggleAll);
  const announceSelection = selectionAnnouncer(g);
  const announceSort = sortAnnouncer(g);
  scope.add(kernel.subscribe((e) => {
    if (e.type === 'modelUpdated' && (e.kind === 'rows' || e.kind === 'expand')) painter.rowsChanged(e.kind);
    announceSort(e);
    if (e.type === 'fetchFailed') live.announce(g.msg('announce.error'));
    if (e.type === 'selectionChanged') announceSelection(e);
    if (e.type === 'modelUpdated' || e.type === 'focusChanged' || e.type === 'selectionChanged' || e.type === 'columnResized' || e.type === 'columnsChanged' || e.type === 'orderStale') schedule();
    // The host's callback last, and fenced: a bug there must not stop the grid repainting or
    // the other listeners hearing the event. The error is reported, not swallowed.
    try {
      g.settings.onEvent?.(e);
    } catch (err) {
      report(err);
    }
  }));
  if (win && 'ResizeObserver' in win) {
    const ro = new win.ResizeObserver(() => {
      direction.recheck();
      schedule();
    });
    ro.observe(viewport);
    scope.observe(ro);
  }
  g.warm = installWarmup(g);
  // Optional features, set up once, read at each paint; span rules, slot parts or wrapped columns (auto-height.md 1) without theirs: told once.
  const handles = (initial.features ?? []).map((f) => f.setup(g as GridContext<unknown>));
  g.headerRows = handles.flatMap((h) => h.headerRows ?? []);
  g.bands = handles.flatMap((h) => h.bands ?? []);
  g.spans = handles.find((h) => h.spans)?.spans ?? null;
  g.slots = handles.find((h) => h.slots)?.slots ?? null;
  told.push(...(initial.features?.some((f) => f.id === 'auto-height') ? [] : columns.visible().filter((c) => c.def.wrap).slice(0, 1).map((c) => problem('missing-feature', 'warning', `columns.${c.id}.wrap`, 'auto-height'))), ...(g.spans ? [] : missingFeatureProblems(initial)), ...unslotted(initial as GridSettings<unknown>, rows.page));
  g.edit = (g.features = handles).find((h) => h.edit)?.edit; // the edit seam, found once
  scope.add(() => { for (const h of handles) h.destroy(); });

  columns.setAvailableInline(geometry.read().inline);
  schedule();
  g.warm.warm();
  // Column definitions refused or bent are told, like the rows' (D14: too-many-pinned).
  if (columns.problems.length) emit(kernel, { type: 'problems', source: 'host', problems: columns.problems });
  if (rows.problems.length) emit(kernel, { type: 'problems', source: 'host', problems: rows.problems });
  if (told.length) emit(kernel, { type: 'problems', source: 'host', problems: told });
  // A first request that failed before anyone listened (a source that throws at once): told now.
  const st = rows.status;
  if (st.phase === 'error') emit(kernel, { type: 'fetchFailed', source: 'data', error: st.failure, key: st.key ?? '', page: st.page ?? null });

  const api: GridApi = {
    focusCell: (row, column) => focus.focusCellAs(row, column, 'api'),
    ensureVisible: (row, column) => focus.ensureVisible(row, column), ensureColumnVisible: (column) => focus.ensureVisible(null, column),
    refresh: () => schedule(),
    announce: (text) => live.announce(text),
  };

  const instance: GridInstance<T, RowModel<T>> & { readonly scope: Scope; readonly paints: number; pooledData(): unknown[]; readonly context: GridContext<T>; readonly scroll: { readonly logicalTop: number; readonly mapper: unknown; scrollTo(l: number): void } } = {
    kernel,
    api,
    scope,
    get paints() { return painter.paints; },
    pooledData: () => g.rowRenderer.pooledData(),
    context: g,
    scroll: {
      get logicalTop() { return g.scroll.logicalTop; },
      get mapper() { return g.scroll.mapper; },
      scrollTo(l: number) {
        g.scroll.scrollTo(l);
        schedule();
      },
    },
    update(patch) {
      applyUpdate(g, patch, { applyDir, recheckDir: () => direction.recheck(), warm: () => g.warm.warm() });
    },
    destroy() {
      if (scope.isDisposed) return;
      scope.dispose();
      g.scheduler.cancel();
      kernel.destroy();
      rows.destroy();
      g.rowRenderer.clear();
      root.remove();
    },
  };
  return instance as never;
}
