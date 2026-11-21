// @vitest-environment node
// 1.17.0 — the advanced filter's look (docs/behaviors/advanced-filter.md 17): every colour a variable over the palette,
// the nesting line on the inline start, Apply in the accent, the focus ring, forced colours. Both copies, compiled from
// their source. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';
import { sheet } from './css-tree.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const body = (f: string, sel: string, at = 0) => sheet(read(f)).rules.filter((r) => r.at.length === at && r.selector === sel).map((r) => r.body).join(' ');

describe.each(['advanced-filter.css', 'advanced-filter.unlayered.css'])('%s', (f) => {
  it('compiled from advanced-filter.scss', () => {
    const out = (src: string) => `${compileString(src, { loadPaths: [here('..')], style: 'expanded' }).css}\n`;
    expect(read(f)).toBe(out(f === 'advanced-filter.css' ? '@use "advanced-filter";' : '@use "advanced-filter" with ($layered: false);'));
  });

  it('a group: a box with its line on the inline start, the accent at the root; a condition on the raised surface', () => {
    expect(body(f, '.dzg-adv-g')).toBe('border: var(--dzg-line, 1px) solid var(--dzg-adv-group-line, var(--tz-border)); border-inline-start-width: 3px; border-radius: var(--dzg-radius, 0.375rem);');
    expect(body(f, '.dzg-adv-root > .dzg-adv-g')).toBe('border-inline-start-color: var(--dzg-adv-root-line, var(--tz-accent));');
    expect(body(f, '.dzg-adv-c')).toBe('border-radius: var(--dzg-radius, 0.375rem); background: var(--dzg-adv-condition-bg, var(--tz-bg-raised));');
  });

  it('Apply in the accent, the focus a 2 px ring, forced colours', () => {
    expect(body(f, '.dzg-adv-foot .dzg-adv-apply')).toBe('border-color: var(--tz-accent); color: var(--tz-accent-fg); background: var(--tz-accent);');
    expect(body(f, '.dzg-adv :focus-visible')).toBe('outline: 2px solid var(--dzg-focus-ring, var(--tz-accent)); outline-offset: 1px;');
    expect(body(f, '.dzg-adv-g', 1)).toBe('border-color: CanvasText;');
  });

  it('no colour literal, no physical side', () => {
    expect(read(f)).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    expect(read(f)).not.toMatch(/\b(left|right)\b/);
  });
});

describe('contrast pairs (17)', () => {
  it('a condition row, its label, the root line, Apply', () => {
    const spec = JSON.parse(read('contrast-pairs.json')) as { pairs: { what: string; fg: string; bg: string; min: number }[] };
    expect(spec.pairs.filter((p) => p.what.startsWith('advanced filter')).map((p) => `${p.fg} ${p.bg} ${p.min}`)).toEqual([
      '--tz-fg --tz-bg-raised 4.5',
      '--tz-fg-muted --tz-bg-raised 4.5',
      '--tz-accent --tz-bg 3',
      '--tz-accent-fg --tz-accent 4.5',
    ]);
  });
});
