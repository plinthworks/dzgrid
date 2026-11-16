// @vitest-environment node
// 1.13.0 — the owner's app's last patches as options (owner 2026-11-16, « A »): the focus ring for the keyboard only
// (presentation-settings.md 48: `data-dzg-ring` on the grid's root, `pointer` after a press, `keys` after a key) and a
// detail's content inset (master-detail.md, `--dzg-detail-inset`). Both copies of each sheet. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sheet } from './css-tree.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const body = (f: string, sel: string) => sheet(read(f)).rules.filter((r) => r.at.length === 0 && (r.selector === sel || r.selector.split(/,\s*(?![^(]*\))/).includes(sel))).map((r) => r.body).join(' ');

describe.each(['dzgrid.css', 'dzgrid.unlayered.css'])('%s (48)', (f) => {
  it('after a press, the focused cell\'s ring, inner line and tint are left out (the guard), the weight unchanged', () => {
    const b = body(f, '.dzg-cell:focus:where(:not([data-dzg-quiet] *, [data-dzg-ring=pointer] *))');
    expect(b).toMatch(/outline: 2px solid var\(--dzg-focus-ring, var\(--tz-accent\)\)/);
    expect(b).toMatch(/box-shadow: inset 0 0 0 3px var\(--tz-bg\)/);
    expect(b).toMatch(/background-color: var\(--dzg-cell-active-bg/);
  });

  it('after a press, no ring on a cell, a header or a panel, a :focus-visible one included', () => {
    expect(body(f, '[data-dzg-ring=pointer] :is(.dzg-cell, .dzg-hcell, .dzg-dcell):focus')).toBe('outline: none !important;');
  });

  it('after a key, the ring on :focus for headers and panels too (Firefox)', () => {
    expect(body(f, '[data-dzg-ring=keys] :is(.dzg-hcell, .dzg-dcell):focus')).toBe('outline: 2px solid var(--dzg-focus-ring, var(--tz-accent)); outline-offset: -2px;');
  });

  it('the focused row keeps its tint after a press (only the cell\'s look changes)', () => {
    expect(read(f)).toContain('.dzg-row:focus-within:where(:not([data-dzg-quiet] *))');
  });

  it('a detail\'s content inset at the inline start: --dzg-detail-inset, .5rem by default', () => {
    expect(body(f, '.dzg-dbody')).toBe('padding: 0.5rem; padding-inline-start: var(--dzg-detail-inset, 0.5rem);');
  });
});

describe.each(['variables.css', 'variables.unlayered.css'])('%s (48)', (f) => {
  it('the detail\'s content inset from --dzg-detail-inset over the spacing unit (2 units by default)', () => {
    expect(body(f, '.dzg-dbody')).toBe('padding: calc(var(--dzg-space, 0.25rem) * 2); padding-inline-start: var(--dzg-detail-inset, calc(var(--dzg-space, 0.25rem) * 2));');
  });

  it('the ring\'s width and its inner line follow --dzg-focus-width for the keyboard rings too', () => {
    expect(body(f, '[data-dzg-ring=keys] :is(.dzg-hcell, .dzg-dcell):focus')).toMatch(/outline-width: max\(2px, var\(--dzg-focus-width, 2px\)\)/);
    expect(body(f, '.dzg-cell:focus:where(:not([data-dzg-quiet] *, [data-dzg-ring=pointer] *))')).toMatch(/box-shadow: inset 0 0 0 calc\(max\(2px, var\(--dzg-focus-width, 2px\)\) \+ 1px\) var\(--tz-bg\)/);
  });
});
