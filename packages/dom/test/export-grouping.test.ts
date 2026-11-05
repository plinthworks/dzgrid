// Phase 7 step 7: the export of a grouped grid (csv-export.md and xlsx-export.md « Grouped rows »): the screen's labels
// (« Nord (3) », « Total »), the grouping's label column and totals, the outline; grouped by no column, no level column.
import { describe, it, expect, afterEach } from 'vitest';
import { csvExport } from '../src/export.js';
import { EN } from '../src/locales/en.js';
import { EN_GROUP } from '../src/locales/en-group.js';
import { EN_EXPORT } from '../src/locales/en-export.js';
import { readXlsx } from '../../../conformance/runner/xlsx-read.js';
import { cleanup, gmake } from './support-grouping.js';
import type { GroupingFeatureOptions } from '../src/grouping.js';

afterEach(cleanup);

const messages = { locale: EN.locale, text: { ...EN.text, ...EN_GROUP.text, ...EN_EXPORT.text } };

function exporting(grouping: GroupingFeatureOptions) {
  const files: { blob?: Blob; fileName: string }[] = [];
  const exp = csvExport({ canExport: true, xlsx: true, bom: false, deliver: (f) => void files.push(f), loadRun: () => import('../src/export/run/index.js') });
  const t = gmake({ grouping, features: [exp], settings: { messages } });
  return { ...t, exp, files };
}

describe('a grouped grid exported', () => {
  it('CSV of the rows shown: the screen\'s labels in the label column, totals under their columns, a level column', async () => {
    const t = exporting({ by: ['region'], footers: 'grand' });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [t.keyAt(0)], expanded: true }, 'user');
    expect(t.shown()).toEqual(['[Nord]', 'r1', 'r3', 'r4', '[Sud]', '[]', 'Σ']);
    expect(await t.exp.run('displayed')).toBe('done');
    expect(await t.files[0]!.blob!.text()).toBe([
      'Level,Shop,Region,Fruit,Qty,Price,Day',
      '1,Nord (3),,,12.5,,',
      '2,Shop 1,Nord,apple,10,1.5,2026-03-02',
      '2,Shop 3,Nord,apple,2.5,1,2026-03-05',
      '2,Shop 4,Nord,pear,,3,2026-03-04',
      '1,Sud (2),,,12,,',
      '1,(Blank) (1),,,1,,',
      '1,Total,,,25.5,,',
      '',
    ].join('\r\n'));
  });

  it('the application\'s label column, and its own totals: a count a plain number under a text column', async () => {
    const t = exporting({ by: ['region'], column: 'fruit', aggFuncs: { price: 'count' } });
    expect(await t.exp.run('displayed')).toBe('done');
    const lines = (await t.files[0]!.blob!.text()).split('\r\n');
    expect(lines.slice(0, 2)).toEqual(['Level,Shop,Region,Fruit,Qty,Price,Day', '1,,,Nord (3),12.5,3,']);
  });

  it('Excel, every group: labels as text, the outline, totals as numbers', async () => {
    const t = exporting({ by: ['region'], footers: 'both' });
    expect(await t.exp.run('all', { format: 'xlsx' })).toBe('done');
    const s = readXlsx(new Uint8Array(await t.files[0]!.blob!.arrayBuffer()));
    expect([s.cells['A2'], s.cells['D2'], s.cells['A3'], s.cells['A6'], s.cells['D6']]).toEqual(['Nord (3)', 12.5, 'Shop 1', 'Total Nord', 12.5]);
    expect(s.outline['2']).toBeUndefined();
    expect([s.outline['3'], s.outline['6']]).toEqual([1, 1]);
    expect(s.summaryBelow).toBe(false);
    // The grand total last, at the top level, with the sum of every row.
    const last = Object.keys(s.cells).filter((r) => r.startsWith('A')).map((r) => +r.slice(1)).sort((a, b) => b - a)[0]!;
    expect([s.cells[`A${last}`], s.cells[`D${last}`], s.outline[String(last)]]).toEqual(['Total', 25.5, undefined]);
  });

  it('grouped by no column, a grand total only: the rows then « Total », no level column', async () => {
    const t = exporting({ by: [], footers: 'grand' });
    expect(await t.exp.run('displayed')).toBe('done');
    const lines = (await t.files[0]!.blob!.text()).split('\r\n');
    expect(lines[0]).toBe('Shop,Region,Fruit,Qty,Price,Day');
    expect(lines.at(-2)).toBe('Total,,,25.5,,');
  });

  it('groupRows: false gives the data rows only, flat', async () => {
    const files: { blob?: Blob }[] = [];
    const exp = csvExport({ canExport: true, bom: false, groupRows: false, deliver: (f) => void files.push(f), loadRun: () => import('../src/export/run/index.js') });
    const t = gmake({ grouping: { by: ['region'], expanded: 'all', footers: 'both' }, features: [exp], settings: { messages } });
    expect(t.shown().length).toBeGreaterThan(6);
    expect(await exp.run('displayed')).toBe('done');
    const lines = (await files[0]!.blob!.text()).trim().split('\r\n');
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe('Shop,Region,Fruit,Qty,Price,Day');
  });
});
