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
    const optional = /from '\.{1,2}\/(?:.*\/)?(filters|pagination|export|tzslot-picker|parts|spans|slots|search)\/|from '\.{1,2}\/(?:.*\/)?(spans|slots|search)\.js'/;
    const offenders = files(SRC)
      .filter((f) => !/^(filters|pagination|export|tzslot-picker|parts|spans|slots|search)\//.test(relative(SRC, f)) && !['features.ts', 'spans.ts', 'slots.ts', 'filters.ts', 'search.ts'].includes(relative(SRC, f)))
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
      .filter((s) => !/^slots(\/[^:]+)?\.ts: \.\/(slots\/)?[a-z-]+\.js$/.test(s) && !/^slots\/[^:]+\.ts: \.\.\/mounted\.js$/.test(s));
    expect(offenders).toEqual([]);
  });

  it('has the search entry reach the base only through the grid’s context and the types (step 16)', () => {
    // @dzgrid/dom/search: value imports from the core, the core's internal entry and its own folder only;
    // never the filters (an app with only a search box does not load them), never the base's modules.
    const entry = files(SRC).filter((f) => /^search\//.test(relative(SRC, f)) || relative(SRC, f) === 'search.ts');
    expect(entry.map((f) => relative(SRC, f)).sort()).toEqual(['search.ts', 'search/bind.ts', 'search/index.ts', 'search/said.ts']);
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/core(\/internal)?$/.test(s) && !/^search(\/[^:]+)?\.ts: \.\/(search\/)?[a-z-]+\.js$/.test(s));
    expect(offenders).toEqual([]);
    // Nothing of the base imports it, the features seam included.
    expect(files(SRC).filter((f) => !/^search(\/|\.ts$)/.test(relative(SRC, f)) && /from '\.{1,2}\/(?:.*\/)?search(\/|\.js')/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
  });

  it('has the filters entry reach the base only through the grid’s context, the types and the shared mounted.ts', () => {
    // @dzgrid/dom/filters: value imports from the core, the core's internal entry, its own folder, src/mounted.ts
    // and src/popup.ts (step 13: the popup host, measured apart, a consumer pays it once).
    const entry = files(SRC).filter((f) => /^filters\//.test(relative(SRC, f)) || relative(SRC, f) === 'filters.ts');
    expect(entry.length).toBeGreaterThan(1);
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^import (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/core(\/internal)?$/.test(s) && !/^filters(\/[^:]+)?\.ts: \.\/(filters\/)?[a-z-]+\.js$/.test(s) && !/^filters\/[^:]+\.ts: \.\.\/(mounted|popup)\.js$/.test(s) && !/^filters\/dates\/[a-z]+\.ts: @tzslot\/(dom|core)$/.test(s) && !/^filters\/set\/[a-z]+\.ts: \.\.\/dom\.js$/.test(s));
    expect(offenders).toEqual([]);
  });

  it('keeps tzslot (and its Temporal) in the lazy date kits: @tzslot/* only under filters/dates/ (step 14, K.2 amended)', () => {
    const tz = /^import [^;]*from '@tzslot\//m;
    const offenders = files(SRC).filter((f) => tz.test(readFileSync(f, 'utf8')) && !/^filters\/dates\//.test(relative(SRC, f))).map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
    const core = fileURLToPath(new URL('../../core/src', import.meta.url));
    expect(files(core).filter((f) => /from '@tzslot|\bTemporal\.[A-Z]/.test(readFileSync(f, 'utf8'))).map((f) => relative(core, f))).toEqual([]);
    // The eager part reaches the kits only through import(): never a static import of ./dates/.
    const eager = files(SRC).filter((f) => !/^filters\/dates\//.test(relative(SRC, f)));
    expect(eager.filter((f) => /^import [^;]*from '\.{1,2}\/(?:.*\/)?dates\//m.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
    expect(readFileSync(join(SRC, 'filters/dates.ts'), 'utf8')).toMatch(/import\('\.\/dates\/date\.js'\)/);
  });

  it('has the lazy kits import only tzslot, the core and their own folder (a kit never pulls the eager filters in twice)', () => {
    const kits = files(join(SRC, 'filters/dates'));
    expect(kits.map((f) => relative(SRC, f)).sort()).toEqual(['filters/dates/date.ts', 'filters/dates/moment.ts', 'filters/dates/range.ts', 'filters/dates/shared.ts']);
    const offenders = kits
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^import (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: (@tzslot\/(dom|core)|@dzgrid\/core(\/internal)?|\.\/shared\.js)$/.test(s));
    expect(offenders).toEqual([]);
  });

  it('keeps the set filter’s chunk lazy: filters/set/ reached only through import() (step 15)', () => {
    const eager = files(SRC).filter((f) => !/^filters\/set\//.test(relative(SRC, f)));
    expect(eager.filter((f) => /^import (?!type )[^;]*from '\.{1,2}\/(?:.*\/)?set\//m.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
    expect(readFileSync(join(SRC, 'filters/set.ts'), 'utf8')).toMatch(/import\('\.\/set\/index\.js'\)/);
  });

  it('has the set chunk import only the core, its own folder and the leaf dom.ts (the eager part hands it the loading helper; never forms.ts or the menu)', () => {
    const chunk = files(join(SRC, 'filters/set'));
    expect(chunk.map((f) => relative(SRC, f)).sort()).toEqual(['filters/set/draft.ts', 'filters/set/index.ts', 'filters/set/list.ts', 'filters/set/styles.ts']);
    const offenders = chunk
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^import (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: (@dzgrid\/core(\/internal)?|\.\/[a-z]+\.js|\.\.\/dom\.js)$/.test(s));
    expect(offenders).toEqual([]);
    // The leaf itself imports nothing at run time.
    expect(readFileSync(join(SRC, 'filters/dom.ts'), 'utf8')).not.toMatch(/^import (?!type )/m);
  });

  it('keeps the popup host out of the base: only the entries import it', () => {
    const offenders = files(SRC)
      .filter((f) => !/^filters\//.test(relative(SRC, f)) && relative(SRC, f) !== 'popup.ts')
      .filter((f) => /^import (?!type )[^;]*from '\.{1,2}\/(?:.*\/)?popup\.js'/m.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('keeps the shared mounted.ts for the entries: the base never imports it', () => {
    const offenders = files(SRC)
      .filter((f) => !/^(filters|slots)\//.test(relative(SRC, f)))
      .filter((f) => /from '\.{1,2}\/(?:.*\/)?mounted\.js'/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
    expect(files(SRC).map((f) => relative(SRC, f))).not.toContain('slots/mounted.ts');
  });

  it('keeps the core’s span engine out of the base: only the spans entry imports it', () => {
    const offenders = files(SRC)
      .filter((f) => !/^spans\//.test(relative(SRC, f)) && relative(SRC, f) !== 'spans.ts')
      .filter((f) => /from '@dzgrid\/core\/spans'/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
