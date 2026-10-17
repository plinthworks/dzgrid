import {
  clientRows, createColumnModel, createKernel, formattersFor, headerSelection, intentFor, isBlank, isSelected, localeCtx, MAX_PHYSICAL, overscanRows, scrollMapper, uniformRowLayout, windowAt,
  type ClientModel, type ColumnModel, type DisplayedRows, type FocusPos, type GridKernel, type Intent, type KeyOwner, type LocaleCtx, type RowKey,
} from '@dzgrid/core';
import { isMac, ownerOf } from './keys/owner.js';
import { LiveRegion } from './a11y/live-region.js';
import { isOnScrollbar, watchDirection, wheelInline, type Dir } from './dir.js';
import { ScrollController } from './interact/scroll.js';
import { attachResize } from './interact/resize.js';
import { checkMessages, msg } from './messages.js';
import { emit } from '@dzgrid/core/internal';
import { HeaderRenderer } from './render/header.js';
import { domGeometry, type Geometry, type ViewportBox } from './render/measure.js';
import { CHECK_WIDTH, RowRenderer, setAttr, setPx, type Frame } from './render/rows.js';
import { FrameScheduler } from './render/scheduler.js';
import { Scope } from './render/scope.js';
import { ROW_HEIGHT, type GridSettings } from './settings.js';
import { injectStyles } from './styles.js';
import { Tooltip } from './render/tooltip.js';
import { idleLoop } from './idle.js';

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

const OVERSCAN_ROWS = 2;
const OVERSCAN_COLS = 1;

/**
 * A grid in `host`. Tree (S4): `.dzg[dir]` holds the scroller with
 * `role="grid"` (header and body row groups), and beside it — never inside —
 * the overlay, the tooltip and the live region.
 */
export function createGrid<T>(host: HTMLElement, initial: GridSettings<T>, env: GridEnv = {}): GridInstance<T> {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  checkMessages(initial.messages);
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
  // Phase 2 shows rows; nothing is editable yet, and screen readers should not offer to.
  viewport.setAttribute('aria-readonly', 'true');
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
  const tip = new Tooltip(tooltip, scope);
  root.append(viewport, overlay, tooltip, live.el);
  host.append(root);

  // ---------- direction ----------
  let dir: Dir = 'ltr';
  const applyDir = () => {
    const d = settings.direction ?? 'auto';
    const next = d === 'auto' ? watched : d;
    if (next === dir && root.getAttribute('dir') === dir) return;
    // The browser flips the inline scroll when the direction changes: keep it logically.
    const keep = geometryRef ? geometryRef.read().scrollInline : 0;
    dir = next;
    setAttr(root, 'dir', dir);
    if (geometryRef && keep) geometryRef.writeScrollInline(keep);
  };
  let geometryRef: Geometry | null = null;
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
  const kernel = createKernel<T, ClientModel<T>>({ rows, columns });
  const geometry = env.geometry ?? domGeometry(viewport, header, () => dir);
  geometryRef = geometry;
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

  const now = () => win?.performance.now() ?? 0;
  const rowHeight = () => ROW_HEIGHT[settings.density ?? 'comfortable'];
  let scrolledAt = -1e9;

  let available = -1;
  let colIndexOf: { version: number; index: Map<string, number> } = { version: -1, index: new Map() };
  /** A cell to focus once it is mounted (focusCell on a row or column not yet rendered). */
  let pendingFocus: { row: RowKey; column: string } | { header: string } | null = null;

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
    const check = settings.selection?.checkbox === true && (settings.selection.mode ?? 'none') !== 'none';
    const extra = check ? CHECK_WIDTH : 0;
    // Direction too: whether a value is isolated depends on it.
    const ek = `${columns.version}|${ctx.locale}|${ctx.numerals}|${ctx.timeZone}|${h}|${check}|${dir}`;
    if (ek !== epochKey) {
      epochKey = ek;
      epoch++;
    }
    const mk = `${d.count}|${h}|${box.block}`;
    if (!scroll.mapper || mk !== mapperKey) {
      mapperKey = mk;
      const next = scrollMapper(d.count * h, env.maxPhysical ?? MAX_PHYSICAL, box.block);
      // The body grows first: a scroll written before would be clamped to the old height.
      setPx(body, 'block-size', next.physicalHeight);
      scroll.setMapper(next);
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
    const centerView = Math.max(0, box.inline - L.start.width - extra - L.end.width);
    const w = windowAt(layout, L.center.widths, scroll.logicalTop, scroll.physicalTop, box.scrollInline, { block: box.block, inline: centerView }, {
      // At rest a couple of rows (the body's node budget); more while scrolling fast.
      overscanRows: settings.overscan?.rows ?? overscanRows(now() - scrolledAt < 150 ? speed : 0, h, { min: OVERSCAN_ROWS, max: 40 }),
      overscanCols: settings.overscan?.cols ?? OVERSCAN_COLS,
    });

    // ---- grid attributes ----
    setAttr(root, 'data-density', settings.density ?? 'comfortable');
    if (root.style.getPropertyValue('--dzg-row-height') !== `${h}px`) root.style.setProperty('--dzg-row-height', `${h}px`);
    setAttr(viewport, 'aria-rowcount', String(d.count + 1));
    setAttr(viewport, 'aria-colcount', String(visible.length + (check ? 1 : 0)));
    const mode = settings.selection?.mode ?? 'none';
    setAttr(viewport, 'aria-multiselectable', mode === 'multi' ? 'true' : null);
    setAttr(viewport, 'aria-label', settings.label ?? msg(settings.messages, 'grid.label', {}, ctx));
    setAttr(viewport, 'aria-busy', settings.overlay === 'loading' ? 'true' : null);
    setPx(body, 'block-size', mapper.physicalHeight);
    setPx(body, 'inline-size', L.totalWidth + extra);
    setPx(layer, 'inset-block-start', w.placement.layerTop);

    const ciKey = columns.version * 2 + (check ? 1 : 0);
    if (colIndexOf.version !== ciKey) colIndexOf = { version: ciKey, index: new Map(visible.map((c, i) => [c.id, i + 1 + (check ? 1 : 0)])) };
    const index = colIndexOf.index;
    const colIndex = (id: string) => index.get(id) ?? 0;
    const focus0 = kernel.focus;
    const focusCenter = focus0 ? L.center.columns.findIndex((c) => c.id === focus0.column) : -1;
    const sort = kernel.query.sort;
    headerRenderer.render(L, w.cols, h, colIndex, (col, el) => decorateHeader(col, el, sort), focus0?.kind === 'header' ? focusCenter : -1, check, mode === 'multi');
    if (headerRenderer.checkName) {
      const text = msg(settings.messages, 'selection.column', {}, ctx);
      if (headerRenderer.checkName.textContent !== text) headerRenderer.checkName.textContent = text;
    }
    if (headerRenderer.checkBox) {
      const state = headerSelection(kernel.selection, d);
      setAttr(headerRenderer.checkBox, 'aria-checked', state === 'all' ? 'true' : state === 'some' ? 'mixed' : 'false');
      setAttr(headerRenderer.checkBox, 'aria-label', msg(settings.messages, 'selection.all', {}, ctx));
    }

    const wanted: number[] = [];
    if (w.rows) for (let i = w.rows.first; i <= w.rows.last; i++) wanted.push(i);
    const frame: Frame<T> = {
      displayed: d, layout: L, cols: w.cols, rowHeight: h, base: w.placement.base, ctx, epoch,
      rowHeader: visible[0]?.id ?? null, colIndex,
      rowAttrs: (key, el) => setAttr(el, 'aria-selected', mode === 'none' ? null : isSelected(kernel.selection, key) ? 'true' : 'false'),
      check, dir,
      focusRow: focus0?.kind === 'cell' ? focus0.row : null, focusCenter,
    };
    const focus = kernel.focus;
    rowRenderer.render(frame, wanted, focus?.kind === 'cell' ? focus.row : null);
    rovingStop(d, visible);
    const topIndex = d.count ? Math.min(d.count - 1, Math.floor(scroll.logicalTop / h)) : -1;
    shown = {
      displayed: d,
      key: topIndex >= 0 ? d.keyAt(d.index(topIndex)!) : null,
      delta: topIndex >= 0 ? scroll.logicalTop - topIndex * h : 0,
      atTop: scroll.atTop,
      atEnd: scroll.atEnd,
    };
    if (pendingFocus) {
      const el = 'header' in pendingFocus ? headerRenderer.cell(pendingFocus.header) : rowRenderer.cell(pendingFocus.row, pendingFocus.column);
      if (el) {
        pendingFocus = null;
        el.focus({ preventScroll: true });
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

  /**
   * One tab stop (roving tabindex): the focused cell or header, or the first
   * cell (the first header when there are no rows) before anything is focused.
   */
  let stop: HTMLElement | null = null;
  function rovingStop(d: DisplayedRows<T>, visible: readonly { id: string }[]): void {
    const f = kernel.focus;
    let target: HTMLElement | null = null;
    if (f?.kind === 'cell') target = rowRenderer.cell(f.row, f.column);
    else if (f?.kind === 'header') target = headerRenderer.cell(f.column);
    else if (visible[0]) target = d.count ? rowRenderer.cell(d.keyAt(d.index(0)!), visible[0].id) : headerRenderer.cell(visible[0].id);
    // The first cell scrolled out with nothing focused: the first cell in view takes the stop,
    // so Tab still enters the grid (and the keys start from the first cell, `current()`).
    target ??= layer.querySelector<HTMLElement>('.dzg-cell') ?? header.querySelector<HTMLElement>('.dzg-hcell[data-col]');
    if (target === stop) return;
    if (stop) stop.tabIndex = -1;
    stop = target;
    if (stop) stop.tabIndex = 0;
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
  function report(err: unknown): void {
    const w = win as (Window & { reportError?: (e: unknown) => void }) | null;
    if (w?.reportError) w.reportError(err);
    else setTimeout(() => { throw err; }, 0);
  }

  function announceSort(sort: readonly { column: string; dir: 'asc' | 'desc' }[]): void {
    const m = settings.messages;
    if (!sort.length) return live.announce(msg(m, 'announce.sortCleared', {}, ctx));
    const first = sort[0]!;
    const col = columns.get(first.column);
    live.announce(msg(m, 'announce.sorted', {
      column: col?.def.header ?? first.column,
      direction: msg(m, first.dir === 'asc' ? 'sort.ascending' : 'sort.descending', {}, ctx),
      rows: msg(m, 'announce.rows', { n: rows.displayed.count }, ctx),
    }, ctx));
  }

  function schedule(): void {
    if (scope.isDisposed || queued) return;
    queued = true;
    scheduler.schedule(job);
  }

  // A native scroll right after a focus move or a grid key is the browser bringing the focused
  // element into view, physically: above the cap that is the wrong place, so the grid redoes it (S11, D4).
  
  let intentAt = -1e9;
  scope.on(viewport, 'scroll', () => {
    tip.hide();
    const moved = scroll.onScroll();
    const f = kernel.focus;
    if (moved && f?.kind === 'cell' && scroll.mapper?.scaled && now() - intentAt < 100 && viewport.contains(doc.activeElement)) api.ensureVisible(f.row, f.column);
    schedule();
  }, { passive: true });

  // ---------- keyboard and focus ----------
  const mac = isMac(win?.navigator);
  // Whether the grid holds the user's focus: a focused row removed by a filter takes the DOM
  // focus with it (no focusout says where it went), and the kernel's new focus must receive it.
  let hasFocus = false;
  scope.on(viewport, 'focusout', (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to) {
      if (!viewport.contains(to)) hasFocus = false;
      return;
    }
    // No related target: the focused element was removed (keep the focus to hand it on),
    // or the user went elsewhere — a click on the page, another window (let it go).
    const from = e.target as Node;
    if (from.isConnected && viewport.contains(from)) hasFocus = false;
  });
  // A focus that follows a key shows its tooltip at once; one that follows a click does not.
  let keyboardAt = -1e9;
  scope.on(viewport, 'pointerdown', () => { keyboardAt = -1e9; });
  scope.on(viewport, 'focusin', (e: FocusEvent) => {
    const t = e.target as HTMLElement;
    const text = tooltipFor(t);
    if (text && now() - keyboardAt < 1000) tip.showFor(t, text, dir, 0);
    else if (tip.anchor && tip.anchor !== t) tip.hide();
    hasFocus = true;
    // The user's own choice wins over a focus still waiting for its cell.
    pendingFocus = null;
    intentAt = now();
    const pos = positionOf(e.target as HTMLElement);
    if (!pos) return;
    kernel.dispatch({ type: 'focus.set', focus: pos }, 'user');
    if ((e.target as HTMLElement).closest('.dzg-row .dzg-check') && pos.kind === 'cell') {
      const cellEl = rowRenderer.cell(pos.row, pos.column);
      cellEl?.focus({ preventScroll: true });
    }
  });
  scope.on(viewport, 'keydown', (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) return;
    keyboardAt = now();
    if (e.key === 'Escape' && !tooltip.hidden) {
      tip.hide();
      return;
    }
    // The select-all box: a checkbox (Space, Enter), before the first header in reading order.
    const t = e.target as HTMLElement;
    if (headerRenderer.checkBox && t === headerRenderer.checkBox) {
      const step = intentFor(e, { dir, owner: 'header', mac });
      const first = columns.visible()[0];
      if (e.key === ' ' || e.key === 'Enter') toggleAll();
      else if (first && step?.kind === 'move' && step.delta > 0) {
        const d = rows.displayed;
        focusTo(step.axis === 'row' && d.count ? { kind: 'cell', row: d.keyAt(d.index(0)!), column: first.id } : { kind: 'header', column: first.id });
      } else return;
      e.preventDefault();
      return;
    }
    intentAt = now();
    const owner: KeyOwner = ownerOf(e.target, viewport);
    const intent = intentFor(e, { dir, owner, mac });
    // Space on a header does nothing here, and must not scroll the page either.
    if (!intent && owner === 'header' && (e.key === ' ' || e.key === 'Spacebar')) e.preventDefault();
    if (!intent) return;
    e.preventDefault();
    apply(intent, owner);
  });

  function positionOf(el: HTMLElement): FocusPos | null {
    // A row's selection box stands for its row: focus goes to the row's first cell.
    const check = el.closest<HTMLElement>('.dzg-row .dzg-check');
    if (check) {
      const key = rowRenderer.keyOf(check.closest('.dzg-row')!);
      const first = columns.visible()[0];
      return key && first ? { kind: 'cell', row: key, column: first.id } : null;
    }
    const hcell = el.closest<HTMLElement>('.dzg-hcell');
    if (hcell?.dataset['col']) return { kind: 'header', column: hcell.dataset['col'] };
    const cell = el.closest<HTMLElement>('.dzg-cell');
    const row = cell?.closest('.dzg-row');
    const key = row ? rowRenderer.keyOf(row) : undefined;
    return cell?.dataset['col'] && key ? { kind: 'cell', row: key, column: cell.dataset['col'] } : null;
  }

  /** Where the keys start from: the focus, or the first cell. */
  function current(): FocusPos | null {
    const f = kernel.focus;
    if (f) return f;
    const first = columns.visible()[0];
    if (!first) return null;
    const d = rows.displayed;
    return d.count ? { kind: 'cell', row: d.keyAt(d.index(0)!), column: first.id } : { kind: 'header', column: first.id };
  }

  function apply(intent: Intent, owner: KeyOwner): void {
    const from = current();
    if (!from) return;
    const d = rows.displayed;
    const cols = columns.visible();
    const ci = Math.max(0, cols.findIndex((c) => c.id === from.column));
    const ri = from.kind === 'cell' ? d.indexOf(from.row) : -1;
    const lastRow = d.count - 1;
    const page = Math.max(1, Math.floor(geometry.read().block / rowHeight()) - 1);
    const colAt = (i: number) => cols[Math.max(0, Math.min(cols.length - 1, i))]!.id;
    const cell = (r: number, c: number): FocusPos | null => (lastRow < 0 ? { kind: 'header', column: colAt(c) } : { kind: 'cell', row: d.keyAt(d.index(Math.max(0, Math.min(lastRow, r)))!), column: colAt(c) });
    let to: FocusPos | null = null;
    switch (intent.kind) {
      case 'move':
        // Back from the first header: the select-all box, when there is one.
        if (intent.axis === 'col' && from.kind === 'header' && ci === 0 && intent.delta < 0 && headerRenderer.checkBox) {
          headerRenderer.checkBox.focus({ preventScroll: true });
          return;
        }
        if (intent.axis === 'col') to = from.kind === 'header' ? { kind: 'header', column: colAt(ci + intent.delta) } : cell(ri, ci + intent.delta);
        else if (from.kind === 'header') to = cell(0, ci);
        else to = ri + intent.delta < 0 ? { kind: 'header', column: colAt(ci) } : cell(ri + intent.delta, ci);
        break;
      case 'edge': {
        const c = intent.axis === 'row' ? ci : intent.to === 'first' ? 0 : cols.length - 1;
        if (intent.axis === 'col' && from.kind === 'header') to = { kind: 'header', column: colAt(c) };
        else to = cell(intent.axis === 'col' ? ri : intent.to === 'first' ? 0 : lastRow, c);
        break;
      }
      case 'page':
        to = from.kind === 'header' ? cell(page - 1, ci) : cell(ri + intent.delta * page, ci);
        break;
      case 'toggleSelect': {
        const mode = settings.selection?.mode ?? 'none';
        if (from.kind !== 'cell' || mode === 'none') return;
        // Single: Space selects this row alone, or clears it.
        if (mode === 'single') kernel.dispatch(isSelected(kernel.selection, from.row) ? { type: 'selection.clear' } : { type: 'selection.only', row: from.row }, 'user');
        else kernel.dispatch({ type: 'selection.toggle', row: from.row }, 'user');
        return;
      }
      case 'selectAll':
        if (settings.selection?.mode === 'multi') kernel.dispatch({ type: 'selection.allDisplayed' }, 'user');
        return;
      case 'sort':
        if (owner === 'header') kernel.dispatch({ type: 'sort.toggle', column: from.column, multi: intent.multi }, 'user');
        return;
    }
    if (to) focusTo(to);
  }

  function focusTo(to: FocusPos): void {
    if (to.kind === 'cell') return focusCellAs(to.row, to.column, 'user');
    if (!kernel.dispatch({ type: 'focus.set', focus: to }, 'user').ok) return;
    scrollInlineTo(to.column);
    schedule();
    const el = headerRenderer.cell(to.column);
    if (el && !queued) el.focus({ preventScroll: true });
    else pendingFocus = { header: to.column };
  }
  // Above the cap the wheel is the grid's: the browser would move ratio times too far.
  scope.on(viewport, 'wheel', (e: WheelEvent) => {
    // Ctrl or Cmd with the wheel is a zoom (a trackpad pinch too): the page's, never a scroll.
    if (e.ctrlKey || e.metaKey) return;
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
  // A drag can end outside the window, where no pointerup comes.
  if (win) scope.on(win, 'blur', () => scroll.pointerUp());
  scope.add(kernel.subscribe((e) => {
    if (e.type === 'modelUpdated' && e.kind === 'rows') anchorNext = true;
    if (e.type === 'sortChanged' && e.source === 'user') announceSort(e.sort);
    if (e.type === 'focusChanged' && e.source !== 'data' && pendingFocus) {
      const p = pendingFocus;
      const same = e.focus && ('header' in p ? e.focus.kind === 'header' && e.focus.column === p.header : e.focus.kind === 'cell' && e.focus.row === p.row && e.focus.column === p.column);
      if (!same) pendingFocus = null;
    }
    if (e.type === 'focusChanged' && e.source === 'data' && e.focus && hasFocus && !viewport.contains(doc.activeElement)) {
      pendingFocus = e.focus.kind === 'cell' ? { row: e.focus.row, column: e.focus.column } : { header: e.focus.column };
    }

    if (e.type === 'modelUpdated' || e.type === 'focusChanged' || e.type === 'selectionChanged' || e.type === 'columnResized' || e.type === 'columnsChanged') schedule();
    // The host's callback last, and fenced: a bug there must not stop the grid repainting or
    // the other listeners hearing the event. The error is reported, not swallowed.
    try {
      settings.onEvent?.(e);
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
  // ---------- quick-search warm-up (D13) ----------
  // Scroll speed, for the overscan; a paint once scrolling stops trims back to the resting overscan.
  let speed = 0;
  let lastTop = 0;
  let trim: (() => void) | null = null;
  scope.on(viewport, 'scroll', () => {
    const t = now();
    const dt = Math.max(1, t - scrolledAt);
    // A jump of several views is no gesture: the rows between are never seen, so no overscan for it.
    const moved = Math.abs(scroll.logicalTop - lastTop);
    speed = dt > 200 || moved > 3 * geometry.read().block ? 0 : (moved * 1000) / dt;
    lastTop = scroll.logicalTop;
    scrolledAt = t;
    trim?.();
    trim = scope.timeout(() => {
      trim = null;
      schedule();
    }, 160);
  }, { passive: true });
  let stopWarm: (() => void) | null = null;
  function warm(): void {
    stopWarm?.();
    stopWarm = null;
    if (settings.searchWarmup !== 'idle') return;
    const w = rows.warmSearch();
    const stop = idleLoop(() => w.step(2000), scope, { win, busy: () => now() - scrolledAt < 200 });
    stopWarm = () => {
      w.cancel();
      stop();
    };
  }
  // Prepared again after a load, a language change, or the search box emptied (which releases it).
  let quickBefore = kernel.query.quick;
  scope.add(kernel.subscribe((e) => {
    if (e.type !== 'modelUpdated') return;
    const emptied = quickBefore.trim() !== '' && kernel.query.quick.trim() === '';
    quickBefore = kernel.query.quick;
    if (e.kind === 'rows' || e.kind === 'context' || emptied) warm();
  }));

  const initialBox = geometry.read();
  columns.setAvailableInline(initialBox.inline);
  schedule();
  warm();
  // Column definitions refused or bent are told, like the rows' (D14: too-many-pinned).
  if (columns.problems.length) emit(kernel, { type: 'problems', source: 'host', problems: columns.problems });
  if (rows.problems.length) emit(kernel, { type: 'problems', source: 'host', problems: rows.problems });

  /**
   * A header's sort state (APG): `aria-sort` on the first sorted column only;
   * the direction and, in a multi-column sort, the precedence shown, the
   * precedence also in the header's name.
   */
  function decorateHeader(col: { id: string; sortable: boolean; def: { header?: string; resizable?: boolean } }, el: HTMLElement, sort: readonly { column: string; dir: 'asc' | 'desc' }[]): void {
    el.classList.toggle('dzg-sortable', col.sortable);
    // The resize handle: on the end edge, or the start edge for the last end-pinned column.
    let grip = el.querySelector<HTMLElement>(':scope > .dzg-resize');
    if (col.def.resizable === false) grip?.remove();
    else {
      if (!grip) {
        grip = doc.createElement('span');
        grip.className = 'dzg-resize';
        grip.setAttribute('aria-hidden', 'true');
        el.append(grip);
      }
      grip.classList.toggle('dzg-resize-start', isLastEnd(col.id));
    }
    const at = sort.findIndex((s) => s.column === col.id);
    setAttr(el, 'aria-sort', at === 0 ? (sort[0]!.dir === 'asc' ? 'ascending' : 'descending') : null);
    let mark = el.querySelector<HTMLElement>(':scope > .dzg-sort');
    if (at === -1) {
      mark?.remove();
      setAttr(el, 'aria-label', null);
      return;
    }
    if (!mark) {
      mark = doc.createElement('span');
      mark.className = 'dzg-sort';
      mark.setAttribute('aria-hidden', 'true');
      el.append(mark);
    }
    setAttr(mark, 'data-dir', sort[at]!.dir);
    const n = sort.length > 1 ? formattersFor(ctx).number()(at + 1) : '';
    if (mark.textContent !== n) mark.textContent = n;
    setAttr(el, 'aria-label', sort.length > 1 ? msg(settings.messages, 'header.withSort', { header: col.def.header ?? col.id, priority: msg(settings.messages, 'sort.priority', { n: at + 1 }, ctx) }, ctx) : null);
  }

  function isLastEnd(id: string): boolean {
    const end = columns.layout.end.columns;
    return end.length > 0 && end[end.length - 1]!.id === id;
  }
  function widthOf(id: string): number {
    const L = columns.layout;
    for (const slice of [L.start, L.center, L.end]) {
      const i = slice.columns.findIndex((c) => c.id === id);
      if (i !== -1) return slice.widths.sizeAt(i);
    }
    return 0;
  }
  const resizing = attachResize({
    scope, header,
    dir: () => dir,
    widthOf,
    reversed: isLastEnd,
    resize: (column, width, finished) => void kernel.dispatch({ type: 'column.resize', column, width, finished }, 'user'),
    nextFrame: (fn) => scheduler.schedule({ read: () => 0, write: fn }),
  });

  /** The select-all box, multi mode only: all displayed rows, or none. */
  function toggleAll(): void {
    if (settings.selection?.mode !== 'multi') return;
    const all = headerSelection(kernel.selection, rows.displayed) === 'all';
    kernel.dispatch(all ? { type: 'selection.clear' } : { type: 'selection.allDisplayed' }, 'user');
  }

  // ---------- tooltips: the host's words only ----------
  function tooltipFor(el: HTMLElement): string | null {
    const hcell = el.closest<HTMLElement>('.dzg-hcell');
    if (hcell) {
      const col = hcell.dataset['col'] ? columns.get(hcell.dataset['col']) : undefined;
      return col?.def.headerTooltip ?? null;
    }
    const cell = el.closest<HTMLElement>('.dzg-cell');
    const row = cell?.closest('.dzg-row');
    const key = row ? rowRenderer.keyOf(row) : undefined;
    const col = cell?.dataset['col'] ? columns.get(cell.dataset['col']) : undefined;
    if (!key || typeof col?.def.tooltip !== 'function') return null;
    const node = rows.row(key);
    if (!node) return null;
    // A host function that throws shows no tooltip; the error is reported.
    try {
      const raw = col.read(node.data);
      const value = isBlank(raw) ? null : col.codec.coerce(raw, ctx);
      return col.def.tooltip(value, node.data) ?? null;
    } catch (err) {
      report(err);
      return null;
    }
  }
  const delay = () => settings.tooltips?.delayMs ?? 500;
  scope.on(viewport, 'pointerover', (e: PointerEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.dzg-hcell, .dzg-cell');
    if (!t || t === tip.anchor) return;
    const text = tooltipFor(t);
    if (text) tip.showFor(t, text, dir, delay());
    else tip.hideSoon();
  });
  scope.on(viewport, 'pointerout', (e: PointerEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && (tooltip.contains(to) || (tip.anchor && tip.anchor.contains(to)))) return;
    tip.hideSoon();
  });

  // ---------- pointer: sort by header click, row selection ----------
  scope.on(header, 'click', (e: MouseEvent) => {
    if (resizing.consumeClick()) return;
    const t = e.target as HTMLElement;
    if (t.closest('.dzg-resize')) return;
    if (headerRenderer.check && headerRenderer.check.contains(t)) {
      toggleAll();
      return;
    }
    const id = t.closest<HTMLElement>('.dzg-hcell')?.dataset['col'];
    const col = id ? columns.get(id) : undefined;
    if (col?.sortable) kernel.dispatch({ type: 'sort.toggle', column: col.id, multi: e.shiftKey }, 'user');
  });
  // Shift+click extends the rows, not the page's text selection.
  scope.on(body, 'mousedown', (e: MouseEvent) => {
    if (e.shiftKey && (settings.selection?.mode ?? 'none') === 'multi') e.preventDefault();
  });
  scope.on(body, 'click', (e: MouseEvent) => {
    const mode = settings.selection?.mode ?? 'none';
    if (mode === 'none') return;
    const t = e.target as HTMLElement;
    const row = t.closest('.dzg-row');
    const key = row ? rowRenderer.keyOf(row) : undefined;
    if (!key) return;
    const onBox = !!t.closest('.dzg-check');
    if (!onBox && settings.selection?.click !== true) return;
    const toggle = onBox || (mac ? e.metaKey : e.ctrlKey);
    if (mode === 'multi' && e.shiftKey && kernel.anchor === null) kernel.dispatch({ type: 'selection.only', row: key }, 'user');
    else if (mode === 'multi' && e.shiftKey) {
      const r = kernel.dispatch({ type: 'selection.range', target: key, additive: toggle }, 'user');
      if (!r.ok && r.reason === 'anchor-not-displayed') live.announce(msg(settings.messages, 'announce.rangeCancelled', {}, ctx));
    } else if (toggle && mode === 'multi') kernel.dispatch({ type: 'selection.toggle', row: key }, 'user');
    else if (toggle && isSelected(kernel.selection, key)) kernel.dispatch({ type: 'selection.clear' }, 'user');
    else kernel.dispatch({ type: 'selection.only', row: key }, 'user');
  });

  /** A centre column comes clear of the pinned segments. */
  function scrollInlineTo(column: string): void {
    const box = geometry.read();
    const L = columns.layout;
    const c = L.center.columns.findIndex((x) => x.id === column);
    if (c === -1) return;
    const extra = settings.selection?.checkbox && (settings.selection.mode ?? 'none') !== 'none' ? CHECK_WIDTH : 0;
    const view = Math.max(0, box.inline - L.start.width - extra - L.end.width);
    const start = L.center.widths.offsetOf(c);
    const end = start + L.center.widths.sizeAt(c);
    let x = box.scrollInline;
    if (start < x) x = start;
    else if (end > x + view) x = end - view;
    if (x !== box.scrollInline) {
      geometry.writeScrollInline(x);
      schedule();
    }
  }

  const api: GridApi = {
    focusCell(row, column) {
      focusCellAs(row, column, 'api');
    },
    ensureVisible(row, column) {
      ensureVisible(row, column);
    },
    refresh: () => schedule(),
    announce: (text) => live.announce(text),
  };

  function focusCellAs(row: RowKey, column: string, source: 'api' | 'user'): void {
      if (!kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row, column } }, source).ok) return;
      ensureVisible(row, column);
      // Mounted now, or at the next paint: the grid scrolls, then focuses without scrolling (S10).
      const cell = rowRenderer.cell(row, column);
      if (cell && !queued) cell.focus({ preventScroll: true });
      else {
        pendingFocus = { row, column };
        schedule();
      }
  }

  function ensureVisible(row: RowKey, column?: string): void {
      const i = rows.displayed.indexOf(row);
      if (i === -1) return;
      const box = geometry.read();
      if (column !== undefined) scrollInlineTo(column);
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
  }

  const instance: GridInstance<T> & { readonly scope: Scope; readonly paints: number; pooledData(): unknown[]; readonly scroll: { readonly logicalTop: number; readonly mapper: unknown; scrollTo(l: number): void } } = {
    kernel,
    api,
    scope,
    get paints() { return paints; },
    pooledData: () => rowRenderer.pooledData(),
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
      const next = { ...settings, ...patch };
      if (patch.messages) checkMessages(patch.messages);
      // `in`, not `!== undefined`: clearing a setting goes back to its default. Computed before
      // anything changes: a locale that does not exist throws and leaves the grid as it was.
      const contextChanged = 'locale' in patch || 'timeZone' in patch || 'numerals' in patch || (!!patch.messages && patch.messages.locale !== prev.messages.locale && !next.locale);
      const nextCtx = contextChanged ? ctxOf(next) : ctx;
      settings = next;
      if (patch.columns && patch.columns !== prev.columns) {
        const change = columns.setDefs(patch.columns);
        rows.setColumns(columns, 'host');
        if (change.problems.length) emit(kernel, { type: 'problems', source: 'host', problems: change.problems });
      }
      if (contextChanged) {
        ctx = nextCtx;
        rows.setContext(ctx, 'host');
      }
      if (patch.rows) rows.setRows(patch.rows, 'host');
      direction.recheck();
      if ('direction' in patch) applyDir();
      if ('searchWarmup' in patch && patch.searchWarmup !== prev.searchWarmup) warm();
      if ('overlay' in patch && patch.overlay !== prev.overlay && patch.overlay) {
        live.announce(msg(settings.messages, patch.overlay === 'loading' ? 'announce.loading' : 'announce.error', {}, ctx));
      }
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
