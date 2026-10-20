// @vitest-environment node
// The theme's side of motion (step 26, docs/behaviors/motion.md): the value flash's tint and its
// non-colour mark (held still under reduced motion), forced colours, contrast pairs; every CSS
// transition only where motion is welcome and not switched off.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { check, paletteFromCss } from '../../../scripts/check-contrast.mjs';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const css = readFileSync(here('../dzgrid.css'), 'utf8');
const high = JSON.parse(readFileSync(here('./fixtures/high-contrast.json'), 'utf8')) as { palettes: { light: Record<string, string>; dark: Record<string, string> }[] };
const spec = JSON.parse(readFileSync(here('../contrast-pairs.json'), 'utf8')) as { pairs: { what: string; fg: string; bg: string; min: number }[]; derived: Record<string, string> };

/** The rule bodies for a selector, wherever they are. */
const bodies = (selector: string): string[] => [...css.matchAll(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]!);

describe('the value flash in the theme', () => {
  it('tints the cell by --dzg-flash (1 → 0, tweened) and marks its start edge, text unmoved (border-box: the padding gives the mark back)', () => {
    const rule = bodies('.dzg-cell.dzg-flash').find((b) => b.includes('background-color'));
    expect(rule).toBeDefined();
    expect(rule).toMatch(/background-color: color-mix\(in srgb, var\(--dzg-flash-color, var\(--tz-accent\)\) calc\(var\(--dzg-flash, 1\) \* 18%\), transparent\);/);
    expect(rule).toMatch(/border-inline-start: 3px solid/);
    expect(rule).toMatch(/padding-inline-start: calc\(var\(--dzg-cell-padding-inline, 0\.5rem\) - 3px\);/);
  });

  it('is not inside a motion media query: the still mark shows under reduced motion too', () => {
    const before = css.slice(0, css.indexOf('.dzg-cell.dzg-flash'));
    const opened = (before.match(/@media \(prefers-reduced-motion/g) ?? []).length;
    // Every motion media block opened before it is closed before it (the rule sits at the top level of .dzg's output).
    expect(opened).toBe(0);
  });

  it('keeps the mark in forced colours (Highlight)', () => {
    const forced = css.split('@media (forced-colors: active)').slice(1).join('');
    expect(forced).toMatch(/\.dzg-cell\.dzg-flash \{\s*border-inline-start-color: Highlight;\s*\}/);
  });

  it('lists its contrast pairs: the text on the tint (plain, selected, hover) at 4.5:1, the mark at 3:1', () => {
    for (const bg of ['--dzg-flash-bg', '--dzg-flash-selected-bg', '--dzg-flash-hover-bg']) expect(spec.pairs.some((p) => p.fg === '--tz-fg' && p.bg === bg && p.min === 4.5), bg).toBe(true);
    for (const bg of ['--dzg-flash-bg', '--dzg-flash-selected-bg']) expect(spec.pairs.some((p) => p.fg === '--dzg-flash-color' && p.bg === bg && p.min === 3), bg).toBe(true);
    expect(spec.derived['--dzg-flash-bg']).toBe('color-mix(in srgb, var(--dzg-flash-color) 18%, var(--tz-bg))');
    expect(spec.derived['--dzg-flash-selected-bg']).toBe('color-mix(in srgb, var(--dzg-flash-color) 18%, var(--dzg-row-selected-bg))');
  });

  it('passes them with the shipped palette and the more-contrast one, light and dark', () => {
    const base = paletteFromCss(css);
    const flash = { ...spec, pairs: spec.pairs.filter((p) => p.bg.startsWith('--dzg-flash')) };
    expect(flash.pairs.length).toBe(5);
    for (const scheme of ['light', 'dark'] as const) {
      expect(check(base, flash, scheme).failures.map((f: { what: string }) => f.what), scheme).toEqual([]);
      const vars = { ...base, ...Object.fromEntries(Object.entries(high.palettes[0]![scheme]).map(([k, v]) => [`--tz-${k}`, v])) };
      expect(check(vars, flash, scheme).failures.map((f: { what: string }) => f.what), `more contrast, ${scheme}`).toEqual([]);
    }
  });
});

describe('CSS motion only where it is welcome', () => {
  it('every transition or animation sits under prefers-reduced-motion: no-preference and not data-motion=off', () => {
    const blocks = css.split('@media (prefers-reduced-motion: no-preference)');
    // Outside those blocks: no transition, no animation.
    // A top-level media block closes at the first `}` in the first column.
    const outside = blocks[0]! + blocks.slice(1).map((b) => b.slice(b.indexOf('\n}\n') + 3)).join('');
    expect(outside).not.toMatch(/\b(transition|animation)(-[a-z]+)?:/);
    // Inside: each rule's selectors are under :not([data-motion=off]).
    for (const b of blocks.slice(1)) {
      const inner = b.slice(b.indexOf('{') + 1, b.indexOf('\n}\n'));
      const rules = [...inner.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => /\b(transition|animation)(-[a-z]+)?:/.test(m[2]!));
      expect(rules.length).toBeGreaterThan(0);
      for (const m of rules) for (const sel of m[1]!.split(',')) expect(sel.trim(), sel).toMatch(/^\.dzg:not\(\[data-motion=off\]\)/);
    }
  });
});
