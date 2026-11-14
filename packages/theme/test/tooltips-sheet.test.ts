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
      expect(body(`${B}:is([data-animation=none], [data-animation=custom]), [data-motion=off] .dzg-tooltip, [data-motion=off] .dzg-tooltip::after, [data-motion=off] .dzg-tooltip > *`)).toBe('transition: none; animation: none;');
      // The morph's layer and a part's elements too (it animates them).
      expect(body(`.dzg-tooltip, .dzg-popover, ${B}[data-animation=morph], ${B}[data-animation=morph] > *, .dzg-tooltip[data-animation=morph]::after, .dzg-popover[data-animation=morph][data-side]::before`, '@media (prefers-reduced-motion: reduce)')).toBe('transition: none; animation: none;');
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
      expect(body(`${B}[data-shape=""]`)).toContain('background: transparent;');
      expect(body(`${B}[data-shape=""]::before, .dzg-popover[data-shape=""]::after`)).toBe('display: none;');
      expect(body('.dzg-tip-shape')).toContain('z-index: -1;');
      expect(body('.dzg-tip-shape > path')).toContain('fill: var(--dzg-tip-arrow-bg);');
      expect(body('.dzg-tip-shape > path')).toContain('stroke: var(--dzg-tip-arrow-edge);');
    });

    it('ready-made shapes (20): the edge and a shadow around the whole outline; pill, ticket, bubble', () => {
      const S = `${B}:is([data-shape=bubble], [data-shape=ticket], [data-shape=pill]`;
      const all = body(`${S}, [data-animation=morph])`);
      expect(all).toContain('outline-color: transparent;');
      expect(all).toContain('box-shadow: none;');
      expect(all).toContain('filter: drop-shadow(var(--dzg-line, 1px) 0 0 var(--dzg-tip-arrow-edge)) drop-shadow(calc(-1 * var(--dzg-line, 1px)) 0 0 var(--dzg-tip-arrow-edge)) drop-shadow(0 var(--dzg-line, 1px) 0 var(--dzg-tip-arrow-edge)) drop-shadow(0 calc(-1 * var(--dzg-line, 1px)) 0 var(--dzg-tip-arrow-edge)) var(--dzg-tip-shadow);');
      expect(body(`${S})`)).toContain('--dzg-tip-shadow: var(--dzg-tooltip-shape-shadow, ');
      expect(body(`${B}[data-shape=pill]`)).toContain('border-radius: 999px;');
      expect(body(`${B}[data-shape=pill]`)).toContain('padding-inline: var(--dzg-tooltip-pill-padding, 0.75rem);');
      // The ticket: four round bites out of its background, the tone's colour.
      const t = body(`${B}[data-shape=ticket]`);
      expect(t.match(/radial-gradient\(circle at /g)).toHaveLength(4);
      expect(t).toContain('transparent var(--dzg-tooltip-ticket-notch, 0.375rem), var(--dzg-tip-bg)');
      expect(t).toContain('background: var(--dzg-tip-fill);');
      // The bubble: rounder, its tail the arrow turned per side (the gap the grid reads is its size).
      expect(body(`${B}[data-shape=bubble]`)).toContain('border-radius: var(--dzg-tooltip-bubble-radius, 0.75rem);');
      expect(body(`${B}[data-shape=bubble]`)).toContain('--dzg-tooltip-arrow-size: var(--dzg-tooltip-bubble-tail, 0.5rem);');
      const tail = body('.dzg-tooltip[data-shape=bubble][data-side]::before, .dzg-popover[data-shape=bubble][data-side]::after');
      expect(tail).toContain('clip-path: polygon(0% 58%');
      expect(tail).toContain('scale: none;');
      expect(body('.dzg-tooltip[data-shape=bubble][data-side=block-start]::before, .dzg-popover[data-shape=bubble][data-side=block-start]::after')).toContain('rotate: 180deg;');
      expect(body('.dzg-tooltip[data-shape=bubble]:is([data-side=inline-end], [data-side=inline-start])::before, .dzg-popover[data-shape=bubble]:is([data-side=inline-end], [data-side=inline-start])::after')).toContain('rotate: calc(-90deg * var(--dzg-tip-sign));');
      expect(body('.dzg-tooltip[data-shape=bubble][data-side=inline-start]::before, .dzg-popover[data-shape=bubble][data-side=inline-start]::after')).toContain('rotate: calc(90deg * var(--dzg-tip-sign));');
      // The popover's edge triangle not drawn under a shape (the drop-shadows draw the edge).
      expect(body('.dzg-popover:is([data-shape=bubble], [data-shape=ticket], [data-shape=pill])::before')).toBe('display: none;');
    });

    it('morph (7): from a pill at the arrow to the whole box, a layer\'s clip-path; the content from its first third; closing reversed, faster', () => {
      const M = `${B}[data-animation=morph]`;
      expect(body(M)).toContain('--dzg-tip-cx: calc(50% + (var(--dzg-tip-at, 1rem) - 50%) * var(--dzg-tip-sign));');
      // The pill's corners 1.25rem: round, and easing into the bubble's own (from 999px they snapped at the end).
      expect(body(M)).toContain('--dzg-tip-pill: inset(0 var(--dzg-tip-x1) 55% var(--dzg-tip-x0) round 1.25rem);');
      expect(body(M)).toContain('background: transparent;');
      // One frame ahead (16 ms; owner 2026-11-14 « pas aussi fluide que GSAP »): its first painted frame already moves.
      expect(body(M)).toContain('transition-delay: calc(var(--dzg-tooltip-open-delay, 0s) - 16ms);');
      expect(body(M)).toContain('animation: dzg-tip-words var(--dzg-tooltip-morph-content-duration, 200ms) ease-out calc(var(--dzg-tooltip-morph-content-delay, 120ms) - 16ms) backwards;');
      expect(body(`${M} > *`)).toContain('animation: dzg-tip-rise var(--dzg-tooltip-morph-content-duration, 200ms) ease-out calc(var(--dzg-tooltip-morph-content-delay, 120ms) - 16ms) backwards;');
      expect(body(`${M}[data-side=block-start]`)).toBe('--dzg-tip-pill: inset(55% var(--dzg-tip-x1) 0 var(--dzg-tip-x0) round 1.25rem);');
      expect(body(`${M}[data-side=inline-end]`)).toBe('--dzg-tip-pill: inset(var(--dzg-tip-y0) calc(27.5% + 27.5% * var(--dzg-tip-sign)) var(--dzg-tip-y1) calc(27.5% - 27.5% * var(--dzg-tip-sign)) round 1.25rem);');
      const L = '.dzg-tooltip[data-animation=morph]::after, .dzg-popover[data-animation=morph][data-side]::before';
      expect(body(L)).toContain('z-index: -1;');
      expect(body(L)).toContain('background: var(--dzg-tip-fill);');
      expect(body(L)).toContain('clip-path: inset(0 round 0);');
      // 320 ms, GSAP's power3.out as a curve (the owner's app's tween), one frame ahead.
      expect(body(L)).toContain('animation: dzg-tip-morph var(--dzg-tooltip-morph-duration, 320ms) var(--dzg-tooltip-morph-easing, cubic-bezier(0.33, 1, 0.68, 1)) calc(-1 * 16ms);');
      expect(body('from', '@keyframes dzg-tip-morph')).toBe('clip-path: var(--dzg-tip-pill);');
      expect(body('from', '@keyframes dzg-tip-rise')).toBe('opacity: 0; translate: 0 0.25rem;');
      // Closing: the content first, the shape back to the pill, the bubble fading last; 180 ms in all.
      const C = body(`${M}:is([hidden], [data-closing])`);
      expect(C).toContain('transition-duration: calc(var(--dzg-tooltip-morph-close-duration, 180ms) * 0.45), calc(var(--dzg-tooltip-morph-close-duration, 180ms) * 0.3), var(--dzg-tooltip-morph-close-duration, 180ms), var(--dzg-tooltip-morph-close-duration, 180ms);');
      expect(body('.dzg-tooltip[data-animation=morph]:is([hidden], [data-closing])::after, .dzg-popover[data-animation=morph][data-side]:is([hidden], [data-closing])::before')).toContain('clip-path: var(--dzg-tip-pill);');
      // Paint only: no layout property moves.
      for (const r of rules) expect(r.body, r.selector).not.toMatch(/(transition|animation)[^;]*\b(width|height|inset|margin|padding|top)\b/);
    });

    it('logical sides only', () => {
      expect(css).not.toMatch(/\b(left|right)\b/);
    });
  });
}
