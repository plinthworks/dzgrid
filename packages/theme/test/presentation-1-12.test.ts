// @vitest-environment node
// 1.12.0, the theme's side (docs/behaviors/presentation-settings.md 24, 26–33; owner 2026-11-13 « toujours laisser le
// choix », B: no promised class, every look a variable). Expectations written by hand; the computed looks (each
// variable's default unchanged, its effect) are checked in real browsers by scripts/browser-1-12.mjs.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';
import { THEME_KEYS } from '../../dom/src/theme/index.js';
import { ICONS_CSS } from '../../dom/src/theme/icons.js';
import { sheet as read } from './css-tree.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const file = (p: string) => readFileSync(here(p), 'utf8');
const body = (css: string, selector: string) => read(css).rules.filter((r) => r.selector === selector).map((r) => r.body).join('\n');
const COPIES = ['', '.unlayered'] as const;
const base = (c: string) => file(`../dzgrid${c}.css`);
const vars = (c: string) => file(`../variables${c}.css`);
const pairs = JSON.parse(file('../contrast-pairs.json')) as { pairs: { fg: string; bg: string; min: number; what: string }[]; derived: Record<string, string> };

describe('a default mark only where the app gave no icon (24), in both copies', () => {
  for (const c of COPIES) {
    it(`dzgrid${c}.css: the sort triangles and the funnel guarded, no weight added`, () => {
      const css = base(c);
      expect(body(css, ".dzg-sort[data-dir=asc]:where(:not([data-dzg-icons~=sort-asc] *))::before")).toContain('content: "▲"');
      expect(body(css, ".dzg-sort[data-dir=desc]:where(:not([data-dzg-icons~=sort-desc] *))::before")).toContain('content: "▼"');
      const funnel = '.dzg-fbtn:where(:not([data-dzg-icons~=filter] *, [data-dzg-icons~=filter-active] [data-dzg-filtered] > *))::before';
      const hollow = '.dzg-fbtn:where(:not([data-dzg-icons~=filter] *))::after';
      expect(read(css).rules.some((r) => r.selector.includes(funnel) && r.body.includes('clip-path: polygon('))).toBe(true);
      expect(read(css).rules.some((r) => r.selector.includes(hollow) && r.body.includes('clip-path: polygon('))).toBe(true);
      // No unguarded drawing left: every rule that draws the funnel or a triangle names its icon.
      for (const r of read(css).rules) {
        if (/\.dzg-fbtn::(before|after)|\.dzg-sort\[data-dir=\w+\]::before/.test(r.selector)) expect(r.body, r.selector).not.toMatch(/clip-path|content: "[▲▼]"/);
      }
    });

    it(`variables${c}.css: the funnel's insets guarded too`, () => {
      const css = vars(c);
      expect(css).toContain('.dzg-fbtn:where(:not([data-dzg-icons~=filter] *, [data-dzg-icons~=filter-active] [data-dzg-filtered] > *))::before');
      expect(css).not.toMatch(/^\s*\.dzg-fbtn::(before|after)/m);
    });

    it(`columns${c}.css and menu${c}.css: the ⋮ and the submenu arrow guarded`, () => {
      expect(file(`../columns${c}.css`)).toContain('.dzg-mbtn:where(:not([data-dzg-icons~=menu] *))::before');
      const menu = file(`../menu${c}.css`);
      expect(menu).toContain('.dzg-msub:where(:not([data-dzg-icons~=submenu] *))');
      expect(body(menu, '.dzg-msub')).not.toContain('clip-path');
    });
  }

  it('icons: a button’s icon draws its own box (the guarded default no longer gives it content or place)', () => {
    expect(ICONS_CSS).toContain('[data-dzg-icons~=menu] .dzg-mbtn::before{content:"";position:absolute;inset:0;clip-path:none;');
  });

  it('icons: sortNone has its mark and its variable', () => {
    expect(ICONS_CSS).toContain('[data-dzg-icons~=sort-none] .dzg-sort[data-dir=none]::before{--dzg-i:var(--dzg-icon-sort-none)}');
  });
});

describe('the base sheet (30–32), both copies', () => {
  for (const c of COPIES) {
    it(`dzgrid${c}.css: inputs edged by an outline over a transparent border (a reset cannot erase it); none just works`, () => {
      const b = body(base(c), '.dzg-finput, .dzg-fop, .dzg-fclear');
      expect(b).toContain('border: 1px solid transparent;');
      expect(b).toContain('outline: 1px solid var(--dzg-input-border, light-dark(color-mix(in srgb, var(--tz-fg-muted) 75%, var(--tz-bg)), var(--tz-fg-muted)));');
      expect(b).toContain('outline-offset: -1px;');
      expect(b).toContain('background: var(--dzg-input-bg, var(--tz-bg));');
      expect(base(c)).toContain('border-inline-end: 4px solid var(--tz-danger);');
    });

    it(`dzgrid${c}.css: the tooltip at the cells' size; variables${c}.css: its side's arrow, off at 0`, () => {
      expect(body(base(c), '.dzg-tooltip')).toContain('font-size: var(--dzg-cell-font-size, 1em);');
      expect(base(c)).not.toContain('--dzg-tooltip-arrow');
      const css = vars(c);
      expect(body(css, '.dzg-tooltip::before')).toContain('inline-size: calc(2 * var(--dzg-tooltip-arrow-size, 0.375rem));');
      expect(body(css, '.dzg-tooltip::before')).toContain('background: var(--dzg-tooltip-arrow-color, var(--dzg-tooltip-bg, var(--tz-fg)));');
      expect(body(css, '.dzg-tooltip::before')).toContain('inset-inline-start: calc(var(--dzg-tip-at, 1rem) - var(--dzg-tooltip-arrow-size, 0.375rem));');
      // Below by default: the arrow on the tooltip's top edge; above (block-start): at its bottom edge, turned.
      expect(body(css, '.dzg-tooltip::before')).toContain('inset-block-end: 100%;');
      expect(body(css, '.dzg-tooltip[data-side=block-start]::before')).toContain('inset-block: 100% auto;');
      expect(body(css, '.dzg-tooltip[data-side=block-start]::before')).toContain('rotate: 180deg;');
      expect(css).toContain('margin-block-start: var(--dzg-tooltip-arrow-size, 0.375rem);');
      expect(body(css, '.dzg-tooltip[data-side=block-start]')).toContain('margin-block-start: calc(-1 * var(--dzg-tooltip-arrow-size, 0.375rem));');
    });

    it(`dzgrid${c}.css: the focused cell's tint a colour only (a background image — the column separator — stays)`, () => {
      expect(body(base(c), '.dzg-cell:focus:where(:not([data-dzg-quiet] *))')).toContain('background-color: var(--dzg-cell-active-bg');
    });
  }
});

describe('variables.css: every new knob, today\'s look by default (26–33), both copies', () => {
  for (const c of COPIES) {
    it(`variables${c}.css`, () => {
      const css = vars(c);
      // 27: zero weight, unset = inherited.
      expect(body(css, ':where(.dzg-row:hover:not([data-spans]), .dzg-row[data-hover]) :where(.dzg-cell)')).toBe('color: var(--dzg-row-hover-fg);');
      expect(body(css, ':where(.dzg-row[aria-selected=true]) :where(.dzg-cell)')).toBe('color: var(--dzg-row-selected-fg);');
      expect(css.indexOf('var(--dzg-row-hover-fg)')).toBeLessThan(css.indexOf('var(--dzg-row-selected-fg)'));
      // 28: no colour, no image.
      expect(body(css, '.dzg-cell')).toContain('background-image: linear-gradient(var(--dzg-column-separator) 0 0);');
      expect(body(css, '.dzg-cell')).toContain('background-size: var(--dzg-column-separator-size, var(--dzg-line, 1px)) var(--dzg-column-separator-height, 100%);');
      expect(body(css, '.dzg-cell:dir(rtl)')).toContain('background-position: 0 50%;');
      // 29.
      expect(css).toContain('border-block-end: var(--dzg-last-row-line, var(--dzg-row-line, var(--dzg-line, 1px) solid var(--tz-border)));');
      expect(css).toContain('border-inline-end: var(--dzg-last-column-line, var(--dzg-column-line, none));');
      expect(css).toContain('background: var(--dzg-header-separator-end, var(--dzg-header-separator, var(--tz-border)));');
      // 26, 33.
      expect(body(css, '.dzg-sort')).toContain('color: var(--dzg-sort-fg, var(--tz-fg-muted));');
      expect(body(css, '.dzg-hcell')).toContain('padding-inline: calc(var(--dzg-header-padding-inline, var(--dzg-cell-padding-inline, 0.5rem)) * var(--dzg-density, 1));');
      expect(body(css, '.dzg .dzg-popup')).toContain('border-radius: var(--dzg-popup-radius, var(--dzg-radius, 0.375rem));');
      expect(body(css, '.dzg-tooltip')).toContain('white-space: var(--dzg-tooltip-white-space, normal);');
      expect(body(css, '.dzg-tooltip')).toContain('font-size: var(--dzg-tooltip-font-size, var(--dzg-cell-font-size, 1em));');
      expect(body(css, '.dzg-fopt:where([aria-selected=true])')).toBe('background: var(--dzg-option-selected-bg);');
    });
  }
});

describe('the guide lists every variable the sheets read, and nothing else (owner « pense à toutes les variables »)', () => {
  // Written by the grid, read by its sheets: not a knob (a grid's state, a measure, a feature's private one).
  const WRITTEN = new Set(['--dzg-odd', '--dzg-rb', '--dzg-re', '--dzg-rs', '--dzg-rt', '--dzg-tree-at', '--dzg-tree-pad', '--dzg-turn', '--dzg-check-w', '--dzg-chevron',
    '--dzg-dock-bottom', '--dzg-dock-end', '--dzg-dock-start', '--dzg-dock-strip', '--dzg-footer-size', '--dzg-fp-room', '--dzg-fpanel-size', '--dzg-fstrip-size', '--dzg-gch',
    '--dzg-header-h', '--dzg-header-lines', '--dzg-header-row-h', '--dzg-i', '--dzg-inset', '--dzg-span-at', '--dzg-up', '--dzg-view-w', '--dzg-wrap-line', '--dzg-tip-at',
    '--dzg-row-height', '--dzg-header-height', '--dzg-density', '--dzg-flash', '--dzg-icon']);
  const read = (dir: string, test: (f: string) => boolean) => readdirSync(here(dir), { recursive: true, encoding: 'utf8' }).filter(test).map((f) => readFileSync(here(`${dir}/${f}`), 'utf8')).join('\n');
  const used = [...new Set([...(read('..', (f) => /^[^/]*\.scss$/.test(f)) + read('../../dom/src', (f) => f.endsWith('.ts'))).matchAll(/var\((--dzg-[a-z0-9-]*[a-z0-9])/g)].map((m) => m[1]!))]
    .filter((v) => !WRITTEN.has(v) && !(v.startsWith('--dzg-icon-') && v !== '--dzg-icon-size') && !v.startsWith('--dzg-badge-'));
  const kebab = (k: string) => k.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
  const keyed = new Set(THEME_KEYS.map((k) => `--dzg-${kebab(k)}`));

  it('every variable a sheet reads is a theme key (or written by the grid)', () => {
    expect(used.filter((v) => !keyed.has(v)).sort()).toEqual([]);
  });

  for (const lang of ['', 'fr/']) {
    it(`guides/theming-rtl.mdx (${lang || 'en'}): each variable named in full in the table, each table name read by a sheet`, () => {
      const guide = readFileSync(`${process.cwd()}/website/src/content/docs/${lang}guides/theming-rtl.mdx`, 'utf8'); // the suite runs from the repository's root
      const table = guide.split('\n').filter((l) => l.startsWith('| `--')).map((l) => l.split('|')[1]!).join(' ');
      const named = new Set([...table.matchAll(/`(--dzg-[a-z0-9-]+)`/g)].map((m) => m[1]!));
      expect(used.filter((v) => !named.has(v)).sort(), 'missing from the table').toEqual([]);
      expect([...named].filter((v) => !used.includes(v) && v !== '--dzg-flash').sort(), 'in the table, read by no sheet').toEqual([]);
    });
  }
});

describe('contrast pairs (13): each new default colour in the pairs it is drawn in', () => {
  it('the input edge on the input and on the header (3:1)', () => {
    expect(pairs.derived['--dzg-input-border']).toBe('light-dark(color-mix(in srgb, var(--tz-fg-muted) 75%, var(--tz-bg)), var(--tz-fg-muted))');
    for (const bg of ['--tz-bg', '--dzg-header-bg']) expect(pairs.pairs.some((p) => p.fg === '--dzg-input-border' && p.bg === bg && p.min === 3), bg).toBe(true);
  });

  it('the tooltip arrow on the rows (3:1, a part)', () => {
    expect(pairs.derived['--dzg-tooltip-arrow-color']).toBe('var(--tz-fg)');
    for (const bg of ['--tz-bg', '--dzg-header-bg']) expect(pairs.pairs.some((p) => p.fg === '--dzg-tooltip-arrow-color' && p.bg === bg && p.min === 3), bg).toBe(true);
  });

  it('the sort mark on a hovered header (3:1)', () => {
    expect(pairs.pairs.some((p) => p.fg === '--tz-fg-muted' && p.bg === '--dzg-header-bg' && p.min >= 3)).toBe(true);
  });
});

it('variables.scss compiles to both copies (no drift)', () => {
  expect(vars('').trim()).toBe(compile(here('../variables.scss'), { style: 'expanded' }).css.trim());
});
