// @vitest-environment node
// @dzgrid/theme/tooltips.css (1.12.0, docs/behaviors/tooltips-popovers.md 4, 6–8, 15): tones, four-sided arrows, the
// animations and the popover's look, both copies. Expectations written by hand; the computed looks, the motion and its
// absence under reduced motion are checked in real browsers by scripts/browser-1-12.mjs.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet as read } from './css-tree.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const file = (p: string) => readFileSync(here(p), 'utf8');
const B = ':is(.dzg-tooltip, .dzg-popover)';
const COPIES = ['', '.unlayered'] as const;

describe('tooltips.scss compiles to both copies (no drift), layered and not', () => {
  for (const [c, src] of [['', '@use "tooltips";'], ['.unlayered', '@use "tooltips" with ($layered: false);']] as const) {
    it(`tooltips${c}.css`, () => {
      expect(file(`../tooltips${c}.css`)).toBe(`${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`);
    });
  }
  it('the layered copy in dzgrid.theme, the unlayered one in no layer', () => {
    expect(read(file('../tooltips.css')).rules.every((r) => r.layers.join() === 'dzgrid.theme')).toBe(true);
    expect(read(file('../tooltips.unlayered.css')).rules.every((r) => r.layers.length === 0)).toBe(true);
  });
});

for (const c of COPIES) {
  const css = file(`../tooltips${c}.css`);
  const rules = read(css).rules;
  const body = (sel: string, at?: string) => rules.filter((r) => r.selector === sel && (at === undefined || r.at.join() === at)).map((r) => r.body).join('\n');

  describe(`tooltips${c}.css`, () => {
    it('five tones, each its background, text, edge and arrow as variables; today\'s info by default', () => {
      const tones = { info: ['var(--dzg-tooltip-bg, var(--tz-fg))', 'var(--dzg-tooltip-fg, var(--tz-bg))', 'transparent'], neutral: ['var(--tz-bg-raised)', 'var(--tz-fg)', 'var(--tz-border)'], success: ['var(--tz-success)', 'var(--tz-bg)', 'transparent'], warning: ['var(--tz-warning)', 'var(--tz-bg)', 'transparent'], danger: ['var(--tz-danger)', 'var(--tz-bg)', 'transparent'] };
      for (const [t, [bg, fg, edge]] of Object.entries(tones)) {
        const b = body(`${B}[data-tone=${t}]`);
        expect(b, t).toContain(`background: var(--dzg-tooltip-${t}-bg, ${bg});`);
        expect(b, t).toContain(`color: var(--dzg-tooltip-${t}-fg, ${fg});`);
        expect(b, t).toContain(`outline: var(--dzg-line, 1px) solid var(--dzg-tooltip-${t}-border, ${edge});`);
        expect(b, t).toContain(`--dzg-tip-arrow-bg: var(--dzg-tooltip-${t}-arrow, var(--dzg-tooltip-${t}-bg, ${bg}));`);
      }
    });

    it('the arrow: on the side opened, at the anchor\'s middle; the four sides; turned in right to left', () => {
      expect(body(`${B}::before, .dzg-popover::after`)).toContain('inset-inline-start: calc(var(--dzg-tip-at, 1rem) - var(--dzg-tooltip-arrow-size, 0.375rem));');
      expect(body(`${B}::before, .dzg-popover::after`)).toContain('background: var(--dzg-tip-arrow-bg);');
      expect(body(`${B}[data-side=block-start]::before, .dzg-popover[data-side=block-start]::after`)).toContain('rotate: 180deg;');
      const inl = body(`${B}:is([data-side=inline-end], [data-side=inline-start])::before, .dzg-popover:is([data-side=inline-end], [data-side=inline-start])::after`);
      expect(inl).toContain('inset-block: calc(var(--dzg-tip-at, 1rem) - var(--dzg-tooltip-arrow-size, 0.375rem)) auto;');
      expect(inl).toContain('inset-inline: auto 100%;');
      expect(body(`${B}:is([data-side=inline-end], [data-side=inline-start]):dir(rtl)::before, .dzg-popover:is([data-side=inline-end], [data-side=inline-start]):dir(rtl)::after`)).toBe('scale: -1 1;');
      // The gap: the margin on every side, which the grid reads.
      expect(body('.dzg-tooltip, .dzg-popover')).toContain('margin-block-start: var(--dzg-tooltip-arrow-size, 0.375rem);');
    });

    it('animation: opacity, translate and scale only, display and overlay discrete; open and close timings as variables', () => {
      const b = body('.dzg-tooltip, .dzg-popover');
      expect(b).toContain('transition-property: opacity, translate, scale, display, overlay;');
      expect(b).toContain('transition-behavior: allow-discrete;');
      expect(b).toContain('transition-duration: var(--dzg-tooltip-open-duration, 140ms);');
      expect(b).toContain('transition-delay: var(--dzg-tooltip-open-delay, 0s);');
      const closing = body(`${B}:is([hidden], [data-closing])`);
      expect(closing).toContain('opacity: 0;');
      expect(closing).toContain('transition-duration: var(--dzg-tooltip-close-duration, 100ms);');
      expect(closing).toContain('transition-timing-function: var(--dzg-tooltip-close-easing, ease-in);');
      expect(body('.dzg-popover')).toContain('transition-duration: var(--dzg-popover-open-duration, var(--dzg-tooltip-open-duration, 140ms));');
      // Opening from the starting style; every preset's start.
      expect(body(`${B}:not([hidden])`, '@starting-style')).toBe('opacity: 0;');
      expect(body(`${B}:is([data-animation=scale], [data-animation=pop]):not([hidden])`, '@starting-style')).toBe('scale: var(--dzg-tip-scale);');
      expect(body(`${B}:is([data-animation=slide], [data-animation=rise]):not([hidden])`, '@starting-style')).toBe('translate: var(--dzg-tip-from);');
      // Nothing that lays out.
      for (const r of rules) expect(r.body, r.selector).not.toMatch(/transition-property:[^;]*(width|height|inset|margin|top)/);
    });

    it('slide and rise from the anchor\'s side, following the flip and the reading direction', () => {
      const SR = `${B}:is([data-animation=slide], [data-animation=rise])`;
      expect(body(SR)).toContain('--dzg-tip-dist: var(--dzg-tooltip-slide, 6px);');
      expect(body(SR)).toContain('--dzg-tip-from: 0 calc(-1 * var(--dzg-tip-dist));');
      expect(body(`${SR}[data-side=block-start]`)).toBe('--dzg-tip-from: 0 var(--dzg-tip-dist);');
      expect(body(`${SR}[data-side=inline-end]`)).toBe('--dzg-tip-from: calc(-1 * var(--dzg-tip-dist) * var(--dzg-tip-sign)) 0;');
      expect(body(`${B}:dir(rtl)`)).toBe('--dzg-tip-sign: -1;');
    });

    it('the richer presets, opt-in: pop from 80 % with a slight overshoot, rise 12 px with a long soft ease; closing as short as the others', () => {
      expect(body(`${B}[data-animation=pop]`)).toContain('transition-duration: var(--dzg-tooltip-pop-duration, 260ms);');
      expect(body(`${B}[data-animation=pop]`)).toContain('transition-timing-function: var(--dzg-tooltip-pop-easing, cubic-bezier(0.34, 1.4, 0.64, 1));');
      expect(body(`${B}[data-animation=pop]`)).toContain('--dzg-tip-scale: var(--dzg-tooltip-pop-scale, 0.8);');
      expect(body(`${B}[data-animation=rise]`)).toContain('transition-duration: var(--dzg-tooltip-rise-duration, 320ms);');
      expect(body(`${B}[data-animation=rise]`)).toContain('--dzg-tip-dist: var(--dzg-tooltip-rise, 12px);');
      // The closing rule comes after their timings, at the same weight: it wins when hidden.
      const at = (sel: string) => rules.findIndex((r) => r.selector === sel && r.body.includes('transition-duration'));
      expect(at(`${B}:is([hidden], [data-closing])`)).toBeGreaterThan(at(`${B}[data-animation=pop]`));
      expect(at(`${B}:is([hidden], [data-closing])`)).toBeGreaterThan(at(`${B}[data-animation=rise]`));
    });

    it('none, the app\'s own, a grid without motion, reduced motion: no transition', () => {
      expect(body(`${B}:is([data-animation=none], [data-animation=custom]), [data-motion=off] .dzg-tooltip`)).toBe('transition: none;');
      expect(body('.dzg-tooltip, .dzg-popover', '@media (prefers-reduced-motion: reduce)')).toBe('transition: none;');
      // Unless the app asks a short fade: opacity only, nothing moves or grows.
      const fade = body(`${B}[data-reduced=fade]:not([data-animation=none], [data-animation=custom], [data-motion=off] *)`, '@media (prefers-reduced-motion: reduce)');
      expect(fade).toContain('transition: opacity var(--dzg-tooltip-reduced-duration, 120ms) linear');
      expect(fade).toContain('translate: none !important;');
      expect(fade).toContain('scale: none !important;');
    });

    it('forced colours: an edge and the arrow in the system\'s colour', () => {
      expect(body('.dzg-tooltip, .dzg-popover', '@media (forced-colors: active)')).toBe('outline: 1px solid CanvasText;');
      expect(body(`${B}::before, .dzg-popover::after`, '@media (forced-colors: active)')).toContain('background: CanvasText;');
    });

    it('the popover\'s look: every part a variable', () => {
      const b = body('.dzg-popover');
      for (const v of ['--dzg-popover-max-width', '--dzg-popover-padding', '--dzg-popover-border', '--dzg-popover-radius', '--dzg-popover-fg', '--dzg-popover-bg', '--dzg-popover-shadow', '--dzg-popover-font-size', '--dzg-popover-arrow-color']) expect(b, v).toContain(`var(${v}`);
    });

    it('an app shape: no box nor arrow, its path filled and edged in the tone\'s colours, under the content', () => {
      expect(body(`${B}[data-shape]`)).toContain('background: transparent;');
      expect(body(`${B}[data-shape]::before, .dzg-popover[data-shape]::after`)).toBe('display: none;');
      expect(body('.dzg-tip-shape')).toContain('z-index: -1;');
      expect(body('.dzg-tip-shape > path')).toContain('fill: var(--dzg-tip-arrow-bg);');
      expect(body('.dzg-tip-shape > path')).toContain('stroke: var(--dzg-tip-arrow-edge);');
    });

    it('logical sides only', () => {
      expect(css).not.toMatch(/\b(left|right)\b/);
    });
  });
}
