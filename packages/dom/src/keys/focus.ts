import type { CellFocus, DisplayedRows, FocusPos, RowKey } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import { CHECK_WIDTH } from '../render/rows.js';

export interface FocusControl<T> {
  focusCellAs(row: RowKey, column: string, source: 'api' | 'user'): void;
  focusTo(to: FocusPos): void;
  ensureVisible(row: RowKey, column?: string): void;
  scrollInlineTo(column: string): void;
  /** Where the keys start from: the focus, or the first cell. */
  current(): FocusPos | null;
  positionOf(el: HTMLElement): FocusPos | null;
  rovingStop(d: DisplayedRows<T>, visible: readonly { id: string }[]): void;
}

/**
 * Focus: one tab stop, focus by identity, scrolled to logically then focused
 * without the browser's scroll (S10); the user's focus taken from the DOM;
 * a focused row removed by a filter hands the DOM focus to the row now at its
 * place.
 */
export function installFocus<T>(g: GridContext<T>): FocusControl<T> {
  const { el, kernel, rows, columns, rowRenderer, headerRenderer, scope } = g;

  function positionOf(target: HTMLElement): FocusPos | null {
    // A row's selection box stands for its row: focus goes to the row's first cell.
    const check = target.closest<HTMLElement>('.dzg-row .dzg-check');
    if (check) {
      const key = rowRenderer.keyOf(check.closest('.dzg-row')!);
      const first = columns.visible()[0];
      return key && first ? { kind: 'cell', row: key, column: first.id } : null;
    }
    const hcell = target.closest<HTMLElement>('.dzg-hcell');
    if (hcell?.dataset['col']) {
      const level = Number(hcell.dataset['level'] ?? 0);
      return level ? { kind: 'header', column: hcell.dataset['col'], level } : { kind: 'header', column: hcell.dataset['col'] };
    }
    const cell = target.closest<HTMLElement>('.dzg-cell');
    const row = cell?.closest('.dzg-row');
    const key = row ? rowRenderer.keyOf(row) : undefined;
    return cell?.dataset['col'] && key ? { kind: 'cell', row: key, column: cell.dataset['col'] } : null;
  }

  function current(): FocusPos | null {
    const f = kernel.focus;
    if (f) return f;
    const first = columns.visible()[0];
    if (!first) return null;
    const d = rows.displayed;
    return d.count ? { kind: 'cell', row: d.keyAt(d.index(0)!), column: first.id } : { kind: 'header', column: first.id };
  }

  /** A centre column comes clear of the pinned segments. */
  function scrollInlineTo(column: string): void {
    const box = g.geometry.read();
    const L = columns.layout;
    const c = L.center.columns.findIndex((x) => x.id === column);
    if (c === -1) return;
    const s = g.settings.selection;
    const extra = s?.checkbox && (s.mode ?? 'none') !== 'none' ? CHECK_WIDTH : 0;
    const view = Math.max(0, box.inline - L.start.width - extra - L.end.width);
    const start = L.center.widths.offsetOf(c);
    const end = start + L.center.widths.sizeAt(c);
    let x = box.scrollInline;
    if (start < x) x = start;
    else if (end > x + view) x = end - view;
    if (x !== box.scrollInline) {
      g.geometry.writeScrollInline(x);
      g.schedule();
    }
  }

  function ensureVisible(row: RowKey, column?: string): void {
    // A cell spanning rows shows the row aimed at (the spans feature knows it), not only its first.
    const i = rows.displayed.indexOf(g.spans?.at(row) ?? row);
    if (i === -1) return;
    const box = g.geometry.read();
    if (column !== undefined) scrollInlineTo(column);
    const h = g.rowHeight();
    const top = g.scroll.logicalTop;
    const off = i * h;
    let next = top;
    if (off < top) next = off;
    else if (off + h > top + box.block) next = off + h - box.block;
    if (next !== top) {
      g.scroll.scrollTo(next);
      g.schedule();
    }
  }

  function focusCellAs(row: RowKey, column: string, source: 'api' | 'user'): void {
    if (!kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row, column } }, source).ok) return;
    ensureVisible(row, column);
    // A place a span covers: the kernel focused the cell owning it (shown where asked).
    const f = kernel.focus as CellFocus;
    // Mounted now, or at the next paint: the grid scrolls, then focuses without scrolling (S10).
    const cell = rowRenderer.cell(f.row, f.column);
    if (cell && !g.queued) cell.focus({ preventScroll: true });
    else {
      g.pendingFocus = f;
      g.schedule();
    }
  }

  function focusTo(to: FocusPos): void {
    if (to.kind === 'cell') return focusCellAs(to.row, to.column, 'user');
    if (!kernel.dispatch({ type: 'focus.set', focus: to }, 'user').ok) return;
    scrollInlineTo(to.column);
    g.schedule();
    const level = to.level ?? 0;
    const cell = headerRenderer.cell(to.column, level);
    if (cell && !g.queued) cell.focus({ preventScroll: true });
    else g.pendingFocus = { header: to.column, level };
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
    else if (f?.kind === 'header') target = headerRenderer.cell(f.column, f.level ?? 0);
    else if (visible[0]) target = d.count ? rowRenderer.cell(d.keyAt(d.index(0)!), visible[0].id) : headerRenderer.cell(visible[0].id);
    // The first cell scrolled out with nothing focused: the first cell in view takes the stop,
    // so Tab still enters the grid (and the keys start from the first cell, `current()`).
    target ??= el.layer.querySelector<HTMLElement>('.dzg-cell') ?? el.header.querySelector<HTMLElement>('.dzg-hcell[data-col]');
    if (target === stop) return;
    if (stop) stop.tabIndex = -1;
    stop = target;
    if (stop) stop.tabIndex = 0;
  }

  scope.on(el.viewport, 'focusout', (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to) {
      if (!el.viewport.contains(to)) g.hasFocus = false;
      return;
    }
    // No related target: the focused element was removed (keep the focus to hand it on),
    // or the user went elsewhere — a click on the page, another window (let it go).
    const from = e.target as Node;
    if (from.isConnected && el.viewport.contains(from)) g.hasFocus = false;
  });
  scope.on(el.viewport, 'focusin', (e: FocusEvent) => {
    g.hasFocus = true;
    // The user's own choice wins over a focus still waiting for its cell.
    g.pendingFocus = null;
    g.intentAt = g.now();
    const target = e.target as HTMLElement;
    const pos = positionOf(target);
    if (!pos) return;
    kernel.dispatch({ type: 'focus.set', focus: pos }, 'user');
    if (target.closest('.dzg-row .dzg-check') && pos.kind === 'cell') rowRenderer.cell(pos.row, pos.column)?.focus({ preventScroll: true });
  });
  scope.add(kernel.subscribe((e) => {
    if (e.type !== 'focusChanged') return;
    const p = g.pendingFocus;
    if (e.source !== 'data' && p) {
      const same = e.focus && ('header' in p ? e.focus.kind === 'header' && e.focus.column === p.header && (e.focus.level ?? 0) === (p.level ?? 0) : e.focus.kind === 'cell' && e.focus.row === p.row && e.focus.column === p.column);
      if (!same) g.pendingFocus = null;
    }
    if (e.source === 'data' && e.focus && g.hasFocus && !el.viewport.contains(g.doc.activeElement)) {
      g.pendingFocus = e.focus.kind === 'cell' ? e.focus : { header: e.focus.column, level: e.focus.level ?? 0 };
    }
  }));

  return { focusCellAs, focusTo, ensureVisible, scrollInlineTo, current, positionOf, rovingStop };
}
