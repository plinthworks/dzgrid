// @vitest-environment node
// The keyboard position made obvious (owner S12-Q8, 2026-10-25, « je ne vois pas la cellule sélectionnée ») in the
// base theme: the focused cell — reached by the keys OR by a click (`:focus`, not only `:focus-visible`) — gets a
// 2 px ring in the focus colour, an inner line in the page's background (it reads on any tint), and a light tint of
// its own; its row a subtle tint across the whole row (its pinned segments too), a hue apart from hover, from
// selected rows and from a block. Nothing changes size (no border width), forced colours show a Highlight ring and
// no tint, no physical side; every colour checked by `check:contrast` (the pairs listed below).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sheet, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const css = read('dzgrid.css');
const s = sheet(css);
const plain = (r: Rule) => r.at.length === 0;
const rules = (sel: RegExp, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => r.selector.split(/,\s*/).some((x) => sel.test(x)) && at(r));
const decl = (sel: RegExp, at: (r: Rule) => boolean = plain) => rules(sel, at).map((r) => r.body).join(' ');
const spec = JSON.parse(read('contrast-pairs.json')) as { derived: Record<string, string>; pairs: { what: string; fg: string; bg: string; min: number; hue?: number }[] };

describe('the active cell and its row (owner S12-Q8)', () => {
  it('the focused cell, by keys or by a click: a 2 px ring of the focus colour inside the cell, an inner line of the background, a tint', () => {
    const c = decl(/^\.dzg-cell:focus$/);
    expect(c).toMatch(/outline: 2px solid var\(--dzg-focus-ring, var\(--tz-accent\)\)/);
    expect(c).toMatch(/outline-offset: -2px/);
    // The inner contrast line: one px of the page's background inside the ring (the outline paints over the shadow).
    expect(c).toMatch(/box-shadow: inset 0 0 0 3px var\(--tz-bg\)/);
    expect(c).toMatch(/background: var\(--dzg-cell-active-bg, color-mix\(in srgb, var\(--tz-accent\) \d+%, var\(--tz-bg\)\)\)/);
    // No size change: neither a border nor a width.
    expect(c).not.toMatch(/border|width|padding|margin/);
  });

  it('the focused row: a tint across the row and its pinned segments, its own variable, a neutral mix (not the accent of hover and selection)', () => {
    for (const sel of [/^\.dzg-row:focus-within$/, /^\.dzg-row:focus-within \.dzg-seg-start$/, /^\.dzg-row:focus-within \.dzg-seg-end$/]) {
      expect(decl(sel), String(sel)).toMatch(/background: var\(--dzg-row-active-bg, color-mix\(in srgb, var\(--tz-fg\) \d+%, var\(--tz-bg\)\)\)/);
    }
  });

  it('the order: hover, then the focused row, then a selected row (a selected row keeps its own tint)', () => {
    const at = (re: RegExp) => s.rules.findIndex((r) => plain(r) && r.selector.split(/,\s*/).some((x) => re.test(x)));
    const hover = at(/^\.dzg-row\[data-hover\]$/);
    const active = at(/^\.dzg-row:focus-within$/);
    const selected = at(/^\.dzg-row\[aria-selected='?true'?\]$/);
    expect(hover).toBeGreaterThan(-1);
    expect(active).toBeGreaterThan(hover);
    expect(selected).toBeGreaterThan(active);
  });

  it('forced colours: the ring in Highlight (the tints are the system\'s Canvas)', () => {
    expect(decl(/^\.dzg-cell:focus$/, (r) => r.at.some((a) => a.includes('forced-colors: active')))).toMatch(/outline-color: Highlight/);
  });

  it('every colour is checked: the tints derived as the theme writes them, the ring and the text on them', () => {
    expect(spec.derived['--dzg-cell-active-bg']).toMatch(/^color-mix\(in srgb, var\(--tz-accent\) \d+%, var\(--tz-bg\)\)$/);
    expect(spec.derived['--dzg-row-active-bg']).toMatch(/^color-mix\(in srgb, var\(--tz-fg\) \d+%, var\(--tz-bg\)\)$/);
    // The fallbacks in the CSS are the derived values (one source of truth).
    expect(decl(/^\.dzg-cell:focus$/)).toContain(`var(--dzg-cell-active-bg, ${spec.derived['--dzg-cell-active-bg']})`);
    expect(decl(/^\.dzg-row:focus-within$/)).toContain(`var(--dzg-row-active-bg, ${spec.derived['--dzg-row-active-bg']})`);
    const has = (fg: string, bg: string, min: number) => spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min >= min);
    expect(has('--dzg-focus-ring', '--dzg-cell-active-bg', 3)).toBe(true);
    expect(has('--dzg-focus-ring', '--dzg-row-active-bg', 3)).toBe(true);
    expect(has('--tz-fg', '--dzg-cell-active-bg', 4.5)).toBe(true);
    expect(has('--tz-fg-muted', '--dzg-cell-active-bg', 4.5)).toBe(true);
    expect(has('--tz-fg', '--dzg-row-active-bg', 4.5)).toBe(true);
    expect(has('--tz-fg-muted', '--dzg-row-active-bg', 4.5)).toBe(true);
    // Not confused with the saving or the refused border: a hue apart.
    expect(spec.pairs.some((p) => p.fg === '--dzg-refused-color' && p.bg === '--dzg-focus-ring' && (p.hue ?? 0) >= 60)).toBe(true);
    expect(spec.pairs.some((p) => p.fg === '--dzg-saving-color' && p.bg === '--dzg-focus-ring' && (p.hue ?? 0) >= 60)).toBe(true);
  });

  it('the block\'s edge: a hue 60° from the refused border, and 3:1 next to the focused row', () => {
    expect(spec.pairs.some((p) => p.fg === '--dzg-range-edge' && p.bg === '--dzg-refused-color' && (p.hue ?? 0) >= 60)).toBe(true);
    expect(spec.pairs.some((p) => p.fg === '--dzg-range-edge' && p.bg === '--dzg-row-active-bg' && p.min >= 3)).toBe(true);
  });

  it('contrast.css (high contrast): its dark refusal colour pinned a hue 60° from its yellow ring (the borders told apart without colour vision)', () => {
    expect(read('contrast.scss')).toMatch(/'--dzg-refused-color': \(#8b0000, #ff6b9e\)/);
  });

  it('no colour literal, no physical side', () => {
    expect(checkScss(read('dzgrid.scss'))).toEqual([]);
    expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
  });
});
