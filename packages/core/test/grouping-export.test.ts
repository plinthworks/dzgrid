// Phase 7 step 7: a grouped grid's CSV and Excel files (csv-export.md and xlsx-export.md « Grouped rows »). The
// conformance cases `csv/group-*` and `xlsx/group-*` hold what the files say; this file what they cannot: chunks, the
// outline's limit, health data, the two formats agreeing.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, type ColumnDef } from '@dzgrid/core';
import { csvChunks, csvRows, toCsv } from '@dzgrid/core/csv';
import { checkRowGroups, groupShape } from '@dzgrid/core/grouping';
import { toXlsx } from '@dzgrid/core/xlsx';
import { joinParts, readXlsx } from '../../../conformance/runner/xlsx-read.js';

type Row = Record<string, unknown> & { id: string };
const ctx = localeCtx({ locale: 'en-US', timeZone: 'UTC' });

function grid(defs: ColumnDef<Row>[], rows: Row[], by: string[], o: { footers?: 'both' } = {}) {
  const columns = createColumnModel<Row>(defs);
  const shape = groupShape<Row>({ by, ...o });
  const model = clientRows<Row>({ rows, getRowId: (r) => r.id, columns, ctx, shape });
  const kernel = createKernel<Row>({ rows: model, columns });
  const all = csvRows(model, 'all', kernel.selection)!;
  return { columns, model, all };
}

describe('grouped files', () => {
  it('chunks of one row join to the whole file, group and totals lines included', () => {
    const { columns, all } = grid([{ id: 'g' }, { id: 'n', type: 'number', aggFunc: 'sum' }], [
      { id: 'a', g: 'x', n: 1 }, { id: 'b', g: 'y', n: 2 }, { id: 'c', g: 'x', n: 3 },
    ], ['g'], { footers: 'both' });
    const parts = [...csvChunks({ rows: all.rows, at: all.at, columns, ctx }, { bom: false, chunkRows: 1 })];
    // x, a, c, Σx, y, b, Σy, Σ: eight lines, one per chunk, the header in the first.
    expect(parts).toHaveLength(8);
    expect(parts.join('')).toBe(toCsv({ rows: all.rows, at: all.at, columns, ctx }, { bom: false }));
    expect(parts.join('')).toBe('Level,g,n\r\n1,x,4\r\n2,x,1\r\n2,x,3\r\n2,x,4\r\n1,y,2\r\n2,y,2\r\n2,y,2\r\n1,,6\r\n');
  });

  it('eight grouping levels: Excel stops at seven and tells how many rows are deeper, never a value', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const row: Row = { id: 'r', ...Object.fromEntries(ids.map((k) => [k, `SECRET-${k}`])) };
    const { columns, all } = grid(ids.map((id) => ({ id })), [row], ids);
    const { parts, summary } = toXlsx({ rows: all.rows, at: all.at, columns, ctx });
    const read = readXlsx(joinParts(parts));
    // Levels 0…7 for the groups, 8 for the row: the group at 7 sits at 7, the row past it too (counted).
    expect(read.outline['9']).toBe(7);
    expect(read.outline['10']).toBe(7);
    expect(summary.problems.map((p) => [p.code, p.path, p.detail])).toEqual([['xlsx-outline-depth', 'xlsx.tree', '1']]);
    expect(JSON.stringify(summary.problems)).not.toContain('SECRET');
  });

  it('the CSV and the Excel file hold the same lines and totals', () => {
    const defs: ColumnDef<Row>[] = [{ id: 'g' }, { id: 'h', type: 'number' }, { id: 'n', type: 'number', aggFunc: 'avg' }, { id: 'c', aggFunc: 'count' }];
    const rows: Row[] = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, g: `G${i % 3}`, h: i % 2, n: i % 5 ? i / 4 : null, c: `t${i}` }));
    const { columns, all } = grid(defs, rows, ['g', 'h'], { footers: 'both' });
    const csv = toCsv({ rows: all.rows, at: all.at, columns, ctx }, { bom: false, tree: 'level', numbers: 'raw' }).trim().split('\r\n').map((l) => l.split(','));
    const x = readXlsx(joinParts(toXlsx({ rows: all.rows, at: all.at, columns, ctx }, { tree: 'level' }).parts));
    const cols = ['A', 'B', 'C', 'D', 'E'];
    csv.forEach((line, r) => line.forEach((f, j) => {
      const v = x.cells[`${cols[j]}${r + 1}`];
      expect(v === undefined ? '' : String(v), `${cols[j]}${r + 1}`).toBe(f);
    }));
  });

  it('review 5: a total Excel cannot write (a sum past the largest number) is no cell and not counted invalid', () => {
    const { columns, all } = grid([{ id: 'g' }, { id: 'n', type: 'number', aggFunc: 'sum' }], [{ id: 'a', g: 'x', n: 1e308 }, { id: 'b', g: 'x', n: 1e308 }], ['g']);
    const { summary } = toXlsx({ rows: all.rows, at: [0] as never, columns, ctx }); // the group row alone (a display index list)
    expect([summary.rows, summary.invalid]).toEqual([1, 0]);
  });

  it('review 6: the rows a displayed export holds count the grand total', () => {
    const { model } = grid([{ id: 'g' }, { id: 'n', type: 'number', aggFunc: 'sum' }], [{ id: 'a', g: 'x', n: 1 }], ['g'], { footers: 'both' });
    // The group (closed) and the grand total.
    expect(csvRows(model, 'displayed', { mode: 'include', keys: new Set() })!.count).toBe(2);
  });

  it('checkRowGroups never echoes anything but an unknown id', () => {
    const columns = createColumnModel<Row>([{ id: 'g' }, { id: 'n', groupable: false }]);
    const r = checkRowGroups([{ name: 'SECRET' }, 'g', 'n', 'g', 'zz'], columns);
    expect(r.by).toEqual(['g']);
    expect(r.problems.map((p) => [p.code, p.path, p.detail])).toEqual([
      ['state-field', 'rowGroups.0', undefined], ['state-field', 'rowGroups.2', undefined], ['state-field', 'rowGroups.3', undefined], ['state-column', 'rowGroups.4', 'zz'],
    ]);
  });
});
