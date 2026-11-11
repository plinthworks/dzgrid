// The lines of Phase 6 step 12 (docs/phase-6-steps/decisions.md « Step 12 Angular », owner Q12-1, Q12-2): K.8 84 450 →
// 84 800 and the Angular wrapper 7 000 → 7 300 (the Phase 6 grant); every other line where it was — the column menu's
// 4 300 holds its item parts (Q12-2: measured, not raised), the DOM base 22 400, the core 29 150, the real example's
// 92 500 (scripts/example.mjs). Written before the raise.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8');
const b = (JSON.parse(read('size-budget.json')) as { entries: Record<string, { maxGzip: number | null }> }).entries;

describe('step 12 budgets', () => {
  it('the two granted raises: K.8 84 800, Angular 7 300', () => {
    expect(b['profile: audit screen (K.8)']!.maxGzip).toBe(91000); // owner 2026-11-10 (« augmente la limite »): K.8 91 000; owner step 16 « ok pour les hausses »: 90 000; owner « set include only » (2026-10-29): 84 950; owner « clearFilters/resetState »: 84 900 (84 800 at step 12)
    expect(b['@dzgrid/angular']!.maxGzip).toBe(8650); // owner 2026-11-11 (« Monter à 8 650 »): Angular 8 650, measured 8 590 ([motion], 19 outputs); 1.9.0 presentation settings (+2 % rule): DOM 24 550, theme 2 990, Angular 8 100 (headerHeight had moved DOM to 24 200 and Angular to 8 000); 1.9.0 lot A (+2 % rule): 7 975, the [headers] input; Phase 11 L2 (+2 % rule): 7 950, `(rowMove)` and `ctl.rowDrag()` (R9); // Phase 8 close (+2 %, controller methods); Phase 7 close ([(groupBy)], +2 % rule); 1.4.0 [busy] (+2 % rule); // owner 2026-11-03: 7 650; owner step 16: 7 450; owner « clearFilters/resetState » (7 300 at step 12)
  });

  it('the real example 98 800 (+2 % rule at 1.4.0, measured 98 624; 1.3.0: 97 400; 1.2.0: 95 500; before 95 000: owner, decisions.md « Real Angular example line »: measured 94 596)', () => {
    expect(/const K8 = ([\d_]+);/.exec(read('scripts/example.mjs'))?.[1]).toBe('101_700'); // 1.11.0 (+2 % rule, measured 101 661: [motion], 19 outputs): 101 700; 1.10.0 release (+2 % rule, measured 101 165: the 1.10.0 base, the yes / no words): 101 500; 1.9.0 release (+2 % rule, measured 100 752; the test had kept 100 000); +2 % rule at the Phase 11 close (measured 99 717); Phase 8 close (measured 99 425); Phase 7 close (measured 98 833); 1.4.0 (measured 98 624); before at 1.3.0 (2026-11-02, measured 97 173)
  });

  it('no other line moves: column-menu 4 300, dom 22 400, core 29 150, dom/state 1 150', () => {
    expect(['@dzgrid/dom/column-menu', '@dzgrid/dom', '@dzgrid/core', '@dzgrid/dom/state'].map((n) => b[n]!.maxGzip)).toEqual([4300, 24950, 29550, 1300]); // 1.11.0 (+2 % rule, measured 24 921: features told and skipped, an edit option without a feature that edits told): DOM 24 950; 1.10.0 release (+2 % rule, measured 24 721: the yes / no words): DOM 24 750; 1.10.0 release review (+2 % rule, measured 24 665): DOM 24 700; 1.10.0 (+2 % rule, measured 24 630: group heights, headerWrap's missing-feature): DOM 24 650; 1.9.0 presentation settings (+2 % rule): DOM 24 550, theme 2 990, Angular 8 100 (headerHeight had moved DOM to 24 200 and Angular to 8 000); 1.9.0 lot B: core 29 550 (+2 % rule, columns that collapse); 1.9.0 lot A: 24 050 (+2 % rule, measured 24 013: hidden headers written on the header rows, missing-feature for total and headerVertical); Phase 11 L9: 23 850 (+2 % rule, the unbounded view); Phase 11 L4a: dom 23 690 (+2 % rule, the window follows the focus); Phase 10 DOM batch: dom/state 1 300 (+2 %) // Phase 9 dock: dom/state 1 289 (+2 %) // Phase 8 step 7: dom/state 1 264 (+2 %) // Phase 8 step 4: dom 23 660, core 29 300 (+2 % rule); dom/state 1 240 at the Phase 7 close (+2 %); Phase 7 step 2: core 29 250 (+2 % rule, the grouping seams); // 1.4.0 busy part: dom 23 250 (+2 % rule); busy bar: dom 23 070 (+2 % rule); // dom/state 1 224 (owner +2 % rule, step 16); 1 200 since « clearFilters/resetState » // 1.4.0: 22 440 → 22 880 (+2 % rule, the row numbers strip)
  });
});
