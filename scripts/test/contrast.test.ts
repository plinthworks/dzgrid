// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { contrast, parseColor, resolveColor, paletteFromCss, check, skinFromCss } from '../check-contrast.mjs';
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('check-contrast', () => {
  it('computes WCAG ratios by hand-known values', () => {
    expect(contrast(parseColor('#000000'), parseColor('#ffffff'))).toBeCloseTo(21, 5);
    expect(contrast(parseColor('#767676'), parseColor('#ffffff'))).toBeCloseTo(4.54, 2);
    expect(contrast(parseColor('#fff'), parseColor('#fff'))).toBeCloseTo(1, 5);
  });

  it('resolves var() with fallbacks, light-dark() per scheme and color-mix() in sRGB', () => {
    const vars = { '--a': 'light-dark(#ff0000, #0000ff)', '--b': '#ffffff' };
    expect(resolveColor('var(--a)', vars, 'light')).toEqual([255, 0, 0, 1]);
    expect(resolveColor('var(--a)', vars, 'dark')).toEqual([0, 0, 255, 1]);
    expect(resolveColor('var(--missing, var(--b))', vars, 'light')).toEqual([255, 255, 255, 1]);
    // 50 % red with white: (255, 127.5, 127.5).
    const mid = resolveColor('color-mix(in srgb, var(--a) 50%, var(--b))', vars, 'light');
    expect(mid.slice(0, 3).map((x: number) => Math.round(x * 2) / 2)).toEqual([255, 127.5, 127.5]);
  });

  it('reads the theme’s palette from dzgrid.css', () => {
    const vars = paletteFromCss(`:root {\n  --tz-bg: light-dark(#ffffff, #18181b);\n  --tz-fg: light-dark(#18181b, #f4f4f5);\n}`);
    expect(vars['--tz-bg']).toBe('light-dark(#ffffff, #18181b)');
  });

  it('a pair may ask for a hue apart (`hue`: degrees, owner step 7: the saving border distinct from the focus ring at any luminance)', () => {
    const spec = (hue: number) => ({ pairs: [{ what: 'apart', fg: '--a', bg: '--b', min: 1, hue }], derived: {} });
    // Amber against blue: far apart; two blues: not.
    expect(check({ '--a': '#b45309', '--b': '#2563eb' }, spec(60), 'light').failures).toEqual([]);
    expect(check({ '--a': '#1d4ed8', '--b': '#2563eb' }, spec(60), 'light').failures.map((f: { what: string }) => f.what)).toEqual(['apart']);
    // The difference goes the short way round the circle (350° and 10°: 20° apart).
    expect(check({ '--a': '#e6194b', '--b': '#e64119' }, spec(30), 'light').failures).toHaveLength(1);
    // Analyser 11: a grey against a colour counts as 180° apart (no hue to confuse); two greys, 0.
    expect(check({ '--a': '#808080', '--b': '#2563eb' }, spec(170), 'light').failures).toEqual([]);
    expect(check({ '--a': '#808080', '--b': '#404040' }, spec(1), 'light').failures).toHaveLength(1);
  });

  it('fails a planted pair below its minimum', () => {
    const result = check({ '--tz-fg': '#999999', '--tz-bg': '#ffffff' }, { pairs: [{ what: 'x', fg: '--tz-fg', bg: '--tz-bg', min: 4.5 }], derived: {} }, 'light');
    expect(result.failures.map((f: { what: string }) => f.what)).toEqual(['x']);
  });

  it('passes the shipped theme, light and dark, and exits 1 on a failing palette file', () => {
    expect(() => execFileSync('node', [join(root, 'scripts/check-contrast.mjs')], { stdio: 'pipe' })).not.toThrow();
    const dir = mkdtempSync(join(tmpdir(), 'contrast-'));
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ palettes: [{ name: 'pale', light: { fg: '#bbbbbb', 'fg-muted': '#cccccc' }, dark: {} }] }));
    let code = 0;
    try { execFileSync('node', [join(root, 'scripts/check-contrast.mjs'), '--palette', bad], { stdio: 'pipe' }); } catch (e) { code = (e as { status: number }).status; }
    expect(code).toBe(1);
  });

  it('a palette entry starting with -- names a variable as it is (the grid\'s own, step 7); the others are tzslot\'s --tz-*', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dzg-pal-'));
    const file = join(dir, 'p.json');
    // The saving colour equal to the page's background: refused, so the entry was read as --dzg-saving-color.
    writeFileSync(file, JSON.stringify({ palettes: [{ name: 'own', light: { '--dzg-saving-color': '#ffffff' }, dark: {} }] }));
    let out = '';
    try { execFileSync('node', [join(root, 'scripts/check-contrast.mjs'), '--palette', file], { stdio: 'pipe' }); } catch (e) { out = String((e as { stderr: Buffer }).stderr); }
    expect(out).toMatch(/FAIL own light: saving border[^\n]*\(--dzg-saving-color on --tz-bg\)/);
  });

  it('passes contrast.css’s palette, light and dark', () => {
    expect(() => execFileSync('node', [join(root, 'scripts/check-contrast.mjs'), '--palette', join(root, 'packages/theme/test/fixtures/high-contrast.json')], { stdio: 'pipe' })).not.toThrow();
  });
  // Showcase themes, step 2 (themes-plan §3.2): Tailwind 4's default colours are written in oklch().
  // Expectations worked by hand (CSS Color 4, §9 OKLab): white and black at L 1 and 0; L 0.5 with no
  // chroma is l = m = s = 0.5³ = 0.125 in linear sRGB → 1.055 × 0.125^(1/2.4) − 0.055 = 0.3887 → 99.1;
  // sRGB red is oklch(62.8% 0.2577 29.23), blue oklch(45.2% 0.313 264.05) (the spec's own examples).
  it('reads oklch(), in numbers or percentages, with alpha, clipped to sRGB', () => {
    const near = (c: number[], want: number[], tol: number) => c.slice(0, 3).every((x, i) => Math.abs(x - want[i]!) <= tol);
    expect(near(parseColor('oklch(1 0 0)'), [255, 255, 255], 0.5)).toBe(true);
    expect(near(parseColor('oklch(0 0 0)'), [0, 0, 0], 0.5)).toBe(true);
    expect(near(parseColor('oklch(50% 0 0)'), [99.1, 99.1, 99.1], 0.3)).toBe(true);
    expect(near(parseColor('oklch(62.8% 0.2577 29.23)'), [255, 0, 0], 1.5)).toBe(true);
    expect(near(parseColor('oklch(0.452 0.313 264.05)'), [0, 0, 255], 1.5)).toBe(true);
    expect(parseColor('oklch(1 0 0 / 50%)')[3]).toBeCloseTo(0.5, 5);
    expect(parseColor('oklch(0.5 0 0 / 0.25)')[3]).toBeCloseTo(0.25, 5);
    // Far outside sRGB: each channel clipped to 0..255.
    for (const x of parseColor('oklch(0.9 0.4 140)').slice(0, 3)) expect(x >= 0 && x <= 255).toBe(true);
    // And inside the resolver, as a Tailwind 4 variable would reach it.
    expect(near(resolveColor('var(--w)', { '--w': 'oklch(100% 0 0)' }, 'light'), [255, 255, 255], 0.5)).toBe(true);
  });

  // Showcase themes, steps 3 and 4: the default run checks the base palette and both showcase themes,
  // read from their own CSS (so the shipped file is what is checked, not a copy).
  it('checks Midnight and Clinic, light and dark, as shipped, by default', () => {
    const out = execFileSync('node', [join(root, 'scripts/check-contrast.mjs')], { encoding: 'utf8' });
    for (const line of ['tzslot default, light', 'tzslot default, dark', 'midnight, light', 'midnight, dark', 'clinic, light', 'clinic, dark'])
      expect(out, line).toMatch(new RegExp(`^ok {3}${line}: \\d+ pairs`, 'm'));
    expect(out).toMatch(/check-contrast: \d+ pairs, 0 below their minimum/);
  });
  // Review of part 1 (R6, T-1, T-2).
  it('R6: a number needs a digit (« . » is refused), and a ratio that is not a number fails its pair', () => {
    expect(() => parseColor('rgb(. . .)')).toThrow(/cannot read/);
    expect(() => parseColor('oklch(. 0 0)')).toThrow(/cannot read/);
    const r = check({ '--a': '#000000', '--b': '#ffffff' }, { pairs: [{ what: 'x', fg: '--a', bg: '--b', min: 4.5 }], derived: {} }, 'light');
    expect(r.failures).toEqual([]);
    const nan = check({ '--a': `rgb(${'9'.repeat(400)} 0 0)`, '--b': '#ffffff' }, { pairs: [{ what: 'nan', fg: '--a', bg: '--b', min: 4.5 }], derived: {} }, 'light');
    expect(nan.failures.map((f: { what: string }) => f.what)).toEqual(['nan']);
  });

  it('T-2: oklch() chroma in %, hue in deg, none; a near-black channel; turn and rad refused', () => {
    const near = (c: number[], want: number[], tol: number) => c.slice(0, 3).every((x, i) => Math.abs(x - want[i]!) <= tol);
    // 64.425% of 0.4 is the chroma 0.2577 of sRGB red.
    expect(near(parseColor('oklch(62.8% 64.425% 29.23deg)'), [255, 0, 0], 1.5)).toBe(true);
    for (const c of ['oklch(0.5 none 120)', 'oklch(none 0.1 none)', 'oklch(0.5 0.1 none)']) for (const x of parseColor(c)) expect(Number.isFinite(x), c).toBe(true);
    expect(near(parseColor('oklch(0.5 none 120)'), [99.1, 99.1, 99.1], 0.3)).toBe(true);
    // L 0.05, no chroma: 0.05³ = 0.000125 linear → 12.92 × 0.000125 × 255 = 0.41 (the linear segment).
    expect(near(parseColor('oklch(0.05 0 0)'), [0.41, 0.41, 0.41], 0.3)).toBe(true);
    expect(() => parseColor('oklch(0.5 0.1 0.25turn)')).toThrow(/cannot read/);
    expect(() => parseColor('oklch(0.5 0.1 1rad)')).toThrow(/cannot read/);
  });

  it('T-1: skinFromCss reads the ten colours of each showcase theme, light and dark, and the grid\'s own colours it gives', () => {
    const TEN = ['bg', 'bg-raised', 'fg', 'fg-muted', 'border', 'accent', 'accent-fg', 'danger', 'warning', 'success'];
    for (const n of ['midnight', 'clinic']) {
      const sk = skinFromCss(readFileSync(join(root, `packages/theme/${n}.css`), 'utf8'));
      expect(sk.name).toBe(n);
      // A colour of the grid's own a theme gives (`--dzg-*`, a pair of hex values): Clinic's block edge (Phase 5 step 11a).
      const own = n === 'clinic' ? ['--dzg-range-edge'] : [];
      for (const scheme of ['light', 'dark']) expect(Object.keys(sk[scheme]).sort(), `${n} ${scheme}`).toEqual([...TEN, ...own].sort());
      for (const k of [...TEN, ...own]) expect(sk.light[k]).toMatch(/^light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
    }
  });

  it('T-1: a planted low-contrast showcase theme fails the default run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'skin-'));
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, 'packages/theme'), { recursive: true });
    copyFileSync(join(root, 'scripts/check-contrast.mjs'), join(dir, 'scripts/check-contrast.mjs'));
    for (const f of ['dzgrid.css', 'contrast-pairs.json', 'clinic.css']) copyFileSync(join(root, `packages/theme/${f}`), join(dir, `packages/theme/${f}`));
    writeFileSync(join(dir, 'packages/theme/midnight.css'), readFileSync(join(root, 'packages/theme/midnight.css'), 'utf8').replace('--tz-fg: light-dark(#0b1424, #e6ecf7);', '--tz-fg: light-dark(#cccccc, #e6ecf7);'));
    let code = 0;
    let err = '';
    try { execFileSync('node', [join(dir, 'scripts/check-contrast.mjs')], { stdio: 'pipe' }); } catch (e) { code = (e as { status: number }).status; err = String((e as { stderr: Buffer }).stderr); }
    expect(code).toBe(1);
    expect(err).toMatch(/FAIL midnight light: cell text/);
  });
});
