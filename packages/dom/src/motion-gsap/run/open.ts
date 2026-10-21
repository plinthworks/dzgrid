import type { GridContext } from '../../context.js';
import type { Guard } from './guard.js';
import type { Scene } from './index.js';

/**
 * Popups opening and the overlay appearing fade in (owner Q2), seen by an observer on the grid's
 * root: the popup host has placed it and moved the focus already; the motion never touches the
 * focus. A popup closes at once (an exit tween would delay its removal and the focus return); one
 * removed mid-tween is finished. The overlay is never delayed: `hidden` stays the truth.
 */
export function opening(g: GridContext<unknown>, guard: Guard, scene: () => Scene | null): () => void {
  const Observer = (g.win as (Window & { MutationObserver?: typeof MutationObserver }) | null)?.MutationObserver;
  if (!Observer) return () => {};
  const { root, overlay } = g.el;
  // Once per popup. Its content moves, not the popup: GSAP reads the transform of an element without
  // an offset parent (a fixed one) by moving it out and back, which would close a popover and blur it.
  const seen = new WeakSet<Node>();
  const mo = new Observer((list) => {
    const s = scene();
    for (const r of list) {
      for (const n of r.removedNodes) {
        const c = (n as Element).firstElementChild as HTMLElement | null | undefined;
        if (!n.isConnected && c && guard.has(c)) guard.finish(c);
      }
      if (!s) continue;
      if (r.target === overlay) !overlay.hidden && s.play(overlay, () => !overlay.hidden, { opacity: 0 }, { opacity: 1, duration: 0.14 });
      else
        for (const n of r.addedNodes) {
          const c = (n as Element).classList?.contains('dzg-popup') && !seen.has(n) && (seen.add(n), (n as Element).firstElementChild);
          if (c && 'style' in c) s.play(c as HTMLElement, () => c.isConnected, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.14 });
        }
    }
  });
  mo.observe(root, { childList: true });
  mo.observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
  return () => mo.disconnect();
}
