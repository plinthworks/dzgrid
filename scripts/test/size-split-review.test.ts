// @vitest-environment node
// Review of step 23 (size-split alias / external / shipped): killing tests and guard holes.
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error a plain .mjs script
import { measureSplit, measureSplitEntry, shippedProblems } from './../size-split.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const F = 'scripts/test/fixtures/split';

describe('size-split, step 23 review', () => {
  it('a lazy chunk importing an external package is measured, the external left out of its first use', async () => {
    const m = await measureSplit({ file: `${F}/ext-lazy-entry.ts`, external: ['dzg-ext-framework'] }, ROOT);
    expect(m.problems).toEqual([]);
    expect(m.lazy).toHaveLength(1);
    expect(m.lazy[0].inputs).toEqual([`${F}/ext-lazy.ts`]);
    expect(m.lazy[0].firstUse).toBe(m.lazy[0].gz);
    expect(m.initial.flatMap((f: { inputs: string[] }) => f.inputs)).toEqual([`${F}/ext-lazy-entry.ts`]);
  });

  it('the shipped file counts in the initial bytes (alias does not drop it)', async () => {
    const shippedFile = `${F}/shipped/dist/y.mjs`;
    const entry = { file: `${F}/ext-entry.ts`, external: ['dzg-ext-framework'], alias: { 'dzg-shipped': shippedFile }, shipped: [shippedFile] };
    const m = await measureSplit(entry, ROOT);
    const bare = await measureSplit({ file: `${F}/b.ts` }, ROOT);
    expect(m.initial).toHaveLength(1);
    expect(m.initial[0].min).toBeGreaterThan(bare.initial[0].min);
  });

  // Guard hole: `alias` may point a package at any file; the doc says `shipped` must list it, nothing checks.
  it('refuses an alias whose target `shipped` does not list (a stub would hide the package)', async () => {
    const m = await measureSplit({ file: `${F}/ext-entry.ts`, external: ['dzg-ext-framework'], alias: { 'dzg-shipped': `${F}/stub.ts` } }, ROOT);
    expect(m.problems.join('\n')).toMatch(/alias/);
  });

  // Guard hole: an `external` pattern may name a DzGrid package; its code then leaves the count silently.
  it('refuses an external pattern that matches @dzgrid/*', async () => {
    const m = await measureSplit({ file: 'perf/profiles/audit.ts', css: [], external: ['@angular/*', 'rxjs', 'rxjs/*', '@dzgrid/*'] }, ROOT);
    expect(m.problems.join('\n')).toMatch(/@dzgrid/);
  });

  // size.mjs checks the shipped build before measuring: missing or stale, nothing is built, the
  // problem says "run npm run build" (deleting the check, esbuild would crash on the missing alias).
  describe('the shipped build is checked before the measure', () => {
    const SHIP = 'packages/x/dist/x.mjs';
    const tree = (withDist: boolean) => {
      const root = `${realpathSync(mkdtempSync(join(tmpdir(), 'dzg-ship-')))}/`;
      mkdirSync(join(root, 'packages/x/src'), { recursive: true });
      mkdirSync(join(root, 'packages/x/dist'), { recursive: true });
      writeFileSync(join(root, 'packages/x/src/index.ts'), "export const x = 'x';\n");
      writeFileSync(join(root, 'entry.ts'), "export { x } from 'dzg-x';\n");
      if (withDist) writeFileSync(join(root, SHIP), "export const x = 'x built';\n");
      return root;
    };
    const entry = { file: 'entry.ts', alias: { 'dzg-x': SHIP }, shipped: [SHIP] };

    it('missing: not measured, "run npm run build", no crash', async () => {
      const m = await measureSplitEntry(entry, tree(false));
      expect(m.measured).toBe(false);
      expect(m.problems).toEqual([`${SHIP} is missing: run npm run build`]);
    });

    it('older than its package sources: not measured, "run npm run build"', async () => {
      const root = tree(true);
      const old = new Date(Date.now() - 60_000);
      utimesSync(join(root, SHIP), old, old);
      const m = await measureSplitEntry(entry, root);
      expect(m.measured).toBe(false);
      expect(m.problems).toEqual([`${SHIP} is older than packages/x/src: run npm run build`]);
    });

    it('fresh: measured, the shipped file in the initial load', async () => {
      const root = tree(true);
      const later = new Date(Date.now() + 60_000);
      utimesSync(join(root, SHIP), later, later);
      const m = await measureSplitEntry(entry, root);
      expect(m.measured).toBe(true);
      expect(m.problems).toEqual([]);
      expect(m.initial.flatMap((f: { inputs: string[] }) => f.inputs).sort()).toEqual(['entry.ts', SHIP]);
    });

    it('refuses a shipped path outside packages/<p>/dist/', () => {
      expect(shippedProblems({ shipped: [`${F}/shipped/dist/y.mjs`] }, ROOT)).toEqual([`${F}/shipped/dist/y.mjs: a shipped file must be a package's build (packages/<p>/dist/)`]);
      expect(shippedProblems({ shipped: ['node_modules/@dzgrid/angular/dist/x.mjs'] }, ROOT)).toHaveLength(1);
    });
  });
});
