// @vitest-environment node
// 1.12.0 (brief item 7, docs/phase-12-steps/tooltips-plan.md « Also »): the Retry button's focus ring had lost its
// block and ran into the pagination footer's rule — a keyboard-focused Retry took the strip's padding, edge and
// colours, and lost its ring. Expectations written by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sheet as read } from './css-tree.js';

const file = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

describe('the Retry button’s focus ring', () => {
  for (const copy of ['dzgrid', 'dzgrid.unlayered']) {
    it(`${copy}.css: its own ring, apart from the footer strip`, () => {
      const rules = read(file(`../${copy}.css`)).rules;
      const ring = rules.filter((r) => r.selector.split(',').map((s) => s.trim()).includes('.dzg-retry:focus-visible'));
      expect(ring).toHaveLength(1);
      expect(ring[0]!.body).toContain('outline: 2px solid var(--dzg-focus-ring, var(--tz-accent));');
      expect(ring[0]!.body).toContain('outline-offset: 2px;');
      expect(ring[0]!.body).not.toMatch(/padding|border|background/);
      // The footer strip's rule names the footer alone.
      const strip = rules.filter((r) => /padding-block: 0\.25rem/.test(r.body) && r.body.includes('border-block-start'));
      expect(strip.map((r) => r.selector)).toEqual(['.dzg-footer']);
    });
  }
});
