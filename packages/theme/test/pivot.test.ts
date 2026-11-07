// @vitest-environment node
// The pivot bar's look (owner feedback 2026-11-07, `@dzgrid/theme/pivot.css`, docs/behaviors/pivot.md 31–35): the bar on
// the header's surface, a rule between its parts in the border colour, each part's name in the text colour; the order
// button drawn as a chip's ×; the switch a track and a knob, on: the track in the accent, the knob in the accent's text
// colour, the button itself plain; system colours in forced colours; no colour literal, no physical side; its layer, its
// source and the unlayered copy; its pairs in `check:contrast`. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const file = here('../pivot.css');
const css = existsSync(file) ? read('pivot.css') : '';
const s = sheet(css);
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: string, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => r.selector.split(/,\s*/).includes(sel) && at(r)).map((r) => r.body).join(' ');
const forced = (r: Rule) => r.at.some((a) => a.includes('forced-colors'));
const spec = JSON.parse(read('contrast-pairs.json')) as { pairs: { fg: string; bg: string; min: number }[] };

describe('pivot.css', () => {
  it('exists, opens with the order statement, every rule in dzgrid.theme; its source compiled, its unlayered copy', () => {
    expect(existsSync(file)).toBe(true);
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "pivot";'));
    expect(read('pivot.unlayered.css')).toBe(out('@use "pivot" with ($layered: false);'));
  });

  it('the bar, its rules, the parts\' names, the order button', () => {
    expect(decl('.dzg-pzone')).toBe('color: var(--tz-fg); background: var(--dzg-header-bg, var(--tz-bg-raised)); border-block-end: var(--dzg-line, 1px) solid var(--tz-border);');
    // Owner feedback 2026-11-07 (« pas pro »): the rules between parts stop short of the bar's edges; the parts' names
    // section labels (muted, small capitals, 4.5:1 on the header's surface); ↑ / ↓ a round quiet button as the chip's ×.
    expect(decl('.dzg-pzone > .dzg-gzone')).toBe('margin-block: 0.25rem; padding-block: 0; padding-inline: 0.75rem; border-block-end: 0; border-color: var(--tz-border);');
    expect(decl('.dzg-ppart-name')).toBe('color: var(--tz-fg-muted); font-size: 0.75rem; text-transform: uppercase;');
    expect(decl('.dzg-chip-o')).toBe('border: 0; border-radius: var(--dzg-pill-radius, 1em); background: transparent; color: var(--tz-fg-muted);');
    expect(decl('.dzg-chip-o:hover')).toBe('color: var(--tz-fg); background: var(--dzg-chip-hover-bg, color-mix(in srgb, var(--tz-accent) 28%, var(--tz-bg)));');
    // In the columns panel: the parts without the bar's surface and rules, a line under them.
    expect(decl('.dzg-cp-top .dzg-pzone')).toBe('padding-inline: 0; border: 0; background: none;');
    expect(decl('.dzg-cp-top .dzg-gzone')).toBe('padding-inline: 0; border: 0; background: none;');
    expect(decl('.dzg-cp-top:not(:empty)')).toBe('padding-block-end: 0.5rem; border-block-end: var(--dzg-line, 1px) solid var(--tz-border);');
    expect(decl('.dzg-chip-o[aria-pressed=true]')).toBe('color: var(--tz-fg); font-weight: 600;');
  });

  it('the switch: a track and a knob; on, the track in the accent and the button plain', () => {
    expect(decl('.dzg-pswitch.dzg-pswitch[aria-checked=true]')).toBe('color: var(--tz-fg); background: transparent;');
    expect(decl('.dzg-pswitch-track')).toContain('border: var(--dzg-line, 1px) solid var(--tz-fg-muted);');
    expect(decl('.dzg-pswitch-track::after')).toContain('background: var(--tz-fg-muted);');
    expect(decl('.dzg-pswitch[aria-checked=true] .dzg-pswitch-track')).toBe('background: var(--tz-accent); border-color: var(--tz-accent);');
    expect(decl('.dzg-pswitch[aria-checked=true] .dzg-pswitch-track::after')).toBe('background: var(--tz-accent-fg); inset-inline-start: calc(100% - 0.75rem);');
  });

  it('forced colours: the track ButtonText, on Highlight with its knob HighlightText', () => {
    expect(decl('.dzg-pswitch-track', forced)).toBe('forced-color-adjust: none; border-color: ButtonText;');
    expect(decl('.dzg-pswitch-track::after', forced)).toBe('background: ButtonText;');
    expect(decl('.dzg-pswitch[aria-checked=true] .dzg-pswitch-track', forced)).toBe('background: Highlight; border-color: Highlight;');
    expect(decl('.dzg-pswitch[aria-checked=true] .dzg-pswitch-track::after', forced)).toBe('background: HighlightText;');
  });

  it('nothing animated; no colour literal, no physical side', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(checkScss(read('pivot.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
  });

  it('its colours in check:contrast: names 4.5:1, the track and the knob 3:1', () => {
    const has = (fg: string, bg: string, min: number) => spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min >= min);
    expect([has('--tz-fg', '--dzg-header-bg', 4.5), has('--tz-fg-muted', '--tz-bg', 4.5), has('--tz-fg-muted', '--dzg-header-bg', 3), has('--tz-accent', '--dzg-header-bg', 3), has('--tz-accent-fg', '--tz-accent', 3), has('--tz-accent', '--tz-bg', 3)]).toEqual([true, true, true, true, true, true]);
  });
});
