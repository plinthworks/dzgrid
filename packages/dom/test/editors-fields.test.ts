// The text and number fields (Phase 5 step 5; editors.md 1–5, editing.md 23, step05-plan 9–11; owner S5-O5):
// what they carry (class, owner, name, length cap, direction, input mode) and the text they open with.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { ed, cleanup, ECOLS, rowsOf, type R } from './support-editors.js';

afterEach(cleanup);

const open = (t: ReturnType<typeof ed>, id: string, col: string) => {
  t.at(id, col);
  t.key('F2');
  return t.field()!;
};
const rowsWith = (n: number, q: number | null) => rowsOf(5).map((r, i) => (i === 1 ? { ...r, n, q: q as number } : r));

describe('every field', () => {
  it('class, owner, no autocomplete, the name from both headers, the Enter key hint, a 1 000-character cap', () => {
    const t = ed();
    const f = open(t, 'r2', 'n');
    expect(f.tagName).toBe('INPUT');
    expect(f.className).toBe('dzg-field');
    expect(f.getAttribute('data-dzg-owner')).toBe('editor');
    expect(f.getAttribute('autocomplete')).toBe('off');
    expect(f.getAttribute('aria-label')).toBe('Stock, Name 2');
    expect(f.getAttribute('enterkeyhint')).toBe('done');
    expect(f.maxLength).toBe(1000);
  });

  it('Arabic: the name joined by the Arabic comma', () => {
    const t = ed({ lang: 'ar' });
    expect(open(t, 'r2', 'n').getAttribute('aria-label')).toBe('Stock، Name 2');
  });

  it('`edit.maxLength` sets the cap; a longer value from the data opens whole', () => {
    const long = 'x'.repeat(1500);
    const cols: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', width: 120, editable: true }, { id: 's', header: 'S', width: 80, editable: true, edit: { maxLength: 20 } }];
    const t = ed({ columns: cols, rows: rowsOf(5).map((r) => ({ ...r, name: long })) });
    const f = open(t, 'r1', 'name');
    expect(f.value.length).toBe(1500);
    expect(f.maxLength).toBe(1000);
    t.key('Escape');
    expect(open(t, 'r1', 's').maxLength).toBe(20);
  });
});

describe('the text field', () => {
  it('dir=auto; spaces typed are kept (a text column keeps them)', () => {
    const t = ed();
    const f = open(t, 'r2', 'name');
    expect(f.getAttribute('dir')).toBe('auto');
    expect(f.hasAttribute('inputmode')).toBe(false);
    t.type('  a b  ');
    t.key('Enter');
    expect(t.of('cellEdited').map((e) => e.value)).toEqual(['  a b  ']);
  });

  it('opens a null value empty', () => {
    const t = ed({ rows: rowsOf(5).map((r, i) => (i === 1 ? { ...r, name: null as unknown as string } : r)) });
    expect(open(t, 'r1', 'name').value).toBe('');
  });
});

describe('the number field (editors.md 4)', () => {
  it('dir=ltr, inputmode=decimal, no spellcheck', () => {
    const t = ed();
    const f = open(t, 'r2', 'n');
    expect(f.getAttribute('dir')).toBe('ltr');
    expect(f.getAttribute('inputmode')).toBe('decimal');
    expect(f.getAttribute('spellcheck')).toBe('false');
  });

  it('French: the shortest round trip with the comma, no group sign (0.1 + 0.2, 1 234 567)', () => {
    const t = ed({ lang: 'fr', settings: { locale: 'fr-FR' }, rows: rowsWith(0.1 + 0.2, 1234567) });
    expect(open(t, 'r1', 'n').value).toBe('0,30000000000000004');
    t.key('Escape');
    expect(open(t, 'r1', 'q').value).toBe('1234567');
  });

  it('English: the point; a negative number; an exponent form opened as is', () => {
    const t = ed({ rows: rowsWith(-2.5, 1e21) });
    expect(open(t, 'r1', 'n').value).toBe('-2.5');
    t.key('Escape');
    expect(open(t, 'r1', 'q').value).toBe('1e+21');
    // Read back the same number: kept unchanged, nothing saved, no refusal.
    t.key('Enter');
    expect(t.field()).toBeNull();
    expect(t.of('cellEdited')).toEqual([]);
  });

  it('the grid’s own numerals (ar-EG): Arabic-Indic digits and the Arabic decimal sign', () => {
    const t = ed({ lang: 'ar', settings: { locale: 'ar-EG', numerals: 'locale' }, rows: rowsWith(12.5, 1234567) });
    expect(open(t, 'r1', 'n').value).toBe('١٢٫٥');
    t.key('Escape');
    expect(open(t, 'r1', 'q').value).toBe('١٢٣٤٥٦٧');
  });

  it('kept unchanged: no save (the text read back is the same number)', () => {
    const t = ed({ lang: 'fr', settings: { locale: 'fr-FR' }, rows: rowsWith(0.1 + 0.2, 3) });
    open(t, 'r1', 'n');
    t.key('Enter');
    expect(t.of('cellEdited')).toEqual([]);
  });

  it('a null number opens empty', () => {
    expect(open(ed({ rows: rowsWith(1, null) }), 'r1', 'q').value).toBe('');
  });
});

describe('the choice of field (editors.md 1)', () => {
  it('`edit.editor: \'text\'` on a number column: a text field; `\'number\'` forces a number field', () => {
    const cols: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', width: 120, editable: true, edit: { editor: 'number' } }, { id: 'n', header: 'N', type: 'number', width: 80, editable: true, edit: { editor: 'text' } }];
    const t = ed({ columns: cols });
    expect(open(t, 'r1', 'n').getAttribute('dir')).toBe('auto');
    t.key('Escape');
    expect(open(t, 'r1', 'name').getAttribute('inputmode')).toBe('decimal');
  });

  it('an unknown editor name: one unknown-part problem per columns version, and no field', () => {
    const cols: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', width: 120 }, { id: 'c', header: 'C', width: 80, editable: true, edit: { editor: 'color' } }];
    const t = ed({ columns: cols });
    t.at('r1', 'c');
    t.key('F2');
    t.key('x');
    t.at('r2', 'c');
    t.key('F2');
    expect(t.field()).toBeNull();
    const p = t.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string }[] }).problems).filter((x) => x.code === 'unknown-part');
    expect(p).toEqual([expect.objectContaining({ code: 'unknown-part', path: 'columns.c.edit.editor' })]);
  });

  it('the number column of ECOLS gets the number field, the text column the text field', () => {
    const t = ed({ columns: ECOLS });
    expect(open(t, 'r1', 'q').getAttribute('inputmode')).toBe('decimal');
  });
});
