import {
  clientRows, createColumnModel, createKernel, localeCtx, MAX_PHYSICAL, scrollMapper, uniformRowLayout, windowAt,
  type ClientModel, type ColumnModel, type DisplayedRows, type GridKernel, type LocaleCtx, type RowKey,
} from '@dzgrid/core';
import { LiveRegion } from './a11y/live-region.js';
import { isOnScrollbar, watchDirection, wheelInline, type Dir } from './dir.js';
import { ScrollController } from './interact/scroll.js';
import { msg } from './messages.js';
import { HeaderRenderer } from './render/header.js';
import { domGeometry, type Geometry, type ViewportBox } from './render/measure.js';
import { RowRenderer, setAttr, setPx, type Frame } from './render/rows.js';
import { FrameScheduler } from './render/scheduler.js';
import { Scope } from './render/scope.js';
import { ROW_HEIGHT, type GridSettings } from './settings.js';
import { injectStyles } from './styles.js';

export interface GridApi {
  focusCell(row: RowKey, column: string): void;
  ensureVisible(row: RowKey, column?: string): void;
  refresh(): void;
  announce(text: string): void;
}

export interface GridInstance<T> {
  readonly kernel: GridKernel<T>;
  readonly api: GridApi;
  update(patch: Partial<GridSettings<T>>): void;
  destroy(): void;
}

export interface GridEnv {
  /** A fake for tests without layout (jsdom); the viewport's own otherwise. */
  readonly geometry?: Geometry;
  /** Render at once instead of on the next frame (tests). */
  readonly sync?: boolean;
  /** The physical cap above which scrolling is mapped (tests lower it). */
  readonly maxPhysical?: number;
  /** Where a pointer is, for the scrollbar drag (tests without layout). */
  readonly isOnScrollbar?: (e: PointerEvent) => boolean;
  /** Frames, when not the window's (tests). */
  readonly raf?: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>;
}

const OVERSCAN_ROWS = 4;
const OVERSCAN_COLS = 2;

/**
 * A grid in `host`. Tree (S4): `.dzg[dir]` holds the scroller with
 * `role="grid"` (header and body row groups), and beside it — never inside —
 * the overlay, the tooltip and the live region.
 */
export function createGrid<T>(host: HTMLElement, initial: GridSettings<T>, env: GridEnv = {}): GridInstance<T> {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const scope = new Scope();
  let settings = initial;
  const styleRoot = host.getRootNode();
  if (settings.injectStyles !== false) injectStyles(styleRoot.nodeType === 11 ? (styleRoot as ShadowRoot) : doc, settings.nonce);

  // ---------- tree ----------
  const root = doc.createElement('div');
  root.className = 'dzg';
  const viewport = doc.createElement('div');
  viewport.className = 'dzg-viewport';
  viewport.setAttribute('role', 'grid');
  viewport.tabIndex = -1;
  const header = doc.createElement('div');
  header.className = 'dzg-header';
  header.setAttribute('role', 'rowgroup');
  const body = doc.createElement('div');
  body.className = 'dzg-body';
  body.setAttribute('role', 'rowgroup');
  const layer = doc.createElement('div');
  layer.className = 'dzg-layer';
  body.append(layer);
  viewport.append(header, body);
  const overlay = doc.createElement('div');
  overlay.className = 'dzg-overlay';
  overlay.hidden = true;
  const tooltip = doc.createElement('div');
  tooltip.className = 'dzg-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  const live = new LiveRegion(doc, scope);
  root.append(viewport, overlay, tooltip, live.el);
  host.append(root);

  // ---------- direction ----------
  let dir: Dir = 'ltr';
  const applyDir = () => {
    const d = settings.direction ?? 'auto';
    dir = d === 'auto' ? watched : d;
    setAttr(root, 'dir', dir);
  };
  let watched: Dir = 'ltr';
  const direction = watchDirection(host, (d) => {
    watched = d;
    applyDir();
    schedule();
  }, scope);
  watched = direction.dir;
  applyDir();

  // ---------- model ----------
  const ctxOf = (s: GridSettings<T>): LocaleCtx =>
    localeCtx({ locale: s.locale ?? s.messages.locale, ...(s.timeZone && { timeZone: s.timeZone }), ...(s.numerals && { numerals: s.numerals }) });
  let ctx = ctxOf(settings);
  const columns: ColumnModel<T> = createColumnModel<T>(settings.columns);
  const rows: ClientModel<T> = clientRows<T>({ rows: settings.rows ?? [], getRowId: settings.getRowId, columns, ctx });
  const kernel = createKernel<T>({ rows, columns });
  const geometry = env.geometry ?? domGeometry(viewport, header, () => dir);
  const scheduler = new FrameScheduler(env.raf ?? win, env.sync === true);

  const headerRenderer = new HeaderRenderer(doc, header);
  const rowRenderer = new RowRenderer<T>(doc, layer);
  let epoch = 0;
  let epochKey = '';
  let mapperKey = '';
  const scroll = new ScrollController(geometry);
  // What the view showed at the last paint, to keep it in place when rows arrive (anchor, S3).
  let shown: { displayed: DisplayedRows<T>; key: RowKey | null; delta: number; atTop: boolean; atEnd: boolean } | null = null;
  let anchorNext = false;

  const rowHeight = () => ROW_HEIGHT[settings.density ?? 'comfortable'];

  let available = -1;
  let colIndexOf: { version: number; index: Map<string, number> } = { version: -1, index: new Map() };
  /** A cell to focus once it is mounted (focusCell on a row or column not yet rendered). */
  let pendingFocus: { row: RowKey; column: string } | null = null;

  let paints = 0;
  function paint(box: ViewportBox): void {
    paints++;
    // Flexible columns share what the view has: follow it.
    if (box.inline !== available && box.inline > 0) {
      available = box.inline;
      columns.setAvailableInline(box.inline);
    }
    const d = rows.displayed;
    const h = rowHeight();
    const L = columns.layout;
    const visible = columns.visible();

    // Everything a cell's text depends on, but the row: when it changes, cells are rechecked.
    const ek = `${columns.version}|${ctx.locale}|${ctx.numerals}|${ctx.timeZone}|${h}`;
    if (ek !== epochKey) {
      epochKey = ek;
      epoch++;
    }
    const mk = `${d.count}|${h}|${box.block}`;
    if (!scroll.mapper || mk !== mapperKey) {
      mapperKey = mk;
      scroll.setMapper(scrollMapper(d.count * h, env.maxPhysical ?? MAX_PHYSICAL, box.block));
    }
    const mapper = scroll.mapper!;
    // Rows added or removed by a transaction: the row at the top of the view stays where it was,
    // the top stays the top and the end stays the end.
    if (anchorNext && shown && shown.displayed !== d) {
      if (shown.atTop) scroll.scrollTo(0);
      else if (shown.atEnd) scroll.scrollTo(mapper.maxLogical);
      else if (shown.key !== null) {
        const at = d.indexOf(shown.key);
        if (at !== -1) scroll.scrollTo(at * h + shown.delta);
      }
    }
    anchorNext = false;
    const layout = uniformRowLayout(d, h);
    const centerView = Math.max(0, box.inline - L.start.width - L.end.width);
    const w = windowAt(layout, L.center.widths, scroll.logicalTop, scroll.physicalTop, box.scrollInline, { block: box.block, inline: centerView }, {
      overscanRows: settings.overscan?.rows ?? OVERSCAN_ROWS,
      overscanCols: settings.overscan?.cols ?? OVERSCAN_COLS,
    });

    // ---- grid attributes ----
    setAttr(viewport, 'aria-rowcount', String(d.count + 1));
    setAttr(viewport, 'aria-colcount', String(visible.length));
    setAttr(viewport, 'aria-label', settings.label ?? msg(settings.messages, 'grid.label', {}, ctx));
    setAttr(viewport, 'aria-busy', settings.overlay === 'loading' ? 'true' : null);
    setPx(body, 'block-size', mapper.physicalHeight);
    setPx(body, 'inline-size', L.totalWidth);
    setPx(layer, 'inset-block-start', w.placement.layerTop);

    if (colIndexOf.version !== columns.version) colIndexOf = { version: columns.version, index: new Map(visible.map((c, i) => [c.id, i + 1])) };
    const index = colIndexOf.index;
    const colIndex = (id: string) => index.get(id) ?? 0;
    headerRenderer.render(L, w.cols, h, colIndex, () => {});

    const wanted: number[] = [];
    if (w.rows) for (let i = w.rows.first; i <= w.rows.last; i++) wanted.push(i);
    const frame: Frame<T> = {
      displayed: d, layout: L, cols: w.cols, rowHeight: h, base: w.placement.base, ctx, epoch,
      rowHeader: visible[0]?.id ?? null, colIndex, rowAttrs: () => {},
    };
    const focus = kernel.focus;
    rowRenderer.render(frame, wanted, focus?.kind === 'cell' ? focus.row : null);
    const topIndex = d.count ? Math.min(d.count - 1, Math.floor(scroll.logicalTop / h)) : -1;
    shown = {
      displayed: d,
      key: topIndex >= 0 ? d.keyAt(d.index(topIndex)!) : null,
      delta: topIndex >= 0 ? scroll.logicalTop - topIndex * h : 0,
      atTop: scroll.atTop,
      atEnd: scroll.atEnd,
    };
    if (pendingFocus) {
      const cell = rowRenderer.cell(pendingFocus.row, pendingFocus.column);
      if (cell) {
        pendingFocus = null;
        cell.focus({ preventScroll: true });
      }
    }

    // ---- overlay: the host's state first, then what the counts say ----
    const state = settings.overlay ?? (rows.counts.total === 0 ? 'noRows' : d.count === 0 ? 'noMatches' : null);
    overlay.hidden = state === null;
    if (state !== null) {
      const text = msg(settings.messages, state === 'loading' ? 'grid.loading' : state === 'error' ? 'grid.error' : state === 'noRows' ? 'grid.noRows' : 'grid.noMatches', {}, ctx);
      if (overlay.textContent !== text) overlay.textContent = text;
      setPx(overlay, 'inset-block-start', h);
    } else if (overlay.textContent) overlay.textContent = '';
  }

  // One paint per frame, whatever asked for it.
  let queued = false;
  const job = {
    read: () => geometry.read(),
    write: (box: ViewportBox) => {
      queued = false;
      paint(box);
    },
  };
  function schedule(): void {
    if (scope.isDisposed || queued) return;
    queued = true;
    scheduler.schedule(job);
  }

  scope.on(viewport, 'scroll', () => {
    scroll.onScroll();
    schedule();
  }, { passive: true });
  // Above the cap the wheel is the grid's: the browser would move ratio times too far.
  scope.on(viewport, 'wheel', (e: WheelEvent) => {
    const box = geometry.read();
    const h = rowHeight();
    const page = Math.max(h, box.block - h);
    const block = e.deltaY * (e.deltaMode === 1 ? h : e.deltaMode === 2 ? page : 1);
    if (!scroll.onWheel(block)) return;
    e.preventDefault();
    const inline = wheelInline(e, dir, h, page);
    if (inline) geometry.writeScrollInline(box.scrollInline + inline);
    schedule();
  }, { passive: false });
  scope.on(viewport, 'pointerdown', (e: PointerEvent) => scroll.pointerDown(env.isOnScrollbar ? env.isOnScrollbar(e) : isOnScrollbar(e, viewport)));
  scope.on(doc, 'pointerup', () => scroll.pointerUp());
  scope.on(doc, 'pointercancel', () => scroll.pointerUp());
  scope.add(kernel.subscribe((e) => {
    if (e.type === 'modelUpdated' && e.kind === 'rows') anchorNext = true;
    settings.onEvent?.(e);
    if (e.type === 'modelUpdated' || e.type === 'focusChanged' || e.type === 'selectionChanged' || e.type === 'columnResized' || e.type === 'columnsChanged') schedule();
  }));
  if (win && 'ResizeObserver' in win) {
    const ro = new win.ResizeObserver(() => {
      direction.recheck();
      schedule();
    });
    ro.observe(viewport);
    scope.observe(ro);
  }
  const initialBox = geometry.read();
  columns.setAvailableInline(initialBox.inline);
  schedule();

  const api: GridApi = {
    focusCell(row, column) {
      if (!kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row, column } }, 'api').ok) return;
      api.ensureVisible(row, column);
      // Mounted now, or at the next paint: the grid scrolls, then focuses without scrolling (S10).
      const cell = rowRenderer.cell(row, column);
      if (cell && !queued) cell.focus({ preventScroll: true });
      else {
        pendingFocus = { row, column };
        schedule();
      }
    },
    ensureVisible(row, column) {
      const i = rows.displayed.indexOf(row);
      if (i === -1) return;
      const box = geometry.read();
      // Inline: a centre column comes clear of the pinned segments.
      const L = columns.layout;
      const c = column === undefined ? -1 : L.center.columns.findIndex((x) => x.id === column);
      if (c !== -1) {
        const view = Math.max(0, box.inline - L.start.width - L.end.width);
        const start = L.center.widths.offsetOf(c);
        const end = start + L.center.widths.sizeAt(c);
        let x = box.scrollInline;
        if (start < x) x = start;
        else if (end > x + view) x = end - view;
        if (x !== box.scrollInline) geometry.writeScrollInline(x);
      }
      const h = rowHeight();
      const top = scroll.logicalTop;
      const off = i * h;
      let next = top;
      if (off < top) next = off;
      else if (off + h > top + box.block) next = off + h - box.block;
      if (next !== top) {
        scroll.scrollTo(next);
        schedule();
      }
    },
    refresh: () => schedule(),
    announce: (text) => live.announce(text),
  };

  const instance: GridInstance<T> & { readonly scope: Scope; readonly paints: number; readonly scroll: { readonly logicalTop: number; readonly mapper: unknown; scrollTo(l: number): void } } = {
    kernel,
    api,
    scope,
    get paints() { return paints; },
    scroll: {
      get logicalTop() { return scroll.logicalTop; },
      get mapper() { return scroll.mapper; },
      scrollTo(l: number) {
        scroll.scrollTo(l);
        schedule();
      },
    },
    update(patch) {
      const prev = settings;
      settings = { ...settings, ...patch };
      if (patch.columns && patch.columns !== prev.columns) {
        columns.setDefs(patch.columns);
        rows.setColumns(columns, 'host');
      }
      // `in`, not `!== undefined`: clearing a setting goes back to its default.
      if ('locale' in patch || 'timeZone' in patch || 'numerals' in patch || (patch.messages && patch.messages.locale !== prev.messages.locale && !settings.locale)) {
        ctx = ctxOf(settings);
        rows.setContext(ctx, 'host');
      }
      if (patch.rows) rows.setRows(patch.rows, 'host');
      direction.recheck();
      if ('direction' in patch) applyDir();
      schedule();
    },
    destroy() {
      if (scope.isDisposed) return;
      scope.dispose();
      scheduler.cancel();
      kernel.destroy();
      rows.destroy();
      rowRenderer.clear();
      root.remove();
    },
  };
  return instance;
}
