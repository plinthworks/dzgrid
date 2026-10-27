// @vitest-environment node
// Showcase themes, step 2 (docs/behaviors/theming.md, themes-plan §2, owner T1): the grid's CSS in
// `@layer dzgrid.*`, an unlayered copy for apps whose reset is unlayered, and the new tokens.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, flat, type Rule } from './css-tree.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const pkg = JSON.parse(read('package.json')) as { exports: Record<string, unknown>; files: string[] };
const spec = JSON.parse(read('contrast-pairs.json')) as { derived: Record<string, string>; pairs: { what: string; fg: string; bg: string; min: number }[] };

/** tzslot's sheets are unlayered (tzslot's own): the theme's two rules restyling its panel stay beside them. */
const TZSLOT = (r: Rule) => r.selector.startsWith('.dzg-popup ') && r.selector.includes('.tz-');
/** A palette block: only --tz-* colours, each a light-dark() pair. */
// A palette block: tzslot's colours, and (more contrast, step 7) the saving border's own.
const PALETTE = (r: Rule) => r.body.split(';').map((d) => d.trim()).filter(Boolean).every((d) => /^--(tz-[a-z-]+|dzg-saving-color|dzg-range-edge|dzg-refused-color): light-dark\(/.test(d)); // the block's edge: Phase 5 step 11a; the refusal's colour: step 12 (S12-Q8)

describe('every theme file opens with the order statement and keeps its rules in its layer', () => {
  for (const [file, layer] of [['dzgrid.css', 'dzgrid.theme'], ['contrast.css', 'dzgrid.contrast'], ['tailwind.css', 'dzgrid.bridge']] as const) {
    it(`${file}: « ${ORDER}; » first, every rule in ${layer}`, () => {
      const s = sheet(read(file));
      expect(s.first).toBe(`${ORDER};`);
      const outside = s.rules.filter((r) => r.layers.join('/') !== layer);
      if (file === 'dzgrid.css') {
        // The one exception, named: tzslot's panel (its surface; the chosen day in forced colours).
        expect(outside.map((r) => r.selector)).toEqual([
          // R1 (review of part 1): tzslot sets `color: inherit` on its days, unlayered.
          '.dzg-popup :is(.tz-cal__day--outside, .tz-range__day--outside):not(.tz-cal__day--selected, .tz-range__day--start, .tz-range__day--end)',
          '.dzg-popup .tz-field__panel',
          '.dzg-popup :is(.tz-cal__day--selected, .tz-range__day--start, .tz-range__day--end, .dzg-fpreset[aria-pressed=true])',
        ]);
        expect(outside.every((r) => TZSLOT(r) && r.layers.length === 0)).toBe(true);
      } else expect(outside).toEqual([]);
      expect(s.rules.length).toBeGreaterThan(0);
    });
  }
});

describe('the unlayered copies (T1): the same rules, outside the layer, but the palette', () => {
  for (const [copy, layered] of [['dzgrid.unlayered.css', 'dzgrid.css'], ['contrast.unlayered.css', 'contrast.css']] as const) {
    it(`${copy} holds ${layered}'s rules in the same order; only its palette blocks stay layered`, () => {
      expect(existsSync(here(`../${copy}`))).toBe(true);
      const a = sheet(read(layered));
      const b = sheet(read(copy));
      expect(b.rules.map(flat)).toEqual(a.rules.map(flat));
      expect(b.first).toBe(`${ORDER};`);
      const still = b.rules.filter((r) => r.layers.length);
      expect(still.length).toBeGreaterThan(0);
      expect(still.every(PALETTE)).toBe(true);
      // Every palette block of the layered file is still layered in the copy, at the same layer.
      expect(still.map((r) => `${r.layers.join('/')} ${flat(r)}`)).toEqual(a.rules.filter(PALETTE).map((r) => `${r.layers.join('/')} ${flat(r)}`));
    });
  }

  it('dzgrid.unlayered.css is what dzgrid.scss compiles to with $layered: false (no drift)', () => {
    const out = compileString('@use "dzgrid" with ($layered: false);', { loadPaths: [here('..')], style: 'expanded' }).css;
    expect(read('dzgrid.unlayered.css').trim()).toBe(out.trim());
  });

  it('contrast.css and its copy are what contrast.scss compiles to (no drift)', () => {
    const on = compileString('@use "contrast";', { loadPaths: [here('..')], style: 'expanded' }).css;
    const off = compileString('@use "contrast" with ($layered: false);', { loadPaths: [here('..')], style: 'expanded' }).css;
    expect(read('contrast.css').trim()).toBe(on.trim());
    expect(read('contrast.unlayered.css').trim()).toBe(off.trim());
  });

  it('the package exports and ships contrast.scss, for Sass users (review of part 1)', () => {
    expect(pkg.exports['./contrast.scss']).toBe('./contrast.scss');
    expect(pkg.files).toContain('contrast.scss');
  });

  it('the package exports and ships both copies', () => {
    for (const f of ['dzgrid.unlayered.css', 'contrast.unlayered.css']) {
      expect(pkg.exports[`./${f}`]).toBe(`./${f}`);
      expect(pkg.files).toContain(f);
    }
  });
});

describe('the new tokens (themes-plan §1)', () => {
  const css = read('dzgrid.css');

  it('--dzg-line: the width of every rule drawn in the border colour, 1px by default', () => {
    expect(css).not.toMatch(/\b1px solid var\(--tz-border\)/);
    const uses = css.match(/var\(--dzg-line, 1px\) solid var\(--tz-border\)/g) ?? [];
    // The frame, the cell rule, a group's rule, the footer's, the popup's, the value list's, a detail panel's.
    expect(uses.length).toBe(7);
    // A body cell's line height leaves room for its rule, whatever its width.
    expect(css).toMatch(/line-height: calc\(var\(--dzg-row-height, 2rem\) - var\(--dzg-line, 1px\)\)/);
  });

  it('--dzg-pill-radius: a badge’s corners, 1em by default (today’s look)', () => {
    expect(css).toMatch(/\.dzg-badge \{[^}]*border-radius: var\(--dzg-pill-radius, 1em\);/);
  });

  it('neither is declared on :root by the base', () => {
    for (const r of sheet(css).rules.filter((x) => x.selector.includes(':root'))) expect(r.body).not.toMatch(/--dzg-/);
  });

  it('--dzg-saving-color and --dzg-refused-color are reserved with their defaults and checked on every row surface (Q9, Q10)', () => {
    // Owner, step 7: the warning, apart from the focus ring's accent.
    expect(spec.derived['--dzg-saving-color']).toBe('var(--tz-warning)');
    expect(spec.derived['--dzg-refused-color']).toBe('var(--tz-danger)');
    for (const fg of ['--dzg-saving-color', '--dzg-refused-color'])
      for (const bg of ['--tz-bg', '--dzg-row-hover-bg', '--dzg-row-selected-bg'])
        expect(spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min === 3), `${fg} on ${bg}`).toBe(true);
  });
});

describe('the sheet says how to keep the order in a shadow root, and why !important stays outside (review of part 1)', () => {
  const doc = readFileSync(here('../../../docs/behaviors/theming.md'), 'utf8');
  it('R2: the order line in a <style> before the grid mounts, or injectStyles: false and LAYOUT_CSS adopted after it', () => {
    expect(doc).toMatch(/shadow root/i);
    expect(doc).toMatch(/before the grid mounts/);
    expect(doc).toMatch(/injectStyles: false`[^.]*adopt/);
  });
  it('R5: the layout\'s !important rules stay outside the layer', () => {
    expect(doc).toMatch(/`!important`[^.]*outside the layer/);
  });
});
