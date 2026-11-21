import type { DisplayedRows, FooterNode, GroupNode, ResolvedColumn, RowNode } from '@dzgrid/core';
import type { CsvScope } from '@dzgrid/core/csv';
import { pdfFile, pdfParts, PDF_MIME, type PdfInput, type PdfSummary } from '@dzgrid/core/pdf';
import type { GridContext } from '../../context.js';
import type { CsvExportOptions } from '../index.js';
import { SLICE_MS, type SliceEnv } from '../run/slice.js';

/**
 * The PDF file (1.17.0, docs/behaviors/pdf-export.md), the lazy part of a PDF export: the grid's widths, column groups
 * and direction read as the Excel file reads them; each cell's text as print writes it (a `showAs` share, a group's or
 * the totals row's cell; else the column's format, as the core reads it); the objects of `@dzgrid/core/pdf` compressed by
 * the browser (`CompressionStream('deflate')`, FlateDecode; stored where it is missing or fails), in slices of about
 * 16 ms with the cancel checked between them. Null when cancelled; no Blob when the core refused (`pdf-script`).
 */
export async function build(
  g: GridContext<unknown>, o: CsvExportOptions, held: { readonly rows: DisplayedRows<unknown>; readonly at: Uint32Array | null }, aggFuncs: PdfInput<unknown>['aggFuncs'], columns: readonly string[],
  env: SliceEnv, done: (rows: number) => void, c: { readonly scope: CsvScope; readonly rows: number },
): Promise<{ readonly blob: Blob | null; readonly sum: PdfSummary } | null> {
  const x: Record<string, unknown> = { ...(o.pdf === true ? {} : o.pdf!) };
  // A title, subtitle or footer function (as Excel's): asked here, the core gets texts; one that throws is reported and
  // left out (0, no text: the core tells `invalid-setting`).
  for (const k of ['title', 'subtitle', 'footer']) {
    if (typeof x[k] == 'function') {
      try {
        x[k] = (x[k] as (c: object) => unknown)({ ...c, query: g.kernel.query, now: Date.now(), ctx: g.ctx });
      } catch (err) {
        g.report(err);
        x[k] = 0;
      }
    }
  }
  const { layout } = g.columns;
  const widths: Record<string, number> = {};
  for (const s of [layout.start, layout.center, layout.end]) s.columns.forEach((col, i) => (widths[col.id] = s.widths.sizeAt(i)));
  for (const id of columns) widths[id] ??= g.columns.get(id)?.def.width!;
  const gr = g.grouped;
  const foot = g.foot;
  // Print's text (print/index.ts `cellText`): undefined leaves the core's.
  const text = (n: RowNode<unknown>, col: ResolvedColumn<unknown>): string | undefined =>
    n.kind === 'data' ? g.share?.(n, col) : foot && n === foot.node ? foot.cell(n as FooterNode, col) : n.kind === 'group' || n.kind === 'footer' ? gr?.cell(n as GroupNode | FooterNode, col) : undefined;
  const it = pdfParts(
    { ...held, columns: g.columns, ctx: g.ctx, widths, groups: g.settings.columns, aggFuncs, text, ...(gr && { groupLabel: gr.label }) },
    { header: o.header, treeColumn: o.treeColumn ?? gr?.column(), groupRows: o.groupRows, ...x, columns, rtl: (x['rtl'] as boolean) ?? g.dir === 'rtl' },
  );
  const Z = ((g.win ?? globalThis) as typeof globalThis).CompressionStream;
  const deflate = async (b: Uint8Array): Promise<Uint8Array | undefined> => {
    try {
      const cs = new Z!('deflate');
      const w = cs.writable.getWriter();
      w.write(b as Uint8Array<ArrayBuffer>).catch(() => {});
      w.close().catch(() => {});
      return new Uint8Array(await new Response(cs.readable).arrayBuffer());
    } catch {
      return undefined;
    }
  };
  const file = pdfFile();
  const parts: Uint8Array[] = [];
  let r: IteratorResult<number | { id: number; dict: string; data?: Uint8Array }, PdfSummary>;
  for (;;) {
    const start = env.now();
    do {
      r = it.next();
      if (r.done) break;
      const v = r.value;
      if (typeof v == 'number') done(v);
      else parts.push(...file.add(v, v.data && Z ? await deflate(v.data) : undefined));
    } while (env.now() - start < SLICE_MS);
    if (r.done) break;
    await env.yield();
    if (env.aborted()) return null;
  }
  const sum = r.value;
  return { blob: sum.pages ? new Blob([...parts, ...file.end()] as BlobPart[], { type: PDF_MIME }) : null, sum };
}
