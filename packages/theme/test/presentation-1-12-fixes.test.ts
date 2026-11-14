// @vitest-environment node
// 1.12.0, the five corrections before publishing (owner 2026-11-13 « oui lance les 5 corrections »;
// docs/behaviors/presentation-settings.md 34–37). Expectations written by hand; the computed looks (the header's places
// under Tailwind 3's preflight, each variable's default and effect, the forced row text) are checked in real browsers by
// scripts/browser-1-12.mjs (9) and its table.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';
import { ICONS_CSS } from '../../dom/src/theme/icons.js';
import { FILTERS_CSS } from '../../dom/src/filters/styles.js';
import { sheet as read } from './css-tree.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const file = (p: string) => readFileSync(here(p), 'utf8');
const body = (css: string, selector: string) => read(css).rules.filter((r) => r.selector === selector).map((r) => r.body).join('\n');
const COPIES = ['', '.unlayered'] as const;

describe('34: a header with buttons pushed to its end by a growing item, not by a margin a reset takes', () => {
  const SPACER = '.dzg-hcell:has(> .dzg-mbtn, > .dzg-reapply):where(:not([data-align], :has(.dzg-hfbox)))::before';
  for (const c of COPIES) {
    it(`columns${c}.css: the growing item after the title and the sort mark, before the buttons; its gap given back; no auto margin left`, () => {
      const css = file(`../columns${c}.css`);
      const b = body(css, SPACER);
      expect(b).toContain('content: "";');
      expect(b).toContain('order: 1;');
      expect(b).toContain('flex: auto;');
      expect(b).toContain('margin-inline-start: calc(-1 * var(--dzg-space, 0.25rem));');
      // No header button pushed by an auto margin any more.
      for (const r of read(css).rules) if (/\.dzg-(mbtn|fbtn|reapply)\b/.test(r.selector) && !r.selector.includes('dzg-mitem')) expect(r.body, r.selector).not.toMatch(/margin-inline-start: (auto|0)/);
    });
  }

  it('the filters’ layout draws it for a header with a filter button (both sheets’ copies alike: it is injected), no auto margin left', () => {
    expect(FILTERS_CSS).toContain(':where(.dzg-fbtn){order:1;flex:none;inline-size:24px;block-size:24px;position:relative;z-index:1}');
    expect(FILTERS_CSS).toContain(':where(.dzg-hcell:has(>.dzg-fbtn):not([data-align],:has(.dzg-hfbox)))::before{content:"";order:1;flex:auto;margin-inline-start:calc(-1*var(--dzg-space,.25rem))}');
    expect(FILTERS_CSS).not.toContain('margin-inline-start:auto');
    // The end packing kept (a too-narrow cell cuts the title's side, never the grip's gap).
    expect(FILTERS_CSS).toContain(':where(.dzg-hcell:has(>.dzg-fbtn)){justify-content:end}');
  });
});

describe('35: the unsorted mark’s own colour', () => {
  it('drawn by theming()’s icon sheet in --dzg-sort-none-fg, the mark’s colour (the sorted one’s) by default', () => {
    expect(ICONS_CSS).toContain('[data-dzg-icons~=sort-none] .dzg-sort[data-dir=none]::before{background:var(--dzg-sort-none-fg,currentColor)}');
    // After the rule that draws every inline mark in currentColor (same weight: later wins).
    expect(ICONS_CSS.indexOf('{background:var(--dzg-sort-none-fg,currentColor)}')).toBeGreaterThan(ICONS_CSS.indexOf('background:currentColor;'));
  });
});

describe('36: buttons.css, every look of the popups’ buttons a variable, today’s by default', () => {
  // The pager's buttons are not among them (39): they have their own variables.
  const ALL = '.dzg-overlay button, .dzg-ffoot button, .dzg-fadd, .dzg-frm, .dzg-fpreset, .dzg-retry';
  const LIVE = ':where(.dzg-overlay button, .dzg-ffoot button, .dzg-fadd, .dzg-frm, .dzg-fpreset, .dzg-retry)';
  for (const c of COPIES) {
    it(`buttons${c}.css`, () => {
      const css = file(`../buttons${c}.css`);
      const all = body(css, ALL);
      expect(all).toContain('border-color: var(--dzg-button-border, var(--tz-fg-muted));');
      expect(all).toContain('border-radius: var(--dzg-button-radius, var(--dzg-radius, 0.375rem));');
      expect(all).toContain('color: var(--dzg-bf, var(--dzg-button-fg, var(--tz-fg)));');
      expect(all).toContain('background: var(--dzg-bb, var(--dzg-button-bg, var(--dzg-header-bg, var(--tz-bg-raised))));');
      expect(all).toContain('font-weight: var(--dzg-button-font-weight, inherit);');
      // Their text size (39): today's, each inherits its popup's or the overlay's.
      expect(all).toContain('font-size: var(--dzg-button-font-size, 1em);');
      // The pager's squares and the shortcuts keep their padding; a row's Retry its 24 px.
      expect(body(css, '.dzg-overlay button, .dzg-ffoot button, .dzg-fadd, .dzg-frm, .dzg-retry')).toBe('padding-inline: var(--dzg-button-padding-inline, 0.75rem);');
      expect(body(css, '.dzg-overlay button, .dzg-ffoot button, .dzg-fadd, .dzg-frm')).toBe('min-block-size: var(--dzg-button-height, 2rem);');
      // Under the pointer and pressed: unset, no change; pressed falls back on the hover's; no weight added.
      expect(body(css, `${LIVE}:hover`)).toContain('--dzg-bf: var(--dzg-button-hover-fg);');
      expect(body(css, `${LIVE}:hover`)).toContain('--dzg-bb: var(--dzg-button-hover-bg);');
      expect(body(css, `${LIVE}:active`)).toBe('--dzg-bb: var(--dzg-button-active-bg, var(--dzg-button-hover-bg));');
      // The primary one: the accent by default, its own states.
      const p = body(css, '.dzg-ffoot .dzg-fapply');
      expect(p).toContain('--dzg-button-hover-fg: var(--dzg-button-primary-hover-fg);');
      expect(p).toContain('--dzg-button-hover-bg: var(--dzg-button-primary-hover-bg);');
      expect(p).toContain('--dzg-button-active-bg: var(--dzg-button-primary-active-bg);');
      expect(p).toContain('border-color: var(--dzg-button-primary-border, var(--tz-accent));');
      expect(p).toContain('color: var(--dzg-bf, var(--dzg-button-primary-fg, var(--tz-accent-fg)));');
      expect(p).toContain('background: var(--dzg-bb, var(--dzg-button-primary-bg, var(--tz-accent)));');
      expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\b(left|right)\b/i);
    });
  }

  it('buttons.css is layered in dzgrid.theme, its copy unlayered; both compiled from buttons.scss (no drift)', () => {
    expect(file('../buttons.css')).toContain('@layer dzgrid.theme {');
    expect(file('../buttons.unlayered.css')).not.toContain('@layer');
    expect(file('../buttons.css').trim()).toBe(compile(here('../buttons.scss'), { style: 'expanded' }).css.trim());
  });

  it('@dzgrid/theme exports and ships it', () => {
    const pkg = JSON.parse(file('../package.json')) as { exports: Record<string, string>; files: string[] };
    for (const f of ['buttons.css', 'buttons.unlayered.css', 'buttons.scss']) expect([pkg.exports[`./${f}`], pkg.files.includes(f)]).toEqual([`./${f}`, true]);
  });
});

describe('39–40: the pagination bar apart from the popups’ buttons, every look a variable, today’s by default', () => {
  for (const c of COPIES) {
    it(`pager${c}.css: the pager's buttons read their own variables, never the popups' (but the text size)`, () => {
      const css = file(`../pager${c}.css`);
      const b = body(css, '.dzg-pbtn');
      // Its edge through --dzg-bc, set under the pointer and pressed (1.12.0 review, sheet 40).
      expect(b).toContain('border-color: var(--dzg-bc, var(--dzg-pager-button-border, var(--tz-fg-muted)));');
      expect(b).toContain('border-radius: var(--dzg-pager-button-radius, var(--dzg-radius, 0.375rem));');
      expect(b).toContain('color: var(--dzg-bf, var(--dzg-pager-button-fg, var(--tz-fg)));');
      expect(b).toContain('background: var(--dzg-bb, var(--dzg-pager-button-bg, var(--dzg-header-bg, var(--tz-bg-raised))));');
      expect(b).toContain('font-size: var(--dzg-pager-button-font-size, var(--dzg-button-font-size, 1em));');
      expect(b).toContain('font-weight: var(--dzg-pager-button-font-weight, inherit);');
      expect(b).toContain('min-block-size: var(--dzg-pager-button-size, 2rem);');
      // The arrows square, the worded ones (Select all, Clear) padded.
      expect(body(css, '.dzg-pbtn[data-go]')).toBe('inline-size: var(--dzg-pager-button-size, 2rem);');
      expect(body(css, '.dzg-pbtn:not([data-go])')).toBe('padding-inline: var(--dzg-pager-button-padding-inline, 0.75rem);');
      // Under the pointer and pressed: unset, no change; one that cannot act takes none.
      const live = ':where(.dzg-pbtn:not([aria-disabled=true]))';
      expect(body(css, `${live}:hover`)).toBe('--dzg-bf: var(--dzg-pager-button-hover-fg); --dzg-bb: var(--dzg-pager-button-hover-bg); --dzg-bc: var(--dzg-pager-button-hover-border);');
      expect(body(css, `${live}:active`)).toBe('--dzg-bb: var(--dzg-pager-button-active-bg, var(--dzg-pager-button-hover-bg)); --dzg-bc: var(--dzg-pager-button-active-border, var(--dzg-pager-button-hover-border));');
      const off = body(css, '.dzg-pbtn[aria-disabled=true]');
      expect(off).toContain('color: var(--dzg-pager-button-disabled-fg, var(--tz-fg-muted));');
      expect(off).toContain('background: var(--dzg-pager-button-disabled-bg, var(--dzg-pager-button-bg, var(--dzg-header-bg, var(--tz-bg-raised))));');
      // Its edge: its own, or the button's (today's).
      expect(off).toContain('border-color: var(--dzg-pager-button-disabled-border, var(--dzg-pager-button-border, var(--tz-fg-muted)));');
      // No popup button variable reaches the pager but the text size.
      for (const r of read(css).rules.filter((x) => /dzg-pbtn|dzg-footer/.test(x.selector))) {
        expect(r.body.replace('var(--dzg-button-font-size, 1em)', ''), r.selector).not.toMatch(/--dzg-button-/);
      }
    });

    it(`pager${c}.css: the rows-per-page select, each falling back on the pager button's own, then today's; the focus ring`, () => {
      const css = file(`../pager${c}.css`);
      const s = body(css, '.dzg-footer select');
      expect(s).toContain('background: var(--dzg-pager-select-bg, var(--dzg-pager-button-bg, var(--dzg-header-bg, var(--tz-bg-raised))));');
      expect(s).toContain('color: var(--dzg-pager-select-fg, var(--dzg-pager-button-fg, var(--tz-fg)));');
      expect(s).toContain('border-color: var(--dzg-pager-select-border, var(--dzg-pager-button-border, var(--tz-fg-muted)));');
      expect(s).toContain('border-radius: var(--dzg-pager-select-radius, var(--dzg-pager-button-radius, var(--dzg-radius, 0.375rem)));');
      expect(s).toContain('padding-inline: var(--dzg-pager-select-padding-inline, var(--dzg-pager-button-padding-inline, 0.75rem));');
      expect(s).toContain('min-block-size: var(--dzg-pager-select-height, var(--dzg-pager-button-size, 2rem));');
      expect(s).toContain('font-size: var(--dzg-pager-select-font-size, var(--dzg-pager-button-font-size, var(--dzg-button-font-size, 1em)));');
      expect(s).toContain('font-weight: var(--dzg-pager-select-font-weight, var(--dzg-pager-button-font-weight, inherit));');
      // Unset: the browser's own ring (today), never a page reset's taken over by ours.
      expect(body(css, ':where(.dzg-pbtn, .dzg-footer select):focus-visible')).toBe('outline: var(--dzg-pager-focus-ring, revert-layer);');
    });

    it(`pager${c}.css: the strip, the pager's place, its texts`, () => {
      const css = file(`../pager${c}.css`);
      const f = body(css, '.dzg-footer');
      expect(f).toContain('border-block-start: var(--dzg-footer-line, var(--dzg-line, 1px) solid var(--tz-border));');
      expect(f).toContain('padding-block: var(--dzg-footer-padding-block, calc(var(--dzg-space, 0.25rem) * 1));');
      expect(f).toContain('padding-inline: var(--dzg-footer-padding-inline, calc(var(--dzg-space, 0.25rem) * 2));');
      expect(f).toContain('min-block-size: var(--dzg-footer-height, auto);');
      expect(f).toContain('gap: var(--dzg-footer-gap, 0.25rem 1rem);');
      expect(f).toContain('font-size: var(--dzg-footer-font-size, 1em);');
      expect(f).toContain('justify-content: var(--dzg-footer-justify, normal);');
      expect(f).toContain('align-items: var(--dzg-footer-align, center);');
      expect(body(css, '.dzg-footer > nav')).toBe('margin-inline-start: var(--dzg-pager-margin-inline-start, auto);');
      for (const [sel, name, fg] of [['.dzg-pcount', 'count', 'inherit'], ['.dzg-ppage', 'page', 'var(--tz-fg)'], ['.dzg-psize > span', 'label', 'inherit'], ['.dzg-pseltext', 'selected', 'inherit']] as const) {
        const t = body(css, sel);
        expect(t, sel).toContain(`color: var(--dzg-pager-${name}-fg, ${fg});`);
        expect(t, sel).toContain(`font-weight: var(--dzg-pager-${name}-font-weight, inherit);`);
        expect(t, sel).toContain(`font-size: var(--dzg-pager-${name}-font-size, 1em);`);
      }
      expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\b(left|right)\b/i);
    });

    it(`variables${c}.css: the pager's buttons and select no longer read the popups' button variables`, () => {
      const css = file(`../variables${c}.css`);
      for (const r of read(css).rules.filter((x) => /--dzg-button-/.test(x.body))) expect(r.selector, r.selector).not.toMatch(/dzg-pbtn|dzg-footer/);
      expect(body(css, '.dzg-overlay button, .dzg-ffoot button, .dzg-fadd, .dzg-frm, .dzg-fpreset, .dzg-retry')).toContain('color: var(--dzg-button-fg, var(--tz-fg));');
    });
  }

  it('buttons.css holds no pager rule; pager.css is layered in dzgrid.theme, its copy unlayered, both compiled from pager.scss (no drift)', () => {
    for (const c of COPIES) for (const r of read(file(`../buttons${c}.css`)).rules) expect(r.selector).not.toMatch(/dzg-pbtn|dzg-footer|dzg-p(count|page|size|seltext)/);
    expect(file('../pager.css')).toContain('@layer dzgrid.theme {');
    expect(file('../pager.unlayered.css')).not.toContain('@layer');
    expect(file('../pager.css').trim()).toBe(compile(here('../pager.scss'), { style: 'expanded' }).css.trim());
  });

  it('@dzgrid/theme exports and ships pager.css', () => {
    const pkg = JSON.parse(file('../package.json')) as { exports: Record<string, string>; files: string[] };
    for (const f of ['pager.css', 'pager.unlayered.css', 'pager.scss']) expect([pkg.exports[`./${f}`], pkg.files.includes(f)]).toEqual([`./${f}`, true]);
  });

  it('no other sheet reads the buttons’ variables: menus and panels keep their own look', () => {
    for (const f of ['menu', 'columns', 'columns-panel', 'dock', 'filters-panel', 'dzgrid', 'edit', 'grouping', 'pivot']) expect(file(`../${f}.css`), f).not.toMatch(/--dzg-(pager-)?button-/);
  });
});

describe('37: a hovered or selected row’s text', () => {
  for (const c of COPIES) {
    it(`variables${c}.css: --dzg-row-state-fg on the row, the cells’ colour from it (no weight); forced only under the switch`, () => {
      const css = file(`../variables${c}.css`);
      expect(body(css, ':where(.dzg-row:hover:not([data-spans]), .dzg-row[data-hover])')).toBe('--dzg-row-state-fg: var(--dzg-row-hover-fg);');
      expect(body(css, ':where(.dzg-row:focus-within:not([data-dzg-quiet] *))')).toBe('--dzg-row-state-fg: var(--dzg-row-active-fg);');
      expect(body(css, ':where(.dzg-row[aria-selected=true])')).toBe('--dzg-row-state-fg: var(--dzg-row-selected-fg);');
      // Selected last: a selected row under the pointer takes the selected colour.
      expect(css.indexOf('var(--dzg-row-hover-fg)')).toBeLessThan(css.indexOf('var(--dzg-row-selected-fg)'));
      expect(body(css, ':where(.dzg-cell)')).toBe('color: var(--dzg-row-state-fg);');
      const forced = ':where([data-dzg-row-fg=force]) :where(.dzg-row:hover:not([data-spans]), .dzg-row[data-hover], .dzg-row[aria-selected=true]) :where(.dzg-cell:not([data-dzg-editing]), .dzg-cell:not([data-dzg-editing]) *)';
      expect(body(css, forced)).toBe('color: var(--dzg-row-state-fg, inherit) !important;');
      // The only !important of the sheet, and only under the switch.
      expect(css.match(/!important/g)).toHaveLength(1);
    });
  }
});
