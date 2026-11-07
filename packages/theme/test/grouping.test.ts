// @vitest-environment node
// The chips' look (owner feedback 2026-11-07, « pas pro », `@dzgrid/theme/grouping.css`): a pill on a light tint of the
// accent with no outline (forced colours give it back), its name and × quiet round buttons tinted stronger under the
// pointer, « + » round and dashed in the muted colour; the tokens in `check:contrast`; its layer, its source and the
// unlayered copy; no colour literal, no physical side. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const css = read('grouping.css');
const s = sheet(css);
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: string, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => r.selector.split(/,\s*/).includes(sel) && at(r)).map((r) => r.body).join(' ');
const forced = (r: Rule) => r.at.some((a) => a.includes('forced-colors'));
const spec = JSON.parse(read('contrast-pairs.json')) as { derived: Record<string, string>; pairs: { fg: string; bg: string; min: number }[] };
const TINT = 'var(--dzg-chip-bg, color-mix(in srgb, var(--tz-accent) 14%, var(--tz-bg)))';
const HOVER = 'var(--dzg-chip-hover-bg, color-mix(in srgb, var(--tz-accent) 28%, var(--tz-bg)))';

describe('grouping.css, the chips', () => {
  it('opens with the order statement, every rule in dzgrid.theme; its source compiled, its unlayered copy', () => {
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "grouping";'));
    expect(read('grouping.unlayered.css')).toBe(out('@use "grouping" with ($layered: false);'));
  });

  it('a pill on the tint, no outline but in forced colours; name and × round, the stronger tint on hover; « + » dashed', () => {
    expect(decl('.dzg-gchip')).toBe(`border: var(--dzg-line, 1px) solid transparent; border-radius: var(--dzg-pill-radius, 1em); background: ${TINT}; cursor: grab;`);
    expect(decl('.dzg-chip-x')).toMatch(/border-radius: var\(--dzg-pill-radius, 1em\); background: transparent;/);
    expect(decl('.dzg-chip-x:hover')).toBe(`color: var(--tz-fg); background: ${HOVER};`);
    expect(decl('.dzg-chip:hover')).toBe(decl('.dzg-chip-x:hover'));
    expect(decl('.dzg-zadd')).toBe('border: var(--dzg-line, 1px) dashed var(--tz-fg-muted);');
    expect(decl('.dzg-gchip', forced)).toBe('border-color: CanvasText;');
  });

  it('the tokens derived as drawn, their pairs in check:contrast; no colour literal, no physical side', () => {
    expect(spec.derived['--dzg-chip-bg']).toBe('color-mix(in srgb, var(--tz-accent) 14%, var(--tz-bg))');
    expect(spec.derived['--dzg-chip-hover-bg']).toBe('color-mix(in srgb, var(--tz-accent) 28%, var(--tz-bg))');
    const has = (fg: string, bg: string, min: number) => spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min >= min);
    expect([has('--tz-fg', '--dzg-chip-bg', 4.5), has('--tz-fg-muted', '--dzg-chip-bg', 4.5), has('--tz-fg', '--dzg-chip-hover-bg', 4.5), has('--dzg-focus-ring', '--dzg-chip-bg', 3)]).toEqual([true, true, true, true]);
    expect(checkScss(read('grouping.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
  });
});
