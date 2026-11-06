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
    expect(b['profile: audit screen (K.8)']!.maxGzip).toBe(90000); // owner step 16 « ok pour les hausses »: 90 000; owner « set include only » (2026-10-29): 84 950; owner « clearFilters/resetState »: 84 900 (84 800 at step 12)
    expect(b['@dzgrid/angular']!.maxGzip).toBe(7900); // Phase 8 close (+2 %, controller methods); Phase 7 close ([(groupBy)], +2 % rule); 1.4.0 [busy] (+2 % rule); // owner 2026-11-03: 7 650; owner step 16: 7 450; owner « clearFilters/resetState » (7 300 at step 12)
  });

  it('the real example 98 800 (+2 % rule at 1.4.0, measured 98 624; 1.3.0: 97 400; 1.2.0: 95 500; before 95 000: owner, decisions.md « Real Angular example line »: measured 94 596)', () => {
    expect(/const K8 = ([\d_]+);/.exec(read('scripts/example.mjs'))?.[1]).toBe('99_500'); // +2 % rule at the Phase 8 close (measured 99 425); Phase 7 close (measured 98 833); 1.4.0 (measured 98 624); before at 1.3.0 (2026-11-02, measured 97 173)
  });

  it('no other line moves: column-menu 4 300, dom 22 400, core 29 150, dom/state 1 150', () => {
    expect(['@dzgrid/dom/column-menu', '@dzgrid/dom', '@dzgrid/core', '@dzgrid/dom/state'].map((n) => b[n]!.maxGzip)).toEqual([4300, 23660, 29300, 1289]); // Phase 9 dock: dom/state 1 289 (+2 %) // Phase 8 step 7: dom/state 1 264 (+2 %) // Phase 8 step 4: dom 23 660, core 29 300 (+2 % rule); dom/state 1 240 at the Phase 7 close (+2 %); Phase 7 step 2: core 29 250 (+2 % rule, the grouping seams); // 1.4.0 busy part: dom 23 250 (+2 % rule); busy bar: dom 23 070 (+2 % rule); // dom/state 1 224 (owner +2 % rule, step 16); 1 200 since « clearFilters/resetState » // 1.4.0: 22 440 → 22 880 (+2 % rule, the row numbers strip)
  });
});
