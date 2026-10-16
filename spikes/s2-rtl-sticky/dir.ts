/**
 * The one place that names physical sides (left, right, scrollLeft, clientX).
 * Everything else in the spike works in logical coordinates: 0 = inline-start.
 *
 * ScrollX: the logical horizontal scroll position, 0 at inline-start, max at
 * inline-end, whatever sign convention the engine uses for `scrollLeft` in RTL.
 */
export type Dir = 'ltr' | 'rtl';

/**
 * How an engine reports `scrollLeft` on an RTL scroller:
 * - `negative`: 0 at the start (right edge), down to -max (CSSOM View, current engines);
 * - `reverse`:  0 at the start, up to +max (old Edge/IE);
 * - `default`:  +max at the start, down to 0 (Chrome before 85).
 */
export type ScrollConvention = 'negative' | 'reverse' | 'default';

let cached: ScrollConvention | undefined;

/** Detected once per document with a 1 px RTL probe; never per scroll. */
export function scrollConvention(doc: Document = document): ScrollConvention {
  if (cached) return cached;
  const probe = doc.createElement('div');
  probe.dir = 'rtl';
  probe.style.cssText = 'position:absolute;inset-block-start:-9999px;inline-size:4px;block-size:1px;overflow:scroll;visibility:hidden';
  const inner = doc.createElement('div');
  inner.style.cssText = 'inline-size:8px;block-size:1px';
  probe.appendChild(inner);
  doc.body.appendChild(probe);
  let conv: ScrollConvention;
  if (probe.scrollLeft > 0) conv = 'default';
  else {
    probe.scrollLeft = -1;
    conv = probe.scrollLeft < 0 ? 'negative' : 'reverse';
  }
  probe.remove();
  return (cached = conv);
}

export const maxScrollX = (el: Element): number => Math.max(0, el.scrollWidth - el.clientWidth);

/** Logical distance from inline-start, ≥ 0. */
export function readScrollX(el: Element, dir: Dir, conv = scrollConvention(el.ownerDocument)): number {
  const s = el.scrollLeft;
  if (dir === 'ltr') return s;
  if (conv === 'negative') return 0 - s;
  if (conv === 'reverse') return s;
  return maxScrollX(el) - s;
}

export function toPhysicalScrollLeft(el: Element, x: number, dir: Dir, conv = scrollConvention(el.ownerDocument)): number {
  const c = Math.min(Math.max(0, x), maxScrollX(el));
  if (dir === 'ltr') return c;
  if (conv === 'negative') return 0 - c;
  if (conv === 'reverse') return c;
  return maxScrollX(el) - c;
}

export function writeScrollX(el: Element, x: number, dir: Dir, conv = scrollConvention(el.ownerDocument)): void {
  el.scrollLeft = toPhysicalScrollLeft(el, x, dir, conv);
}

/** A pointer's logical x inside `rect` (cached at gesture start). */
export const logicalX = (clientX: number, rect: DOMRectReadOnly, dir: Dir): number =>
  dir === 'rtl' ? rect.right - clientX : clientX - rect.left;

/**
 * Physical client box of a scroller (border and scrollbar excluded). `clientLeft`
 * cannot say where the scrollbar is: WebKit leaves a left-side RTL scrollbar out of
 * it (S2), so the side is passed in (hit-tested by the caller).
 */
export function clientBox(el: HTMLElement, scrollbarOnLeft: boolean) {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  const bl = parseFloat(cs.borderLeftWidth), bt = parseFloat(cs.borderTopWidth);
  const left = r.left + bl + (scrollbarOnLeft ? el.offsetWidth - el.clientWidth - bl - parseFloat(cs.borderRightWidth) : 0);
  const top = r.top + bt;
  return { left, right: left + el.clientWidth, top, bottom: top + el.clientHeight };
}
