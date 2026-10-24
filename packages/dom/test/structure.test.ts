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
    const optional = /from '\.{1,2}\/(?:.*\/)?(filters|pagination|export|tzslot-picker|parts|spans|slots|search|rules|motion-gsap)\/|from '\.{1,2}\/(?:.*\/)?(spans|slots|search|rules|motion-gsap)\.js'/;
    const offenders = files(SRC)
      .filter((f) => !/^(filters|pagination|export|tzslot-picker|parts|spans|slots|search|rules|motion-gsap)\//.test(relative(SRC, f)) && !['features.ts', 'spans.ts', 'slots.ts', 'filters.ts', 'search.ts', 'pagination.ts', 'export.ts', 'parts.ts', 'rules.ts', 'motion-gsap.ts'].includes(relative(SRC, f)))
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

  it('keeps tzslot (and its Temporal) in the lazy date chunks: @tzslot/* only under dates/, filters/dates/ and editors/dates/ (step 14, K.2 amended; Phase 5 step 6)', () => {
    const tz = /^import [^;]*from '@tzslot\//m;
    const LAZY = /^(dates|filters\/dates|editors\/dates)\//;
    const offenders = files(SRC).filter((f) => tz.test(readFileSync(f, 'utf8')) && !LAZY.test(relative(SRC, f))).map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
    const core = fileURLToPath(new URL('../../core/src', import.meta.url));
    expect(files(core).filter((f) => /from '@tzslot|\bTemporal\.[A-Z]/.test(readFileSync(f, 'utf8'))).map((f) => relative(core, f))).toEqual([]);
    // The eager part reaches the kits only through import(): never a static import of ./dates/.
    const eager = files(SRC).filter((f) => !LAZY.test(relative(SRC, f)));
    expect(eager.filter((f) => /^import [^;]*from '\.{1,2}\/(?:.*\/)?dates\//m.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
    expect(readFileSync(join(SRC, 'filters/dates.ts'), 'utf8')).toMatch(/import\('\.\/dates\/date\.js'\)/);
    // The editors' calendar (step 6, owner S6-O4): reached only by import(), from the editors' date code.
    expect(files(SRC).filter((f) => /import\('\.\/dates\/calendar\.js'\)/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual(['editors/dates.ts']);
  });

  it('shares the lazy date helpers (dates/shared.ts, moved from filters/dates/ at step 6, not copied): only the two lazy date folders import it', () => {
    const users = files(SRC).filter((f) => /^import (?!type )[^;]*from '[./]*\/?(?:\.\.\/)*dates\/shared\.js'/m.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f));
    expect(users.length).toBeGreaterThan(0);
    expect(users.filter((f) => !/^(filters\/dates|editors\/dates)\//.test(f))).toEqual([]);
    expect(files(join(SRC, 'dates')).map((f) => relative(SRC, f))).toEqual(['dates/shared.ts']);
    // The filters' kits keep their own name for it: a re-export, no code of its own.
    expect(readFileSync(join(SRC, 'filters/dates/shared.ts'), 'utf8').replace(/^\s*(\/\/.*|\/\*[\s\S]*?\*\/)?\s*$/gm, '').trim()).toMatch(/^export \{[^}]+\} from '\.\.\/\.\.\/dates\/shared\.js';$/);
    // It touches tzslot, the core and nothing of the eager DOM.
    const offenders = [...readFileSync(join(SRC, 'dates/shared.ts'), 'utf8').matchAll(/^import (?!type )[^;]*from '([^']+)'/gm)].map((m) => m[1]).filter((m) => !/^(@tzslot\/(dom|core)|@dzgrid\/core(\/internal)?)$/.test(m!));
    expect(offenders).toEqual([]);
  });

  it('has the editors’ calendar chunk import only tzslot, the core, the internal entry and the shared date helpers (step 6)', () => {
    const chunk = files(join(SRC, 'editors/dates'));
    expect(chunk.map((f) => relative(SRC, f))).toEqual(['editors/dates/calendar.ts']);
    const offenders = chunk
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^import (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: (@tzslot\/(dom|core)|@dzgrid\/(core|core\/internal|dom\/internal)|\.\.\/\.\.\/dates\/shared\.js)$/.test(s));
    expect(offenders).toEqual([]);
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
      .filter((f) => !/^(filters|editors|editors-list)\//.test(relative(SRC, f)) && relative(SRC, f) !== 'popup.ts')
      .filter((f) => /^import (?!type )[^;]*from '\.{1,2}\/(?:.*\/)?popup\.js'/m.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('keeps @dzgrid/dom/internal for the feature entries (step 17): slots, filters, search, pagination and the editors (Phase 5 step 5) import it, by name; the base never', () => {
    const named = /^import (?!type )[^;]*from '@dzgrid\/dom\/internal'/m;
    const users = files(SRC).filter((f) => named.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f).split('/')[0]!.replace(/\.ts$/, ''));
    expect([...new Set(users)].sort()).toEqual(['editors', 'filters', 'pagination', 'search', 'slots']);
    // Never by a relative path (a second copy in each bundle), never from the base.
    const relative_ = files(SRC).filter((f) => !/^internal(\/|\.ts$)/.test(relative(SRC, f)) && /from '\.{1,2}\/(?:.*\/)?internal(\/|\.js')/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f));
    expect(relative_).toEqual([]);
    // What it replaced is gone: one copy of each helper.
    const all = files(SRC).map((f) => relative(SRC, f));
    for (const gone of ['mounted.ts', 'filters/announce.ts', 'search/said.ts', 'filters/lazy.ts']) expect(all).not.toContain(gone);
    expect(readFileSync(join(SRC, 'filters/dom.ts'), 'utf8')).not.toMatch(/export const composing/);
  });

  it('has the internal entry import only the core and its own folder (no base module bundled twice)', () => {
    const entry = files(SRC).filter((f) => /^internal(\/|\.ts$)/.test(relative(SRC, f)));
    expect(entry.map((f) => relative(SRC, f)).sort()).toEqual(['internal.ts', 'internal/keys.ts', 'internal/lazy.ts', 'internal/mounted.ts', 'internal/settled.ts']);
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

  it('has the rules entry reach the base only through the grid’s context and the types (step 21)', () => {
    // @dzgrid/dom/rules: value imports from the core, its internal entry, @dzgrid/core/rules and its own folder only.
    const entry = files(SRC).filter((f) => /^rules(\/|\.ts$)/.test(relative(SRC, f)));
    expect(entry.map((f) => relative(SRC, f)).sort()).toEqual(['rules.ts', 'rules/index.ts']);
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/(core|core\/internal|core\/rules)$/.test(s) && s !== 'rules.ts: ./rules/index.js');
    expect(offenders).toEqual([]);
    // Nothing else imports it, nor the core's rules entry.
    expect(files(SRC).filter((f) => !/^rules(\/|\.ts$)/.test(relative(SRC, f)) && /from '(\.{1,2}\/(?:.*\/)?rules(\/|\.js')|@dzgrid\/core\/rules')/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
  });

  it('has the tree entry reach the base only through the grid’s context and the types (Phase 4 step 4)', () => {
    // @dzgrid/dom/tree: value imports from the core, its internal entry, @dzgrid/core/tree and its own folder only
    // (the sticky parent rows' pure stack, tree/sticky.ts, imports nothing).
    const entry = files(SRC).filter((f) => /^tree(\/|\.ts$)/.test(relative(SRC, f)));
    expect(entry.map((f) => relative(SRC, f)).sort()).toEqual(['tree.ts', 'tree/index.ts', 'tree/lazy.ts', 'tree/sticky.ts', 'tree/styles.ts']);
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/(core|core\/internal|core\/tree)$/.test(s) && s !== 'tree.ts: ./tree/index.js' && s !== 'tree/index.ts: ./styles.js' && s !== 'tree/index.ts: ./sticky.js' && s !== 'tree/lazy.ts: @dzgrid/core/tree-lazy');
    expect(offenders).toEqual([]);
    // Nothing else imports it, nor the core's tree entry: a flat grid carries none of it (the lazy entry, step 7, only its own file).
    expect(files(SRC).filter((f) => !/^tree(\/|\.ts$)/.test(relative(SRC, f)) && relative(SRC, f) !== 'tree-lazy.ts' && /from '(\.{1,2}\/(?:.*\/)?tree(\/|\.js')|@dzgrid\/core\/tree')/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
    // Lazy children (step 7): the tree names their type only; the lazy entry is its file and nothing else.
    expect(/from '\.\/lazy\.js'/.test(readFileSync(join(SRC, 'tree/index.ts'), 'utf8').replace(/^import type .*$/gm, ''))).toBe(false);
    expect([...readFileSync(join(SRC, 'tree-lazy.ts'), 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => m[1])).toEqual(['./tree/lazy.js']);
  });

  it('has the edit entry reach the base only through the grid’s context, the types and the shared writes (Phase 5 step 4)', () => {
    // @dzgrid/dom/edit: value imports from the core, its internal entry, @dzgrid/core/edit, its own folder and the
    // guarded writes (render/write.ts, no import of its own: an entry using it pulls nothing else in).
    const entry = files(SRC).filter((f) => /^edit(\/|\.ts$)/.test(relative(SRC, f)));
    expect(entry.map((f) => relative(SRC, f)).sort()).toEqual(['edit.ts', 'edit/index.ts', 'edit/marks.ts', 'edit/stale.ts']);
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/(core|core\/internal|core\/edit)$/.test(s) && !/^edit(\/[^:]+)?\.ts: \.\/(edit\/)?[a-z-]+\.js$/.test(s) && !/^edit\/[a-z]+\.ts: \.\.\/render\/write\.js$/.test(s));
    expect(offenders).toEqual([]);
    expect(readFileSync(join(SRC, 'render/write.ts'), 'utf8')).not.toMatch(/^import /m);
    // Nothing else imports it (its types aside: the editors name `EditApi`), nor the core's edit controller: a grid that does not edit carries none of it.
    expect(files(SRC).filter((f) => !/^edit(\/|\.ts$)/.test(relative(SRC, f)) && /from '(\.{1,2}\/(?:.*\/)?edit(\/|\.js')|@dzgrid\/core\/edit')/.test(readFileSync(f, 'utf8').replace(/^import type .*$/gm, ''))).map((f) => relative(SRC, f))).toEqual([]);
  });

  it('has the editors entry reach the base only through the grid’s context, the types and a few pure helpers (Phase 5 step 5)', () => {
    // @dzgrid/dom/editors: the core, its internal entry, the dom's internal entry, its own folder, the guarded writes and
    // the direction helpers (no import of their own besides types); never @dzgrid/dom/edit's code (the grid hands its API).
    // Step 6: the popup host too (measured apart, `over` it); the calendar chunk (editors/dates/) by import() only.
    const entry = files(SRC).filter((f) => /^editors(\/[^/]+|\.ts)$/.test(relative(SRC, f)));
    expect(entry.map((f) => relative(SRC, f)).sort()).toEqual(['editors.ts', 'editors/bubble.ts', 'editors/dates.ts', 'editors/host.ts', 'editors/index.ts']);
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/(core|core\/internal|dom\/internal)$/.test(s) && !/^editors(\/[^:]+)?\.ts: \.\/(editors\/)?[a-z-]+\.js$/.test(s) && !/^editors\/[a-z]+\.ts: \.\.\/(render\/write|dir|popup)\.js$/.test(s));
    expect(offenders).toEqual([]);
    expect(readFileSync(join(SRC, 'dir.ts'), 'utf8').match(/^import (?!type ).*$/gm) ?? []).toEqual([]);
    // Nothing imports it: a grid that does not edit (or edits only by its API) carries none of it; the base's host is gone.
    // (Types aside: the list's entry names the editors' `Ed` shape, step 6.)
    expect(files(SRC).filter((f) => !/^editors(\/|\.ts$)/.test(relative(SRC, f)) && /from '\.{1,2}\/(?:.*\/)?editors(\/|\.js')/.test(readFileSync(f, 'utf8').replace(/^import type .*$/gm, ''))).map((f) => relative(SRC, f))).toEqual([]);
    expect(files(SRC).map((f) => relative(SRC, f))).not.toContain('render/editor.ts');
    // Never the filters (layering, phase plan §4), not even their types: what both use lives in @dzgrid/dom/internal or dates/.
    expect(files(SRC).filter((f) => /^editors(\/|\.ts$)/.test(relative(SRC, f)) && /from '[^']*filters[^']*'/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
  });

  it('has the list in its own entry, @dzgrid/dom/editors-list (owner S6-O7): the core, the popup host and the pure helpers; the editors never import it', () => {
    const entry = files(SRC).filter((f) => /^editors-list(\/|\.ts$)/.test(relative(SRC, f)));
    expect(entry.map((f) => relative(SRC, f)).sort()).toEqual(['editors-list.ts', 'editors-list/index.ts']);
    const offenders = entry
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/(core|core\/internal|dom\/internal)$/.test(s) && s !== 'editors-list.ts: ./editors-list/index.js' && !/^editors-list\/index\.ts: \.\.\/(render\/write|dir|popup)\.js$/.test(s));
    expect(offenders).toEqual([]);
    // The editors never import it at run time, whatever the path (a grid without lists carries none of it).
    expect(files(SRC).filter((f) => /^editors(\/|\.ts$)/.test(relative(SRC, f)) && /^import (?!type )[^;]*from '[^']*editors-list[^']*'/m.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
    // The application hands it to `editors({ list })`: nothing else imports it.
    expect(files(SRC).filter((f) => !/^editors-list(\/|\.ts$)/.test(relative(SRC, f)) && /from '[^']*editors-list[^']*'/.test(readFileSync(f, 'utf8').replace(/^import type .*$/gm, ''))).map((f) => relative(SRC, f))).toEqual([]);
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
  it('keeps GSAP in the motion chunk: no file outside motion-gsap/run/ imports it, statically or not (step 26)', () => {
    const gsap = /(?:^|\n)\s*(?:import|export) (?!type )[^;]*from '(gsap|gsap\/[^']*)'|import\('gsap(\/[^']*)?'\)/;
    const offenders = files(SRC).filter((f) => !/^motion-gsap\/run\//.test(relative(SRC, f)) && gsap.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
    // Nor the core, nor the theme.
    const core = fileURLToPath(new URL('../../core/src', import.meta.url));
    expect(files(core).filter((f) => /gsap/i.test(readFileSync(f, 'utf8'))).map((f) => relative(core, f))).toEqual([]);
    expect(readFileSync(fileURLToPath(new URL('../../theme/dzgrid.scss', import.meta.url)), 'utf8')).not.toMatch(/gsap/i);
    // The run chunk does reach it (by import(), or the application's own instance).
    const run = files(join(SRC, 'motion-gsap/run')).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(run).toMatch(/import\('gsap'\)/);
  });

  it('has the motion shell reach the base only through the grid’s context and the types; the run chunk only by import() (step 26)', () => {
    const shell = files(SRC).filter((f) => relative(SRC, f) === 'motion-gsap.ts' || /^motion-gsap\/[^/]+\.ts$/.test(relative(SRC, f)));
    expect(shell.map((f) => relative(SRC, f)).sort()).toEqual(['motion-gsap.ts', 'motion-gsap/index.ts']);
    const offenders = shell
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: @dzgrid\/(core|core\/internal)$/.test(s) && s !== 'motion-gsap.ts: ./motion-gsap/index.js');
    expect(offenders).toEqual([]);
    expect(readFileSync(join(SRC, 'motion-gsap/index.ts'), 'utf8')).toMatch(/import\('\.\/run\/index\.js'\)/);
    // The run chunk: the core, its internal entry and its own folder.
    const run = files(join(SRC, 'motion-gsap/run'));
    expect(run.length).toBeGreaterThan(1);
    const runOff = run
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/: (@dzgrid\/core(\/internal)?|\.\/[a-z]+\.js)$/.test(s));
    expect(runOff).toEqual([]);
    // Nothing else imports the entry or its chunk, the features seam included.
    expect(files(SRC).filter((f) => !/^motion-gsap(\/|\.ts$)/.test(relative(SRC, f)) && /motion-gsap/.test(readFileSync(f, 'utf8').replace(/\/\*[^]*?\*\/|^\s*\/\/.*$/gm, ''))).map((f) => relative(SRC, f))).toEqual([]);
  });
});
