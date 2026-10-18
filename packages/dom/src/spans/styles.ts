/**
 * The layout of spanned cells (spike S12), injected by the spans feature, not
 * the base: a grid without it carries none. Same rules as `LAYOUT_CSS`: no
 * colour, logical sides only, zero specificity.
 *
 * - The body is its own stacking context: the rows hosting tall cells in a
 *   pinned segment raise that segment (by rank, the earliest highest, so a tall
 *   cell paints over the rows it covers), and the header stays above them all.
 * - A row a tall cell starts in or covers (`data-spans`) contains style only,
 *   never paint (a tall cell overflows its row); its pinned cells are placed by
 *   the feature (a covered slot leaves no hole in the flow).
 * - A tall cell clips (`overflow: clip`, which keeps it from being a scroller),
 *   so its label, sticky between the header and the view's end, travels with
 *   the scroll on a long merge; the ellipsis is the label's. The label stands
 *   after a spacer (`::before`, `--dzg-span-at`) that puts it at the span's
 *   centre: a margin would stop it sticking at the bottom.
 * - Tall cells are transparent: each covered row's colour (the theme paints
 *   rows and pinned segments) shows through, row by row.
 * - A full-width row: the segments step aside, its one cell sticks at the
 *   start, as wide as the view; the selection box stays.
 */
export const SPANS_CSS =
  ':where(.dzg-body){isolation:isolate}' +
  ':where([data-spans]){contain:style}' +
  ':where([data-spans]>.dzg-seg-start>.dzg-cell,[data-spans]>.dzg-seg-end>.dzg-cell){position:absolute;inset-block:0}' +
  ':where(.dzg-cell[aria-rowspan]){overflow:clip;z-index:1}' +
  ':where(.dzg-cell[aria-rowspan])::before{content:"";display:block;block-size:var(--dzg-span-at)}' +
  ':where(.dzg-span-label){position:sticky;inset-block:var(--dzg-header-h) 0;line-height:var(--dzg-row-height);overflow:hidden;text-overflow:ellipsis;text-align:center}' +
  ':where([data-full]>.dzg-seg){display:contents}' +
  ':where([data-full] .dzg-check){position:sticky;inset-inline-start:0;z-index:2}' +
  ':where([data-full] .dzg-cell){position:sticky;inset-inline-start:var(--dzg-check-w)!important;inline-size:calc(var(--dzg-view-w,100%) - var(--dzg-check-w))!important}';

/** Once per document or shadow root, like the base's; a host with a strict CSP passes its nonce or loads it itself. */
export function injectSpanStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (target.querySelector('style[data-dzgrid-spans]')) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid-spans', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = SPANS_CSS;
  ('head' in target ? target.head : target).append(style);
}
