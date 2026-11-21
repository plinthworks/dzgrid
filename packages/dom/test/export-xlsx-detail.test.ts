// Master / detail in the Excel export (1.16.0, docs/behaviors/xlsx-export.md 12–18): `csvExport({ xlsx: { detail } })`
// beside `detail()` — a `nestedGrid`'s rows and columns by default, the application's `detailRows` (a promise: awaited,
// progress, cancel, a rejection fails), CSV unchanged. Written before the code; made-up data, expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef } from '@dzgrid/core';
import { cleanup, flush, xmake, BUNDLES, type R } from './support-export.js';
import { detail, nestedGrid } from '../src/detail.js';
import { csvExport, type CsvExportOptions, type ExportProgress } from '../src/export.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { readXlsx } from '../../../conformance/runner/xlsx-read.js';

afterEach(cleanup);

type V = { v: string; qty: number };
const ROWS: R[] = [{ id: 'r0', name: 'ann0', n: 0 }, { id: 'r1', name: 'bob1', n: 1 }, { id: 'r2', name: 'bob2', n: 2 }];
const VISITS: Record<string, V[]> = { r0: [{ v: 'v-a', qty: 4 }, { v: 'v-b', qty: 2 }], r1: [{ v: 'v-c', qty: 7 }], r2: [] };
const VCOLS: ColumnDef<V>[] = [{ id: 'v', header: 'Visit' }, { id: 'qty', header: 'Qty', type: 'number' }, { id: 'hidden', header: 'Hidden', hidden: true }];
const messages = { ...BUNDLES.en, text: { ...BUNDLES.en.text, ...EN_DETAIL.text } };
const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

function make(xlsx: CsvExportOptions['xlsx'], o: { onProgress?: (p: ExportProgress) => void; open?: string[] } = {}) {
  const part = nestedGrid<V>({ settings: (c) => ({ rows: VISITS[(c.row as R).id]!, getRowId: (v) => v.v, columns: VCOLS, messages: BUNDLES.en }) });
  const delivered: { blob?: Blob }[] = [];
  const feature = csvExport({ canExport: true, deliver: (d) => void delivered.push(d), loadRun: () => import('../src/export/run/index.js'), xlsx, ...(o.onProgress && { onProgress: o.onProgress }) } as CsvExportOptions);
  const t = xmake({ rows: ROWS, features: [detail({ part, height: 120 }), feature], settings: { messages } });
  for (const id of o.open ?? ['r0']) t.g.kernel.dispatch({ type: 'rows.expand', rows: [dataKey(id)!], expanded: true }, 'api');
  const sheet = async () => readXlsx(await bytes(delivered.at(-1)!.blob!));
  return { ...t, feature, delivered, sheet };
}

describe('a nestedGrid detail (12–14)', () => {
  it("expanded: the open master's visits under it, one column in, from its settings' rows and visible columns", async () => {
    const t = make({ detail: 'expanded' });
    expect(await t.feature.run('displayed', { format: 'xlsx' })).toBe('done');
    const s = await t.sheet();
    // 1 header; 2 ann0; 3 the detail header (B, C; the hidden column left out); 4–5 its visits; 6 bob1 (closed); 7 bob2.
    expect([s.cells['A2'], s.cells['B3'], s.cells['C3'], s.cells['D3'], s.cells['B4'], s.cells['C4'], s.cells['C5'], s.cells['A6'], s.cells['A7']])
      .toEqual(['ann0', 'Visit', 'Qty', undefined, 'v-a', 4, 2, 'bob1', 'bob2']);
    expect(s.outline).toEqual({ 3: 1, 4: 1, 5: 1 });
    expect(t.problems()).toEqual([]);
  });

  it('all: every master with visits, open or not', async () => {
    const t = make({ detail: 'all' }, { open: [] });
    await t.feature.run('displayed', { format: 'xlsx' });
    const s = await t.sheet();
    // 2 ann0, 3 header, 4–5; 6 bob1, 7 header, 8 v-c; 9 bob2 (no visits: no block).
    expect([s.cells['A6'], s.cells['B8'], s.cells['A9']]).toEqual(['bob1', 'v-c', 'bob2']);
  });

  it('CSV unchanged: the masters only (18)', async () => {
    const t = make({ detail: 'all' });
    await t.feature.run('displayed');
    expect(await t.delivered[0]!.blob!.text()).toBe('Name,N\r\nann0,0\r\nbob1,1\r\nbob2,2\r\n');
  });
});

describe("the application's rows (14)", () => {
  it('detailRows and detailColumns win; a promise awaited, the masters counted in « preparing », the signal given', async () => {
    const seen: string[] = [];
    const progress: string[] = [];
    let signal: unknown;
    const t = make({
      detail: 'all', detailColumns: [{ id: 'code', header: 'Code' }],
      detailRows: async (m, c) => ((signal = c.signal), seen.push(`${(m as R).id}:${String(c.key)}`), (m as R).id === 'r1' ? [{ code: 'X1' }, { code: 'X2' }] : null),
    }, { onProgress: (p) => void (p.phase === 'preparing' && progress.push(`${p.rows}/${p.total}`)) });
    expect(await t.feature.run('displayed', { format: 'xlsx' })).toBe('done');
    expect(seen).toEqual([`r0:${dataKey('r0')}`, `r1:${dataKey('r1')}`, `r2:${dataKey('r2')}`]);
    expect(signal).toBeInstanceOf(AbortSignal);
    // The rows settled first (0 of an unknown total), then the masters one by one.
    expect(progress).toEqual(['0/null', '0/3', '1/3', '2/3', '3/3']);
    const s = await t.sheet();
    // 2 ann0, 3 bob1, 4 Code, 5 X1, 6 X2, 7 bob2.
    expect([s.cells['A3'], s.cells['B4'], s.cells['B5'], s.cells['B6'], s.cells['A7']]).toEqual(['bob1', 'Code', 'X1', 'X2', 'bob2']);
  });

  it('detailRows without detailColumns and no nestedGrid (an Angular detail): told, the masters alone', async () => {
    const delivered: { blob?: Blob }[] = [];
    const feature = csvExport({ canExport: true, deliver: (d) => void delivered.push(d), loadRun: () => import('../src/export/run/index.js'), xlsx: { detail: 'all', detailRows: () => [{ code: 'X' }] } } as CsvExportOptions);
    const t = xmake({ rows: ROWS, features: [feature] });
    expect(await feature.run('displayed', { format: 'xlsx' })).toBe('done');
    expect(t.problems().map((p) => `${p.code}@${p.path}`)).toEqual(['invalid-setting@xlsx.detailColumns']);
    const s = readXlsx(await bytes(delivered[0]!.blob!));
    expect([s.cells['A3'], s.cells['A4']]).toEqual(['bob1', 'bob2']);
  });

  it('a rejection fails the export: nothing downloads', async () => {
    const t = make({ detail: 'all', detailRows: async () => { throw new Error('down'); } });
    expect(await t.feature.run('displayed', { format: 'xlsx' })).toBe('failed');
    expect(t.delivered).toEqual([]);
  });

  it('cancel while a detail loads: its signal aborted, cancelled, nothing downloads', async () => {
    let aborted = false;
    const t = make({ detail: 'all', detailRows: (_m, c) => new Promise(() => void (c.signal as AbortSignal).addEventListener('abort', () => (aborted = true))) });
    const run = t.feature.run('displayed', { format: 'xlsx' });
    await flush();
    t.feature.cancel();
    expect(await run).toBe('cancelled');
    expect([aborted, t.delivered.length]).toEqual([true, 0]);
  });
});
