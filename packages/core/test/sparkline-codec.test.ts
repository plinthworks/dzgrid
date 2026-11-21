// `type: 'sparkline'` (1.16.0, docs/behaviors/sparklines.md 2, 11, 12, 13): a list of numbers in time order, read,
// sorted by its last value, written to files as its numbers between spaces. Written before the code; expectations by hand.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, resolveColumns, sparklineCodec, REJECTED, type ColumnDef } from '@dzgrid/core';
import { csvRows, toCsv } from '@dzgrid/core/csv';
import { toXlsx } from '@dzgrid/core/xlsx';
import { joinParts, readXlsx } from '../../../conformance/runner/xlsx-read.js';

const ctx = localeCtx({ locale: 'fr-FR', timeZone: 'UTC' });
const c = sparklineCodec;

describe('the value (sparklines.md 2)', () => {
  it('an array of numbers, a blank point a gap; text of numbers between spaces, ; or ,', () => {
    expect(c.coerce([3, 5, 41, 27], ctx)).toEqual([3, 5, 41, 27]);
    expect(c.coerce([3, null, undefined, '', 2.5], ctx)).toEqual([3, null, null, null, 2.5]);
    expect(c.coerce(' 3 5.5;41,  27 ', ctx)).toEqual([3, 5.5, 41, 27]);
    expect(c.coerce(['4', '-1.5'], ctx)).toEqual([4, -1.5]);
  });

  it('anything else is unreadable: a word, NaN, Infinity, an object, a number alone', () => {
    for (const bad of [['a'], [NaN], [1, Infinity], [{}], 'x y', 7, { 0: 1 }, true]) expect(c.coerce(bad, ctx)).toBeNull();
  });

  it('typed text: the same reading, refused otherwise (13)', () => {
    expect(c.parse('1 2 3', ctx)).toEqual([1, 2, 3]);
    expect(c.parse('un deux', ctx)).toBe(REJECTED);
  });

  it('an empty list is blank', () => {
    expect([c.isEmpty([]), c.isEmpty(null), c.isEmpty([0])]).toEqual([true, true, false]);
  });
});

describe('sorting (11) and equality', () => {
  it('by the last number, a list ending in gaps by its last number', () => {
    expect(c.sortKey([9, 1], ctx)).toBe(1);
    expect(c.sortKey([9, 4, null], ctx)).toBe(4);
    expect(c.compare([100, 2], [1, 3], ctx)).toBeLessThan(0);
    expect(c.equals([1, null, 2], [1, null, 2])).toBe(true);
    expect(c.equals([1, 2], [1, 2, 3])).toBe(false);
  });
});

describe('files (12): the numbers between spaces, a gap an empty place, never words', () => {
  type Row = { id: string; trend: unknown };
  const defs: ColumnDef<Row>[] = [{ id: 'id' }, { id: 'trend', header: 'Trend', type: 'sparkline' }];
  const rows: Row[] = [{ id: 'a', trend: [3, 5.5, 41, 27] }, { id: 'b', trend: [3, null, 41] }, { id: 'c', trend: 'oops' }];
  const columns = createColumnModel<Row>(defs);
  const model = clientRows<Row>({ rows, getRowId: (r) => r.id, columns, ctx });
  const all = csvRows(model, 'all', createKernel<Row>({ rows: model, columns }).selection)!;

  it('a column of type sparkline is accepted', () => {
    expect(resolveColumns(defs).problems).toEqual([]);
    expect(resolveColumns(defs).columns[1]!.codec).toBe(sparklineCodec);
  });

  it('CSV: « 3 5.5 41 27 » with `.` decimals whatever the language; an unreadable value blank', () => {
    expect(toCsv({ rows: all.rows, at: all.at, columns, ctx }, { bom: false })).toBe('id;Trend\r\na;3 5.5 41 27\r\nb;3  41\r\nc;\r\n');
  });

  it('Excel: the same text in the cell', () => {
    const x = readXlsx(joinParts(toXlsx({ rows: all.rows, at: all.at, columns, ctx }).parts));
    expect([x.cells['B2'], x.cells['B3'], x.cells['B4']]).toEqual(['3 5.5 41 27', '3  41', undefined]);
  });
});
