// @vitest-environment node
// The layering of `@dzgrid/dom/column-menu` (Phase 6 step 3, step03-plan §1, §6): the base never imports the entry;
// the entry reaches the core, the popup host, the base's guarded writers and its own folder only — the columns, fill,
// range, filters and chooser it drives are reached through their `api(grid)` and the grid's seams, typed only, so an
// application with the menu ships none of them.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
});
const ENTRY = /^column-menu(\/|\.ts$)/;

describe('column-menu: layering', () => {
  it('nothing outside the entry imports it (types and values); its texts only from the locales', () => {
    const offenders = files(SRC).filter((f) => !ENTRY.test(relative(SRC, f)) && !/^locales\//.test(relative(SRC, f)) && /from '\.{1,2}\/(?:.*\/)?column-menu(\/|\.js')/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('the entry: the core, the popup host, the base\'s writers and direction helpers, its own folder; the features it drives typed only', () => {
    const entry = files(SRC).filter((f) => ENTRY.test(relative(SRC, f)));
    expect(entry.map((f) => relative(SRC, f)).sort()).toEqual(expect.arrayContaining(['column-menu.ts', 'column-menu/index.ts']));
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/(core|core\/internal)$/.test(s) && !/^column-menu(\/[^:]+)?\.ts: \.\/(column-menu\/)?[a-z-]+\.js$/.test(s) && !/^column-menu\/[^:]+\.ts: \.\.\/(popup|render\/write|render\/header-decor|dir|keys\/owner)\.js$/.test(s));
    expect(offenders).toEqual([]);
    for (const f of entry) expect(readFileSync(f, 'utf8').replace(/^import type [^;]*;$/gm, ''), relative(SRC, f)).not.toMatch(/from '[^']*(columns|fill|range|filters|editors|\/edit)[^']*'/);
  });
});
