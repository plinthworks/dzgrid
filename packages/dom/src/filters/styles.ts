/**
 * The floating row's layout, injected by the filters feature, not the base: a grid without it
 * carries none. Same rules as `LAYOUT_CSS`: no colour, logical sides only, zero specificity.
 * The box takes the cell's width and a target of at least 24 px; its text follows its own
 * direction (`plaintext`, at the start); an unreadable number gets a 2 px outline, not only a
 * colour (the theme colours it). The Clear button is a 24 px square; the summary's text is cut
 * with an ellipsis. Step 13: the header's filter button and the popup's form.
 */
export const FILTERS_CSS =
  ':where(.dzg-hextra){display:flex;align-items:center}' +
  ':where(.dzg-finput){flex:1;min-inline-size:0;block-size:24px;unicode-bidi:plaintext;text-align:start}' +
  ':where(.dzg-finput[aria-invalid=true]){outline:2px solid}' +
  ':where(.dzg-fsum){flex:1;overflow:hidden;text-overflow:ellipsis}' +
  ':where(.dzg-fclear){inline-size:24px;block-size:24px}' +
  // The header's filter button: a 24 px target after the label and the sort mark (the mark may come
  // later in the DOM: `order`, so a focused button is never moved), clear of the resize grip.
  ':where(.dzg-fbtn){order:1;flex:none;inline-size:24px;block-size:24px;margin-inline:auto calc(var(--dzg-target-min,24px) - var(--dzg-cell-padding-inline,.5rem))}' +
  // Beside a button the label gives way, cut with an ellipsis.
  ':where(.dzg-hcell>.dzg-hlabel){min-inline-size:0;overflow:hidden;text-overflow:ellipsis}' +
  // Step 21, `header.filterBox`: the name, then the box taking what is left.
  ':where(.dzg-hlabel:has(>.dzg-hfbox)){display:flex;flex:1;align-items:center;gap:.25rem}' +
  ':where(.dzg-hfbox){display:flex;flex:1;min-inline-size:0}' +
  // The popup: the fields one under the other, each label above its control; the footer's buttons at the end.
  ':where(.dzg-fpop){display:grid;gap:.5rem;min-inline-size:12rem}' +
  ':where(.dzg-fpop label){display:grid;gap:2px}' +
  ':where(.dzg-fpop [role=radiogroup] label){display:flex;align-items:center;gap:.5rem;min-block-size:24px}' +
  ':where(.dzg-fpop :is(select,button,.dzg-finput)){min-block-size:24px}' +
  ':where(.dzg-ffoot){display:flex;justify-content:end;gap:.5rem}' +
  ':where(.dzg-fpop [hidden]){display:none}' +
  // Step 14: a date field (tzslot's) under its label, as wide as the form.
  ':where(.dzg-fdate){display:grid;gap:2px}' +
  '.dzg-fpop .tz-field,.dzg-fpop .tz-field__trigger{inline-size:100%;min-inline-size:0}';

/** Once per document or shadow root, like the base's; a host with a strict CSP passes its nonce or loads it itself. `css` and `id`: a lazy chunk's own sheet (step 15). */
export function injectFilterStyles(target: Document | ShadowRoot, nonce?: string, css = FILTERS_CSS, id = 'data-dzgrid-filters'): void {
  if (target.querySelector(`style[${id}]`)) return;
  const doc = 'createElement' in target ? target : target.ownerDocument;
  const style = doc.createElement('style');
  style.setAttribute(id, '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = css;
  ('head' in target ? target.head : target).append(style);
}
