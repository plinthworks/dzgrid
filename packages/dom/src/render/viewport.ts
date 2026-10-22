import { isSelected, MAX_PHYSICAL, messageProblems, partNameFor, type ResolvedColumn, overscanRows, scrollMapper, uniformRowLayout, windowAt, type DisplayedRows, type RowKey, type RowLayout } from '@dzgrid/core';
import { emit, isDataKey, shownAncestor } from '@dzgrid/core/internal';
import type { PartBase, SlotPart } from '../part.js';
import type { GridContext } from '../context.js';
import { decorateHeader } from './header-decor.js';
import type { ViewportBox } from './measure.js';
import { overlayPainter } from './overlay.js';
import { CHECK_WIDTH, setAttr, setPx, type Frame } from './rows.js';

const OVERSCAN_ROWS = 2;
const OVERSCAN_COLS = 1;

export interface Painter {
  paint(box: ViewportBox): void;
  /**
   * Rows came or went by a transaction: the next paint keeps the view's top row in place (S3).
   * `expand` (rows opened or closed): the top row only, even at the end (what opens below it stays below).
   */
  rowsChanged(kind?: 'rows' | 'expand'): void;
  readonly paints: number;
}

/**
 * The row layout of the rows shown now (D7): the last one made while the rows, the row height and the
 * feature's `layoutFor` are the same (heights a feature set on it live until the next build), else a new
 * one, a feature's or every row `h` tall, kept in `g.layout`. The paint, `ensureVisible` and the page
 * keys read it: never a layout of rows already gone.
 */
export function rowLayout<T>(g: GridContext<T>): RowLayout {
  const d = g.rows.displayed;
  const h = g.rowHeight();
  const by = g.layoutFor;
  const l = g.laid;
  if (!g.layout || !l || l[0] !== d || l[1] !== h || l[2] !== by) {
    g.layout = by?.(d, h) ?? uniformRowLayout(d, h);
    g.laid = [d, h, by];
  }
  return g.layout;
}

/**
 * The paint: one per frame, reads already done (the box). Mapper and window,
 * grid attributes, header, rows, then the focus that waited for its cell,
 * and the overlay.
 */
export function createPainter<T>(g: GridContext<T>, after: { rovingStop(d: DisplayedRows<T>, visible: readonly { id: string }[]): void }): Painter {
  const { el, columns, rows, kernel, scroll, headerRenderer, rowRenderer } = g;
  let epoch = 0;
  let epochKey = '';
  let mapperKey = '';
  let available = -1;
  let colIndexOf: { version: number; index: Map<string, number> } = { version: -1, index: new Map() };
  let shown: { displayed: DisplayedRows<T>; key: RowKey | null; delta: number; atTop: boolean; atEnd: boolean; h: number; total: number; layout: RowLayout } | null = null;
  let anchorNext: 'rows' | 'expand' | null = null;
  let paints = 0;
  let firstData = false;
  // The cell part of each column: resolved again when the columns or the registry change.
  let parts: { version: number; registry: unknown; byColumn: Map<string, SlotPart<'cell'> | null>; rev: number } = { version: -1, registry: null, byColumn: new Map(), rev: 0 };
  // Problems already told for this registry: a resize must not tell them again.
  let told = new Set<string>();
  // The messages object: a part reading `msg` is rebound when it changes, as cells are.
  let messages: unknown = null;
  let messagesRev = 0;
  // The application's context: a new one rebinds the cell parts too (step 21), as new messages do.
  let context: unknown;
  let lastH = 0;
  // A part's messages: the host's own `app.*` keys, a missing one told once per bundle.
  let toldMessages = new Set<string>();
  const partMsg: PartBase['msg'] = (key, params) => {
    if (key.startsWith('app.') && !toldMessages.has(key)) {
      toldMessages.add(key);
      const problems = messageProblems(key, new Set(Object.keys(g.settings.messages.text)));
      if (problems.length) emit(kernel, { type: 'problems', source: 'host', problems });
    }
    return g.msg(key as never, params);
  };
  // Stable, so a part's context compares equal from one paint to the next.
  const announce = (text: string): void => g.live.announce(text);
  const paintOverlay = overlayPainter(g);
  const partFor = (col: ResolvedColumn<any>): SlotPart<'cell'> | null => parts.byColumn.get(col.id) ?? null;
  function resolveParts(): void {
    const registry = g.parts();
    if (parts.version === columns.version && parts.registry === registry) return;
    const cellParts = new Map(Object.entries(registry).filter(([, p]) => p.slot === 'cell') as [string, SlotPart<'cell'>][]);
    const names = new Set(cellParts.keys());
    const byColumn = new Map<string, SlotPart<'cell'> | null>();
    // A new registry: problems told again; the tooltip hidden, its part may be gone or another
    // (header and overlay parts follow at this paint; a tooltip mounts afresh at its next show).
    if (parts.registry !== registry) (told = new Set()), g.tip.hide();
    const problems = [];
    for (const col of columns.visible()) {
      const r = partNameFor('cell', { id: col.id, type: col.type, ...(col.def.ui && { ui: col.def.ui }) }, names);
      for (const p of r.problems) {
        const id = `${p.code}|${p.path}`;
        if (told.has(id)) continue;
        told.add(id);
        problems.push(p);
      }
      byColumn.set(col.id, r.name ? cellParts.get(r.name)! : null);
    }
    parts = { version: columns.version, registry, byColumn, rev: parts.rev + 1 };
    if (problems.length) emit(kernel, { type: 'problems', source: 'host', problems });
  }

  function paint(box: ViewportBox): void {
    paints++;
    const root = el.root.getRootNode() as Document | ShadowRoot;
    const held = el.viewport.contains(root.activeElement);
    if (box.remPx && box.remPx !== g.remPx) g.remPx = box.remPx;
    const { settings, ctx, dir } = g;
    // Flexible columns share what the view has: follow it.
    if (box.inline !== available && box.inline > 0) {
      available = box.inline;
      columns.setAvailableInline(box.inline);
    }
    const d = rows.displayed;
    const h = g.rowHeight();
    // One row layout for these rows (D7): a feature's (variable heights), or every row `h` tall.
    const layout = rowLayout(g);
    g.viewBlock = box.block;
    const L = columns.layout;
    const visible = columns.visible();

    // Everything a cell's text depends on, but the row: when it changes, cells are rechecked.
    const check = settings.selection?.checkbox === true && (settings.selection.mode ?? 'none') !== 'none';
    const extra = check ? CHECK_WIDTH : 0;
    resolveParts();
    if (settings.messages !== messages) {
      messages = settings.messages;
      messagesRev++;
      toldMessages = new Set();
    }
    if (settings.context !== context) (context = settings.context), messagesRev++;
    // Direction too: whether a value is isolated depends on it; and which parts draw cells.
    const ek = `${columns.version}|${ctx.locale}|${ctx.numerals}|${ctx.timeZone}|${h}|${check}|${dir}|${parts.rev}|${messagesRev}`;
    if (ek !== epochKey) {
      epochKey = ek;
      epoch++;
    }
    const mk = `${layout.total}|${h}|${box.block}`;
    if (!scroll.mapper || mk !== mapperKey) {
      mapperKey = mk;
      const next = scrollMapper(layout.total, g.env.maxPhysical ?? MAX_PHYSICAL, box.block);
      // The body grows first: a scroll written before would be clamped to the old height.
      setPx(el.body, 'block-size', next.physicalHeight);
      // Taller or shorter rows (text zoom): the same row stays at the top, at the same fraction (rows of
      // their own heights: found in the last paint's layout, the same row by its index).
      const was = shown?.layout;
      const top = scroll.logicalTop;
      const at = was && !was.uniform && layout.count ? Math.min(was.indexAt(top), layout.count - 1) : -1;
      const keep = lastH > 0 && h !== lastH ? (at < 0 ? (top * h) / lastH : layout.offsetOf(at as never) + ((top - was!.offsetOf(at as never)) * layout.heightOf(at as never)) / (was!.heightOf(at as never) || 1)) : null;
      scroll.setMapper(next);
      if (keep !== null) scroll.scrollTo(keep);
    }
    lastH = h;
    const mapper = scroll.mapper!;
    // Rows added or removed by a transaction: the row at the top of the view stays where it was,
    // the top stays the top and the end stays the end. The same rows laid out again with another
    // total (a height set on the layout, D7) are anchored as rows are.
    const relaid = !!shown && shown.displayed === d && shown.h === h && shown.total !== layout.total;
    if (relaid) anchorNext ??= 'rows';
    if (anchorNext && shown && (shown.displayed !== d || relaid)) {
      if (shown.atTop) scroll.scrollTo(0);
      else if (shown.atEnd && anchorNext === 'rows') scroll.scrollTo(mapper.maxLogical);
      else if (shown.key !== null) {
        const at = d.indexOf(shown.key);
        // The distance into it, at most its new height (a top detail that shrank).
        if (at !== -1) scroll.scrollTo(layout.offsetOf(at) + Math.min(shown.delta, layout.heightOf(at)));
        // Hidden by a closing above the view: its nearest shown ancestor at the top, just under its own
        // pinned ancestors (tree-view.md, WCAG 2.4.11), as a scroll into view puts it.
        else if (anchorNext === 'expand') {
          const up = shownAncestor(shown.key, d);
          const ui = up === null ? -1 : d.indexOf(up);
          if (ui !== -1) scroll.scrollTo(Math.max(0, layout.offsetOf(ui) - (g.insetFor?.(ui) ?? 0)));
        }
      }
    }
    anchorNext = null;
    const centerView = Math.max(0, box.inline - L.start.width - extra - L.end.width);
    const w = windowAt(layout, L.center.widths, scroll.logicalTop, scroll.physicalTop, box.scrollInline, { block: box.block, inline: centerView }, {
      // At rest a couple of rows (the body's node budget); more while scrolling fast.
      overscanRows: settings.overscan?.rows ?? overscanRows(g.now() - g.scrolledAt < 150 ? g.speed : 0, h, { min: OVERSCAN_ROWS, max: 40 }),
      overscanCols: settings.overscan?.cols ?? OVERSCAN_COLS,
    });

    // Before anything of the rows moves (the layer included), and before the attributes count the header rows: what a feature reads of the old places.
    for (const f of g.features) f.beforeRows?.();

    // ---- grid attributes ----
    setAttr(el.root, 'data-density', settings.density ?? 'comfortable');
    if (el.root.style.getPropertyValue('--dzg-row-height') !== `${h}px`) el.root.style.setProperty('--dzg-row-height', `${h}px`);
    // Every header row counts: the group rows, the column headers and those the features add.
    const headerRows = g.bands.length + 1 + g.headerRows.length;
    setAttr(el.viewport, 'aria-rowcount', String(d.count + headerRows));
    setAttr(el.viewport, 'aria-colcount', String(visible.length + (check ? 1 : 0)));
    const mode = settings.selection?.mode ?? 'none';
    setAttr(el.viewport, 'aria-multiselectable', mode === 'multi' ? 'true' : null);
    setAttr(el.viewport, 'aria-label', settings.label ?? g.msg('grid.label'));
    const loading = settings.overlay === 'loading' || rows.status.phase === 'loading';
    setAttr(el.viewport, 'aria-busy', loading ? 'true' : null);
    // Rows kept while the next ones load: shown, marked stale.
    setAttr(el.root, 'data-stale', loading && d.count ? '' : null);
    setPx(el.body, 'block-size', mapper.physicalHeight);
    setPx(el.body, 'inline-size', L.totalWidth + extra);
    setAttr(el.root, 'data-motion', settings.motion === false ? 'off' : null);
    setPx(el.layer, 'inset-block-start', w.placement.layerTop);

    const ciKey = columns.version * 2 + (check ? 1 : 0);
    if (colIndexOf.version !== ciKey) colIndexOf = { version: ciKey, index: new Map(visible.map((c, i) => [c.id, i + 1 + (check ? 1 : 0)])) };
    const index = colIndexOf.index;
    const colIndex = (id: string) => index.get(id) ?? 0;
    const focus = kernel.focus;
    const focusCenter = focus ? L.center.columns.findIndex((c) => c.id === focus.column) : -1;
    const sort = kernel.query.sort;
    g.partBase = { ctx, dir, doc: g.doc, msg: partMsg, announce, context };
    const headerHeight = headerRenderer.render({
      layout: L, cols: w.cols, height: h, colIndex,
      decorate: (col, cell) => {
        let label = decorateHeader(g, col, cell, sort);
        for (const f of g.features) label = f.decorateHeader?.(col, cell, label) ?? label;
        setAttr(cell, 'aria-label', label);
      }, content: g.slots?.header,
      keep: focus?.kind === 'header' ? { center: focusCenter, level: focus.level ?? 0 } : null,
      check, selectAll: mode === 'multi', extra: g.headerRows, bands: g.bands,
    });
    if (headerRenderer.checkName) {
      const text = g.msg('selection.column');
      if (headerRenderer.checkName.textContent !== text) headerRenderer.checkName.textContent = text;
    }
    if (headerRenderer.checkBox) {
      const state = kernel.headerState;
      setAttr(headerRenderer.checkBox, 'aria-checked', state === 'all' ? 'true' : state === 'some' ? 'mixed' : 'false');
      setAttr(headerRenderer.checkBox, 'aria-label', g.msg('selection.all'));
    }

    const wanted: number[] = [];
    if (w.rows) for (let i = w.rows.first; i <= w.rows.last; i++) wanted.push(i);
    const base = w.placement.base;
    const spans = g.spans;
    const frame: Frame<T> = {
      displayed: d, layout: L, cols: w.cols, ctx, epoch, spans,
      rowTop: (i) => layout.offsetOf(d.index(i)!) - base,
      rowHeight: (i) => layout.heightOf(d.index(i)!),
      rowHeader: visible[0]?.id ?? null, colIndex,
      rowAttrs: (key, row) => setAttr(row, 'aria-selected', mode === 'none' || !isDataKey(key) ? null : isSelected(kernel.selection, key) ? 'true' : 'false'),
      check, dir, headerRows, partFor, report: g.report,
      partBase: g.partBase,
      focusRow: focus?.kind === 'cell' ? focus.row : null, focusCenter,
      focusColumn: focus?.kind === 'cell' ? focus.column : null, partRev: messagesRev, view: box.inline,
    };
    // Kept mounted out of the window: the focused row first (never moved), then the anchors of tall cells.
    const retained: RowKey[] = focus?.kind === 'cell' ? [focus.row] : [];
    if (spans && w.rows) retained.push(...spans.anchors(w.rows.first, w.rows.last));
    rowRenderer.render(frame, wanted, retained);
    // A tooltip whose anchor left the page (its column hidden), or whose pooled cell now shows
    // another row or new data (a sort, a filter, an update): hidden, its text would be stale.
    const tipAt = g.tip.anchor;
    const tipRow = tipAt?.closest('.dzg-row');
    if (tipAt && (!tipAt.isConnected || g.tip.row !== (tipRow ? rows.row(rowRenderer.keyOf(tipRow)!)?.data : null))) g.tip.hide();
    for (const h of g.features) h.afterRows?.(frame as Frame<unknown>);
    after.rovingStop(d, visible);
    const topIndex = d.count ? layout.indexAt(scroll.logicalTop) : null;
    shown = {
      displayed: d,
      key: topIndex !== null ? d.keyAt(topIndex) : null,
      delta: topIndex !== null ? scroll.logicalTop - layout.offsetOf(topIndex) : 0,
      atTop: scroll.atTop,
      atEnd: scroll.atEnd,
      h,
      total: layout.total,
      layout,
    };
    // The focused cell or header moved to another pinned segment (a move blurs, unseen): given back.
    if (held && focus && !g.pendingFocus && !el.viewport.contains(root.activeElement)) g.pendingFocus = focus.kind === 'cell' ? focus : { header: focus.column, level: focus.level ?? 0 };
    const pending = g.pendingFocus;
    if (pending) {
      const target = 'header' in pending ? headerRenderer.cell(pending.header, pending.level ?? 0) : rowRenderer.cell(pending.row, pending.column);
      if (target) {
        g.pendingFocus = null;
        target.focus({ preventScroll: true });
      }
    }
    paintOverlay(d.count, headerHeight);
    // Once, the first time rows are on screen (a host waiting to measure or to focus).
    if (!firstData && d.count > 0) {
      firstData = true;
      emit(kernel, { type: 'firstDataRendered', source: 'data' });
    }
  }

  return {
    paint,
    rowsChanged: (kind = 'rows') => { if (anchorNext !== 'rows') anchorNext = kind; },
    get paints() { return paints; },
  };
}
