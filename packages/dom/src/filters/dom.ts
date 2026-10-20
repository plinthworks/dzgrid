/**
 * The filters' smallest DOM helpers, in a leaf module with no import (step 15): the eager forms
 * and the lazy set chunk both use them, and a lazy chunk importing this file never pulls the
 * forms in.
 */
export const el = <K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls = ''): HTMLElementTagNameMap[K] => {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  return e;
};
/** A visible label holding its control (its name), the label's text first. */
export const labelled = (doc: Document, control: HTMLElement): [HTMLLabelElement, HTMLSpanElement] => {
  const l = el(doc, 'label');
  const s = el(doc, 'span');
  l.append(s, control);
  return [l, s];
};
/** A text written only when it changes: a paint that changes nothing touches nothing. */
export const tx = (e: Node, v: string): void => {
  if (e.textContent !== v) e.textContent = v;
};
