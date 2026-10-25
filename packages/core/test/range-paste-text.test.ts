import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, type ColumnDef, type ResolvedColumn } from '@dzgrid/core';
import { decodeTsv, pasteText } from '@dzgrid/core/range';
import { parseInput } from '@dzgrid/core/edit';
import { iso } from '../../../conformance/runner/iso.js';

/**
 * Pasted text made ready for its column (Phase 5 step 10, clipboard.md 19, value-input.md; step10-plan P6;
 * owner QB3, QB10), then the sheet's « Excel interop » paste table: the clipboard text decoded, made
 * ready, and read by the editing reader the commit uses. Expectations written by hand from the sheet.
 */
type Row = Record<string, unknown> & { id: string };
const col = (def: ColumnDef<Row>): ResolvedColumn<unknown> => createColumnModel<Row>([def]).visible()[0] as ResolvedColumn<unknown>;
const RLM = String.fromCharCode(0x200f);
const N = col({ id: 'n', type: 'number' });
const T = col({ id: 't' });

describe('pasteText (P6)', () => {
  it('a number column: one currency sign or code at the start or the end removed, with its spaces (QB10)', () => {
    expect(pasteText('1 234,50 €', N)).toBe('1 234,50');
    expect(pasteText('1 234,50 €', N)).toBe('1 234,50');
    expect(pasteText('€ 12', N)).toBe('12');
    expect(pasteText('$1,234.50', N)).toBe('1,234.50');
    expect(pasteText('12 $', N)).toBe('12');
    expect(pasteText('1 234,50 DZD', N)).toBe('1 234,50');
    expect(pasteText('DZD 1 234,50', N)).toBe('1 234,50');
    expect(pasteText('1 234,50 د.ج', N)).toBe('1 234,50');
    expect(pasteText('-12 €', N)).toBe('-12');
  });

  it('a number column: nothing else is removed', () => {
    expect(pasteText('(1 234)', N)).toBe('(1 234)');
    expect(pasteText('12€34', N)).toBe('12€34');
    expect(pasteText('€', N)).toBe('€');
    expect(pasteText('€ 12 €', N)).toBe('12 €');
    expect(pasteText('12 kg', N)).toBe('12 kg');
    expect(pasteText("'=1+1", N)).toBe("'=1+1");
    expect(pasteText('="0123"', N)).toBe('="0123"');
  });

  it('other columns: the guard\'s quote before a formula start removed, our identifier mark removed', () => {
    expect(pasteText("'=1+1", T)).toBe('=1+1');
    expect(pasteText("'+33 6", T)).toBe('+33 6');
    expect(pasteText("'-", T)).toBe('-');
    expect(pasteText("'@x", T)).toBe('@x');
    expect(pasteText("'abc", T)).toBe("'abc");
    // Review 4 (lead): the copy guards a real `'=x` as `''=x`; one quote is read back.
    expect(pasteText("''=1", T)).toBe("'=1");
    expect(pasteText('="0123"', T)).toBe('0123');
    expect(pasteText('="a1"', T)).toBe('="a1"');
    expect(pasteText('="0123', T)).toBe('="0123');
    expect(pasteText('12 €', T)).toBe('12 €');
  });

  it('Arabic with RLM, spaces and everything else as it is', () => {
    expect(pasteText(`${RLM}محمد`, T)).toBe(`${RLM}محمد`);
    expect(pasteText('  a  ', T)).toBe('  a  ');
    expect(pasteText('', T)).toBe('');
  });
});

/** The text a cell receives from a clipboard text, as the paste reads it: decoded, made ready, read. */
const read = (clip: string, def: ColumnDef<Row>, locale: string, timeZone?: string) => {
  const c = col(def);
  const ctx = localeCtx({ locale, ...(timeZone && { timeZone }) });
  return decodeTsv(clip).map((r) => r.map((t) => {
    const r2 = parseInput(c, { text: pasteText(t, c) }, ctx);
    return r2.ok ? (def.type === 'instant' && typeof r2.value === 'number' ? iso(r2.value) : r2.value) : { refused: r2.code };
  }));
};

const E = col({ id: 'e', type: 'enum', enumOptions: [{ value: 'x', label: 'X' }] });
const D = col({ id: 'd', type: 'day' });

describe('currency codes and local forms (step-10 review 1–2; QB10 confirmed)', () => {
  it('only real ISO 4217 codes and the local forms DA, د.ج, دج, ج.م are removed; other capitals stay', () => {
    expect(pasteText('SKU 100', N)).toBe('SKU 100');
    expect(pasteText('100 PCS', N)).toBe('100 PCS');
    expect(pasteText('ABC 12', N)).toBe('ABC 12');
    expect(pasteText('12 EUR', N)).toBe('12');
    expect(pasteText('1 234,50 DA', N)).toBe('1 234,50');
    expect(pasteText('12 ج.م.', N)).toBe('12');
  });

  it('the currency limits: not a percent or a word; a sign kept before a leading symbol; other signs', () => {
    expect(pasteText('12 %', N)).toBe('12 %');
    expect(pasteText('12 abc', N)).toBe('12 abc');
    expect(pasteText('-$12', N)).toBe('-12');
    expect(pasteText('12 دج', N)).toBe('12');
    expect(pasteText('12 ﷼', N)).toBe('12');
    expect(pasteText('₹12', N)).toBe('12');
  });

  it('read as the paste reads: refused codes counted; Intl\'s own currency texts read, bidi marks and all', () => {
    const fmt = (l: string, c: string) => new Intl.NumberFormat(`${l}-u-nu-latn`, { style: 'currency', currency: c }).format(-1234.5);
    expect(read('SKU 100', { id: 'n', type: 'number' }, 'en-US')).toEqual([[{ refused: 'parse' }]]);
    expect(read('100 PCS', { id: 'n', type: 'number' }, 'en-US')).toEqual([[{ refused: 'parse' }]]);
    expect(read('ABC 12', { id: 'n', type: 'number' }, 'en-US')).toEqual([[{ refused: 'parse' }]]);
    expect(read(fmt('ar-DZ', 'DZD'), { id: 'n', type: 'number' }, 'ar-DZ')).toEqual([[-1234.5]]);
    expect(read(fmt('ar-EG', 'EGP'), { id: 'n', type: 'number' }, 'ar-EG')).toEqual([[-1234.5]]);
    expect(read(fmt('fr-DZ', 'DZD'), { id: 'n', type: 'number' }, 'fr-DZ')).toEqual([[-1234.5]]);
    expect(read('1 234,50 DA', { id: 'n', type: 'number' }, 'fr-DZ')).toEqual([[1234.5]]);
    expect(read('-$1,234.50', { id: 'n', type: 'number' }, 'en-US')).toEqual([[-1234.5]]);
    expect(read('(1 234 €)', { id: 'n', type: 'number' }, 'fr-FR')).toEqual([[{ refused: 'parse' }]]);
    expect(read('($12)', { id: 'n', type: 'number' }, 'en-US')).toEqual([[{ refused: 'parse' }]]);
  });
});

describe('guard read back (step-10 review, the analyser)', () => {
  it('only a quote directly before a formula start (or before our guarded quote) is removed', () => {
    expect(pasteText("' =1", T)).toBe("' =1");
    expect(pasteText("'\t=1", T)).toBe("'\t=1");
    expect(pasteText("'=1", E)).toBe('=1');
    expect(pasteText("' =1", E)).toBe("' =1");
    expect(pasteText("'=1", D)).toBe('=1');
    expect(pasteText("'\t=1", D)).toBe("'\t=1");
    expect(pasteText('="0123"x', T)).toBe('="0123"x');
    expect(pasteText('=""', T)).toBe('=""');
  });
});

describe('day columns (step-10 review 6)', () => {
  it('an ISO day with a midnight time reads as the day; Excel\'s other day texts are refused', () => {
    expect(read('2026-03-05 00:00:00', { id: 'd', type: 'day' }, 'fr-FR')).toEqual([['2026-03-05']]);
    expect(read('5-Mar-2026', { id: 'd', type: 'day' }, 'en-US')).toEqual([[{ refused: 'day' }]]);
    expect(read('46086', { id: 'd', type: 'day' }, 'en-US')).toEqual([[{ refused: 'day' }]]);
    expect(read('2026-03-05 10:00:00', { id: 'd', type: 'day' }, 'fr-FR')).toEqual([[{ refused: 'day' }]]);
  });
});

describe('the Excel interop paste table (clipboard.md, PB8)', () => {
  const txt: ColumnDef<Row> = { id: 't' };
  const num: ColumnDef<Row> = { id: 'n', type: 'number' };
  const day: ColumnDef<Row> = { id: 'd', type: 'day' };
  const yes: ColumnDef<Row> = { id: 'b', type: 'boolean' };
  it('quotes, newlines, a last empty row, a single Excel cell, a literal quote', () => {
    expect(read('"a\tb"\r\n', txt, 'fr-FR')).toEqual([['a\tb']]);
    expect(read('"l1\nl2"\tx\r\n', txt, 'fr-FR')).toEqual([['l1\nl2', 'x']]);
    // The empty text is the column's empty value (edit-validation.md 1): the second row's cell is cleared.
    expect(read('a\r\n\r\n', txt, 'fr-FR')).toEqual([['a'], [null]]);
    expect(read('12\r\n', num, 'fr-FR')).toEqual([[12]]);
    expect(read('5" inch', txt, 'en-US')).toEqual([['5" inch']]);
  });

  it('numbers by the grid\'s locale; a currency removed (QB10); nothing else guessed', () => {
    expect(read('1 234,50', num, 'fr-FR')).toEqual([[1234.5]]);
    expect(read('1,234.50', num, 'en-US')).toEqual([[1234.5]]);
    expect(read('1,5', num, 'en-US')).toEqual([[{ refused: 'parse' }]]);
    expect(read('١٢٫٥', num, 'ar-DZ')).toEqual([[12.5]]);
    expect(read('1 234,50 €', num, 'fr-FR')).toEqual([[1234.5]]);
    expect(read('1 234,50 DZD', num, 'fr-FR')).toEqual([[1234.5]]);
    expect(read('$1,234.50', num, 'en-US')).toEqual([[1234.5]]);
    expect(read('(1 234)', num, 'fr-FR')).toEqual([[{ refused: 'parse' }]]);
  });

  it('days in the locale\'s order or ISO; a wall time inside a clock change refused', () => {
    expect(read('05/03/2026', day, 'fr-FR')).toEqual([['2026-03-05']]);
    expect(read('3/5/2026', day, 'en-US')).toEqual([['2026-03-05']]);
    expect(read('2026-03-05', day, 'fr-FR')).toEqual([['2026-03-05']]);
    expect(read('2026-03-05', day, 'en-US')).toEqual([['2026-03-05']]);
    expect(read('2026-03-29 02:30:00', { id: 'i', type: 'instant' }, 'fr-FR', 'Europe/Paris')).toEqual([[{ refused: 'wall-time-skipped' }]]);
    expect(read('2026-03-05 23:59:00', { id: 'i', type: 'instant' }, 'fr-FR', 'Africa/Algiers')).toEqual([['2026-03-05T22:59:00Z']]);
  });

  it('yes/no words in French, English and Arabic', () => {
    expect(read('VRAI\tfaux', yes, 'fr-FR')).toEqual([[true, false]]);
    expect(read('نعم\tلا', yes, 'ar-DZ')).toEqual([[true, false]]);
    expect(read('true\tfalse', yes, 'en-US')).toEqual([[true, false]]);
  });

  it('Arabic with RLM untouched; our guard and identifier read back; a guard on a number refused', () => {
    expect(read(`${RLM}محمد`, txt, 'ar-DZ')).toEqual([[`${RLM}محمد`]]);
    expect(read("'=1+1", txt, 'en-US')).toEqual([['=1+1']]);
    expect(read("'=1+1", num, 'en-US')).toEqual([[{ refused: 'parse' }]]);
    expect(read('="0123"', txt, 'en-US')).toEqual([['0123']]);
    expect(read('="a1"', txt, 'en-US')).toEqual([['="a1"']]);
  });
});
