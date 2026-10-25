// @vitest-environment node
// The block's styles (Phase 5 step 11a, `@dzgrid/theme/range.css`; docs/behaviors/range-selection.md 11;
// step11a-plan.md « Paint and a11y »): the tint read through its own variable with the selected row's as fallback,
// the text colour kept; the edges as one inset box-shadow list driven by four custom properties (no pseudo-element:
// the edit marks own both), flipped right to left by `:dir(rtl)`; forced colours Highlight / HighlightText; no
// transition or animation; text selection off while dragging; no colour literal, no physical side; the file's layer,
// its source and its unlayered copy.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const file = here('../range.css');
const css = existsSync(file) ? read('range.css') : '';
const s = sheet(css);
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: RegExp, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => sel.test(r.selector) && at(r)).map((r) => r.body).join(' ');
const media = (q: string) => (r: Rule) => r.at.some((a) => a.includes(q));
const spec = JSON.parse(read('contrast-pairs.json')) as { derived: Record<string, string>; pairs: { what: string; fg: string; bg: string; min: number; hue?: number }[] };

describe('range.css', () => {
  it('exists, is shipped, opens with the order statement, every rule in dzgrid.theme', () => {
    expect(existsSync(file)).toBe(true);
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.length).toBeGreaterThan(0);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
  });

  it('is its source compiled, and its unlayered copy the same rules outside the layer', () => {
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "range";'));
    expect(read('range.unlayered.css')).toBe(out('@use "range" with ($layered: false);'));
    expect(sheet(read('range.unlayered.css')).rules.every((r) => r.layers.length === 0)).toBe(true);
  });

  it('the tint: its own variable, the selected row\'s as fallback; the text colour is the cell\'s', () => {
    const tint = decl(/^\.dzg-cell--range$/);
    expect(tint).toMatch(/background: var\(--dzg-range-bg, var\(--dzg-row-selected-bg, /);
    expect(tint).not.toMatch(/(^|[\s;])color:/);
  });

  it('the edges: one inset box-shadow list over four custom properties, set by the edge classes; flipped by :dir(rtl); no pseudo-element', () => {
    const tint = decl(/^\.dzg-cell--range$/);
    const E = 'var\\(--dzg-range-edge, var\\(--tz-success\\)\\)';
    expect(tint).toMatch(new RegExp(`box-shadow: inset var\\(--dzg-rs\\) 0 0 0 ${E}, inset calc\\(-1 \\* var\\(--dzg-re\\)\\) 0 0 0 ${E}, inset 0 var\\(--dzg-rt\\) 0 0 ${E}, inset 0 calc\\(-1 \\* var\\(--dzg-rb\\)\\) 0 0 ${E};`));
    for (const e of ['rs', 're', 'rt', 'rb']) expect(decl(new RegExp(`\\.dzg-cell--range\\.dzg-cell--${e}$`)), e).toMatch(new RegExp(`--dzg-${e}: 2px`));
    const rtl = decl(/^\.dzg-cell--range:dir\(rtl\)$/);
    expect(rtl).toMatch(new RegExp(`box-shadow: inset calc\\(-1 \\* var\\(--dzg-rs\\)\\) 0 0 0 ${E}, inset var\\(--dzg-re\\) 0 0 0 ${E}, `));
    // No pseudo-element drawn (the edit marks own both); only the forced-colours reset below names them.
    expect(s.rules.filter((r) => /::?(before|after)/.test(r.selector) && !r.at.some((x) => x.includes('forced-colors'))).map((r) => r.selector)).toEqual([]);
    expect(css).not.toContain('[dir=rtl]');
    // The edge colour: its own variable, the palette's success as fallback (a hue apart from the ring and the saving colour).
    expect(tint).toMatch(/var\(--dzg-range-edge, var\(--tz-success\)\)/);
  });

  it('forced colours: the tint Highlight with HighlightText, its colours kept (forced-color-adjust: none), the edges HighlightText', () => {
    const f = decl(/^\.dzg-cell--range$/, media('forced-colors: active'));
    expect(f).toMatch(/forced-color-adjust: none/);
    expect(f).toMatch(/background: Highlight/);
    expect(f).toMatch(/color: HighlightText/);
    expect(f).toMatch(/--dzg-range-edge: HighlightText/);
    // Review 6: what the cell holds keeps the system's colours (badges, links, the edit marks): the adjust put back.
    const kids = s.rules.filter((r) => r.at.some((x) => x.includes('forced-colors')) && /forced-color-adjust: auto/.test(r.body)).map((r) => r.selector).join(' ');
    for (const sel of ['.dzg-cell--range > *', '.dzg-cell--range::before', '.dzg-cell--range::after']) expect(kids, sel).toContain(sel);
  });

  it('no transition, no animation (reduced motion has nothing to reduce); text selection off while dragging', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(decl(/^\[data-dzg-ranging\]/)).toMatch(/user-select: none/);
  });

  it('no colour literal and no physical side in the source', () => {
    expect(checkScss(read('range.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
  });

  it('contrast-pairs.json lists the tint and the edges: text 4.5:1 on the tint, the edge 3:1 on the tint and the background, a hue 60° from the focus ring and the saving colour', () => {
    expect(spec.derived['--dzg-range-bg']).toBe('var(--dzg-row-selected-bg)');
    expect(spec.derived['--dzg-range-edge']).toBe('var(--tz-success)');
    const has = (fg: string, bg: string, min: number, hue?: number) => spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min === min && p.hue === hue);
    expect(has('--tz-fg', '--dzg-range-bg', 4.5)).toBe(true);
    expect(has('--tz-fg-muted', '--dzg-range-bg', 4.5)).toBe(true);
    expect(has('--dzg-range-edge', '--dzg-range-bg', 3)).toBe(true);
    expect(has('--dzg-range-edge', '--tz-bg', 3)).toBe(true);
    expect(has('--dzg-focus-ring', '--dzg-range-bg', 3)).toBe(true);
    expect(has('--dzg-range-edge', '--dzg-focus-ring', 1, 60)).toBe(true);
    expect(has('--dzg-range-edge', '--dzg-saving-color', 1, 60)).toBe(true);
  });
});
