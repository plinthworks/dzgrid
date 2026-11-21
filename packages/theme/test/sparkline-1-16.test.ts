// @vitest-environment node
// 1.16.0 — the sparklines' look (docs/behaviors/sparklines.md 14, 15, 10): every colour a variable over the palette, a
// stroke and a dot that keep their width whatever the stretch, the drawing left to right, forced colours. Both copies,
// compiled from their source. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet } from './css-tree.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const body = (f: string, sel: string, at = 0) => sheet(read(f)).rules.filter((r) => r.at.length === at && r.selector === sel).map((r) => r.body).join(' ');
const LINE = 'var(--dzg-sparkline-line, var(--tz-accent))';

describe.each(['sparkline.css', 'sparkline.unlayered.css'])('%s', (f) => {
  it('compiled from sparkline.scss', () => {
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(read(f)).toBe(out(f === 'sparkline.css' ? '@use "sparkline";' : '@use "sparkline" with ($layered: false);'));
  });

  it('the drawing fills its cell, left to right in both directions (10)', () => {
    expect(body(f, '.dzg-spark')).toMatch(/inline-size: 100%;.*direction: ltr;/);
    expect(body(f, '.dzg-spark path, .dzg-spark rect')).toBe('vector-effect: non-scaling-stroke;');
  });

  it('colours as variables over the palette: line, area, negative, marker (14)', () => {
    expect(body(f, '.dzg-spark-line')).toBe(`fill: none; stroke: ${LINE}; stroke-width: 1.5px; stroke-linejoin: round; stroke-linecap: round;`);
    expect(body(f, '.dzg-spark-area')).toBe('fill: var(--dzg-sparkline-area, color-mix(in srgb, var(--tz-accent) 20%, transparent)); stroke: none;');
    expect(body(f, '.dzg-spark-bar')).toBe(`fill: ${LINE};`);
    expect(body(f, '.dzg-spark-neg')).toBe('fill: var(--dzg-sparkline-negative, var(--tz-danger));');
    expect(body(f, '.dzg-spark-bar.dzg-spark-mark')).toBe('fill: var(--dzg-sparkline-marker, var(--tz-fg));');
    expect(body(f, '.dzg-spark-dot, .dzg-spark-hover')).toBe('fill: none; stroke: var(--dzg-sparkline-marker, var(--tz-fg)); stroke-width: 5px; stroke-linecap: round;');
  });

  it('forced colours: the drawing in CanvasText, markers and the ring in Highlight, no fill under a line', () => {
    expect(body(f, '.dzg-spark-line', 1)).toBe('stroke: CanvasText;');
    expect(body(f, '.dzg-spark-area', 1)).toBe('fill: none;');
    expect(body(f, '.dzg-spark-dot, .dzg-spark-hover', 1)).toBe('stroke: Highlight;');
  });

  it('no colour literal', () => {
    expect(read(f)).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });
});

describe('contrast pairs (14)', () => {
  it('each colour on the row, hovered, selected and focused, 3:1', () => {
    const spec = JSON.parse(read('contrast-pairs.json')) as { pairs: { fg: string; bg: string; min: number }[] };
    for (const v of ['--dzg-sparkline-line', '--dzg-sparkline-negative', '--dzg-sparkline-marker']) {
      expect(spec.pairs.filter((p) => p.fg === v).map((p) => `${p.bg}:${p.min}`)).toEqual(['--tz-bg:3', '--dzg-row-hover-bg:3', '--dzg-row-selected-bg:3', '--dzg-cell-active-bg:3']);
    }
  });
});
