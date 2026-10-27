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

  // ---- Phase 6 step 3: the column menu (column-menu.md 1–2, 7, WCAG notes; step03-plan §5) ----
  it('the ⋮ button: a 24 px target, after the filter button and before the reapply mark (order 2 / 3), clear of the resize grip', () => {
    const b = decl(/^\.dzg-mbtn$/);
    expect(b).toMatch(/order: 2/);
    expect(b).toMatch(/flex: none/);
    expect(b).toMatch(/inline-size: var\(--dzg-target-min, 24px\)/);
    expect(b).toMatch(/block-size: var\(--dzg-target-min, 24px\)/);
    expect(b).toMatch(/margin-inline-end: calc\(var\(--dzg-target-min, 24px\) - var\(--dzg-cell-padding-inline, 0\.5rem\)\)/);
    expect(decl(/^\.dzg-reapply$/)).toMatch(/order: 3/);
    // Its dots: a shape over currentColor, no glyph font.
    expect(decl(/^\.dzg-mbtn::before$/)).toMatch(/background: (currentColor|radial-gradient)/);
    expect(css).not.toMatch(/content: ['"][⋮…]/);
  });

  it('hidden with its room kept, shown on hover, focus within, while open, and always without hover', () => {
    expect(decl(/^\.dzg-mbtn$/)).toMatch(/opacity: 0/);
    const shown = s.rules.filter((r) => /:is\(:hover, :focus-within, \[data-dzg-menu\]\) > \.dzg-mbtn/.test(r.selector) && plain(r)).map((r) => r.body).join(' ');
    expect(shown).toMatch(/opacity: 1/);
    const touch = s.rules.filter((r) => r.selector === '.dzg-mbtn' && r.at.some((a) => a.includes('hover: none') && a.includes('any-pointer: coarse'))).map((r) => r.body).join(' ');
    expect(touch).toMatch(/opacity: 1/);
    expect(decl(/^\.dzg-mbtn:focus-visible$/)).toMatch(/outline: 2px solid var\(--dzg-focus-ring/);
  });

  it('the menu: items at least 24 px (32), the checked one marked by a shape (not colour alone), disabled muted, the focused one ringed; scrolls inside the view', () => {
    const list = decl(/^\.dzg-menu$/);
    expect(list).toMatch(/max-block-size: calc\(100dvh - 2rem\)/);
    expect(list).toMatch(/overflow-y: auto/);
    const item = decl(/^\.dzg-menu \[role\^=menuitem\]$/);
    expect(item).toMatch(/min-block-size: 32px/);
    expect(item).toMatch(/padding-inline-start: /);
    expect(decl(/^\.dzg-menu \[aria-checked=true\]::before$/)).toMatch(/background: currentColor/);
    expect(decl(/^\.dzg-menu \[aria-disabled=true\]$/)).toMatch(/color: var\(--dzg-menu-disabled, var\(--tz-fg-muted\)\)/);
    expect(decl(/^\.dzg-menu \[role\^=menuitem\]:focus$/)).toMatch(/outline: 2px solid var\(--dzg-focus-ring, var\(--tz-accent\)\)/);
    expect(decl(/^\.dzg-menu \[role=separator\]$/)).toMatch(/border-block-start: /);
  });

  it('forced colours: the focused item Highlight / HighlightText, the button and separators in system colours', () => {
    const f = media('forced-colors: active');
    expect(decl(/^\.dzg-menu \[role\^=menuitem\]:focus$/, f)).toMatch(/background: Highlight/);
    expect(decl(/^\.dzg-menu \[role\^=menuitem\]:focus$/, f)).toMatch(/color: HighlightText/);
    expect(decl(/^\.dzg-mbtn$/, f)).toMatch(/color: ButtonText/);
  });

  it('the menu\'s colours in check:contrast: item text 4.5:1, the disabled 3:1, the focus ring 3:1 (light, dark, Midnight, Clinic)', () => {
    expect(spec.pairs.some((p) => p.fg === '--tz-fg' && p.bg === '--tz-bg' && p.min >= 4.5)).toBe(true);
    expect(spec.pairs.some((p) => p.fg === '--dzg-menu-disabled' && p.bg === '--tz-bg' && p.min >= 3)).toBe(true);
    expect(spec.derived['--dzg-menu-disabled']).toBe('var(--tz-fg-muted)');
  });

  // ---- Phase 6 step 6: the keyboard resize mode (column-resize.md 2; owner Q6-1: no buttons) ----
  it('the resize mode: a 2 px dashed outline inside the header in its token (fallback the accent), over the focus ring; no buttons', () => {
    const o = decl(/^\.dzg-hcell\[data-dzg-resizing\]$/);
    expect(o).toMatch(/outline: 2px dashed var\(--dzg-resize-mode, var\(--tz-accent\)\)/);
    expect(o).toMatch(/outline-offset: -2px/);
    expect(css).not.toMatch(/dzg-size-btn|dzg-resize-btn/);
  });

  it('the mode\'s outline checked at 3:1 on the header (WCAG 1.4.11)', () => {
    expect(spec.derived['--dzg-resize-mode']).toBe('var(--tz-accent)');
    expect(spec.pairs.some((p) => p.fg === '--dzg-resize-mode' && p.bg === '--dzg-header-bg' && p.min >= 3)).toBe(true);
  });
});

