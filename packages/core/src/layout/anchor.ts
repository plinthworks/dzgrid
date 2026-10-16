import type { DisplayIndex } from '../ids.js';
import type { RowLayout } from './rows.js';

/**
 * What must not move when row heights change above it (S3): the first visible
 * row already measured, by how far it is scrolled into — or, at the very
 * bottom, the end of the list, so the last row stays at the bottom while rows
 * above get measured.
 */
export type ScrollAnchor =
  | { readonly kind: 'row'; readonly index: DisplayIndex; readonly delta: number }
  | { readonly kind: 'end' };

export function anchorFor(layout: RowLayout, scrollTop: number, viewBlock: number, isMeasured: (i: DisplayIndex) => boolean): ScrollAnchor | null {
  if (layout.count === 0) return null;
  if (scrollTop > 0 && scrollTop + viewBlock >= layout.total - 1) return { kind: 'end' };
  const first = layout.indexAt(scrollTop);
  const lastVisible = layout.indexAt(scrollTop + viewBlock);
  for (let i = first; i <= lastVisible; i++) {
    const idx = i as DisplayIndex;
    if (isMeasured(idx)) {
      // A measured row fully below the top keeps its distance as a negative delta.
      return { kind: 'row', index: idx, delta: scrollTop - layout.offsetOf(idx) };
    }
  }
  return { kind: 'row', index: first, delta: scrollTop - layout.offsetOf(first) };
}

/** The scroll position that puts the anchor back where it was. */
export function scrollTopFor(anchor: ScrollAnchor, layout: RowLayout, viewBlock: number): number {
  if (anchor.kind === 'end') return Math.max(0, layout.total - viewBlock);
  return Math.max(0, layout.offsetOf(anchor.index) + anchor.delta);
}
