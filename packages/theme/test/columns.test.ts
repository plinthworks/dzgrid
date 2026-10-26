// @vitest-environment node
// Moving columns' styles (Phase 6 step 2, `@dzgrid/theme/columns.css`; docs/behaviors/column-move.md 3; step02-plan §2):
// the drag layer over the grid (no pointer, above the cells), the ghost at 0.8 opacity, the 2 px bar in `--dzg-move-bar`
// (fallback the accent), the source header dimmed, no text selected while dragging, a drop target's mark left to its host;
// forced colours: the bar Highlight, the ghost CanvasText on Canvas; nothing animated; no colour literal, no physical side;
// the layer, its source and the unlayered copy; the bar's colour in `check:contrast` at 3:1.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const file = here('../columns.css');
const css = existsSync(file) ? read('columns.css') : '';
const s = sheet(css);
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: RegExp, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => r.selector.split(/,\s*/).some((x) => sel.test(x)) && at(r)).map((r) => r.body).join(' ');
const media = (q: string) => (r: Rule) => r.at.some((a) => a.includes(q));
const spec = JSON.parse(read('contrast-pairs.json')) as { derived: Record<string, string>; pairs: { fg: string; bg: string; min: number }[] };

describe('columns.css', () => {
  it('exists, opens with the order statement, every rule in dzgrid.theme; its source compiled, its unlayered copy', () => {
    expect(existsSync(file)).toBe(true);
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "columns";'));
    expect(read('columns.unlayered.css')).toBe(out('@use "columns" with ($layered: false);'));
  });

  it('the layer covers the grid, above its cells, takes no pointer', () => {
    const l = decl(/^\.dzg-move$/);
    expect(l).toMatch(/position: absolute/);
    expect(l).toMatch(/inset: 0/);
    expect(l).toMatch(/pointer-events: none/);
    expect(l).toMatch(/z-index: \d+/);
  });

  it('the ghost: 0.8 opacity, on the header\'s background, one line', () => {
    const g = decl(/^\.dzg-move-ghost$/);
    expect(g).toMatch(/position: absolute/);
    expect(g).toMatch(/opacity: 0\.8/);
    expect(g).toMatch(/background: var\(--dzg-header-bg/);
    expect(g).toMatch(/white-space: nowrap/);
  });

  it('the bar: 2 px, its token with the accent as fallback, from the top of the header', () => {
    const b = decl(/^\.dzg-move-bar$/);
    expect(b).toMatch(/position: absolute/);
    expect(b).toMatch(/inset-block-start: 0/);
    expect(b).toMatch(/inline-size: 2px/);
    expect(b).toMatch(/background: var\(--dzg-move-bar, var\(--tz-accent\)\)/);
    expect(b).not.toMatch(/display:/);
  });

  it('the source header dimmed; no text selected and a grabbing cursor while dragging', () => {
    expect(decl(/^\.dzg-hcell\[data-dzg-moving\]$/)).toMatch(/opacity: 0\.5/);
    expect(decl(/^\[data-dzg-dragging\]$/)).toMatch(/user-select: none/);
    expect(decl(/^\[data-dzg-dragging\]$/)).toMatch(/cursor: grabbing/);
  });

  it('forced colours: the bar Highlight, the ghost CanvasText on Canvas', () => {
    const f = media('forced-colors: active');
    expect(decl(/^\.dzg-move-bar$/, f)).toMatch(/background: Highlight/);
    expect(decl(/^\.dzg-move-bar$/, f)).toMatch(/forced-color-adjust: none/);
    expect(decl(/^\.dzg-move-ghost$/, f)).toMatch(/border-color: CanvasText/);
  });

  it('nothing moves (no drop animation, Q2-2); no colour literal, no physical side; small', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(checkScss(read('columns.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
  });

  it('the bar\'s colour checked at 3:1 on the header and the rows (WCAG 1.4.11)', () => {
    expect(spec.derived['--dzg-move-bar']).toBe('var(--tz-accent)');
    for (const bg of ['--dzg-header-bg', '--tz-bg', '--dzg-row-hover-bg', '--dzg-row-selected-bg']) expect(spec.pairs.some((p) => p.fg === '--dzg-move-bar' && p.bg === bg && p.min >= 3), bg).toBe(true);
  });
});
