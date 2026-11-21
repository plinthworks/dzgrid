// Master / detail in the Excel file (1.16.0, docs/behaviors/xlsx-export.md 12–19): each chosen master's detail rows
// under it, one column in, one outline level down, a header row per block, the filter on the master's header only.
// Written before the code; every cell below worked out by hand. Made-up data: two shops and their deliveries.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, type ColumnDef, type RowKey } from '@dzgrid/core';
import { csvRows, toCsv } from '@dzgrid/core/csv';
import { toXlsx, type XlsxOptions } from '@dzgrid/core/xlsx';
import { xlsxDetails } from '@dzgrid/core/xlsx-detail';
import { joinParts, readXlsx } from '../../../conformance/runner/xlsx-read.js';

type Shop = { id: string; name: string; sales: number };
type Delivery = { ref: string; day: string; qty: number };
const ctx = localeCtx({ locale: 'en-GB', timeZone: 'UTC' });
const SHOPS: Shop[] = [{ id: 's1', name: 'Oakfield', sales: 300 }, { id: 's2', name: 'Riverside', sales: 100 }, { id: 's3', name: 'Hillcrest', sales: 50 }];
const DELIVERIES: Record<string, Delivery[]> = {
  s1: [{ ref: 'D-1', day: '2026-03-02', qty: 4 }, { ref: 'D-2', day: '2026-03-05', qty: 1.5 }],
  s2: [{ ref: 'D-3', day: '2026-03-01', qty: 7 }],
  s3: [],
};
const DETAIL: ColumnDef<Delivery>[] = [{ id: 'ref', header: 'Ref' }, { id: 'day', header: 'Day', type: 'day' }, { id: 'qty', header: 'Qty', type: 'number' }];

function file(o: Partial<XlsxOptions<Shop>> = {}, open: string[] = ['s1', 's2']) {
  const columns = createColumnModel<Shop>([{ id: 'name', header: 'Shop' }, { id: 'sales', header: 'Sales', type: 'number' }]);
  const model = clientRows<Shop>({ rows: SHOPS, getRowId: (r) => r.id, columns, ctx });
  const all = csvRows(model, 'all', createKernel<Shop>({ rows: model, columns }).selection)!;
  const keys = new Set(open.map((id) => dataKey(id)!));
  const input = { rows: all.rows, at: all.at, columns, ctx, expanded: (k: RowKey) => keys.has(k), details: xlsxDetails };
  const { parts, summary } = toXlsx(input, { detailRows: (s) => DELIVERIES[s.id], detailColumns: DETAIL, ...o });
  return { x: readXlsx(joinParts(parts)), summary, csv: toCsv(input, { bom: false }) };
}

describe('detail: expanded (12–13)', () => {
  it('each open master, then its header row one column in, then its rows; typed cells', () => {
    const { x, summary } = file({ detail: 'expanded' }, ['s1']);
    // Row 1 the header; 2 Oakfield; 3 the detail header (B, C, D); 4–5 its rows; 6 Riverside (closed); 7 Hillcrest.
    expect([x.cells['A1'], x.cells['B1'], x.cells['A2'], x.cells['B2']]).toEqual(['Shop', 'Sales', 'Oakfield', 300]);
    expect([x.cells['A3'], x.cells['B3'], x.cells['C3'], x.cells['D3']]).toEqual([undefined, 'Ref', 'Day', 'Qty']);
    // 2026-03-02 is serial 46083 (25569 + 20514 days).
    expect([x.cells['B4'], x.cells['C4'], x.cells['D4'], x.cells['B5'], x.cells['D5']]).toEqual(['D-1', 46083, 4, 'D-2', 1.5]);
    expect([x.cells['A6'], x.cells['A7']]).toEqual(['Riverside', 'Hillcrest']);
    expect(summary).toMatchObject({ rows: 3, details: 2 });
  });

  it('the block one outline level under its master, open; the masters at none; summary above', () => {
    const { x } = file({ detail: 'expanded' }, ['s1']);
    expect(x.outline).toEqual({ 3: 1, 4: 1, 5: 1 });
    expect(x.summaryBelow).toBe(false);
  });

  it('the detail header bold like the master’s; the filter on the master’s header only, over every row', () => {
    const { x } = file({ detail: 'expanded' }, ['s1']);
    expect(x.bold).toEqual(expect.arrayContaining(['A1', 'B1', 'B3', 'C3', 'D3']));
    expect(x.filter).toBe('A1:B7');
  });
});

describe('detail: all, none, empty (12, 13)', () => {
  it('all: every master with rows, open or not; an empty list writes no block', () => {
    const { x, summary } = file({ detail: 'all' }, []);
    // 2 Oakfield, 3 header, 4–5; 6 Riverside, 7 header, 8 D-3; 9 Hillcrest (no deliveries: no block).
    expect([x.cells['A6'], x.cells['B7'], x.cells['B8'], x.cells['A9'], x.cells['B10']]).toEqual(['Riverside', 'Ref', 'D-3', 'Hillcrest', undefined]);
    expect(summary).toMatchObject({ rows: 3, details: 3 });
  });

  it('absent or false: the file as before, no outline', () => {
    for (const d of [undefined, false] as const) {
      const { x, summary } = file({ detail: d }, ['s1']);
      expect([x.cells['A3'], x.cells['A4'], x.outline, x.summaryBelow]).toEqual(['Riverside', 'Hillcrest', {}, null]);
      expect([summary.rows, summary.details]).toEqual([3, undefined]);
    }
  });

  it('CSV unchanged: the masters only (18)', () => {
    expect(file({ detail: 'all' }).csv).toBe('Shop,Sales\r\nOakfield,300\r\nRiverside,100\r\nHillcrest,50\r\n');
  });
});

describe('problems (19): never a value', () => {
  it('detail asked without the blocks’ writer (`details`): the masters alone, told', () => {
    const columns = createColumnModel<Shop>([{ id: 'name' }]);
    const model = clientRows<Shop>({ rows: SHOPS, getRowId: (r) => r.id, columns, ctx });
    const { summary } = toXlsx({ rows: model.displayed, columns, ctx }, { detail: 'all', detailRows: (s) => DELIVERIES[s.id], detailColumns: DETAIL });
    expect([summary.rows, summary.details, summary.problems.map((p) => `${p.code}@${p.path}`)]).toEqual([3, 0, ['missing-feature@xlsx.detail']]);
  });

  it('a detailRows that throws or answers a promise: told once, that master without a block', () => {
    const { x, summary } = file({ detail: 'all', detailRows: (s) => (s.id === 's1' ? (() => { throw new Error('SECRET'); })() : (Promise.resolve([]) as never)) }); // never: a promise where a list is due, as a careless caller would give
    expect([x.cells['A3'], x.cells['A4']]).toEqual(['Riverside', 'Hillcrest']);
    expect(summary.problems.map((p) => `${p.code}@${p.path}`)).toEqual(['invalid-setting@xlsx.detailRows']);
    expect(JSON.stringify(summary.problems)).not.toMatch(/SECRET|Oakfield/);
  });

  it('a detail column refused: told at its place, the others written', () => {
    const { x, summary } = file({ detail: 'expanded', detailColumns: [{ id: 'ref', header: 'Ref' }, { id: 'qty', type: 'nope' as never }] }, ['s2']); // never: a type that does not exist
    // 2 Oakfield, 3 Riverside (open), 4 its detail header, 5 D-3; the refused column not written.
    expect([x.cells['B4'], x.cells['B5'], x.cells['C4']]).toEqual(['Ref', 'D-3', undefined]);
    expect(summary.problems.map((p) => `${p.code}@${p.path}`)).toEqual(['invalid-column@xlsx.detailColumns[1].type']);
  });
});
