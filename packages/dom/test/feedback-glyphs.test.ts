// Feedback pass A (docs/phase-6-steps/feedback-plan.md item 1, app-feedback.md 1): the grid's glyphs are text,
// never borders. An app with an unlayered reset (Tailwind 3's preflight: `*,::before,::after{border-width:0}`)
// beats every rule of the `dzgrid.layout` layer, so a chevron drawn with borders vanished (the pager's arrows
// were empty buttons). The pager now carries real characters in the DOM (aria-hidden, mirrored right to left by
// the browser's bidi), and the toggles draw a character in `content`, which no border reset can erase.
import { describe, it, expect, afterEach } from 'vitest';
import { PAGINATION_CSS } from '../src/pagination/styles.js';
import { TREE_CSS } from '../src/tree/styles.js';
import { DETAIL_CSS } from '../src/detail/styles.js';
import { GROUPS_CSS } from '../src/groups/styles.js';
import { SET_CSS } from '../src/filters/set/styles.js';
import { FILTERS_CSS } from '../src/filters/styles.js';
import { SPANS_CSS } from '../src/spans/styles.js';
import { LAYOUT_CSS } from '../src/styles.js';
import { cleanup, pmake } from './support-pagination.js';

afterEach(cleanup);

// Written from code points (U+00AB, U+2039, U+203A, U+00BB): Bidi_Mirrored characters.
const GLYPHS = { first: String.fromCharCode(0xab), prev: String.fromCharCode(0x2039), next: String.fromCharCode(0x203a), last: String.fromCharCode(0xbb) } as const;
const GOES = ['first', 'prev', 'next', 'last'] as const;

describe('the pager draws its arrows as characters in the DOM', () => {
  it('each button holds one aria-hidden span with its character; the name stays the words', () => {
    const t = pmake();
    for (const go of GOES) {
      const b = t.btn(go)!;
      const spans = b.querySelectorAll('span');
      expect(spans, go).toHaveLength(1);
      expect(spans[0]!.textContent, go).toBe(GLYPHS[go]);
      expect(spans[0]!.getAttribute('aria-hidden'), go).toBe('true');
      // The accessible name is the aria-label, without the glyph.
      expect(b.getAttribute('aria-label'), go).not.toContain(GLYPHS[go]);
      expect(b.getAttribute('aria-label')!.length, go).toBeGreaterThan(1);
    }
  });

  it('an update keeps the same span nodes (the part writes texts and states only)', () => {
    const t = pmake();
    const before = GOES.map((go) => t.btn(go)!.firstElementChild);
    t.btn('next')!.click();
    expect(GOES.map((go) => t.btn(go)!.firstElementChild)).toEqual(before);
    expect(t.btn('prev')!.getAttribute('aria-disabled')).toBe('false');
  });

  it('right to left: the same characters (the browser mirrors them), no rotation variable left in the CSS', () => {
    const t = pmake({ lang: 'ar' });
    for (const go of GOES) expect(t.btn(go)!.textContent, go).toBe(GLYPHS[go]);
    expect(PAGINATION_CSS).not.toContain('--dzg-chevron');
    expect(PAGINATION_CSS).not.toMatch(/::?(before|after)/);
  });

  it('by cursor (no last button): the other three keep their characters', () => {
    const t = pmake({ mode: 'cursor' });
    expect(t.btn('last')).toBeNull();
    for (const go of ['first', 'prev', 'next'] as const) expect(t.btn(go)!.textContent, go).toBe(GLYPHS[go]);
  });
});

/**
 * A stand-in for an unlayered reset (`*,::before,::after{border-width:0;border-style:solid}`): it wins over any
 * layered rule, so every border of a pseudo-element drawn by the grid's injected CSS is zero. A rule that draws
 * a glyph (`content:""`) with borders then draws nothing: none may remain.
 */
const pseudoRules = (css: string): { selector: string; body: string }[] =>
  [...css.matchAll(/([^{}]*::?(?:before|after)[^{}]*)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]! }));
const underReset = (body: string): boolean => /content:\s*""/.test(body) && /border[a-z-]*:/.test(body);

describe('no glyph of the injected CSS is drawn with borders (an unlayered reset would erase it)', () => {
  const sheets = { PAGINATION_CSS, TREE_CSS, DETAIL_CSS, GROUPS_CSS, SET_CSS, FILTERS_CSS, SPANS_CSS, LAYOUT_CSS };
  for (const [name, css] of Object.entries(sheets)) {
    it(name, () => {
      expect(pseudoRules(css).filter((r) => underReset(r.body)).map((r) => r.selector)).toEqual([]);
    });
  }

  it('the stand-in itself: a border-drawn chevron is caught (the check is not vacuous)', () => {
    expect(pseudoRules(':where(.x)::before{content:"";border-block-end:2px solid}').filter((r) => underReset(r.body))).toHaveLength(1);
  });

  it('the toggles (tree, detail, groups) draw a character, mirrored right to left by rotation only', () => {
    for (const css of [TREE_CSS, DETAIL_CSS, GROUPS_CSS]) {
      const glyph = pseudoRules(css).find((r) => /toggle/.test(r.selector))!;
      expect(glyph.body).toMatch(/content:"\\203a"/i);
    }
  });

  it('the set filter\'s box keeps an edge under the reset: an outline, not a border', () => {
    const box = /:where\(\.dzg-fopt>\.dzg-box\)\{([^}]*)\}/.exec(SET_CSS)![1]!;
    expect(box).not.toMatch(/border:/);
    expect(box).toMatch(/outline:1px solid/);
  });
});
