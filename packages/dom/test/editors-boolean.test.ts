// The yes/no editor (Phase 5 step 6, step06-plan « Behaviour » 11; editors.md 10–11; O8): no field — Space and
// Enter toggle an editable yes/no cell (Enter goes to a part that takes the focus first), a double click or a
// double tap toggles once, Delete clears; the order null → true → false → true; one save each, origin `edit`, no
// editingStarted; a refusal blinks and is said; the new text is said politely. Space elsewhere still selects.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isSelected, type ColumnDef } from '@dzgrid/core';
import { definePart } from '../src/part.js';
import { ed, cleanup, k, rowsOf, type R } from './support-editors.js';

afterEach(cleanup);

type Row = R & { ok: boolean | null };
const COLS: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'ok', header: 'OK', type: 'boolean', width: 60, editable: true },
  { id: 'ro', header: 'RO', type: 'boolean', width: 60, value: (r: Row) => r.ok },
];
const rows = (v: boolean | null = null) => rowsOf(30).map((r) => ({ ...r, ok: v })) as never;
const grid = (o: { cols?: ColumnDef<Row, any>[]; v?: boolean | null; lang?: 'fr' | 'ar'; settings?: object; swap?: boolean } = {}) => {
  const t = ed({ lang: o.lang ?? 'fr', columns: (o.cols ?? COLS) as never, rows: rows(o.v), settings: { selection: { mode: 'multi' }, ...o.settings } as never, ...(o.swap && { features: (e, x) => [x, e] }) });
  const saved = () => t.of('cellEdited').map((e) => [e.column, e.value, e.origin]);
  return { ...t, saved };
};

for (const lang of ['fr', 'ar'] as const) {
  describe(`toggling a yes/no cell (${lang})`, () => {
    it('Space toggles an editable yes/no cell, the row not selected; one save, origin edit; no editor opened', () => {
      const t = grid({ lang });
      t.at('r3', 'ok');
      expect(t.key(' ').defaultPrevented).toBe(true);
      expect(t.saved()).toEqual([['ok', true, 'edit']]);
      expect(isSelected(t.g.kernel.selection, k('r3'))).toBe(false);
      expect(t.field()).toBeNull();
      expect(t.of('editingStarted')).toEqual([]);
      expect(t.of('editingStopped')).toEqual([]);
    });

    it('the order null → true → false → true (null never comes back by toggling)', () => {
      const t = grid({ lang });
      t.at('r3', 'ok');
      for (let i = 0; i < 3; i++) t.key(' ');
      expect(t.saved().map((x) => x[1])).toEqual([true, false, true]);
    });

    it('Enter toggles; a part whose focus() takes it gets Enter instead', () => {
      let t = grid({ lang, v: true });
      t.at('r3', 'ok');
      expect(t.key('Enter').defaultPrevented).toBe(true);
      expect(t.saved()).toEqual([['ok', false, 'edit']]);
      cleanup();
      const took = vi.fn(() => true);
      const check = definePart('cell', { mount: (h) => (h.append(document.createElement('button')), { focus: took }) });
      t = grid({ lang, v: true, cols: [COLS[0]!, { ...COLS[1]!, ui: { cell: 'check' } }], settings: { parts: { check } } });
      t.at('r3', 'ok');
      t.key('Enter');
      expect(took).toHaveBeenCalled();
      expect(t.saved()).toEqual([]);
      // Space still toggles there.
      t.at('r4', 'ok');
      t.key(' ');
      expect(t.saved()).toEqual([['ok', false, 'edit']]);
    });

    it('a double click toggles once (not per click)', () => {
      const t = grid({ lang });
      const c = t.at('r3', 'ok');
      c.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      c.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(t.saved()).toEqual([['ok', true, 'edit']]);
    });

    it('a double tap toggles once, the browser’s double click after it is not a second toggle', () => {
      const t = grid({ lang });
      const c = t.at('r3', 'ok');
      const tap = () => c.dispatchEvent(Object.assign(new MouseEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10 }), { pointerType: 'touch' }));
      tap();
      tap();
      c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(t.saved()).toEqual([['ok', true, 'edit']]);
    });

    it('Delete and Backspace clear to null', () => {
      const t = grid({ lang, v: true });
      t.at('r3', 'ok');
      t.key('Delete');
      expect(t.saved()).toEqual([['ok', null, 'edit']]);
    });

    it('a refusal (validate): no save, the blink, one sentence', () => {
      const t = grid({ lang, cols: [COLS[0]!, { ...COLS[1]!, validate: (v: boolean | null) => (v === true ? 'nope' : null) }] });
      const refuse = vi.spyOn(t.api, 'refuse');
      t.at('r3', 'ok');
      t.key(' ');
      expect(t.saved()).toEqual([]);
      expect(refuse).toHaveBeenCalledWith(k('r3'), 'ok');
      expect(t.alert).toHaveBeenCalledTimes(1);
      expect(String(t.alert.mock.calls[0]![0])).toMatch(/^OK/);
    });

    it('the new text is said politely (a focused cell’s change is not reliably read again)', () => {
      const t = grid({ lang });
      const say = vi.spyOn(t.ctx.live, 'announce');
      t.at('r3', 'ok');
      t.key(' ');
      expect(say).toHaveBeenLastCalledWith(t.value('r3', 'ok'));
      expect(t.value('r3', 'ok')).toBe('true');
    });

    it('Space on another cell, Shift+Space, a read-only yes/no cell: the selection as before, nothing saved', () => {
      const t = grid({ lang });
      t.at('r3', 'name');
      t.key(' ');
      expect(isSelected(t.g.kernel.selection, k('r3'))).toBe(true);
      t.at('r5', 'ro');
      t.key(' ');
      expect(isSelected(t.g.kernel.selection, k('r5'))).toBe(true);
      t.at('r7', 'ok');
      t.key(' ', { shiftKey: true });
      expect(t.saved()).toEqual([]);
    });

    it('F2 and a character open nothing on a yes/no cell; edit.editor: \'text\' gives a text field read by the codec', () => {
      let t = grid({ lang });
      t.at('r3', 'ok');
      t.key('F2');
      t.key('x');
      expect(t.field()).toBeNull();
      cleanup();
      t = grid({ lang, cols: [COLS[0]!, { ...COLS[1]!, edit: { editor: 'text' } }] });
      t.at('r3', 'ok');
      t.key('F2');
      t.type('oui');
      t.key('Enter', {}, t.field()!);
      expect(t.saved()).toEqual([['ok', true, 'edit']]);
    });

    it('the same with the editors listed before edit()', () => {
      const t = grid({ lang, swap: true });
      t.at('r3', 'ok');
      t.key(' ');
      expect(t.saved()).toEqual([['ok', true, 'edit']]);
    });
  });
}
