import type { Scope } from './render/scope.js';

/**
 * The one file that names physical sides (guard `physical`). Everything else
 * in the DOM layer speaks of start and end; this turns the browser's left,
 * right and `scrollLeft` into those, for both directions.
 */
export type Dir = 'ltr' | 'rtl';

/**
 * How `scrollLeft` counts in right to left: `negative` (the standard: 0 at the
 * start, down to −max), `reverse` (0 at the start, up to +max), `default`
 * (+max at the start, down to 0; Chrome before 85).
 */
export type ScrollConvention = 'negative' | 'reverse' | 'default';

const conventions = new WeakMap<Document, ScrollConvention>();

/**
 * Read once per document with a 1-px probe. A probe that cannot scroll (no
 * layout yet: a hidden frame, jsdom) reads as the standard and is asked again
 * next time.
 */
export function scrollConvention(doc: Document): ScrollConvention {
  const known = conventions.get(doc);
  if (known) return known;
  const probe = doc.createElement('div');
  probe.dir = 'rtl';
  probe.style.cssText = 'position:absolute;inline-size:2px;block-size:1px;overflow:scroll;visibility:hidden;inset-block-start:-9px';
  const inner = doc.createElement('div');
  inner.style.cssText = 'inline-size:4px;block-size:1px';
  probe.append(inner);
  const parent = doc.body ?? doc.documentElement;
  if (!parent) return 'negative';
  parent.append(probe);
  let conv: ScrollConvention = 'negative';
  const measured = probe.scrollWidth > probe.clientWidth;
  if (measured) {
    if (probe.scrollLeft > 0) conv = 'default';
    else {
      probe.scrollLeft = -1;
      conv = probe.scrollLeft < 0 ? 'negative' : 'reverse';
    }
  }
  probe.remove();
  if (measured) conventions.set(doc, conv);
  return conv;
}

const maxInline = (el: HTMLElement): number => Math.max(0, el.scrollWidth - el.clientWidth);

/** How far the view is from its start edge, 0..max, in either direction. */
export function inlineScroll(el: HTMLElement, dir: Dir, conv: ScrollConvention): number {
  const raw = el.scrollLeft;
  const max = maxInline(el);
  const x = dir === 'ltr' || conv === 'reverse' ? raw : conv === 'negative' ? -raw : max - raw;
  // Elastic overscroll and zoom report a little past the ends: a column index must not follow.
  return x > 0 ? Math.min(max, x) : 0;
}

export function setInlineScroll(el: HTMLElement, x: number, dir: Dir, conv: ScrollConvention): void {
  const max = maxInline(el);
  const v = Number.isNaN(x) ? 0 : Math.max(0, Math.min(max, x));
  el.scrollLeft = dir === 'ltr' || conv === 'reverse' ? v : conv === 'negative' ? -v : max - v;
}

/** A pointer's distance from the start edge of `rect`. */
export function logicalX(e: { readonly clientX: number }, rect: DOMRectReadOnly, dir: Dir): number {
  return dir === 'ltr' ? e.clientX - rect.left : rect.right - e.clientX;
}

/** A box's start and end edges, measured from the start edge of `ref`. */
export function logicalSpan(box: DOMRectReadOnly, ref: DOMRectReadOnly, dir: Dir): { start: number; end: number } {
  return dir === 'ltr' ? { start: box.left - ref.left, end: box.right - ref.left } : { start: ref.right - box.right, end: ref.right - box.left };
}

/**
 * Whether a pointer is on one of `el`'s scrollbars (D5: a scrollbar drag maps
 * absolutely). The vertical one is found by its side, not assumed: engines put
 * it at the left in right to left, and `clientLeft` then counts it.
 */
export function isOnScrollbar(e: { readonly clientX: number; readonly clientY: number }, el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
  const px = (v: string | undefined) => (v ? parseFloat(v) || 0 : 0);
  const bl = px(cs?.borderLeftWidth), br = px(cs?.borderRightWidth), bt = px(cs?.borderTopWidth), bb = px(cs?.borderBottomWidth);
  // A bar is what is left of the box once the content and the borders are taken out.
  const vBar = el.offsetWidth - el.clientWidth - bl - br;
  const hBar = el.offsetHeight - el.clientHeight - bt - bb;
  const innerTop = r.top + el.clientTop;
  if (hBar > 0.5 && e.clientY >= innerTop + el.clientHeight && e.clientY < r.bottom - bb) return true;
  if (vBar <= 0.5) return false;
  const barOnLeft = el.clientLeft > bl + 0.5;
  const innerLeft = r.left + el.clientLeft;
  if (barOnLeft) return e.clientX >= r.left + bl && e.clientX < innerLeft;
  return e.clientX >= innerLeft + el.clientWidth && e.clientX < r.right - br;
}

/**
 * The direction `host` resolves to, and a watch on it. The computed
 * `direction` is the truth when the browser has one (CSS can set it without
 * an attribute); the nearest `dir` attribute otherwise (jsdom, a detached
 * host). A `dir` change anywhere in the document, or in the shadow roots
 * between it and the host, calls `onChange`. `recheck()` reads again after a
 * move (the grid calls it on `update()` and on resize).
 */
export function watchDirection(host: HTMLElement, onChange: (d: Dir) => void, scope: Scope): { readonly dir: Dir; recheck(): void } {
  const fromAttr = (): Dir | null => {
    for (let n: Node | null = host; n; ) {
      if (n instanceof host.ownerDocument.defaultView!.Element) {
        const v = n.getAttribute('dir')?.toLowerCase();
        if (v === 'rtl' || v === 'ltr') return v;
      }
      const parent: Node | null = n.parentNode;
      n = parent && parent.nodeType === 11 ? (parent as ShadowRoot).host : parent;
    }
    return null;
  };
  const read = (): Dir => {
    const cs = host.isConnected ? host.ownerDocument.defaultView?.getComputedStyle(host).direction : '';
    // jsdom computes 'ltr' for everything: an attribute that says otherwise wins there.
    const attr = fromAttr();
    if (cs === 'rtl') return 'rtl';
    if (cs === 'ltr' && attr !== 'rtl') return 'ltr';
    return attr ?? 'ltr';
  };
  let current = read();
  const recheck = (): void => {
    const next = read();
    if (next !== current) {
      current = next;
      onChange(next);
    }
  };
  const Observer = host.ownerDocument.defaultView?.MutationObserver;
  if (Observer) {
    const mo = new Observer(recheck);
    const opts = { attributes: true, attributeFilter: ['dir'], subtree: true };
    mo.observe(host.ownerDocument.documentElement, opts);
    for (let root = host.getRootNode(); root.nodeType === 11; root = (root as ShadowRoot).host.getRootNode()) {
      mo.observe(root, opts);
      mo.observe((root as ShadowRoot).host, { attributes: true, attributeFilter: ['dir'] });
    }
    scope.observe(mo);
  }
  return {
    get dir() {
      return current;
    },
    recheck,
  };
}

/** A wheel's inline distance, logically: toward the end is positive in either direction. */
export function wheelInline(e: { readonly deltaX: number; readonly deltaMode: number }, dir: Dir, line: number, page: number): number {
  const d = e.deltaX * (e.deltaMode === 1 ? line : e.deltaMode === 2 ? page : 1);
  return dir === 'rtl' ? -d : d;
}

/**
 * Where a fixed box goes so that its start edge lines up with `anchor`'s, for
 * `inset-inline-start` in the box's direction; clamped to the window.
 */
export function fixedInlineStart(anchor: DOMRectReadOnly, dir: Dir, windowInline: number, boxInline: number): number {
  const start = dir === 'ltr' ? anchor.left : windowInline - anchor.right;
  return Math.max(0, Math.min(start, windowInline - boxInline));
}
