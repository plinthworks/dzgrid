import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 as zcrc, deflateRawSync } from 'node:zlib';
import { clientRows, createColumnModel, localeCtx, type ColumnOrGroup } from '@dzgrid/core';
import { crc32, numFmtFor, sheetNameOf, toXlsx, utf8, xlsxParts, zipFile, type XlsxOptions } from '@dzgrid/core/xlsx';
import { joinParts, readXlsx, unzip } from '../../../../conformance/runner/xlsx-read.js';
import { mulberry32 } from '../support/rng.js';

/** docs/behaviors/xlsx-export.md: the writer's pieces, unit by unit. */

type Row = Record<string, unknown> & { id: string };
const EN = localeCtx({ locale: 'en-US', timeZone: 'Africa/Algiers' });
const deflate = (b: Uint8Array) => new Uint8Array(deflateRawSync(b));

function file(defs: readonly ColumnOrGroup<Row>[], rows: readonly Record<string, unknown>[], o: XlsxOptions<Row> = {}, z?: (b: Uint8Array) => Uint8Array) {
  const columns = createColumnModel<Row>(defs);
  const model = clientRows<Row>({ rows: rows.map((r, i) => ({ id: `r${i}`, ...r }) as Row), getRowId: (r) => r.id, columns, ctx: EN });
  const r = toXlsx({ rows: model.displayed, columns, ctx: EN, groups: defs }, o, z);
  return { bytes: joinParts(r.parts), summary: r.summary, model, columns };
}

describe('zip', () => {
  it('CRC-32 gives the check value of 123456789, and equals zlib on random bytes, whole or in pieces', () => {
    expect(crc32(utf8('123456789')).toString(16)).toBe('cbf43926');
    const r = mulberry32(7);
    for (let k = 0; k < 50; k++) {
      const b = Uint8Array.from({ length: Math.floor(r() * 3000) }, () => Math.floor(r() * 256));
      const cut = Math.floor(r() * b.length);
      expect(crc32(b)).toBe(zcrc(b));
      expect(crc32(b.subarray(cut), crc32(b.subarray(0, cut)))).toBe(zcrc(b));
    }
  });

  it('UTF-8 by hand equals node\'s, a lone surrogate as U+FFFD', () => {
    const r = mulberry32(11);
    for (let k = 0; k < 300; k++) {
      const s = String.fromCharCode(...Array.from({ length: Math.floor(r() * 40) }, () => (r() < 0.5 ? Math.floor(r() * 0x80) : r() < 0.7 ? Math.floor(r() * 0x10000) : 0xd800 + Math.floor(r() * 0x800))));
      expect(Buffer.from(utf8(s)).equals(Buffer.from(s, 'utf8')), JSON.stringify(s)).toBe(true);
    }
  });

  it('refuses past 4 GB (no ZIP64): no pieces, a problem', () => {
    const z = zipFile([{ name: 'a', crc: 0, size: 2 ** 32, method: 0, data: [] }]);
    expect(z.parts).toEqual([]);
    expect(z.problems.map((p) => p.code)).toEqual(['xlsx-too-large']);
  });
});

describe('the file', () => {
  const defs = [{ id: 'a', header: 'A' }, { id: 'n', header: 'N', type: 'number' as const }, { id: 'd', header: 'D', type: 'day' as const }];
  const rows = Array.from({ length: 1200 }, (_, i) => ({ a: `x${i % 37}`, n: i / 3, d: '2026-03-05' }));

  it('the same rows give the same bytes (stored: no clock, no randomness)', () => {
    expect(Buffer.from(file(defs, rows).bytes).equals(Buffer.from(file(defs, rows).bytes))).toBe(true);
  });

  it('stored and deflated read back the same, and deflated is smaller', () => {
    const s = file(defs, rows);
    const d = file(defs, rows, {}, deflate);
    expect(readXlsx(d.bytes)).toEqual(readXlsx(s.bytes));
    expect(d.bytes.length).toBeLessThan(s.bytes.length / 3);
  });

  it('the pieces of a few rows joined equal the whole file', () => {
    const one = file(defs, rows, { chunkRows: 100_000 });
    const many = file(defs, rows, { chunkRows: 7 });
    expect(Buffer.from(many.bytes).equals(Buffer.from(one.bytes))).toBe(true);
    const g = file(defs, rows);
    const it = xlsxParts({ rows: g.model.displayed, columns: g.columns, ctx: EN }, { chunkRows: 100 });
    let sheet = 0;
    for (let r = it.next(); !r.done; r = it.next()) if (r.value.entry === 'xl/worksheets/sheet1.xml') sheet++;
    expect(sheet).toBe(13);
  });

  it('every entry\'s CRC and size check out, and every part is well-formed XML', () => {
    const parts = unzip(file(defs, rows, {}, deflate).bytes);
    expect([...parts.keys()][0]).toBe('[Content_Types].xml');
    expect(parts.size).toBe(7);
  });

  it('random text round-trips through the escapes', () => {
    const r = mulberry32(3);
    const texts = Array.from({ length: 400 }, () => String.fromCharCode(...Array.from({ length: Math.floor(r() * 12) + 1 }, () => {
      const p = r();
      return p < 0.3 ? 32 + Math.floor(r() * 95) : p < 0.4 ? Math.floor(r() * 32) : p < 0.5 ? 0x5f : p < 0.7 ? 0x600 + Math.floor(r() * 0x100) : p < 0.8 ? 0xd800 + Math.floor(r() * 0x800) : p < 0.9 ? 0xfffe + Math.floor(r() * 2) : 0x78;
    })) + (r() < 0.2 ? '_x00e9_' : ''));
    const { bytes } = file([{ id: 't', header: 'T' }], texts.map((t) => ({ t })));
    const cells = readXlsx(bytes).cells;
    const lone = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
    texts.forEach((t, i) => expect(cells[`A${i + 2}`], JSON.stringify(t)).toBe(t.replace(lone, '�')));
  });

  it('never holds a formula, whatever the text', () => {
    const { bytes } = file([{ id: 't', header: 'T' }], ['=1+1', '+1', '-1', '@A1', '\t=x', '=HYPERLINK("x")'].map((t) => ({ t })));
    const sheet = unzip(bytes).get('xl/worksheets/sheet1.xml')!;
    expect(sheet).not.toMatch(/<f[ >]/);
    expect(Object.values(readXlsx(bytes).cells)).toEqual(['T', '=1+1', '+1', '-1', '@A1', '\t=x', '=HYPERLINK("x")']);
  });
});

describe('problems hold no value', () => {
  it('a sentinel in every cell, header and sheet name never reaches a problem', () => {
    const S = 'SENTINEL-7f3a';
    const defs = [{ id: 't', header: S }, { id: 'd', header: 'D', type: 'day' as const }, { id: 'g', header: 'G' }];
    const rows = [{ t: S + 'x'.repeat(40_000), d: '1899-01-01', g: S }, { t: S, d: '1900-01-05', g: S }];
    const { summary } = file(defs, rows, {
      sheetName: S,
      xlsxStyle: (c) => {
        if (c.column === 'g') throw new Error(S);
        return { fill: S };
      },
    });
    expect(summary.problems.map((p) => p.code).sort()).toEqual(['invalid-setting', 'xlsx-early-day', 'xlsx-text-cut']);
    expect(JSON.stringify(summary)).not.toContain('SENTINEL');
    expect(JSON.stringify(summary)).not.toContain('r0');
  });
});

describe('limits and caps', () => {
  it('past Excel\'s 16 384 columns: nothing written, xlsx-too-large', () => {
    const defs = Array.from({ length: 16_385 }, (_, i) => ({ id: `c${i}` }));
    const columns = createColumnModel<Row>(defs);
    const model = clientRows<Row>({ rows: [], getRowId: (r) => r.id, columns, ctx: EN });
    const it = xlsxParts({ rows: model.displayed, columns, ctx: EN });
    const r = it.next();
    expect(r.done).toBe(true);
    // The generator's return (done), not a piece.
    expect((r.value as unknown as { problems: { code: string }[] }).problems.map((p) => p.code)).toEqual(['xlsx-too-large']);
  });

  it('past 60 000 styles the rest are plain, told once', () => {
    const rows = Array.from({ length: 60_010 }, (_, i) => ({ n: i }));
    const { bytes, summary } = file([{ id: 'n', header: 'N', type: 'number' }], rows, { xlsxStyle: (c) => (c.header ? null : { fill: (c.value as number).toString(16).padStart(6, '0') }) });
    expect(summary.problems.map((p) => p.code)).toEqual(['xlsx-style-limit']);
    // Read as text: 60 000 cells are too many for jsdom's parser in a unit test.
    const parts = unzip(bytes);
    const styleOf = (ref: string) => Number(new RegExp(`<c r="${ref}"(?: s="(\\d+)")?`).exec(parts.get('xl/worksheets/sheet1.xml')!)?.[1] ?? 0);
    expect(styleOf('A2')).toBeGreaterThan(0);
    expect(styleOf('A60011')).toBe(0);
    expect((parts.get('xl/styles.xml')!.match(/<xf /g) ?? []).length).toBe(60_001);
  });
});

describe('helpers', () => {
  it('sheet names', () => {
    expect(sheetNameOf('')).toBe('Sheet1');
    expect(sheetNameOf("''")).toBe('Sheet1');
    expect(sheetNameOf('[]:*?/\\')).toBe('Sheet1');
    expect(sheetNameOf('a'.repeat(40))).toBe('a'.repeat(31));
    expect(sheetNameOf('a'.repeat(30) + '😀')).toBe('a'.repeat(30));
    expect(sheetNameOf("abc'" + 'd'.repeat(30))).toBe("abc'" + 'd'.repeat(27));
    expect(sheetNameOf('a'.repeat(30) + "'b")).toBe('a'.repeat(30));
    expect(sheetNameOf('تصدير')).toBe('تصدير');
  });

  it('number formats: General without digits, what Intl refuses gives General', () => {
    expect(numFmtFor(undefined, EN)).toBe(0);
    expect(numFmtFor({}, EN)).toBe(0);
    expect(numFmtFor({ style: 'currency', currency: 'not a currency' }, EN)).toBe(0);
    expect(numFmtFor({ maximumFractionDigits: 2 }, EN)).toBe('#,##0.##');
    expect(numFmtFor({ minimumFractionDigits: 3, maximumFractionDigits: 1 }, EN)).toBe('#,##0.000');
  });
});

describe('windowless file checks (skipped when the tool is absent)', () => {
  const has = (tool: string) => spawnSync('which', [tool]).status === 0;
  const defs = [{ id: 'name', header: 'الاسم' }, { id: 'n', header: 'N', type: 'number' as const, numberFormat: { style: 'currency' as const, currency: 'EUR' } }, { id: 'd', header: 'D', type: 'day' as const }];
  const rows = [{ name: 'مرحبا <&>', n: 1.5, d: '2026-03-05' }, { name: '=1+1', n: -2, d: '1900-01-01' }];

  it.skipIf(!has('unzip'))('unzip -t finds no error, stored and deflated', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dzg-xlsx-'));
    try {
      for (const [k, z] of [['s', undefined], ['d', deflate]] as const) {
        const f = join(dir, `${k}.xlsx`);
        writeFileSync(f, file(defs, rows, { rtl: true }, z).bytes);
        expect(execFileSync('unzip', ['-t', f]).toString()).toMatch(/No errors detected/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!has('xmllint'))('xmllint finds every part well-formed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dzg-xlsx-'));
    try {
      for (const [name, text] of unzip(file(defs, rows).bytes)) {
        const f = join(dir, name.replace(/[/[\]]/g, '_'));
        writeFileSync(f, text);
        expect(spawnSync('xmllint', ['--noout', f]).status, name).toBe(0);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
