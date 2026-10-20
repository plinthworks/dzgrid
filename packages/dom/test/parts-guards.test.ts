// @vitest-environment node
// The `@dzgrid/dom/parts` entry (step 20): its exports, its wiring, its sizes, its texts and its rules.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkScss, checkSource } from './guards.js';
import * as entry from '../src/parts.js';
import { EN_PARTS } from '../src/locales/en-parts.js';
import { FR_PARTS } from '../src/locales/fr-parts.js';
import { AR_PARTS } from '../src/locales/ar-parts.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = join(ROOT, 'packages/dom/src');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
});
const own = () => files(SRC).filter((f) => /^parts(\/|\.ts$)/.test(relative(SRC, f)));

describe('@dzgrid/dom/parts', () => {
  it('exports badge(), cellBoolean and PARTS_KEYS, and nothing else at run time', () => {
    expect(Object.keys(entry).sort()).toEqual(['PARTS_KEYS', 'badge', 'cellBoolean']);
    expect(typeof entry.badge).toBe('function');
    expect(entry.badge().slot).toBe('cell');
    expect(typeof entry.badge().part.mount).toBe('function');
    expect(entry.cellBoolean.slot).toBe('cell');
    expect(typeof entry.cellBoolean.part.mount).toBe('function');
    expect([...entry.PARTS_KEYS]).toEqual(['cell.yes', 'cell.no']);
  });

  it('is a subpath of the package, built, aliased for the tests, the type checker and the playground', () => {
    const pkg = JSON.parse(read('packages/dom/package.json')) as { exports: Record<string, { types: string; default: string }> };
    expect(pkg.exports['./parts']).toEqual({ types: './src/parts.ts', default: './src/parts.ts' });
    for (const l of ['en', 'fr', 'ar']) expect(pkg.exports[`./locales/${l}-parts`]).toEqual({ types: `./src/locales/${l}-parts.ts`, default: `./src/locales/${l}-parts.ts` });
    const build = read('scripts/build.mjs');
    for (const p of ['./parts', './locales/en-parts', './locales/fr-parts', './locales/ar-parts']) expect(build).toContain(`'${p}'`);
    expect(read('vitest.config.ts')).toMatch(/'@dzgrid\/dom\/parts': fileURLToPath\(new URL\('\.\/packages\/dom\/src\/parts\.ts'/);
    expect(read('vite.config.ts')).toMatch(/find: '@dzgrid\/dom\/parts', replacement: fileURLToPath\(new URL\('\.\/packages\/dom\/src\/parts\.ts'/);
    // Before the bare '@dzgrid/dom' alias, or Vite would resolve it as a path under index.ts.
    const vite = read('vite.config.ts');
    expect(vite.indexOf("find: '@dzgrid/dom/parts'")).toBeLessThan(vite.indexOf("find: '@dzgrid/dom',"));
    const paths = (JSON.parse(read('tsconfig.spec.json')) as { compilerOptions: { paths: Record<string, string[]> } }).compilerOptions.paths;
    expect(paths['@dzgrid/dom/parts']).toEqual(['./packages/dom/src/parts.ts']);
  });

  it('has its size lines with the owner’s budgets, and leaves the others where they were', () => {
    const b = (JSON.parse(read('size-budget.json')) as { entries: Record<string, { file?: string; maxGzip: number | null; external?: string[] }> }).entries;
    expect(b['@dzgrid/dom/parts']).toEqual({ file: 'packages/dom/src/parts.ts', maxGzip: 600, external: ['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/dom/internal'] });
    expect(b['@dzgrid/dom/locales/en-parts']).toEqual({ file: 'packages/dom/src/locales/en-parts.ts', maxGzip: 130 });
    expect(b['@dzgrid/dom/locales/fr-parts']).toEqual({ file: 'packages/dom/src/locales/fr-parts.ts', maxGzip: 140 });
    expect(b['@dzgrid/dom/locales/ar-parts']).toEqual({ file: 'packages/dom/src/locales/ar-parts.ts', maxGzip: 160 });
    expect(b['@dzgrid/theme']!.maxGzip).toBe(2050);
    expect(b['@dzgrid/dom']!.maxGzip).toBe(19100);
    expect(b['@dzgrid/core']!.maxGzip).toBe(26900);
  });

  it('reaches the base through the types only: no value import outside its own folder, no style, no internal module', () => {
    const list = own().map((f) => relative(SRC, f)).sort();
    expect(list).toEqual(['parts.ts', 'parts/badge.ts', 'parts/boolean.ts', 'parts/draw.ts', 'parts/index.ts']);
    const offenders = own()
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/^(?:import|export) (?!type )[^;]*from '([^']+)'/gm)].map((m) => `${relative(SRC, f)}: ${m[1]}`))
      .filter((s) => !/^parts(\/[^:]+)?\.ts: \.\/(parts\/)?[a-z]+\.js$/.test(s));
    expect(offenders).toEqual([]);
    for (const f of own()) {
      const src = readFileSync(f, 'utf8');
      expect(src, relative(SRC, f)).not.toMatch(/@dzgrid\/(dom|core)\/internal|createElement\('style'\)|adoptedStyleSheets|insertRule|\.style\b/);
    }
    // Nothing of the base, nor another feature, imports it.
    expect(files(SRC).filter((f) => !/^parts(\/|\.ts$)/.test(relative(SRC, f)) && /from '\.{1,2}\/(?:.*\/)?parts(\/|\.js')/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))).toEqual([]);
  });

  it('holds the DOM layer’s rules: no literal text, no colour, no physical side, no HTML', () => {
    const found = own().flatMap((f) => checkSource(readFileSync(f, 'utf8'), relative(SRC, f)).map((x) => `${relative(SRC, f)}:${x.line} ${x.rule} ${x.why}`));
    expect(found).toEqual([]);
    // Its words come from the messages: no string with two letters in a row in its sources.
    for (const f of own()) {
      const strings = [...readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').matchAll(/'([^'\n]*)'/g)].map((m) => m[1]!);
      const words = strings.filter((s) => /\p{L}{2}/u.test(s) && !/^(dzg-[a-z-]+|cell\.(yes|no)|cell|span|aria-hidden|true|dir|auto|tone|neutral|info|success|warning|danger|\.\.?\/[a-z/-]+\.js)$/.test(s));
      expect(words, relative(SRC, f)).toEqual([]);
    }
  });

  it('has its theme rules on logical sides only', () => {
    const scss = read('packages/theme/dzgrid.scss');
    const rules = scss.slice(scss.indexOf('.dzg-badge'), scss.indexOf('// end of the cell parts'));
    expect(rules.length).toBeGreaterThan(100);
    expect(checkScss(rules)).toEqual([]);
    expect(rules).not.toMatch(/\b(left|right)\b|translateX|margin:|padding:\s*\S+\s+\S+/);
  });
});

describe('the parts’ texts', () => {
  it('each bundle has exactly PARTS_KEYS, with its locale', () => {
    for (const [b, locale] of [[EN_PARTS, 'en'], [FR_PARTS, 'fr'], [AR_PARTS, 'ar']] as const) {
      expect(b.locale).toBe(locale);
      expect(Object.keys(b.text).sort()).toEqual([...entry.PARTS_KEYS].sort());
    }
  });

  it('says yes and no in each language, the Arabic in Arabic letters (not escapes gone wrong)', () => {
    expect(EN_PARTS.text).toEqual({ 'cell.yes': 'Yes', 'cell.no': 'No' });
    expect(FR_PARTS.text).toEqual({ 'cell.yes': 'Oui', 'cell.no': 'Non' });
    expect([...AR_PARTS.text['cell.yes']].map((c) => c.codePointAt(0)!.toString(16))).toEqual(['646', '639', '645']);
    expect([...AR_PARTS.text['cell.no']].map((c) => c.codePointAt(0)!.toString(16))).toEqual(['644', '627']);
    // The files hold the letters themselves, UTF-8, no backslash escape.
    for (const l of ['en', 'fr', 'ar']) expect(read(`packages/dom/src/locales/${l}-parts.ts`)).not.toMatch(/\\u/);
  });
});
