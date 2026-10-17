import { inlineScroll, setInlineScroll, scrollConvention, type Dir } from '../dir.js';

/** What the grid reads of its viewport, in one place: block and inline sizes of the visible body area, and the logical scroll. */
export interface ViewportBox {
  /** Visible height below the header. */
  readonly block: number;
  /** Visible width, pinned segments included. */
  readonly inline: number;
  readonly scrollTop: number;
  /** From the start edge, whatever the direction. */
  readonly scrollInline: number;
  /** The root font size: rows follow text zoom (WCAG 1.4.4). 16 when absent. */
  readonly remPx?: number;
}

/**
 * The geometry port (D12): the only reads and scroll writes the grid makes.
 * jsdom has no layout, so tests pass a fake; the browser gets `domGeometry`.
 */
export interface Geometry {
  read(): ViewportBox;
  writeScrollTop(px: number): void;
  writeScrollInline(px: number): void;
}

export function domGeometry(viewport: HTMLElement, header: HTMLElement, dir: () => Dir): Geometry {
  const conv = () => scrollConvention(viewport.ownerDocument);
  return {
    read: () => ({
      block: Math.max(0, viewport.clientHeight - header.offsetHeight),
      inline: viewport.clientWidth,
      scrollTop: viewport.scrollTop,
      scrollInline: inlineScroll(viewport, dir(), conv()),
      remPx: parseFloat(viewport.ownerDocument.defaultView?.getComputedStyle(viewport.ownerDocument.documentElement).fontSize ?? '') || 16,
    }),
    writeScrollTop: (px) => { viewport.scrollTop = px; },
    writeScrollInline: (px) => setInlineScroll(viewport, px, dir(), conv()),
  };
}
