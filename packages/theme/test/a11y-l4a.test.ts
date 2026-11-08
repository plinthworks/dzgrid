// @vitest-environment node
// Phase 11 L4a, the theme's two failures the browser checks found (scripts/browser-a11y.mjs, decisions.md « L4a »):
// 1. forced colours paint every background in the system's Canvas: a row selected without a box column looked like the
//    others (row moves, blocks of rows); the selected row's bar is drawn there whatever the theme's width (0 by default);
// 2. the columns panel's « no match » status was `display: none` while empty: a live region out of the accessibility
//    tree until it speaks is often not heard (WCAG 4.1.3); empty, it now leaves the flow and stays in the tree.
// Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sheet } from './css-tree.js';

const read = (f: string) => readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8');
const forced = (r: { at: string[] }) => r.at.includes('@media (forced-colors: active)');

describe('L4a: the theme', () => {
  it('forced colours: a selected row’s bar is at least 0.25rem wide, in Highlight, kept as written', () => {
    const bar = sheet(read('dzgrid.css')).rules.find((r) => r.selector === '.dzg-row[aria-selected=true] > .dzg-seg-start::before' && forced(r))!;
    expect(bar.body).toMatch(/inline-size: max\(var\(--dzg-select-bar, 0px\), 0\.25rem\);/);
    expect(bar.body).toMatch(/background: Highlight;/);
    expect(bar.body).toMatch(/forced-color-adjust: none;/);
  });

  it('the columns panel’s empty status stays in the accessibility tree: out of the flow, never display none', () => {
    const rules = sheet(read('columns-panel.css')).rules.filter((r) => r.selector.includes('.dzg-cp-none'));
    expect(rules.map((r) => r.body).join(' ')).not.toMatch(/display: none/);
    expect(rules.find((r) => r.selector === '.dzg-cp-none:empty')?.body).toBe('position: absolute;');
  });
});
