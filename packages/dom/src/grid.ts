import { clientRows, createColumnModel, createKernel, type ClientModel, type GridKernel, type RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { announceSort } from './a11y/announce.js';
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
import { createPainter } from './render/viewport.js';
import { ROW_HEIGHT, type GridSettings } from './settings.js';
import { injectStyles } from './styles.js';
import { installWarmup } from './warmup.js';
import { applyUpdate, ctxOf } from './update.js';

export type { GridEnv } from './context.js';

export interface GridApi {
  focusCell(row: RowKey, column: string): void;
  ensureVisible(row: RowKey, column?: string): void;
  refresh(): void;
  announce(text: string): void;
}

export interface GridInstance<T> {
  /** Typed on the client model until a source arrives (Phase 3, step 5). */
  readonly kernel: GridKernel<T, ClientModel<T>>;
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
export function createGrid<T>(host: HTMLElement, initial: GridSettings<T>, env: GridEnv = {}): GridInstance<T> {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  checkMessages(initial.messages);
  const scope = new Scope();
  const styleRoot = host.getRootNode();
  if (initial.injectStyles !== false) injectStyles(styleRoot.nodeType === 11 ? (styleRoot as ShadowRoot) : doc, initial.nonce);

  // ---------- tree ----------
  const root = element(doc, 'dzg');
  const viewport = element(doc, 'dzg-viewport', 'grid');
  // Phase 2 shows rows; nothing is editable yet, and screen readers should not offer to.
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
  const rows = clientRows<T>({ rows: initial.rows ?? [], getRowId: initial.getRowId, columns, ctx });
  const kernel = createKernel<T, ClientModel<T>>({ rows, columns });

  let dir: Dir = 'ltr';
  const geometry = env.geometry ?? domGeometry(viewport, header, () => dir);
  const g: GridContext<T> = {
    doc, win, env, scope,
    el: { root, viewport, header, body, layer, overlay, tooltip },
    live, tip: new Tooltip(tooltip, scope),
    columns, rows, kernel, geometry,
    scheduler: new FrameScheduler(env.raf ?? win, env.sync === true),
    scroll: new ScrollController(geometry),
    headerRenderer: new HeaderRenderer(doc, header),
    rowRenderer: new RowRenderer<T>(doc, layer),
    mac: isMac(win?.navigator),
    settings: initial, ctx, headerRows: [],
    get dir() { return dir; },
    set dir(d) { dir = d; },
    pendingFocus: null, queued: false, hasFocus: false,
    intentAt: -1e9, keyboardAt: -1e9, scrolledAt: -1e9, speed: 0, remPx: geometry.read().remPx ?? 16,
    schedule, report, restoreFocus: () => {},
    now: () => win?.performance.now() ?? 0,
    // A density's height at 16 px text, scaled with the reader's text size, whole pixels.
    rowHeight: () => Math.round((ROW_HEIGHT[g.settings.density ?? 'comfortable'] * g.remPx) / 16),
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
  g.restoreFocus = () => {
    if (g.kernel.focus) focus.focusTo(g.kernel.focus);
    else viewport.focus({ preventScroll: true });
  };
  const job = { read: () => geometry.read(), write: (box: ReturnType<typeof geometry.read>) => { g.queued = false; painter.paint(box); } };
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
  scope.add(kernel.subscribe((e) => {
    if (e.type === 'modelUpdated' && e.kind === 'rows') painter.rowsChanged();
    if (e.type === 'sortChanged' && e.source === 'user') announceSort(g, e.sort);
    if (e.type === 'modelUpdated' || e.type === 'focusChanged' || e.type === 'selectionChanged' || e.type === 'columnResized' || e.type === 'columnsChanged') schedule();
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
  const warmup = installWarmup(g);
  // Optional features, set up once; what they add is read at each paint.
  const handles = (initial.features ?? []).map((f) => f.setup(g as GridContext<unknown>));
  g.headerRows = handles.flatMap((h) => h.headerRows ?? []);
  scope.add(() => { for (const h of handles) h.destroy(); });

  columns.setAvailableInline(geometry.read().inline);
  schedule();
  warmup.warm();
  // Column definitions refused or bent are told, like the rows' (D14: too-many-pinned).
  if (columns.problems.length) emit(kernel, { type: 'problems', source: 'host', problems: columns.problems });
  if (rows.problems.length) emit(kernel, { type: 'problems', source: 'host', problems: rows.problems });

  const api: GridApi = {
    focusCell: (row, column) => focus.focusCellAs(row, column, 'api'),
    ensureVisible: (row, column) => focus.ensureVisible(row, column),
    refresh: () => schedule(),
    announce: (text) => live.announce(text),
  };

  const instance: GridInstance<T> & { readonly scope: Scope; readonly paints: number; pooledData(): unknown[]; readonly context: GridContext<T>; readonly scroll: { readonly logicalTop: number; readonly mapper: unknown; scrollTo(l: number): void } } = {
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
      applyUpdate(g, patch, { applyDir, recheckDir: () => direction.recheck(), warm: () => warmup.warm() });
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
  return instance;
}
