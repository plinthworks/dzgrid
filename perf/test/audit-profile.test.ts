// @vitest-environment node
// The K.8 profile (step 18, owner Q1): `perf/profiles/audit.ts` is what the audit screen ships
// before the first gesture. It must name every library value the screen imports, or the 85 kB
// line measures less than the screen loads; and only library code (the screen's own glue is the
// app's, not DzGrid's).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (f: string) => readFileSync(ROOT + f, 'utf8');

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

  it('names library imports only, with one language (the largest: Arabic, its filter and pager texts)', () => {
    expect([...profile.keys()].every((s) => s.startsWith('@dzgrid/'))).toBe(true);
    expect(profile.get('@dzgrid/dom/locales/ar')?.has('AR')).toBe(true);
    expect(profile.get('@dzgrid/dom/locales/ar-filters')?.has('AR_FILTERS')).toBe(true);
    expect(profile.get('@dzgrid/dom/locales/ar-pagination')?.has('AR_PAGINATION')).toBe(true);
  });
});
