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
    expect(b['profile: audit screen (K.8)']!.maxGzip).toBe(84800);
    expect(b['@dzgrid/angular']!.maxGzip).toBe(7300);
  });

  it('the real example 95 000 (owner, decisions.md « Real Angular example line »: measured 94 596)', () => {
    expect(/const K8 = ([\d_]+);/.exec(read('scripts/example.mjs'))?.[1]).toBe('95_000');
  });

  it('no other line moves: column-menu 4 300, dom 22 400, core 29 150, dom/state 1 150', () => {
    expect(['@dzgrid/dom/column-menu', '@dzgrid/dom', '@dzgrid/core', '@dzgrid/dom/state'].map((n) => b[n]!.maxGzip)).toEqual([4300, 22400, 29150, 1150]);
  });
});
