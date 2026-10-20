// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile } from 'sass';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const scss = readFileSync(here('../dzgrid.scss'), 'utf8');
const css = readFileSync(here('../dzgrid.css'), 'utf8');
const pairs = JSON.parse(readFileSync(here('../contrast-pairs.json'), 'utf8')) as { pairs: { fg: string; bg: string; min: number; what: string }[] };
const TZ = ['bg', 'bg-raised', 'fg', 'fg-muted', 'border', 'accent', 'accent-fg', 'danger', 'warning', 'success'];

describe('@dzgrid/theme', () => {
  it('is what dzgrid.scss compiles to (no drift)', () => {
    const out = compile(here('../dzgrid.scss'), { style: 'expanded' }).css;
    expect(css.trim()).toBe(out.trim());
  });

  it('defines the nine shared --tz-* colours and success (step 20), each as light-dark(), with tzslot’s values', () => {
    for (const name of TZ) expect(css, name).toMatch(new RegExp(`--tz-${name}: light-dark\\(#[0-9a-f]{6}, #[0-9a-f]{6}\\);`));
    expect(css).toContain('--tz-accent: light-dark(#2563eb, #60a5fa);');
    expect(css).toContain('--tz-bg: light-dark(#ffffff, #18181b);');
  });

  it('declares its own colours at their point of use, falling back to the palette', () => {
    for (const v of ['--dzg-header-bg', '--dzg-row-hover-bg', '--dzg-row-selected-bg', '--dzg-focus-ring'])
      expect(css, v).toMatch(new RegExp(`var\\(${v}, `));
    // Never on :root: a variable that names another is frozen where it is declared.
    expect(css).not.toMatch(/:root\s*\{[^}]*--dzg-/);
  });

  it('holds no colour outside the palette and no physical side', () => {
    expect(checkScss(scss)).toEqual([]);
    expect(checkScss(readFileSync(here('../contrast.css'), 'utf8')).filter((f) => f.rule === 'physical')).toEqual([]);
  });

  it('lists in contrast-pairs.json every colour a text or a part is drawn in', () => {
    const used = new Set<string>();
    // The colour properties; the outermost var() of each value (a fallback inside is the derived default).
    for (const m of css.matchAll(/(?:^|[;{\s])(color|background(?:-color)?|outline(?:-color)?|border(?:-(?:block|inline)(?:-start|-end)?)?(?:-color)?)\s*:\s*([^;]+);/gm)) {
      const v = /var\((--(?:dzg|tz)-[a-z-]+)/.exec(m[2]!);
      if (v) used.add(v[1]!);
    }
    const listed = new Set(pairs.pairs.flatMap((p) => [p.fg, p.bg]));
    const missing = [...used].filter((v) => !listed.has(v) && v !== '--tz-color-scheme');
    expect(missing).toEqual([]);
  });

  it('marks another month’s days in a filter popup by the muted colour, not an opacity under 4.5:1; never a chosen day', () => {
    const rule = /\.dzg-popup :is\(\.tz-cal__day--outside, \.tz-range__day--outside\):not\(([^)]*)\)\s*\{\s*color: var\(--tz-fg-muted\);/.exec(css);
    expect(rule).not.toBeNull();
    for (const c of ['.tz-cal__day--selected', '.tz-range__day--start', '.tz-range__day--end']) expect(rule![1], c).toContain(c);
    expect(css).toContain('--tz-cal-outside-opacity: 1;');
    const on = (bg: string) => pairs.pairs.some((p) => p.fg === '--tz-fg-muted' && p.bg === bg && p.min === 4.5);
    expect(on('--tz-bg')).toBe(true);
    expect(on('--tz-range-within-bg')).toBe(true);
  });

  it('follows data-theme on any element, like tzslot, and the system otherwise', () => {
    expect(css).toMatch(/\[data-theme=["']?dark["']?\]\s*\{\s*--tz-color-scheme: dark;/);
    expect(css).toMatch(/\.dzg\s*\{[^}]*color-scheme: var\(--tz-color-scheme, light dark\)/);
  });
});
