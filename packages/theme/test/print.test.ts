// @vitest-environment node
// The print table's look (Phase 6 step 11, `@dzgrid/theme/print.css`, docs/phase-6-steps/step11-plan.md §4, print.md 5): every
// rule inside `@media print` but the container's `display: none` on screen; the table's borders, padding and colours set
// explicitly (an unlayered reset such as Tailwind's preflight zeroes them otherwise), behind the root marker (doubled weight);
// the header repeated (`table-header-group`), no row cut; the screen hidden only while `.dzg-printing` is on <html>. The two
// rules that must beat the container's inline `display: none` and an app's own display carry `!important`, outside the layer
// (theming.md: `!important` stays out of the layer). Its source compiled, its unlayered twin; no colour literal, no physical side.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => (existsSync(here(`../${f}`)) ? readFileSync(here(`../${f}`), 'utf8') : '');
const css = read('print.css');
const flat = read('print.unlayered.css');
const inPrint = (r: Rule) => r.at.some((a) => /^@media print$/.test(a));

/** A selector's weight (ids, classes and attributes and pseudo-classes, elements), enough for our own selectors and a reset's. */
function weight(sel: string): [number, number, number] {
  const s = sel.replace(/:not\(([^)]*)\)/g, ' $1 ');
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const cls = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length;
  const els = (s.replace(/\.[\w-]+|\[[^\]]+\]|:[\w-]+|#[\w-]+/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return [ids, cls, els];
}
const beats = (a: [number, number, number], b: [number, number, number]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Which declaration wins for `prop` on an element matched by `targets` (selectors that apply), among `rules` (in order). */
function winner(rules: readonly { selector: string; body: string }[], applies: (sel: string) => boolean, prop: string): string | null {
  let best: { w: [number, number, number]; i: number; v: string } | null = null;
  rules.forEach((r, i) => {
    for (const sel of r.selector.split(/,\s*/)) {
      if (!applies(sel)) continue;
      const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(r.body);
      if (!m) continue;
      const w = weight(sel);
      if (!best || beats(w, best.w) > 0 || (beats(w, best.w) === 0 && i > best.i)) best = { w, i, v: m[1]!.trim() };
    }
  });
  return best ? (best as { v: string }).v : null;
}

describe('print.css', () => {
  it('exists with its unlayered twin and its source; opens with the order statement', () => {
    expect(css).not.toBe('');
    expect(sheet(css).first).toBe(`${ORDER};`);
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "print";'));
    expect(flat).toBe(out('@use "print" with ($layered: false);'));
  });

  for (const [name, text] of [['print.css', css], ['print.unlayered.css', flat]] as const) {
    it(`${name}: no rule outside @media print but the container's display: none on screen`, () => {
      const s = sheet(text);
      expect(s.rules.filter((r) => !inPrint(r)).map((r) => `${r.selector} { ${r.body} }`)).toEqual(['.dzg-print { display: none; }']);
    });

    it(`${name}: the screen hidden and the table shown only under the root marker, over an inline display (!important, unlayered)`, () => {
      const r = sheet(text).rules.filter(inPrint);
      const hide = r.find((x) => x.selector === '.dzg-printing body > :not(.dzg-print)');
      const show = r.find((x) => x.selector === '.dzg-printing .dzg-print');
      expect(hide?.body).toBe('display: none !important;');
      expect(show?.body).toBe('display: block !important;');
      expect([hide?.layers, show?.layers]).toEqual([[], []]);
    });

    it(`${name}: the header repeated on each page, no row cut, the caption and the note at the start`, () => {
      const r = sheet(text).rules.filter(inPrint);
      const decl = (sel: string) => r.filter((x) => x.selector.split(/,\s*/).includes(sel)).map((x) => x.body).join(' ');
      expect(decl('.dzg-printing .dzg-print thead')).toMatch(/display: table-header-group/);
      expect(decl('.dzg-printing .dzg-print tr')).toMatch(/break-inside: avoid/);
      expect(decl('.dzg-printing .dzg-print caption')).toMatch(/caption-side: top/);
      expect(decl('.dzg-printing .dzg-print caption')).toMatch(/text-align: start/);
      expect(decl('.dzg-printing .dzg-print th')).toMatch(/text-align: start/);
      expect(decl('.dzg-printing .dzg-print-note')).toMatch(/text-align: start/);
      expect(text).not.toMatch(/tfoot/);
    });
  }

  it('the layered sheet: its table rules in dzgrid.theme; the twin: none layered', () => {
    const layered = sheet(css).rules.filter((r) => !/!important/.test(r.body));
    expect(layered.filter((r) => r.layers.join('/') !== 'dzgrid.theme').map((r) => r.selector)).toEqual([]);
    expect(sheet(flat).rules.filter((r) => r.layers.length).map((r) => r.selector)).toEqual([]);
  });

  it('under an unlayered preflight (Tailwind\'s `*{border-width:0}`, `table{border-collapse:separate}`, `th{text-align:inherit}`), the twin still draws 1 px black borders, collapsed, black on white', () => {
    const preflight = [
      { selector: '*, ::before, ::after', body: 'box-sizing: border-box; border-width: 0; border-style: solid; border-color: currentColor;' },
      { selector: 'table', body: 'text-indent: 0; border-color: inherit; border-collapse: separate;' },
      { selector: 'th', body: 'text-align: inherit; font-weight: inherit;' },
      { selector: 'td', body: 'padding: 0;' },
    ];
    // The page's reset first, then the grid's twin (order matters only on a tie).
    const all = [...preflight, ...sheet(flat).rules.filter(inPrint)];
    const td = (sel: string) => sel === '*' || /^\*/.test(sel) || sel === 'td' || /\.dzg-printing \.dzg-print td$/.test(sel);
    const th = (sel: string) => sel === '*' || /^\*/.test(sel) || sel === 'th' || /\.dzg-printing \.dzg-print th$/.test(sel);
    const tbl = (sel: string) => sel === '*' || /^\*/.test(sel) || sel === 'table' || /\.dzg-printing \.dzg-print table$/.test(sel);
    expect(winner(all, td, 'border')).toBe('1px solid black');
    expect(winner(all, th, 'border')).toBe('1px solid black');
    expect(winner(all, td, 'padding')).toBe('0.2em 0.4em');
    expect(winner(all, th, 'text-align')).toBe('start');
    expect(winner(all, tbl, 'border-collapse')).toBe('collapse');
    expect(winner(all, tbl, 'color')).toBe('black');
    expect(winner(all, tbl, 'background')).toBe('white');
    // The border shorthand wins over the reset's border-width by weight: ours is heavier than `*`.
    expect(beats(weight('.dzg-printing .dzg-print td'), weight('*'))).toBeGreaterThan(0);
  });

  it('the base theme\'s own print rule untouched (the resize grip and the tooltip hidden)', () => {
    expect(read('dzgrid.scss')).toMatch(/@media print \{[\s\S]*?\.dzg-resize[\s\S]*?\.dzg-tooltip/);
  });

  it('no colour literal, no physical side, nothing animated', () => {
    expect(checkScss(read('print.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
    expect(css).not.toMatch(/transition|animation|@keyframes/);
  });
});
