/**
 * The Arabic CSV sample (step 23, docs/behaviors/angular-example.md): the real export
 * (`@dzgrid/dom/export`) of the audit screen's columns in Arabic, right to left, `ar-DZ` (Latin
 * digits), with a note column whose cells hold a comma, a semicolon or a double quote. Needs a
 * DOM (jsdom in vitest). Guard: perf/test/example-csv.test.ts; `npm run example:csv` writes it to
 * examples/angular-audit/out/audit-ar.csv for the owner's Excel check.
 */
import { createGrid, type GridMessages } from '@dzgrid/dom';
import { csvExport } from '@dzgrid/dom/export';
import type { ColumnDef } from '@dzgrid/core';
import { AR } from '@dzgrid/dom/locales/ar';
import { AR_EXPORT } from '@dzgrid/dom/locales/ar-export';
import { AUDIT_ZONE, auditColumns } from './audit-screen.js';
import { auditRow, type AuditRow } from './fake-server.js';

export const SAMPLE_ROWS = 120;
const NOTES = ['تمت المراجعة, "عاجل"', 'قسم 3; الطابق 2', 'بدون ملاحظة', 'طلب, ثم موافقة'] as const;

type SampleRow = AuditRow & { readonly note: string };

/** The file's bytes (BOM included) and the name the grid gave it. */
export async function arabicSample(): Promise<{ bytes: Uint8Array; fileName: string }> {
  const rows: SampleRow[] = Array.from({ length: SAMPLE_ROWS }, (_, i) => ({ ...auditRow(i), note: NOTES[i % NOTES.length]! }));
  const columns: ColumnDef<SampleRow, any>[] = [...(auditColumns('fetched', 'ar') as ColumnDef<SampleRow, any>[]), { id: 'note', header: 'ملاحظة', width: 220 }];
  const delivered: { blob?: Blob; fileName: string }[] = [];
  const exporter = csvExport({ canExport: true, deliver: (d) => void delivered.push(d) });
  const messages: GridMessages = { locale: AR.locale, text: { ...AR.text, ...AR_EXPORT.text } as GridMessages['text'] };
  const host = document.createElement('div');
  host.dir = 'rtl';
  document.body.append(host);
  const box = { block: 600, inline: 1200, scrollTop: 0, scrollInline: 0 };
  const grid = createGrid<SampleRow>(host, {
    rows, columns, getRowId: (r) => r.id, messages, locale: 'ar-DZ', timeZone: AUDIT_ZONE, direction: 'rtl', features: [exporter],
  }, { sync: true, geometry: { read: () => ({ ...box }), writeScrollTop: (px) => void (box.scrollTop = px), writeScrollInline: (px) => void (box.scrollInline = px) } });
  try {
    const outcome = await exporter.run('all');
    const got = delivered[0];
    if (outcome !== 'done' || !got?.blob) throw new Error(`the Arabic sample was not exported (${outcome})`);
    return { bytes: new Uint8Array(await got.blob.arrayBuffer()), fileName: got.fileName };
  } finally {
    grid.destroy();
    host.remove();
  }
}
