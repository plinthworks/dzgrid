// @vitest-environment node
// Sticky parent rows (docs/behaviors/tree-sticky.md): the theme's side — the copies read as rows (not as
// the bold header they live in), a line under the stack (forced colours too), and the tree feature's
// layout (the layer: no height, under the header rows, not printed).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TREE_CSS } from '../../dom/src/tree/styles.js';

const css = readFileSync(fileURLToPath(new URL('../dzgrid.css', import.meta.url)), 'utf8');
const body = (sel: RegExp) => sel.exec(css)?.[1] ?? null;

describe('sticky parent rows: theme', () => {
  it('the copies keep the rows’ weight, not the header’s', () => {
    expect(body(/\.dzg-sticky\s*\{([^}]*)\}/)).toMatch(/font-weight:\s*(400|normal)/);
  });

  it('a line under the stack: the last copy’s cells, thicker, in the border colour; forced colours keep it', () => {
    const rules = [...css.matchAll(/\.dzg-sticky > \.dzg-row:last-child \.dzg-cell[^{]*\{([^}]*)\}/g)].map((m) => m[1]!);
    expect(rules.some((r) => /border-block-end:\s*2px solid var\(--tz-border\)/.test(r))).toBe(true);
    const forced = /@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\}/g;
    const blocks = [...css.matchAll(forced)].map((m) => m[1]!).join('\n');
    expect(blocks).toMatch(/\.dzg-sticky > \.dzg-row:last-child \.dzg-cell[^{]*\{[^}]*border-block-end-color:\s*CanvasText/);
  });

  it('the layer (the feature’s layout): no height, under the header rows, not printed', () => {
    expect(TREE_CSS).toMatch(/:where\(\.dzg-sticky\)\{[^}]*position:relative/);
    expect(TREE_CSS).toMatch(/:where\(\.dzg-sticky\)\{[^}]*block-size:0/);
    expect(TREE_CSS).toMatch(/:where\(\.dzg-sticky\)\{[^}]*z-index:-1/);
    expect(TREE_CSS).toMatch(/@media print\{:where\(\.dzg-sticky\)\{display:none\}\}/);
  });
});
