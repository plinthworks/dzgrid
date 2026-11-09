// Importing a CSV or Excel file (docs/behaviors/file-import.md, 1.9.0 lot B): the button, the drop zone, the reading
// chunk, the texts. Files made up here; expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef, Problem } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import { fileImport, IMPORT_KEYS, type FileImportOptions } from '../src/import.js';
import { EN } from '../src/locales/en.js';
import { EN_IMPORT } from '../src/locales/en-import.js';
import { storedZip } from '../../core/test/support-zip.js';

type T = { id: string; name: string; qty: number };
const COLUMNS: ColumnDef<T, any>[] = [{ id: 'name', header: 'Name' }, { id: 'qty', header: 'Qty', type: 'number' }];
const grids: GridInstance<T>[] = [];
afterEach(() => { for (const g of grids.splice(0)) g.destroy(); document.body.innerHTML = ''; });

type Got = { rows: Record<string, unknown>[]; problems: readonly Problem[]; file: { name: string; format: string | null } };
function make(o: Partial<FileImportOptions> = {}, text: object = EN_IMPORT.text) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 300, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const got: Got[] = [];
  let done: () => void = () => {};
  const f = fileImport({ onRows: (rows, problems, file) => { got.push({ rows, problems, file }); done(); }, ...o });
  // `text` may lack the import's keys on purpose (the setup refuses them): a bundle the type would not let through.
  const g = createGrid<T>(host, { rows: [], getRowId: (r) => r.id, columns: COLUMNS, locale: 'en-US', messages: { ...EN, text: { ...EN.text, ...text } } as never, features: [f] }, { geometry, sync: true });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<T> }).context;
  const announce = vi.spyOn(ctx.live, 'announce');
  const next = () => new Promise<Got>((r) => (done = () => r(got.at(-1)!)));
  return { g, host, ctx, f, got, next, api: f.api(g)!, said: () => announce.mock.calls.map((c) => c[0]) };
}
const file = (data: BlobPart, name: string) => new File([data], name);
/** A drag event carrying files (jsdom has no DataTransfer): its types and files. */
const drag = (type: string, files: File[] = [], types = ['Files']) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: { types, files, dropEffect: 'none' } });
  return e;
};
const WB = '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>';
const RELS = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>';
const SHEET = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>qty</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>4.5</v></c></row></sheetData></worksheet>';
const SST = '<sst><si><t>Name</t></si><si><t>Ada</t></si></sst>';

describe('fileImport()', () => {
  it('texts: the three keys, in each bundle; missing ones refused at setup', async () => {
    expect([...IMPORT_KEYS].sort()).toEqual(['import.drop', 'import.failed', 'import.read']);
    for (const lang of ['en', 'fr', 'ar']) expect(Object.keys((await import(`../src/locales/${lang}-import.ts`))[`${lang.toUpperCase()}_IMPORT`].text).sort()).toEqual([...IMPORT_KEYS].sort());
    expect(() => make({}, {})).toThrow(/fileImport: missing import.drop, import.read, import.failed/);
  });

  it('read(file): a CSV, the rows handed to the application, the grid’s rows untouched, said (1, 5, 11)', async () => {
    const t = make();
    await t.api.read(file('Name;Qty\r\nAda;3\r\nBob;x\r\n', 'list.csv'));
    expect(t.got).toEqual([{ rows: [{ name: 'Ada', qty: 3 }, { name: 'Bob' }], problems: [{ code: 'import-cell', severity: 'warning', path: 'rows[1].qty', detail: 'parse' }], file: { name: 'list.csv', format: 'csv' } }]);
    expect(t.g.kernel.rows.displayed.count).toBe(0);
    expect(t.said()).toEqual(['Rows read: 2, problems: 1']);
  });

  it('not valid UTF-8: read as Windows-1252 (5)', async () => {
    const t = make();
    // « Né » in Windows-1252: 0x4E 0xE9.
    await t.api.read(file(Uint8Array.from([...new TextEncoder().encode('Name\n'), 0x4e, 0xe9, 0x0a]), 'old.csv'));
    expect(t.got[0]!.rows).toEqual([{ name: 'Né' }]);
  });

  it('an .xlsx, stored and deflated (DecompressionStream), the first sheet (6)', async () => {
    const t = make();
    await t.api.read(file(storedZip({ 'xl/workbook.xml': WB, 'xl/_rels/workbook.xml.rels': RELS, 'xl/sharedStrings.xml': SST, 'xl/worksheets/sheet1.xml': SHEET }) as BlobPart, 'a.xlsx'));
    expect(t.got[0]).toEqual({ rows: [{ name: 'Ada', qty: 4.5 }], problems: [], file: { name: 'a.xlsx', format: 'xlsx' } });
    // The same sheet deflated: the stored ZIP's entry rewritten as method 8.
    const z = storedZip({ 'xl/workbook.xml': WB, 'xl/_rels/workbook.xml.rels': RELS, 'xl/sharedStrings.xml': SST, 'xl/worksheets/sheet1.xml': SHEET }, 0, 8);
    await t.api.read(file(z as BlobPart, 'b.xlsx'));
    expect(t.got[1]!.rows).toEqual([{ name: 'Ada', qty: 4.5 }]);
  });

  it('a format not accepted, an old binary .xls, a broken ZIP: no rows, told, said (4, 6, 11)', async () => {
    const t = make({ accept: ['xlsx'] });
    await t.api.read(file('Name\nAda\n', 'a.csv'));
    await t.api.read(file(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3]), 'old.xls'));
    await t.api.read(file(Uint8Array.from([0x50, 0x4b, 3, 4, 9, 9]), 'cut.xlsx'));
    expect(t.got.map((x) => [x.rows.length, x.problems.map((p) => p.detail), x.file.format])).toEqual([[0, ['type'], 'csv'], [0, ['type'], null], [0, ['zip'], 'xlsx']]);
    expect(t.said()).toEqual(['This file cannot be read', 'This file cannot be read', 'This file cannot be read']);
  });

  it('bind(button): a click opens the picker filtered by accept; the file chosen is read; unbind stops it (2)', async () => {
    const t = make();
    const button = document.body.appendChild(document.createElement('button'));
    const clicks: HTMLInputElement[] = [];
    const spy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { clicks.push(this); });
    const off = t.api.bind(button);
    button.click();
    expect(clicks).toHaveLength(1);
    expect([clicks[0]!.type, clicks[0]!.accept]).toEqual(['file', '.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
    Object.defineProperty(clicks[0]!, 'files', { value: [file('qty\n7\n', 'n.csv')] });
    const p = t.next();
    clicks[0]!.dispatchEvent(new Event('change'));
    expect((await p).rows).toEqual([{ qty: 7 }]);
    off();
    button.click();
    expect(clicks).toHaveLength(1);
    spy.mockRestore();
  });

  it('the drop zone: shown and said while files are dragged over, hidden on leave; a drop reads the first file (3)', async () => {
    const t = make();
    const root = t.host.querySelector<HTMLElement>('.dzg')!;
    root.dispatchEvent(drag('dragenter'));
    const over = drag('dragover');
    root.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(root.hasAttribute('data-dzg-drop')).toBe(true);
    const zone = root.querySelector<HTMLElement>('.dzg-drop')!;
    expect([zone.textContent, zone.getAttribute('aria-hidden')]).toEqual(['Drop the file to import it', 'true']);
    expect(t.said()).toEqual(['Drop the file to import it']);
    root.dispatchEvent(drag('dragleave'));
    expect(root.hasAttribute('data-dzg-drop')).toBe(false);
    root.dispatchEvent(drag('dragenter'));
    const p = t.next();
    const d = drag('drop', [file('Name\nAda\n', 'a.csv'), file('Name\nBob\n', 'b.csv')]);
    root.dispatchEvent(d);
    expect(d.defaultPrevented).toBe(true);
    expect(root.hasAttribute('data-dzg-drop')).toBe(false);
    const r = await p;
    expect([r.rows, r.problems, r.file.name]).toEqual([[{ name: 'Ada' }], [{ code: 'import-file', severity: 'warning', path: 'file', detail: 'many' }], 'a.csv']);
  });

  it('other drags (text, a row) are not taken; drop: false takes none', () => {
    const t = make();
    const root = t.host.querySelector<HTMLElement>('.dzg')!;
    const over = drag('dragover', [], ['text/plain']);
    root.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
    expect(root.hasAttribute('data-dzg-drop')).toBe(false);
    const u = make({ drop: false });
    const r2 = u.host.querySelector<HTMLElement>('.dzg')!;
    const o2 = drag('dragover');
    r2.dispatchEvent(o2);
    expect(o2.defaultPrevented).toBe(false);
  });

  it('destroyed: the zone and the listeners gone', () => {
    const t = make();
    const root = t.host.querySelector<HTMLElement>('.dzg')!;
    t.g.destroy();
    const over = drag('dragover');
    root.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
    expect(t.f.api(t.g)).toBeNull();
  });
});
