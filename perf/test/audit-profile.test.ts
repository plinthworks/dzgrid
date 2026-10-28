// @vitest-environment node
// The K.8 profile (step 18, owner Q1): `perf/profiles/audit.ts` is what the audit screen ships
// before the first gesture. It must name every library value the screen imports, or the 85 kB
// line measures less than the screen loads; and only library code (the screen's own glue is the
// app's, not DzGrid's).
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (f: string) => readFileSync(ROOT + f, 'utf8');
/** Every .ts file under a folder of the repository (paths from ROOT). */
const tsUnder = (dir: string): string[] => !existsSync(ROOT + dir) ? [] : readdirSync(ROOT + dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? tsUnder(`${dir}/${e.name}`) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : []));

/** `import { a, type B, c as d } from '@dzgrid/x'` (and `export { … } from`): the values only, by specifier. */
export function namedValues(src: string, verb: 'import' | 'export'): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const re = new RegExp(`${verb}\\s+(type\\s+)?\\{([^}]*)\\}\\s*from\\s*'([^']+)'`, 'g');
  for (const m of src.matchAll(re)) {
    if (m[1]) continue;
    const names = m[2]!.split(',').map((s) => s.trim()).filter((s) => s && !s.startsWith('type '));
    const set = out.get(m[3]!) ?? new Set();
    for (const n of names) set.add(n.split(/\s+as\s+/)[0]!);
    out.set(m[3]!, set);
  }
  return out;
}

describe('the K.8 audit profile', () => {
  const screen = namedValues(read('perf/audit-screen.ts'), 'import');
  const profile = namedValues(read('perf/profiles/audit.ts'), 'export');

  it('the parser reads values, skips types', () => {
    const m = namedValues("import { a, type B, c as d } from '@dzgrid/x';\nimport type { E } from '@dzgrid/y';", 'import');
    expect([...m.entries()].map(([k, v]) => [k, [...v]])).toEqual([['@dzgrid/x', ['a', 'c']]]);
  });

  it('covers every @dzgrid/* value the screen imports', () => {
    const lib = [...screen].filter(([spec]) => spec.startsWith('@dzgrid/'));
    expect(lib.length).toBeGreaterThan(3);
    const missing = lib.flatMap(([spec, names]) => [...names].filter((n) => !profile.get(spec)?.has(n)).map((n) => `${n} from ${spec}`));
    expect(missing).toEqual([]);
  });

  it('covers every @dzgrid/* value the Angular example imports, the wrapper included (step 23; its fr and en texts stand for ar)', () => {
    // The « stock » screen (Phase 5 step 9, S9-Q4) is not the first load: loaded on demand, measured apart (example:bytes (4)).
    // Nor the address screen (Phase 6 step 12, Q12-3): its chunk loaded on demand, measured apart (example:bytes (5)).
    const lazy = /src\/app\/(stock\.component|audit-url)\.ts$/;
    const files = tsUnder('examples/angular-audit/src').filter((f) => !lazy.test(f));
    expect(files.length).toBeGreaterThan(2);
    const STATIC = /\b(?:import|export)\s+(?:[^'"();]*?\bfrom\s*)?['"][^'"]*stock\.component['"]/;
    for (const f of files) expect(read(f), f).not.toMatch(STATIC);
    // Review of step 9 (2): any relative path, `export … from` and a bare import too; `import(` stays allowed.
    for (const planted of [`import { StockScreen } from './stock.component';`, `export { StockScreen } from "../app/stock.component";`, `import './app/stock.component';`]) expect(planted, planted).toMatch(STATIC);
    expect(`const m = await import('./app/stock.component');`).not.toMatch(STATIC);
    for (const main of ['main.ts', 'main.zone.ts']) expect(read(`examples/angular-audit/src/${main}`), main).toMatch(/import\('\.\/app\/stock\.component'\)/);
    const URL_STATIC = /\b(?:import|export)\s+(?:[^'"();]*?\bfrom\s*)?['"][^'"]*\/audit-url['"]/;
    for (const f of files) expect(read(f), f).not.toMatch(URL_STATIC);
    for (const main of ['main.ts', 'main.zone.ts']) expect(read(`examples/angular-audit/src/${main}`), main).toMatch(/import\('\.\/app\/audit-url'\)/);
    const used = new Map<string, Set<string>>();
    for (const f of files) for (const [spec, names] of namedValues(read(f), 'import')) used.set(spec, new Set([...(used.get(spec) ?? []), ...names]));
    const lib = [...used].filter(([spec]) => spec.startsWith('@dzgrid/') && !/^@dzgrid\/dom\/locales\/(fr|en)(-|$)/.test(spec));
    expect(used.get('@dzgrid/angular')?.has('DzGrid')).toBe(true);
    const missing = lib.flatMap(([spec, names]) => [...names].filter((n) => !profile.get(spec)?.has(n)).map((n) => `${n} from ${spec}`));
    expect(missing).toEqual([]);
  });

  it('names library imports only, with one language (the largest: Arabic, its filter and pager texts)', () => {
    expect([...profile.keys()].every((s) => s.startsWith('@dzgrid/'))).toBe(true);
    expect(profile.get('@dzgrid/dom/locales/ar')?.has('AR')).toBe(true);
    expect(profile.get('@dzgrid/dom/locales/ar-filters')?.has('AR_FILTERS')).toBe(true);
    expect(profile.get('@dzgrid/dom/locales/ar-pagination')?.has('AR_PAGINATION')).toBe(true);
    expect(profile.get('@dzgrid/dom/locales/ar-export')?.has('AR_EXPORT')).toBe(true);
  });
  it('imports no motion: neither @dzgrid/dom/motion-gsap nor gsap, statically (step 26: K.8 holds; motion is lazy, beside)', () => {
    const statically = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^;]*from\s*'(@dzgrid\/dom\/motion-gsap|gsap(?:\/[^']*)?)'/;
    for (const f of ['perf/profiles/audit.ts', 'perf/audit-screen.ts', ...tsUnder('examples/angular-audit/src')]) expect(statically.test(read(f)), f).toBe(false);
    expect([...profile.keys()].filter((s) => /motion|gsap/.test(s))).toEqual([]);
    // The informational line beside it adds the motion shell to the same profile, nothing else.
    const withMotion = read('perf/profiles/audit-motion.ts');
    expect(withMotion).toMatch(/export \* from '\.\/audit\.js';/);
    expect([...namedValues(withMotion, 'export').entries()].map(([k, v]) => [k, [...v]])).toEqual([['@dzgrid/dom/motion-gsap', ['motion']]]);
    // The Angular example loads it only by import(), outside the zone.
    const example = tsUnder('examples/angular-audit/src').map(read).join('\n');
    expect(example).toMatch(/runOutsideAngular\([^]*?import\('@dzgrid\/dom\/motion-gsap'\)/);
  });
});
