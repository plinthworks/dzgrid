// @vitest-environment node
// The owner's second look (docs/phase-6-steps/app-feedback.md 24, 27): the pager's buttons square, its page words with
// room; the selection box a square whatever the cell's padding (an app's 15 px in the 40 px column squeezed it into a
// 10 × 16 pill: a flex item shrinks).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PAGINATION_CSS } from '../../dom/src/pagination/styles.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const css = readFileSync(here('../dzgrid.css'), 'utf8');
const unlayered = readFileSync(here('../dzgrid.unlayered.css'), 'utf8');
/** The declarations of the rule whose selector is exactly `sel` (the expanded output: one selector per rule here). */
const rule = (src: string, sel: string): string => {
  const m = new RegExp(`(?:^|\\n)\\s*${sel.replace(/[.[\]()'=]/g, '\\$&')} \\{([^}]*)\\}`).exec(src);
  return m ? m[1]!.replace(/\s+/g, ' ').trim() : '';
};

describe('the pager (app-feedback 24)', () => {
  for (const [name, src] of [['dzgrid.css', css], ['dzgrid.unlayered.css', unlayered]] as const) {
    it(`${name}: square buttons, 2rem by 2rem, no inline padding to widen them`, () => {
      const b = rule(src, '.dzg-pbtn');
      expect(b).toContain('inline-size: 2rem;');
      expect(b).toContain('padding: 0;');
      // The height: the footer buttons' 2rem (the rule they share).
      expect(src).toMatch(/\.dzg-pbtn,\s*\.dzg-retry,\s*\.dzg-footer select \{\s*min-block-size: 2rem;/);
    });
  }
  it('« Page 1 sur 1 » with room on both sides, the buttons evenly apart: half a rem (the layout’s gap)', () => {
    expect(PAGINATION_CSS).toContain(':where(.dzg-footer>*,.dzg-psel,.dzg-psize){display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}');
  });
});

describe('the selection box keeps its square (app-feedback 27)', () => {
  it('it never shrinks in its cell', () => {
    expect(rule(css, '.dzg-box')).toContain('flex: none;');
    expect(rule(unlayered, '.dzg-box')).toContain('flex: none;');
  });
});
