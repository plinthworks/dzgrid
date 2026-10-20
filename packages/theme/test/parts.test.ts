// @vitest-environment node
// The cell parts' look (step 20, docs/behaviors/badge-boolean.md): the success colour, the five tones,
// their contrast pairs, more contrast and forced colours.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { check, paletteFromCss } from '../../../scripts/check-contrast.mjs';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const css = readFileSync(here('../dzgrid.css'), 'utf8');
const contrastCss = readFileSync(here('../contrast.css'), 'utf8');
const tailwind = readFileSync(here('../tailwind.css'), 'utf8');
type Pair = { what: string; fg: string; bg: string; min: number };
const spec = JSON.parse(readFileSync(here('../contrast-pairs.json'), 'utf8')) as { pairs: Pair[]; derived: Record<string, string> };
const high = JSON.parse(readFileSync(here('./fixtures/high-contrast.json'), 'utf8')) as { palettes: { light: Record<string, string>; dark: Record<string, string> }[] };
const TONES = { neutral: '--tz-fg-muted', info: '--tz-accent', success: '--tz-success', warning: '--tz-warning', danger: '--tz-danger' } as const;

describe('the success colour', () => {
  it('joins the palette, green, light and dark', () => {
    expect(css).toContain('--tz-success: light-dark(#15803d, #4ade80);');
    expect(tailwind).toContain('--tz-success: light-dark(var(--color-green-700), var(--color-green-400));');
  });

  it('has a more-contrast value, in both of contrast.css’s blocks and in its palette fixture', () => {
    expect(contrastCss.match(/--tz-success: light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\);/g)).toHaveLength(2);
    expect(high.palettes[0]!.light['success']).toMatch(/^#[0-9a-f]{6}$/);
    expect(high.palettes[0]!.dark['success']).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('the badge', () => {
  it('sets its tone colour per data-tone, neutral by default', () => {
    expect(css).toMatch(/\.dzg-badge \{[^}]*--t: var\(--tz-fg-muted\);/);
    for (const [tone, v] of Object.entries(TONES).slice(1)) expect(css, tone).toMatch(new RegExp(`\\.dzg-badge\\[data-tone=${tone}\\] \\{\\s*--t: var\\(${v}\\);\\s*\\}`));
  });

  it('draws a frame in the tone, a surface of the tone mixed into the page, the label in the text colour, the glyph in the tone', () => {
    const rule = /\.dzg-badge \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/border: 1px solid var\(--t\);/);
    expect(rule).toMatch(/background: color-mix\(in srgb, var\(--t\) (12|8)%, var\(--tz-bg\)\);/);
    expect(rule).toMatch(/color: var\(--tz-fg\);/);
    expect(css).toMatch(/\.dzg-glyph \{[^}]*color: var\(--t\);/);
  });

  it('lists four contrast pairs per tone: the tone on the page, on its surface and on a selected row at 3:1, the label on its surface at 4.5:1', () => {
    const mix = /background: color-mix\(in srgb, var\(--t\) (\d+)%/.exec(css)![1];
    for (const [tone, v] of Object.entries(TONES)) {
      const surface = `--dzg-badge-${tone}-bg`;
      expect(spec.derived[surface], tone).toBe(`color-mix(in srgb, var(${v}) ${mix}%, var(--tz-bg))`);
      const has = (fg: string, bg: string, min: number) => spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min === min);
      expect(has(v, '--tz-bg', 3), `${tone} on the page`).toBe(true);
      expect(has(v, surface, 3), `${tone} on its surface`).toBe(true);
      expect(has('--tz-fg', surface, 4.5), `label on the ${tone} surface`).toBe(true);
      expect(has(v, '--dzg-row-selected-bg', 3), `${tone} on a selected row`).toBe(true);
    }
    expect(spec.pairs.filter((p) => /^badge /.test(p.what))).toHaveLength(20);
  });

  it('passes those pairs with the shipped palette and the more-contrast one, light and dark', () => {
    const base = paletteFromCss(css);
    const only = { ...spec, pairs: spec.pairs.filter((p) => /^badge /.test(p.what)) };
    for (const scheme of ['light', 'dark'] as const) {
      expect(check(base, only, scheme).failures.map((f: Pair) => f.what), scheme).toEqual([]);
      const vars = { ...base, ...Object.fromEntries(Object.entries(high.palettes[0]![scheme]).map(([k, v]) => [`--tz-${k}`, v])) };
      expect(check(vars, only, scheme).failures.map((f: Pair) => f.what), `more contrast, ${scheme}`).toEqual([]);
    }
  });

  it('lines the glyph and the label up on logical sides, and draws the frame in the text colour under forced colours', () => {
    expect(css).toMatch(/\.dzg-badge,\s*\.dzg-bool \{[^}]*display: inline-flex;[^}]*gap: /);
    expect(css).toMatch(/\.dzg-badge \{[^}]*padding-inline: /);
    const forced = contrastCss.slice(contrastCss.indexOf('@media (forced-colors: active)'));
    expect(forced).toMatch(/\.dzg-badge \{\s*border-color: currentColor;/);
    // A selected row opts out of the system's colours (forced-color-adjust: none, inherited): its badges opt back in.
    expect(forced).toMatch(/\.dzg-badge \{[^}]*forced-color-adjust: auto;/);
  });
});
