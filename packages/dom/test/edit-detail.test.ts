// Phase 5 step 8, details never edit (D11; Phase 4 close, criterion 5 carried: « details not editable or pasteable »;
// step08-plan.md « Behaviour » 12): on a detail panel's cell, with `edit()` and `editors()` on the grid around, F2, a
// character, a double click, a double tap, Delete, Backspace and Space open nothing and keep nothing; a paste there is
// not taken (Part B's paste will step over details; step 10 re-pins); `api.commit` on a detail's key is refused
// `read-only`; Enter still goes into the panel's grid and Escape still comes back; an undo never lands on a panel.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, k, nest, settle, x } from './support-nested-edit.js';

afterEach(cleanup);

/** The panel of O1 open, the focus on its cell (the detail row's), the DOM focus there. */
function onPanel() {
  const t = nest();
  t.expand(['O1']);
  t.g.api.focusCell(k('O1'), 'name');
  t.key('ArrowDown');
  expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('O1'), column: 'name' });
  const panel = t.active();
  expect(panel.classList.contains('dzg-dcell')).toBe(true);
  t.events.length = 0;
  return { ...t, panel };
}
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

  // A placeholder (review 4): no paste exists yet; Part B's paste (step 10) re-pins it on its own plan.
  it('a paste on the panel\'s cell: not taken (nothing prevented, nothing kept) — placeholder until step 10', () => {
    const t = onPanel();
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    t.panel.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(edited(t)).toEqual([]);
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
