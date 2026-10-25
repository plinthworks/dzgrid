import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, NO_OVERLAY, type ColumnDef, type ValueReader } from '@dzgrid/core';
import { copyMatrix, encodeTsv, pasteText, type RangeBox } from '@dzgrid/core/range';
import { shown } from './support/shown.js';

/**
 * The values a copy writes (Phase 5 step 10, clipboard.md 4–8, the « Excel interop » copy table;
 * step10-plan C1–C4). Expectations written by hand from the sheet.
 */
type Row = Record<string, unknown> & { id: string };
const RLM = String.fromCharCode(0x200f);
const cols = (defs: ColumnDef<Row>[]) => createColumnModel<Row>(defs).visible();
const all = (rows: number, columns: number): RangeBox => ({ top: 0, bottom: rows - 1, start: 0, end: columns - 1 });
const one = (locale: string, def: ColumnDef<Row>, value: unknown, o: { timeZone?: string; raw?: boolean; guard?: boolean } = {}) => {
  const c = cols([def]);
  const ctx = localeCtx({ locale, ...(o.timeZone && { timeZone: o.timeZone }) });
  return copyMatrix(all(1, 1), shown<Row>(['r1'], { r1: { id: 'r1', [def.id]: value } }), c, { ctx, reader: NO_OVERLAY as ValueReader<Row>, ...(o.raw !== undefined && { raw: o.raw }), ...(o.guard !== undefined && { guard: o.guard }) });
};
const text1 = (...a: Parameters<typeof one>) => one(...a).text[0]![0];

describe('copy: the export values with a tab (clipboard.md 5, QB9)', () => {
  it('numbers in the locale\'s decimal mark, no groups, Latin digits; raw a point', () => {
    const n: ColumnDef<Row> = { id: 'n', type: 'number' };
    expect(text1('fr-FR', n, 1234.5)).toBe('1234,5');
    expect(text1('en-US', n, 1234.5)).toBe('1234.5');
    expect(text1('ar-DZ', n, 1.5)).toBe('1,5');
    expect(text1('ar-EG', n, 1.5)).toBe('1.5');
    expect(text1('fr-FR', n, 1.5, { raw: true })).toBe('1.5');
    expect(text1('fr-FR', n, -3)).toBe('-3');
  });

  it('days ISO; instants the wall time of the display zone; yes/no true/false; enum labels', () => {
    expect(text1('fr-FR', { id: 'd', type: 'day' }, '2026-03-05')).toBe('2026-03-05');
    expect(text1('fr-FR', { id: 'i', type: 'instant' }, '2026-03-05T22:59:00Z', { timeZone: 'Africa/Algiers' })).toBe('2026-03-05 23:59:00');
    expect(text1('en-US', { id: 'b', type: 'boolean' }, true)).toBe('true');
    expect(text1('en-US', { id: 'b', type: 'boolean' }, false)).toBe('false');
    expect(text1('fr-FR', { id: 'e', type: 'enum', enumOptions: [{ value: 'out', label: 'Rupture' }] }, 'out')).toBe('Rupture');
  });

  it('the formula guard (QB3) by default, off with guard: false; never on a typed number', () => {
    const t: ColumnDef<Row> = { id: 't' };
    expect(text1('en-US', t, '=1+1')).toBe("'=1+1");
    expect(text1('en-US', t, '@SUM(A1)')).toBe("'@SUM(A1)");
    expect(text1('en-US', t, '=1+1', { guard: false })).toBe('=1+1');
    expect(text1('en-US', { id: 'n', type: 'number' }, -5)).toBe('-5');
  });

  it('a digits-only identifier as ="0123"; Arabic with RLM untouched', () => {
    expect(text1('en-US', { id: 'id', csv: 'text' }, '0123')).toBe('="0123"');
    expect(text1('ar-DZ', { id: 't' }, `${RLM}محمد`)).toBe(`${RLM}محمد`);
  });

  it('blank and unreadable cells are empty; values coerced, null for them (C2)', () => {
    const c = cols([{ id: 'n', type: 'number' }, { id: 'd', type: 'day' }, { id: 't' }]);
    const m = copyMatrix(all(2, 3), shown<Row>(['r1', 'r2'], { r1: { id: 'r1', n: '', d: 'not a day', t: null }, r2: { id: 'r2', n: '12', d: '2026-03-05', t: 'x' } }), c, { ctx: localeCtx({ locale: 'en-US' }), reader: NO_OVERLAY as ValueReader<Row> });
    expect(m.text).toEqual([['', '', ''], ['12', '2026-03-05', 'x']]);
    expect(m.values).toEqual([[null, null, null], [12, '2026-03-05', 'x']]);
  });

  it('values are read through the edit overlay: what the user sees, not the host\'s old value', () => {
    const c = cols([{ id: 'n', type: 'number' }]);
    const reader: ValueReader<Row> = { version: 2, overlay: true, value: (col, row, id) => (id === 'r1' ? 99 : col.read(row)) };
    const m = copyMatrix(all(2, 1), shown<Row>(['r1', 'r2'], { r1: { id: 'r1', n: 1 }, r2: { id: 'r2', n: 2 } }), c, { ctx: localeCtx({ locale: 'en-US' }), reader });
    expect(m.text).toEqual([['99'], ['2']]);
    expect(m.values).toEqual([[99], [2]]);
  });

  it('a detail, a filler or a loading row inside the box writes no line (C4, D11)', () => {
    const c = cols([{ id: 't' }]);
    const m = copyMatrix(all(5, 1), shown<Row>(['r1', '> r1', '/g', 'r2', '~r2'], { r1: { id: 'r1', t: 'a' }, r2: { id: 'r2', t: 'b' } }), c, { ctx: localeCtx({ locale: 'en-US' }), reader: NO_OVERLAY as ValueReader<Row> });
    expect(m.text).toEqual([['a'], ['b']]);
    expect(m.values).toEqual([['a'], ['b']]);
  });

  it('only the box\'s columns, in reading order (pinned first; right to left is logical too)', () => {
    const model = createColumnModel<Row>([{ id: 'a' }, { id: 'b' }, { id: 'c', pinned: 'start' }]);
    const c = model.visible();
    const m = copyMatrix({ top: 0, bottom: 0, start: 0, end: 1 }, shown<Row>(['r1'], { r1: { id: 'r1', a: 'A', b: 'B', c: 'C' } }), c, { ctx: localeCtx({ locale: 'ar-DZ' }), reader: NO_OVERLAY as ValueReader<Row> });
    expect(m.text).toEqual([['C', 'A']]);
  });

  it('headers through the API only: a first row, the zone after a wall-time instant, not in values (C3)', () => {
    const c = cols([{ id: 'nom', header: 'Nom' }, { id: 'at', header: 'Date', type: 'instant' }]);
    const d = shown<Row>(['r1'], { r1: { id: 'r1', nom: 'Ali', at: '2026-03-05T22:59:00Z' } });
    const ctx = localeCtx({ locale: 'fr-FR', timeZone: 'Africa/Algiers' });
    const plain = copyMatrix(all(1, 2), d, c, { ctx, reader: NO_OVERLAY as ValueReader<Row> });
    expect(plain.text).toEqual([['Ali', '2026-03-05 23:59:00']]);
    const m = copyMatrix(all(1, 2), d, c, { ctx, reader: NO_OVERLAY as ValueReader<Row>, headers: true });
    expect(m.text).toEqual([['Nom', 'Date (Africa/Algiers)'], ['Ali', '2026-03-05 23:59:00']]);
    expect(m.values).toEqual([['Ali', 1772751540000]]);
  });

  it('a tree\'s column is copied without its indent', () => {
    const c = cols([{ id: 'name' }]);
    const d = shown<Row>(['p', 'c1'], { p: { id: 'p', name: 'Parent' }, c1: { id: 'c1', name: 'Child' } });
    expect(copyMatrix(all(2, 1), d, c, { ctx: localeCtx({ locale: 'en-US' }), reader: NO_OVERLAY as ValueReader<Row> }).text).toEqual([['Parent'], ['Child']]);
  });

  it('the TSV of a copy: tabs, newlines and quotes quoted; a last empty row kept (clipboard.md 10)', () => {
    const c = cols([{ id: 't' }, { id: 'u' }]);
    const d = shown<Row>(['r1', 'r2'], { r1: { id: 'r1', t: 'a\tb', u: '5" inch' }, r2: { id: 'r2', t: '', u: '' } });
    const m = copyMatrix(all(2, 2), d, c, { ctx: localeCtx({ locale: 'en-US' }), reader: NO_OVERLAY as ValueReader<Row> });
    expect(encodeTsv(m.text)).toBe('"a\tb"\t"5"" inch"\r\n\t\r\n');
  });

  it('a real quote before a formula start is guarded too, so it survives a trip through Excel and back (review 4)', () => {
    const t: ColumnDef<Row> = { id: 't' };
    expect(text1('en-US', t, "'=x")).toBe("''=x");
    expect(text1('en-US', t, "'+33 6")).toBe("''+33 6");
    expect(text1('en-US', t, "'abc")).toBe("'abc");
    const c = cols([t])[0]!;
    for (const v of ["'=x", "'+33 6", '=1+1', "'abc", '-'])
      expect(pasteText(text1('en-US', t, v)!, c), v).toBe(v);
    expect(text1('en-US', t, "'=x", { guard: false })).toBe("'=x");
  });
});
