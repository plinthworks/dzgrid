/**
 * The layout the grid cannot work without, injected once per document. No
 * colour (the theme's), no physical side (logical properties only), zero
 * specificity (`:where`), so a host's stylesheet always wins.
 *
 * Rows take `contain: content`, never `strict`: size containment drops the
 * sticky pinned segments in Firefox (S11). The body clips, so a row kept
 * mounted far from view never grows the scroll range (S11).
 */
export const LAYOUT_CSS = `
:where(.dzg) { position: relative; display: flex; flex-direction: column; min-block-size: 0; min-inline-size: 0; }
:where(.dzg-viewport) { position: relative; flex: 1 1 auto; min-block-size: 0; overflow: auto; overscroll-behavior: contain; overflow-anchor: none; outline: none; }
:where(.dzg-header) { position: sticky; inset-block-start: 0; z-index: 3; display: flex; flex-direction: column; }
:where(.dzg-body) { position: relative; overflow: clip; }
:where(.dzg-layer) { position: absolute; inset-inline-start: 0; }
:where(.dzg-row) { position: absolute; inset-inline-start: 0; display: flex; contain: content; }
:where(.dzg-seg) { display: flex; position: relative; }
:where(.dzg-seg-start) { position: sticky; inset-inline-start: 0; z-index: 2; }
:where(.dzg-seg-end) { position: sticky; inset-inline-end: 0; z-index: 2; }
:where(.dzg-hcell) { position: relative; }
:where(.dzg-seg-center > .dzg-cell, .dzg-seg-center > .dzg-hcell) { position: absolute; inset-block: 0; }
:where(.dzg-resize) { position: absolute; inset-block: 0; inset-inline-end: 0; inline-size: var(--dzg-target-min, 24px); max-inline-size: 50%; cursor: col-resize; touch-action: none; z-index: 1; }
:where(.dzg-resize-start) { inset-inline-end: auto; inset-inline-start: 0; }
:where(.dzg-cell, .dzg-hcell) { box-sizing: border-box; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
:where(.dzg-cell[data-align=end]) { text-align: end; }
:where(.dzg-cell[data-align=center]) { text-align: center; }
:where(.dzg-hrow) { display: flex; }
:where(.dzg-free) { unicode-bidi: plaintext; }
:where(.dzg-num) { unicode-bidi: isolate; direction: ltr; }
:where(.dzg-overlay) { position: absolute; inset-inline: 0; inset-block-end: 0; display: grid; place-content: center; place-items: center; pointer-events: none; }
:where(.dzg-overlay > *) { pointer-events: auto; }
:where(.dzg-tooltip) { position: fixed; margin: 0; z-index: 10; }
:where(.dzg-overlay[hidden], .dzg-tooltip[hidden]) { display: none; }
:where(.dzg-popup) { position: fixed; margin: 0; z-index: 10; }
:where(.dzg-popup, .dzg-tooltip)[popover] { position: fixed; inset: auto; margin: 0; overflow: visible; border: 0; padding: 0; background: transparent; color: inherit; }
:where(.dzg-sr) { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
:where(.dzg-live) { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

/**
 * Once per document or shadow root (a grid in a shadow root is not reached
 * by the document's styles). Checked in the DOM, so a style removed by a
 * test or a head swap comes back. A host with a strict CSP passes its nonce,
 * or sets `injectStyles: false` and loads the theme's CSS itself.
 */
export function injectStyles(target: Document | ShadowRoot, nonce?: string): void {
  if (target.querySelector('style[data-dzgrid]')) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = LAYOUT_CSS;
  ('head' in target ? target.head : target).append(style);
}
