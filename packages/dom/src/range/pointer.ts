import type { CellAddr, CellRange, ChangeSource } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import { setAttr } from '../render/write.js';
import { autoScroll, cellAt } from './geom.js';

/** What the pointer needs of the block (`range/index.ts`). */
export interface Sel {
  readonly r: CellRange | null;
  follows: boolean;
  /** Sets the block (one cell: none), tells it, paints; `say`: its size after the pause. */
  set(next: CellRange | null, source: ChangeSource, say?: boolean): void;
  /** The block's size, said after the pause (restarted). */
  say(): void;
  drop(source: ChangeSource): void;
  /** The focus to a cell, as the feature's own move (the block is not dropped by it). */
  focusTo(a: CellAddr): void;
}

/** Two cells are one. */
export const same = (a: CellAddr, b: CellAddr): boolean => a.row === b.row && a.column === b.column;

/**
 * The pointer (range-selection.md 8–9, owner QB1, S11-Q1): a press on a data cell and a drag make a block, the focus
 * left on the pressed cell until the release, then on the moving corner; Shift+click extends from the anchor (the
 * focus goes there, QB2) and Shift+drag goes on; the click after a drag is swallowed once. The cell under the pointer
 * is found by geometry (the row layout, the column widths), never `elementFromPoint`: pinned parents, the tooltip and
 * the overlay sit over cells, and scaled scrolling stays logical. Near an edge of the body the view scrolls, one frame
 * loop, as fast as the pointer is deep into the band (at most a row height a frame). Mouse and pen only.
 */
export function pointer(g: GridContext<unknown>, sel: Sel, drag: boolean): { stop(): void } {
  const { el, doc, win, scope, rowRenderer } = g;
  const raf = g.env.raf ?? win;
  /** The cell pressed, while the button is down; the block's anchor for this gesture. */
  let press: CellAddr | null = null;
  let anchor: CellAddr | null = null;
  let ranging = false;
  let swallow = false;
  let last: { readonly clientX: number; readonly clientY: number } | null = null;
  let id = 0;
  let frame = 0;
  /** The block when this gesture's drag started (a Shift+press's own): given back if the drag is cancelled. */
  let before: CellRange | null = null;

  /**
   * A cell of this grid under an event's target — the body's, or a pinned band's (step 8b-2); none for a field or a widget
   * drawn in it, a detail, a nested grid, the tree's pinned copies.
   */
  const cellOf = (t: EventTarget | null): CellAddr | null => {
    const x = t as Element;
    const c = x.closest?.<HTMLElement>('.dzg-cell');
    const row = c?.closest('.dzg-row');
    // A nested grid's row has no key here (another renderer's): its presses are its own; nor a tree's copy (not a peer).
    const key = row && rowRenderer.keyOf(row);
    const w = x.closest('input, textarea, select, button, a[href], [contenteditable], [tabindex]:not(.dzg-cell)');
    return key && !(w && c!.contains(w)) ? { row: key, column: c!.dataset['col']! } : null;
  };
  /** The block follows the pointer; the first move off the pressed cell starts the drag. */
  const track = (): void => {
    // Inside the anchor's band when it is a pinned row's (O8: never across its edge).
    const a = last && anchor && cellAt(g, last, 0, anchor.row);
    if (!a || !press || !anchor) return;
    if (!ranging) {
      if (same(a, press)) return;
      ranging = true;
      setAttr(el.root, 'data-dzg-ranging', '');
      try {
        el.body.setPointerCapture?.(id);
      } catch {
        // Already released (the button up before this move arrived): the document's events still come.
      }
      win?.getSelection?.()?.removeAllRanges();
    }
    sel.set({ anchor, focus: a }, 'user', false);
    if (!frame && raf) frame = raf.requestAnimationFrame(step);
  };
  /** One frame of the auto-scroll: speeds from the depth into the bands, the corner again; stops when nothing moved. */
  const step = (): void => {
    frame = 0;
    if (ranging && last && autoScroll(g, last, anchor?.row)) track();
  };
  /**
   * The gesture ends: the frames and the capture let go. Released (`up`): the focus to the moving corner, its size said,
   * the click of this same task swallowed. Cancelled (`pointercancel`, a lost capture, blur): the block from before the drag
   * given back, quietly — no focus move, no swallow, no sentence (review 2).
   */
  const end = (up?: boolean, keep?: boolean): void => {
    const was = ranging;
    press = anchor = null;
    ranging = false;
    if (frame) raf!.cancelAnimationFrame(frame), (frame = 0);
    if (!was) return;
    setAttr(el.root, 'data-dzg-ranging', null);
    // Painted again: the handle comes back on the far corner (the focus, on the anchor, may not move; S12-Q15).
    g.schedule();
    if (!up) return void (keep || sel.set(before, 'user', false));
    const r = sel.r;
    if (!r) return;
    // The browser's click after the release comes in this same task; a later one (a key, a reader) is a click (review 1).
    swallow = true;
    scope.timeout(() => (swallow = false), 0);
    sel.follows = true;
    sel.say();
  };

  // On the view: the body's cells and the pinned bands' (siblings of the body, step 8b-2).
  scope.on(el.viewport, 'pointerdown', (e: PointerEvent) => {
    swallow = false;
    // The mouse only: a finger and a pen scroll the view (a pen drag would scroll and select at once; review 2).
    const a = e.isPrimary && e.button === 0 && e.pointerType === 'mouse' ? cellOf(e.target) : null;
    if (!a) return;
    id = e.pointerId;
    last = e;
    press = a;
    if (e.shiftKey) {
      // From the anchor while the focus follows it, else from the focused cell (owner QB1, QB2).
      e.preventDefault();
      const f = g.kernel.focus;
      anchor = sel.r && sel.follows ? sel.r.anchor : f?.kind === 'cell' ? f : a;
      sel.set({ anchor, focus: a }, 'user');
      sel.follows = true;
      sel.focusTo(a);
    } else {
      // A press without Shift drops the block (a click elsewhere, or on it).
      sel.drop('user');
      anchor = a;
    }
    before = sel.r;
    if (!drag) press = null;
  });
  // Shift+press: no native focus, no text selection.
  scope.on(el.viewport, 'mousedown', (e: MouseEvent) => void (e.shiftKey && cellOf(e.target) && e.preventDefault()));
  scope.on(doc, 'pointermove', (e) => {
    const p = e as PointerEvent;
    if (!press || p.pointerId !== id) return;
    last = p;
    track();
  });
  // This gesture's pointer only (review 3); a capture lost without its release, a blur: cancelled.
  const mine = (e: Event): boolean => (e as PointerEvent).pointerId === id;
  // The release point counts (a release with no move before it, owner 2026-10-26): the corner taken there, then the end.
  scope.on(doc, 'pointerup', (e) => void (mine(e) && (ranging && ((last = e as PointerEvent), track()), end(true))));
  scope.on(doc, 'pointercancel', (e) => void (mine(e) && end()));
  scope.on(el.body, 'lostpointercapture', (e) => void (mine(e) && end()));
  if (win) scope.on(win, 'blur', () => end());
  // The click a drag ends with is not a click on a cell (no row selected, no cellClicked): swallowed once.
  scope.on(el.viewport, 'click', (e: MouseEvent) => {
    if (!swallow) return;
    swallow = false;
    e.stopPropagation();
    e.preventDefault();
  }, { capture: true });

  // Escape and the grid's end: the drag stops, its block kept (Escape then drops it, said).
  return { stop: () => end(false, true) };
}
