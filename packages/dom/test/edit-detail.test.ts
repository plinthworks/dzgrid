// Phase 5 step 8, details never edit (D11; Phase 4 close, criterion 5 carried: « details not editable or pasteable »;
// step08-plan.md « Behaviour » 12): on a detail panel's cell, with `edit()` and `editors()` on the grid around, F2, a
// character, a double click, a double tap, Delete, Backspace and Space open nothing and keep nothing; a paste there is
// not taken (re-pinned at step 11b on the real paste: a block steps over the panel); `api.commit` on a detail's key is refused
// `read-only`; Enter still goes into the panel's grid and Escape still comes back; an undo never lands on a panel.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, k, nest, settle, x } from './support-nested-edit.js';

afterEach(cleanup);

/** The panel of O1 open, the focus on its cell (the detail row's), the DOM focus there. */
function onPanel() {
  const t = nest({ range: true });
  t.expand(['O1']);
  t.g.api.focusCell(k('O1'), 'name');
  t.key('ArrowDown');
  expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('O1'), column: 'name' });
  const panel = t.active();
  expect(panel.classList.contains('dzg-dcell')).toBe(true);
  t.events.length = 0;
  return { ...t, panel };
}
/** A paste event as the browsers send it, its data readable (Firefox ignores a synthetic ClipboardEvent's, S7 5). */
const clipEvent = (type: string, text: string) => {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', { value: { getData: (f: string) => (f === 'text/plain' ? text : ''), setData() {}, types: ['text/plain'] } });
  return ev;
};
const edited = (t: ReturnType<typeof nest>) => t.events.filter((e) => e.type === 'cellEdited' || e.type === 'editingStarted');

describe('a detail panel\'s cell (criterion 5)', () => {
  for (const key of ['F2', '5', 'a', 'Delete', 'Backspace', ' ']) {
    it(`« ${key} »: no field, nothing kept`, () => {
      const t = onPanel();
      t.key(key);
      expect(t.field(t.ctx.el.layer)).toBeNull();
      expect(edited(t)).toEqual([]);
      expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('O1'), column: 'name' });
    });
  }

  it('a double click and a double tap on the panel\'s cell: nothing', () => {
    const t = onPanel();
    t.panel.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    for (let i = 0; i < 2; i++) t.panel.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', clientX: 10, clientY: 10 }));
    expect(t.field()).toBeNull();
    expect(edited(t)).toEqual([]);
  });

  // Re-pinned at step 11b on the real paste (clipboard.md 16, 26; step11b-plan L2): a focus on a detail row with no block
  // is no target — the event is left alone, nothing is kept or said.
  it('a paste on the panel\'s cell: not taken (not prevented, nothing kept, nothing said)', async () => {
    const t = onPanel();
    const announce = vi.spyOn(t.ctx.live, 'announce');
    for (const at of [document.body, t.panel]) {
      const ev = clipEvent('paste', 'X\tY');
      at.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
    }
    await settle();
    expect(edited(t)).toEqual([]);
    expect(t.saves.outer).toEqual([]);
    expect(announce).not.toHaveBeenCalled();
  });

  it('a block across master rows and an open panel: the panel stepped over, its line not used, counted for nothing', async () => {
    const t = nest({ range: true });
    t.expand(['O1']);
    t.g.api.focusCell(k('O0'), 'name');
    t.blocks.api(t.g)!.set({ anchor: { row: k('O0'), column: 'name' }, focus: { row: k('O2'), column: 'qty' } });
    const ev = clipEvent('paste', 'a\t1\r\nb\t2\r\nc\t3\r\n');
    document.body.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(t.saves.outer).toHaveLength(1);
    expect(t.saves.outer[0]!.req.changes.map((c) => `${String(c.key).replace(/^d:\d+:/, '')}/${c.column}=${c.value}`)).toEqual(['O0/name=a', 'O0/qty=1', 'O1/name=b', 'O1/qty=2', 'O2/name=c', 'O2/qty=3']);
    for (const c of t.saves.outer[0]!.req.changes) expect(c.key).not.toBe(x('O1'));
  });

  it('a paste inside the panel\'s own grid (in the outer viewport), the outer holding a block: never the outer grid\'s', () => {
    const t = onPanel();
    t.key('Enter');
    const inner = t.innerOf('O1');
    expect(t.active().closest('.dzg')).toBe(t.ictx(inner).el.root);
    // The outer grid holds a block (set by the app): still not its paste — the focus is in the inner grid.
    expect(t.blocks.api(t.g)!.set({ anchor: { row: k('O2'), column: 'name' }, focus: { row: k('O3'), column: 'qty' } })).toBe(true);
    const ev = clipEvent('paste', 'X');
    document.body.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(t.saves.outer).toEqual([]);
    expect(edited(t)).toEqual([]);
  });

  it('m09/m10 canCopy and rangeCopied count data rows only (an open panel inside the block)', () => {
    const asked: unknown[] = [];
    const t = nest({ range: true, rangeOpts: { canCopy: (c) => (asked.push(c), true) } });
    t.expand(['O1']);
    t.g.api.focusCell(k('O0'), 'name');
    t.blocks.api(t.g)!.set({ anchor: { row: k('O0'), column: 'name' }, focus: { row: k('O2'), column: 'qty' } });
    t.blocks.api(t.g)!.copy();
    expect(asked).toEqual([expect.objectContaining({ rows: 3, cells: 6 })]);
    expect(t.events.filter((e) => e.type === 'rangeCopied')).toEqual([expect.objectContaining({ rows: 3, cells: 6 })]);
  });

  it('api.commit on a detail\'s key: refused « read-only », nothing staged', () => {
    const t = onPanel();
    const r = t.api.commit([{ key: x('O1'), column: 'name', input: { text: 'X' } }]);
    expect(r.refused).toEqual([{ key: x('O1'), column: 'name', code: 'read-only' }]);
    expect(r.staged).toBe(0);
    expect(t.api.canUndo).toBe(false);
  });

  it('Enter goes into the panel\'s grid; Escape there comes back to the panel; editing on both sides changes neither', () => {
    const t = onPanel();
    t.key('Enter');
    const inner = t.innerOf('O1');
    expect(t.active().closest('.dzg')).toBe(t.ictx(inner).el.root);
    expect(t.field(t.host)).toBeNull();
    t.key('Escape');
    expect(t.active()).toBe(t.panel);
    expect(edited(t)).toEqual([]);
  });

  it('an undo from the panel\'s cell undoes the outer grid\'s own and moves the focus to its cell, never to a panel', async () => {
    const t = onPanel();
    t.api.commit([{ key: k('O3'), column: 'qty', input: { text: '30' } }]);
    t.saves.outer[0]!.ok();
    await settle();
    t.g.api.focusCell(k('O1'), 'name');
    t.key('ArrowDown');
    t.key('z', { code: 'KeyZ', ctrlKey: true });
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('O3'), column: 'qty' });
  });
});
