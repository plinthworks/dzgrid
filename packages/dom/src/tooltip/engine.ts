import { setAttr } from '../render/write.js';
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
/** The ready-made shapes, drawn by tooltips.css. */
const NAMED = /^(bubble|ticket|pill)$/;

/**
 * The bubble's shape (owner 2026-11-14): a ready-made one (`bubble`, `ticket`, `pill`) is `data-shape` with its name,
 * drawn by tooltips.css; an app's (for morphing) an `<svg class="dzg-tip-shape">` first in the bubble, its `<path>` drawn
 * from the path data in a 100 × 100 box stretched over it, `data-shape` empty (tooltips.css then draws no box nor
 * arrow). None, or neither: removed, the box back.
 */
export function shapeOf(el: HTMLElement, shape: string | undefined): SVGPathElement | null {
  let svg = el.querySelector<SVGSVGElement>(':scope > svg.dzg-tip-shape');
  const named = !!shape && NAMED.test(shape);
  const d = !named && shape && PATH.test(shape) ? shape : null;
  setAttr(el, 'data-shape', named ? shape! : d ? '' : null);
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

/** The variables (and width) written on each bubble, taken off at its next dressing. */
const worn = new WeakMap<HTMLElement, string[]>();

/**
 * Dresses a bubble before it is measured (tooltips-popovers.md 7, 20–23): its preset (`custom` while the app animates
 * it), its shape, and its own variables — the look's, then the column's or the cell's over them (`tip`); only custom
 * properties are written; `maxWidth` its widest.
 */
export function dress(el: HTMLElement, look: TipLook, tip: Partial<TipLook> = {}): void {
  setAttr(el, 'data-animation', look.animate ? 'custom' : tip.animation ?? look.animation ?? null);
  shapeOf(el, tip.shape ?? look.shape);
  for (const k of worn.get(el) ?? []) el.style.removeProperty(k);
  const w = tip.maxWidth ?? look.maxWidth;
  const put = Object.entries({ ...look.style, ...tip.style }).filter(([k]) => k.startsWith('--'));
  if (w != null) put.push(['max-inline-size', typeof w == 'number' ? `${w}px` : w]);
  for (const [k, v] of put) el.style.setProperty(k, v);
  worn.set(el, put.map(([k]) => k));
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

/** The tooltip on screen in the page (3): showing another hides it. */
let shown: Tooltip | null = null;
/** A grid destroyed: its tooltip no longer the page's (nothing kept of it). */
export const forget = (t: Tooltip): void => void (shown === t && (shown = null));

/**
 * Gives a base bubble the opt-in behaviour: its placement (`auto` meaning `auto`), the app's animation, the awaited
 * closing, one at a time in the page.
 */
export function enhance(t: Tooltip, auto: 'bottom' | 'bottom-start', report: (e: unknown) => void): void {
  // Dressed before it is measured: its shape and width count (a column's look over the grid's).
  t.at = (tip, dir) => (dress(t.el, t.look(), tip as Partial<TipLook>), [...placementOf(tip.placement ?? t.look().placement, dir, auto), t.look().flip !== false]);
  // A column's own hover delay (a keyboard focus stays at once).
  const showFor = t.showFor.bind(t);
  t.showFor = (a, tip, dir, delay) => showFor(a, tip, dir, delay > 0 ? tip.delayMs ?? delay : delay);
  t.close = (el, look, done) => {
    if (shown === t) shown = null;
    return conceal(el, look, done, report);
  };
  // An opening: it was not the one on screen (a closing forgets it; moving to another anchor is no opening).
  t.onShow = (me) => {
    if (shown === me) return;
    shown?.hide();
    shown = me;
    play(me.el, me.look(), 'open', report);
  };
}
