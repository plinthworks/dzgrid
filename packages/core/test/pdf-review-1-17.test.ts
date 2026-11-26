// 1.17.0 independent review of the PDF writer (docs/behaviors/pdf-export.md): adversarial cases written by hand — the
// frame with many pages, string escaping, WinAnsi, the embedded TrueType subset (composite glyphs, damaged fonts),
// wrapping, very wide tables, empty grids, refusals, determinism. Every file is also read by Ghostscript and pdfminer
// when they are on the machine.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { clientRows, createColumnModel, localeCtx, type ColumnOrGroup } from '@dzgrid/core';
import { toPdf, type PdfOptions } from '@dzgrid/core/pdf';
import { joinParts, readPdf, texts } from './support/pdf-read.js';
import { tinyTtf } from './support/tiny-ttf.js';

type Row = Record<string, unknown> & { id: string };
const EN = localeCtx({ locale: 'en-US', timeZone: 'UTC' });

function pdf(defs: readonly ColumnOrGroup<Row>[], rows: readonly Record<string, unknown>[], o: PdfOptions = {}, x: { widths?: Record<string, number>; z?: boolean } = {}) {
  const columns = createColumnModel<Row>(defs);
  const model = clientRows<Row>({ rows: rows.map((r, i) => ({ id: `r${i}`, ...r }) as Row), getRowId: (r) => r.id, columns, ctx: EN });
  const r = toPdf({ rows: model.displayed, columns, ctx: EN, groups: defs, ...(x.widths && { widths: x.widths }) }, o, x.z ? (b) => new Uint8Array(deflateSync(b)) : undefined);
  const bytes = joinParts(r.parts);
  return { bytes, summary: r.summary, read: r.parts.length ? readPdf(bytes) : null, columns };
}

const run = (cmd: string, args: string[]) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 60_000 });
const GS = run('gs', ['--version']).status === 0;
const MINER = run('python3', ['-I', '-c', 'import pdfminer']).status === 0;
/** Ghostscript's verdict: '' when it reads every page without an error, a warning or a repair. */
function gs(bytes: Uint8Array): string {
  if (!GS) return '';
  const dir = mkdtempSync(join(tmpdir(), 'dzg-pdf-'));
  try {
    const f = join(dir, 'a.pdf');
    writeFileSync(f, bytes);
    const r = run('gs', ['-o', '/dev/null', '-dPDFSTOPONERROR', '-q', '-sDEVICE=nullpage', f]);
    const out = `${r.stderr}${r.stdout}`;
    return r.status === 0 && !/error|warning|repair/i.test(out) ? '' : out || `status ${r.status}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
/** pdfminer's text, page by page (null when it is not on the machine). */
function miner(bytes: Uint8Array): string[][] | null {
  if (!MINER) return null;
  const dir = mkdtempSync(join(tmpdir(), 'dzg-pdf-'));
  try {
    const f = join(dir, 'a.pdf');
    writeFileSync(f, bytes);
    const r = run('python3', ['-I', join(__dirname, '../../../scripts/pdf-text.py'), f]);
    expect(r.status, r.stderr).toBe(0);
    return (JSON.parse(r.stdout) as { lines: { text: string }[] }[]).map((p) => p.lines.map((l) => l.text));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const one: ColumnOrGroup<Row>[] = [{ id: 'name', header: 'Name' }];

describe('the frame with many pages', () => {
  it('3 000 rows: every object at its offset, /Size and /Count right, one free entry only, Ghostscript and pdfminer agree', () => {
    const rows = Array.from({ length: 3000 }, (_, i) => ({ name: `row ${i}` }));
    const { read, summary, bytes } = pdf(one, rows, {}, { z: true });
    expect(read!.errors).toEqual([]);
    const P = read!.pages.length;
    expect(P).toBe(summary.pages);
    expect(P).toBeGreaterThan(40);
    // 1 catalog, 2 info, 3 pages, 4 resources, 5–6 Helvetica and Helvetica-Bold, then a page and its content each.
    expect(read!.objects.size).toBe(6 + 2 * P);
    expect(read!.trailer).toContain(`/Size ${7 + 2 * P}`);
    expect(texts(read!.pages[P - 1]!).at(-1)).toBe(`${P} / ${P}`);
    expect(read!.pages.flatMap(texts).filter((t) => t.startsWith('row '))).toHaveLength(3000);
    expect(gs(bytes)).toBe('');
    const m = miner(bytes);
    if (m) {
      expect(m).toHaveLength(P);
      expect(m[P - 1]!.join('\n')).toContain('row 2999');
    }
  });
});

describe('strings', () => {
  it('parentheses and backslashes escaped: each text reads back exactly, in our reader, Ghostscript and pdfminer', () => {
    const odd = ['a(b', 'c)d', 'back\\slash', '(())', ')(', '\\)', 'end\\', '\\\\n'];
    const { read, bytes } = pdf(one, odd.map((name) => ({ name })), {}, { widths: { name: 300 } });
    expect(read!.errors).toEqual([]);
    const t = texts(read!.pages[0]!);
    for (const s of odd) expect(t, s).toContain(s);
    expect(gs(bytes)).toBe('');
    const m = miner(bytes);
    if (m) for (const s of odd) expect(m[0], s).toContain(s);
  });

  it('CR, LF and CR LF each break one line, never an empty one between; nothing raw in the stream', () => {
    const { read } = pdf(one, [{ name: 'a\rb' }, { name: 'c\r\nd' }, { name: 'e\nf' }], {}, { widths: { name: 300 } });
    const t = texts(read!.pages[0]!);
    expect(t).toEqual(['Name', 'a', 'b', 'c', 'd', 'e', 'f', '1 / 1']);
    expect(read!.pages[0]!.ops).not.toMatch(/\([^)]*[\r\x00-\x08][^)]*\) Tj/);
  });

  it('control characters become « ? » (never raw bytes in a string), told as pdf-glyph', () => {
    const { read, summary, bytes } = pdf(one, [{ name: 'a\u0001b\u007fc\u0085d' }]);
    expect(texts(read!.pages[0]!)).toContain('a?b?c?d');
    expect(summary.problems.map((p) => [p.code, p.detail])).toEqual([['pdf-glyph', '1']]);
    expect(gs(bytes)).toBe('');
  });
});

describe('WinAnsi', () => {
  it('every character of codes 128–159 written and read back; their widths are Helvetica\'s', () => {
    const high = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
    const { read, summary } = pdf(one, [{ name: high }], {}, { widths: { name: 600 } });
    expect(summary.problems).toEqual([]);
    expect(texts(read!.pages[0]!)).toContain(high);
    // Widths by the end edge of an end-aligned column (36 + 450 − 4 padding = 482): Adobe's metrics.
    const cases: [string, number][] = [['W', 944], ['€', 556], ['ÿ', 500], ['Ÿ', 667], ['‰', 1000], ['ƒ', 556]];
    const d: ColumnOrGroup<Row>[] = [{ id: 'name', header: 'N', align: 'end' }];
    for (const [c, w] of cases) {
      const r = pdf(d, [{ name: c }], { pageNumbers: false }, { widths: { name: 600 } }).read!.pages[0]!.runs.find((x) => x.text === c)!;
      expect(r.x + (w * 8) / 1000, c).toBeCloseTo(482, 2);
    }
  });

  it('a character outside the first plane is one « ? », not two', () => {
    const { read, summary } = pdf(one, [{ name: 'a😀b' }]);
    expect(texts(read!.pages[0]!)).toContain('a?b');
    expect(summary.problems.map((p) => p.code)).toEqual(['pdf-glyph']);
  });

  it('the title in the document\'s properties: a character outside the first plane as its two UTF-16 units', () => {
    const { read } = pdf(one, [{ name: 'a' }], { title: 'Q😀' });
    const info = [...read!.objects.values()].find((o) => o.dict.includes('/Producer'))!.dict;
    // Q = 0051, 😀 = D83D DE00.
    expect(info).toContain('/Title <FEFF0051d83dde00>');
  });
});

describe('an embedded TrueType font', () => {
  // Glyph ids: A 1, B 2, É 3 (composite of E and the acute), E 4, ´ 5, space 6, ?, digits, slash.
  const chars = ['A', 'B', 'É', 'E', '´', ' ', '?', '/', '1', '2', '3', 'N', 'a', 'm', 'e'];
  const u16 = (v: number) => [(v >> 8) & 255, v & 255];
  /** A composite glyph: E (4) then the acute (5); the first component with a scale, so the second is read past it. */
  const composite = (g: number) =>
    g === 3 ? [...u16(0xffff), ...u16(0), ...u16(0), ...u16(500), ...u16(800), ...u16(0x0001 | 0x0002 | 0x0008 | 0x0020), ...u16(4), ...u16(0), ...u16(0), ...u16(0x4000), ...u16(0x0002), ...u16(5), 0, 0] : undefined;
  const font = tinyTtf(chars, undefined, composite);
  const dir = (b: Uint8Array) => {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const m = new Map<string, [number, number]>();
    for (let k = 0; k < v.getUint16(4); k++) m.set(String.fromCharCode(...b.subarray(12 + k * 16, 16 + k * 16)), [v.getUint32(12 + k * 16 + 8), v.getUint32(12 + k * 16 + 12)]);
    return { v, m };
  };

  it('glyph ids and widths as the font gives them; a composite\'s components kept in the subset though never written', () => {
    const { read, bytes, summary } = pdf(one, [{ name: 'AÉ' }], { font: font.bytes, pageNumbers: false, header: false });
    expect(summary.problems).toEqual([]);
    expect(read!.errors).toEqual([]);
    // The content stream names glyphs 1 and 3, two bytes each.
    expect(read!.pages[0]!.ops).toContain('<00010003> Tj');
    expect(texts(read!.pages[0]!)).toEqual(['AÉ']);
    const cid = [...read!.objects.values()].find((o) => o.dict.includes('/CIDFontType2'))!.dict;
    expect(cid).toContain('/W [0 [600] 1 [510] 3 [530]]');
    const sub = [...read!.objects.values()].find((o) => o.dict.includes('/Length1'))!.stream!;
    const { v, m } = dir(sub);
    const at = (g: number) => v.getUint32(m.get('loca')![0] + g * 4);
    const len = (g: number) => at(g + 1) - at(g);
    expect(len(3), 'É').toBeGreaterThan(0);
    expect(len(4), 'E, a component').toBeGreaterThan(0);
    expect(len(5), 'the acute, the second component past a scaled first').toBeGreaterThan(0);
    expect(len(2), 'B, unused').toBe(0);
    expect(gs(bytes)).toBe('');
  });

  it('the same rows and font give the same bytes, deflated too', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ name: `AB ${i % 3}` }));
    const a = pdf(one, rows, { font: font.bytes }, { z: true }).bytes;
    const b = pdf(one, rows, { font: font.bytes }, { z: true }).bytes;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  const damaged = (patch: (v: DataView, m: Map<string, [number, number]>, b: Uint8Array) => void): Uint8Array => {
    const b = font.bytes.slice();
    const { v, m } = dir(b);
    patch(v, m, b);
    return b;
  };
  const cases: [string, Uint8Array][] = [
    ['hmtx past the end of the file', damaged((v, m, b) => {
      const at = 12 + [...m.keys()].indexOf('hmtx') * 16;
      v.setUint32(at + 8, b.length);
      v.setUint32(at + 12, 0);
    })],
    ['loca not increasing, past glyf', damaged((v, m) => v.setUint16(m.get('loca')![0] + 2, 0xfff0))],
    ['a truncated table directory', font.bytes.slice(0, 40)],
    ['a CFF font', Uint8Array.from([0x4f, 0x54, 0x54, 0x4f, ...font.bytes.slice(4)])],
  ];
  for (const [what, b] of cases) {
    it(`a damaged font (${what}): never a throw — pdf-font, Helvetica instead, a valid file`, () => {
      let r!: ReturnType<typeof pdf>;
      expect(() => (r = pdf(one, [{ name: 'AÉB' }], { font: b }))).not.toThrow();
      expect(r.summary.problems.map((p) => [p.code, p.path])).toEqual([['pdf-font', 'pdf.font']]);
      expect(texts(r.read!.pages[0]!)).toContain('AÉB');
      expect(gs(r.bytes)).toBe('');
    });
  }

  it('a composite whose components run on past its glyph: the walk stops at the glyph\'s end, never a throw, a valid file', () => {
    const b = damaged((v, m) => {
      // É's second component keeps MORE_COMPONENTS: the walk would read on into the next glyphs and tables.
      const [lo] = m.get('loca')!;
      const start = m.get('glyf')![0] + v.getUint16(lo + 3 * 2) * 2;
      v.setUint16(start + 10 + 10, 0x0002 | 0x0020);
    });
    let r!: ReturnType<typeof pdf>;
    expect(() => (r = pdf(one, [{ name: 'AÉ' }], { font: b, header: false, pageNumbers: false }))).not.toThrow();
    expect(r.read!.errors).toEqual([]);
    expect(texts(r.read!.pages[0]!)).toEqual(['AÉ']);
    // Only .notdef, A, É and its two components are kept: nothing read past É's end.
    const sub = [...r.read!.objects.values()].find((o) => o.dict.includes('/Length1'))!.stream!;
    const { v, m } = dir(sub);
    const at = (g: number) => v.getUint32(m.get('loca')![0] + g * 4);
    const kept = Array.from({ length: chars.length + 1 }, (_, g) => g).filter((g) => at(g + 1) > at(g));
    expect(kept).toEqual([0, 1, 3, 4, 5]);
    expect(gs(r.bytes)).toBe('');
  });

  it('a damaged bold font beside a good one: pdf-font at pdf.boldFont, the regular drawn heavier', () => {
    const { summary, read, bytes } = pdf(one, [{ name: 'AB' }], { font: font.bytes, boldFont: new Uint8Array(8) });
    expect(summary.problems.map((p) => [p.code, p.path])).toEqual([['pdf-font', 'pdf.boldFont']]);
    expect(read!.errors).toEqual([]);
    expect(read!.pages[0]!.ops).toContain('2 Tr');
    expect(gs(bytes)).toBe('');
  });
});

describe('layout extremes', () => {
  it('a cell wraps to three lines at most, each inside its column, the last ending « … »', () => {
    const long = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore';
    const { read } = pdf([{ id: 'name', header: 'N' }, { id: 'b', header: 'B' }], [{ name: long, b: 'x' }], {}, { widths: { name: 100, b: 100 } });
    const lines = read!.pages[0]!.runs.filter((r) => r.font === 'F1' && r.x < 111 && r.text !== '1 / 1');
    expect(lines.map((l) => l.text)).toHaveLength(3);
    expect(lines[2]!.text.endsWith('…')).toBe(true);
  });

  it('200 columns: shrunk to the page, the text at half its size, no NaN, every run on the page, a valid file', () => {
    const many = Array.from({ length: 200 }, (_, k) => ({ id: `c${k}`, header: `Column ${k}` }));
    const row = Object.fromEntries(many.map((c, k) => [c.id, `v${k}`]));
    const { read, bytes } = pdf(many, [row], {}, { widths: Object.fromEntries(many.map((c) => [c.id, 100])) });
    const p = read!.pages[0]!;
    expect(p.ops).not.toMatch(/NaN|Infinity/);
    for (const r of p.runs) expect(r.x).toBeGreaterThanOrEqual(0), expect(r.x).toBeLessThan(841.89);
    expect(p.runs.find((r) => r.text.startsWith('v'))!.size).toBe(4);
    expect(gs(bytes)).toBe('');
  });

  it('a row taller than a page (big size, many lines): its lines cut to the page, nothing drawn under the bottom margin', () => {
    const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    const { read, summary } = pdf(one, [{ name: 'a' }, { name: long }, { name: 'b' }], { fontSize: 24, wrap: 50, pageNumbers: false }, { widths: { name: 200 } });
    for (const p of read!.pages) for (const r of p.runs) expect(r.y, r.text).toBeGreaterThan(36);
    expect(read!.pages.flatMap(texts)).toContain('b');
    expect(summary.problems.map((p) => p.code)).toContain('pdf-text-cut');
  });

  it('an empty grid: one page, the header and « 1 / 1 »; no columns at all: one blank page; both valid', () => {
    const e = pdf([{ id: 'a', header: 'A' }, { id: 'b', header: 'B' }], []);
    expect(texts(e.read!.pages[0]!)).toEqual(['A', 'B', '1 / 1']);
    expect(e.summary).toMatchObject({ rows: 0, pages: 1 });
    expect(gs(e.bytes)).toBe('');
    const none = pdf([{ id: 'a' }], [{ a: 1 }], { columns: [] });
    expect(none.read!.errors).toEqual([]);
    expect(gs(none.bytes)).toBe('');
  });

  it('one row, a title, a footer: one page in order; the footer on a page of its own when the table fills the first', () => {
    const r = pdf(one, [{ name: 'only' }], { title: 'T', footer: 'F' });
    expect(texts(r.read!.pages[0]!)).toEqual(['T', 'Name', 'only', 'F', '1 / 1']);
    const rows = Array.from({ length: 400 }, (_, i) => ({ name: `r${i}` }));
    for (let n = 60; n < 75; n++) {
      const x = pdf(one, rows.slice(0, n), { footer: ['F1', 'F2', 'F3'] });
      const last = x.read!.pages.at(-1)!;
      expect(texts(last).slice(-4), `${n} rows`).toEqual(['F1', 'F2', 'F3', `${x.read!.pages.length} / ${x.read!.pages.length}`]);
      for (const run of last.runs.slice(0, -1)) expect(run.y, `${n} rows`).toBeGreaterThan(36);
    }
  });

  it('huge and odd numbers: the column\'s format, cut with « … » when too wide, never NaN or a throw', () => {
    const d: ColumnOrGroup<Row>[] = [{ id: 'n', header: 'N', type: 'number' }];
    const vals = [1e21, -1e15, Number.MAX_SAFE_INTEGER, 0.1 + 0.2, -0];
    const { read, summary, columns } = pdf(d, vals.map((n) => ({ n })), {}, { widths: { n: 2000 } });
    const t = texts(read!.pages[0]!);
    const col = columns.get('n')!;
    // `v` is any of the numbers above; the codec takes its own value type.
    for (const v of vals) expect(t, String(v)).toContain(col.codec.format(v as never, EN));
    expect(summary.problems).toEqual([]);
    const narrow = pdf(d, [{ n: 123456789.123 }, { n: -1e308 }, { n: Number.NaN }, { n: Infinity }], {}, { widths: { n: 30 } });
    expect(narrow.read!.pages[0]!.ops).not.toMatch(/NaN/);
    expect(narrow.summary.problems.map((p) => p.code)).toContain('pdf-text-cut');
  });
});

describe('refusals', () => {
  it('Hebrew, Syriac, Thai and Arabic in a group label, a page-number function or a subtitle: refused, no row data in the problem', () => {
    const g: ColumnOrGroup<Row>[] = [{ id: 'g', header: 'קבוצה', children: [{ id: 'name', header: 'Name' }] }];
    expect(pdf(g, [{ name: 'a' }]).summary.problems.map((p) => p.code)).toEqual(['pdf-script']);
    expect(pdf(one, [{ name: 'a' }], { pageNumbers: (p) => `صفحة ${p}` }).summary.problems.map((p) => [p.code, p.path])).toEqual([['pdf-script', 'pdf.pageNumbers']]);
    expect(pdf(one, [{ name: 'a' }], { subtitle: 'ܫܠܡܐ' }).summary.problems.map((p) => p.path)).toEqual(['pdf.subtitle']);
    const th = pdf(one, [{ name: 'secret ภาษาไทย' }]);
    expect(th.bytes.length).toBe(0);
    expect(JSON.stringify(th.summary.problems)).not.toContain('secret');
  });
});
