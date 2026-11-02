// @vitest-environment node
// The floating row's summary is a button when its popup can open (filters/summary.ts): it must not keep the browser's
// grey button face, which fails 4.5:1 in a dark theme (axe, Arabic dark, Phase 9 filters check, 2026-11-02).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../dzgrid.css', import.meta.url)), 'utf8');

describe('.dzg-fsum', () => {
  it('has no button face of its own: transparent background, no border, the cell font', () => {
    const rule = /\.dzg-fsum\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/background:\s*transparent/);
    expect(rule).toMatch(/border:\s*0/);
    expect(rule).toMatch(/font:\s*inherit/);
  });
});
