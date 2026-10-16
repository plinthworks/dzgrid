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
:where(.dzg-viewport) { position: relative; flex: 1 1 auto; min-block-size: 0; overflow: auto; overscroll-behavior: contain; outline: none; }
:where(.dzg-header) { position: sticky; inset-block-start: 0; z-index: 3; display: flex; }
:where(.dzg-body) { position: relative; overflow: clip; }
:where(.dzg-layer) { position: absolute; inset-inline-start: 0; }
:where(.dzg-row) { position: absolute; inset-inline-start: 0; display: flex; contain: content; }
:where(.dzg-seg) { display: flex; position: relative; }
:where(.dzg-seg-start) { position: sticky; inset-inline-start: 0; z-index: 2; }
:where(.dzg-seg-end) { position: sticky; inset-inline-end: 0; z-index: 2; }
:where(.dzg-seg-center > .dzg-cell, .dzg-seg-center > .dzg-hcell) { position: absolute; inset-block: 0; }
:where(.dzg-cell, .dzg-hcell) { box-sizing: border-box; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
:where(.dzg-free) { unicode-bidi: plaintext; }
:where(.dzg-num) { unicode-bidi: isolate; direction: ltr; }
:where(.dzg-overlay) { position: absolute; inset-inline: 0; inset-block-end: 0; display: grid; place-items: center; pointer-events: none; }
:where(.dzg-tooltip) { position: fixed; margin: 0; z-index: 10; }
:where(.dzg-live) { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

const injected = new WeakSet<Document>();

/** Once per document; a host with a strict CSP passes its nonce, or sets `injectStyles: false` and loads the theme's CSS. */
export function injectStyles(doc: Document, nonce?: string): void {
  if (injected.has(doc)) return;
  injected.add(doc);
  const style = doc.createElement('style');
  style.setAttribute('data-dzgrid', '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = LAYOUT_CSS;
  doc.head.append(style);
}
