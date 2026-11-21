// 1.17.0: the PDF writer (docs/behaviors/pdf-export.md). Expectations written by hand; the file read back with our own
// test-only reader (frame, pages, text runs), and by Ghostscript and pdfminer when they are on the machine.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { clientRows, createColumnModel, createKernel, localeCtx, type ColumnOrGroup } from '@dzgrid/core';
import { csvRows } from '@dzgrid/core/csv';
import { groupShape } from '@dzgrid/core/grouping';
import { pdfParts, toPdf, type PdfOptions } from '@dzgrid/core/pdf';
import { joinParts, readPdf, texts } from './support/pdf-read.js';
import { tinyTtf } from './support/tiny-ttf.js';

type Row = Record<string, unknown> & { id: string };
const EN = localeCtx({ locale: 'en-US', timeZone: 'UTC' });
const FR = localeCtx({ locale: 'fr-FR', timeZone: 'Europe/Paris' });

function pdf(defs: readonly ColumnOrGroup<Row>[], rows: readonly Record<string, unknown>[], o: PdfOptions = {}, x: { widths?: Record<string, number>; ctx?: typeof EN; z?: boolean } = {}) {
  const ctx = x.ctx ?? EN;
  const columns = createColumnModel<Row>(defs);
  const model = clientRows<Row>({ rows: rows.map((r, i) => ({ id: `r${i}`, ...r }) as Row), getRowId: (r) => r.id, columns, ctx });
  const r = toPdf({ rows: model.displayed, columns, ctx, groups: defs, ...(x.widths && { widths: x.widths }) }, o, x.z ? (b) => new Uint8Array(deflateSync(b)) : undefined);
  const bytes = joinParts(r.parts);
  return { bytes, summary: r.summary, read: r.parts.length ? readPdf(bytes) : null };
}

const defs: ColumnOrGroup<Row>[] = [{ id: 'name', header: 'Name' }, { id: 'n', header: 'Amount', type: 'number' }, { id: 'd', header: 'Day', type: 'day' }];

describe('the file', () => {
  it('a valid frame: header, every object at its xref offset, startxref, one page, the cells as text runs', () => {
    const { read, summary } = pdf(defs, [{ name: 'Alpha', n: 1234.5, d: '2026-03-05' }, { name: 'Beta', n: 7, d: '2026-11-21' }]);
    expect(read!.version).toBe('1.7');
    expect(read!.errors).toEqual([]);
    expect(read!.pages).toHaveLength(1);
    expect(summary).toMatchObject({ rows: 2, columns: 3, pages: 1, problems: [] });
    const t = texts(read!.pages[0]!);
    for (const s of ['Name', 'Amount', 'Day', 'Alpha', 'Beta', '1,234.5', '7', '1 / 1']) expect(t, s).toContain(s);
    // The header in the bold font, the cells in the regular one.
    expect(read!.pages[0]!.runs.find((r) => r.text === 'Name')!.font).toBe('F2');
    expect(read!.pages[0]!.runs.find((r) => r.text === 'Alpha')!.font).toBe('F1');
    expect([...read!.objects.values()].some((o) => o.dict.includes('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding'))).toBe(true);
  });

  it('A4 portrait by default; Letter; landscape asked', () => {
    expect(pdf(defs, [{ name: 'a' }]).read!.pages[0]!.box).toEqual([0, 0, 595.28, 841.89]);
    expect(pdf(defs, [{ name: 'a' }], { page: 'letter' }).read!.pages[0]!.box).toEqual([0, 0, 612, 792]);
    expect(pdf(defs, [{ name: 'a' }], { orientation: 'landscape' }).read!.pages[0]!.box).toEqual([0, 0, 841.89, 595.28]);
  });

  it('numbers on the end side of their column, text on the start side', () => {
    const { read } = pdf(defs, [{ name: 'Alpha', n: 5 }, { name: 'B', n: 123456 }], {}, { widths: { name: 200, n: 200, d: 100 } });
    const runs = read!.pages[0]!.runs;
    // Columns from x = 36: name 150 pt wide, n 150 pt (186…336); the padding 4 pt (half the 8 pt size).
    expect(runs.find((r) => r.text === 'Alpha')!.x).toBe(40);
    expect(runs.find((r) => r.text === 'B')!.x).toBe(40);
    const five = runs.find((r) => r.text === '5')!;
    const big = runs.find((r) => r.text === '123,456')!;
    // Helvetica's digit is 556/1000 of the size, its comma 278: their right edges both at 336 − 4.
    expect(five.x + 0.556 * 8).toBeCloseTo(332, 1);
    expect(big.x + (6 * 0.556 + 0.278) * 8).toBeCloseTo(332, 1);
  });

  it('the same rows give the same bytes; no date in the file', () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({ name: `row ${i}`, n: i * 1.5, d: '2026-01-02' }));
    const a = pdf(defs, rows).bytes;
    expect(Buffer.from(a).equals(Buffer.from(pdf(defs, rows).bytes))).toBe(true);
    expect(Buffer.from(a).toString('latin1')).not.toMatch(/CreationDate|ModDate/);
  });

  it('deflated streams read back the same and are smaller', () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({ name: `row ${i}`, n: i * 1.5, d: '2026-01-02' }));
    const s = pdf(defs, rows);
    const d = pdf(defs, rows, {}, { z: true });
    expect(d.read!.errors).toEqual([]);
    expect(d.read!.pages.map(texts)).toEqual(s.read!.pages.map(texts));
    expect(d.bytes.length).toBeLessThan(s.bytes.length / 3);
  });
});

describe('pages', () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ name: `row ${i}`, n: i }));

  it('across pages: the header on every page, every row once, never split, « x / y » on each', () => {
    const { read, summary } = pdf(defs, rows);
    const P = read!.pages.length;
    expect(P).toBeGreaterThan(2);
    expect(summary.pages).toBe(P);
    const seen: string[] = [];
    read!.pages.forEach((p, k) => {
      const t = texts(p);
      expect(t.slice(0, 3), `page ${k + 1}`).toEqual(['Name', 'Amount', 'Day']);
      expect(t.at(-1)).toBe(`${k + 1} / ${P}`);
      seen.push(...t.filter((s) => s.startsWith('row ')));
      // Nothing below the bottom margin but the page number.
      for (const r of p.runs.slice(0, -1)) expect(r.y).toBeGreaterThan(36);
    });
    expect(seen).toEqual(rows.map((r) => r.name));
  });

  it('pageNumbers false: none; a function: the application\'s words', () => {
    const none = pdf(defs, rows, { pageNumbers: false }).read!;
    expect(none.pages.flatMap(texts).some((t) => / \/ /.test(t))).toBe(false);
    const words = pdf(defs, rows, { pageNumbers: (p, n) => `Page ${p} of ${n}` }).read!;
    expect(texts(words.pages[1]!).at(-1)).toBe(`Page 2 of ${words.pages.length}`);
  });

  it('title and subtitle above the table on the first page only, the footer under it on the last; the title in the properties', () => {
    const { read } = pdf(defs, rows, { title: 'Stock report', subtitle: ['Warehouse A', 'November'], footer: 'Confidential' });
    const first = texts(read!.pages[0]!);
    expect(first.slice(0, 6)).toEqual(['Stock report', 'Warehouse A', 'November', 'Name', 'Amount', 'Day']);
    expect(texts(read!.pages[1]!)[0]).toBe('Name');
    const last = texts(read!.pages.at(-1)!);
    expect(last.at(-2)).toBe('Confidential');
    expect(read!.pages.slice(0, -1).flatMap(texts)).not.toContain('Confidential');
    // UTF-16BE with its mark: « Stock report ».
    expect([...read!.objects.values()].find((o) => o.dict.includes('/Producer'))!.dict).toContain('/Title <FEFF0053');
  });

  it('a title that is not a text: left out, invalid-setting', () => {
    const { summary, read } = pdf(defs, [{ name: 'a' }], { title: 42 as never }); // a host's bad value, as the DOM's types allow none
    expect(texts(read!.pages[0]!)[0]).toBe('Name');
    expect(summary.problems.map((p) => [p.code, p.path])).toEqual([['invalid-setting', 'pdf.title']]);
  });
});

describe('wide tables and long text', () => {
  it('auto: landscape when the columns do not fit the portrait page, then shrunk to the page\'s width', () => {
    const many = Array.from({ length: 12 }, (_, k) => ({ id: `c${k}`, header: `Col ${k}` }));
    const widths = Object.fromEntries(many.map((c) => [c.id, 100]));
    // 12 × 75 pt = 900 > 523 (portrait room): landscape (room 769.89), shrunk by 769.89 / 900.
    const { read } = pdf(many, [{ c0: 'first', c11: 'last' }], {}, { widths });
    const p = read!.pages[0]!;
    expect(p.box).toEqual([0, 0, 841.89, 595.28]);
    const last = p.runs.find((r) => r.text === 'last')!;
    expect(last.x).toBeLessThan(841.89 - 36);
    expect(last.size).toBeCloseTo(8 * (769.89 / 900), 1);
  });

  it('never under half the size: 40 columns shrink the text to 4 pt and the widths to the page', () => {
    const many = Array.from({ length: 40 }, (_, k) => ({ id: `c${k}` }));
    const { read } = pdf(many, [{ c0: 'x', c39: 'y' }], {}, { widths: Object.fromEntries(many.map((c) => [c.id, 100])) });
    const runs = read!.pages[0]!.runs;
    expect(runs.find((r) => r.text === 'x')!.size).toBe(4);
    expect(runs.find((r) => r.text === 'y')!.x).toBeLessThan(841.89 - 36);
  });

  it('long text wraps on words to three lines, the rest cut with « … » and told per column (a count)', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen';
    const { read, summary } = pdf(defs, [{ name: long }, { name: 'short' }], {}, { widths: { name: 80, n: 80, d: 80 } });
    const lines = read!.pages[0]!.runs.filter((r) => r.font === 'F1' && r.x === 40 && r.text !== 'short');
    expect(lines).toHaveLength(3);
    expect(lines[0]!.text.startsWith('one two')).toBe(true);
    expect(lines[2]!.text.endsWith('…')).toBe(true);
    // One under the other, 1.2 × 8 pt apart.
    expect(lines[0]!.y - lines[1]!.y).toBeCloseTo(9.6, 1);
    expect(summary.problems.map((p) => [p.code, p.path, p.detail])).toEqual([['pdf-text-cut', 'pdf.columns[0]', '1']]);
    expect(JSON.stringify(summary.problems)).not.toContain('one');
  });

  it('wrap: 1 keeps one line each; a number never wraps', () => {
    const { read } = pdf(defs, [{ name: 'alpha beta gamma delta epsilon zeta', n: 123456789012 }], { wrap: 1 }, { widths: { name: 60, n: 40, d: 60 } });
    const t = texts(read!.pages[0]!).filter((s) => s.includes('alpha') || /^\d/.test(s) || s.endsWith('…'));
    expect(t.filter((s) => s.startsWith('alpha'))).toHaveLength(1);
    expect(t.find((s) => s.startsWith('alpha'))!.endsWith('…')).toBe(true);
    const num = texts(read!.pages[0]!).filter((s) => /^1/.test(s) && s !== '1 / 1');
    expect(num).toHaveLength(1);
    expect(num[0]!.endsWith('…')).toBe(true);
  });

  it('a hard line break in a text starts a new line', () => {
    const { read } = pdf(defs, [{ name: 'first\nsecond' }]);
    const t = texts(read!.pages[0]!);
    expect(t).toContain('first');
    expect(t).toContain('second');
  });
});

describe('characters', () => {
  it('Latin text through WinAnsi: accents, €, quotes, dashes; French number spaces written as spaces', () => {
    const { read, summary } = pdf(defs, [{ name: 'Crème brûlée – “ça” € Œuvre ß', n: 1234567.5 }], {}, { ctx: FR, widths: { name: 400, n: 100, d: 100 } });
    const t = texts(read!.pages[0]!);
    expect(t).toContain('Crème brûlée – “ça” € Œuvre ß');
    // fr-FR groups with U+202F: a plain space in the file.
    expect(t).toContain('1 234 567,5');
    expect(summary.problems).toEqual([]);
  });

  it('a character outside WinAnsi: « ? » and one pdf-glyph per column with the count, never a value', () => {
    const { read, summary } = pdf(defs, [{ name: 'Ωmega' }, { name: 'Жук' }, { name: 'plain' }]);
    const t = texts(read!.pages[0]!);
    expect(t).toContain('?mega');
    expect(t).toContain('???');
    expect(summary.problems.map((p) => [p.code, p.severity, p.path, p.detail])).toEqual([['pdf-glyph', 'warning', 'pdf.columns[0]', '2']]);
  });

  it('Arabic or Hebrew anywhere: nothing written, one error pdf-script (where, how many), never wrong text', () => {
    const ar = pdf(defs, [{ name: 'مرحبا' }, { name: 'ok' }, { name: 'שלום' }]);
    expect(ar.bytes.length).toBe(0);
    expect(ar.summary.pages).toBe(0);
    expect(ar.summary.problems.map((p) => [p.code, p.severity, p.path, p.detail])).toEqual([['pdf-script', 'error', 'pdf.columns[0]', '2']]);
    // In a header, or a title, too.
    expect(pdf([{ id: 'a', header: 'الاسم' }], [{ a: 'x' }]).summary.problems.map((p) => p.code)).toEqual(['pdf-script']);
    expect(pdf(defs, [{ name: 'x' }], { title: 'تقرير' }).summary.problems.map((p) => p.path)).toEqual(['pdf.title']);
    // Devanagari, which joins letters, too.
    expect(pdf(defs, [{ name: 'नमस्ते' }]).summary.problems.map((p) => p.code)).toEqual(['pdf-script']);
  });

  it('invisible direction marks are dropped, not refused', () => {
    const { read, summary } = pdf(defs, [{ name: '‎abc‏' }]);
    expect(texts(read!.pages[0]!)).toContain('abc');
    expect(summary.problems).toEqual([]);
  });
});

describe('an application\'s TrueType font', () => {
  const chars = ['A', 'B', 'Z', 'Ж', 'Ω', '?', ' ', '.', '/', ...'0123456789', 'N', 'a', 'm', 'e'];
  const font = tinyTtf(chars);

  it('embedded as a Unicode font: Cyrillic and Greek written, copied back through ToUnicode', () => {
    const { read, summary } = pdf([{ id: 'name', header: 'Name' }], [{ name: 'AЖΩ' }, { name: 'BA' }], { font: font.bytes });
    expect(read!.errors).toEqual([]);
    expect(summary.problems).toEqual([]);
    const t = texts(read!.pages[0]!);
    expect(t).toEqual(['Name', 'AЖΩ', 'BA', '1 / 1']);
    const dicts = [...read!.objects.values()].map((o) => o.dict);
    expect(dicts.some((d) => /\/Subtype \/Type0 .*\/Encoding \/Identity-H/.test(d))).toBe(true);
    expect(dicts.some((d) => /\/Subtype \/CIDFontType2 .*\/CIDToGIDMap \/Identity/.test(d))).toBe(true);
    // The widths of the glyphs written: A (glyph 1) 510, Ж (glyph 4) 540, by the tiny font's advances.
    const w = dicts.find((d) => d.includes('/CIDFontType2'))!;
    expect(w).toContain('1 [510]');
    expect(w).toContain('4 [540]');
  });

  it('subset: the glyphs not written are emptied, the ids kept', () => {
    const { read } = pdf([{ id: 'name', header: 'A' }], [{ name: 'A' }], { font: font.bytes, pageNumbers: false });
    const file = [...read!.objects.values()].find((o) => o.dict.includes('/Length1'))!;
    const b = file.stream!;
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const n = v.getUint16(4);
    const dir = new Map<string, [number, number]>();
    for (let k = 0; k < n; k++) dir.set(String.fromCharCode(...b.subarray(12 + k * 16, 16 + k * 16)), [v.getUint32(12 + k * 16 + 8), v.getUint32(12 + k * 16 + 12)]);
    const [lo] = dir.get('loca')!;
    const at = (g: number) => v.getUint32(lo + g * 4);
    // .notdef and A (glyph 1) kept, Z (glyph 3) emptied; long offsets.
    expect(at(1) - at(0)).toBeGreaterThan(0);
    expect(at(2) - at(1)).toBeGreaterThan(0);
    expect(at(4) - at(3)).toBe(0);
    expect(v.getInt16(dir.get('head')![0] + 50)).toBe(1);
    expect(dir.has('GSUB')).toBe(false);
  });

  it('a character the font lacks: « ? » and pdf-glyph', () => {
    const { read, summary } = pdf([{ id: 'name', header: 'Name' }], [{ name: 'Aé' }], { font: font.bytes });
    expect(texts(read!.pages[0]!)).toContain('A?');
    expect(summary.problems.map((p) => [p.code, p.path, p.detail])).toEqual([['pdf-glyph', 'pdf.columns[0]', '1']]);
  });

  it('not a TrueType font: pdf-font (error), Helvetica instead', () => {
    const { read, summary } = pdf(defs, [{ name: 'Alpha' }], { font: new Uint8Array([1, 2, 3, 4, 5]) });
    expect(texts(read!.pages[0]!)).toContain('Alpha');
    expect(summary.problems.map((p) => [p.code, p.severity, p.path])).toEqual([['pdf-font', 'error', 'pdf.font']]);
  });

  it('Arabic is refused with a font too (no shaping)', () => {
    expect(pdf(defs, [{ name: 'سلام' }], { font: font.bytes }).summary.problems.map((p) => p.code)).toEqual(['pdf-script']);
  });
});

describe('layout of the grid', () => {
  it('right-to-left: the first column on the right, start-aligned text against its right edge', () => {
    const { read } = pdf(defs, [{ name: 'Alpha', n: 5 }], { rtl: true }, { widths: { name: 100, n: 100, d: 100 } });
    const runs = read!.pages[0]!.runs;
    const a = runs.find((r) => r.text === 'Alpha')!;
    const five = runs.find((r) => r.text === '5')!;
    expect(a.x).toBeGreaterThan(five.x);
    // The first column's right edge at 595.28 − 36, less the padding.
    expect(a.x + (0.667 + 0.222 + 0.556 * 3) * 8).toBeCloseTo(595.28 - 36 - 4, 1);
    // A number at its end: the left edge of the second column (595.28 − 36 − 2 × 75), plus the padding.
    expect(five.x).toBeCloseTo(595.28 - 36 - 150 + 4, 1);
  });

  it('a group header row above its columns, its label centred over them', () => {
    const g: ColumnOrGroup<Row>[] = [{ id: 'who', header: 'Who', children: [{ id: 'a', header: 'First' }, { id: 'b', header: 'Last' }] }, { id: 'c', header: 'Age', type: 'number' }];
    const { read } = pdf(g, [{ a: 'x', b: 'y', c: 1 }], {}, { widths: { a: 100, b: 100, c: 100 } });
    const t = texts(read!.pages[0]!);
    expect(t.slice(0, 4)).toEqual(['Who', 'First', 'Last', 'Age']);
    const who = read!.pages[0]!.runs[0]!;
    const width = (0.944 + 0.611 + 0.611) * 8;
    expect(who.x + width / 2).toBeCloseTo(36 + 75, 1);
  });

  it('a grouped grid: group rows and totals bold, as the Excel file writes them; groupRows: false the data rows only', () => {
    const ds = [{ id: 'g', header: 'City' }, { id: 'n', header: 'N', type: 'number' as const, aggFunc: 'sum' as const }];
    const columns = createColumnModel<Row>(ds);
    const model = clientRows<Row>({ rows: [{ id: 'a', g: 'Alger', n: 1 }, { id: 'b', g: 'Oran', n: 2 }, { id: 'c', g: 'Alger', n: 3 }], getRowId: (r) => r.id, columns, ctx: EN, shape: groupShape<Row>({ by: ['g'], footers: 'both' }) });
    const all = csvRows(model, 'all', createKernel<Row>({ rows: model, columns }).selection)!;
    const r = readPdf(joinParts(toPdf({ rows: all.rows, at: all.at, columns, ctx: EN }, { pageNumbers: false }).parts));
    const runs = r.pages[0]!.runs.slice(2);
    expect(runs.map((x) => [x.text, x.font])).toEqual([
      ['Alger', 'F2'], ['4', 'F2'], ['Alger', 'F1'], ['1', 'F1'], ['Alger', 'F1'], ['3', 'F1'], ['Alger', 'F2'], ['4', 'F2'],
      ['Oran', 'F2'], ['2', 'F2'], ['Oran', 'F1'], ['2', 'F1'], ['Oran', 'F2'], ['2', 'F2'], ['6', 'F2'],
    ]);
    // The data rows indented one step (1.25 × 8 pt) under their group.
    expect(runs[2]!.x - runs[0]!.x).toBeCloseTo(10, 1);
    const flat = readPdf(joinParts(toPdf({ rows: all.rows, at: all.at, columns, ctx: EN }, { pageNumbers: false, groupRows: false }).parts));
    expect(texts(flat.pages[0]!).slice(2)).toEqual(['Alger', '1', 'Alger', '3', 'Oran', '2']);
  });

  it('a text hook (the DOM\'s screen text) wins where it answers; undefined: the column\'s format', () => {
    const columns = createColumnModel<Row>(defs);
    const model = clientRows<Row>({ rows: [{ id: 'a', name: 'x', n: 1500 }], getRowId: (r) => r.id, columns, ctx: EN });
    const r = toPdf({ rows: model.displayed, columns, ctx: EN, text: (node, col) => (col.id === 'n' ? undefined : `${col.id}:${node.kind}`) }, { pageNumbers: false });
    expect(texts(readPdf(joinParts(r.parts)).pages[0]!).slice(3)).toEqual(['name:data', '1,500', 'd:data']);
    expect(r.summary.blank).toBe(0);
  });

  it('progress: the rows laid out, every 200, before the objects', () => {
    const columns = createColumnModel<Row>(defs);
    const model = clientRows<Row>({ rows: Array.from({ length: 450 }, (_, i) => ({ id: `r${i}`, name: 'x' })), getRowId: (r) => r.id, columns, ctx: EN });
    const it = pdfParts({ rows: model.displayed, columns, ctx: EN });
    const seen: number[] = [];
    for (let r = it.next(); !r.done; r = it.next()) if (typeof r.value == 'number') seen.push(r.value);
    expect(seen).toEqual([200, 400]);
  });
});

describe('external readers, when on the machine', () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({ name: `Crème ${i}`, n: i * 1000.25, d: '2026-03-05' }));
  const run = (cmd: string, args: string[]) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 60_000 });
  const gs = run('gs', ['--version']).status === 0;
  const miner = run('python3', ['-I', '-c', 'import pdfminer']).status === 0;

  it.skipIf(!gs)('Ghostscript reads every page without an error (stored and deflated, Helvetica and an embedded font)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dzg-pdf-'));
    try {
      const files = [pdf(defs, rows).bytes, pdf(defs, rows, {}, { z: true }).bytes, pdf([{ id: 'name' }], [{ name: 'AЖΩ 12' }], { font: tinyTtf(['A', 'Ж', 'Ω', ' ', '1', '2', '/', '?']).bytes }, { z: true }).bytes];
      files.forEach((b, k) => {
        const f = join(dir, `${k}.pdf`);
        writeFileSync(f, b);
        const r = run('gs', ['-dNODISPLAY', '-dBATCH', '-dNOPAUSE', '-dPDFSTOPONERROR', '-q', '-sDEVICE=nullpage', f]);
        expect(r.status, `${k}: ${r.stderr}${r.stdout}`).toBe(0);
        expect(`${r.stderr}${r.stdout}`, String(k)).not.toMatch(/error|warning|repair/i);
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!miner)('pdfminer finds the text and the pages', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dzg-pdf-'));
    try {
      const f = join(dir, 'a.pdf');
      writeFileSync(f, pdf(defs, rows, { title: 'Report' }, { z: true }).bytes);
      const r = run('python3', ['-I', join(__dirname, '../../../scripts/pdf-text.py'), f]);
      expect(r.status, r.stderr).toBe(0);
      const pages = JSON.parse(r.stdout) as { lines: { text: string }[] }[];
      expect(pages.length).toBeGreaterThan(1);
      const all = pages.flatMap((p) => p.lines.map((l) => l.text)).join('\n');
      for (const s of ['Report', 'Crème 0', 'Crème 119', '119,029.75', `${pages.length} / ${pages.length}`]) expect(all, s).toContain(s);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
