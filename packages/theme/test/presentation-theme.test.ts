// @vitest-environment node
// Presentation settings, the theme's side (docs/behaviors/presentation-settings.md 2, 7–16; owner 2026-11-09): the
// base reads the alternate rows', the pinned shadow's and the density's variables; every other knob lives in the
// opt-in `variables.css`, its defaults today's look. Expectations written by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';
import { checkScss } from '../../dom/test/guards.js';
import { LAYOUT_CSS } from '../../dom/src/styles.js';
import { ORDER, sheet as read } from './css-tree.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const file = (p: string) => readFileSync(here(p), 'utf8');
const base = file('../dzgrid.css');
const vars = file('../variables.css');
const pairs = JSON.parse(file('../contrast-pairs.json')) as { pairs: { fg: string; bg: string; min: number; what: string }[]; derived: Record<string, string> };
/** A rule's body by its exact selector, in a sheet. */
const body = (css: string, selector: string) => read(css).rules.filter((r) => r.selector === selector).map((r) => r.body).join('\n');

describe('the base reads three new variables (2, 7, 15)', () => {
  it('rows on --dzg-odd (set from --dzg-row-odd-bg on data-odd rows by the layout), else the surface', () => {
    expect(body(base, '.dzg-row, .dzg-row .dzg-seg-start, .dzg-row .dzg-seg-end')).toContain('background: var(--dzg-odd, var(--tz-bg));');
    expect(LAYOUT_CSS).toContain(':where(.dzg-row[data-odd]) { --dzg-odd: var(--dzg-row-odd-bg); }');
  });

  it('hover, the focused row and selection still come after the odd tint (they win at the same weight)', () => {
    const at = (s: string) => base.indexOf(s);
    expect(at('var(--dzg-odd, var(--tz-bg))')).toBeLessThan(at('var(--dzg-row-hover-bg'));
    expect(at('var(--dzg-odd, var(--tz-bg))')).toBeLessThan(at('var(--dzg-row-active-bg'));
    expect(at('var(--dzg-odd, var(--tz-bg))')).toBeLessThan(at('var(--dzg-row-selected-bg'));
  });

  it('the side padding times the density, 1 by default; compact .75, spacious 1.25', () => {
    expect(base).toContain('padding-inline: calc(var(--dzg-cell-padding-inline, 0.5rem) * var(--dzg-density, 1));');
    expect(base).toContain('padding-inline-start: calc(var(--dzg-cell-padding-inline, 0.5rem) * var(--dzg-density, 1) - 3px);');
    expect(LAYOUT_CSS).toContain(':where(.dzg[data-density=compact]) { --dzg-density: .75; }');
    expect(LAYOUT_CSS).toContain(':where(.dzg[data-density=spacious]) { --dzg-density: 1.25; }');
  });

  it('the pinned shadow only while content is under, mirrored for the end side and in right to left', () => {
    expect(LAYOUT_CSS).toContain(':where(.dzg[data-under-start] .dzg-seg-start, .dzg[data-under-end] .dzg-seg-end)::after { box-shadow: var(--dzg-pinned-shadow); }');
    expect(LAYOUT_CSS).toContain(':where(.dzg-seg-start:dir(rtl), .dzg-seg-end:dir(ltr))::after { scale: -1 1; }');
  });

  it('header titles over their cells and tabular digits in the layout', () => {
    expect(LAYOUT_CSS).toContain(':where(.dzg-cell[data-align=end], .dzg-hcell[data-align=end] > .dzg-hlabel) { text-align: end; }');
    expect(LAYOUT_CSS).toContain(':where(.dzg-hcell[data-align] > .dzg-hlabel) { flex: auto; }');
    expect(LAYOUT_CSS).toContain(':where(.dzg-cell[data-num]) { font-variant-numeric: var(--dzg-num-figures, tabular-nums); }');
  });
});

describe('@dzgrid/theme/variables.css (8–16)', () => {
  it('is what variables.scss compiles to, and its unlayered copy too (no drift)', () => {
    expect(vars.trim()).toBe(compile(here('../variables.scss'), { style: 'expanded' }).css.trim());
    const copy = file('../variables.unlayered.css');
    expect(copy).not.toContain('@layer');
    expect(copy).toContain('var(--dzg-frame, var(--dzg-line, 1px) solid var(--tz-border))');
  });

  it('sits in dzgrid.theme, after the order statement; no colour literal, no physical side', () => {
    const sheet = read(vars);
    expect(sheet.first).toBe(`${ORDER};`);
    for (const r of sheet.rules.filter((x) => !x.selector.includes('tz-field__panel'))) expect(r.layers, r.selector).toEqual(['dzgrid.theme']);
    expect(checkScss(file('../variables.scss'))).toEqual([]);
    expect(vars).not.toMatch(/:root\s*\{[^}]*--dzg-/);
  });

  it('lines: each its own variable, falling back to today’s value (8, 9)', () => {
    expect(body(vars, '.dzg')).toContain('border: var(--dzg-frame, var(--dzg-line, 1px) solid var(--tz-border));');
    expect(body(vars, '.dzg')).toContain('border-radius: var(--dzg-frame-radius, var(--dzg-radius, 0.375rem));');
    expect(vars).toContain('border-block-end: var(--dzg-row-line, var(--dzg-line, 1px) solid var(--tz-border));');
    expect(vars).toContain('border-block-end: var(--dzg-header-line, var(--dzg-line, 1px) solid var(--tz-border));');
    expect(vars).toContain('border-inline-end: var(--dzg-pinned-column-line, var(--dzg-line, 1px) solid var(--tz-border));');
    expect(vars).toContain('border-inline-start: var(--dzg-detail-line, 3px solid var(--tz-border));');
    const grip = body(vars, '.dzg-resize::after');
    expect(grip).toContain('inset-block: calc((100% - var(--dzg-header-separator-height, 50%)) / 2);');
    expect(grip).toContain('inline-size: var(--dzg-header-separator-size, 2px);');
    expect(grip).toContain('background: var(--dzg-header-separator, var(--tz-border));');
    // Column lines: none by default; never on a group header (its own end line), none after a pinned part's last cell.
    expect(body(vars, '.dzg-cell, .dzg-hcell:not(.dzg-hgroup)')).toContain('border-inline-end: var(--dzg-column-line, none);');
    expect(body(vars, ':is(.dzg-seg-start, .dzg-seg-end) > :last-child')).toContain('border-inline-end: none;');
  });

  it('header type, colour, place and hover (10, 11)', () => {
    const h = body(vars, '.dzg-header');
    expect(h).toContain('color: var(--dzg-header-fg, var(--tz-fg));');
    expect(h).toContain('font-weight: var(--dzg-header-weight, 600);');
    const row = body(vars, '.dzg-hrow');
    expect(row).toContain('font-family: var(--dzg-header-font-family);');
    expect(row).toContain('text-transform: var(--dzg-header-case);');
    expect(body(vars, '.dzg-hcell')).toContain('align-items: var(--dzg-header-align-block, center);');
    expect(body(vars, '.dzg-sortable:hover')).toContain('background: var(--dzg-header-hover-bg, var(--dzg-header-bg, var(--tz-bg-raised)));');
  });

  it('cells: font size, wrapped padding, block alignment (11)', () => {
    expect(body(vars, '.dzg-cell')).toContain('font-size: var(--dzg-cell-font-size);');
    expect(body(vars, '.dzg-cell')).toContain('align-content: var(--dzg-cell-align-block);');
    expect(body(vars, '.dzg-cell[data-wrap]')).toContain('padding-block: var(--dzg-cell-padding-block, 0);');
  });

  it('small surfaces, each on today’s colour (12)', () => {
    const box = body(vars, '.dzg-box');
    expect(box).toContain('inline-size: var(--dzg-box-size, 1rem);');
    expect(box).toContain('border-radius: var(--dzg-box-radius, 0.25rem);');
    expect(box).toContain('outline-color: var(--dzg-box-edge, var(--tz-fg-muted));');
    expect(vars).toContain('background: var(--dzg-box-on-bg, var(--tz-accent));');
    expect(vars).toContain('outline-width: max(2px, var(--dzg-focus-width, 2px));');
    const popup = body(vars, '.dzg .dzg-popup');
    expect(popup).toContain('background: var(--dzg-popup-bg, var(--tz-bg));');
    expect(popup).toContain('box-shadow: var(--dzg-popup-shadow, 0 0.25rem 0.75rem color-mix(in srgb, var(--tz-fg) 20%, transparent));');
    const tip = body(vars, '.dzg-tooltip');
    expect(tip).toContain('color: var(--dzg-tooltip-fg, var(--tz-bg));');
    expect(tip).toContain('background: var(--dzg-tooltip-bg, var(--tz-fg));');
    expect(vars).toContain('border-color: var(--dzg-input-border, var(--tz-fg-muted));');
    expect(vars).toContain('background: var(--dzg-input-bg, var(--tz-bg));');
    expect(vars).toContain('border-color: var(--dzg-button-border, var(--tz-fg-muted));');
    expect(vars).toContain('background: var(--dzg-button-bg, var(--dzg-header-bg, var(--tz-bg-raised)));');
  });

  it('the spacing unit: the base’s gaps as its multiples, .25rem by default (14)', () => {
    expect(body(vars, '.dzg-hcell, .dzg-check')).toContain('gap: calc(var(--dzg-space, 0.25rem) * 1);');
    expect(body(vars, '.dzg .dzg-popup')).toContain('padding: calc(var(--dzg-space, 0.25rem) * 3);');
    expect(body(vars, '.dzg-overlay')).toContain('gap: calc(var(--dzg-space, 0.25rem) * 2);');
  });

  it('the icon size: the sort mark and the funnel, 12 px for the funnel by default — today’s insets (16)', () => {
    expect(body(vars, '.dzg-sort')).toContain('font-size: var(--dzg-icon-size, 0.75em);');
    const f = body(vars, '.dzg-fbtn::before, .dzg-fbtn::after');
    // 24 px button, 12 px funnel: 6 px each side, 6 px above, 7 below (today's inset-block: 6px 7px; inset-inline: 6px).
    expect(f).toContain('inset-inline: calc(50% - var(--dzg-icon-size, 12px) / 2);');
    expect(f).toContain('inset-block: calc(50% - var(--dzg-icon-size, 12px) / 2) calc(50% - var(--dzg-icon-size, 12px) / 2 + var(--dzg-icon-size, 12px) / 12);');
  });

  it('every new colour joins contrast-pairs.json with today’s colour as its default (13)', () => {
    const want: Record<string, string> = {
      '--dzg-row-odd-bg': 'var(--tz-bg)',
      '--dzg-header-fg': 'var(--tz-fg)',
      '--dzg-header-hover-bg': 'var(--dzg-header-bg)',
      '--dzg-popup-bg': 'var(--tz-bg)',
      '--dzg-tooltip-bg': 'var(--tz-fg)',
      '--dzg-tooltip-fg': 'var(--tz-bg)',
      '--dzg-input-bg': 'var(--tz-bg)',
      '--dzg-input-border': 'var(--tz-fg-muted)',
      '--dzg-button-bg': 'var(--dzg-header-bg)',
      '--dzg-button-border': 'var(--tz-fg-muted)',
      '--dzg-box-on-bg': 'var(--tz-accent)',
      '--dzg-box-edge': 'var(--tz-fg-muted)',
      '--dzg-panel-bg': 'var(--tz-bg)',
      '--dzg-group-row-bg': 'var(--dzg-header-bg)',
      '--dzg-editor-border': 'var(--dzg-focus-ring)',
    };
    for (const [v, d] of Object.entries(want)) {
      expect(pairs.derived[v], v).toBe(d);
      expect(pairs.pairs.some((p) => p.fg === v || p.bg === v), v).toBe(true);
    }
    const has = (fg: string, bg: string, min: number) => pairs.pairs.some((p) => p.fg === fg && p.bg === bg && p.min === min);
    expect(has('--tz-fg', '--dzg-row-odd-bg', 4.5)).toBe(true);
    expect(has('--dzg-header-fg', '--dzg-header-bg', 4.5)).toBe(true);
    expect(has('--dzg-header-fg', '--dzg-header-hover-bg', 4.5)).toBe(true);
    expect(has('--dzg-tooltip-fg', '--dzg-tooltip-bg', 4.5)).toBe(true);
    expect(has('--dzg-input-border', '--dzg-input-bg', 3)).toBe(true);
    expect(has('--dzg-box-edge', '--tz-bg', 3)).toBe(true);
    expect(has('--tz-accent-fg', '--dzg-box-on-bg', 3)).toBe(true);
  });

  it('the feature sheets read theirs: menu items, group rows, panels, an editor, scrollbars (12)', () => {
    for (const f of ['../menu.css', '../columns.css']) expect(file(f), f).toContain('min-block-size: max(var(--dzg-target-min, 24px), var(--dzg-menu-item-height, 32px));');
    expect(file('../grouping.css')).toContain('background: var(--dzg-group-row-bg, var(--dzg-header-bg, var(--tz-bg-raised)));');
    expect(body(file('../dock.css'), '.dzg-dock')).toContain('background: var(--dzg-panel-bg, var(--tz-bg));');
    expect(body(file('../filters-panel.css'), '.dzg-fside')).toContain('background: var(--dzg-panel-bg, var(--tz-bg));');
    expect(body(file('../edit.css'), '.dzg-field:focus')).toContain('outline: 2px solid var(--dzg-editor-border, var(--dzg-focus-ring, var(--tz-accent)));');
    const comfort = file('../dzgrid.comfort.css');
    expect(comfort).toContain('scrollbar-color: var(--dzg-scrollbar-thumb, var(--tz-border)) transparent;');
    expect(comfort).toContain('scrollbar-color: var(--dzg-scrollbar-thumb-active, var(--tz-fg-muted)) transparent;');
    expect(comfort).toContain('background: var(--dzg-scrollbar-thumb, var(--tz-border));');
    expect(comfort).toContain('background: var(--dzg-scrollbar-thumb-active, var(--tz-fg-muted));');
  });

  it('the header buttons keep their gap for the grip whatever the density (15)', () => {
    expect(file('../columns.css')).toContain('inline-size: calc(var(--dzg-target-min, 24px) - var(--dzg-cell-padding-inline, 0.5rem) * var(--dzg-density, 1));');
    expect(file('../columns.css')).not.toContain('- var(--dzg-cell-padding-inline, 0.5rem));');
  });
});

