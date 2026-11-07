// @vitest-environment node
// The dock's look (Phase 9, `@dzgrid/theme/dock.css`, docs/behaviors/dock.md 4, 8, 16, 17): loaded only with `dock()`;
// the areas on the grid's surface; the edge's line muted, the accent under the pointer and focused; the shown tab
// underlined in the accent; the columns panel filling its area; system colours in forced colours; no colour literal, no
// physical side, nothing animated; its layer, its source and the unlayered copy; its pairs in `check:contrast`.
// Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const file = here('../dock.css');
const css = existsSync(file) ? read('dock.css') : '';
const s = sheet(css);
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: string, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => r.selector.split(/,\s*/).includes(sel) && at(r)).map((r) => r.body).join(' ');
/** A rule by its whole selector (one with a comma inside `:is()`). */
const exact = (sel: string) => s.rules.filter((r) => r.selector === sel && plain(r)).map((r) => r.body).join(' ');
const forced = (r: Rule) => r.at.some((a) => a.includes('forced-colors'));
const spec = JSON.parse(read('contrast-pairs.json')) as { pairs: { fg: string; bg: string; min: number }[] };

describe('dock.css', () => {
  it('exists, opens with the order statement, every rule in dzgrid.theme; its source compiled, its unlayered copy', () => {
    expect(existsSync(file)).toBe(true);
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "dock";'));
    expect(read('dock.unlayered.css')).toBe(out('@use "dock" with ($layered: false);'));
  });

  it('the surface, the edge muted then the accent, the shown tab underlined, the columns panel filling its area', () => {
    expect(decl('.dzg-dock')).toBe('color: var(--tz-fg); background: var(--tz-bg); accent-color: var(--tz-accent);');
    // Owner 2026-11-07: no line and no grip at rest (the area's line divides; a grip at rest read as a stray scroll bar),
    // the grip centred in the gutter, in the accent under the pointer and focused.
    expect(decl('.dzg-dock-sep::before')).toBe('');
    expect(decl('.dzg-dock-sep::after')).toMatch(/content: ""; position: absolute; inset-block-start: 50%; inset-inline-start: 50%;/);
    expect(decl('.dzg-dock-sep::after')).not.toMatch(/background/);
    expect(decl('.dzg-dock-sep::after')).not.toMatch(/left|right|translate/);
    expect(exact('.dzg-dock-sep:is(:hover, :focus-visible)::after')).toBe('background: var(--tz-accent);');
    expect(decl('.dzg-dock-sep:focus-visible::before')).toBe('background: var(--tz-accent); inline-size: 3px;');
    expect(decl('.dzg-dock-tab[aria-selected=true]')).toBe('color: var(--tz-fg); font-weight: 600; box-shadow: inset 0 -2px 0 var(--tz-accent);');
    // The head's buttons and tabs: the theme's quiet button (muted, no face; the text colour on the raised surface on hover), 24 px.
    expect(decl('.dzg-dock-head button')).toBe('box-sizing: border-box; min-block-size: var(--dzg-target-min, 24px); padding: 0 0.375rem; border: var(--dzg-line, 1px) solid transparent; border-radius: var(--dzg-radius, 0.375rem); color: var(--tz-fg-muted); background: transparent; font: inherit; cursor: pointer;');
    expect(decl('.dzg-dock-head button:hover')).toBe('color: var(--tz-fg); background: var(--tz-bg-raised);');
    expect(decl('.dzg-dock-box > .dzg-cp')).toBe('inline-size: auto; block-size: 100%; max-block-size: none; padding: 0.5rem;');
  });

  it('forced colours: the edge CanvasText, Highlight when focused; the shown tab Highlight', () => {
    expect(decl('.dzg-dock-sep::before', forced)).toBe('forced-color-adjust: none; background: CanvasText;');
    expect(decl('.dzg-dock-sep::after', forced)).toBe('');
    expect(decl('.dzg-dock-sep:focus-visible::before', forced)).toBe('background: Highlight;');
    expect(decl('.dzg-dock-tab[aria-selected=true]', forced)).toBe('forced-color-adjust: none; box-shadow: inset 0 -2px 0 Highlight;');
  });

  it('nothing animated; no colour literal, no physical side', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(checkScss(read('dock.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
  });

  it('its colours in check:contrast: the edge 3:1 muted and in the accent, the text 4.5:1, the focus ring 3:1', () => {
    const has = (fg: string, bg: string, min: number) => spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min >= min);
    expect([has('--tz-fg-muted', '--tz-bg', 3), has('--tz-accent', '--tz-bg', 3), has('--tz-fg', '--tz-bg', 4.5), has('--tz-fg', '--tz-bg-raised', 4.5), has('--dzg-focus-ring', '--tz-bg', 3)]).toEqual([true, true, true, true, true]);
  });
});
