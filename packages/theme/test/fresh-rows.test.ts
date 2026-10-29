// @vitest-environment node
// The new rows' look (1.1.0 step 16h, `@dzgrid/theme/fresh-rows.css`, docs/behaviors/fresh-rows.md « Its look »; owner
// Q16-9 A): loaded only with `freshRows()`; a row marked `data-dzg-fresh` and its pinned segments tinted at the base
// row's weight (hover, the focused row, a selection keep theirs), a bar at the start segment's inline start (not colour
// alone, left in French, right in Arabic), `Highlight` in forced colours; nothing animated (a still mark, reduced
// motion or not); no colour literal, no physical side; its layer, its source and the unlayered copy; its pairs in
// `check:contrast`, a hue apart from the selection and the flash. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const file = here('../fresh-rows.css');
const css = existsSync(file) ? read('fresh-rows.css') : '';
const s = sheet(css);
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: RegExp, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => r.selector.split(/,\s*/).some((x) => sel.test(x)) && at(r)).map((r) => r.body).join(' ');
const media = (q: string) => (r: Rule) => r.at.some((a) => a.includes(q));
const spec = JSON.parse(read('contrast-pairs.json')) as { derived: Record<string, string>; pairs: { what: string; fg: string; bg: string; min: number; hue?: number }[] };
const COLOR = 'var(--dzg-fresh-color, var(--tz-success))';

describe('fresh-rows.css', () => {
  it('exists, opens with the order statement, every rule in dzgrid.theme; its source compiled, its unlayered copy', () => {
    expect(existsSync(file)).toBe(true);
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "fresh-rows";'));
    expect(read('fresh-rows.unlayered.css')).toBe(out('@use "fresh-rows" with ($layered: false);'));
  });

  it('a marked row and its pinned segments tinted at the base row\'s weight: .dzg-row:where([data-dzg-fresh])', () => {
    const r = s.rules.find((x) => plain(x) && /^\.dzg-row:where\(\[data-dzg-fresh\]\)$/.test(x.selector.split(/,\s*/)[0]!));
    expect(r?.selector.split(/,\s*/)).toEqual(['.dzg-row:where([data-dzg-fresh])', '.dzg-row:where([data-dzg-fresh]) .dzg-seg-start', '.dzg-row:where([data-dzg-fresh]) .dzg-seg-end']);
    expect(r?.body).toBe(`background: var(--dzg-fresh-bg, color-mix(in srgb, ${COLOR} 14%, var(--tz-bg)));`);
  });

  it('the bar: the ::after\'s start border at the start segment\'s inline start, the full row height, 3 px by default, above the cells', () => {
    const d = decl(/^\.dzg-row\[data-dzg-fresh\] > \.dzg-seg-start::after$/);
    expect(d).toMatch(/content: ""/);
    expect(d).toMatch(/position: absolute/);
    expect(d).toMatch(/inset-block: 0/);
    expect(d).toMatch(/inset-inline-start: 0/);
    expect(d).toContain(`border-inline-start: var(--dzg-fresh-bar, 3px) solid ${COLOR}`);
    expect(d).toMatch(/z-index: 1/);
    expect(d).toMatch(/pointer-events: none/);
    // Start-pinned columns (review of 16h): the base's ::after spans the segment with the pinned edge as its END border;
    // the bar sets neither an end inset, a size, nor any end border or background, so that edge stays.
    expect(d).not.toMatch(/inset-inline-end|inline-size|border-inline-end|background/);
  });

  it('forced colours: the bar in Highlight', () => {
    expect(decl(/^\.dzg-row\[data-dzg-fresh\] > \.dzg-seg-start::after$/, media('forced-colors'))).toMatch(/border-inline-start-color: Highlight/);
  });

  it('nothing animated; no colour literal, no physical side', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(checkScss(read('fresh-rows.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
  });

  it('its colours in check:contrast: text 4.5:1 on the tint, the bar 3:1 on the tint and on a selected row, 60° from the accent and from the flash', () => {
    expect(spec.derived['--dzg-fresh-color']).toBe('var(--tz-success)');
    expect(spec.derived['--dzg-fresh-bg']).toBe('color-mix(in srgb, var(--dzg-fresh-color) 14%, var(--tz-bg))');
    const has = (fg: string, bg: string, min: number, hue?: number) => spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min >= min && (hue === undefined || (p.hue ?? 0) >= hue));
    expect(has('--tz-fg', '--dzg-fresh-bg', 4.5)).toBe(true);
    expect(has('--dzg-fresh-color', '--dzg-fresh-bg', 3)).toBe(true);
    expect(has('--dzg-fresh-color', '--dzg-row-selected-bg', 3)).toBe(true);
    expect(has('--dzg-fresh-color', '--tz-accent', 1, 60)).toBe(true);
    expect(has('--dzg-flash-color', '--dzg-fresh-color', 1, 60)).toBe(true);
  });

  it('Bootstrap, whose flash is the success colour: its fresh colour the warning', () => {
    expect(read('bootstrap.css')).toMatch(/--dzg-fresh-color: var\(--tz-warning\);/);
  });
});
