// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { measureSplit, splitProblems } from '../size-split.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const F = 'scripts/test/fixtures/split';

/**
 * The K.8 profile's split mode (step 18, owner Q1): the initial load is the entry and the chunks
 * it imports statically, plus the CSS; a dynamic import is a lazy chunk, printed beside, never in
 * the initial sum.
 */
describe('size.mjs split mode', () => {
  it('initial = the entry and its static chunks (the shared one too) + css; the dynamic import is lazy', async () => {
    const m = await measureSplit({ file: `${F}/entry.ts`, css: [`${F}/style.css`] }, ROOT);
    expect(m.problems).toEqual([]);
    const inputs = (files: { inputs: string[] }[]) => files.flatMap((f) => f.inputs).sort();
    expect(inputs(m.initial)).toEqual([`${F}/a.ts`, `${F}/b.ts`, `${F}/entry.ts`]);
    expect(m.lazy).toHaveLength(1);
    expect(m.lazy[0].label).toBe(`${F}/lazy.ts`);
    expect(m.lazy[0].inputs).toEqual([`${F}/lazy.ts`]);
    // b is shared by the entry and the lazy chunk: one chunk of its own, loaded with the page.
    expect(m.initial.length).toBe(2);
    // The CSS minified as the theme's own line measures it: never more than the file as written.
    expect(m.css).toBeGreaterThan(0);
    expect(m.css).toBeLessThanOrEqual(gzipSync(readFileSync(`${ROOT}${F}/style.css`), { level: 9 }).length);
    expect(m.initialGzip).toBe(m.initial.reduce((s: number, f: { gz: number }) => s + f.gz, 0) + m.css);
    expect(m.lazy[0].gz).toBeGreaterThan(0);
    // Its first use downloads it alone: b came with the page.
    expect(m.lazy[0].firstUse).toBe(m.lazy[0].gz);
  });

  it('refuses an input from a built dist/ or a linked node_modules/@dzgrid/, and an input in two chunks', () => {
    const meta = (outputs: Record<string, { inputs: Record<string, unknown> }>) => ({ outputs });
    expect(splitProblems(meta({ 'out/e.js': { inputs: { 'packages/dom/dist/index.js': {} } } }))).toEqual(['packages/dom/dist/index.js: a built file (dist/), not the source']);
    expect(splitProblems(meta({ 'out/e.js': { inputs: { 'node_modules/@dzgrid/core/src/index.ts': {} } } }))).toEqual(['node_modules/@dzgrid/core/src/index.ts: through node_modules/@dzgrid/, not the workspace source']);
    expect(splitProblems(meta({ 'out/e.js': { inputs: { 'x.ts': {} } }, 'out/f.js': { inputs: { 'x.ts': {} } } }))).toEqual(['x.ts: in two chunks (out/e.js, out/f.js)']);
    expect(splitProblems(meta({ 'out/e.js': { inputs: { 'x.ts': {} } }, 'out/e.js.map': { inputs: { 'x.ts': {} } } }))).toEqual([]);
    // A third-party dependency may ship built files (tzslot's temporal-utils).
    expect(splitProblems(meta({ 'out/e.js': { inputs: { 'node_modules/temporal-utils/dist/utils.js': {} } } }))).toEqual([]);
  });

  it('measures a shipped file named by `alias` and listed in `shipped`, its `external` left out (step 23: the Angular wrapper)', async () => {
    const shippedFile = `${F}/shipped/dist/y.mjs`;
    const entry = { file: `${F}/ext-entry.ts`, external: ['dzg-ext-framework'], alias: { 'dzg-shipped': shippedFile }, shipped: [shippedFile] };
    const m = await measureSplit(entry, ROOT);
    expect(m.problems).toEqual([]);
    expect(m.initial.flatMap((f: { inputs: string[] }) => f.inputs).sort()).toEqual([`${F}/ext-entry.ts`, shippedFile]);
    // Not listed as shipped: a built file, refused as before.
    const n = await measureSplit({ ...entry, shipped: [] }, ROOT);
    expect(n.problems).toEqual([`${shippedFile}: a built file (dist/), not the source`]);
  });

  it('accepts only the shipped files it is given, every other dist/ still refused', () => {
    const meta = { outputs: { 'out/e.js': { inputs: { 'packages/angular/dist/fesm2022/dzgrid-angular.mjs': {}, 'packages/dom/dist/index.js': {} } } } };
    expect(splitProblems(meta, ['packages/angular/dist/fesm2022/dzgrid-angular.mjs'])).toEqual(['packages/dom/dist/index.js: a built file (dist/), not the source']);
  });
});
