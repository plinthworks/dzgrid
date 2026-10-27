// @vitest-environment node
// A row the selection rule refuses (step 21, docs/behaviors/selection-rules.md): its box dashed on the
// raised surface, the pointer "not allowed", GrayText in forced colours; the row itself unchanged.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const css = readFileSync(here('../dzgrid.css'), 'utf8');
const spec = JSON.parse(readFileSync(here('../contrast-pairs.json'), 'utf8')) as { pairs: { what: string; fg: string; bg: string; min: number }[] };

describe('the refused box', () => {
  it('is dashed on the raised surface, with the "not allowed" pointer on its cell', () => {
    expect(css).toMatch(/\.dzg-check\[data-dzg-refused\] \{\s*cursor: not-allowed;\s*\}/);
    const rule = /\.dzg-check\[data-dzg-refused\] \.dzg-box \{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/outline-style: dashed;/); // the edge an outline (feedback pass G)
    expect(rule).toMatch(/background: var\(--dzg-refused-bg, var\(--tz-bg-raised\)\);/);
  });

  it('never touches the row: no rule on a row by the attribute', () => {
    expect(css).not.toMatch(/\.dzg-row\[data-dzg-refused\]/);
    expect(css).not.toMatch(/\.dzg-row\[aria-disabled/);
  });

  it('keeps a mark in forced colours (GrayText)', () => {
    const forced = css.split('@media (forced-colors: active)').slice(1).join('');
    expect(forced).toMatch(/\.dzg-check\[data-dzg-refused\] \.dzg-box \{\s*outline-color: GrayText;\s*\}/);
  });

  it('has its border checked at 3:1 on the box surface and on the row’s hover', () => {
    expect(spec.pairs).toContainEqual({ what: 'refused box border', fg: '--tz-fg-muted', bg: '--dzg-refused-bg', min: 3 });
    expect(spec.pairs).toContainEqual({ what: 'refused box border on hover', fg: '--tz-fg-muted', bg: '--dzg-row-hover-bg', min: 3 });
  });
});
