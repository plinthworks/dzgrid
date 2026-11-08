// @vitest-environment node
// L2 — measuring rule, owner A (2026-11-08): the K.8 profile measures what an Angular production build
// ships. The wrapper's fesm2022 is partial-compiled: `ng build` links it (Angular's own JavaScript
// transformer) and sets `ngDevMode` false, so its TestBed-only class metadata never ships. The text
// stays as esbuild writes it by default (`\uXXXX` for Arabic): the real example build ships it so.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { measureSplit, stale } from '../size-split.mjs';
// @ts-expect-error a plain .mjs script: the reference rebuild, written apart (Angular's linker, the production defines)
import { reference as rebuild } from './fixtures/size-reference.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const F = 'scripts/test/fixtures/split';
const SHIPPED = `${F}/ng/dist/ng.mjs`;
const FIXTURE = { file: `${F}/ng-entry.ts`, external: ['@angular/*'], alias: { 'dzg-ng-shipped': SHIPPED }, shipped: [SHIPPED] };
type Measured = { initialGzip: number; problems: string[]; initial: { code: Uint8Array }[] };
const reference = (entry: object): Promise<number> => rebuild(entry, ROOT);
const text = (m: Measured) => m.initial.map((f) => new TextDecoder().decode(f.code)).join('\n');

describe('size.mjs split mode, `angular: "production"` (L2, owner A)', () => {
  it('drops the TestBed-only class metadata, as ng build does; without it the metadata is there (planted)', async () => {
    const plain: Measured = await measureSplit(FIXTURE, ROOT);
    expect(plain.problems).toEqual([]);
    expect(text(plain)).toContain('dzg-fixture-testbed-only');
    expect(text(plain)).toContain('ngDeclareClassMetadata');
    const prod: Measured = await measureSplit({ ...FIXTURE, angular: 'production' }, ROOT);
    expect(prod.problems).toEqual([]);
    expect(text(prod)).not.toContain('dzg-fixture-testbed-only');
    expect(text(prod)).not.toMatch(/ClassMetadata|ngDeclare/);
    // The service itself ships, linked.
    expect(text(prod)).toContain('dzg-fixture-greet');
    expect(text(prod)).toContain('defineInjectable');
    expect(prod.initialGzip).toBeLessThan(plain.initialGzip);
  });

  it('equals a reference rebuild (Angular linker + production defines) within a few bytes', async () => {
    const prod: Measured = await measureSplit({ ...FIXTURE, angular: 'production' }, ROOT);
    expect(Math.abs(prod.initialGzip - (await reference(FIXTURE)))).toBeLessThanOrEqual(4);
  });

  it('refuses an unknown `angular` value', async () => {
    const m: Measured = await measureSplit({ ...FIXTURE, angular: 'dev' }, ROOT);
    expect(m.problems).toEqual(['angular dev: only "production" is known']);
  });

  const K8 = JSON.parse(readFileSync(`${ROOT}size-budget.json`, 'utf8')).entries['profile: audit screen (K.8)'];
  // The real profile needs the wrapper's build (npm run build); the gate builds it before check:size.
  it.skipIf(K8.shipped.some((f: string) => stale(f, ROOT)))('the K.8 profile is measured so, and equals its reference rebuild within a few bytes', async () => {
    expect(K8.angular).toBe('production');
    const m: Measured = await measureSplit(K8, ROOT);
    expect(m.problems).toEqual([]);
    expect(text(m)).not.toMatch(/ClassMetadata|ngDeclare/);
    expect(Math.abs(m.initialGzip - (await reference(K8)))).toBeLessThanOrEqual(8);
  }, 60_000);
});
