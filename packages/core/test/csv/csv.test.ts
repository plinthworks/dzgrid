import { describe, it, expect } from 'vitest';
import { localeCtx, type ColumnDef, type ValueCodec } from '@dzgrid/core';
import { csvChunks, csvColumns, csvSeparatorFor, toCsv, type CsvSummary } from '@dzgrid/core/csv';
import { ALM, AR, BOM, EN, FR, LRM, NBSP, RLM, csv, grid, type Row } from './support.js';

/** docs/behaviors/csv-export.md: the text of the file, written out by hand. */

const T = (id: string, header?: string) => ({ id, ...(header !== undefined && { header }) });
const one = (value: unknown, o = {}, ctx = EN) => csv([T('v', 'V')], [{ v: value }], o, ctx);

describe('the formula guard', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+33 6 12', "'+33 6 12"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['-x', "'-x"],
    [' =1', "' =1"],
    ['   +1', "'   +1"],
    [`${NBSP}=1`, `'${NBSP}=1`],
    [`${RLM}=1`, `'${RLM}=1`],
    [`${LRM}@x`, `'${LRM}@x`],
    [`${ALM}-1`, `'${ALM}-1`],
    [`${RLM} ${LRM}=cmd`, `'${RLM} ${LRM}=cmd`],
    ['\tx', "'\tx"],
  ])('guards %j', (value, field) => {
    expect(one(value)).toBe(`V\r\n${field}\r\n`);
  });

  it('guards a leading CR or LF, then quotes the field', () => {
    expect(one('\nx')).toBe(`V\r\n"'\nx"\r\n`);
    expect(one('\rx')).toBe(`V\r\n"'\rx"\r\n`);
  });

  it('leaves alone what does not start a formula', () => {
    expect(one('12-3')).toBe('V\r\n12-3\r\n');
    expect(one('a=b')).toBe('V\r\na=b\r\n');
    expect(one('x @y')).toBe('V\r\nx @y\r\n');
    expect(one(' ')).toBe('V\r\n \r\n');
  });

  it('never guards a typed number, in value or display mode', () => {
    const defs = [{ id: 'n', header: 'N', type: 'number' as const }];
    expect(csv(defs, [{ n: -5 }])).toBe('N\r\n-5\r\n');
    expect(csv(defs, [{ n: -5 }], { text: 'display' })).toBe('N\r\n-5\r\n');
    expect(csv(defs, [{ n: -1.5 }], {}, FR)).toBe('N\r\n-1,5\r\n');
  });

  it('guards headers and enum labels', () => {
    expect(csv([T('a', '=H'), T('b', '-B')], [{ a: 'x', b: 'y' }])).toBe("'=H,'-B\r\nx,y\r\n");
    const defs = [{ id: 'e', header: 'E', type: 'enum' as const, enumOptions: [{ value: 'neg', label: '-neg' }, { value: '+x', label: 'Plus' }] }];
    expect(csv(defs, [{ e: 'neg' }, { e: '+x' }])).toBe("E\r\n'-neg\r\nPlus\r\n");
    expect(csv(defs, [{ e: 'neg' }, { e: '+x' }], { enums: 'code' })).toBe("E\r\nneg\r\n'+x\r\n");
  });

  it('guards display text and custom codecs', () => {
    const codec: ValueCodec<string> = { ...textCodecLike(), toExport: (v) => `=${v}`, format: (v) => `@${v}` };
    const defs = [{ id: 'c', header: 'C', type: 'custom' as const, codec }];
    expect(csv(defs, [{ c: 'a' }])).toBe("C\r\n'=a\r\n");
    expect(csv(defs, [{ c: 'a' }], { text: 'display' })).toBe("C\r\n'@a\r\n");
  });

  it('is off with sanitizeFormulas: false', () => {
    expect(one('=1+1', { sanitizeFormulas: false })).toBe('V\r\n=1+1\r\n');
    expect(csv([T('a', '@H')], [{ a: '-x' }], { sanitizeFormulas: false })).toBe('@H\r\n-x\r\n');
  });
});

describe('quoting (RFC 4180)', () => {
  it('quotes the separator, quotes, CR and LF, and doubles the quotes', () => {
    expect(one('a,b')).toBe('V\r\n"a,b"\r\n');
    expect(one('say "hi"')).toBe('V\r\n"say ""hi"""\r\n');
    expect(one('l1\r\nl2')).toBe('V\r\n"l1\r\nl2"\r\n');
    expect(one('a\rb')).toBe('V\r\n"a\rb"\r\n');
    expect(one('a\nb')).toBe('V\r\n"a\nb"\r\n');
  });

  it('quotes for the separator in use only', () => {
    expect(one('a,b', { separator: ';' })).toBe('V\r\na,b\r\n');
    expect(one('a;b', { separator: ';' })).toBe('V\r\n"a;b"\r\n');
    expect(one('a\tb', { separator: '\t', sanitizeFormulas: false })).toBe('V\r\n"a\tb"\r\n');
    expect(one('a;b')).toBe('V\r\na;b\r\n');
  });

  it('ends every line in CRLF, the last one included', () => {
    expect(csv([T('a', 'A'), T('b', 'B')], [{ a: 1, b: 2 }, { a: 3, b: 4 }])).toBe('A,B\r\n1,2\r\n3,4\r\n');
  });

  it('writes an empty single-column row as two quotes', () => {
    expect(csv([T('a', 'A')], [{ a: '' }, { a: 'x' }])).toBe('A\r\n""\r\nx\r\n');
    expect(csv([T('a', 'A'), T('b', 'B')], [{ a: '', b: '' }])).toBe('A,B\r\n,\r\n');
  });

  it('quotes a first field starting with ID (Excel reads it as SYLK otherwise)', () => {
    expect(csv([T('a', 'ID'), T('b', 'Name')], [{ a: 1, b: 'x' }])).toBe('"ID",Name\r\n1,x\r\n');
    expect(csv([T('a', 'IDX')], [{ a: 'IDY' }], { header: false })).toBe('"IDY"\r\n');
    expect(csv([T('a', 'Id')], [{ a: 'ID' }])).toBe('Id\r\nID\r\n');
    expect(csv([T('a', 'A'), T('b', 'ID')], [{ a: 1, b: 2 }])).toBe('A,ID\r\n1,2\r\n');
  });

  it('writes no header line with header: false', () => {
    expect(csv([T('a', 'A')], [{ a: 'x' }], { header: false })).toBe('x\r\n');
  });
});

describe('BOM, Arabic and the separator by locale', () => {
  it('starts with a BOM by default, and not with bom: false', () => {
    const g = grid([T('n', 'الاسم')], [{ n: 'محمد' }], AR);
    const input = { rows: g.model.displayed, columns: g.columns, ctx: AR };
    expect(toCsv(input)).toBe(`${BOM}الاسم\r\nمحمد\r\n`);
    expect(toCsv(input, { bom: false })).toBe('الاسم\r\nمحمد\r\n');
  });

  it('keeps Arabic text and its marks as they are, first column first', () => {
    expect(csv([T('a', 'أ'), T('b', 'ب')], [{ a: `${RLM}نص`, b: 'مرحبا, عالم' }], {}, AR)).toBe(`أ;ب\r\n${RLM}نص;مرحبا, عالم\r\n`);
  });

  it('picks ; where decimals are written with a comma, , elsewhere', () => {
    expect(csvSeparatorFor(FR)).toBe(';');
    expect(csvSeparatorFor(EN)).toBe(',');
    expect(csvSeparatorFor(localeCtx({ locale: 'de-DE' }))).toBe(';');
    expect(csvSeparatorFor(localeCtx({ locale: 'en-GB' }))).toBe(',');
    expect(csvSeparatorFor(AR)).toBe(';');
  });
});

describe('numbers', () => {
  const N = [{ id: 'n', header: 'N', type: 'number' as const }, { id: 't', header: 'T' }];
  it('French: ; and 1,5; English: , and 1.5', () => {
    expect(csv(N, [{ n: 1.5, t: 'a' }], {}, FR)).toBe('N;T\r\n1,5;a\r\n');
    expect(csv(N, [{ n: 1.5, t: 'a' }], {}, EN)).toBe('N,T\r\n1.5,a\r\n');
  });
  it('an explicit , with French writes the point; a tab keeps the comma', () => {
    expect(csv(N, [{ n: 1.5, t: 'a' }], { separator: ',' }, FR)).toBe('N,T\r\n1.5,a\r\n');
    expect(csv(N, [{ n: 1.5, t: 'a' }], { separator: '\t' }, FR)).toBe('N\tT\r\n1,5\ta\r\n');
  });
  it('raw keeps the machine form', () => {
    expect(csv(N, [{ n: 1.5, t: 'a' }], { numbers: 'raw' }, FR)).toBe('N;T\r\n1.5;a\r\n');
  });
  it('never groups thousands, and keeps exponents and zero', () => {
    expect(csv(N, [{ n: 1234567.5, t: '' }, { n: 0, t: '' }, { n: -0, t: '' }, { n: 1e21, t: '' }], {}, FR)).toBe('N;T\r\n1234567,5;\r\n0;\r\n0;\r\n1e+21;\r\n');
  });
  it('NaN is a blank (the number codec says so), an infinity a bad value: both written empty', () => {
    const out = summaryOf(N, [{ n: Number.NaN, t: 'a' }, { n: Number.POSITIVE_INFINITY, t: 'b' }]);
    expect(out.text).toBe('N,T\r\n,a\r\n,b\r\n');
    expect(out.summary).toEqual({ rows: 2, columns: 2, blank: 1, invalid: 1 });
  });
});

describe('days, instants, enums, booleans, custom codecs', () => {
  it('days are ISO', () => {
    expect(csv([{ id: 'd', header: 'D', type: 'day' }], [{ d: '2026-03-05' }], {}, FR)).toBe('D\r\n2026-03-05\r\n');
  });

  it('an instant is wall time in the display zone, the zone in the header', () => {
    const defs = [{ id: 'i', header: 'Date', type: 'instant' as const }];
    expect(csv(defs, [{ i: '2026-03-05T22:59:00Z' }], {}, EN)).toBe('Date (Africa/Algiers)\r\n2026-03-05 23:59:00\r\n');
    expect(csv(defs, [{ i: '2026-03-05T23:30:00Z' }], {}, EN)).toBe('Date (Africa/Algiers)\r\n2026-03-06 00:30:00\r\n');
    expect(csv(defs, [{ i: '2026-03-05T22:59:00.750Z' }], {}, EN)).toBe('Date (Africa/Algiers)\r\n2026-03-05 23:59:00\r\n');
    expect(csv(defs, [{ i: '1969-12-31T23:59:59.500Z' }], {}, localeCtx({ locale: 'en-US' }))).toBe('Date (UTC)\r\n1969-12-31 23:59:59\r\n');
  });

  it('instants: iso gives UTC with Z, the header unchanged', () => {
    const defs = [{ id: 'i', header: 'Date', type: 'instant' as const }];
    expect(csv(defs, [{ i: '2026-03-05T22:59:00Z' }], { instants: 'iso' })).toBe('Date\r\n2026-03-05T22:59:00Z\r\n');
    expect(csv(defs, [{ i: '2026-03-05T22:59:00.750Z' }], { instants: 'iso' })).toBe('Date\r\n2026-03-05T22:59:00.750Z\r\n');
  });

  it('a wall time follows the zone through a clock change (Paris, spring)', () => {
    const paris = localeCtx({ locale: 'en-US', timeZone: 'Europe/Paris' });
    const defs = [{ id: 'i', header: 'At', type: 'instant' as const }];
    expect(csv(defs, [{ i: '2026-03-29T00:59:59Z' }, { i: '2026-03-29T01:00:00Z' }], {}, paris)).toBe('At (Europe/Paris)\r\n2026-03-29 01:59:59\r\n2026-03-29 03:00:00\r\n');
  });

  it('enums give their label, or their code', () => {
    const defs = [{ id: 'e', header: 'E', type: 'enum' as const, enumOptions: [{ value: 'a', label: 'Admis' }, { value: 'b' }] }];
    expect(csv(defs, [{ e: 'a' }, { e: 'b' }, { e: 'zz' }])).toBe('E\r\nAdmis\r\nb\r\nzz\r\n');
    expect(csv(defs, [{ e: 'a' }], { enums: 'code' })).toBe('E\r\na\r\n');
  });

  it('booleans are true and false', () => {
    expect(csv([{ id: 'b', header: 'B', type: 'boolean' }], [{ b: true }, { b: false }])).toBe('B\r\ntrue\r\nfalse\r\n');
  });

  it('a custom codec writes its toExport', () => {
    const codec: ValueCodec<string> = { ...textCodecLike(), toExport: (v) => `<${v}>` };
    expect(csv([{ id: 'c', header: 'C', type: 'custom', codec }], [{ c: 'a' }])).toBe('C\r\n<a>\r\n');
  });

  it('digits are Latin in value mode, whatever the numerals', () => {
    const arab = localeCtx({ locale: 'ar-EG', numerals: 'locale', timeZone: 'Africa/Algiers' });
    expect(csv([{ id: 'n', header: 'N', type: 'number' }, { id: 'i', header: 'I', type: 'instant' }], [{ n: 12.5, i: '2026-03-05T22:59:00Z' }], { separator: ',' }, arab)).toBe(
      'N,I (Africa/Algiers)\r\n12.5,2026-03-05 23:59:00\r\n',
    );
  });
});

describe('display mode', () => {
  it('writes each cell as the codec formats it, every type', () => {
    const defs = [
      { id: 'n', header: 'N', type: 'number' as const },
      { id: 'd', header: 'D', type: 'day' as const },
      { id: 'i', header: 'I', type: 'instant' as const },
      { id: 'e', header: 'E', type: 'enum' as const, enumOptions: [{ value: 'a', label: 'Admis' }] },
      { id: 'b', header: 'B', type: 'boolean' as const },
    ];
    const row = { n: 1234.5, d: '2026-03-05', i: '2026-03-05T22:59:00Z', e: 'a', b: true };
    const g = grid(defs, [row], FR);
    const out = toCsv({ rows: g.model.displayed, columns: g.columns, ctx: FR }, { bom: false, text: 'display', separator: '\t' });
    const want = g.columns.visible().map((c) => c.codec.format(c.codec.coerce(row[c.id as keyof typeof row], FR), FR));
    expect(want[0]).not.toBe('1234.5');
    expect(out).toBe(`N\tD\tI\tE\tB\r\n${want.join('\t')}\r\n`);
  });
});

describe('blanks, bad values and the summary', () => {
  it('counts blanks and invalid cells, writes both empty', () => {
    const defs: ColumnDef<Row>[] = [
      { id: 'n', header: 'N', type: 'number' },
      { id: 'x', header: 'X', value: (r) => { if (r.x === 'boom') throw new Error('no'); return r.x; } },
    ];
    const r = summaryOf(defs, [{ n: 'abc', x: 'boom' }, { n: null, x: '' }, { n: 2, x: 'ok' }]);
    expect(r.text).toBe('N,X\r\n,\r\n,\r\n2,ok\r\n');
    expect(r.summary).toEqual({ rows: 3, columns: 2, blank: 2, invalid: 2 });
  });

  it('a null coerce of a non-blank is invalid', () => {
    const r = summaryOf([{ id: 'd', header: 'D', type: 'day' }], [{ d: '2026-02-30' }, { d: undefined }]);
    expect(r.text).toBe('D\r\n""\r\n""\r\n');
    expect(r.summary).toEqual({ rows: 2, columns: 1, blank: 1, invalid: 1 });
  });
});

describe('columns', () => {
  const defs = [T('a', 'A'), { id: 'h', header: 'H', hidden: true }, { id: 'p', header: 'P', pinned: 'end' as const }, T('b', 'B')];
  const rows = [{ a: 1, h: 2, p: 3, b: 4 }];
  it('are the visible ones by default, pinned end last', () => {
    expect(csv(defs, rows)).toBe('A,B,P\r\n1,4,3\r\n');
  });
  it('can be named, a hidden one included, in the order given', () => {
    expect(csv(defs, rows, { columns: ['h', 'a'] })).toBe('H,A\r\n2,1\r\n');
  });
  it('an unknown id is skipped, and told by csvColumns', () => {
    expect(csv(defs, rows, { columns: ['a', 'nope'] })).toBe('A\r\n1\r\n');
    const g = grid(defs, rows);
    const r = csvColumns(g.columns, ['a', 'nope']);
    expect(r.columns.map((c) => c.id)).toEqual(['a']);
    expect(r.problems.map((p) => ({ code: p.code, path: p.path, detail: p.detail }))).toEqual([{ code: 'unknown-column', path: 'csv.columns[1]', detail: 'nope' }]);
    expect(csvColumns(g.columns).columns.map((c) => c.id)).toEqual(['a', 'b', 'p']);
  });
  it('the header is the label, else the id; two equal labels stay equal; groups are not written', () => {
    expect(csv([{ id: 'g', header: 'Group', children: [T('a'), T('b', 'Same'), T('c', 'Same')] }], [{ a: 1, b: 2, c: 3 }])).toBe('a,Same,Same\r\n1,2,3\r\n');
  });
  it('no column, no line', () => {
    expect(csv([T('a', 'A')], [{ a: 1 }], { columns: [] })).toBe('');
  });
});

describe('identifiers kept as text (csv: text)', () => {
  const defs = [{ id: 'nin', header: 'NIN', csv: 'text' as const }];
  it('writes a digits-only value as a text formula', () => {
    expect(csv(defs, [{ nin: '0123' }, { nin: '109876543210123456' }])).toBe('NIN\r\n"=""0123"""\r\n"=""109876543210123456"""\r\n');
  });
  it('writes any other value of the column as usual, guard included', () => {
    expect(csv(defs, [{ nin: '=1+1' }, { nin: '01-23' }, { nin: '12 34' }, { nin: '' }])).toBe("NIN\r\n'=1+1\r\n01-23\r\n12 34\r\n\"\"\r\n");
  });
  it('a column without it writes digits plainly', () => {
    expect(csv([T('a', 'A')], [{ a: '0123' }])).toBe('A\r\n0123\r\n');
  });
});

describe('chunks', () => {
  const defs = [T('a', 'A'), { id: 'n', header: 'N', type: 'number' as const }];
  const rows = Array.from({ length: 23 }, (_, i) => ({ a: `r${i}`, n: i }));
  it.each([1, 7, 10_000])('chunks of %i joined equal the whole', (chunkRows) => {
    const g = grid(defs, rows);
    const input = { rows: g.model.displayed, columns: g.columns, ctx: EN };
    const it = csvChunks(input, { chunkRows });
    const parts: string[] = [];
    let r = it.next();
    while (!r.done) {
      parts.push(r.value);
      r = it.next();
    }
    expect(parts.join('')).toBe(toCsv(input, { chunkRows: 500 }));
    expect(parts.length).toBe(Math.ceil(23 / chunkRows));
    expect(parts[0]!.startsWith(`${BOM}A,N\r\nr0,0\r\n`)).toBe(true);
    expect(r.value).toEqual({ rows: 23, columns: 2, blank: 0, invalid: 0 });
  });
  it('no rows: one chunk, the header', () => {
    const g = grid(defs, []);
    const parts = [...csvChunks({ rows: g.model.displayed, columns: g.columns, ctx: EN }, { bom: false })];
    expect(parts).toEqual(['A,N\r\n']);
  });
  it('a bad chunkRows falls back to 500', () => {
    const g = grid(defs, Array.from({ length: 501 }, (_, i) => ({ a: 'x', n: i })));
    for (const chunkRows of [0, -1, 1.5, Number.NaN]) expect([...csvChunks({ rows: g.model.displayed, columns: g.columns, ctx: EN }, { chunkRows })].length).toBe(2);
  });
  it('at picks display indices, in the order given', () => {
    const g = grid(defs, rows);
    expect(toCsv({ rows: g.model.displayed, at: Uint32Array.of(5, 2), columns: g.columns, ctx: EN }, { bom: false })).toBe('A,N\r\nr5,5\r\nr2,2\r\n');
  });
});

describe('the edit overlay', () => {
  it('reads through the reader when it overlays', () => {
    const g = grid([T('a', 'A')], [{ a: 'x' }]);
    const reader = { version: 1, overlay: true, value: () => 'edited' };
    expect(toCsv({ rows: g.model.displayed, columns: g.columns, ctx: EN, reader }, { bom: false })).toBe('A\r\nedited\r\n');
  });
});

function textCodecLike(): ValueCodec<string> {
  return {
    kind: 'custom',
    keyKind: 'text',
    coerce: (raw) => (typeof raw === 'string' ? raw : null),
    parse: (t) => t,
    format: (v) => v,
    sortKey: (v) => v,
    compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    isEmpty: (v) => v === null || v === undefined || v === '',
    equals: (a, b) => a === b,
    toExport: (v) => v,
  };
}

function summaryOf(defs: Parameters<typeof grid>[0], rows: Record<string, unknown>[]): { text: string; summary: CsvSummary } {
  const g = grid(defs, rows);
  const it = csvChunks({ rows: g.model.displayed, columns: g.columns, ctx: EN }, { bom: false });
  let text = '';
  let r = it.next();
  while (!r.done) {
    text += r.value;
    r = it.next();
  }
  return { text, summary: r.value };
}

