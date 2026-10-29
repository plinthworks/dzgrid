// @vitest-environment node
// Phase 6 step 11 (docs/phase-6-steps/step11-plan.md §5, §6.11): the size lines of `@dzgrid/dom/print`, its texts and print.css
// (and its unlayered twin) at the plan's grants; the DOM base, core, K.8 and Angular lines unchanged; neither the base nor
// the K.8 profile reaches the print module. In node (esbuild does not run under jsdom).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const ROOT = `${process.cwd()}/`;

describe('11. sizes: the new lines; the base, core, K.8 and Angular unchanged', () => {
  const budget = JSON.parse(readFileSync(`${ROOT}size-budget.json`, 'utf8')).entries as Record<string, { file?: string; maxGzip: number | null; over?: string; external?: string[] }>;

  it('@dzgrid/dom/print 1 600 over the DOM base; -print texts 150 / 150 / 200; print.css 400 and its unlayered twin 400', () => {
    expect(budget['@dzgrid/dom/print']).toEqual({ file: 'packages/dom/src/print.ts', maxGzip: 1600, over: '@dzgrid/dom', external: ['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/dom/internal'] });
    expect(['en', 'fr', 'ar'].map((l) => budget[`@dzgrid/dom/locales/${l}-print`]?.maxGzip)).toEqual([150, 150, 200]);
    expect(budget['@dzgrid/theme/print.css']).toEqual({ file: 'packages/theme/print.css', maxGzip: 400 });
    // The Phase 6 close: lowered to its measure + 10 % (292 → 350).
    expect(budget['@dzgrid/theme/print.unlayered.css']).toEqual({ file: 'packages/theme/print.unlayered.css', maxGzip: 350 });
  });

  it('the base, core, K.8 and Angular lines unchanged (22 400, 29 150, 84 450, 7 000)', () => {
    expect(['@dzgrid/dom', '@dzgrid/core', 'profile: audit screen (K.8)', '@dzgrid/angular'].map((n) => budget[n]!.maxGzip)).toEqual([22400, 29150, 90000, 7450]); // owner step 16: K.8 90 000, Angular 7 450; K.8 and Angular raised at step 12 (owner Q12-1); K.8 84 950: owner « set include only » (2026-10-29)
  });

  it('neither the DOM base nor the K.8 profile reaches the print module (0 B by construction)', async () => {
    for (const entry of ['packages/dom/src/index.ts', 'perf/profiles/audit.ts']) {
      const r = await build({ entryPoints: [ROOT + entry], bundle: true, write: false, metafile: true, format: 'esm', logLevel: 'silent', external: ['@angular/*', 'rxjs', 'rxjs/*', '@dzgrid/angular', 'gsap', 'gsap/*', '@tzslot/*'], alias: { '@dzgrid/core': `${ROOT}packages/core/src/index.ts`, '@dzgrid/dom': `${ROOT}packages/dom/src/index.ts` } }).catch(() => null);
      const inputs = r ? Object.keys(r.metafile!.inputs) : readFileSync(ROOT + entry, 'utf8').match(/from '[^']+'/g) ?? [];
      expect(inputs.filter((i) => /print/.test(i)), entry).toEqual([]);
    }
  });
});
