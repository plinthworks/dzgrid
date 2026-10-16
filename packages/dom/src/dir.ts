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

/** Read once per document with a 1-px probe. A probe that cannot scroll (no layout) reads as the standard. */
export function scrollConvention(doc: Document): ScrollConvention {
  const known = conventions.get(doc);
  if (known) return known;
  const probe = doc.createElement('div');
  probe.dir = 'rtl';
  probe.style.cssText = 'position:absolute;inline-size:2px;block-size:1px;overflow:scroll;visibility:hidden;inset-block-start:-9px';
  const inner = doc.createElement('div');
  inner.style.cssText = 'inline-size:4px;block-size:1px';
  probe.append(inner);
  doc.body.append(probe);
  let conv: ScrollConvention = 'negative';
  if (probe.scrollWidth > probe.clientWidth) {
    if (probe.scrollLeft > 0) conv = 'default';
    else {
      probe.scrollLeft = -1;
      conv = probe.scrollLeft < 0 ? 'negative' : 'reverse';
    }
  }
  probe.remove();
  conventions.set(doc, conv);
  return conv;
}

const maxInline = (el: HTMLElement): number => Math.max(0, el.scrollWidth - el.clientWidth);

/** How far the view is from its start edge, 0..max, in either direction. */
export function inlineScroll(el: HTMLElement, dir: Dir, conv: ScrollConvention): number {
  const raw = el.scrollLeft;
  if (dir === 'ltr') return raw;
  if (conv === 'negative') return -raw === 0 ? 0 : -raw;
  if (conv === 'reverse') return raw;
  return maxInline(el) - raw;
}

export function setInlineScroll(el: HTMLElement, x: number, dir: Dir, conv: ScrollConvention): void {
  const max = maxInline(el);
  const v = Math.max(0, Math.min(max, Number.isFinite(x) ? x : 0));
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
  const borderL = cs ? parseFloat(cs.borderLeftWidth) || 0 : 0;
  const innerLeft = r.left + el.clientLeft;
  const innerRight = innerLeft + el.clientWidth;
  const innerBottom = r.top + el.clientTop + el.clientHeight;
  const barOnLeft = el.clientLeft > borderL + 0.5;
  if (e.clientY >= innerBottom && e.clientY < r.bottom) return true;
  if (barOnLeft) return e.clientX >= r.left + borderL && e.clientX < innerLeft;
  return e.clientX >= innerRight && e.clientX < r.right;
}

/**
 * The direction `host` resolves to, and a watch on it: a change of `dir` on
 * the host or any ancestor calls `onChange` with the new direction, until the
 * scope is disposed.
 */
export function watchDirection(host: HTMLElement, onChange: (d: Dir) => void, scope: Scope): Dir {
  const read = (): Dir => {
    const set = host.closest('[dir]')?.getAttribute('dir');
    if (set === 'rtl' || set === 'ltr') return set;
    const cs = host.ownerDocument.defaultView?.getComputedStyle(host).direction;
    return cs === 'rtl' ? 'rtl' : 'ltr';
  };
  let current = read();
  const Observer = host.ownerDocument.defaultView?.MutationObserver;
  if (Observer) {
    const mo = new Observer(() => {
      const next = read();
      if (next !== current) {
        current = next;
        onChange(next);
      }
    });
    for (let n: Element | null = host; n; n = n.parentElement) mo.observe(n, { attributes: true, attributeFilter: ['dir'] });
    scope.observe(mo);
  }
  return current;
}
