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
      .filter((f) => !/^(filters|pagination|export|tzslot-picker|parts|spans|slots|search)\//.test(relative(SRC, f)) && !['features.ts', 'spans.ts', 'slots.ts', 'filters.ts', 'search.ts', 'pagination.ts', 'export.ts', 'parts.ts'].includes(relative(SRC, f)))
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

  it('has the search entry reach the base only through the grid’s context and the types (step 16)', () => {
    // @dzgrid/dom/search: value imports from the core, the core's internal entry and its own folder only;
    // never the filters (an app with only a search box does not load them), never the base's modules.
    const entry = files(SRC).filter((f) => /^search\//.test(relative(SRC, f)) || relative(SRC, f) === 'search.ts');
    expect(entry.map((f) => relative(SRC, f)).sort()).toEqual(['search.ts', 'search/bind.ts', 'search/index.ts']);
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/(core|core\/internal|dom\/internal)$/.test(s) && !/^search(\/[^:]+)?\.ts: \.\/(search\/)?[a-z-]+\.js$/.test(s));
    expect(offenders).toEqual([]);
    // Nothing of the base imports it, the features seam included.
    expect(files(SRC).filter((f) => !/^search(\/|\.ts$)/.test(relative(SRC, f)) && /from '\.{1,2}\/(?:.*\/)?search(\/|\.js')/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
  });

  it('has the filters entry reach the base only through the grid’s context, the types and the shared internal entry', () => {
    // @dzgrid/dom/filters: value imports from the core, the core's internal entry, @dzgrid/dom/internal (step 17),
    // its own folder and src/popup.ts (step 13: the popup host, measured apart, a consumer pays it once).
    const entry = files(SRC).filter((f) => /^filters\//.test(relative(SRC, f)) || relative(SRC, f) === 'filters.ts');
    expect(entry.length).toBeGreaterThan(1);
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^import (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/(core|core\/internal|dom\/internal)$/.test(s) && !/^filters(\/[^:]+)?\.ts: \.\/(filters\/)?[a-z-]+\.js$/.test(s) && !/^filters\/[^:]+\.ts: \.\.\/popup\.js$/.test(s) && !/^filters\/dates\/[a-z]+\.ts: @tzslot\/(dom|core)$/.test(s) && !/^filters\/set\/[a-z]+\.ts: \.\.\/dom\.js$/.test(s));
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

  it('has every date kit place tzslot’s panel in the popup (`container: a.panel`), so a press in it keeps the popup open (step 18, Q4)', () => {
    // A kit that forgot it would have the panel in the page's body: a press on a day there is
    // outside the popup and closes it.
    const kits = files(join(SRC, 'filters/dates')).filter((f) => !f.endsWith('shared.ts'));
    expect(kits.length).toBeGreaterThanOrEqual(3);
    for (const f of kits) {
      const src = readFileSync(f, 'utf8');
      const calls = [...src.matchAll(/\bcreate[A-Z]\w*\(\s*a\.host\s*,\s*\{/g)];
      expect(calls.length, relative(SRC, f)).toBeGreaterThan(0);
      for (const m of calls) {
        // The options object, to its matching brace.
        let depth = 0;
        let end = m.index! + m[0].length - 1;
        for (; end < src.length; end++) {
          if (src[end] === '{') depth++;
          else if (src[end] === '}' && --depth === 0) break;
        }
        expect(src.slice(m.index!, end + 1), relative(SRC, f)).toMatch(/\bcontainer:\s*a\.panel\b/);
      }
    }
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

  it('keeps @dzgrid/dom/internal for the feature entries (step 17): slots, filters, search and pagination import it, by name; the base never', () => {
    const named = /^import (?!type )[^;]*from '@dzgrid\/dom\/internal'/m;
    const users = files(SRC).filter((f) => named.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f).split('/')[0]!.replace(/\.ts$/, ''));
    expect([...new Set(users)].sort()).toEqual(['filters', 'pagination', 'search', 'slots']);
    // Never by a relative path (a second copy in each bundle), never from the base.
    const relative_ = files(SRC).filter((f) => !/^internal(\/|\.ts$)/.test(relative(SRC, f)) && /from '\.{1,2}\/(?:.*\/)?internal(\/|\.js')/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f));
    expect(relative_).toEqual([]);
    // What it replaced is gone: one copy of each helper.
    const all = files(SRC).map((f) => relative(SRC, f));
    for (const gone of ['mounted.ts', 'filters/announce.ts', 'search/said.ts']) expect(all).not.toContain(gone);
    expect(readFileSync(join(SRC, 'filters/dom.ts'), 'utf8')).not.toMatch(/export const composing/);
  });

  it('has the internal entry import only the core and its own folder (no base module bundled twice)', () => {
    const entry = files(SRC).filter((f) => /^internal(\/|\.ts$)/.test(relative(SRC, f)));
    expect(entry.map((f) => relative(SRC, f)).sort()).toEqual(['internal.ts', 'internal/mounted.ts', 'internal/settled.ts']);
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/core(\/internal)?$/.test(s) && !/^internal(\/[^:]+)?\.ts: \.\/(internal\/)?[a-z-]+\.js$/.test(s));
    expect(offenders).toEqual([]);
  });

  it('has the pagination entry reach the base only through the grid’s context, the types and the internal entry (step 17)', () => {
    const entry = files(SRC).filter((f) => /^pagination(\/|\.ts$)/.test(relative(SRC, f)));
    expect(entry.length).toBeGreaterThan(1);
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/(core|core\/internal|dom\/internal)$/.test(s) && !/^pagination(\/[^:]+)?\.ts: \.\/(pagination\/)?[a-z-]+\.js$/.test(s));
    expect(offenders).toEqual([]);
    expect(files(SRC).filter((f) => !/^pagination(\/|\.ts$)/.test(relative(SRC, f)) && /from '\.{1,2}\/(?:.*\/)?pagination(\/|\.js')/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
  });

  it('keeps the core’s span engine out of the base: only the spans entry imports it', () => {
    const offenders = files(SRC)
      .filter((f) => !/^spans\//.test(relative(SRC, f)) && relative(SRC, f) !== 'spans.ts')
      .filter((f) => /from '@dzgrid\/core\/spans'/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('has the export entry reach the base only through the grid’s context and the types (step 19)', () => {
    // @dzgrid/dom/export, eager: the core's internal entry and its own folder only; the run chunk only by import().
    const eager = files(SRC).filter((f) => relative(SRC, f) === 'export.ts' || /^export\/[^/]+\.ts$/.test(relative(SRC, f)));
    expect(eager.map((f) => relative(SRC, f)).sort()).toEqual(['export.ts', 'export/index.ts']);
    const offenders = eager
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/(core|core\/internal)$/.test(s) && s !== 'export.ts: ./export/index.js');
    expect(offenders).toEqual([]);
    expect(readFileSync(join(SRC, 'export/index.ts'), 'utf8')).toMatch(/import\('\.\/run\/index\.js'\)/);
    // Nothing of the base imports it, the features seam included; nor does another feature.
    expect(files(SRC).filter((f) => !/^export(\/|\.ts$)/.test(relative(SRC, f)) && /from '\.{1,2}\/(?:.*\/)?export(\/|\.js')/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
  });

  it('has the export run chunk import the core, the csv entry and its own folder; the server and span engines only through import()', () => {
    const chunk = files(join(SRC, 'export/run'));
    expect(chunk.map((f) => relative(SRC, f)).sort()).toEqual(['export/run/download.ts', 'export/run/index.ts', 'export/run/name.ts', 'export/run/request.ts', 'export/run/slice.ts']);
    const offenders = chunk
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: (@dzgrid\/core(\/internal|\/csv)?|\.\/[a-z]+\.js)$/.test(s));
    expect(offenders).toEqual([]);
    const dynamic = chunk.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/import\('([^']+)'\)/g)].map((m) => m[1]));
    expect(dynamic.sort()).toEqual(['@dzgrid/core/server', '@dzgrid/core/spans']);
    // The base never reaches the csv entry; only the export chunk does.
    expect(files(SRC).filter((f) => !/^export\/run\//.test(relative(SRC, f)) && /^import (?!type )[^;]*from '@dzgrid\/core\/csv'/m.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
  });
});
