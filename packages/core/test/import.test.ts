// Reading a CSV or Excel file into rows (docs/behaviors/file-import.md, 1.9.0 lot B): pure parts. Files made up here, by
// hand; expectations by hand.
import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, type ColumnDef, type ResolvedColumn } from '@dzgrid/core';
import { importRows, readCsv, readSheet, sharedStrings, sheetPath, zipEntries, type ImportCell } from '@dzgrid/core/import';
import { storedZip } from './support-zip.js';

const enc = new TextEncoder();

describe('CSV (file-import.md 5)', () => {
  it('the separator found most in the first line: comma, semicolon, tab; a tie is a comma', () => {
    expect(readCsv('a,b,c\r\n1,2,3\r\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    expect(readCsv('a;b;c\n1,5;2;3')).toEqual([['a', 'b', 'c'], ['1,5', '2', '3']]);
    expect(readCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(readCsv('a,b;c\n1,2;3')).toEqual([['a', 'b;c'], ['1', '2;3']]);
  });

  it('quotes hold separators, doubled quotes and line breaks; a byte order mark dropped; a separator in quotes not counted', () => {
    expect(readCsv('﻿"x;y",b,c\n"say ""hi""","two\nlines",3')).toEqual([['x;y', 'b', 'c'], ['say "hi"', 'two\nlines', '3']]);
  });
});

describe('ZIP directory (file-import.md 6)', () => {
  it('the entries by name, their stored bytes', () => {
    const z = zipEntries(storedZip({ 'a.txt': 'hello', 'dir/b.xml': '<x/>' }))!;
    expect([...z.keys()]).toEqual(['a.txt', 'dir/b.xml']);
    expect(z.get('dir/b.xml')!.method).toBe(0);
    expect(new TextDecoder().decode(z.get('a.txt')!.data)).toBe('hello');
  });

  it('not a ZIP, a cut one, an encrypted entry: null', () => {
    expect(zipEntries(enc.encode('a,b\n1,2'))).toBeNull();
    expect(zipEntries(storedZip({ 'a.txt': 'hello' }).slice(0, 40))).toBeNull();
    expect(zipEntries(storedZip({ 'a.txt': 'hello' }, 1))).toBeNull();
  });
});

describe('the workbook’s parts (file-import.md 6)', () => {
  it('the first sheet by the workbook’s order, through its relationships', () => {
    const wb = '<workbook xmlns:r="x"><sheets><sheet name="Second" sheetId="2" r:id="rId7"/><sheet name="First" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const rels = '<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/><Relationship Target="/xl/worksheets/sheet9.xml" Id="rId7" Type="t"/></Relationships>';
    expect(sheetPath(wb, rels)).toBe('xl/worksheets/sheet9.xml');
    expect(sheetPath(wb.replace('rId7', 'rId1'), rels)).toBe('xl/worksheets/sheet1.xml');
    expect(sheetPath('<workbook/>', rels)).toBeNull();
  });

  it('shared strings: plain, rich runs joined, phonetic runs left out, entities read', () => {
    expect(sharedStrings('<sst><si><t>Name</t></si><si><r><t>Fish </t></r><r><rPr/><t xml:space="preserve">&amp; chips</t></r><rPh><t>x</t></rPh></si><si><t/></si><si><t>&lt;a&gt; &#233;&#x41;</t></si></sst>')).toEqual(['Name', 'Fish & chips', '', '<a> éA']);
  });

  it('a sheet: shared, inline and formula strings, numbers, booleans, errors, ISO dates; gaps are blank', () => {
    const xml = '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Qty</t></is></c></row>' +
      '<row r="3"><c r="A3" t="str"><f>A1</f><v>calc</v></c><c r="B3" t="b"><v>1</v></c><c r="C3"><v>12.5</v></c><c r="D3" t="e"><v>#DIV/0!</v></c><c r="E3" t="d"><v>2026-01-02</v></c></row>' +
      '</sheetData></worksheet>';
    expect(readSheet(xml, ['Name'])).toEqual([
      ['Name', null, 'Qty'],
      [],
      ['calc', true, 12.5, { error: true }, '2026-01-02'],
    ]);
  });
});

type P = { id: string; name: string; qty: number; born: string; at: number; city?: { name: string } };
const cols = (defs: ColumnDef<P, any>[]): ResolvedColumn<P>[] => {
  const m = createColumnModel(defs);
  return m.state().map((s) => m.get(s.id)!);
};
const FR = localeCtx({ locale: 'fr-FR', timeZone: 'Europe/Paris' });
const DEFS: ColumnDef<P, any>[] = [
  { id: 'name', header: 'Nom' },
  { id: 'qty', header: 'Quantité', type: 'number' },
  { id: 'born', header: 'Né le', type: 'day' },
  { id: 'at', header: 'Arrivée', type: 'instant' },
  { id: 'city', field: 'city.name', header: 'Ville' },
];

describe('rows from a table (file-import.md 7–10)', () => {
  it('the header matched by title or id, without case, accents or spaces; values through each column’s codec', () => {
    const t: ImportCell[][] = [
      [],
      [' NOM ', 'quantite', 'born', 'Ville'],
      ['Ada', '1 234,5', '02/01/2026', 'Lyon'],
      ['', '', '', ''],
      ['Bob', null, null, 'Oran'],
    ];
    expect(importRows(t, cols(DEFS), FR)).toEqual({
      rows: [
        { name: 'Ada', qty: 1234.5, born: '2026-01-02', city: { name: 'Lyon' } },
        { name: 'Bob', qty: null, born: null, city: { name: 'Oran' } },
      ],
      problems: [],
    });
  });

  it('a refused cell: left out, told by path and code, never its text; an unknown header and a second one for a column told', () => {
    const t: ImportCell[][] = [
      ['Nom', 'Couleur', 'Quantité', 'qty'],
      ['Ada', 'red', 'beaucoup', '3'],
      ['Bob', 'blue', '7', '8'],
    ];
    const r = importRows(t, cols(DEFS), FR);
    expect(r.rows).toEqual([{ name: 'Ada' }, { name: 'Bob', qty: 7 }]);
    expect(r.problems).toEqual([
      { code: 'import-header', severity: 'warning', path: 'header[1]' },
      { code: 'import-header', severity: 'warning', path: 'header[3]', detail: 'duplicate' },
      { code: 'import-cell', severity: 'warning', path: 'rows[0].qty', detail: 'parse' },
    ]);
    expect(JSON.stringify(r.problems)).not.toMatch(/beaucoup|red|Couleur/);
  });

  it('Excel values: a number, a boolean, an error refused; a serial date is a day, or a wall time in the grid’s zone', () => {
    const t: ImportCell[][] = [
      ['name', 'qty', 'born', 'at'],
      // 46024 = 2026-01-02; 46024.5 = 2026-01-02 12:00 in Paris (UTC+1) = 11:00 UTC.
      [true, 12.5, 46024, 46024.5],
      ['x', { error: true }, 'nope', null],
    ];
    const r = importRows(t, cols(DEFS), FR);
    expect(r.rows).toEqual([
      { name: 'true', qty: 12.5, born: '2026-01-02', at: Date.UTC(2026, 0, 2, 11) },
      { name: 'x', at: null },
    ]);
    expect(r.problems).toEqual([
      { code: 'import-cell', severity: 'warning', path: 'rows[1].qty', detail: 'invalid' },
      { code: 'import-cell', severity: 'warning', path: 'rows[1].born', detail: 'day' },
    ]);
  });

  it('a wall time skipped by a clock change refused with that code', () => {
    // 2026-03-29 02:30 does not exist in Paris: 46110 + 2.5 / 24.
    const r = importRows([['at'], [46110 + 2.5 / 24]], cols(DEFS), FR);
    expect(r.problems).toEqual([{ code: 'import-cell', severity: 'warning', path: 'rows[0].at', detail: 'wall-time-skipped' }]);
  });

  it('no header matching any column: no rows, told; an empty table likewise', () => {
    expect(importRows([['a', 'b'], ['1', '2']], cols(DEFS), FR)).toEqual({ rows: [], problems: [{ code: 'import-file', severity: 'warning', path: 'file', detail: 'header' }] });
    expect(importRows([], cols(DEFS), FR).problems).toEqual([{ code: 'import-file', severity: 'warning', path: 'file', detail: 'header' }]);
  });
});
