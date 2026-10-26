// @vitest-environment node
// The column chooser's styles (Phase 6 step 4, `@dzgrid/theme/columns-panel.css`, owner Q4-2: its own file, loaded only
// with the chooser; docs/behaviors/columns-chooser.md 2, 6, 10, 20, WCAG notes; step04-plan §7): the dialog at most
// 360 px wide (the view's width at 320 px, 1.4.10) and 70 % of the view high, its list scrolling inside; rows drawn only
// when seen (`content-visibility`, Q4-3); ▲ ▼ and the handle 24 px targets drawn as shapes over currentColor (no glyph);
// the handle grabs and takes the finger (`touch-action: none` on it only, O5); the disabled ones muted (3:1); the
// landing bar in the move bar's colour; indentation by logical padding; forced colours; no colour literal, no physical
// side; its layer, its source and the unlayered copy; its pairs in `check:contrast`.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const file = here('../columns-panel.css');
const css = existsSync(file) ? read('columns-panel.css') : '';
const s = sheet(css);
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: RegExp, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => r.selector.split(/,\s*/).some((x) => sel.test(x)) && at(r)).map((r) => r.body).join(' ');
const media = (q: string) => (r: Rule) => r.at.some((a) => a.includes(q));
const spec = JSON.parse(read('contrast-pairs.json')) as { derived: Record<string, string>; pairs: { what: string; fg: string; bg: string; min: number }[] };

describe('columns-panel.css', () => {
  it('exists, opens with the order statement, every rule in dzgrid.theme; its source compiled, its unlayered copy', () => {
    expect(existsSync(file)).toBe(true);
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "columns-panel";'));
    expect(read('columns-panel.unlayered.css')).toBe(out('@use "columns-panel" with ($layered: false);'));
  });

  it('the dialog: at most 360 px or the view\'s width, 70 % of the view high; the list scrolls inside, positioned for its bar', () => {
    const d = decl(/^\.dzg-cp$/);
    expect(d).toMatch(/inline-size: min\(22\.5rem, 100vw - 2rem\)/);
    expect(d).toMatch(/max-block-size: 70vh/);
    expect(d).toMatch(/display: flex/);
    const l = decl(/^\.dzg-cp-list$/);
    expect(l).toMatch(/overflow-y: auto/);
    expect(l).toMatch(/position: relative/);
    expect(l).toMatch(/list-style: none/);
    expect(decl(/^\.dzg-cp-list ul$/)).toMatch(/padding-inline-start: /);
  });

  it('rows at least 32 px; in a long list (above 200, marked by the script) drawn only when seen (Q4-3)', () => {
    expect(decl(/^\.dzg-cp-row$/)).toMatch(/min-block-size: 32px/);
    expect(decl(/^\.dzg-cp-row$/)).not.toMatch(/content-visibility/);
    const r = decl(/^\.dzg-cp-list\[data-dzg-long\] \.dzg-cp-row$/);
    expect(r).toMatch(/content-visibility: auto/);
    expect(r).toMatch(/contain-intrinsic-size: auto 32px/);
  });

  it('▲ ▼ and the handle: 24 px targets, shapes over currentColor (no glyph); the handle grabs and takes the finger', () => {
    const b = decl(/^\.dzg-cp-row button$/);
    expect(b).toMatch(/inline-size: var\(--dzg-target-min, 24px\)/);
    expect(b).toMatch(/block-size: var\(--dzg-target-min, 24px\)/);
    expect(decl(/^\.dzg-cp-row button::before$/)).toMatch(/background: currentColor/);
    for (const a of ['up', 'down', 'drag']) expect(decl(new RegExp(`^\\.dzg-cp-row \\[data-act=${a}\\]::before$`)), a).toMatch(/clip-path: /);
    const h = decl(/^\.dzg-cp-row \[data-act=drag\]$/);
    expect(h).toMatch(/cursor: grab/);
    expect(h).toMatch(/touch-action: none/);
    expect(css).not.toMatch(/content: ['"][▲▼⠿]/);
  });

  it('disabled muted, the dragged row dimmed, the bar 2 px in the move bar\'s colour, no match hides its status', () => {
    expect(decl(/^\.dzg-cp \[aria-disabled=true\]$/)).toMatch(/color: var\(--dzg-menu-disabled, var\(--tz-fg-muted\)\)/);
    expect(decl(/^\.dzg-cp-row\[data-dzg-dragging\]$/)).toMatch(/opacity: 0\.5/);
    const bar = decl(/^\.dzg-cp-bar$/);
    expect(bar).toMatch(/position: absolute/);
    expect(bar).toMatch(/block-size: 2px/);
    expect(bar).toMatch(/background: var\(--dzg-move-bar, var\(--tz-accent\)\)/);
    expect(bar).toMatch(/pointer-events: none/);
    expect(decl(/^\.dzg-cp-desc$/)).toMatch(/color: var\(--tz-fg-muted\)/);
  });

  it('a disabled box (the last shown, `hideable: false`): not by colour alone — the box faded and a lock before its name (review of steps 3–4)', () => {
    expect(decl(/^\.dzg-cp-row input\[aria-disabled=true\]$/)).toMatch(/opacity: 0\.5/);
    const lock = decl(/^\.dzg-cp-row input\[aria-disabled=true\] \+ label::before$/);
    expect(lock).toMatch(/content: ["']{2}/);
    expect(lock).toMatch(/background: currentColor/);
    expect(lock).toMatch(/clip-path: path\(/);
    expect(lock).toMatch(/margin-inline-end: /);
    expect(decl(/^\.dzg-cp-row input\[aria-disabled=true\] \+ label::before$/, media('forced-colors: active'))).toMatch(/background: CanvasText/);
    // Its colour is the label's: the text pair on the dialog, and a 3:1 pair for the shape.
    expect(spec.pairs.some((p) => p.what.includes('lock') && p.fg === '--tz-fg' && p.bg === '--tz-bg' && p.min >= 3)).toBe(true);
  });

  it('forced colours: the shapes ButtonText, the bar Highlight', () => {
    const f = media('forced-colors: active');
    expect(decl(/^\.dzg-cp-row button::before$/, f)).toMatch(/background: ButtonText/);
    expect(decl(/^\.dzg-cp-row button::before$/, f)).toMatch(/forced-color-adjust: none/);
    expect(decl(/^\.dzg-cp-bar$/, f)).toMatch(/background: Highlight/);
  });

  it('nothing animated; no colour literal, no physical side', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(checkScss(read('columns-panel.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
  });

  it('its colours in check:contrast: the description 4.5:1, a disabled control 3:1, the bar 3:1 on the dialog', () => {
    const mine = spec.pairs.filter((p) => p.what.includes('chooser'));
    expect(mine.some((p) => p.fg === '--tz-fg-muted' && p.bg === '--tz-bg' && p.min >= 4.5)).toBe(true);
    expect(mine.some((p) => p.fg === '--dzg-menu-disabled' && p.bg === '--tz-bg' && p.min >= 3)).toBe(true);
    expect(mine.some((p) => p.fg === '--dzg-move-bar' && p.bg === '--tz-bg' && p.min >= 3)).toBe(true);
  });
});
