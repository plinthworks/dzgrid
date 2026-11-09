import { describe, expect, it } from 'vitest';
import { clientRows, createColumnModel, localeCtx, NO_OVERLAY, type ColumnDef, type ValueReader } from '@dzgrid/core';
import { columnTotals } from '@dzgrid/core/totals';

/** docs/behaviors/totals-row.md 1–3 (the rules of aggregation.md 2–7, 15), by hand. Made-up rows: a tea shop's tins. */
type Tin = { id: string; tea: string | null; grams: number | null; price: number | null; packed: string | null; opened: number | null };
const tins: Tin[] = [
  { id: 't1', tea: 'Oolong', grams: 100, price: 0.1, packed: '2026-02-03', opened: Date.UTC(2026, 2, 1) },
  { id: 't2', tea: 'Assam', grams: null, price: 0.1, packed: '2025-11-30', opened: null },
  { id: 't3', tea: 'Darjeeling', grams: 250, price: 0.1, packed: null, opened: Date.UTC(2026, 0, 5) },
];
const ctx = localeCtx({ locale: 'en-GB', timeZone: 'UTC' });

const totalsOf = (defs: ColumnDef<Tin>[], rows = tins, reader: ValueReader<Tin> = NO_OVERLAY as ValueReader<Tin>) => {
  const columns = createColumnModel<Tin>(defs);
  const model = clientRows<Tin>({ rows, getRowId: (t) => t.id, columns, ctx });
  return columnTotals(model.allRows!, columns.visible(), { ctx, reader });
};

describe('columnTotals', () => {
  it('sum (compensated), mean over the numbers present, count of every row, min / max by type, first / last', () => {
    const r = totalsOf([
      { id: 'tea', total: 'count' },
      { id: 'grams', type: 'number', total: 'sum' },
      { id: 'price', type: 'number', total: 'avg' },
      { id: 'packed', type: 'day', total: 'min' },
      { id: 'opened', type: 'instant', total: 'max' },
    ]);
    expect(r.problems).toEqual([]);
    const { price, ...rest } = r.values;
    expect(rest).toEqual({ tea: 3, grams: 350, packed: '2025-11-30', opened: Date.UTC(2026, 2, 1) });
    // The mean is the sum over the count, one division (aggregation.md 7): the float's last bit is the division's.
    expect(price).toBeCloseTo(0.1, 15);
    expect(r.columns).toEqual(['tea', 'grams', 'price', 'packed', 'opened']);
  });

  it('0.1 ten times is 1; text min / max by the language; first / last in the rows’ order', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...tins[0]!, id: `x${i}` }));
    expect(totalsOf([{ id: 'price', type: 'number', total: 'sum' }], many).values).toEqual({ price: 1 });
    expect(totalsOf([{ id: 'tea', total: 'min' }, { id: 'packed', type: 'day', total: 'last' }]).values).toEqual({ tea: 'Assam', packed: '2025-11-30' });
    expect(totalsOf([{ id: 'tea', total: 'max' }, { id: 'grams', type: 'number', total: 'first' }]).values).toEqual({ tea: 'Oolong', grams: 100 });
  });

  it('all empty: nothing (never 0); no column with a total: nothing', () => {
    const r = totalsOf([{ id: 'grams', type: 'number', total: 'sum' }], [tins[1]!]);
    expect(r.values).toEqual({ grams: null });
    expect(totalsOf([{ id: 'tea' }]).columns).toEqual([]);
  });

  it('a total that does not fit, an unknown name, a function that throws: told by column, never a value', () => {
    const r = totalsOf([
      { id: 'tea', total: 'sum' },
      // An unknown total's name, on purpose.
      { id: 'grams', type: 'number', total: 'median' as never },
      { id: 'price', type: 'number', total: () => { throw new Error('Oolong'); } },
    ]);
    expect(r.values).toEqual({ price: null });
    expect(r.problems).toEqual([
      { code: 'agg-type', severity: 'warning', path: 'columns.tea.total', detail: 'sum' },
      { code: 'invalid-setting', severity: 'warning', path: 'columns.grams.total', detail: 'median' },
      { code: 'agg-threw', severity: 'warning', path: 'columns.price.total' },
    ]);
  });

  it('the application’s function gets the typed values (empty ones null) in order and { column, level: null }', () => {
    const seen: unknown[] = [];
    const r = totalsOf([{ id: 'grams', type: 'number', total: (v, c) => (seen.push(v, c), 'heavy') }]);
    expect(seen).toEqual([[100, null, 250], { column: 'grams', level: null }]);
    expect(r.values).toEqual({ grams: 'heavy' });
  });

  it('reads through the edit overlay; skips rows that are not data', () => {
    const reader: ValueReader<Tin> = { version: 1, overlay: true, value: (c, row, id) => (id === 't1' && c.id === 'grams' ? 1000 : c.read(row)) };
    expect(totalsOf([{ id: 'grams', type: 'number', total: 'sum' }], tins, reader).values).toEqual({ grams: 1250 });
  });
});
