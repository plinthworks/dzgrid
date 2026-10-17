// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../dzgrid.css', import.meta.url)), 'utf8');

describe('rows kept while the next load (data-stale)', () => {
  it('are drawn in the stale colour, the pinned segments too, never by opacity', () => {
    const rule = /\.dzg\[data-stale\] \.dzg-row,\s*\.dzg\[data-stale\] \.dzg-row \.dzg-seg-start,\s*\.dzg\[data-stale\] \.dzg-row \.dzg-seg-end\s*\{([^}]*)\}/.exec(css);
    expect(rule, 'the data-stale rule').not.toBeNull();
    expect(rule![1]).toMatch(/color:\s*var\(--dzg-stale-fg, var\(--tz-fg-muted\)\)/);
    expect(rule![1]).not.toMatch(/opacity/);
    // Matched on the grid's root, where the DOM sets it: more specific than the plain row colour.
    expect(css.indexOf('.dzg[data-stale] .dzg-row')).toBeGreaterThan(css.indexOf('.dzg-row .dzg-seg-end {'));
  });
});
