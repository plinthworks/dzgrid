// @vitest-environment node
// 1.13.0, found by the owner's app (docs/behaviors/presentation-settings.md 44, 46): the columns panel's search placeholder
// its own variable, `--dzg-panel-search-placeholder` (default the muted text, 4.5:1 on the field in light and dark), held
// against a page's own unlayered placeholder rule; a header part's label not split with the spacer before the buttons.
// Both copies of each sheet. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sheet } from './css-tree.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const body = (f: string, sel: string) => sheet(read(f)).rules.filter((r) => r.at.length === 0 && (r.selector === sel || r.selector.split(/,\s*/).includes(sel))).map((r) => r.body).join(' ');

describe.each(['columns-panel.css', 'columns-panel.unlayered.css'])('%s (44)', (f) => {
  it('the placeholder from its variable, the muted text by default, over a page\'s own rule', () => {
    expect(body(f, '.dzg-cp-q input::placeholder')).toBe('color: var(--dzg-panel-search-placeholder, var(--tz-fg-muted)) !important; opacity: 1 !important;');
  });
});

describe('the placeholder\'s contrast pair (44)', () => {
  it('checked on the field at 4.5:1, the variable\'s default the muted text', () => {
    const c = JSON.parse(read('contrast-pairs.json')) as { pairs: { fg: string; bg: string; min: number }[]; derived: Record<string, string> };
    expect(c.pairs).toContainEqual(expect.objectContaining({ fg: '--dzg-panel-search-placeholder', bg: '--dzg-input-bg', min: 4.5 }));
    expect(c.derived['--dzg-panel-search-placeholder']).toBe('var(--tz-fg-muted)');
  });
});

describe.each(['columns.css', 'columns.unlayered.css'])('%s (46)', (f) => {
  it('the spacer before the menu button left out beside a header part\'s label (it grows itself)', () => {
    expect(read(f)).toMatch(/\.dzg-hcell:has\(> \.dzg-mbtn, > \.dzg-reapply\):where\(:not\(\[data-align\], :has\(\.dzg-hfbox, > \[style\*=flex-grow\]\)\)\)::before/);
  });
});
