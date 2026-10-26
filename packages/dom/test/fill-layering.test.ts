// @vitest-environment node
// The layering of `@dzgrid/dom/fill` (Phase 5 step 12, step12-plan.md D1, D2, tests 7): nothing of the base imports
// it; it reaches the core, `core/range`, the shared internal entry, its own folder, the block's shared geometry and
// types, and the base's guarded writers only — never the editors, the edit entry, the filters or the tree at run time.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
});
const ENTRY = /^fill(\/|\.ts$)/;
const lands = (f: string) => [...readFileSync(f, 'utf8').matchAll(/from '(\.{1,2}\/[^']+)'/g)].map((m) => relative(SRC, join(f, '..', m[1]!)));

describe('fill seams: layering', () => {
  it('nothing outside the entry imports @dzgrid/dom/fill (types and values)', () => {
    const offenders = files(SRC).filter((f) => !ENTRY.test(relative(SRC, f)) && lands(f).some((to) => to === 'fill.js' || to.startsWith('fill/'))).map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('the entry\'s run-time imports: the core, core/range, the internal entry, its folder, range/geom and the base\'s writers, direction and key owners', () => {
    const entry = files(SRC).filter((f) => ENTRY.test(relative(SRC, f)));
    expect(entry.map((f) => relative(SRC, f)).sort()).toEqual(expect.arrayContaining(['fill.ts', 'fill/index.ts']));
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/(core|core\/internal|core\/range|dom\/internal)$/.test(s) && !/^fill(\/[^:]+)?\.ts: \.\/(fill\/)?[a-z-]+\.js$/.test(s) && !/^fill\/[^:]+\.ts: \.\.\/(render\/write|dir|keys\/owner|range\/geom)\.js$/.test(s));
    expect(offenders).toEqual([]);
    for (const f of entry) expect(readFileSync(f, 'utf8').replace(/^import type [^;]*;$/gm, ''), relative(SRC, f)).not.toMatch(/from '[^']*(editors|filters|tree|\/edit)[^']*'/);
  });
});
