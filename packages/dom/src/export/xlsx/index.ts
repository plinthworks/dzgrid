import type { DisplayedRows } from '@dzgrid/core';
import { crc32, xlsxParts, zipFile, XLSX_MIME, type XlsxInput, type XlsxSummary, type ZipEntry } from '@dzgrid/core/xlsx';
import type { GridContext } from '../../context.js';
import type { CsvExportOptions } from '../index.js';
import { SLICE_MS, type SliceEnv } from '../run/slice.js';

/** One part being written: its CRC and size so far, and its deflater, or its bytes stored (no `CompressionStream`, or one that refused the format). */
interface Open {
  readonly name: string;
  crc: number;
  size: number;
  w: WritableStreamDefaultWriter<BufferSource> | null;
  out: Promise<ArrayBuffer> | null;
  raw: Uint8Array[];
}

/**
 * The Excel file (docs/behaviors/xlsx-export.md), the lazy part of an Excel export: the grid's layout read (widths,
 * start-pinned columns, groups, direction), the parts from `@dzgrid/core/xlsx` encoded and deflated by the browser
 * (`CompressionStream('deflate-raw')`; stored, part by part, where it is missing or refuses the format; a deflater that
 * fails midway fails the export), in slices of about 16 ms with the cancel checked between them. Null when cancelled;
 * no Blob past ZIP's or Excel's limits. The problems are the caller's to tell.
 */
export async function build(
  g: GridContext<unknown>, o: CsvExportOptions, held: { readonly rows: DisplayedRows<unknown>; readonly at: Uint32Array | null }, columns: readonly string[],
  spans: Partial<Pick<XlsxInput<unknown>, 'spans' | 'spanColumns'>>, env: SliceEnv, done: (rows: number) => void,
): Promise<{ readonly blob: Blob | null; readonly sum: XlsxSummary } | null> {
  const x = o.xlsx === true ? {} : o.xlsx!;
  const { layout } = g.columns;
  const widths: Record<string, number> = {};
  for (const s of [layout.start, layout.center, layout.end]) s.columns.forEach((c, i) => (widths[c.id] = s.widths.sizeAt(i)));
  // A hidden column named: its definition's width.
  for (const id of columns) widths[id] ??= g.columns.get(id)?.def.width!;
  const it = xlsxParts(
    { ...held, ...spans, columns: g.columns, ctx: g.ctx, widths, pinned: layout.start.columns.map((c) => c.id), groups: g.settings.columns },
    // CSV's options shared with Excel (its `tree`, `spans`, `instants` are CSV's own).
    { text: o.text, enums: o.enums, header: o.header, levelHeader: o.levelHeader, treeColumn: o.treeColumn, ...x, columns, sheetName: x.sheetName ?? g.msg('export.fileName'), rtl: x.rtl ?? g.dir === 'rtl', chunkRows: 200 },
  );
  const enc = new TextEncoder();
  const Z = ((g.win ?? globalThis) as typeof globalThis).CompressionStream;
  const entries: ZipEntry[] = [];
  let cur = null as Open | null;
  let broken: unknown = null;
  const close = async (p: Open): Promise<void> => {
    if (p.w) await p.w.close();
    if (broken) throw broken;
    entries.push({ name: p.name, crc: p.crc, size: p.size, method: p.w ? 8 : 0, data: p.w ? [new Uint8Array(await p.out!)] : p.raw });
  };
  const write = (p: Open, b: Uint8Array): void => {
    p.crc = crc32(b, p.crc);
    p.size += b.length;
    if (p.w) p.w.write(b as Uint8Array<ArrayBuffer>).catch((e: unknown) => (broken ??= e));
    else p.raw.push(b);
  };
  let r: IteratorResult<{ entry: string; text: string }, XlsxSummary>;
  let pieces = 0;
  for (;;) {
    const start = env.now();
    do {
      r = it.next();
      if (r.done) break;
      const { entry, text } = r.value;
      if (cur?.name !== entry) {
        if (cur) await close(cur);
        cur = { name: entry, crc: 0, size: 0, w: null, out: null, raw: [] };
        try {
          const cs = new Z!('deflate-raw');
          cur.w = cs.writable.getWriter();
          cur.out = new Response(cs.readable).arrayBuffer();
        } catch {
          /* stored */
        }
      }
      write(cur, enc.encode(text));
      if (entry.endsWith('t1.xml')) done(++pieces * 200);
    } while (env.now() - start < SLICE_MS);
    if (r.done) break;
    await cur?.w?.ready;
    await env.yield();
    if (env.aborted()) {
      cur?.w?.abort().catch(() => {});
      return null;
    }
  }
  if (cur) await close(cur);
  const z = zipFile(entries);
  const sum = { ...r.value, problems: [...r.value.problems, ...z.problems] };
  return { blob: sum.problems.some((p) => p.code === 'xlsx-too-large') ? null : new Blob(z.parts as BlobPart[], { type: XLSX_MIME }), sum };
}
