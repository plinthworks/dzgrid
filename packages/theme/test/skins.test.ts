// @vitest-environment node
// Showcase themes, steps 3 and 4 (docs/behaviors/theming.md, themes-plan §6, owner T2, T6): Midnight and
// Clinic. Each gives every colour by hand (T2), light and dark, in `dzgrid.skin`, on the page when
// imported and on one area with `data-dzg-skin`; contrast-checked; forced colours and Arabic kept.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sheet, ORDER } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';
// @ts-expect-error a plain .mjs script
import { check, paletteFromCss } from '../../../scripts/check-contrast.mjs';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const ROOT = here('../../..');
const TZ = ['bg', 'bg-raised', 'fg', 'fg-muted', 'border', 'accent', 'accent-fg', 'danger', 'warning', 'success'];
/** The knobs every showcase theme sets, so an area of one inside a page of the other takes none of the page's. */
const KNOBS = ['--dzg-font', '--dzg-radius', '--dzg-pill-radius', '--dzg-line', '--dzg-cell-padding-inline', '--dzg-header-size', '--dzg-header-tracking', '--dzg-select-bar'];
type Fixture = { palettes: { name: string; light: Record<string, string>; dark: Record<string, string>; shape: Record<string, string> }[] };
const spec = JSON.parse(read('contrast-pairs.json'));
const pkg = JSON.parse(read('package.json')) as { exports: Record<string, unknown>; files: string[] };
const budget = JSON.parse(readFileSync(`${ROOT}/size-budget.json`, 'utf8')) as { entries: Record<string, { file: string; maxGzip: number }> };

/** name: value of each declaration of a body. */
const decls = (body: string) => Object.fromEntries(body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]));

/** The Phase 5 close (step 13, Q-C2): measure + 10 % rounded up to 50 B (midnight 446, clinic 472), under T7's 650. */
const CLOSE_BUDGET = { midnight: 500, clinic: 550 } as const;

for (const name of ['midnight', 'clinic'] as const) {
  describe(`${name}.css`, () => {
    const file = `${name}.css`;
    const fixturePath = here(`./fixtures/${name}.json`);

    it('exists, is exported and shipped, and has its budget (T7 grant 650 B; the Phase 5 close: the measure + 10 %)', () => {
      expect(existsSync(here(`../${file}`))).toBe(true);
      expect(pkg.exports[`./${file}`]).toBe(`./${file}`);
      expect(pkg.files).toContain(file);
      expect(budget.entries[`@dzgrid/theme/${file}`]).toEqual({ file: `packages/theme/${file}`, maxGzip: CLOSE_BUDGET[name] });
    });

    it('opens with the order statement; its one block in dzgrid.skin, on the page and on an area (T6)', () => {
      const s = sheet(read(file));
      expect(s.first).toBe(`${ORDER};`);
      expect(s.rules.every((r) => r.layers.join('/') === 'dzgrid.skin')).toBe(true);
      const root = s.rules.filter((r) => r.at.length === 0);
      expect(root.map((r) => r.selector)).toEqual([`:root, [data-dzg-skin="${name}"]`]);
    });

    it('gives every colour by hand, light and dark, as the hand-written fixture says (no drift)', () => {
      const fx = (JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture).palettes[0]!;
      expect(fx.name).toBe(name);
      const d = decls(sheet(read(file)).rules[0]!.body);
      for (const k of TZ) expect(d[`--tz-${k}`], k).toBe(`light-dark(${fx.light[k]}, ${fx.dark[k]})`);
      // No colour computed (T2): every one a pair of hex values.
      for (const k of TZ) expect(d[`--tz-${k}`], k).toMatch(/^light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
      for (const [k, v] of Object.entries(fx.shape)) expect(d[k], k).toBe(v);
      // Clinic gives the block's edge too (Phase 5 step 11a): its success is too near its accent.
      const own = name === 'clinic' ? ['--dzg-range-edge'] : [];
      for (const k of own) expect(d[k], k).toBe(`light-dark(${(fx.light as Record<string, string>)[k]}, ${(fx.dark as Record<string, string>)[k]})`);
      expect(Object.keys(d).sort()).toEqual([...TZ.map((k) => `--tz-${k}`), ...KNOBS, ...own].sort());
    });

    it('passes every contrast pair, light and dark, from its fixture and from its own CSS', () => {
      expect(() => execFileSync('node', [`${ROOT}/scripts/check-contrast.mjs`, '--palette', fixturePath], { stdio: 'pipe' })).not.toThrow();
      const base = paletteFromCss(read('dzgrid.css'));
      const own = decls(sheet(read(file)).rules[0]!.body);
      for (const scheme of ['light', 'dark']) {
        const { failures } = check({ ...base, ...own }, spec, scheme);
        expect(failures, scheme).toEqual([]);
      }
    });

    it('no physical side, and no colour outside its palette', () => {
      const css = read(file);
      expect(checkScss(css).filter((f) => f.rule === 'physical')).toEqual([]);
      const s = sheet(css);
      for (const r of s.rules.slice(1)) expect(r.body, r.selector).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    });

    it('keeps no letter spacing in Arabic, and a system font stack that carries Arabic', () => {
      const d = decls(sheet(read(file)).rules[0]!.body);
      expect(d['--dzg-font']).toMatch(/system-ui/);
      expect(d['--dzg-font']).toMatch(/"Noto Sans Arabic"/);
      expect(d['--dzg-font']).toMatch(/sans-serif$/);
      // T-5: a valid `font` shorthand: a weight, then a size (with a line height), then the families.
      expect(d['--dzg-font']).toMatch(/^\d{3} [\d.]+rem\/[\d.]+ system-ui, /);
      // The base resets the tracking under :lang(ar), whatever the theme gives.
      // R4: and in any right-to-left grid (Persian, Urdu; an Arabic grid in a page of another language).
      expect(read('dzgrid.css')).toMatch(/\.dzg-hrow:is\(:lang\(ar\), :dir\(rtl\)\)\s*\{\s*letter-spacing: 0;/);
    });
  });
}

describe('the base reads the knobs a showcase theme sets (steps 3–4)', () => {
  const css = read('dzgrid.css');

  it('header rows: size and tracking, neutral by default (not the pinned parents the header also holds)', () => {
    expect(css).toMatch(/\.dzg-hrow \{[^}]*font-size: var\(--dzg-header-size, 1em\);[^}]*letter-spacing: var\(--dzg-header-tracking, normal\);/);
  });

  it('a selected row’s bar at its inline start (0 wide by default), the accent; Highlight in forced colours', () => {
    const bar = sheet(css).rules.filter((r) => r.selector === '.dzg-row[aria-selected=true] > .dzg-seg-start::before');
    const normal = bar.find((r) => r.at.length === 0)!;
    expect(normal.body).toMatch(/inset-inline-start: 0;/);
    // T-3: drawn at all (a pseudo-element needs content) and out of the segment's flow.
    expect(normal.body).toMatch(/content: "";/);
    expect(normal.body).toMatch(/position: absolute;/);
    expect(normal.body).toMatch(/inline-size: var\(--dzg-select-bar, 0\);/);
    expect(normal.body).toMatch(/background: var\(--tz-accent\);/);
    const forced = bar.find((r) => r.at.includes('@media (forced-colors: active)'))!;
    expect(forced.body).toMatch(/background: Highlight;/);
    expect(spec.pairs.some((p: { fg: string; bg: string; min: number }) => p.fg === '--tz-accent' && p.bg === '--dzg-row-selected-bg' && p.min === 3)).toBe(true);
  });

  it('Midnight sets the bar and the header’s type; Clinic leaves them neutral', () => {
    const m = decls(sheet(read('midnight.css')).rules[0]!.body);
    const c = decls(sheet(read('clinic.css')).rules[0]!.body);
    expect([m['--dzg-select-bar'], m['--dzg-header-size'], m['--dzg-header-tracking']]).toEqual(['2px', '0.8125rem', '0.02em']);
    expect([c['--dzg-select-bar'], c['--dzg-header-size'], c['--dzg-header-tracking']]).toEqual(['0px', '1em', 'normal']);
  });
});

describe('more contrast still wins when asked, in a themed area too', () => {
  const s = sheet(read('contrast.css'));
  const palettes = s.rules.filter((r) => r.body.includes('--tz-bg:'));

  it('its palette blocks name every [data-dzg-skin] area as well as the root', () => {
    expect(palettes).toHaveLength(2);
    // R3: an area inside a shadow root is not a descendant of :root for a selector: named on its own,
    // unless the page opted out.
    expect(palettes[0]!.selector).toBe(":root:not([data-contrast=normal]), [data-dzg-skin]:not(:root[data-contrast=normal] *)");
    expect(palettes[1]!.selector).toBe('[data-contrast=more], [data-contrast=more] [data-dzg-skin]');
    expect(palettes.every((r) => r.layers.join('/') === 'dzgrid.contrast')).toBe(true);
  });

  it('in forced colours its selected row is Highlight: the bar there is HighlightText, so it still shows (review of part 1)', () => {
    const forced = s.rules.filter((r) => r.at.includes('@media (forced-colors: active)'));
    const bar = forced.find((r) => r.selector === '.dzg-row[aria-selected=true] > .dzg-seg-start::before');
    expect(bar?.body).toBe('background: HighlightText;');
  });

  it('dzgrid.contrast comes after dzgrid.skin in every file’s order statement', () => {
    expect(ORDER.indexOf('dzgrid.contrast')).toBeGreaterThan(ORDER.indexOf('dzgrid.skin'));
  });
});
