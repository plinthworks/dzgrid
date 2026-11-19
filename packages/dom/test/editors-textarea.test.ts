// The long-text editor (1.14.0, docs/behaviors/editors.md 18–22): `edit: { editor: 'textarea' }` with
// `editors({ textarea: textareaEditor })`. Written before the code; expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { textareaEditor } from '../src/editors-textarea.js';
import { ed, cleanup, tick, type R } from './support-editors.js';

afterEach(cleanup);

type Row = R & { note: string };
const COLS: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'note', header: 'Note', width: 160, editable: true, edit: { editor: 'textarea', maxLength: 50 } },
  { id: 'n', header: 'Stock', type: 'number', width: 80, editable: true },
];
const grid = (o: { bare?: boolean; lang?: 'en' | 'ar' } = {}) => {
  const t = ed({ lang: o.lang ?? 'en', columns: COLS as never, rows: Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, name: `Name ${i}`, n: i, s: '', q: 0, note: i === 1 ? 'one\ntwo' : '' })) as never, ...(!o.bare && { options: { textarea: textareaEditor } }) }); // rows of the extended shape
  const box = () => t.host.querySelector<HTMLTextAreaElement>('textarea.dzg-field');
  const open = (id = 'r1') => {
    t.at(id, 'note');
    t.key('F2');
    return box()!;
  };
  const press = (key: string, init: KeyboardEventInit = {}) => t.key(key, init, box()!);
  const saved = () => t.of('cellEdited').map((e) => [e.column, e.value]);
  return { ...t, box, open, press, saved };
};

describe('the long-text editor (editors.md 18–22)', () => {
  it('opens a multi-line field over the cell with the text, line breaks kept, named like every field, dir auto, capped', () => {
    const t = grid();
    const b = t.open();
    expect(b).toBeInstanceOf(HTMLTextAreaElement);
    expect(b.value).toBe('one\ntwo');
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute('aria-label')).toBe('Note, Name 1');
    expect(b.getAttribute('dir')).toBe('auto');
    expect(b.maxLength).toBe(50);
    expect(b.getAttribute('data-dzg-owner')).toBe('editor');
    expect(b.closest<HTMLElement>('.dzg-cell')!.dataset['col']).toBe('note');
  });

  it('Enter, Shift+Enter and Alt+Enter insert a line at the caret; nothing kept, the field stays open', () => {
    const t = grid();
    const b = t.open();
    b.setSelectionRange(3, 3);
    expect(t.press('Enter').defaultPrevented).toBe(true);
    expect(b.value).toBe('one\n\ntwo');
    expect(b.selectionStart).toBe(4);
    t.press('Enter', { shiftKey: true });
    t.press('Enter', { altKey: true });
    expect(b.value).toBe('one\n\n\n\ntwo');
    expect(t.box()).toBe(b);
    expect(t.saved()).toEqual([]);
  });

  it('Ctrl+Enter keeps the text (line breaks kept) and closes, the cell focused', () => {
    const t = grid();
    const b = t.open('r2');
    b.value = 'a\nb';
    t.press('Enter', { ctrlKey: true });
    expect(t.saved()).toEqual([['note', 'a\nb']]);
    expect(t.box()).toBe(null);
    expect(document.activeElement).toBe(t.cell('r2', 'note'));
  });

  it('Tab keeps and opens the next editable cell; Escape gives up', () => {
    const t = grid();
    let b = t.open('r3');
    b.value = 'x';
    t.press('Tab');
    expect(t.saved()).toEqual([['note', 'x']]);
    expect(t.focusAt()).toBe('r3/n');
    t.key('Escape');
    b = t.open('r4');
    b.value = 'gone';
    t.press('Escape');
    expect(t.saved()).toEqual([['note', 'x']]);
    expect(t.box()).toBe(null);
  });

  it('the arrows, Home, End, PageUp and PageDown stay in the text: the grid does not move', () => {
    const t = grid();
    const b = t.open('r5');
    for (const k of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageDown', 'PageUp']) t.press(k);
    expect(t.box()).toBe(b);
    expect(t.focusAt()).toBe('r5/note');
  });

  it('a blur keeps the text', async () => {
    const t = grid();
    const b = t.open('r6');
    b.value = 'kept';
    b.blur();
    b.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await tick();
    expect(t.saved()).toEqual([['note', 'kept']]);
  });

  it('typing a character opens it with that character', () => {
    const t = grid();
    t.at('r7', 'note');
    t.key('z');
    expect(t.box()!.value).toBe('z');
  });

  it('without textareaEditor: the one-line field, one missing-feature warning for the column', () => {
    const t = grid({ bare: true });
    t.at('r1', 'note');
    t.key('F2');
    expect(t.box()).toBe(null);
    expect(t.field()!.tagName).toBe('INPUT');
    expect(t.of('problems').flatMap((e) => e.problems).filter((p) => p.code === 'missing-feature')).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'columns.note.edit', detail: '@dzgrid/dom/editors-textarea' }]);
  });
});

describe('the caret keys stay in the text (editors.md 20)', () => {
  it('Home and End go to the line’s ends, Ctrl+Home / Ctrl+End and the page keys to the text’s; Shift extends; all taken', () => {
    const t = grid();
    const b = t.open('r1'); // 'one\ntwo'
    b.setSelectionRange(5, 5);
    expect(t.press('Home').defaultPrevented).toBe(true);
    expect([b.selectionStart, b.selectionEnd]).toEqual([4, 4]);
    t.press('End');
    expect([b.selectionStart, b.selectionEnd]).toEqual([7, 7]);
    b.setSelectionRange(1, 1);
    t.press('End');
    expect(b.selectionStart).toBe(3);
    t.press('Home', { shiftKey: true });
    expect([b.selectionStart, b.selectionEnd]).toEqual([0, 3]);
    t.press('End', { ctrlKey: true });
    expect(b.selectionStart).toBe(7);
    t.press('PageUp');
    expect(b.selectionStart).toBe(0);
    t.press('PageDown');
    expect(b.selectionStart).toBe(7);
  });
});
