import { problem, type ColumnModel, type LocaleCtx, type Problem } from '@dzgrid/core';
import { importRows, readCsv, readSheet, sharedStrings, sheetPath, zipEntries } from '@dzgrid/core/import';
import type { ImportFormat } from '../index.js';

/** What a file gave: its format as read (null: neither), the rows, what was refused. */
export interface Read {
  readonly format: ImportFormat | null;
  readonly rows: Record<string, unknown>[];
  readonly problems: Problem[];
}

/** Bytes as text: UTF-8 (its byte order mark dropped by the reader), else Windows-1252 (file-import.md 5). */
const decode = (W: typeof globalThis, b: Uint8Array): string => {
  try {
    return new W.TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new W.TextDecoder('windows-1252').decode(b);
  }
};

/** What the entries of one workbook may inflate to, together (file-import.md 6): a ZIP bomb stops there. */
const INFLATED = 128 * 1024 * 1024;

/**
 * A file's bytes into rows (file-import.md 4–10), in this chunk loaded at the first file: a ZIP's signature is Excel (its
 * first sheet, entries inflated by the browser's `DecompressionStream`, `max` bytes at most together), an old binary
 * workbook is refused, the rest is CSV; then the rows through the columns' codecs. Never throws: a file not read is a problem.
 */
export async function readFile(b: Uint8Array, accept: readonly ImportFormat[], columns: ColumnModel<unknown>, ctx: LocaleCtx, W: typeof globalThis, max = INFLATED): Promise<Read> {
  const zip = b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
  // An old binary workbook (its compound file's signature): neither format.
  const format: ImportFormat | null = zip ? 'xlsx' : b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 ? null : 'csv';
  const fail = (d: string): Read => ({ format, rows: [], problems: [problem('import-file', 'warning', 'file', d)] });
  if (!format || !accept.includes(format)) return fail('type');
  const all = columns.state().map((s) => columns.get(s.id)!);
  if (!zip) return { format, ...importRows(readCsv(decode(W, b)), all, ctx) };
  const z = zipEntries(b);
  if (!z) return fail('zip');
  let left = max;
  /** An entry's text; null when absent; a throw when it cannot be inflated, or inflates past what is left. */
  const text = async (name: string): Promise<string | null> => {
    const e = z.get(name);
    if (!e) return null;
    if (!e.method) return decode(W, e.data);
    if (e.method !== 8 || !W.DecompressionStream) throw 'deflate';
    const s = new W.ReadableStream<BufferSource>({ start: (c) => (c.enqueue(e.data as Uint8Array<ArrayBuffer>), c.close()) }).pipeThrough(new W.DecompressionStream('deflate-raw'));
    const parts: Uint8Array[] = [];
    for (const r = s.getReader(); ; ) {
      const { done, value } = await r.read();
      if (done) break;
      if ((left -= value.length) < 0) {
        void r.cancel().catch(() => {});
        throw 'size';
      }
      parts.push(value);
    }
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    parts.reduce((n, p) => (out.set(p, n), n + p.length), 0);
    return decode(W, out);
  };
  try {
    const path = sheetPath((await text('xl/workbook.xml')) ?? '', (await text('xl/_rels/workbook.xml.rels')) ?? '');
    const sheet = path && (await text(path));
    if (!sheet) return fail('sheet');
    return { format, ...importRows(readSheet(sheet, sharedStrings((await text('xl/sharedStrings.xml')) ?? '')), all, ctx) };
  } catch (err) {
    return fail(err === 'deflate' || err === 'size' ? err : 'zip');
  }
}
