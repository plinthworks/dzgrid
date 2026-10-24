// A value refused while it is typed (Phase 5 step 5; edit-validation.md 3–10, step05-plan 13, 16; owner Q9
// « Mixte », O1): the field stays open with the text, `aria-invalid`, the bubble named by `aria-describedby`, the
// refusal of `/edit` on the cell, one assertive sentence each time; Tab refused stays; a blur refused drops the
// text (O1); Delete on a required cell; a server's reading code without the editors' texts.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { edit } from '../src/edit.js';
import { EN } from '../src/locales/en.js';
import { ed, cleanup, ECOLS, EDIT, emake, join, k, layout, tick, settle, type R } from './support-editors.js';

afterEach(cleanup);
beforeEach(layout);

const open = (t: ReturnType<typeof ed>, id: string, col: string, text: string) => {
  t.at(id, col);
  t.key('F2');
  t.type(text);
  return t.field()!;
};
const describedBy = (f: HTMLElement) => (f.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? `?${id}`);

describe('a local refusal (edit-validation.md 3, 5)', () => {
  it('1,5 in English: field kept with the text and caret, aria-invalid, the bubble, the refusal mark, one sentence', () => {
    const t = ed();
    const f = open(t, 'r5', 'n', '1,5');
    f.setSelectionRange(1, 1);
    t.key('Enter');
    expect(t.field()).toBe(f);
    expect(f.value).toBe('1,5');
    expect(f.selectionStart).toBe(1);
    expect(document.activeElement).toBe(f);
    expect(f.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(f)).toEqual(['number expected']);
    expect(t.bubble()!.hidden).toBe(false);
    expect(t.cell('r5', 'n')!.classList.contains('dzg-cell--refused')).toBe(true);
    expect(t.alert.mock.calls.map((c) => c[0])).toEqual(['Stock: value refused, number expected']);
    expect(t.focusAt()).toBe('r5/n');
    expect(t.of('cellEdited')).toEqual([]);
    expect(t.of('editingStopped')).toEqual([]);
  });

  it('the sentence reaches the assertive region (emptied first)', () => {
    vi.useFakeTimers();
    const t = ed();
    open(t, 'r5', 'n', 'abc');
    t.key('Enter');
    vi.advanceTimersByTime(200);
    expect(t.host.querySelector('.dzg-live[aria-live="assertive"]')!.textContent).toBe('Stock: value refused, number expected');
  });

  it('Arabic-Indic digits and the Arabic decimal sign are read in ar-EG', () => {
    const t = ed({ lang: 'ar', settings: { locale: 'ar-EG', numerals: 'locale' } });
    open(t, 'r5', 'n', '١٢٫٥');
    t.key('Enter');
    expect(t.field()).toBeNull();
    expect(t.of('cellEdited').map((e) => e.value)).toEqual([12.5]);
  });

  it('min: the limit quoted in the column’s format', () => {
    const t = ed({ lang: 'fr', columns: ECOLS.map((c) => (c.id === 'n' ? { ...c, edit: { min: 1500 } } : c)) });
    open(t, 'r5', 'n', '3');
    t.key('Enter');
    expect(t.alert.mock.calls.map((c) => c[0])).toEqual(['Stock : valeur refusée, au moins 1 500']);
    expect(describedBy(t.field()!)).toEqual(['au moins 1 500']);
  });

  it('Enter twice on the same wrong text: the refusal and the sentence twice', () => {
    const t = ed();
    open(t, 'r5', 'n', 'x');
    t.key('Enter');
    t.key('Enter');
    expect(t.alert).toHaveBeenCalledTimes(2);
    expect(t.field()).not.toBeNull();
  });

  it('typing keeps the bubble until the next keep; a value that passes closes the field, the bubble gone', () => {
    const t = ed();
    const f = open(t, 'r5', 'n', 'x');
    t.key('Enter');
    t.type('1');
    expect(t.bubble()!.hidden).toBe(false);
    expect(f.getAttribute('aria-invalid')).toBe('true');
    t.key('Enter');
    expect(t.field()).toBeNull();
    expect(t.bubble()?.hidden ?? true).toBe(true);
    expect(t.value('r5')).toBe('1');
  });

  it('a refused value then corrected and passing inside the open field: aria-invalid out, bubble hidden (refused then kept by Tab)', () => {
    const t = ed();
    const f = open(t, 'r5', 'n', 'x');
    t.key('Tab');
    expect(document.activeElement).toBe(f);
    expect(t.focusAt()).toBe('r5/n');
    t.type('2');
    t.key('Tab');
    expect(f.isConnected).toBe(false);
    expect(t.bubble()!.hidden).toBe(true);
    expect(t.focusAt()).toBe('r5/q');
    expect(t.field()!.hasAttribute('aria-invalid')).toBe(false);
    expect(t.field()!.hasAttribute('aria-describedby')).toBe(false);
  });

  it('Escape gives up: the bubble goes, nothing said', () => {
    const t = ed();
    open(t, 'r5', 'n', 'x');
    t.key('Enter');
    t.key('Escape');
    expect(t.field()).toBeNull();
    expect(t.bubble()!.hidden).toBe(true);
    expect(t.alert).toHaveBeenCalledTimes(1);
    expect(t.value('r5')).toBe('5');
  });
});

describe('O1: a refused value when the focus goes elsewhere', () => {
  it('the text dropped, the previous value back, the refusal mark, refusedDropped said; nothing to undo', async () => {
    const t = ed();
    const out = document.body.appendChild(document.createElement('button'));
    open(t, 'r5', 'n', '-4');
    out.focus();
    await tick();
    expect(t.field()).toBeNull();
    expect(t.value('r5')).toBe('5');
    expect(document.activeElement).toBe(out);
    expect(t.cell('r5', 'n')!.classList.contains('dzg-cell--refused')).toBe(true);
    expect(t.alert.mock.calls.map((c) => c[0])).toEqual(['Stock: value refused, change cancelled']);
    expect(t.api.canUndo).toBe(false);
    expect(t.of('editingStopped').map((e) => [e.kept, e.via])).toEqual([[false, 'blur']]);
  });
});

describe('Delete on a required cell (edit-validation.md 9)', () => {
  it('refused: the refusal mark and `edit.refused` with the required text; no field, the value kept', () => {
    const t = ed({ columns: ECOLS.map((c) => (c.id === 'q' ? { ...c, edit: { required: true } } : c)) });
    t.at('r5', 'q');
    t.key('Delete');
    expect(t.field()).toBeNull();
    expect(t.value('r5', 'q')).toBe('84');
    expect(t.cell('r5', 'q')!.classList.contains('dzg-cell--refused')).toBe(true);
    expect(t.alert.mock.calls.map((c) => c[0])).toEqual(['Price: value refused, a value is required']);
  });
});

describe('a server answering a reading code without the editors’ texts', () => {
  it('the generic reason, and no missing-message problem', async () => {
    const cols: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', width: 120 }, { id: 'n', header: 'Stock', type: 'number', width: 80, editable: true }];
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const f = edit<R>({ save: () => Promise.reject({ code: 'parse' }) });
    const m = emake({ columns: cols, settings: { features: [f], messages: join(EN, EDIT.en) } });
    f.api(m.g)!.commit([{ key: k('r1'), column: 'n', input: { text: '4' } }]);
    await settle();
    vi.advanceTimersByTime(200);
    expect(m.host.querySelector('.dzg-live[aria-live="assertive"]')!.textContent).toBe('Stock: not saved, invalid value. Previous value restored.');
    expect(m.events.filter((e) => e.type === 'problems')).toEqual([]);
  });
});
