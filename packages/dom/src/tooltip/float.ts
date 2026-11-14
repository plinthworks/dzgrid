import { Scope } from '../render/scope.js';
import type { TipSide } from '../render/tooltip.js';
import type { Dir } from '../dir.js';
import { safeHtml } from './html.js';

/**
 * What a page's tooltip or popover shows (tooltips-popovers.md 9, 15, 16): words; nodes; HTML, cleaned; or a function
 * called at each opening, which may say what to do when its content goes (`gone`: a component destroyed).
 */
export type TipContent = string | Node | { readonly html: string } | (() => string | Node | { readonly node: Node; readonly gone?: () => void });

/** The page's bubbles' own layout (no grid needed): fixed, the top layer's defaults undone; a popover's plain look. */
const FLOAT_CSS =
    // The grid's colour scheme (tooltips-popovers.md 19): `light-dark()` and the system colours resolve as the grid's.
  '@layer dzgrid.layout{:where(.dzg-float){position:fixed;margin:0;z-index:10;box-sizing:border-box;color-scheme:var(--tz-color-scheme,light dark)}' +
  ':where(.dzg-float[popover]){inset:auto;overflow:visible;border:0;padding:0;background:transparent;color:inherit}' +
  ':where(.dzg-popover){max-inline-size:min(32rem,calc(100vw - 16px));padding:var(--dzg-popover-padding,.75rem);border:1px solid var(--dzg-popover-border,var(--tz-border,GrayText));' +
  'border-radius:var(--dzg-popover-radius,var(--dzg-radius,.375rem));background:var(--dzg-popover-bg,var(--tz-bg,Canvas));color:var(--dzg-popover-fg,var(--tz-fg,CanvasText))}' +
  // A tall content scrolls in its body, kept inside the window.
  ':where(.dzg-popover-body){max-block-size:var(--dzg-popover-max-height,calc(100vh - 32px));overflow:auto;overscroll-behavior:contain}}';

/** Once per document: the layout above, with the page's nonce when it has a strict policy. */
export function floatStyles(doc: Document, nonce?: string): void {
  if (doc.querySelector('style[data-dzgrid-float]')) return;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid-float', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = FLOAT_CSS;
  doc.head.append(style);
}

/**
 * The anchor's context's scheme (tooltips-popovers.md 19): the bubble, at the page's end, inherits the page's; a
 * wrapper's own `--tz-color-scheme` (a `data-theme`, a class, a grid's host) is written on it at each opening.
 */
export function schemeOf(bubble: HTMLElement, anchor: Element): void {
  const v = (e: Element | null): string => (e ? getComputedStyle(e).getPropertyValue('--tz-color-scheme').trim() : '');
  const s = v(anchor);
  if (s && s !== v(bubble.parentElement)) bubble.style.setProperty('--tz-color-scheme', s);
  else bubble.style.removeProperty('--tz-color-scheme');
}

/**
 * A show at the end of its delay is still wanted (tooltips-popovers.md 18): its anchor not disabled, neither an open
 * popover's trigger nor holding one (a grid's cell) — a tooltip never over its own popover.
 */
export const wanted = (a: Element): boolean => !a.matches(`:disabled,${OPEN}`) && !a.querySelector(OPEN);
const OPEN = '[aria-controls^=dzg-pop-]';

/** The reading direction at an element (its computed `direction`; the nearest `dir` where there is no layout). */
export function dirAt(el: Element): Dir {
  const cs = el.ownerDocument.defaultView?.getComputedStyle(el).direction;
  if (cs === 'rtl') return 'rtl';
  return el.closest('[dir]')?.getAttribute('dir')?.toLowerCase() === 'rtl' ? 'rtl' : 'ltr';
}

/** A content made into nodes for one opening: its words (what a screen reader hears), its node, what to do when it goes. */
export function drawn(c: TipContent, doc: Document): { text: string; node: Node | null; gone?: () => void } {
  const v = typeof c === 'function' ? c() : c;
  if (typeof v === 'string') return { text: v, node: null };
  if ('nodeType' in v) return { text: v.textContent ?? '', node: v };
  if ('html' in v) {
    const f = safeHtml(v.html, doc);
    return { text: f.textContent ?? '', node: f };
  }
  return { text: v.node.textContent ?? '', node: v.node, ...(v.gone && { gone: v.gone }) };
}

/** Per document: the time of the last key (a focus right after one is a keyboard focus), and Escape's listeners. */
const docs = new WeakMap<Document, { keyAt: number; scope: Scope; escape: Set<() => void> }>();
export function pageOf(doc: Document): { keyAt: number; scope: Scope; escape: Set<() => void> } {
  let p = docs.get(doc);
  if (p) return p;
  const scope = new Scope();
  const q = { keyAt: -1e9, scope, escape: new Set<() => void>() };
  docs.set(doc, (p = q));
  const now = (): number => doc.defaultView?.performance.now() ?? 0;
  scope.on(doc, 'keydown', (e: Event) => {
    q.keyAt = now();
    if ((e as KeyboardEvent).key === 'Escape') for (const f of [...q.escape]) f();
  }, { capture: true });
  scope.on(doc, 'pointerdown', () => void (q.keyAt = -1e9), { capture: true });
  return p;
}
export const keyed = (doc: Document): boolean => (doc.defaultView?.performance.now() ?? 0) - pageOf(doc).keyAt < 1000;

export type { TipSide };
