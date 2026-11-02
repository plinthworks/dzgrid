// @vitest-environment node
// `@dzgrid/dom/editors-base` (1.2.0, found in an Angular app 2026-10-30; docs/behaviors/editors.md « Without tzslot »):
// the editors without the calendar's chunk, so an application without `@tzslot/*` installed builds. A day or
// instant column there is typed only, unless `loadCalendar` brings a calendar; `@dzgrid/dom/editors` is unchanged.
import { describe, it, expect } from 'vitest';
import { build, type Plugin } from 'esbuild';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
/** Bundles an entry as an application's bundler would, every `import()` followed, with no `@tzslot/*` to find. */
async function bundle(entry: string) {
  const named: string[] = [];
  const noTzslot: Plugin = {
    name: 'no-tzslot',
    setup(b) {
      b.onResolve({ filter: /^@tzslot\// }, (a) => (named.push(a.path), { errors: [{ text: `Could not resolve ${a.path}` }] }));
    },
  };
  const r = await build({ entryPoints: [SRC + entry], bundle: true, write: false, format: 'esm', splitting: true, outdir: 'out', platform: 'browser', logLevel: 'silent', plugins: [noTzslot], external: ['@dzgrid/core', '@dzgrid/core/*'], alias: { '@dzgrid/dom/internal': SRC + 'internal.ts' } }).then(
    () => 'ok',
    () => 'failed',
  );
  return { r, named };
}

describe('an application without @tzslot installed', () => {
  it('builds with @dzgrid/dom/editors-base: no file it reaches names @tzslot', async () => {
    expect(await bundle('editors-base.ts')).toEqual({ r: 'ok', named: [] });
  });
  it('builds with @dzgrid/dom/filters-base: no file it reaches names @tzslot (owner 2026-11-02)', async () => {
    expect(await bundle('filters-base.ts')).toEqual({ r: 'ok', named: [] });
  });
  it('@dzgrid/dom/filters still reaches the date kits (unchanged, 1.1.0)', async () => {
    expect((await bundle('filters.ts')).named.length).toBeGreaterThan(0);
  });
  it('@dzgrid/dom/editors still reaches the calendar (unchanged, 1.1.0)', async () => {
    const { named } = await bundle('editors.ts');
    expect(named.length).toBeGreaterThan(0);
  });
});

