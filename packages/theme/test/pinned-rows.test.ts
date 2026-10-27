// @vitest-environment node
// The pinned rows' look (Phase 6 step 8b-1, `@dzgrid/theme/pinned-rows.css`, owner Q2: its own file, about 450 B, loaded only
// with `pinnedRows()`; docs/behaviors/pinned-rows.md 5, « WCAG notes »): the pinned rows on a raised background (hover, the
// focused row and a selection still win: same weight, the base rules' states heavier), a 2 px line between each band and
// the body drawn inside the band (no layout: the band's height is its rows'), `CanvasText` in forced colours; no colour
// literal, no physical side; its layer, its source and the unlayered copy; its pairs in `check:contrast`.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const file = here('../pinned-rows.css');
const css = existsSync(file) ? read('pinned-rows.css') : '';
const s = sheet(css);
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: RegExp, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => r.selector.split(/,\s*/).some((x) => sel.test(x)) && at(r)).map((r) => r.body).join(' ');
const media = (q: string) => (r: Rule) => r.at.some((a) => a.includes(q));
const spec = JSON.parse(read('contrast-pairs.json')) as { derived: Record<string, string>; pairs: { what: string; fg: string; bg: string; min: number }[] };

describe('pinned-rows.css', () => {
  it('exists, opens with the order statement, every rule in dzgrid.theme; its source compiled, its unlayered copy', () => {
    expect(existsSync(file)).toBe(true);
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "pinned-rows";'));
    expect(read('pinned-rows.unlayered.css')).toBe(out('@use "pinned-rows" with ($layered: false);'));
  });

  it('a pinned row and its pinned segments on the raised background, at the base row\'s weight (hover, focus and selection keep theirs)', () => {
    const r = s.rules.find((x) => plain(x) && /:where\(\.dzg-pins\) \.dzg-row\b/.test(x.selector));
    expect(r?.body).toMatch(/background: var\(--dzg-pinned-bg, var\(--tz-bg-raised\)\)/);
    expect(r?.selector).toMatch(/:where\(\.dzg-pins\) \.dzg-row \.dzg-seg-start/);
    expect(r?.selector).toMatch(/:where\(\.dzg-pins\) \.dzg-row \.dzg-seg-end/);
    expect(css).not.toMatch(/\.dzg-pins \.dzg-row/);
  });

  it('a 2 px line between each band and the body, drawn over the rows inside the band (no border: the band is its rows\' height)', () => {
    for (const [side, edge] of [['top', 'end'], ['bottom', 'start']] as const) {
      const d = decl(new RegExp(`^\\.dzg-pins-${side}::after$`));
      expect(d, side).toMatch(/position: absolute/);
      expect(d, side).toMatch(new RegExp(`inset-block-${edge}: 0`));
      expect(d, side).toMatch(/inset-inline: 0/);
      expect(d, side).toMatch(/block-size: 2px/);
      expect(d, side).toMatch(/background: var\(--dzg-pinned-line, var\(--tz-fg-muted\)\)/);
      expect(d, side).toMatch(/pointer-events: none/);
    }
    expect(css).not.toMatch(/border-block/);
  });

  it('forced colours: the line in CanvasText', () => {
    expect(decl(/^\.dzg-pins-(top|bottom)::after$/, media('forced-colors'))).toMatch(/background: CanvasText/);
  });

  it('nothing animated; no colour literal, no physical side', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(checkScss(read('pinned-rows.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
  });

  it('its colours in check:contrast: the text 4.5:1 on the raised background, the line 3:1 on the body and on the band', () => {
    const mine = spec.pairs.filter((p) => p.what.includes('pinned row'));
    expect(spec.derived['--dzg-pinned-bg']).toBe('var(--tz-bg-raised)');
    expect(spec.derived['--dzg-pinned-line']).toBe('var(--tz-fg-muted)');
    expect(mine.some((p) => p.fg === '--tz-fg' && p.bg === '--dzg-pinned-bg' && p.min >= 4.5)).toBe(true);
    expect(mine.some((p) => p.fg === '--dzg-pinned-line' && p.bg === '--tz-bg' && p.min >= 3)).toBe(true);
    expect(mine.some((p) => p.fg === '--dzg-pinned-line' && p.bg === '--dzg-pinned-bg' && p.min >= 3)).toBe(true);
  });
});
