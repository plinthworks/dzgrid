// @vitest-environment node
// Showcase themes, step 5 (docs/behaviors/theming.md « Bridges », themes-plan §3, owner T3, T4, T7): the
// framework bridges. Each maps every --tz-* colour, the font and the corners to the framework's public
// variables, in `dzgrid.bridge`, and follows its dark mode. The tables below are written by hand from the
// frameworks' public pages (refs); the default values in fixtures/*-defaults.json likewise. No framework
// file is read here: the real builds run in the browser suite (`npm run test:browser -- --only themes`).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sheet, ORDER } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';
// @ts-expect-error a plain .mjs script
import { check, paletteFromCss } from '../../../scripts/check-contrast.mjs';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const fixture = (f: string) => JSON.parse(readFileSync(here(`./fixtures/${f}`), 'utf8'));
const ROOT = here('../../..');
const TZ = ['bg', 'bg-raised', 'fg', 'fg-muted', 'border', 'accent', 'accent-fg', 'danger', 'warning', 'success'] as const;
const spec = JSON.parse(read('contrast-pairs.json'));
const base = paletteFromCss(read('dzgrid.css'));
const pkg = JSON.parse(read('package.json')) as { exports: Record<string, unknown>; files: string[] };
const budget = JSON.parse(readFileSync(`${ROOT}/size-budget.json`, 'utf8')) as { entries: Record<string, { file: string; maxGzip: number }> };
const decls = (body: string) => Object.fromEntries(body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]));

const tw4 = (l: string, d: string) => `light-dark(var(--color-${l}), var(--color-${d}))`;
const tw3 = (l: string, d: string) => `light-dark(theme('colors.${l}'), theme('colors.${d}'))`;

/** Our variable → the framework's, by hand from its public pages. */
const BRIDGES = {
  'tailwind.css': {
    refs: ['https://tailwindcss.com/docs/theme', 'https://tailwindcss.com/docs/colors', 'https://tailwindcss.com/docs/dark-mode'],
    scope: ':root',
    map: {
      bg: tw4('white', 'zinc-900'), 'bg-raised': tw4('zinc-100', 'zinc-800'), fg: tw4('zinc-900', 'zinc-100'), 'fg-muted': tw4('zinc-600', 'zinc-400'),
      border: tw4('zinc-300', 'zinc-700'),
      // An app's own --color-primary-* when its @theme has them; Tailwind's blue otherwise.
      accent: 'light-dark(var(--color-primary-600, var(--color-blue-600)), var(--color-primary-400, var(--color-blue-400)))',
      'accent-fg': tw4('white', 'zinc-950'), danger: tw4('red-700', 'red-400'), warning: tw4('amber-700', 'amber-400'), success: tw4('green-700', 'green-400'),
    },
    font: '400 0.875rem/1.45 var(--font-sans)',
    radius: 'var(--radius-md)',
    dark: [['.dark', 'dark']],
  },
  'tailwind3.css': {
    refs: ['https://v3.tailwindcss.com/docs/functions-and-directives#theme', 'https://v3.tailwindcss.com/docs/customizing-colors', 'https://v3.tailwindcss.com/docs/dark-mode'],
    scope: ':root',
    map: {
      bg: tw3('white', 'zinc.900'), 'bg-raised': tw3('zinc.100', 'zinc.800'), fg: tw3('zinc.900', 'zinc.100'), 'fg-muted': tw3('zinc.600', 'zinc.400'),
      border: tw3('zinc.300', 'zinc.700'), accent: tw3('blue.600', 'blue.400'), 'accent-fg': tw3('white', 'zinc.950'),
      danger: tw3('red.700', 'red.400'), warning: tw3('amber.700', 'amber.400'), success: tw3('green.700', 'green.400'),
    },
    font: "400 0.875rem/1.45 theme('fontFamily.sans')",
    radius: "theme('borderRadius.md')",
    dark: [['.dark', 'dark']],
  },
  'bootstrap.css': {
    refs: ['https://getbootstrap.com/docs/5.3/customize/css-variables/', 'https://getbootstrap.com/docs/5.3/customize/color-modes/'],
    // Bootstrap's colour mode can be set on any element: the names are resolved there again.
    scope: ':root, [data-bs-theme]',
    map: {
      bg: 'var(--bs-body-bg)', 'bg-raised': 'var(--bs-tertiary-bg)', fg: 'var(--bs-body-color)', 'fg-muted': 'var(--bs-secondary-color)',
      border: 'var(--bs-border-color)',
      // Its primary one shade deeper (the link's hover colour, which follows the colour mode): Bootstrap's
      // primary itself (#0d6efd, 4.5:1 on white) falls under 3:1 for a mark on a selected row.
      accent: 'var(--bs-link-hover-color)', 'accent-fg': 'var(--bs-body-bg)',
      danger: 'var(--bs-danger-text-emphasis)', warning: 'var(--bs-warning-text-emphasis)', success: 'var(--bs-success-text-emphasis)',
    },
    font: '400 0.875rem/1.5 var(--bs-body-font-family)',
    radius: 'var(--bs-border-radius)',
    dark: [[':root, [data-bs-theme=light]', 'light'], ['[data-bs-theme=dark]', 'dark']],
  },
} as const;

/** The framework's values a bridge reads, in a scheme, as variables (Tailwind 3's theme() replaced by its value). */
function resolved(file: keyof typeof BRIDGES, own: Record<string, string>, scheme: 'light' | 'dark'): Record<string, string> {
  if (file === 'tailwind.css') return { ...fixture('tailwind4-defaults.json').vars, ...own };
  if (file === 'bootstrap.css') {
    const bs = fixture('bootstrap-defaults.json');
    return { ...bs.light, ...(scheme === 'dark' ? bs.dark : {}), ...own };
  }
  const t = fixture('tailwind3-defaults.json').theme as Record<string, string>;
  return Object.fromEntries(Object.entries(own).map(([k, v]) => [k, v.replace(/theme\('([^']+)'\)/g, (_, p: string) => t[p] ?? `theme('${p}')`)]));
}

/** The Phase 5 close (step 13, Q-C2): measure + 10 % rounded up to 50 B (325 / 325 / 293), under T7's 500. */
const CLOSE_BUDGET: Record<string, number> = { 'tailwind.css': 400, 'tailwind3.css': 400, 'bootstrap.css': 350 };

for (const [file, b] of Object.entries(BRIDGES) as [keyof typeof BRIDGES, (typeof BRIDGES)[keyof typeof BRIDGES]][]) {
  describe(file, () => {
    it('exists, is exported and shipped, and has its budget (T7 grant 500 B; the Phase 5 close: the measure + 10 %)', () => {
      expect(existsSync(here(`../${file}`))).toBe(true);
      expect(pkg.exports[`./${file}`]).toBe(`./${file}`);
      expect(pkg.files).toContain(file);
      expect(budget.entries[`@dzgrid/theme/${file}`]).toEqual({ file: `packages/theme/${file}`, maxGzip: CLOSE_BUDGET[file] });
    });

    it('opens with the order statement; every rule in dzgrid.bridge', () => {
      const s = sheet(read(file));
      expect(s.first).toBe(`${ORDER};`);
      expect(s.rules.length).toBeGreaterThan(1);
      expect(s.rules.every((r) => r.layers.join('/') === 'dzgrid.bridge' && r.at.length === 0)).toBe(true);
    });

    it(`maps every colour, the font and the corners on « ${b.scope} » (refs: ${b.refs.join(', ')})`, () => {
      const rules = sheet(read(file)).rules;
      expect(rules[0]!.selector).toBe(b.scope);
      const d = decls(rules[0]!.body);
      for (const k of TZ) expect(d[`--tz-${k}`], k).toBe(b.map[k]);
      expect(d['--dzg-font']).toBe(b.font);
      expect(d['--dzg-radius']).toBe(b.radius);
      // Nothing else: a bridge maps, it does not restyle — but Bootstrap names its flash hue (step 16: its dark warning
      // under a refusal sign on a selected row falls below 3:1; « la couleur … par thème », owner).
      const flash = file === 'bootstrap.css' ? ['--dzg-flash-color'] : [];
      if (flash.length) expect(d['--dzg-flash-color']).toBe('var(--tz-success)');
      expect(Object.keys(d).sort()).toEqual([...TZ.map((k) => `--tz-${k}`), '--dzg-font', '--dzg-radius', ...flash].sort());
    });

    it('--dzg-font is a valid font shorthand (a weight, a size and line height, then the families)', () => {
      expect(decls(sheet(read(file)).rules[0]!.body)['--dzg-font']).toMatch(/^\d{3} [\d.]+rem\/[\d.]+ \S/);
    });

    it('follows the framework’s dark mode', () => {
      const rest = sheet(read(file)).rules.slice(1).map((r) => [r.selector, r.body]);
      expect(rest).toEqual(b.dark.map(([sel, scheme]) => [sel, `--tz-color-scheme: ${scheme};`]));
    });

    it('passes every contrast pair, light and dark, with the framework’s default colours', () => {
      const own = decls(sheet(read(file)).rules[0]!.body);
      for (const scheme of ['light', 'dark'] as const) {
        const { failures } = check({ ...base, ...resolved(file, own, scheme) }, spec, scheme);
        expect(failures.map((f: { what: string; ratio: number }) => `${f.what} ${f.ratio.toFixed(2)}`), scheme).toEqual([]);
      }
    });

    it('no physical side, no colour of its own', () => {
      const css = read(file);
      expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
      expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|oklch\(/i);
    });
  });
}

describe('the order between a bridge and a showcase theme (owner T9)', () => {
  it('dzgrid.bridge comes after dzgrid.skin: an app using a bridge sees its framework’s colours', () => {
    expect(ORDER.indexOf('dzgrid.bridge')).toBeGreaterThan(ORDER.indexOf('dzgrid.skin'));
    expect(ORDER.indexOf('dzgrid.contrast')).toBeGreaterThan(ORDER.indexOf('dzgrid.bridge'));
    for (const f of ['dzgrid.css', 'dzgrid.unlayered.css', 'contrast.css', 'contrast.unlayered.css', 'midnight.css', 'clinic.css', 'tailwind.css', 'tailwind3.css', 'bootstrap.css'])
      expect(sheet(read(f)).first, f).toBe(`${ORDER};`);
  });
});
