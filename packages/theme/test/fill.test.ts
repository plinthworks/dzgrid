// @vitest-environment node
// The fill's styles (Phase 5 step 12, `@dzgrid/theme/fill.css`; docs/behaviors/fill.md 11–13; owner S12-Q3, S12-Q8):
// the handle a 10 × 10 px hit box (its square and 2 px, owner 2026-10-26: no accidental fill) at the cell's inline-end / block-end corner (bottom-right, bottom-left right to left:
// logical sides only), its 8 px square drawn at that corner by its own `::before` (the cell's pseudo-elements are the
// edit marks'), a crosshair over it, hidden where no fine pointer exists (touch only); the target outlined dashed in
// the block's edge colour; forced colours Highlight; no transition or animation; no colour literal, no physical side;
// the file's layer, its source and its unlayered copy; the colours in `check:contrast`.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const file = here('../fill.css');
const css = existsSync(file) ? read('fill.css') : '';
const s = sheet(css);
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: RegExp, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => r.selector.split(/,\s*/).some((x) => sel.test(x)) && at(r)).map((r) => r.body).join(' ');
const media = (q: string) => (r: Rule) => r.at.some((a) => a.includes(q));
const spec = JSON.parse(read('contrast-pairs.json')) as { derived: Record<string, string>; pairs: { what: string; fg: string; bg: string; min: number; hue?: number }[] };

describe('fill.css', () => {
  it('exists, opens with the order statement, every rule in dzgrid.theme; its source compiled, its unlayered copy', () => {
    expect(existsSync(file)).toBe(true);
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "fill";'));
    expect(read('fill.unlayered.css')).toBe(out('@use "fill" with ($layered: false);'));
  });

  it('the handle: a 10 px hit box (the 8 px square and 2 px, never a 24 px zone over the cell) at the inline-end, block-end corner of its cell, a crosshair over it', () => {
    const h = decl(/^\.dzg-fill$/);
    expect(h).toMatch(/position: absolute/);
    expect(h).toMatch(/inset-inline-end: 0/);
    expect(h).toMatch(/inset-block-end: 0/);
    expect(h).toMatch(/inline-size: 10px/);
    expect(h).toMatch(/block-size: 10px/);
    expect(h).not.toMatch(/24px/);
    expect(h).toMatch(/cursor: crosshair/);
  });

  it('its square: 8 px at that same corner, in the handle\'s colour (the block\'s edge as fallback), a line of the background round it', () => {
    const q = decl(/^\.dzg-fill::before$/);
    expect(q).toMatch(/content: ""/);
    expect(q).toMatch(/inset-inline-end: 0/);
    expect(q).toMatch(/inset-block-end: 0/);
    expect(q).toMatch(/inline-size: 8px/);
    expect(q).toMatch(/block-size: 8px/);
    expect(q).toMatch(/background: var\(--dzg-fill-handle, var\(--dzg-range-edge, var\(--tz-success\)\)\)/);
    expect(q).toMatch(/box-shadow: 0 0 0 1px var\(--tz-bg\)/);
  });

  it('a pinned cell holding the handle is its anchor (review 1): position relative, the centre\'s cells keep theirs (absolute)', () => {
    const r = s.rules.filter((x) => x.at.length === 0 && /\.dzg-seg-start/.test(x.selector) && /\.dzg-seg-end/.test(x.selector) && /\.dzg-cell:has\(> \.dzg-fill\)/.test(x.selector));
    expect(r.map((x) => x.body).join(' ')).toMatch(/position: relative/);
    expect(r.map((x) => x.selector).join(' ')).not.toMatch(/seg-center/);
  });

  it('the handle takes no touch gesture (touch-action: none), and an open field hides it at once', () => {
    expect(decl(/^\.dzg-fill$/)).toMatch(/touch-action: none/);
    expect(decl(/^\[data-dzg-editing\] > \.dzg-fill$/)).toMatch(/display: none/);
  });

  it('hidden on a screen with no fine pointer (touch only, S12-Q3)', () => {
    expect(decl(/^\.dzg-fill$/, media('not (any-pointer: fine)'))).toMatch(/display: none/);
  });

  it('the target: a dashed line in the block\'s edge colour inside each cell to fill; text selection off while dragging', () => {
    const t = decl(/^\.dzg-cell--fill$/);
    expect(t).toMatch(/outline: 1px dashed var\(--dzg-fill-handle, var\(--dzg-range-edge, var\(--tz-success\)\)\)/);
    expect(t).toMatch(/outline-offset: -1px/);
    expect(decl(/^\[data-dzg-filling\]$/)).toMatch(/user-select: none/);
  });

  it('forced colours: the square Highlight with a CanvasText line, the target Highlight', () => {
    const f = media('forced-colors: active');
    expect(decl(/^\.dzg-fill::before$/, f)).toMatch(/forced-color-adjust: none/);
    expect(decl(/^\.dzg-fill::before$/, f)).toMatch(/background: Highlight/);
    expect(decl(/^\.dzg-fill::before$/, f)).toMatch(/box-shadow: 0 0 0 1px CanvasText/);
    expect(decl(/^\.dzg-cell--fill$/, f)).toMatch(/outline-color: Highlight/);
  });

  it('nothing moves; no colour literal, no physical side', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(checkScss(read('fill.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
  });

  it('the colours checked: the square on a cell, on a block\'s tint, on the focused cell, a hue apart from the focus ring, the saving and the refused borders', () => {
    expect(spec.derived['--dzg-fill-handle']).toBe('var(--dzg-range-edge)');
    const has = (fg: string, bg: string, min: number, hue?: number) => spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min >= min && (hue === undefined || (p.hue ?? 0) >= hue));
    for (const bg of ['--tz-bg', '--dzg-range-bg', '--dzg-cell-active-bg', '--dzg-row-selected-bg', '--dzg-row-active-bg']) expect(has('--dzg-fill-handle', bg, 3), bg).toBe(true);
    for (const other of ['--dzg-focus-ring', '--dzg-saving-color', '--dzg-refused-color']) expect(has('--dzg-fill-handle', other, 1, 60), other).toBe(true);
  });
});

describe('range.css: the focused cell inside a block (S12-Q8)', () => {
  it('forced colours: its ring in HighlightText, so it shows on Highlight (review 3)', () => {
    const r = sheet(read('range.css'));
    const body = r.rules.filter((x) => x.at.some((a) => a.includes('forced-colors: active')) && x.selector === '.dzg-cell--range:focus').map((x) => x.body).join(' ');
    expect(body).toMatch(/outline-color: HighlightText/);
  });

  it('the focused corner keeps the block\'s 2 px edge just inside the inner line (review 4, fill.md 12), both directions', () => {
    const r = sheet(read('range.css'));
    const of = (sel: string) => r.rules.filter((x) => x.at.length === 0 && x.selector === sel).map((x) => x.body).join(' ');
    const E = 'var\\(--dzg-range-edge, var\\(--tz-success\\)\\)';
    const ltr = of('.dzg-cell--range:focus');
    expect(ltr).toMatch(new RegExp(`box-shadow: inset 0 0 0 3px var\\(--tz-bg\\), inset calc\\(var\\(--dzg-rs\\) \\+ 3px\\) 0 0 0 ${E}, inset calc\\(-1 \\* \\(var\\(--dzg-re\\) \\+ 3px\\)\\) 0 0 0 ${E}, inset 0 calc\\(var\\(--dzg-rt\\) \\+ 3px\\) 0 0 ${E}, inset 0 calc\\(-1 \\* \\(var\\(--dzg-rb\\) \\+ 3px\\)\\) 0 0 ${E}`));
    const rtl = of('.dzg-cell--range:focus:dir(rtl)');
    expect(rtl).toMatch(new RegExp(`inset calc\\(-1 \\* \\(var\\(--dzg-rs\\) \\+ 3px\\)\\) 0 0 0 ${E}, inset calc\\(var\\(--dzg-re\\) \\+ 3px\\) 0 0 0 ${E}`));
    const at = (sel: string) => r.rules.findIndex((x) => x.at.length === 0 && x.selector === sel);
    expect(at('.dzg-cell--range:focus:dir(rtl)')).toBeGreaterThan(at('.dzg-cell--range:focus'));
  });

  it('forced colours: a focused cell of a block keeps the system\'s Highlight (the base\'s tint would sit under HighlightText; browser check « range forced colours »)', () => {
    const r = sheet(read('range.css'));
    const body = r.rules.filter((x) => x.at.some((a) => a.includes('forced-colors: active')) && x.selector === '.dzg-cell--range:focus').map((x) => x.body).join(' ');
    expect(body).toMatch(/background: Highlight/);
  });

  it('keeps the base\'s inner line inside its ring, in both directions (the block\'s edges are not drawn on it)', () => {
    const r = sheet(read('range.css'));
    const body = r.rules.filter((x) => x.at.length === 0 && x.selector === '.dzg-cell--range:focus').map((x) => x.body).join(' ');
    expect(body).toMatch(/box-shadow: inset 0 0 0 3px var\(--tz-bg\)/);
    // After the right-to-left rule, which has the same weight.
    const at = (sel: string) => r.rules.findIndex((x) => x.at.length === 0 && x.selector === sel);
    expect(at('.dzg-cell--range:focus')).toBeGreaterThan(at('.dzg-cell--range:dir(rtl)'));
  });
});
