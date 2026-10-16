import {
  clientRows, createColumnModel, createKernel, localeCtx, MAX_PHYSICAL, scrollMapper, uniformRowLayout, visibleWindow,
  type ClientModel, type ColumnModel, type GridKernel, type LocaleCtx, type RowKey, type ScrollMapper,
} from '@dzgrid/core';
import { LiveRegion } from './a11y/live-region.js';
import { watchDirection, type Dir } from './dir.js';
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
  if (settings.injectStyles !== false) injectStyles(doc, settings.nonce);

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
  watched = watchDirection(host, (d) => {
    watched = d;
    applyDir();
    schedule();
  }, scope);
  applyDir();

  // ---------- model ----------
  const ctxOf = (s: GridSettings<T>): LocaleCtx =>
    localeCtx({ locale: s.locale ?? s.messages.locale, ...(s.timeZone && { timeZone: s.timeZone }), ...(s.numerals && { numerals: s.numerals }) });
  let ctx = ctxOf(settings);
  const columns: ColumnModel<T> = createColumnModel<T>(settings.columns);
  const rows: ClientModel<T> = clientRows<T>({ rows: settings.rows ?? [], getRowId: settings.getRowId, columns, ctx });
  const kernel = createKernel<T>({ rows, columns });
  const geometry = env.geometry ?? domGeometry(viewport, header, () => dir);
  const scheduler = new FrameScheduler(win, env.sync === true);

  const headerRenderer = new HeaderRenderer(doc, header);
  const rowRenderer = new RowRenderer<T>(doc, layer);
  let epoch = 0;
  let epochKey = '';
  let mapper: ScrollMapper | null = null;
  let mapperKey = '';

  const rowHeight = () => ROW_HEIGHT[settings.density ?? 'comfortable'];

  function paint(box: ViewportBox): void {
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
    if (!mapper || mk !== mapperKey) {
      mapperKey = mk;
      mapper = scrollMapper(d.count * h, MAX_PHYSICAL, box.block);
    }
    const layout = uniformRowLayout(d, h);
    const centerView = Math.max(0, box.inline - L.start.width - L.end.width);
    const w = visibleWindow(layout, L.center.widths, mapper, box.scrollTop, box.scrollInline, { block: box.block, inline: centerView }, {
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

    const index = new Map(visible.map((c, i) => [c.id, i + 1]));
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

    // ---- overlay: the host's state first, then what the counts say ----
    const state = settings.overlay ?? (rows.counts.total === 0 ? 'noRows' : d.count === 0 ? 'noMatches' : null);
    overlay.hidden = state === null;
    if (state !== null) {
      const text = msg(settings.messages, state === 'loading' ? 'grid.loading' : state === 'error' ? 'grid.error' : state === 'noRows' ? 'grid.noRows' : 'grid.noMatches', {}, ctx);
      if (overlay.textContent !== text) overlay.textContent = text;
      setPx(overlay, 'inset-block-start', h);
    }
  }

  function schedule(): void {
    if (scope.isDisposed) return;
    scheduler.schedule({ read: () => geometry.read(), write: (box) => paint(box) });
  }

  scope.on(viewport, 'scroll', () => schedule(), { passive: true });
  scope.add(kernel.subscribe((e) => {
    settings.onEvent?.(e);
    if (e.type === 'modelUpdated' || e.type === 'focusChanged' || e.type === 'selectionChanged' || e.type === 'columnResized') schedule();
  }));
  if (win && 'ResizeObserver' in win) {
    const ro = new win.ResizeObserver(() => schedule());
    ro.observe(viewport);
    scope.observe(ro);
  }
  const initialBox = geometry.read();
  columns.setAvailableInline(initialBox.inline);
  schedule();

  const api: GridApi = {
    focusCell(row, column) {
      kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row, column } }, 'api');
      api.ensureVisible(row, column);
      rowRenderer.cell(row, column)?.focus({ preventScroll: true });
    },
    ensureVisible(row) {
      const i = rows.displayed.indexOf(row);
      if (i === -1 || !mapper) return;
      const box = geometry.read();
      const h = rowHeight();
      const top = mapper.toLogical(box.scrollTop);
      const off = i * h;
      let next = top;
      if (off < top) next = off;
      else if (off + h > top + box.block) next = off + h - box.block;
      if (next !== top) {
        geometry.writeScrollTop(mapper.toPhysical(next));
        schedule();
      }
    },
    refresh: () => schedule(),
    announce: (text) => live.announce(text),
  };

  const instance: GridInstance<T> & { readonly scope: Scope } = {
    kernel,
    api,
    scope,
    update(patch) {
      const prev = settings;
      settings = { ...settings, ...patch };
      if (patch.columns && patch.columns !== prev.columns) {
        columns.setDefs(patch.columns);
        rows.setColumns(columns, 'host');
      }
      if (patch.locale !== undefined || patch.timeZone !== undefined || patch.numerals !== undefined || (patch.messages && patch.messages.locale !== prev.messages.locale && !settings.locale)) {
        ctx = ctxOf(settings);
        rows.setContext(ctx, 'host');
      }
      if (patch.rows) rows.setRows(patch.rows, 'host');
      if (patch.direction !== undefined) applyDir();
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
