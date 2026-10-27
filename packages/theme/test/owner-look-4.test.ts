// @vitest-environment node
// The owner's fourth look (docs/phase-6-steps/app-feedback.md 38): with rows ticked, the footer's « Sélectionner les
// 1604 lignes » and « Effacer la sélection » were squeezed into the pager's 2rem squares, their words wrapping over each
// other and over « 1 à 100 sur 1604 ». They share the pager's class (`dzg-pbtn`); the square is the pager's nav buttons'
// alone (`[data-go]`), the selection's actions are text buttons sized to their words, on one line: the footer buttons'
// shared rule (with the retry and the popup's buttons) keeps them on one line and in the footer's font (`font: inherit`
// over the layout's 1.25em for the arrows).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const sheets = [['dzgrid.css', readFileSync(here('../dzgrid.css'), 'utf8')], ['dzgrid.unlayered.css', readFileSync(here('../dzgrid.unlayered.css'), 'utf8')]] as const;
const rule = (src: string, sel: string): string => {
  const m = new RegExp(`(?:^|\\n)\\s*${sel.replace(/[.[\]()'=]/g, '\\$&')} \\{([^}]*)\\}`).exec(src);
  return m ? m[1]!.replace(/\s+/g, ' ').trim() : '';
};

describe('the footer: only the pager is square (app-feedback 38)', () => {
  for (const [name, src] of sheets) {
    it(`${name}: no square on every footer button, the square on the nav buttons ([data-go])`, () => {
      expect(rule(src, '.dzg-pbtn')).toBe('');
      const sq = rule(src, '[data-go]');
      expect(sq).toContain('inline-size: 2rem;');
      expect(sq).toContain('padding: 0;');
    });
    it(`${name}: the selection's actions on one line, in the footer's text size`, () => {
      const a = /\.dzg-pbtn,\s*\.dzg-retry,\s*\.dzg-footer select \{([^}]*)\}/.exec(src)?.[1] ?? '';
      expect(a).toContain('white-space: nowrap;');
      expect(a).toContain('font: inherit;');
      expect(a).not.toMatch(/inline-size/);
    });
  }
});
