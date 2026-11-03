// @vitest-environment node
// The filters panel's look (Phase 9, `@dzgrid/theme/filters-panel.css`, docs/behaviors/filters-panel.md 3, 7, 16): loaded
// only with `filtersPanel()`; the side on the grid's surface with a line toward the rows (logical side); « Clear all
// filters » and the count in the accent; the dot in the accent, Highlight in forced colours; no colour literal, no
// physical side; its layer, its source and the unlayered copy; its pairs in `check:contrast`. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const file = here('../filters-panel.css');
const css = existsSync(file) ? read('filters-panel.css') : '';
const s = sheet(css);
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: string, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => r.selector.split(/,\s*/).includes(sel) && at(r)).map((r) => r.body).join(' ');
const forced = (r: Rule) => r.at.some((a) => a.includes('forced-colors'));
const spec = JSON.parse(read('contrast-pairs.json')) as { pairs: { fg: string; bg: string; min: number }[] };

describe('filters-panel.css', () => {
  it('exists, opens with the order statement, every rule in dzgrid.theme; its source compiled, its unlayered copy', () => {
    expect(existsSync(file)).toBe(true);
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "filters-panel";'));
    expect(read('filters-panel.unlayered.css')).toBe(out('@use "filters-panel" with ($layered: false);'));
  });

  it('the side on the grid\'s surface, a line toward the rows on either side', () => {
    expect(decl('.dzg-fside')).toMatch(/background: var\(--tz-bg\)/);
    expect(decl("[data-dzg-fside=end] > .dzg-fside")).toBe('border-inline-start: var(--dzg-line, 1px) solid var(--tz-border);');
    expect(decl("[data-dzg-fside=start] > .dzg-fside")).toBe('border-inline-end: var(--dzg-line, 1px) solid var(--tz-border);');
  });

  it('the dot and « Clear all filters » in the accent; disabled: muted; the dot in Highlight in forced colours', () => {
    expect(decl('.dzg-fp-dot')).toBe('background: var(--tz-accent);');
    expect(decl('.dzg-fp-clear')).toMatch(/color: var\(--tz-accent\)/);
    expect(decl('.dzg-fp-clear[aria-disabled=true]')).toMatch(/color: var\(--tz-fg-muted\)/);
    expect(decl('.dzg-fp-dot', forced)).toMatch(/background: Highlight/);
  });

  it('nothing animated; no colour literal, no physical side', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(checkScss(read('filters-panel.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
  });

  it('its colours in check:contrast', () => {
    const has = (fg: string, bg: string, min: number) => spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min >= min);
    expect([has('--tz-accent', '--tz-bg', 4.5), has('--tz-fg', '--tz-bg-raised', 4.5), has('--tz-accent', '--tz-bg-raised', 3)]).toEqual([true, true, true]);
  });
});
