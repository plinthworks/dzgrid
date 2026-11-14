import { hideBubble, type TipLook, type TipSide, type TipTone, type Tooltip } from '../render/tooltip.js';
import { placementOf } from '../dir.js';

/**
 * What the opt-in entries add to the base's bubble (tooltips-popovers.md 3, 7; plan Q-T1 B): the app's own animation,
 * a closing that waits for the end of the fade (a part, a template or HTML stays drawn while it fades), and one
 * tooltip on screen at a time in a page. Shared by `tooltips()`, `tooltip()` and `popover()`.
 */

/** Path data only: commands, numbers, separators — no `url()`, no script, nothing that loads. */
const PATH = /^[MmLlHhVvCcSsQqTtAaZz\d.,\s+eE-]*$/;
const SVG = 'http://www.w3.org/2000/svg';

/**
 * The app's shape (owner 2026-11-14, for morphing): an `<svg class="dzg-tip-shape">` first in the bubble, its `<path>`
 * drawn from `look.shape` in a 100 × 100 box stretched over it; `data-shape` on the bubble (tooltips.css then draws no
 * box nor arrow). None, or not path data: removed, the box back.
 */
export function shapeOf(el: HTMLElement, look: TipLook): SVGPathElement | null {
  let svg = el.querySelector<SVGSVGElement>(':scope > svg.dzg-tip-shape');
  const d = look.shape && PATH.test(look.shape) ? look.shape : null;
  el.toggleAttribute('data-shape', !!d);
  if (!d) return svg?.remove(), null;
  if (!svg) {
    svg = el.ownerDocument.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'dzg-tip-shape');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.append(el.ownerDocument.createElementNS(SVG, 'path'));
  }
  if (el.firstChild !== svg) el.prepend(svg);
  const path = svg.firstChild as SVGPathElement;
  if (path.getAttribute('d') !== d) path.setAttribute('d', d);
  return path;
}

/** The app's animation for a phase (D-4), when given (never on a grid with `motion: false`); what it returns. A throw is reported. */
export function play(el: HTMLElement, look: TipLook, phase: 'open' | 'close', report: (e: unknown) => void): unknown {
  if (!look.animate || el.closest('[data-motion=off]')) return;
  try {
    return look.animate(el, phase, {
      side: el.dataset['side'] as TipSide,
      tone: (el.dataset['tone'] ?? 'info') as TipTone,
      dir: getComputedStyle(el).direction === 'rtl' || el.closest('[dir=rtl]') ? 'rtl' : 'ltr',
      reduced: !!el.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      shape: el.querySelector<SVGPathElement>(':scope > svg.dzg-tip-shape > path'),
    });
  } catch (err) {
    report(err);
  }
}

/**
 * Hides a bubble with its closing: the app's `animate(el, 'close')` first (hidden when what it returns settles), then
 * `data-closing` — the CSS closing runs on it while the bubble is still drawn and in the top layer, in every engine
 * (Firefox and Safari do not keep a bubble drawn through `display: none`) — and, once that closing's animations have
 * finished, `hidden`, out of the top layer, and `done`. Returns a cancel: a bubble shown again before the end stays.
 */
export function conceal(el: HTMLElement, look: TipLook, done: () => void, report: (e: unknown) => void): () => void {
  let live = true;
  const fin = (): void => {
    if (!live) return;
    el.removeAttribute('data-closing');
    hideBubble(el);
    done();
  };
  const end = (): void => {
    if (!live) return;
    el.setAttribute('data-closing', '');
    const a = el.getAnimations?.() ?? [];
    if (a.length) void Promise.all(a.map((x) => x.finished)).then(fin, fin);
    else fin();
  };
  // A promise (its failure reported, then hidden) or a GSAP tween (one callback).
  const w = play(el, look, 'close', report) as PromiseLike<unknown> | undefined;
  if (typeof w?.then === 'function') w.then(end, (err: unknown) => (report(err), end()));
  else end();
  return () => {
    live = false;
    el.removeAttribute('data-closing');
  };
}

/** The app's own animation turns the CSS presets off. */
export const custom = (el: HTMLElement, look: TipLook): void => void (look.animate && el.setAttribute('data-animation', 'custom'));

/** The tooltip on screen in the page (3): showing another hides it. */
let shown: Tooltip | null = null;

/**
 * Gives a base bubble the opt-in behaviour: its placement (`auto` meaning `auto`), the app's animation, the awaited
 * closing, one at a time in the page.
 */
export function enhance(t: Tooltip, auto: 'bottom' | 'bottom-start', report: (e: unknown) => void): void {
  t.at = (tip, dir) => [...placementOf(tip.placement ?? t.look().placement, dir, auto), t.look().flip !== false];
  t.close = (el, look, done) => {
    if (shown === t) shown = null;
    return conceal(el, look, done, report);
  };
  // An opening: it was not the one on screen (a closing forgets it; moving to another anchor is no opening).
  t.onShow = (me) => {
    custom(me.el, me.look());
    shapeOf(me.el, me.look());
    if (shown === me) return;
    shown?.hide();
    shown = me;
    play(me.el, me.look(), 'open', report);
  };
}
