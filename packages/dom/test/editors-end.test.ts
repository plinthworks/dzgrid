// The keys and gestures that end an edit (Phase 5 step 5; editing.md 12–17, step05-plan « End » 12–17; owner Q3,
// Q5, D5): Enter and Shift+Enter keep and move as the arrows would (or stay), Tab opens the next editable cell in
// reading order (or leaves the grid), Escape gives up, a blur keeps one task later (the window's blur keeps the
// field open), closing never leaves the focus on body; the two events once each.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { EN } from '../src/locales/en.js';
import { ed, cleanup, ECOLS, EDIT, EDITORS, join, k, rowsOf, tick, type R } from './support-editors.js';

afterEach(cleanup);

const open = (t: ReturnType<typeof ed>, id: string, col: string, text?: string) => {
  t.at(id, col);
  t.key('F2');
  if (text !== undefined) t.type(text);
  return t.field()!;
};

describe('Enter and Shift+Enter (Q3)', () => {
  it("enterMoves: 'down' (named since Q3 revised): Enter keeps the value and goes down, the field closed; Shift+Enter keeps and goes up", () => {
    const t = ed({ options: { enterMoves: 'down' } });
    open(t, 'r5', 'n', '50');
    t.key('Enter');
    expect(t.field()).toBeNull();
    expect(t.value('r5')).toBe('50');
    expect(t.focusAt()).toBe('r6/n');
    expect(document.activeElement).toBe(t.cell('r6', 'n'));
    open(t, 'r6', 'n', '60');
    t.key('Enter', { shiftKey: true });
    expect(t.value('r6')).toBe('60');
    expect(t.focusAt()).toBe('r5/n');
    expect(t.of('cellEdited').map((e) => e.value)).toEqual([50, 60]);
  });

  it('Q3 revised (owner, step 7): by default Enter and Shift+Enter keep the value and the focus stays on the cell', () => {
    const t = ed();
    open(t, 'r5', 'n', '50');
    t.key('Enter');
    expect(t.field()).toBeNull();
    expect(t.value('r5')).toBe('50');
    expect(t.focusAt()).toBe('r5/n');
    expect(document.activeElement).toBe(t.cell('r5', 'n'));
    open(t, 'r5', 'n', '51');
    t.key('Enter', { shiftKey: true });
    expect(t.focusAt()).toBe('r5/n');
  });

  it('enterMoves: stay keeps the focus on the cell, either way', () => {
    const t = ed({ options: { enterMoves: 'stay' } });
    open(t, 'r5', 'n', '50');
    t.key('Enter');
    expect(t.focusAt()).toBe('r5/n');
    open(t, 'r5', 'n', '51');
    t.key('Enter', { shiftKey: true });
    expect(t.focusAt()).toBe('r5/n');
    expect(document.activeElement).toBe(t.cell('r5', 'n'));
  });

  it('on the last row Enter stays there; on the first Shift+Enter goes to the header as the Up arrow does', () => {
    const t = ed({ rows: rowsOf(4) });
    open(t, 'r3', 'n', '1');
    t.key('Enter');
    expect(t.focusAt()).toBe('r3/n');
    open(t, 'r3', 'n', '2');
    t.key('ArrowUp', {}, t.field()!);
    expect(t.focusAt()).toBe('r3/n');
  });

  it("enterMoves: 'down': nothing opens on the cell reached; unchanged text: no save, the move still made", () => {
    const t = ed({ options: { enterMoves: 'down' } });
    open(t, 'r5', 'n');
    t.key('Enter');
    expect(t.field()).toBeNull();
    expect(t.of('cellEdited')).toEqual([]);
    expect(t.focusAt()).toBe('r6/n');
  });

  it("enterMoves: 'down': Enter onto a detail row moves as the Down arrow (the detail is one stop)", async () => {
    const { detail } = await import('../src/detail.js');
    const { EN_DETAIL } = await import('../src/locales/en-detail.js');
    const msgs = join(EN, EDIT.en, EDITORS.en, EN_DETAIL);
    const det = () => detail<R>({ part: { slot: 'detail', part: { mount: (h: HTMLElement) => (h.append('x'), {}) } } } as never);
    const a = ed({ settings: { messages: msgs }, features: (e, x) => [det(), e, x] });
    a.g.kernel.dispatch({ type: 'rows.expand', rows: [k('r1')], expanded: true }, 'api');
    a.at('r1', 'n');
    a.key('ArrowDown');
    const byArrow = JSON.stringify(a.g.kernel.focus);
    cleanup();
    const b = ed({ settings: { messages: msgs }, features: (e, x) => [det(), e, x], options: { enterMoves: 'down' } });
    b.g.kernel.dispatch({ type: 'rows.expand', rows: [k('r1')], expanded: true }, 'api');
    open(b, 'r1', 'n', '9');
    b.key('Enter');
    expect(JSON.stringify(b.g.kernel.focus)).toBe(byArrow);
    expect(b.field()).toBeNull();
  });
});

for (const lang of ['fr', 'ar'] as const) {
  describe(`Tab and Shift+Tab (D5, ${lang}: reading order, logical)`, () => {
    it('Tab keeps and opens the next editable cell of the row, skipping a read-only column; then the next row', () => {
      const t = ed({ lang });
      open(t, 'r5', 'n', '7');
      expect(t.key('Tab').defaultPrevented).toBe(true);
      expect(t.value('r5')).toBe('7');
      // s is read-only: q next.
      expect(t.focusAt()).toBe('r5/q');
      expect(t.field()!.closest('.dzg-cell')).toBe(t.cell('r5', 'q'));
      expect(document.activeElement).toBe(t.field());
      t.key('Tab');
      expect(t.focusAt()).toBe('r6/name');
      expect(t.field()!.value).toBe('Name 6');
      t.key('Tab', { shiftKey: true });
      expect(t.focusAt()).toBe('r5/q');
      expect(t.of('editingStarted').map((e) => e.start)).toEqual(['f2', 'tab', 'tab', 'tab']);
    });

    it('at the last editable cell of the grid: the field closes, the focus stays on the cell', () => {
      const t = ed({ lang, rows: rowsOf(3) });
      open(t, 'r2', 'q', '4');
      t.key('Tab');
      expect(t.field()).toBeNull();
      expect(t.focusAt()).toBe('r2/q');
      expect(document.activeElement).toBe(t.cell('r2', 'q'));
      open(t, 'r0', 'name');
      t.key('Tab', { shiftKey: true });
      expect(t.field()).toBeNull();
      expect(t.focusAt()).toBe('r0/name');
    });
  });
}

describe('Tab steps over rows that cannot be edited', () => {
  it('a row whose editable rule says no is passed over', () => {
    const cols: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', width: 120 }, { id: 'n', header: 'Stock', type: 'number', width: 80, editable: (r: R) => r.n % 3 === 0 }];
    const t = ed({ columns: cols });
    open(t, 'r3', 'n', '1');
    t.key('Tab');
    expect(t.focusAt()).toBe('r6/n');
    t.key('Tab', { shiftKey: true });
    expect(t.focusAt()).toBe('r3/n');
  });

  it('a row out of view: focused, brought into view, opened at the next paint', () => {
    const cols: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', width: 120 }, { id: 'n', header: 'Stock', type: 'number', width: 80, editable: (r: R) => r.n === 2 || r.n === 150 }];
    const t = ed({ columns: cols });
    open(t, 'r2', 'n', '1');
    t.key('Tab');
    expect(t.focusAt()).toBe('r150/n');
    expect(t.field()!.closest('.dzg-cell')).toBe(t.cell('r150', 'n'));
    expect(document.activeElement).toBe(t.field());
  });
});

describe('Tab with frames of their own (the paint after the key)', () => {
  it('a row out of view: focused, revealed, and opened at the paint that mounts it (not before)', () => {
    const queue: FrameRequestCallback[] = [];
    const raf = { requestAnimationFrame: (f: FrameRequestCallback) => queue.push(f), cancelAnimationFrame: () => {} };
    const flush = () => { for (let i = 0; queue.length && i < 20; i++) queue.shift()!(0); };
    const cols: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', width: 120 }, { id: 'n', header: 'Stock', type: 'number', width: 80, editable: (r: R) => r.n === 2 || r.n === 150 }];
    const t = ed({ columns: cols, raf });
    flush();
    t.g.api.focusCell(k('r2'), 'n');
    flush();
    t.cell('r2', 'n')!.focus();
    t.key('F2');
    t.type('1');
    t.key('Tab');
    expect(t.focusAt()).toBe('r150/n');
    expect(t.field()).toBeNull();
    flush();
    expect(t.field()!.closest('.dzg-cell')).toBe(t.cell('r150', 'n'));
    expect(document.activeElement).toBe(t.field());
    expect(t.of('editingStarted').map((e) => e.start)).toEqual(['f2', 'tab']);
    // A key that moved the focus elsewhere before the paint drops the waiting open.
    t.key('Escape');
    t.at('r150', 'n');
    t.key('F2');
    t.type('2');
    t.key('Tab', { shiftKey: true });
    t.g.api.focusCell(k('r3'), 'name');
    flush();
    expect(t.field()).toBeNull();
  });
});

describe('keys faster than the paint (the cell reached not mounted yet)', () => {
  function mk() {
    const queue: FrameRequestCallback[] = [];
    const raf = { requestAnimationFrame: (f: FrameRequestCallback) => queue.push(f), cancelAnimationFrame: () => {} };
    const flush = () => { for (let i = 0; queue.length && i < 20; i++) queue.shift()!(0); };
    const t = ed({ raf, block: 160 });
    flush();
    return { ...t, flush };
  }
  /** The focus moved by the grid to a row below the view: the kernel's focus is there, its cell not mounted until the paint. */
  const below = (t: ReturnType<typeof mk>) => {
    t.g.api.focusCell(k('r3'), 'n');
    t.flush();
    t.cell('r3', 'n')!.focus();
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r40'), column: 'n' } }, 'user');
    t.ctx.restoreFocus();
    expect(t.cell('r40', 'n')).toBeNull();
  };

  it('F2 before the paint: the field opens at the paint that mounts the cell', () => {
    const t = mk();
    below(t);
    expect(t.key('F2').defaultPrevented).toBe(true);
    expect(t.field()).toBeNull();
    t.flush();
    expect(t.field()!.closest('.dzg-cell')).toBe(t.cell('r40', 'n'));
    expect(t.field()!.value).toBe('40');
    expect(document.activeElement).toBe(t.field());
  });

  it('characters typed before the paint: none lost, the field opens holding them', () => {
    const t = mk();
    below(t);
    expect(t.key('4').defaultPrevented).toBe(true);
    t.key('2');
    t.flush();
    expect(t.field()!.value).toBe('42');
    expect(t.field()!.closest('.dzg-cell')).toBe(t.cell('r40', 'n'));
  });

  it('a focus moved elsewhere before the paint drops the waiting open', () => {
    const t = mk();
    below(t);
    t.key('F2');
    t.g.api.focusCell(k('r1'), 'name');
    t.flush();
    expect(t.field()).toBeNull();
  });
});

describe('tab: grid', () => {
  it('Tab keeps, closes, and leaves the grid as from the cell (the browser’s Tab, not prevented)', () => {
    const t = ed({ options: { tab: 'grid' } });
    open(t, 'r5', 'n', '8');
    const ev = t.key('Tab');
    expect(ev.defaultPrevented).toBe(false);
    expect(t.value('r5')).toBe('8');
    expect(t.field()).toBeNull();
    expect(document.activeElement).toBe(t.cell('r5', 'n'));
  });
});

describe('Escape (editing.md 15)', () => {
  it('gives the field up: the value as before, the focus on the cell, nothing saved', () => {
    const t = ed();
    open(t, 'r5', 'n', '99');
    t.key('Escape');
    expect(t.field()).toBeNull();
    expect(t.value('r5')).toBe('5');
    expect(document.activeElement).toBe(t.cell('r5', 'n'));
    expect(t.of('cellEdited')).toEqual([]);
    expect(t.of('editingStopped').map((e) => [e.kept, e.via])).toEqual([[false, 'escape']]);
    expect(t.alert).not.toHaveBeenCalled();
  });
});

describe('blur (Q5)', () => {
  it('the focus going elsewhere in the page keeps the value one task later, without pulling the focus back', async () => {
    const t = ed();
    const out = document.body.appendChild(document.createElement('button'));
    open(t, 'r5', 'n', '42');
    out.focus();
    expect(t.field()).not.toBeNull();
    await tick();
    expect(t.field()).toBeNull();
    expect(t.value('r5')).toBe('42');
    expect(document.activeElement).toBe(out);
    expect(t.of('editingStopped').map((e) => [e.kept, e.via])).toEqual([[true, 'blur']]);
  });

  it('a click on another cell keeps the value; the other cell keeps the focus', async () => {
    const t = ed();
    open(t, 'r5', 'n', '43');
    t.cell('r7', 'q')!.focus();
    await tick();
    expect(t.value('r5')).toBe('43');
    expect(document.activeElement).toBe(t.cell('r7', 'q'));
    expect(t.field()).toBeNull();
  });

  it('the window losing focus (the field still the active element) keeps the field open', async () => {
    const t = ed();
    const f = open(t, 'r5', 'n', '44');
    f.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    await tick();
    expect(t.field()).toBe(f);
    expect(t.of('cellEdited')).toEqual([]);
  });
});

describe('closing (rule 6) and the events', () => {
  it('Enter, Tab, Escape: the focus never on body while the field goes', () => {
    for (const [key, init] of [['Enter', {}], ['Tab', {}], ['Escape', {}], ['Enter', { shiftKey: true }]] as const) {
      const t = ed();
      const f = open(t, 'r5', 'n', '3');
      let at: Element | null = null;
      const remove = f.remove.bind(f);
      f.remove = () => { at = document.activeElement; remove(); };
      t.key(key, init);
      expect(at, key).not.toBe(document.body);
      expect(at, key).not.toBeNull();
      expect(document.activeElement, key).not.toBe(document.body);
      cleanup();
    }
  });

  it('editingStarted and editingStopped once each per edit, with how', () => {
    const t = ed();
    open(t, 'r5', 'n', '3');
    t.key('Enter');
    t.at('r6', 'name');
    t.key('q');
    t.key('Escape');
    expect(t.of('editingStarted').map((e) => [e.key, e.column, e.start])).toEqual([[k('r5'), 'n', 'f2'], [k('r6'), 'name', 'key']]);
    expect(t.of('editingStopped').map((e) => [e.key, e.column, e.kept, e.via])).toEqual([[k('r5'), 'n', true, 'enter'], [k('r6'), 'name', false, 'escape']]);
  });

  it('a row removed while its field is open: closed, the text dropped (lost)', () => {
    const t = ed();
    open(t, 'r5', 'n', '3');
    t.g.kernel.rows.applyTransaction({ remove: ['r5'] });
    t.ctx.schedule();
    expect(t.field()).toBeNull();
    expect(t.of('cellEdited')).toEqual([]);
    expect(t.of('editingStopped').map((e) => [e.kept, e.via])).toEqual([[false, 'lost']]);
  });

  it('a column hidden while its field is open: the text kept (D8, O9)', () => {
    const t = ed();
    open(t, 'r5', 'q', '31');
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'q', hidden: true }] }, 'api');
    t.ctx.schedule();
    expect(t.field()).toBeNull();
    expect(t.of('cellEdited').map((e) => [e.column, e.value])).toEqual([['q', 31]]);
    expect(t.of('editingStopped').map((e) => [e.kept, e.via])).toEqual([[true, 'lost']]);
  });

  it('destroyed with the grid: the field gone, nothing saved, no error', () => {
    const t = ed();
    open(t, 'r5', 'n', '3');
    const err = vi.spyOn(console, 'error');
    t.g.destroy();
    expect(t.field()).toBeNull();
    expect(err).not.toHaveBeenCalled();
  });
});

describe('double click', () => {
  it('opens the field with the text, caret at its end', () => {
    const t = ed();
    const c = t.at('r8', 'name');
    c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(t.field()!.value).toBe('Name 8');
    expect(t.field()!.selectionStart).toBe(6);
    expect(t.of('editingStarted')[0]!.start).toBe('dblclick');
  });

  it('a double click on the open field does not open another', () => {
    const t = ed();
    const f = open(t, 'r8', 'name');
    f.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(t.host.querySelectorAll('.dzg-field').length).toBe(1);
    expect(t.of('editingStarted').length).toBe(1);
  });
});

describe('the cell’s tooltip', () => {
  it('is hidden when the field opens, and not shown on the field', () => {
    const cols = ECOLS.map((c) => (c.id === 'n' ? { ...c, tooltip: () => 'Tip' } : c));
    const t = ed({ columns: cols });
    t.at('r2', 'n');
    t.ctx.keyboardAt = t.ctx.now();
    t.cell('r2', 'n')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(t.ctx.el.tooltip.hidden).toBe(false);
    t.key('F2');
    expect(t.ctx.el.tooltip.hidden).toBe(true);
  });
});
