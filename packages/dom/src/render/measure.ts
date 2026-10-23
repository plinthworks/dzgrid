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
  /** The browser's default text size (`font-size: medium`, never the page's root size): rows follow the reader's text size (WCAG 1.4.4). 16 when absent. */
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

/** `probe` (the grid's live region) is set to `font-size: medium`: the browser's default text size is read off it, never the page's root size (an app's 62.5 %). */
export function domGeometry(viewport: HTMLElement, header: HTMLElement, dir: () => Dir, probe: Element = viewport): Geometry {
  const conv = () => scrollConvention(viewport.ownerDocument);
  if (probe !== viewport) (probe as HTMLElement).style.fontSize = 'medium';
  return {
    read: () => ({
      block: Math.max(0, viewport.clientHeight - header.offsetHeight),
      inline: viewport.clientWidth,
      scrollTop: viewport.scrollTop,
      scrollInline: inlineScroll(viewport, dir(), conv()),
      remPx: parseFloat(viewport.ownerDocument.defaultView?.getComputedStyle(probe).fontSize ?? '') || 16,
    }),
    writeScrollTop: (px) => { viewport.scrollTop = px; },
    writeScrollInline: (px) => setInlineScroll(viewport, px, dir(), conv()),
  };
}
