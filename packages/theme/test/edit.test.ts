// @vitest-environment node
// The edit marks' styles (Phase 5 step 4, owner S4-O2: a separate `@dzgrid/theme/edit.css`; edit-save.md
// 6–13, edit-validation.md 2–2b, edit-reapply.md 3–4; Q9, Q10 amended): every class has its rule, the
// running border animates one property and stops by 5 s, reduced motion and motion off stand still, right to
// left turns the other way, the refusal blinks twice in 0.5 s, forced colours keep the shapes, the reserved
// colours are read with their fallbacks; the file's layer, its source and its unlayered copy.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet, ORDER, type Rule } from './css-tree.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const file = here('../edit.css');
const css = existsSync(file) ? read('edit.css') : '';
const s = sheet(css);
const rules = (pred: (r: Rule) => boolean) => s.rules.filter(pred);
const plain = (r: Rule) => r.at.length === 0;
const decl = (sel: RegExp, at: (r: Rule) => boolean = plain) => rules((r) => sel.test(r.selector) && at(r)).map((r) => r.body).join(' ');
const media = (q: string) => (r: Rule) => r.at.some((a) => a.includes(q));
const keyframes = (name: string) => {
  const m = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?\\})\\s*\\}`).exec(css);
  return m ? m[1]! : '';
};
const spec = JSON.parse(read('contrast-pairs.json')) as { derived: Record<string, string>; pairs: { what: string; fg: string; bg: string; min: number }[] };
const pkg = JSON.parse(read('package.json')) as { exports: Record<string, unknown>; files: string[] };

describe('edit.css', () => {
  it('exists, is shipped and exported, opens with the order statement, every rule in dzgrid.theme', () => {
    expect(existsSync(file)).toBe(true);
    expect(pkg.exports['./edit.css']).toBe('./edit.css');
    expect(pkg.files).toEqual(expect.arrayContaining(['edit.css', 'edit.unlayered.css', 'edit.scss']));
    expect(s.first).toBe(`${ORDER};`);
    expect(s.rules.length).toBeGreaterThan(0);
    expect(s.rules.filter((r) => r.layers.join('/') !== 'dzgrid.theme' && !r.selector.match(/^(from|to|\d+%)/)).map((r) => r.selector)).toEqual([]);
  });

  it('is its source compiled, and its unlayered copy the same rules outside the layer', () => {
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(css).toBe(out('@use "edit";'));
    expect(read('edit.unlayered.css')).toBe(out('@use "edit" with ($layered: false);'));
    expect(sheet(read('edit.unlayered.css')).rules.every((r) => r.layers.length === 0)).toBe(true);
  });

  it('draws every mark the entry writes', () => {
    for (const c of ['pending', 'saving', 'still', 'saved', 'refused', 'blink-a', 'blink-b', 'failed']) expect(css, c).toContain(`.dzg-cell--${c}`);
    expect(css).toContain('[data-dzg-stale]');
    expect(css).toContain('.dzg-reapply');
  });

  it('marks are shapes at the inline end, in the reserved colours with their fallbacks; the text keeps its room', () => {
    const marks = decl(/dzg-cell--(pending|saved|failed)\)?::after/);
    expect(marks).toMatch(/inset-inline-end:/);
    expect(marks).toMatch(/clip-path:/);
    expect(decl(/dzg-cell--pending::after/)).toMatch(/var\(--dzg-saving-color, var\(--tz-accent\)\)/);
    expect(decl(/dzg-cell--saved::after/)).toMatch(/var\(--dzg-saved-color, var\(--tz-success\)\)/);
    expect(decl(/dzg-cell--failed::after/)).toMatch(/var\(--dzg-refused-color, var\(--tz-danger\)\)/);
    expect(decl(/\.dzg-cell--pending,|:is\(\.dzg-cell--pending/)).toMatch(/padding-inline-end:/);
  });

  it('the running border: one custom property animated, 1.2 s a turn, four turns (4.8 s ≤ 5 s), then held still', () => {
    const ring = decl(/^\.dzg-cell--saving::before$/);
    expect(ring).toMatch(/conic-gradient\(from var\(--dzg-turn\)/);
    expect(ring).toMatch(/var\(--dzg-saving-color, var\(--tz-accent\)\)/);
    expect(ring).toMatch(/animation: dzg-turn 1\.2s linear 4, dzg-hold 0\.01s 4\.8s forwards/);
    expect(keyframes('dzg-turn').replace(/\s+/g, ' ')).toMatch(/^\s*to \{ --dzg-turn: 360deg; \}\s*$/);
    expect(keyframes('dzg-hold')).toMatch(/border-style: dashed/);
    expect(css).toMatch(/@property --dzg-turn \{\s*syntax: "<angle>";\s*inherits: false;\s*initial-value: 0deg;\s*\}/);
    // No layout property animated.
    expect(keyframes('dzg-turn') + keyframes('dzg-blink-a')).not.toMatch(/inline-size|block-size|inset|margin|padding|width|height|top/);
  });

  it('right to left: the border turns the other way (the hold still forwards), by the cell’s own direction (review 6)', () => {
    expect(decl(/^\.dzg-cell--saving:dir\(rtl\)::before$/)).toMatch(/animation-direction: reverse, normal/);
    expect(css).not.toContain('[dir=rtl]');
  });

  it('still: reduced motion, motion off, the still class — a dashed border, no animation', () => {
    const still = (body: string) => /animation: none/.test(body) && /border-style: dashed/.test(body);
    expect(still(decl(/\.dzg-cell--still::before/))).toBe(true);
    expect(still(decl(/\.dzg\[data-motion=off\] \.dzg-cell--saving::before/))).toBe(true);
    expect(still(decl(/\.dzg-cell--saving::before/, media('prefers-reduced-motion: reduce')))).toBe(true);
    expect(decl(/blink/, media('prefers-reduced-motion: reduce'))).toMatch(/animation: none/);
    expect(decl(/\[data-motion=off\] :is\(\.dzg-cell--blink/)).toMatch(/animation: none/);
  });

  it('the refusal: a red border; the blink twice in 0.5 s, two copies of the same keyframes (a and b)', () => {
    expect(decl(/\.dzg-cell--refused::before/)).toMatch(/var\(--dzg-refused-color, var\(--tz-danger\)\)/);
    expect(decl(/\.dzg-cell--blink-a::before/)).toMatch(/animation: dzg-blink-a 0\.5s step-end/);
    expect(decl(/\.dzg-cell--blink-b::before/)).toMatch(/animation: dzg-blink-b 0\.5s step-end/);
    const a = keyframes('dzg-blink-a').replace(/\s+/g, ' ');
    expect(a).toBe(keyframes('dzg-blink-b').replace(/\s+/g, ' '));
    // Two off steps (two flashes) inside the 0.5 s.
    expect(a).toMatch(/0%, 50% \{ opacity: 1; \} 25%, 75% \{ opacity: 0; \}/);
  });

  it('a muted row: the context colour and a hollow funnel at the start of its row header (a shape)', () => {
    expect(decl(/\.dzg-row\[data-dzg-stale\]/)).toMatch(/color: var\(--dzg-context-fg, var\(--tz-fg-muted\)\)/);
    // On the cell the entry marks (the row header, else the row's first mounted cell: review 5).
    const sign = decl(/\.dzg-cell\[data-dzg-stale\].*::before/);
    expect(sign).toMatch(/inset-inline-start:/);
    expect(sign).toMatch(/clip-path: path\(evenodd/);
  });

  it('the reapply button: a 24 × 24 target, a shape, the focus ring of header controls', () => {
    const b = decl(/^\.dzg-reapply$/);
    expect(b).toMatch(/inline-size: 24px/);
    expect(b).toMatch(/block-size: 24px/);
    expect(decl(/\.dzg-reapply::before/)).toMatch(/clip-path:/);
    expect(decl(/\.dzg-reapply:focus-visible/)).toMatch(/outline: 2px solid var\(--dzg-focus-ring, var\(--tz-accent\)\)/);
  });

  it('forced colours: the ring a dashed Highlight border, the refusal Mark, the signs CanvasText', () => {
    const f = media('forced-colors: active');
    expect(decl(/\.dzg-cell--saving::before/, f)).toMatch(/border: 2px dashed Highlight/);
    expect(decl(/\.dzg-cell--refused::before/, f)).toMatch(/border: 2px solid CanvasText/);
    // Test gap 13: the ring stands still; each sign in its own rule, CanvasText, not adjusted.
    expect(decl(/\.dzg-cell--saving::before/, f)).toMatch(/animation: none/);
    for (const sign of [/^\.dzg-cell--pending::after$/, /^\.dzg-cell--saved::after$/, /^\.dzg-cell--failed::after$/, /\.dzg-cell\[data-dzg-stale\].*::before$/, /^\.dzg-reapply::before$/]) {
      const body = decl(sign, f);
      expect(body, String(sign)).toMatch(/background: CanvasText/);
      expect(body, String(sign)).toMatch(/forced-color-adjust: none/);
    }
    // Review 4: the stale sign never over the ring or the refusal, in forced colours too.
    expect(rules((r) => /data-dzg-stale.*::before/.test(r.selector) && f(r)).every((r) => /:not\(\.dzg-cell--saving, \.dzg-cell--refused\)/.test(r.selector))).toBe(true);
    expect(decl(/\.dzg-cell--saving::before/, media('prefers-reduced-motion: reduce'))).toMatch(/background: none/);
  });

  it('every new mark has its contrast pairs (3:1 on the cell, hovered and selected rows)', () => {
    expect(spec.derived['--dzg-saved-color']).toBe('var(--tz-success)');
    for (const fg of ['--dzg-saving-color', '--dzg-saved-color', '--dzg-refused-color', '--dzg-context-fg']) {
      for (const bg of ['--tz-bg', '--dzg-row-hover-bg', '--dzg-row-selected-bg']) {
        expect(spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min >= 3), `${fg} on ${bg}`).toBe(true);
      }
    }
    expect(spec.pairs.some((p) => p.what.startsWith('reapply button') && p.fg === '--tz-fg-muted' && p.bg === '--dzg-header-bg' && p.min === 3)).toBe(true);
  });
});

describe('edit.css: the field and the bubble (Phase 5 step 5, owner S5-O2)', () => {
  it('the field: the cell’s font and padding, its colours, no border, a 2 px inset focus ring; numbers at the end', () => {
    const f = decl(/^\.dzg-field$/);
    expect(f).toMatch(/font: inherit/);
    expect(f).toMatch(/color: var\(--tz-fg\)/);
    // Opaque (the cell's text stays under it), the row's colour: hovered and selected rows too.
    expect(f).toMatch(/background: var\(--tz-bg\)/);
    expect(decl(/\[aria-selected='?true'?\] \.dzg-field/)).toMatch(/background: var\(--dzg-row-selected-bg/);
    expect(decl(/\[data-hover\] \.dzg-field/)).toMatch(/background: var\(--dzg-row-hover-bg/);
    expect(f).toMatch(/border: 0/);
    expect(f).toMatch(/padding-inline: var\(--dzg-cell-padding-inline, 0\.5rem\)/);
    expect(f).not.toMatch(/padding-left|padding-right/);
    const ring = decl(/^\.dzg-field:focus(-visible)?$/);
    expect(ring).toMatch(/outline: 2px solid var\(--dzg-focus-ring, var\(--tz-accent\)\)/);
    expect(ring).toMatch(/outline-offset: -2px/);
    expect(decl(/\.dzg-field\[inputmode=decimal\]/)).toMatch(/text-align: end/);
  });

  it('refused: a steady dashed outline in the refused colour (a shape, not colour alone), never animated', () => {
    const bad = decl(/^\.dzg-field\[aria-invalid=true\]$/);
    expect(bad).toMatch(/outline: 2px dashed var\(--dzg-refused-color, var\(--tz-danger\)\)/);
    expect(bad).not.toMatch(/animation/);
  });

  it('the bubble: the page’s surface and text, a refused border, a measure of 40ch, a « ! » sign at its inline start', () => {
    const b = decl(/^\.dzg-bubble$/);
    expect(b).toMatch(/background: var\(--tz-bg\)/);
    expect(b).toMatch(/color: var\(--tz-fg\)/);
    expect(b).toMatch(/border: 1px solid var\(--dzg-refused-color, var\(--tz-danger\)\)/);
    expect(b).toMatch(/max-inline-size: 40ch/);
    expect(b).toMatch(/padding-inline-start:/);
    const sign = decl(/^\.dzg-bubble::before$/);
    expect(sign).toMatch(/inset-inline-start:/);
    expect(sign).toMatch(/clip-path:/);
    expect(sign).toMatch(/var\(--dzg-refused-color, var\(--tz-danger\)\)/);
  });

  it('forced colours: the field Field/FieldText with a Highlight ring, the refusal a dashed CanvasText outline, the bubble Canvas with a border and its sign', () => {
    const f = media('forced-colors: active');
    expect(decl(/^\.dzg-field$/, f)).toMatch(/background: Field/);
    expect(decl(/^\.dzg-field$/, f)).toMatch(/color: FieldText/);
    expect(decl(/^\.dzg-field:focus(-visible)?$/, f)).toMatch(/outline-color: Highlight|outline: 2px solid Highlight/);
    expect(decl(/^\.dzg-field\[aria-invalid=true\]$/, f)).toMatch(/outline: 2px dashed CanvasText/);
    expect(decl(/^\.dzg-bubble$/, f)).toMatch(/border: 1px solid CanvasText/);
    expect(decl(/^\.dzg-bubble$/, f)).toMatch(/background: Canvas/);
    const sign = decl(/^\.dzg-bubble::before$/, f);
    expect(sign).toMatch(/background: CanvasText/);
    expect(sign).toMatch(/forced-color-adjust: none/);
  });

  it('their contrast pairs: field text on the cell, hovered and selected rows (4.5), the ring (3), the bubble text (4.5), its sign and border (3)', () => {
    const has = (fg: string, bg: string, min: number) => spec.pairs.some((p) => p.fg === fg && p.bg === bg && p.min >= min);
    for (const bg of ['--tz-bg', '--dzg-row-hover-bg', '--dzg-row-selected-bg']) {
      expect(has('--tz-fg', bg, 4.5), `field text on ${bg}`).toBe(true);
      expect(has('--dzg-focus-ring', bg, 3), `ring on ${bg}`).toBe(true);
      expect(has('--dzg-refused-color', bg, 3), `refused outline on ${bg}`).toBe(true);
    }
    expect(spec.pairs.some((p) => p.what.startsWith('bubble text') && p.fg === '--tz-fg' && p.bg === '--tz-bg' && p.min === 4.5)).toBe(true);
    expect(spec.pairs.some((p) => p.what.startsWith('bubble sign') && p.fg === '--dzg-refused-color' && p.bg === '--tz-bg' && p.min === 3)).toBe(true);
  });
});

describe('edit.css: dates, the list, the calendar dialog (Phase 5 step 6, owner S6-O6)', () => {
  it('the calendar button: a 24 × 24 target at the field’s inline end, a drawn shape, muted then the text colour on hover', () => {
    const b = decl(/^\.dzg-calbtn$/);
    expect(b).toMatch(/inline-size: 24px/);
    expect(b).toMatch(/block-size: 24px/);
    expect(b).toMatch(/color: var\(--tz-fg-muted\)/);
    expect(decl(/^\.dzg-calbtn::before$/)).toMatch(/clip-path:/);
    expect(decl(/^\.dzg-calbtn:hover$/)).toMatch(/color: var\(--tz-fg\)/);
    // The date box takes the row's colour as the field does.
    expect(decl(/^\.dzg-datebox$/)).toMatch(/background: var\(--tz-bg\)/);
  });

  it('the combobox: a field with a chevron at its inline end, the text cut with an ellipsis', () => {
    expect(decl(/^\.dzg-combo$/)).toMatch(/text-overflow: ellipsis/);
    expect(decl(/^\.dzg-combo::after$/)).toMatch(/inset-inline-end:/);
    expect(decl(/^\.dzg-combo::after$/)).toMatch(/clip-path:|border-/);
  });

  it('the options: at least 24 px (44 px under a coarse pointer, WCAG 2.5.8), the active one shaded and outlined, the chosen one marked by a shape, the one not in the list muted', () => {
    expect(decl(/^\.dzg-opt$/)).toMatch(/min-block-size: 24px/);
    expect(decl(/^\.dzg-opt$/, media('pointer: coarse'))).toMatch(/min-block-size: 44px/);
    expect(decl(/^\.dzg-opt--active$/)).toMatch(/background: var\(--dzg-row-selected-bg/);
    expect(decl(/^\.dzg-opt--active$/)).toMatch(/outline:/);
    expect(decl(/^\.dzg-opt\[aria-selected=["']?true["']?\]::after$/)).toMatch(/clip-path:/);
    expect(decl(/^\.dzg-opt--out$/)).toMatch(/color: var\(--tz-fg-muted\)/);
    expect(decl(/^\.dzg-listbox$/)).toMatch(/min-inline-size:/);
  });

  it('the calendar dialog: its box takes a focus ring while it loads; the Retry button styled', () => {
    expect(decl(/^\.dzg-cal:focus-visible$/)).toMatch(/outline: 2px solid/);
    // Another month's days unfaded (tzslot's 0.35 opacity falls under 4.5:1, T11), as in the filters' panel.
    expect(decl(/^\.dzg-cal$/)).toMatch(/--tz-cal-outside-opacity: 1/);
    expect(decl(/^\.dzg-cal \.dzg-fretry$/)).toMatch(/min-block-size: 24px/);
  });

  it('forced colours: the active option Highlight, the shapes in the system’s colours', () => {
    const f = media('forced-colors: active');
    expect(decl(/^\.dzg-opt--active$/, f)).toMatch(/Highlight/);
    expect(decl(/^\.dzg-calbtn::before$/, f)).toMatch(/ButtonText/);
    expect(decl(/^\.dzg-combo::after$/, f)).toMatch(/CanvasText/);
  });

  it('their contrast pairs: options on the popup, the active one, the one not in the list, the button', () => {
    for (const [what, fg, bg, min] of [['option text', '--tz-fg', '--tz-bg', 4.5], ['active option text', '--tz-fg', '--dzg-row-selected-bg', 4.5], ['option not in the list', '--tz-fg-muted', '--tz-bg', 4.5], ['calendar button', '--tz-fg-muted', '--tz-bg', 3]] as const) {
      expect(spec.pairs.some((p) => p.what.startsWith(what) && p.fg === fg && p.bg === bg && p.min === min), what).toBe(true);
    }
  });
});
