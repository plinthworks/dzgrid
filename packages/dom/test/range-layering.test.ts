// @vitest-environment node
// The layering of `@dzgrid/dom/range` (Phase 5 step 11a, step11a-plan.md « Wiring »): the base never imports the
// entry; the entry never the editors, the filters, the tree or the edit entries (an app selecting cells loads none).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
});
const ENTRY = /^range(\/|\.ts$)/;

describe('range seams: layering', () => {
  it('nothing of the base imports @dzgrid/dom/range (types and values)', () => {
    // By where an import lands (src/range.ts or src/range/), not by its name: the date filters have a range.ts of their own.
    const lands = (f: string) => [...readFileSync(f, 'utf8').matchAll(/from '(\.{1,2}\/[^']+)'/g)].map((m) => relative(SRC, join(f, '..', m[1]!)));
    const offenders = files(SRC).filter((f) => !ENTRY.test(relative(SRC, f)) && lands(f).some((to) => to === 'range.js' || to.startsWith('range/'))).map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('the entry reaches the core, the shared internal entry, its own folder and the base\'s guarded writers, direction helpers and key owners only; never the editors, filters, tree or edit entries', () => {
    const entry = files(SRC).filter((f) => ENTRY.test(relative(SRC, f)));
    expect(entry.map((f) => relative(SRC, f)).sort()).toEqual(expect.arrayContaining(['range.ts', 'range/index.ts']));
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/(core|core\/internal|core\/range|dom\/internal)$/.test(s) && !/^range(\/[^:]+)?\.ts: \.\/(range\/)?[a-z-]+\.js$/.test(s) && !/^range\/[^:]+\.ts: \.\.\/(render\/write|dir|keys\/owner)\.js$/.test(s));
    expect(offenders).toEqual([]);
    // Step 11b: the edits are reached through the grid (`g.edit.api`), typed only — no run-time import of them.
    for (const f of entry) expect(readFileSync(f, 'utf8').replace(/^import type [^;]*;$/gm, ''), relative(SRC, f)).not.toMatch(/from '[^']*(editors|filters|tree|\/edit)[^']*'/);
  });
});
