import type { GridContext } from '../context.js';
import { isOnScrollbar, wheelInline } from '../dir.js';
import type { FocusControl } from '../keys/focus.js';

/**
 * The scroll events: the logical offset (S1, S11), the D4 correction of a
 * native scroll that follows a focus move, the wheel above the cap, the
 * scrollbar drag, and the speed the overscan follows.
 */
export function installScrolling<T>(g: GridContext<T>, focus: FocusControl<T>): void {
  const { el, scroll, scope, kernel, doc, win } = g;
  scope.on(el.viewport, 'scroll', () => {
    g.tip.hide();
    const moved = scroll.onScroll();
    const f = kernel.focus;
    // A native scroll right after a focus move or a grid key is the browser bringing the focused
    // element into view, physically: above the cap that is the wrong place, so the grid redoes it (S11, D4).
    if (moved && f?.kind === 'cell' && scroll.mapper?.scaled && g.now() - g.intentAt < 100 && el.viewport.contains(doc.activeElement)) focus.ensureVisible(f.row, f.column);
    g.schedule();
  }, { passive: true });

  // Above the cap the wheel is the grid's: the browser would move ratio times too far.
  scope.on(el.viewport, 'wheel', (e: WheelEvent) => {
    // Ctrl or Cmd with the wheel is a zoom (a trackpad pinch too): the page's, never a scroll.
    if (e.ctrlKey || e.metaKey) return;
    const box = g.geometry.read();
    const h = g.rowHeight();
    const page = Math.max(h, box.block - h);
    const block = e.deltaY * (e.deltaMode === 1 ? h : e.deltaMode === 2 ? page : 1);
    if (!scroll.onWheel(block)) return;
    e.preventDefault();
    const inline = wheelInline(e, g.dir, h, page);
    if (inline) g.geometry.writeScrollInline(box.scrollInline + inline);
    g.schedule();
  }, { passive: false });
  scope.on(el.viewport, 'pointerdown', (e: PointerEvent) => scroll.pointerDown(g.env.isOnScrollbar ? g.env.isOnScrollbar(e) : isOnScrollbar(e, el.viewport)));
  scope.on(doc, 'pointerup', () => scroll.pointerUp());
  scope.on(doc, 'pointercancel', () => scroll.pointerUp());
  // A drag can end outside the window, where no pointerup comes.
  if (win) scope.on(win, 'blur', () => scroll.pointerUp());

  // Scroll speed, for the overscan; a paint once scrolling stops trims back to the resting overscan.
  let lastTop = 0;
  let trim: (() => void) | null = null;
  scope.on(el.viewport, 'scroll', () => {
    const t = g.now();
    const dt = Math.max(1, t - g.scrolledAt);
    // A jump of several views is no gesture: the rows between are never seen, so no overscan for it.
    const moved = Math.abs(scroll.logicalTop - lastTop);
    g.speed = dt > 200 || moved > 3 * g.geometry.read().block ? 0 : (moved * 1000) / dt;
    lastTop = scroll.logicalTop;
    g.scrolledAt = t;
    trim?.();
    trim = scope.timeout(() => {
      trim = null;
      g.schedule();
    }, 160);
  }, { passive: true });
}
