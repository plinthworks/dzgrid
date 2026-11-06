// @vitest-environment node
// Moving rows' look (Phase 9, `@dzgrid/theme/row-drag.css`, docs/behaviors/row-move.md 1, 4, 6): loaded only with
// `rowDrag()`; the grip muted (the text colour under the pointer, dimmed when off); the line and the inside outline in the
// column move's colour; the ghost on the header's surface; the moved rows dimmed; system colours in forced colours; no
// colour literal, no physical side, nothing animated; its layer, its source and the unlayered copy; its pairs in
// `check:contrast`. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const file = here('../row-drag.css');
const css = existsSync(file) ? read('row-drag.css') : '';
const s = sheet(css);
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: string, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => r.selector.split(/,\s*/).includes(sel) && at(r)).map((r) => r.body).join(' ');
const forced = (r: Rule) => r.at.some((a) => a.includes('forced-colors'));
const spec = JSON.parse(read('contrast-pairs.json')) as { pairs: { fg: string; bg: string; min: number }[] };
const BAR = 'var(--dzg-move-bar, var(--tz-accent))';

describe('row-drag.css', () => {
  it('exists, opens with the order statement, every rule in dzgrid.theme; its source compiled, its unlayered copy', () => {
    expect(existsSync(file)).toBe(true);
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "row-drag";'));
    expect(read('row-drag.unlayered.css')).toBe(out('@use "row-drag" with ($layered: false);'));
  });

  it('the grip muted, the text colour under the pointer, dimmed when off; the line and the outline in the move colour; the moved rows dimmed', () => {
    expect(decl('.dzg-grip')).toBe('color: var(--tz-fg-muted);');
    expect(decl('.dzg-grip:hover')).toBe('color: var(--tz-fg);');
    expect(decl('.dzg-grip[data-dzg-off]')).toBe('opacity: 0.4;');
    expect(decl('.dzg-rmove-bar')).toBe(`background: ${BAR};`);
    expect(decl('.dzg-rmove-in')).toBe(`outline-color: ${BAR};`);
    expect(decl('.dzg-row[data-dzg-moving]')).toBe('opacity: 0.5;');
    expect(decl('.dzg-rmove-ghost')).toMatch(/background: var\(--dzg-header-bg, var\(--tz-bg-raised\)\); color: var\(--tz-fg\); opacity: 0.8;/);
  });

  it('forced colours: the line and the outline in Highlight, the ghost Canvas / CanvasText, the grip ButtonText (GrayText off)', () => {
    expect(decl('.dzg-rmove-bar', forced)).toBe('forced-color-adjust: none; background: Highlight;');
    expect(decl('.dzg-rmove-in', forced)).toBe('outline-color: Highlight;');
    expect(decl('.dzg-rmove-ghost', forced)).toBe('border-color: CanvasText; background: Canvas; color: CanvasText;');
    expect([decl('.dzg-grip', forced), decl('.dzg-grip[data-dzg-off]', forced)]).toEqual(['color: ButtonText;', 'color: GrayText;']);
  });

  it('nothing animated; no colour literal, no physical side', () => {
    expect(css).not.toMatch(/transition|animation|@keyframes/);
    expect(checkScss(read('row-drag.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
  });

  it('its colours in check:contrast: the line 3:1 on a row, hovered and selected; the grip 3:1 on the same', () => {
    const has = (fg: string, bg: string, min: number) => spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min >= min);
    for (const bg of ['--tz-bg', '--dzg-row-hover-bg', '--dzg-row-selected-bg']) expect([has('--dzg-move-bar', bg, 3), has('--tz-fg-muted', bg, 3)], bg).toEqual([true, true]);
  });
});
