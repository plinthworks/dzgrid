// The PDF export (1.17.0, docs/behaviors/pdf-export.md): the same feature as CSV and Excel, a fourth format — the format
// in the request and the events, the file read back (core/test/support/pdf-read.ts), the option missing, Arabic refused,
// the title function, compression, cancel, the cell menu's item. Expectations written by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { CompressionStream as NodeCompression } from 'node:stream/web';
import { cleanup, flush, xmake } from './support-export.js';
import { cmake, cleanup as ccleanup, CMSG } from './support-context-menu.js';
import { readPdf, texts } from '../../core/test/support/pdf-read.js';
import { FR_PDF } from '../src/locales/fr-pdf.js';

afterEach(() => {
  cleanup();
  ccleanup();
  delete (window as { CompressionStream?: unknown }).CompressionStream;
});

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

describe('a PDF export', () => {
  it('canExport sees format pdf, the events carry it, a .pdf Blob whose pages hold the header and the rows', async () => {
    const seen: unknown[] = [];
    const t = xmake({ lang: 'fr', options: { pdf: true, canExport: (r) => (seen.push(r.format), true) } });
    expect(await t.feature.run('displayed', { format: 'pdf' })).toBe('done');
    expect(seen).toEqual(['pdf']);
    expect(t.exportEvents().map((e) => [e.type, (e as { format?: string }).format])).toEqual([['exportRequested', 'pdf'], ['exportFinished', 'pdf']]);
    const d = t.delivered[0]!;
    expect(d.fileName).toMatch(/^export-\d{4}-\d\d-\d\d-\d{4}\.pdf$/);
    expect(d.blob!.type).toBe('application/pdf');
    const r = readPdf(await bytes(d.blob!));
    expect(r.errors).toEqual([]);
    const all = r.pages.flatMap(texts);
    expect(all.slice(0, 4)).toEqual(['Name', 'N', 'ann0', '0']);
    expect(all).toContain('bob29');
    expect(all).toContain('29');
    expect(t.said().at(-1)).toBe('Exporté. 30 lignes');
    expect(t.exportEvents().at(-1)).toMatchObject({ outcome: 'done', rows: 30, columns: 2 });
  });

  it('the screen\'s format: numbers as the grid shows them, end-aligned', async () => {
    const t = xmake({ lang: 'fr', columns: [{ id: 'name', header: 'Nom' }, { id: 'n', header: 'Montant', type: 'number', numberFormat: { minimumFractionDigits: 2 } }], rows: [{ id: 'a', name: 'x', n: 1234.5 }], options: { pdf: true } });
    await t.feature.run('displayed', { format: 'pdf' });
    const p = readPdf(await bytes(t.delivered[0]!.blob!)).pages[0]!;
    // fr-FR: U+202F between the thousands, written as a space; a comma for the decimals.
    expect(texts(p)).toContain('1 234,50');
    const name = p.runs.find((x) => x.text === 'x')!;
    const num = p.runs.find((x) => x.text === '1 234,50')!;
    expect(num.x).toBeGreaterThan(name.x);
  });

  it('without the pdf option: failed, missing-feature at export.pdf, nothing built', async () => {
    const canExport = vi.fn(() => true);
    const t = xmake({ options: { canExport } });
    expect(await t.feature.run('displayed', { format: 'pdf' })).toBe('failed');
    expect(t.problems().map((p) => [p.code, p.path])).toEqual([['missing-feature', 'export.pdf']]);
    expect(canExport).not.toHaveBeenCalled();
    expect(t.delivered).toEqual([]);
  });

  it('bind({ format: \'pdf\' }) exports a PDF; a host\'s name gets .pdf once', async () => {
    const t = xmake({ options: { pdf: true, fileName: () => 'rapport.pdf' } });
    const b = document.createElement('button');
    t.feature.bind(b, { format: 'pdf' });
    b.click();
    await flush();
    await vi.waitFor(() => expect(t.delivered).toHaveLength(1));
    expect(t.delivered[0]!.fileName).toBe('rapport.pdf');
  });

  it('an Arabic grid: refused by the writer — failed, pdf-script told (no value), nothing downloads', async () => {
    const t = xmake({ lang: 'ar', settings: { direction: 'rtl' }, rows: [{ id: 'a', name: 'مريض سري', n: 1 }], options: { pdf: true } });
    expect(await t.feature.run('displayed', { format: 'pdf' })).toBe('failed');
    expect(t.delivered).toEqual([]);
    expect(t.problems().map((p) => [p.code, p.severity, p.path])).toEqual([['pdf-script', 'error', 'pdf.columns[0]']]);
    expect(JSON.stringify(t.problems())).not.toContain('مريض');
    expect(t.exportEvents().at(-1)).toMatchObject({ type: 'exportFinished', outcome: 'failed', failure: { stage: 'build', name: 'pdf-script' } });
  });

  it('a right-to-left grid of Latin text: the first column on the right', async () => {
    const t = xmake({ settings: { direction: 'rtl' }, rows: [{ id: 'a', name: 'alpha', n: 5 }], options: { pdf: true } });
    expect(await t.feature.run('displayed', { format: 'pdf' })).toBe('done');
    const p = readPdf(await bytes(t.delivered[0]!.blob!)).pages[0]!;
    expect(p.runs.find((x) => x.text === 'alpha')!.x).toBeGreaterThan(p.runs.find((x) => x.text === '5')!.x);
  });

  it('a title function gets the export (as Excel\'s); its text is on the first page', async () => {
    const seen: Record<string, unknown>[] = [];
    const t = xmake({ options: { pdf: { title: (c) => (seen.push({ ...c }), 'Gnomes'), footer: 'End' } } });
    expect(await t.feature.run('displayed', { format: 'pdf' })).toBe('done');
    expect([seen[0]!['rows'], seen[0]!['scope']]).toEqual([30, 'displayed']);
    const r = readPdf(await bytes(t.delivered[0]!.blob!));
    expect(texts(r.pages[0]!)[0]).toBe('Gnomes');
    expect(texts(r.pages.at(-1)!)).toContain('End');
  });

  it('compressed where the browser has CompressionStream (FlateDecode), and reads back the same', async () => {
    const plain = xmake({ options: { pdf: true } });
    await plain.feature.run('displayed', { format: 'pdf' });
    const a = await bytes(plain.delivered[0]!.blob!);
    cleanup();
    (window as { CompressionStream?: unknown }).CompressionStream = NodeCompression;
    const t = xmake({ options: { pdf: true } });
    await t.feature.run('displayed', { format: 'pdf' });
    const b = await bytes(t.delivered[0]!.blob!);
    expect(Buffer.from(b).toString('latin1')).toContain('/Filter /FlateDecode');
    expect(Buffer.from(a).toString('latin1')).not.toContain('/Filter /FlateDecode');
    expect(readPdf(b).pages.map(texts)).toEqual(readPdf(a).pages.map(texts));
  });

  it('cancel during the build: nothing downloads', async () => {
    const rows = Array.from({ length: 3000 }, (_, i) => ({ id: `r${i}`, name: `x${i}`, n: i }));
    let n = 0;
    const t = xmake({ rows, options: { pdf: true, onProgress: (p) => void (p.phase === 'building' && ++n === 2 && t.feature.cancel()) } });
    let clock = 0;
    vi.spyOn(t.ctx, 'now').mockImplementation(() => (clock += 20));
    expect(await t.feature.run('displayed', { format: 'pdf' })).toBe('cancelled');
    expect(t.delivered).toEqual([]);
  });
});

describe('the cell menu', () => {
  const messages = { locale: 'fr', text: { ...CMSG.fr.text, ...FR_PDF.text } } as unknown as typeof CMSG.fr; // the bundle and the PDF item's text, joined
  it('« Exporter en PDF » after the Excel item when use.pdf is given; it runs the displayed rows', () => {
    const run = vi.fn(async () => 'done');
    const t = cmake({ lang: 'fr', messages, menu: (u) => ({ use: { range: u.range, csv: { run: vi.fn(async () => 'done') }, xlsx: { run: vi.fn(async () => 'done') }, pdf: { run } } }) });
    t.rclick(t.cell('r2', 'n')!);
    expect(t.entries().slice(-3)).toEqual(['export.csv', 'export.xlsx', 'export.pdf']);
    expect(t.item('export.pdf')!.textContent).toBe('Exporter en PDF');
    t.item('export.pdf')!.click();
    expect(run).toHaveBeenCalledWith('displayed');
  });

  it('with use.pdf and no text: the setup names the missing key; without use.pdf, no item and no key asked', () => {
    expect(() => cmake({ menu: (u) => ({ use: { range: u.range, pdf: { run: vi.fn(async () => 'done') } } }) })).toThrow(/cmenu\.exportPdf/);
    const t = cmake({ menu: (u) => ({ use: { range: u.range, csv: { run: vi.fn(async () => 'done') } } }) });
    t.rclick(t.cell('r2', 'n')!);
    expect(t.entries()).not.toContain('export.pdf');
  });
});
