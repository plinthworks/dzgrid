// @vitest-environment node
// Find in the grid's look (Phase 9, `@dzgrid/theme/find.css`, docs/behaviors/find.md 3, 7): loaded only with `find()`;
// the bar on the header's surface; a hit cell tinted and underlined, the current one tinted more with a ring (not colour
// alone); Mark / Highlight in forced colours; no colour literal, no physical side, nothing animated; its layer, its
// source and the unlayered copy; its pairs in `check:contrast`, a hue apart from the selection, the flash and the new
// rows. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const file = here('../find.css');
const css = existsSync(file) ? read('find.css') : '';
const s = sheet(css);
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: string, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => r.selector.split(/,\s*/).includes(sel) && at(r)).map((r) => r.body).join(' ');
const forced = (r: Rule) => r.at.some((a) => a.includes('forced-colors'));
const spec = JSON.parse(read('contrast-pairs.json')) as { derived: Record<string, string>; pairs: { fg: string; bg: string; min: number; hue?: number }[] };
const COLOR = 'var(--dzg-find-color, color-mix(in srgb, var(--tz-accent) 40%, var(--tz-danger)))';

describe('find.css', () => {
  it('exists, opens with the order statement, every rule in dzgrid.theme; its source compiled, its unlayered copy', () => {
    expect(existsSync(file)).toBe(true);
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "find";'));
    expect(read('find.unlayered.css')).toBe(out('@use "find" with ($layered: false);'));
  });

  it('a hit: the tint and an underline; the current one: more tint and a ring', () => {
    expect(decl('.dzg-cell[data-dzg-find]')).toBe(`background: var(--dzg-find-bg, color-mix(in srgb, ${COLOR} 16%, var(--tz-bg))); box-shadow: inset 0 -2px 0 ${COLOR};`);
    expect(decl(".dzg-cell[data-dzg-find=current]")).toBe(`background: var(--dzg-find-current-bg, color-mix(in srgb, ${COLOR} 30%, var(--tz-bg))); box-shadow: inset 0 0 0 2px ${COLOR};`);
  });

  it('forced colours: hits in Mark, the current one in Highlight', () => {
    expect(decl('.dzg-cell[data-dzg-find]', forced)).toMatch(/background: Mark; color: MarkText/);
    expect(decl('.dzg-cell[data-dzg-find=current]', forced)).toMatch(/background: Highlight; color: HighlightText/);
  });

  it('the bar on the header\'s surface, a line under it', () => {
    expect(decl('.dzg-find')).toMatch(/border-block-end: var\(--dzg-line, 1px\) solid var\(--tz-border\)/);
    expect(decl('.dzg-find')).toMatch(/background: var\(--dzg-header-bg, var\(--tz-bg-raised\)\)/);
  });

  it('nothing animated; no colour literal, no physical side', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(checkScss(read('find.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
  });

  it('its colours in check:contrast: text 4.5:1 on both tints, the marks 3:1, 60° from the accent, the flash and the new rows', () => {
    expect(spec.derived['--dzg-find-color']).toBe('color-mix(in srgb, var(--tz-accent) 40%, var(--tz-danger))');
    const has = (fg: string, bg: string, min: number, hue?: number) => spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min >= min && (hue === undefined || (p.hue ?? 0) >= hue));
    expect(has('--tz-fg', '--dzg-find-bg', 4.5) && has('--tz-fg', '--dzg-find-current-bg', 4.5) && has('--tz-fg-muted', '--dzg-find-bg', 4.5)).toBe(true);
    expect(has('--dzg-find-color', '--dzg-find-bg', 3) && has('--dzg-find-color', '--dzg-find-current-bg', 3)).toBe(true);
    expect(['--tz-accent', '--dzg-flash-color', '--dzg-fresh-color'].every((c) => has('--dzg-find-color', c, 1, 60) || has(c, '--dzg-find-color', 1, 60))).toBe(true);
  });
});
