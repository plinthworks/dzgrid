// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { contrast, parseColor, resolveColor, paletteFromCss, check } from '../check-contrast.mjs';

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

  it('passes contrast.css’s palette, light and dark', () => {
    expect(() => execFileSync('node', [join(root, 'scripts/check-contrast.mjs'), '--palette', join(root, 'packages/theme/test/fixtures/high-contrast.json')], { stdio: 'pipe' })).not.toThrow();
  });
});
