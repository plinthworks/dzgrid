// @vitest-environment jsdom
// The Arabic CSV sample of step 23 (docs/behaviors/angular-example.md, csv-export.md): the real
// export of @dzgrid/dom/export, the audit columns in Arabic, right to left, `ar-DZ`. No Angular.
// `npm run example:csv` runs this file with EXAMPLE_CSV_WRITE=1, which writes the sample to
// examples/angular-audit/out/audit-ar.csv for the owner's Excel check; when that file exists, it
// must hold exactly these bytes.
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { arabicSample, SAMPLE_ROWS } from '../example-csv.js';

// jsdom's import.meta.url is not a file URL: from the repository's root, where vitest runs.
const OUT = join(process.cwd(), 'examples/angular-audit/out/audit-ar.csv');
const WRITE = process.env.EXAMPLE_CSV_WRITE === '1';

/** RFC 4180, by hand: records of fields; quoted fields may hold the separator, quotes doubled, CR and LF. */
function parse(text: string, sep: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '"' && field === '') {
      i++;
      for (;;) {
        if (i >= text.length) throw new Error('unclosed quote');
        if (text[i] === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          i++;
          break;
        }
        field += text[i++];
      }
      if (i < text.length && text[i] !== sep && text[i] !== '\r') throw new Error(`text after a closing quote at ${i}`);
      continue;
    }
    if (text[i] === sep) { row.push(field); field = ''; i++; continue; }
    if (text[i] === '\r' && text[i + 1] === '\n') { row.push(field); records.push(row); row = []; field = ''; i += 2; continue; }
    if (text[i] === '\n' || text[i] === '\r') throw new Error(`a bare line break at ${i}`);
    field += text[i++];
  }
  if (field !== '' || row.length) throw new Error('the last line does not end in CRLF');
  return records;
}

describe('the Arabic CSV sample (step 23)', () => {
  let bytes: Uint8Array;
  let text: string;
  let fileName: string;
  let direction: string | null;
  beforeAll(async () => {
    ({ bytes, fileName, direction } = await arabicSample());
    text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    if (WRITE) {
      mkdirSync(dirname(OUT), { recursive: true });
      writeFileSync(OUT, bytes);
    }
  });

  it('is exported from a grid laid out right to left', () => {
    expect(direction).toBe('rtl');
  });

  it('takes `;` from ar-DZ: the same export in ar-EG or en-US separates with `,`', async () => {
    const header = (b: Uint8Array) => { const t = new TextDecoder('utf-8', { ignoreBOM: true }).decode(b); return t.slice(1, t.indexOf('\r\n')); };
    expect(header(bytes).split(';')).toHaveLength(8);
    for (const locale of ['ar-EG', 'en-US']) {
      const other = header((await arabicSample(locale)).bytes);
      expect(other).not.toContain(';');
      expect(other.split(',')).toHaveLength(8);
    }
  });

  it('starts with the UTF-8 BOM, EF BB BF', () => {
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text.charCodeAt(1)).not.toBe(0xfeff);
  });

  it('writes the first logical column first, eight Arabic headers, `;` for ar-DZ', () => {
    const header = text.slice(1, text.indexOf('\r\n'));
    expect(header).toBe('التاريخ والوقت (Africa/Algiers);اليوم;الفاعل;الإجراء;المورد;نجح;المدة (ملي ثانية);ملاحظة');
  });

  it('writes the first row by hand: wall time in Algiers, the enum label, Latin digits, the note quoted', () => {
    const lines = text.slice(1).split('\r\n');
    expect(lines[1]).toBe('2026-10-20 13:00:00;2026-10-20;أمينة عمر;تسجيل الدخول;;true;0;"تمت المراجعة, ""عاجل"""');
  });

  it('adds no direction mark (U+200E, U+200F, U+061C) and no Arabic-Indic digit', () => {
    expect(text).not.toMatch(/[‎‏؜]/);
    expect(text).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('ends every line in CRLF, the last one included, and has no bare LF or CR', () => {
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('reads back as RFC 4180: one record per row plus the header, eight fields each, the notes whole', () => {
    const records = parse(text.slice(1), ';');
    expect(records).toHaveLength(SAMPLE_ROWS + 1);
    expect(records.every((r) => r.length === 8)).toBe(true);
    expect(records[1]![7]).toBe('تمت المراجعة, "عاجل"');
    expect(records[2]![7]).toBe('قسم 3; الطابق 2');
    expect(records.filter((r) => r[7]!.includes(',')).length).toBeGreaterThan(5);
  });

  it('names the file in Arabic, cleaned, .csv once', () => {
    expect(fileName).toMatch(/^تصدير-\d{4}-\d\d-\d\d-\d{4}\.csv$/);
  });

  it.skipIf(!WRITE && !existsSync(OUT))('examples/angular-audit/out/audit-ar.csv holds these same bytes', () => {
    expect(Buffer.compare(readFileSync(OUT), Buffer.from(bytes))).toBe(0);
  });
});
