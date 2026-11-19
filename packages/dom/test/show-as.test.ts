// `showAs: 'percentOfTotal' | 'percentOfGroup'` with `showAs()` (1.14.0, docs/behaviors/aggregation.md 19–24). Written
// before the code. Data (support-grouping.ts): qty Nord r1 10, r3 2.5, r4 blank; Sud r2 5, r5 7; no region r6 1 —
// total 25.5, Nord 12.5, Sud 12, blank 1. Every share below worked out by hand.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { showAs } from '../src/show-as.js';
import { totalsRow } from '../src/totals-row.js';
import { pinnedRows } from '../src/pinned-rows.js';
import { EN_TOTALS } from '../src/locales/en-totals.js';
import { EN_PINNED } from '../src/locales/en-pinned.js';
import { gmake, cleanup, COLUMNS, BUNDLES, type R } from './support-grouping.js';

afterEach(cleanup);

const cols = (kind: 'percentOfTotal' | 'percentOfGroup', more: Partial<ColumnDef<R, any>> = {}): ColumnDef<R, any>[] => COLUMNS.map((c) => (c.id === 'qty' ? { ...c, showAs: kind, ...more } : c));
const text = (t: ReturnType<typeof gmake>, id: string) => t.cell(id, 'qty')?.textContent ?? null;
/** A group's row by its label (« Nord », « Sud »), as the grouping keys it. */
const group = (t: ReturnType<typeof gmake>, label: string) => {
  const d = t.g.kernel.rows.displayed;
  for (let i = 0; i < d.count; i++) {
    const n = d.nodeAt(i as never); // a display index
    if (n.kind === 'group' && n.path.join('/') === label) return n.key;
  }
  throw new Error(`no group ${label}`);
};

describe('percentOfTotal (aggregation.md 20–22)', () => {
  it('each row over the total of the rows shown, a group over it too; a blank cell shows nothing; one fraction digit', () => {
    const t = gmake({ columns: cols('percentOfTotal'), grouping: { by: ['region'], expanded: 'all' }, features: [showAs()] });
    expect(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((id) => text(t, id))).toEqual(['39.2%', '19.6%', '9.8%', '', '27.5%', '3.9%']);
    expect([text(t, group(t, 'Nord')), text(t, group(t, 'Sud'))]).toEqual(['49.0%', '47.1%']);
    // The value stays the data: the price column (no showAs) untouched.
    expect(t.cell('r1', 'price')!.textContent).toBe('1.5');
    expect(t.problems()).toEqual([]);
  });

  it('a filter changes the total: the rows left add up to 100 % (search « apple »: r1 10, r2 5, r3 2.5 of 17.5)', () => {
    const t = gmake({ columns: cols('percentOfTotal'), grouping: null, features: [showAs()] });
    t.g.kernel.dispatch({ type: 'quick.set', text: 'apple' }, 'user');
    expect(['r1', 'r2', 'r3'].map((id) => text(t, id))).toEqual(['57.1%', '28.6%', '14.3%']);
  });

  it('a number filter compares the value, not the share (qty > 6 keeps r1 and r5; then 10 / 17 and 7 / 17)', () => {
    const t = gmake({ columns: cols('percentOfTotal'), grouping: null, features: [showAs()] });
    t.g.kernel.dispatch({ type: 'filter.column', column: 'qty', filter: { type: 'number', op: 'gt', value: 6 } }, 'user');
    expect(t.shown()).toEqual(['r1', 'r5']);
    expect([text(t, 'r1'), text(t, 'r5')]).toEqual(['58.8%', '41.2%']);
  });

  it('a changed row changes every share at once (r6 1 → 4.5: total 29)', () => {
    const t = gmake({ columns: cols('percentOfTotal'), grouping: null, features: [showAs()] });
    t.g.kernel.rows.applyTransaction({ update: [{ id: 'r6', region: null, fruit: 'fig', qty: 4.5, price: 5, day: '2026-03-06' }] });
    expect([text(t, 'r1'), text(t, 'r6')]).toEqual(['34.5%', '15.5%']);
  });

  it('written in the grid’s language and digits; showAs({ digits: 0 })', () => {
    const fr = gmake({ lang: 'fr', columns: cols('percentOfTotal'), grouping: null, features: [showAs()] });
    expect(text(fr, 'r1')).toBe('39,2\u00a0%');
    const ar = gmake({ lang: 'ar', columns: cols('percentOfTotal'), grouping: null, features: [showAs({ digits: 0 })] });
    // Latin digits (the grid's default numerals) with Arabic's percent pattern: a left-to-right mark after each part.
    expect(text(ar, 'r1')).toBe('39\u200e%\u200e');
    // Isolated left to right in a right-to-left grid, as every number.
    expect(ar.cell('r1', 'qty')!.querySelector('.dzg-num')?.textContent).toBe('39\u200e%\u200e');
  });

  it('the totals row and the grand total footer: 100 %', () => {
    const t = gmake({
      columns: cols('percentOfTotal', { total: 'sum' }), grouping: { by: ['region'], expanded: 'all', footers: 'grand' },
      features: [showAs(), pinnedRows(), totalsRow()],
      settings: { messages: { ...BUNDLES.en, text: { ...BUNDLES.en.text, ...EN_TOTALS.text, ...EN_PINNED.text } } },
    });
    const foot = t.rowEls().find((r) => t.ctx.rowRenderer.keyOf(r)?.startsWith('t:'));
    expect(foot?.querySelector('.dzg-cell[data-col="qty"]')?.textContent).toBe('100.0%');
    // The totals row's cell as the band writes it (as never: the resolved column, typed for unknown rows).
    expect(t.host.querySelector('.dzg-pinned-bottom .dzg-cell[data-col="qty"], [data-band="bottom"] .dzg-cell[data-col="qty"]')?.textContent ?? t.ctx.foot!.cell(t.ctx.foot!.node!, t.ctx.columns.get('qty')! as never)).toBe('100.0%');
  });
});

describe('percentOfGroup (21)', () => {
  it('a row over its group’s sum, a group over the total above it', () => {
    const t = gmake({ columns: cols('percentOfGroup'), grouping: { by: ['region'], expanded: 'all' }, features: [showAs()] });
    expect(['r1', 'r3', 'r2', 'r5', 'r6'].map((id) => text(t, id))).toEqual(['80.0%', '20.0%', '41.7%', '58.3%', '100.0%']);
    expect([text(t, group(t, 'Nord')), text(t, group(t, 'Sud'))]).toEqual(['49.0%', '47.1%']);
  });

  it('two levels: a fruit group over its region’s sum (Nord apple 12.5 of Nord 12.5; Sud fig 7 of 12)', () => {
    const t = gmake({ columns: cols('percentOfGroup'), grouping: { by: ['region', 'fruit'], expanded: 'all' }, features: [showAs()] });
    expect([text(t, group(t, 'Nord/apple')), text(t, group(t, 'Sud/fig')), text(t, 'r5')]).toEqual(['100.0%', '58.3%', '100.0%']);
  });

  it('not grouped: as percentOfTotal', () => {
    const t = gmake({ columns: cols('percentOfGroup'), grouping: null, features: [showAs()] });
    expect(text(t, 'r1')).toBe('39.2%');
  });
});

describe('what reads the share (23)', () => {
  it('the grouping’s cell (what print asks of a group row) and the seam by key (find, the narrow lines) say the share', () => {
    const t = gmake({ columns: cols('percentOfTotal'), grouping: { by: ['region'], expanded: 'all' }, features: [showAs()] });
    const d = t.g.kernel.rows.displayed;
    const qty = t.ctx.columns.get('qty')! as never; // the resolved column, as the grid holds it
    expect(t.ctx.grouped!.cell(d.nodeAt(d.indexOf(group(t, 'Sud')) as never) as never, qty)).toBe('47.1%'); // a group node at its display index
    expect(t.ctx.share!(d.keyAt(d.indexOf(group(t, 'Nord')) as never), qty)).toBe('49.0%'); // its key at its display index
    expect(t.ctx.share!(t.g.kernel.rows.displayed.keyAt(1 as never), qty)).toBe('39.2%'); // r1, first under Nord
    expect(t.ctx.share!(d.keyAt(0 as never), t.ctx.columns.get('price')! as never)).toBe(undefined); // no showAs: the value
  });
});

describe('bad input (19, 24)', () => {
  it('without the feature: the value, one missing-feature warning', () => {
    const t = gmake({ columns: cols('percentOfTotal'), grouping: null });
    expect(text(t, 'r1')).toBe('10');
    expect(t.problems()).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'columns.qty.showAs', detail: 'show-as' }]);
  });

  it('on a text column or an unknown kind: the value, invalid-column once', () => {
    const t = gmake({ columns: COLUMNS.map((c) => (c.id === 'fruit' ? { ...c, showAs: 'percentOfTotal' } : c.id === 'qty' ? { ...c, showAs: 'share' as never } : c)), grouping: null, features: [showAs()] }); // an unknown kind on purpose
    expect([t.cell('r1', 'fruit')!.textContent, text(t, 'r1')]).toEqual(['apple', '10']);
    t.g.api.refresh();
    expect(t.problems()).toEqual([
      { code: 'invalid-column', severity: 'warning', path: 'columns.fruit.showAs', detail: 'percentOfTotal' },
      { code: 'invalid-column', severity: 'warning', path: 'columns.qty.showAs', detail: 'share' },
    ]);
  });
});
