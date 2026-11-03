// The Excel export (docs/behaviors/xlsx-export.md, Phase 9): the same feature as CSV, a second format — the format in
// the request and the events, `exportAll`, the stored fallback, cancel, Excel's limits before `canExport`, the cell
// menu's item. The file read back with node's zlib and a DOM parser (conformance/runner/xlsx-read.ts).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CompressionStream as NodeCompression } from 'node:stream/web';
import { cleanup, flush, xmake } from './support-export.js';
import { csvExport, type CsvExportOptions } from '../src/export.js';
import { readXlsx, unzip } from '../../../conformance/runner/xlsx-read.js';
import { cmake } from './support-context-menu.js';

afterEach(() => {
  cleanup();
  delete (window as { CompressionStream?: unknown }).CompressionStream;
});

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
/** The compression method of each entry, from the central directory. */
const methods = (b: Uint8Array): number[] => {
  const v = Buffer.from(b);
  let end = v.length - 22;
  while (v.readUInt32LE(end) !== 0x06054b50) end--;
  const out: number[] = [];
  for (let i = 0, p = v.readUInt32LE(end + 16); i < v.readUInt16LE(end + 10); i++) {
    out.push(v.readUInt16LE(p + 10));
    p += 46 + v.readUInt16LE(p + 28) + v.readUInt16LE(p + 30) + v.readUInt16LE(p + 32);
  }
  return out;
};

describe('format in the request and the events', () => {
  it('an Excel export: canExport sees format xlsx, the three events carry it, a .xlsx Blob that reads back', async () => {
    const seen: unknown[] = [];
    const t = xmake({ lang: 'fr', options: { xlsx: true, canExport: (r) => (seen.push(r.format), true) } });
    expect(await t.feature.run('displayed', { format: 'xlsx' })).toBe('done');
    expect(seen).toEqual(['xlsx']);
    expect(t.exportEvents().map((e) => [e.type, (e as { format?: string }).format])).toEqual([['exportRequested', 'xlsx'], ['exportFinished', 'xlsx']]);
    const d = t.delivered[0]!;
    expect(d.fileName).toMatch(/^export-\d{4}-\d\d-\d\d-\d{4}\.xlsx$/);
    expect(d.blob!.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const s = readXlsx(await bytes(d.blob!));
    expect(s.sheet).toBe('export');
    expect([s.cells['A1'], s.cells['B1'], s.cells['A2'], s.cells['B2'], s.cells['B31']]).toEqual(['Name', 'N', 'ann0', 0, 29]);
    expect(s.pane).toEqual({ x: 0, y: 1 });
    expect(t.said().at(-1)).toBe('Exporté. 30 lignes');
  });

  it('a refused Excel export carries the format too', async () => {
    const t = xmake({ options: { xlsx: true, canExport: () => false } });
    expect(await t.feature.run('displayed', { format: 'xlsx' })).toBe('refused');
    expect(t.exportEvents().map((e) => (e as { format?: string }).format)).toEqual(['xlsx', 'xlsx']);
  });

  it('a CSV export is unchanged: no format anywhere', async () => {
    let req: object | null = null;
    const t = xmake({ options: { xlsx: true, canExport: (r) => ((req = r), true) } });
    expect(await t.feature.run()).toBe('done');
    expect(req).not.toHaveProperty('format');
    for (const e of t.exportEvents()) expect(e).not.toHaveProperty('format');
    expect(t.delivered[0]!.fileName).toMatch(/\.csv$/);
  });

  it('an Arabic grid gives a right-to-left sheet named after its export text', async () => {
    const t = xmake({ lang: 'ar', settings: { direction: 'rtl' }, options: { xlsx: { freeze: false } } });
    await t.feature.run('displayed', { format: 'xlsx' });
    const s = readXlsx(await bytes(t.delivered[0]!.blob!));
    expect([s.rtl, s.sheet, s.pane]).toEqual([true, 'تصدير', null]);
  });

  it('a file name from the host gets .xlsx, never .csv.xlsx', async () => {
    const t = xmake({ options: { xlsx: true, fileName: () => 'rapport.csv' } });
    await t.feature.run('displayed', { format: 'xlsx' });
    expect(t.delivered[0]!.fileName).toBe('rapport.xlsx');
  });

  it('without the xlsx option: failed, missing-feature at export.xlsx, nothing built', async () => {
    const canExport = vi.fn(() => true);
    const t = xmake({ options: { canExport } });
    expect(await t.feature.run('displayed', { format: 'xlsx' })).toBe('failed');
    expect(t.problems().map((p) => [p.code, p.path])).toEqual([['missing-feature', 'export.xlsx']]);
    expect(canExport).not.toHaveBeenCalled();
    expect(t.delivered).toEqual([]);
    expect(t.feature.xlsx).toBeUndefined();
  });

  it('feature.xlsx.run and bind({ format }) export Excel', async () => {
    const t = xmake({ options: { xlsx: true } });
    expect(await t.feature.xlsx!.run()).toBe('done');
    const b = document.createElement('button');
    t.feature.bind(b, { scope: 'all', format: 'xlsx' });
    b.click();
    await flush();
    await vi.waitFor(() => expect(t.delivered).toHaveLength(2));
    expect(t.delivered.map((d) => d.fileName.slice(-5))).toEqual(['.xlsx', '.xlsx']);
  });
});

describe('server pages', () => {
  it('exportAll receives format xlsx', async () => {
    const exportAll = vi.fn<NonNullable<CsvExportOptions['exportAll']>>(async () => ({ url: 'https://x.test/f.xlsx' }));
    const t = xmake({ mode: 'offset', options: { xlsx: true, exportAll } });
    t.answer(10, { total: 100 });
    await flush();
    expect(await t.feature.run('all', { format: 'xlsx' })).toBe('done');
    expect(exportAll.mock.calls[0]![0].format).toBe('xlsx');
  });
});

describe('compression', () => {
  it('deflated where the browser has CompressionStream', async () => {
    (window as { CompressionStream?: unknown }).CompressionStream = NodeCompression;
    const t = xmake({ options: { xlsx: true } });
    await t.feature.run('displayed', { format: 'xlsx' });
    const b = await bytes(t.delivered[0]!.blob!);
    expect(methods(b)).toEqual([8, 8, 8, 8, 8, 8, 8]);
    expect(unzip(b).size).toBe(7);
  });

  it('stored, readable, when CompressionStream throws', async () => {
    (window as { CompressionStream?: unknown }).CompressionStream = class {
      constructor() {
        throw new TypeError('no');
      }
    };
    const t = xmake({ options: { xlsx: true } });
    expect(await t.feature.run('displayed', { format: 'xlsx' })).toBe('done');
    const b = await bytes(t.delivered[0]!.blob!);
    expect(methods(b)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(readXlsx(b).cells['A31']).toBe('bob29');
  });
});

describe('cancel and limits', () => {
  it('cancel during the build: nothing downloads', async () => {
    const rows = Array.from({ length: 3000 }, (_, i) => ({ id: `r${i}`, name: `x${i}`, n: i }));
    let feature: ReturnType<typeof csvExport> | null = null;
    let n = 0;
    const t = xmake({ rows, options: { xlsx: true, onProgress: (p) => void (p.phase === 'building' && ++n === 2 && feature!.cancel()) } });
    feature = t.feature;
    // Every piece its own slice: the clock moves 20 ms a reading.
    let clock = 0;
    vi.spyOn(t.ctx, 'now').mockImplementation(() => (clock += 20));
    expect(await t.feature.run('displayed', { format: 'xlsx' })).toBe('cancelled');
    expect(t.delivered).toEqual([]);
  });

  it('past 16 384 columns: refused as too large before canExport', async () => {
    const canExport = vi.fn(() => true);
    const t = xmake({ options: { xlsx: true, canExport } });
    expect(await t.feature.run('displayed', { format: 'xlsx', columns: Array(16_385).fill('name') })).toBe('refused');
    expect(canExport).not.toHaveBeenCalled();
    expect(t.exportEvents().at(-1)).toMatchObject({ type: 'exportRefused', refusal: 'too-large', format: 'xlsx' });
    expect(t.delivered).toEqual([]);
  });

  it('16 384 columns pass (CSV keeps no such limit)', async () => {
    const canExport = vi.fn(() => false);
    const t = xmake({ options: { xlsx: true, canExport } });
    await t.feature.run('displayed', { format: 'xlsx', columns: Array(16_384).fill('n') });
    expect(canExport).toHaveBeenCalledTimes(1);
  });
});

describe('the cell menu', () => {
  it('« Exporter en Excel » after the CSV item when use.xlsx is given; it runs the displayed rows', () => {
    const run = vi.fn(async () => 'done');
    const csv = { run: vi.fn(async () => 'done') };
    const t = cmake({ lang: 'fr', menu: (u) => ({ use: { range: u.range, csv, xlsx: { run } } }) });
    t.rclick(t.cell('r2', 'n')!);
    expect(t.entries().slice(-2)).toEqual(['export.csv', 'export.xlsx']);
    expect(t.item('export.xlsx')!.textContent).toBe('Exporter en Excel');
    t.item('export.xlsx')!.click();
    expect(run).toHaveBeenCalledWith('displayed');
  });

  it('no use.xlsx: no item', () => {
    const t = cmake({ menu: (u) => ({ use: { range: u.range, csv: { run: vi.fn(async () => 'done') } } }) });
    t.rclick(t.cell('r2', 'n')!);
    expect(t.entries()).not.toContain('export.xlsx');
  });
});
