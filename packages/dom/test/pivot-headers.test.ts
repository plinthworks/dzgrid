// The pivot's follow-up (owner 2026-11-07): readable created headers, the switch placed by the application, created bands
// that fold, the reversed order (pivot.md 33–35, 38). Expectations by hand from the sheet and support-pivot.ts.
import { describe, it, expect, afterEach } from 'vitest';
import { groups } from '../src/groups.js';
import { gridState } from '../src/state.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';
import type { ColumnDef } from '@dzgrid/core';
import { cleanup } from './support-grouping.js';
import { band, FEB, JAN, made, PIVOT_BUNDLES, pmake, SALES, SALE_COLUMNS, type S } from './support-pivot.js';

afterEach(cleanup);

/** The amount with a unit in its header and a short name without it (rows of any type: pmake is typed for the grouping fixture's). */
const COLS: ColumnDef<any, any>[] = SALE_COLUMNS.map((c) => (c.id === 'amount' ? { ...c, header: 'Amount (DA)', headerShort: 'Amount' } : c));
const two = { columns: ['month'], values: { amount: 'sum', qty: 'sum' } } as const;
const FEB_QTY = made([['month', 'tFeb']], 'qty');
const def = (t: ReturnType<typeof pmake>, id: string) => t.ctx.columns.get(id)!.def;

describe('readable created headers (pivot.md 38)', () => {
  it('several values: « sum(Amount) » under each crossing and under « Total », the short name; the full chain as tooltip; a width that fits', () => {
    const t = pmake({ columns: COLS, pivot: two });
    const feb = def(t, made([['month', 'tFeb']], 'amount'));
    expect([feb.header, feb.headerTooltip, feb.width]).toEqual(['sum(Amount)', 'Feb › sum(Amount (DA))', 163]);
    expect([def(t, FEB_QTY).header, def(t, FEB_QTY).width]).toEqual(['sum(Qty)', 136]);
    expect([def(t, 'amount').header, def(t, 'amount').headerTooltip]).toEqual(['sum(Amount)', 'Total › sum(Amount (DA))']);
    expect(t.host.querySelector(`.dzg-hcell[data-col="${FEB_QTY}"]`)!.textContent).toContain('sum(Qty)');
  });

  it('one value: the crossing\'s label, at least 120 px; « Total » over the short name; the tooltip still names the value', () => {
    const t = pmake({ columns: COLS, pivot: { columns: ['month'], values: { amount: 'sum' } } });
    expect([def(t, FEB).header, def(t, FEB).width, def(t, FEB).headerTooltip]).toEqual(['Feb', 120, 'Feb › sum(Amount (DA))']);
    expect(def(t, 'amount').header).toBe('Amount');
  });

  it('valueHeaders: « fn » always the function form, « name » the short name only; a width given is kept', () => {
    const a = pmake({ columns: COLS, pivot: { columns: ['month'], values: { amount: 'sum' }, valueHeaders: 'fn' } });
    expect(def(a, 'amount').header).toBe('sum(Amount)');
    cleanup();
    const b = pmake({ columns: COLS, pivot: { ...two, valueHeaders: 'name', width: 90 } });
    expect([def(b, made([['month', 'tFeb']], 'amount')).header, def(b, FEB_QTY).header, def(b, FEB_QTY).width, def(b, 'qty').header]).toEqual(['Amount', 'Qty', 90, 'Qty']);
  });

  it('a function changed: the headers follow; pivot off: the application\'s headers back', () => {
    const t = pmake({ columns: COLS, pivot: two });
    t.papi().setValues({ amount: 'avg', qty: 'sum' });
    expect(def(t, made([['month', 'tFeb']], 'amount')).header).toBe('average(Amount)');
    t.papi().setOn(false);
    expect(def(t, 'amount').header).toBe('Amount (DA)');
  });

  it('French: « somme(Montant) », the function\'s name in lower case', () => {
    const fr: ColumnDef<any, any>[] = COLS.map((c) => (c.id === 'amount' ? { ...c, header: 'Montant (DA)', headerShort: 'Montant' } : c));
    const t = pmake({ lang: 'fr', columns: fr, pivot: two, settings: { locale: 'fr-FR' } });
    expect(def(t, made([['month', 'tFeb']], 'amount')).header).toBe('somme(Montant)');
  });
});

describe('the switch (pivot.md 35)', () => {
  it('an element: the switch goes in it, a real switch; the strip in the grid stays hidden; destroyed with the grid', () => {
    const box = document.body.appendChild(document.createElement('div'));
    const t = pmake({ pivot: { columns: ['month'], values: { amount: 'sum' }, toggle: box } });
    const sw = box.querySelector<HTMLButtonElement>('button[role=switch]')!;
    expect([sw.getAttribute('aria-checked'), sw.textContent, sw.type]).toEqual(['true', 'Pivot table', 'button']);
    expect(t.host.querySelector<HTMLElement>('.dzg-pbar')!.hidden).toBe(true);
    sw.click();
    expect([t.papi().on(), sw.getAttribute('aria-checked')]).toEqual([false, 'false']);
    t.g.destroy();
    expect(box.querySelector('[role=switch]')).toBeNull();
  });

  it('« inside »: in the pivot\'s strip, as `true`', () => {
    const t = pmake({ pivot: { columns: ['month'], values: { amount: 'sum' }, toggle: 'inside' } });
    const bar = t.host.querySelector<HTMLElement>('.dzg-pbar')!;
    expect([bar.hidden, bar.querySelector('[role=switch]')?.getAttribute('aria-checked')]).toEqual([false, 'true']);
  });
});

describe('created bands fold, with groups() (pivot.md 34)', () => {
  const messages = { ...PIVOT_BUNDLES.en, text: { ...PIVOT_BUNDLES.en.text, ...EN_COLUMNS.text } };
  it('each crossing band has its toggle, open; folded it keeps its first value; « Total » never folds; never saved', () => {
    const folds = groups();
    const st = gridState();
    const t = pmake({ before: [folds], features: [st], settings: { messages }, pivot: two });
    const feb = band([['month', 'tFeb']]);
    const head = t.host.querySelector<HTMLElement>(`.dzg-hgroup[data-g="${feb}"]`)!;
    expect(head.querySelector('.dzg-gtoggle')!.getAttribute('aria-expanded')).toBe('true');
    expect(t.host.querySelector('.dzg-hgroup[data-g="~b:total"] .dzg-gtoggle')).toBeNull();
    expect(folds.api(t.g)!.toggle(feb, false)).toBe(true);
    expect(t.visible()).not.toContain(FEB_QTY);
    expect(t.visible()).toContain(made([['month', 'tFeb']], 'amount'));
    expect(t.host.querySelector(`.dzg-hgroup[data-g="${feb}"] .dzg-gtoggle`)!.getAttribute('aria-expanded')).toBe('false');
    expect(JSON.stringify(st.api(t.g)!.state())).not.toMatch(/~[pbt]/);
    // A new month keeps the fold of the others (by id).
    t.g.update({ rows: [...SALES, { id: 'r9', title: 'Zinc', region: 'Nord', month: 'Mar', amount: 1, qty: 1, sold: '2026-03-01', code: 'x' }] });
    expect(t.visible()).not.toContain(FEB_QTY);
    expect(t.visible()).toContain(made([['month', 'tMar']], 'qty'));
  });
});

describe('the reversed order through the api (pivot.md 33)', () => {
  it('setDesc reverses a pivot column\'s created columns; desc() reads it; name() is the short name', () => {
    const t = pmake({ columns: COLS });
    t.papi().setDesc(['month']);
    expect([t.papi().desc(), t.visible()]).toEqual([['month'], ['~p:rows', JAN, FEB, 'amount']]);
    expect([t.papi().name('amount'), t.papi().name('region')]).toEqual(['Amount', 'Region']);
  });
});
