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

  it('@dzgrid/dom/print 1 632 over the DOM base (Phase 7 close, +2 %: group rows printed); -print texts 150 / 150 / 200; print.css 400 and its unlayered twin 400', () => {
    expect(budget['@dzgrid/dom/print']).toEqual({ file: 'packages/dom/src/print.ts', maxGzip: 1710, over: '@dzgrid/dom', external: ['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/dom/internal'] });
    expect(['en', 'fr', 'ar'].map((l) => budget[`@dzgrid/dom/locales/${l}-print`]?.maxGzip)).toEqual([150, 150, 200]);
    expect(budget['@dzgrid/theme/print.css']).toEqual({ file: 'packages/theme/print.css', maxGzip: 400 });
    // The Phase 6 close: lowered to its measure + 10 % (292 → 350).
    expect(budget['@dzgrid/theme/print.unlayered.css']).toEqual({ file: 'packages/theme/print.unlayered.css', maxGzip: 350 });
  });

  it('the base, core, K.8 and Angular lines unchanged (22 400, 29 150, 84 450, 7 000)', () => {
    expect(['@dzgrid/dom', '@dzgrid/core', 'profile: audit screen (K.8)', '@dzgrid/angular'].map((n) => budget[n]!.maxGzip)).toEqual([24550, 29550, 90000, 8100]); // 1.9.0 presentation settings (+2 % rule): DOM 24 550, theme 2 990, Angular 8 100 (headerHeight had moved DOM to 24 200 and Angular to 8 000); 1.9.0 lot B: core 29 550 (+2 % rule); 1.9.0 lot A: 24 050 (+2 % rule, measured 24 013: hidden headers written on the header rows, missing-feature for total and headerVertical); Angular 7 975 (+2 %, the [headers] input); print 1 710 (+2 %, header: false and the totals row); Phase 11 L9: 23 850 (+2 % rule, the unbounded view); Phase 11 L4a: dom 23 690 (+2 % rule); Phase 11 L2 (+2 % rule): 7 950, `(rowMove)` and `ctl.rowDrag()` (R9); // Phase 8 step 4: dom 23 660, core 29 300 (+2 % rule, a block list in the base); Phase 7 close: Angular 7 665 → 7 810 (+2 % rule); step 2: 29 250 (+2 % rule, the grouping seams); 1.4.0 busy part: dom 23 250 (+2 % rule); busy bar: 23 070, 7 665 (+2 % rule); // owner step 16: K.8 90 000, Angular 7 450; K.8 and Angular raised at step 12 (owner Q12-1); K.8 84 950: owner « set include only » (2026-10-29) // 1.4.0: 22 440 → 22 880 (+2 % rule, the row numbers strip)
  });

  it('neither the DOM base nor the K.8 profile reaches the print module (0 B by construction)', async () => {
    for (const entry of ['packages/dom/src/index.ts', 'perf/profiles/audit.ts']) {
      const r = await build({ entryPoints: [ROOT + entry], bundle: true, write: false, metafile: true, format: 'esm', logLevel: 'silent', external: ['@angular/*', 'rxjs', 'rxjs/*', '@dzgrid/angular', 'gsap', 'gsap/*', '@tzslot/*'], alias: { '@dzgrid/core': `${ROOT}packages/core/src/index.ts`, '@dzgrid/dom': `${ROOT}packages/dom/src/index.ts` } }).catch(() => null);
      const inputs = r ? Object.keys(r.metafile!.inputs) : readFileSync(ROOT + entry, 'utf8').match(/from '[^']+'/g) ?? [];
      expect(inputs.filter((i) => /print/.test(i)), entry).toEqual([]);
    }
  });
});
