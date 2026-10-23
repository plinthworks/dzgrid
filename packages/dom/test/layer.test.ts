// Showcase themes, step 2 (docs/behaviors/theming.md, owner T1): every sheet the DOM layer injects is
// wrapped in `@layer dzgrid.layout`, so the theme (dzgrid.theme), a showcase theme and the application's
// own classes come after it. The same string goes into the document, a shadow root, with or without a
// nonce, and is the one exported for an application with `injectStyles: false`.
import { describe, it, expect } from 'vitest';
import { LAYOUT_CSS, injectStyles } from '../src/styles.js';
import { TREE_CSS, injectTreeStyles } from '../src/tree/styles.js';
import { DETAIL_CSS, injectDetailStyles } from '../src/detail/styles.js';
import { FILTERS_CSS, injectFilterStyles } from '../src/filters/styles.js';
import { SET_CSS } from '../src/filters/set/styles.js';
import { PAGINATION_CSS, injectPaginationStyles } from '../src/pagination/styles.js';
import { SPANS_CSS, injectSpanStyles } from '../src/spans/styles.js';
import * as dom from '../src/index.js';

// FILTERS_CSS ends with one rule outside the layer, on purpose (review of part 1): it fits tzslot's date
// field into the popup, and tzslot's own sheets are unlayered (`.tz-field__trigger { min-width: … }`), so
// inside the layer it would lose. Checked apart below.
const TZSLOT_FIT = '.dzg-fpop .tz-field,.dzg-fpop .tz-field__trigger{inline-size:100%;min-inline-size:0}';
const FILTERS_LAYERED = FILTERS_CSS.endsWith(TZSLOT_FIT) ? FILTERS_CSS.slice(0, -TZSLOT_FIT.length) : FILTERS_CSS;
// R5 (review of part 1): the layout's !important rules stay OUTSIDE the layer, after it, so an app's own
// !important still overrides them as before (inside a layer, an !important beats every unlayered one).
const SPANS_IMPORTANT = ':where(.dzg-row[data-full]>.dzg-seg>.dzg-cell){position:sticky;inset-inline-start:var(--dzg-check-w)!important;inline-size:calc(var(--dzg-view-w,100%) - var(--dzg-check-w))!important}';
const SPANS_LAYERED = SPANS_CSS.endsWith(SPANS_IMPORTANT) ? SPANS_CSS.slice(0, -SPANS_IMPORTANT.length) : SPANS_CSS;
const SHEETS = { LAYOUT_CSS, TREE_CSS, DETAIL_CSS, FILTERS_CSS: FILTERS_LAYERED, SET_CSS, PAGINATION_CSS, SPANS_CSS: SPANS_LAYERED };
/** A selector list split at its top-level commas (not those inside :where(), :has()). */
function topLevel(sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of sel) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) (out.push(cur), (cur = ''));
    else cur += c;
  }
  return [...out, cur];
}
/** Every style rule's selector in a sheet, at any depth (inside @layer, @media). */
const selectors = (css: string) => [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1]!.trim());

/** The text inside one `@layer dzgrid.layout { … }` wrapping the whole sheet, or null. */
function inner(css: string): string | null {
  const m = /^\s*@layer dzgrid\.layout\s*\{([\s\S]*)\}\s*$/.exec(css);
  if (!m) return null;
  // The wrapper's braces balance: no rule leaks out of it.
  let depth = 0;
  for (const c of m[1]!) {
    if (c === '{') depth++;
    if (c === '}' && --depth < 0) return null;
  }
  return depth === 0 ? m[1]! : null;
}

describe('the injected layout sits in @layer dzgrid.layout', () => {
  for (const [name, css] of Object.entries(SHEETS))
    it(`${name} is one @layer dzgrid.layout block, its rules inside`, () => {
      expect(inner(css), name).not.toBeNull();
      expect(inner(css)!.trim().length).toBeGreaterThan(0);
    });

  it('FILTERS_CSS: its one rule for tzslot\'s field stays outside the layer, after it, the only one there', () => {
    expect(FILTERS_CSS.endsWith(TZSLOT_FIT)).toBe(true);
    expect(inner(FILTERS_LAYERED)).not.toContain('.tz-');
  });

  it('no !important inside the layer; the spans\' !important rule stands after it (R5)', () => {
    expect(SPANS_CSS.endsWith(SPANS_IMPORTANT)).toBe(true);
    for (const [name, css] of Object.entries(SHEETS)) expect(inner(css), name).not.toContain('!important');
  });

  it('every rule of every injected sheet has zero specificity, but the one fitting tzslot\'s field (T-4)', () => {
    for (const [name, css] of Object.entries({ ...SHEETS, FILTERS_CSS, SPANS_CSS }))
      for (const sel of selectors(css)) {
        if (sel === '.dzg-fpop .tz-field,.dzg-fpop .tz-field__trigger') continue; // it must beat tzslot's 0,1,0
        for (const part of topLevel(sel)) expect(part.trim(), `${name}: ${sel}`).toMatch(/^:where\(/);
      }
  });

  it('the exported LAYOUT_CSS is the wrapped one (an app with injectStyles: false loads it as is)', () => {
    expect(dom.LAYOUT_CSS).toBe(LAYOUT_CSS);
    expect(inner(dom.LAYOUT_CSS)).not.toBeNull();
  });

  it('every rule inside still has zero specificity', () => {
    for (const sel of inner(LAYOUT_CSS)!.match(/[^{}]+(?=\{)/g)!) expect(sel.trim()).toMatch(/^:where\(/);
  });

  it('the <style> injected in a document, with a nonce, carries the wrapper', () => {
    const doc = document.implementation.createHTMLDocument('x');
    injectStyles(doc, 'n0nce');
    const s = doc.head.querySelector('style[data-dzgrid]')!;
    expect(s.getAttribute('nonce')).toBe('n0nce');
    expect(s.textContent).toBe(LAYOUT_CSS);
  });

  it('so does each feature’s, in a shadow root', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    injectStyles(root);
    injectTreeStyles(root, 'n');
    injectDetailStyles(root);
    injectFilterStyles(root);
    injectFilterStyles(root, undefined, SET_CSS, 'data-dzgrid-set');
    injectPaginationStyles(root);
    injectSpanStyles(root);
    const texts = [...root.querySelectorAll('style')].map((s) => s.textContent!);
    expect(texts).toHaveLength(7);
    for (const t of texts) expect(inner(t.endsWith(TZSLOT_FIT) ? t.slice(0, -TZSLOT_FIT.length) : t.endsWith(SPANS_IMPORTANT) ? t.slice(0, -SPANS_IMPORTANT.length) : t)).not.toBeNull();
    host.remove();
  });
});
