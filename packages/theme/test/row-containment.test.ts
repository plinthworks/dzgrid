// @vitest-environment node
// Phase 11 L3 (docs/phase-11-steps/decisions.md « L3 »): rows contain their layout and style, not their paint. The
// injected `contain: content` clips each row; at 4× CPU, Chrome then layerized every sticky pinned segment apart
// (~34 ms of a 72 ms frame in a 2 000 px scrollbar drag; 40 ms without the clip). The measure is the browser bench's
// (`npm run bench:browser -- --cpu 4`); this guards the rule that carries the fix.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LAYOUT_CSS } from '../../dom/src/styles.js';
import { SPANS_CSS } from '../../dom/src/spans/styles.js';

const read = (f: string) => readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8');

describe('rows: layout containment without the paint clip', () => {
  for (const file of ['dzgrid.css', 'dzgrid.unlayered.css']) {
    it(`${file}: a row (not a spans row) takes contain: layout style`, () => {
      const rule = /\.dzg-row:where\(:not\(\[data-spans\]\)\)\s*\{([^}]*)\}/.exec(read(file))?.[1] ?? '';
      expect(rule).toMatch(/contain:\s*layout style\s*;/);
    });
  }

  it('the injected layout keeps its own rule (a grid without the theme), and spans rows keep the feature’s', () => {
    expect(LAYOUT_CSS).toMatch(/:where\(\.dzg-row\)\s*\{[^}]*contain: content/);
    expect(SPANS_CSS).toContain(':where(.dzg-row[data-spans]){contain:style}');
  });
});
