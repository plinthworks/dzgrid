// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
});

describe('the DOM layer’s shape', () => {
  it('keeps grid.ts to composition (at most 250 lines)', () => {
    const lines = readFileSync(join(SRC, 'grid.ts'), 'utf8').split('\n').length;
    expect(lines).toBeLessThanOrEqual(250);
  });

  it('keeps the optional features out of the base: only features.ts may know them', () => {
    const optional = /from '\.{1,2}\/(?:.*\/)?(filters|pagination|export|tzslot-picker|parts|spans|slots)\/|from '\.{1,2}\/(?:.*\/)?(spans|slots)\.js'/;
    const offenders = files(SRC)
      .filter((f) => !/^(filters|pagination|export|tzslot-picker|parts|spans|slots)\//.test(relative(SRC, f)) && !['features.ts', 'spans.ts', 'slots.ts'].includes(relative(SRC, f)))
      .filter((f) => optional.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('has the slots entry reach the base only through the grid’s context and the types', () => {
    // The drivers of @dzgrid/dom/slots: value imports from the core, and from their own folder only
    // (the base's modules come with the grid it is set up on, never bundled twice).
    const offenders = files(SRC)
      .filter((f) => /^slots\//.test(relative(SRC, f)) || relative(SRC, f) === 'slots.ts')
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^import (?!type )[^;]*from '(\.{1,2}\/[^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/^slots(\/[^:]+)?\.ts: \.\/(slots\/)?[a-z-]+\.js$/.test(s));
    expect(offenders).toEqual([]);
  });

  it('keeps the core’s span engine out of the base: only the spans entry imports it', () => {
    const offenders = files(SRC)
      .filter((f) => !/^spans\//.test(relative(SRC, f)) && relative(SRC, f) !== 'spans.ts')
      .filter((f) => /from '@dzgrid\/core\/spans'/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
