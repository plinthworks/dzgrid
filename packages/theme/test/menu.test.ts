// @vitest-environment node
// The menus' look on its own (Phase 9, `@dzgrid/theme/menu.css`, docs/behaviors/context-menu.md; context-menu-plan §3):
// the list's rules moved from columns.scss into the `_menu-list` partial, columns.css unchanged by it; menu.css carries the
// same rules (same selectors) for an app with the cell menu and no column menu, plus the submenu's mark toward the
// inline end (mirrored in Arabic), CanvasText in forced colours; its layer, its source and the unlayered copy; no
// colour literal, no physical side. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const file = here('../menu.css');
const css = existsSync(file) ? read('menu.css') : '';
const s = sheet(css);
const cols = sheet(read('columns.css'));
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: RegExp, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => r.selector.split(/,\s*/).some((x) => sel.test(x)) && at(r)).map((r) => r.body).join(' ');
const media = (q: string) => (r: Rule) => r.at.some((a) => a.includes(q));
const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;

describe('menu.css', () => {
  it('exists, opens with the order statement, every rule in dzgrid.theme; its source compiled, its unlayered copy', () => {
    expect(existsSync(file)).toBe(true);
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
    expect(css).toBe(out('@use "menu";'));
    expect(read('menu.unlayered.css')).toBe(out('@use "menu" with ($layered: false);'));
  });

  it('every menu rule of columns.css, the same selector and body, is in menu.css', () => {
    const isMenu = (r: Rule) => /\.dzg-(menu|mkeys)\b/.test(r.selector);
    const want = cols.rules.filter(isMenu).map((r) => `${r.at.join('|')} ${r.selector} { ${r.body} }`);
    expect(want.length).toBeGreaterThan(6);
    const have = s.rules.filter(isMenu).map((r) => `${r.at.join('|')} ${r.selector} { ${r.body} }`);
    expect(want.filter((x) => !have.includes(x))).toEqual([]);
  });

  it('columns.css still compiles from its source (the partial changed nothing it says)', () => {
    expect(read('columns.css')).toBe(out('@use "columns";'));
  });

  it('the submenu mark: a chevron at the item’s inline end, mirrored in right to left; CanvasText in forced colours', () => {
    const d = decl(/^\.dzg-msub$/);
    expect(d).toMatch(/margin-inline-start: auto/);
    expect(d).toMatch(/background: currentColor/);
    expect(d).toMatch(/clip-path: /);
    expect(decl(/^\[dir=rtl\] \.dzg-msub$/)).toMatch(/transform: scaleX\(-1\)/);
    expect(decl(/^\.dzg-msub$/, media('forced-colors'))).toMatch(/background: CanvasText/);
  });

  it('no colour literal, no physical side', () => {
    expect(checkScss(read('menu.scss'))).toEqual([]);
    expect(checkScss(read('_menu-list.scss'))).toEqual([]);
  });
});
