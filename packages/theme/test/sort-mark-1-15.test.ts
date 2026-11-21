// @vitest-environment node
// 1.15.0 — `sortMark: 'always'` (owner 2026-11-21; presentation-settings.md 49): the kept mark unsorted draws a two-way
// arrow unless the app gave its own icon, and beside a header part the mark is a button with a 24 px target and the
// grid's focus ring, the resize grip's room after it. Both copies of the sheet. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sheet } from './css-tree.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const body = (f: string, sel: string) => sheet(read(f)).rules.filter((r) => r.at.length === 0 && r.selector === sel).map((r) => r.body).join(' ');

describe.each(['dzgrid.css', 'dzgrid.unlayered.css'])('%s (49)', (f) => {
  it('unsorted, the kept mark is a two-way arrow (⇅), unless the app gave icons.sortNone', () => {
    expect(body(f, '.dzg-sort[data-dir=none]:where(:not([data-dzg-icons~=sort-none] *))::before')).toBe('content: "⇅";');
  });

  it('the sort button: no button look of its own, a 24 px target, the pointer', () => {
    const b = body(f, 'button.dzg-sort');
    expect(b).toMatch(/min-inline-size: 1\.5rem;/);
    expect(b).toMatch(/min-block-size: 1\.5rem;/);
    expect(b).toMatch(/padding: 0;/);
    expect(b).toMatch(/border: 0;/);
    expect(b).toMatch(/background: none;/);
    expect(b).toMatch(/cursor: pointer;/);
  });

  it('the resize grip\'s room after it when no filter button follows (that one keeps its own)', () => {
    expect(body(f, 'button.dzg-sort:last-child')).toBe('margin-inline-end: calc(var(--dzg-target-min, 24px) - var(--dzg-cell-padding-inline, 0.5rem) * var(--dzg-density, 1));');
  });

  it('its focus ring is the grid\'s', () => {
    expect(body(f, 'button.dzg-sort:focus-visible')).toBe('outline: 2px solid var(--dzg-focus-ring, var(--tz-accent)); outline-offset: -2px;');
  });
});

describe.each(['variables.css', 'variables.unlayered.css'])('%s (49)', (f) => {
  it('the kept mark unsorted takes the unsorted colour, --dzg-sort-none-fg (the sorted one\'s by default), drawn or not by an icon', () => {
    expect(body(f, '.dzg-sort[data-dir=none]')).toBe('color: var(--dzg-sort-none-fg, var(--dzg-sort-fg, var(--tz-fg-muted)));');
  });
});
