import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The core's promise, enforced by reading its sources: no `Date`, no clock, no
 * randomness, no DOM, no dependency, and the base never reaching into
 * `enterprise/`. Comments are stripped first — they may talk about `Date`.
 */
const SRC = fileURLToPath(new URL('../src', import.meta.url));

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

export const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');

export const FORBIDDEN: [string, RegExp][] = [
  ['new Date', /\bnew\s+Date\b/],
  ['Date.now / parse / UTC', /\bDate\.(now|parse|UTC)\b/],
  ['instanceof Date', /instanceof\s+Date\b/],
  ['a Date type', /[:<|,]\s*Date\b/],
  ['Math.random', /\bMath\.random\b/],
  ['performance.now', /\bperformance\.now\b/],
  ['Temporal', /\bTemporal\b/],
  // Globals used, not words: a field may well be called `window`.
  ['DOM globals', /(?<![.\w])(document|window|navigator|localStorage)\s*\./],
  ['a package import', /from\s+['"](?!\.)[^'"]+['"]/],
];

describe('core purity', () => {
  const all = files(SRC);

  it('finds the sources', () => {
    expect(all.length).toBeGreaterThanOrEqual(5);
  });

  for (const [what, re] of FORBIDDEN) {
    it(`has no ${what}`, () => {
      const offenders = all.filter((f) => re.test(code(readFileSync(f, 'utf8'))));
      expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
    });
  }

  it('keeps the base out of enterprise/', () => {
    const base = all.filter((f) => !f.slice(SRC.length + 1).startsWith('enterprise'));
    const offenders = base.filter((f) => /from\s+['"][^'"]*enterprise\//.test(code(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

describe('the purity checks themselves', () => {
  // A guard that never fires guards nothing: each pattern must catch a plant.
  const planted: Record<string, string> = {
    'new Date': 'const d = new Date();',
    'Date.now / parse / UTC': 'const t = Date.now();',
    'instanceof Date': 'if (x instanceof Date) {}',
    'a Date type': 'let d: Date;',
    'Math.random': 'const r = Math.random();',
    'performance.now': 'const t = performance.now();',
    Temporal: 'Temporal.Now.instant();',
    'DOM globals': 'document.body;',
    'a package import': "import x from 'lodash';",
  };
  for (const [what, re] of FORBIDDEN) {
    it(`catches ${what}`, () => {
      expect(re.test(code(planted[what]!))).toBe(true);
    });
  }

  it('lets a comment mention Date', () => {
    expect(FORBIDDEN.some(([, re]) => re.test(code('// new Date() is banned here\n/* Math.random */')))).toBe(false);
  });
});
