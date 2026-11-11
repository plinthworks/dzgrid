// `theming()` (`@dzgrid/dom/theme`): the `theme` object and the application's icons (docs/behaviors/presentation-settings.md
// 16–22; owner B and Q7, 2026-11-09). Written before the code; expectations by hand. jsdom: what is written on the root
// and refused; the drawing in browsers (scripts/browser-presentation.mjs).
import { afterEach, describe, expect, it } from 'vitest';
import type { Problem } from '@dzgrid/core';
import { cleanup, emake } from './support-edit.js';
import { theming } from '../src/theme.js';
import { THEME_KEYS } from '../src/theme/index.js';
import { cleanIcon } from '../src/theme/icons.js';
import type { GridTheme } from '../src/look.js';

afterEach(cleanup);

const SVG = 'http://www.w3.org/2000/svg';
const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M2 2h12v12H2z"/></svg>';
const root = (h: HTMLElement) => h.querySelector<HTMLElement>('.dzg')!;
const told = (events: { type: string }[], code = 'invalid-setting'): Problem[] => events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems).filter((p) => p.code === code);
const make = (settings: NonNullable<Parameters<typeof emake>[0]>['settings'] = {}) => emake({ settings: { features: [theming()], ...settings } });

describe('the theme object (20–23)', () => {
  it('writes each key as its variable on the root: the palette as --tz-*, the rest as --dzg-* in kebab case', () => {
    const m = make({ theme: { accent: 'light-dark(teal, aqua)', bgRaised: 'Canvas', rowOddBg: 'color-mix(in srgb, var(--tz-accent) 6%, var(--tz-bg))', headerWeight: 500, columnLine: 'none' } });
    const s = root(m.host).style;
    expect(s.getPropertyValue('--tz-accent')).toBe('light-dark(teal, aqua)');
    expect(s.getPropertyValue('--tz-bg-raised')).toBe('Canvas');
    expect(s.getPropertyValue('--dzg-row-odd-bg')).toBe('color-mix(in srgb, var(--tz-accent) 6%, var(--tz-bg))');
    expect(s.getPropertyValue('--dzg-header-weight')).toBe('500');
    expect(s.getPropertyValue('--dzg-column-line')).toBe('none');
    expect(told(m.events)).toEqual([]);
    // No missing-feature: the feature is there.
    expect(told(m.events, 'missing-feature')).toEqual([]);
  });

  it('refuses a key not in the list and a value that could break out, told each, never throws (21)', () => {
    const bad = { nope: 'x', rowHeight: '40px', accent: 'red; color: blue', headerBg: 'url(https://example.test/a.png)', rowOddBg: { a: 1 }, headerFg: '}', fg: 'a<b', radius: Number.NaN, pinnedShadow: 'x !important' } as unknown as GridTheme; // an untyped host
    const m = make({ theme: bad });
    expect(told(m.events).map((p) => [p.severity, p.path])).toEqual([
      ['warning', 'settings.theme.nope'],
      ['warning', 'settings.theme.rowHeight'],
      ['warning', 'settings.theme.accent'],
      ['warning', 'settings.theme.headerBg'],
      ['warning', 'settings.theme.rowOddBg'],
      ['warning', 'settings.theme.headerFg'],
      ['warning', 'settings.theme.fg'],
      ['warning', 'settings.theme.radius'],
      ['warning', 'settings.theme.pinnedShadow'],
    ]);
    const s = root(m.host).style;
    for (const v of ['--dzg-nope', '--tz-accent', '--dzg-header-bg', '--dzg-row-odd-bg', '--dzg-header-fg', '--tz-fg', '--dzg-radius', '--dzg-pinned-shadow']) expect(s.getPropertyValue(v), v).toBe('');
    // The grid's own row height stays the grid's.
    expect(s.getPropertyValue('--dzg-row-height')).toBe('32px');
  });

  it('refuses a value that loads an image without url( — image-set(), -webkit-image-set(), src() (21, 1.9.0 review)', () => {
    const m = make({ theme: { rowOddBg: 'image-set("https://example.test/a.png" 1x)', headerBg: '-webkit-image-set("https://example.test/a.png" 1x)', panelBg: 'SRC("https://example.test/a.png")', bg: 'light-dark(white, black)' } });
    expect(told(m.events).map((p) => p.path)).toEqual(['settings.theme.rowOddBg', 'settings.theme.headerBg', 'settings.theme.panelBg']);
    expect(root(m.host).style.getPropertyValue('--tz-bg')).toBe('light-dark(white, black)');
  });

  it('cuts a long refused value to 80 characters in the problem', () => {
    const m = make({ theme: { accent: `${'a'.repeat(100)};` } });
    expect(told(m.events)[0]!.detail).toBe('a'.repeat(80));
  });

  it('live: a new object written, what the old one wrote and the new one does not taken away (22)', () => {
    const m = make({ theme: { rowOddBg: 'Canvas', headerWeight: 500 } });
    m.g.update({ theme: { headerWeight: 700 } });
    const s = root(m.host).style;
    expect(s.getPropertyValue('--dzg-row-odd-bg')).toBe('');
    expect(s.getPropertyValue('--dzg-header-weight')).toBe('700');
    m.g.update({ theme: undefined });
    expect(s.getPropertyValue('--dzg-header-weight')).toBe('');
    expect(s.getPropertyValue('--dzg-row-height')).toBe('32px');
  });

  it('columnHoverBg: the hovered column\'s tint (column-hover), --dzg-column-hover-bg', () => {
    const m = make({ theme: { columnHoverBg: 'rgb(0 0 255 / 8%)' } });
    expect(root(m.host).style.getPropertyValue('--dzg-column-hover-bg')).toBe('rgb(0 0 255 / 8%)');
    expect(told(m.events)).toEqual([]);
  });

  it('every key is a variable the guide lists (the list, not a guess)', () => {
    expect(THEME_KEYS).toContain('rowOddBg');
    expect(THEME_KEYS).toContain('accentFg');
    expect(THEME_KEYS).not.toContain('rowHeight');
    expect(THEME_KEYS).not.toContain('density');
    expect(new Set(THEME_KEYS).size).toBe(THEME_KEYS.length);
  });
});

describe('cleanIcon (18)', () => {
  it('takes a plain SVG; a missing namespace is added', () => {
    expect(cleanIcon(ok)).toEqual({ ok: expect.stringContaining('<path d="M2 2h12v12H2z"') });
    const bare = cleanIcon('<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4"/></svg>');
    expect('ok' in bare && bare.ok).toContain(`xmlns="${SVG}"`);
  });

  it('takes an SVGElement, copied: the element is neither moved nor changed', () => {
    const host = document.body.appendChild(document.createElement('div'));
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    const r = svg.appendChild(document.createElementNS(SVG, 'rect'));
    r.setAttribute('width', '16');
    r.setAttribute('height', '8');
    host.append(svg);
    const out = cleanIcon(svg);
    expect('ok' in out && out.ok).toContain('<rect');
    expect(svg.parentNode).toBe(host);
    expect(svg.childNodes.length).toBe(1);
  });

  it('refuses what could run, load or break out — the reason, never the SVG', () => {
    const cases: [unknown, string][] = [
      ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'element'],
      ['<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(x)</style></svg>', 'element'],
      ['<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>', 'element'],
      ['<svg xmlns="http://www.w3.org/2000/svg"><image href="x.png"/></svg>', 'element'],
      ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', 'attribute'],
      ['<svg xmlns="http://www.w3.org/2000/svg"><path ONCLICK="x" d="M0 0"/></svg>', 'attribute'],
      ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://example.test/s.svg#a"/></svg>', 'link'],
      ['<svg xmlns="http://www.w3.org/2000/svg"><use href="javascript:alert(1)"/></svg>', 'link'],
      ['<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://example.test/p)" d="M0 0"/></svg>', 'link'],
      ['<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:url( \'x.svg#p\')" d="M0 0"/></svg>', 'link'],
      // 1.9.0 review: a CSS escape spelling url( past the check; a DOCTYPE's entities (expansion bombs, outside entities).
      ['<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:u\\72l(https://example.test/p)" d="M0 0"/></svg>', 'link'],
      ['<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><svg xmlns="http://www.w3.org/2000/svg"><title>&b;&b;</title></svg>', 'parse'],
      ['<svg xmlns="http://www.w3.org/2000/svg"><!DOCTYPE x><path d="M0 0"/></svg>', 'parse'],
      ['<div xmlns="http://www.w3.org/1999/xhtml"/>', 'root'],
      ['<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"></svg>', 'parse'],
      [`<svg xmlns="http://www.w3.org/2000/svg"><path d="${'M0 0'.repeat(6000)}"/></svg>`, 'size'],
      [42, 'type'],
      [document.createElement('span'), 'type'],
    ];
    for (const [input, why] of cases) expect(cleanIcon(input as never), String(input).slice(0, 60)).toEqual({ refused: why }); // a number and an HTML element from an untyped host
  });

  it('keeps an inner link and an inner url()', () => {
    const inner = '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="0"/></linearGradient><path id="p" d="M0 0"/></defs><use href="#p"/><rect fill="url(#g)" width="4" height="4"/></svg>';
    expect('ok' in cleanIcon(inner)).toBe(true);
  });
});

describe('the icons setting (16–19)', () => {
  it('an icon becomes a mask image on the root, its name in data-dzg-icons; the CSS that draws it injected once', () => {
    const m = make({ icons: { sortAsc: ok, chevron: ok } });
    const r = root(m.host);
    expect(r.getAttribute('data-dzg-icons')).toBe('sort-asc chevron');
    expect(r.style.getPropertyValue('--dzg-icon-sort-asc')).toMatch(/^url\("data:image\/svg\+xml,%3Csvg/);
    expect(r.style.getPropertyValue('--dzg-icon-chevron')).toMatch(/^url\("data:image\/svg\+xml,/);
    const style = document.querySelectorAll('style[data-dzgrid-icons]');
    expect(style.length).toBe(1);
    const css = style[0]!.textContent!;
    expect(css.startsWith('@layer dzgrid.layout,dzgrid.theme,dzgrid.skin,dzgrid.bridge,dzgrid.contrast,dzgrid.icons;')).toBe(true);
    expect(css).toContain('[data-dzg-icons~=sort-asc] .dzg-sort[data-dir=asc]::before');
    expect(css).toContain('background:currentColor');
    // A second grid: no second style.
    make({ icons: { grip: ok } });
    expect(document.querySelectorAll('style[data-dzgrid-icons]').length).toBe(1);
  });

  it('a refused icon keeps the default and is told at its name; an unknown name too (18)', () => {
    const m = make({ icons: { sortAsc: '<svg xmlns="http://www.w3.org/2000/svg" onload="x"/>', menu: ok, star: ok } as never }); // an untyped host's name
    expect(told(m.events).map((p) => [p.path, p.detail])).toEqual([
      ['settings.icons.sortAsc', 'attribute'],
      ['settings.icons.star', 'unknown'],
    ]);
    const r = root(m.host);
    expect(r.getAttribute('data-dzg-icons')).toBe('menu');
    expect(r.style.getPropertyValue('--dzg-icon-sort-asc')).toBe('');
  });

  it('live: a name taken away comes back to the default (19)', () => {
    const m = make({ icons: { sortAsc: ok, filter: ok } });
    m.g.update({ icons: { filter: ok } });
    const r = root(m.host);
    expect(r.getAttribute('data-dzg-icons')).toBe('filter');
    expect(r.style.getPropertyValue('--dzg-icon-sort-asc')).toBe('');
    m.g.update({ icons: undefined });
    expect(r.hasAttribute('data-dzg-icons')).toBe(false);
    expect(r.style.getPropertyValue('--dzg-icon-filter')).toBe('');
  });

  it('the same object again is not cleaned again (no repeated warning)', () => {
    const icons = { sortAsc: '<svg xmlns="http://www.w3.org/2000/svg" onload="x"/>' };
    const m = make({ icons });
    m.g.update({ label: 'x' });
    m.g.update({ icons });
    expect(told(m.events).length).toBe(1);
  });

  it('destroyed with the grid: the root’s variables go with it (no leak on a reused host)', () => {
    const m = make({ theme: { rowOddBg: 'Canvas' }, icons: { grip: ok } });
    const r = root(m.host);
    m.g.destroy();
    expect(r.isConnected).toBe(false);
  });
});

describe('the guide lists every key (the site\'s guides/theming-rtl.mdx « Every variable »; docs/guide/ moved into the site, batch 2)', () => {
  it('each key of THEME_KEYS in the table’s key column, beside its variable', async () => {
    const { readFileSync } = await import('node:fs');
    const guide = readFileSync(`${process.cwd()}/website/src/content/docs/guides/theming-rtl.mdx`, 'utf8'); // the suite runs from the repository's root
    const rows = guide.split('\n').filter((l) => l.startsWith('| `--'));
    const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    const PALETTE = ['bg', 'bgRaised', 'fg', 'fgMuted', 'border', 'accent', 'accentFg', 'danger', 'warning', 'success'];
    for (const k of THEME_KEYS) {
      const row = rows.find((r) => r.split('|')[2]!.includes(`\`${k}\``));
      expect(row, k).toBeDefined();
      // The variable is in the same row (a family written `--dzg-header-separator`, `-size`, `-height` counts by its stem).
      const name = `${PALETTE.includes(k) ? '--tz-' : '--dzg-'}${kebab(k)}`;
      const stem = name.replace(/-(size|height|active)$/, '');
      expect(row!.split('|')[1]!.includes(name) || row!.split('|')[1]!.includes(stem), k).toBe(true);
    }
  });
});
