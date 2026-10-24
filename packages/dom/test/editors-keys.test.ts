// The keys that start an edit (Phase 5 step 5; editing.md 4–11, step05-plan « Behaviour » 1–8 and its keyboard
// table; owner Q4): F2, Enter (the part first), a printable character (AltGr, Option on a Mac), an input method,
// Delete and Backspace; Space, `*` in the tree column, a read-only cell, a field type not known yet: nothing.
// Each in French (left to right) and Arabic (right to left).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isSelected, type ColumnDef } from '@dzgrid/core';
import type { SlotPart } from '../src/part.js';
import { tree } from '../src/tree.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { EN } from '../src/locales/en.js';
import { ed, cleanup, ECOLS, EDIT, EDITORS, join, k, rowsOf, type R } from './support-editors.js';

afterEach(cleanup);

for (const lang of ['fr', 'ar'] as const) {
  describe(`starting an edit (${lang})`, () => {
    it('F2 opens the field with the cell’s text, the caret at its end', () => {
      const t = ed({ lang });
      t.at('r12', 'n');
      const ev = t.key('F2');
      expect(ev.defaultPrevented).toBe(true);
      const f = t.field()!;
      expect(f).not.toBeNull();
      expect(f.value).toBe(lang === 'fr' ? '12' : '12');
      expect(document.activeElement).toBe(f);
      expect([f.selectionStart, f.selectionEnd]).toEqual([2, 2]);
      expect(f.closest('.dzg-cell')).toBe(t.cell('r12', 'n'));
      expect(t.of('editingStarted').map((e) => [e.column, e.start])).toEqual([['n', 'f2']]);
    });

    it('a printable character opens the field holding only it (Latin, Arabic letter, Arabic-Indic digit)', () => {
      for (const ch of ['x', 'ب', '٣', '7']) {
        const t = ed({ lang });
        t.at('r3', 'name');
        const ev = t.key(ch);
        expect(ev.defaultPrevented, ch).toBe(true);
        expect(t.field()!.value, ch).toBe(ch);
        expect(t.field()!.selectionStart, ch).toBe(1);
        expect(t.of('editingStarted')[0]!.start).toBe('key');
        cleanup();
      }
    });

    it('Space never starts: it selects the row', () => {
      const t = ed({ lang, settings: { selection: { mode: 'multi' } } });
      t.at('r3', 'n');
      t.key(' ');
      expect(t.field()).toBeNull();
      expect(isSelected(t.g.kernel.selection, k('r3'))).toBe(true);
    });

    it('Delete and Backspace clear the cell: one save of the empty value, no field', () => {
      for (const key of ['Delete', 'Backspace']) {
        const t = ed({ lang });
        t.at('r5', 'q');
        expect(t.key(key).defaultPrevented).toBe(true);
        expect(t.field()).toBeNull();
        expect(t.value('r5', 'q')).toBe('');
        expect(t.of('cellEdited').map((e) => [e.column, e.value, e.origin])).toEqual([['q', null, 'edit']]);
        cleanup();
      }
    });

    it('an input method starting on a cell (229, Process, Dead) opens the field empty and lets the text land', () => {
      for (const init of [{ key: 'a', keyCode: 229 }, { key: 'Process' }, { key: 'Dead' }, { key: 'k', isComposing: true }]) {
        const t = ed({ lang });
        t.at('r3', 'name');
        const ev = t.key(init.key, init);
        expect(ev.defaultPrevented, JSON.stringify(init)).toBe(false);
        expect(t.field()!.value).toBe('');
        expect(document.activeElement).toBe(t.field());
        cleanup();
      }
    });

    it('a read-only cell: F2, a character, Delete, a double click do nothing', () => {
      const t = ed({ lang });
      const c = t.at('r3', 's');
      t.key('F2');
      t.key('x');
      t.key('Delete');
      c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(t.field()).toBeNull();
      expect(t.of('cellEdited')).toEqual([]);
      expect(t.value('r3', 's')).toBe('s3');
    });
  });
}

describe('Enter on a cell: the part first (editing.md 5)', () => {
  const part = (take: boolean, spy: () => void): SlotPart<'cell'> => ({
    slot: 'cell',
    part: { mount(h, c) { const b = document.createElement('button'); b.textContent = c.text; h.append(b); return { focus: () => (spy(), take && (b.focus(), true)) }; } },
  });
  const cols = (p: string): ColumnDef<R, any>[] => ECOLS.map((c) => (c.id === 'n' ? { ...c, ui: { cell: p } } : c));

  it('a part that takes the focus keeps Enter; F2 never asks it and edits', () => {
    const spy = vi.fn();
    const t = ed({ columns: cols('p'), settings: { parts: { p: part(true, spy) } } });
    t.at('r2', 'n');
    t.key('Enter');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(t.field()).toBeNull();
    expect(document.activeElement!.tagName).toBe('BUTTON');
    // Inside the part's widget, a character is the widget's: no field (mutant analysis, step 5).
    expect(t.key('x').defaultPrevented).toBe(false);
    expect(t.field()).toBeNull();
    t.at('r2', 'n');
    spy.mockClear();
    t.key('F2');
    expect(spy).not.toHaveBeenCalled();
    expect(t.field()!.value).toBe('2');
  });

  it('a part that does not take it: Enter edits', () => {
    const spy = vi.fn();
    const t = ed({ columns: cols('p'), settings: { parts: { p: part(false, spy) } } });
    t.at('r2', 'n');
    t.key('Enter');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(t.field()!.value).toBe('2');
    expect(t.of('editingStarted')[0]!.start).toBe('enter');
  });

  it('on a read-only cell Enter keeps calling the part, F2 too (parts.md), and no field', () => {
    const spy = vi.fn();
    const t = ed({ columns: ECOLS.map((c) => (c.id === 's' ? { ...c, ui: { cell: 'p' } } : c)), settings: { parts: { p: part(false, spy) } } });
    t.at('r2', 's');
    t.key('Enter');
    t.key('F2');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(t.field()).toBeNull();
  });

  it('Shift, Ctrl, Alt or Cmd + Enter on a cell: nothing new', () => {
    const t = ed();
    t.at('r2', 'n');
    for (const m of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) t.key('Enter', m);
    expect(t.field()).toBeNull();
  });
});

describe('modifiers (step05-plan 3)', () => {
  it('AltGr (Ctrl+Alt with AltGraph) starts; Ctrl+C, Cmd+C, Alt alone off a Mac do not', () => {
    const t = ed();
    t.at('r3', 'name');
    t.key('c', { ctrlKey: true });
    t.key('c', { metaKey: true });
    t.key('ø', { altKey: true });
    expect(t.field()).toBeNull();
    t.key('[', { ctrlKey: true, altKey: true, modifierAltGraph: true } as KeyboardEventInit);
    expect(t.field()!.value).toBe('[');
  });

  it('on a Mac, Option makes a character (French Mac: [ ] { } | ~): it starts', () => {
    const t = ed();
    (t.ctx as { mac: boolean }).mac = true;
    t.at('r3', 'name');
    t.key('|', { altKey: true });
    expect(t.field()!.value).toBe('|');
  });
});

describe('the tree column’s `*` (tree-keys.md): never a start, whatever the feature order', () => {
  type TR = R;
  const msgs = join(EN, EDIT.en, EDITORS.en, EN_TREE);
  const rows = rowsOf(12);
  const parentId = (r: TR) => (r.n >= 1 && r.n <= 3 ? 'r0' : r.n >= 5 && r.n <= 7 ? 'r4' : null);
  for (const order of ['editors first', 'tree first'] as const) {
    it(order, () => {
      const t = ed({ rows, settings: { messages: msgs }, features: (e, x) => (order === 'editors first' ? [e, x, tree<TR>({ parentId })] : [tree<TR>({ parentId }), e, x]) });
      const before = t.g.kernel.rows.displayed.count;
      t.at('r0', 'name');
      const ev = t.key('*');
      expect(ev.defaultPrevented).toBe(true);
      expect(t.field()).toBeNull();
      expect(t.g.kernel.rows.displayed.count).toBeGreaterThan(before);
      // Another printable character in the tree column still starts.
      t.at('r0', 'name');
      t.key('z');
      expect(t.field()!.value).toBe('z');
    });
  }
  it('`*` outside the tree column starts an edit there', () => {
    const t = ed({ rows, settings: { messages: msgs }, features: (e, x) => [tree<TR>({ parentId }), e, x] });
    t.at('r0', 'n');
    t.key('*');
    expect(t.field()!.value).toBe('*');
  });
});

describe('day and yes/no columns (step 5 opened nothing there; step 6: a date field, a toggle)', () => {
  const cols: ColumnDef<R, any>[] = [
    { id: 'name', header: 'Name', width: 120 },
    { id: 'day', header: 'Day', type: 'day', width: 100, editable: true, value: () => '2026-01-02' },
    { id: 'ok', header: 'OK', type: 'boolean', width: 60, editable: true, value: (r: R) => r.n % 2 === 0 },
  ];
  it('a day: F2 opens its date field; a yes/no cell: no field on F2 or a character; Delete still clears', () => {
    const t = ed({ columns: cols });
    t.at('r2', 'day');
    t.key('F2');
    expect(t.field()!.closest('.dzg-datebox')).not.toBeNull();
    t.key('Escape', {}, t.field()!);
    t.at('r2', 'ok');
    t.key('F2');
    t.key('3');
    expect(t.field()).toBeNull();
    t.key('Delete');
    expect(t.of('cellEdited').map((e) => [e.column, e.value])).toEqual([['ok', null]]);
  });
});

describe('inside the field', () => {
  it('composing: Enter and Escape are the input method’s (nothing kept, nothing given up)', () => {
    const t = ed();
    t.at('r2', 'name');
    t.key('F2');
    t.type('かな');
    t.key('Enter', { isComposing: true });
    t.key('Escape', { isComposing: true });
    t.key('Enter', { keyCode: 229 });
    expect(t.field()!.value).toBe('かな');
    expect(t.of('cellEdited')).toEqual([]);
  });

  it('bug 4 (ngx-sheetgrid a6c97f5): keys the grid binds elsewhere stay in the field (a with a selection, *, /, Space, arrows, Home, Ctrl+A)', () => {
    const t = ed({ settings: { selection: { mode: 'multi' } } });
    t.at('r2', 'name');
    t.key('F2');
    const f = t.field()!;
    for (const [key, init] of [['a', {}], ['*', {}], ['/', {}], [' ', {}], ['ArrowDown', {}], ['ArrowRight', {}], ['a', { ctrlKey: true }], ['z', { ctrlKey: true }]] as const) {
      const ev = t.key(key, init, f);
      expect(ev.defaultPrevented, key).toBe(false);
    }
    // Home, End, PageUp, PageDown: the field's too, but their default is prevented (in Chrome on a Mac it scrolls
    // the grid away from the field, step 6): the caret moves by the field's rule (editors-caret.test.ts).
    for (const key of ['Home', 'PageDown']) t.key(key, {}, f);
    expect(t.field()).toBe(f);
    expect(t.focusAt()).toBe('r2/name');
    expect(isSelected(t.g.kernel.selection, k('r2'))).toBe(false);
  });

  it('a key from a grid nested in this one is not ours', () => {
    const t = ed();
    t.at('r2', 'name');
    const inner = document.createElement('div');
    inner.className = 'dzg';
    const cell = document.createElement('div');
    cell.className = 'dzg-cell';
    cell.tabIndex = -1;
    inner.append(cell);
    t.cell('r2', 's')!.append(inner);
    cell.focus();
    for (const key of ['F2', 'x', 'Delete', 'Enter']) t.key(key, {}, cell);
    expect(t.field()).toBeNull();
    expect(t.of('cellEdited')).toEqual([]);
  });
});

describe('without edit()', () => {
  it('one missing-feature warning, and no key, click or tap taken', () => {
    const t = ed({ features: (_e, x) => [x] });
    const p = t.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string; detail?: string }[] }).problems);
    expect(p.filter((x) => x.code === 'missing-feature')).toEqual([expect.objectContaining({ path: 'features.editors', detail: 'edit' })]);
    t.at('r2', 'n');
    expect(t.key('F2').defaultPrevented).toBe(false);
    expect(t.key('x').defaultPrevented).toBe(false);
    expect(t.key('Delete').defaultPrevented).toBe(false);
    expect(t.field()).toBeNull();
  });

  it('a missing text throws at setup, as edit() does', () => {
    expect(() => ed({ settings: { messages: join(EN, EDIT.en) } })).toThrow(/editors: missing edit\.refused/);
  });
});

describe('bug 1 (ngx-sheetgrid a6c97f5): the row edited is the one shown', () => {
  it('sorted, then the 3rd displayed row edited: its own key is saved', async () => {
    const saved: unknown[] = [];
    const t = ed({ save: (req) => void saved.push(...req.changes.map((c) => [c.key, c.column, c.value])) });
    expect(t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'q', dir: 'desc' }] }, 'user').ok).toBe(true);
    const d = t.g.kernel.rows.displayed;
    // The sort moved rows: the third shown is not r2.
    expect(d.keyAt(d.index(2)!)).not.toBe(k('r2'));
    const third = d.keyAt(d.index(2)!);
    t.g.api.focusCell(third, 'n');
    document.activeElement !== t.ctx.rowRenderer.cell(third, 'n') && t.ctx.rowRenderer.cell(third, 'n')!.focus();
    t.key('F2');
    t.type('77');
    t.key('Enter');
    expect(saved).toEqual([[third, 'n', 77]]);
    expect(t.ctx.rowRenderer.cell(third, 'n')!.textContent).toBe('77');
  });
});
