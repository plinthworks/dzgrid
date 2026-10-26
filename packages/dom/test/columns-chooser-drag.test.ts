// Dragging a row by its handle (Phase 6 step 4, docs/behaviors/columns-chooser.md 20; owner Q-H, O5; step04-plan §1,
// §4): past 4 px a bar shows the landing gap among the rows beside it (its segment, its group); one patch on release
// and the place said; none when it lands where it was; Escape cancels (said, the dialog stays); `pointercancel` cancels
// quietly; a finger works the same on the handle; a gap across a segment's edge snaps to its nearest edge. Rows 32 px
// high from y = 100 (support-columns-panel `layout`).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, cmake } from './support-columns-panel.js';
import { fullOrder } from '../src/columns/order.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function open() {
  const t = cmake();
  t.api().open(t.appButton);
  t.layout();
  return t;
}

describe('the handle\'s drag', () => {
  it('under 4 px: nothing; past it a bar; released in the top half of Name: Amount before Name, one patch, said, its box focused', () => {
    const t = open();
    const n = t.columnsChanged().length;
    const h = t.act('amount', 'drag')!;
    const down = t.pdown(h, t.yOf('amount'));
    expect(down.defaultPrevented).toBe(true);
    t.pmove(t.yOf('amount') - 3);
    expect(t.bar()?.hidden ?? true).toBe(true);
    t.pmove(t.yOf('name') - 8);
    expect(t.bar()!.hidden).toBe(false);
    expect(t.row('amount')!.hasAttribute('data-dzg-dragging')).toBe(true);
    t.pup(t.yOf('name') - 8);
    expect(fullOrder(t.g.kernel.columns)).toEqual(['ref', 'amount', 'name', 'date', 'qty', 'note']);
    expect(t.columnsChanged().length - n).toBe(1);
    expect(t.said().at(-1)).toBe('Amount: place 2 of 6');
    expect(t.focused()).toBe('amount');
    expect(t.bar()?.hidden ?? true).toBe(true);
  });

  it('released where it was (its own gaps): no patch', () => {
    const t = open();
    const n = t.columnsChanged().length;
    t.pdown(t.act('date', 'drag')!, t.yOf('date'));
    t.pmove(t.yOf('date') + 10);
    t.pup(t.yOf('date') + 10);
    expect(t.columnsChanged().length).toBe(n);
  });

  it('down over a hidden row: after Qty', () => {
    const t = open();
    t.pdown(t.act('name', 'drag')!, t.yOf('name'));
    t.pmove(t.yOf('qty') + 8);
    t.pup(t.yOf('qty') + 8);
    expect(fullOrder(t.g.kernel.columns)).toEqual(['ref', 'date', 'qty', 'name', 'amount', 'note']);
  });

  it('above a pinned row: snapped to the segment\'s first gap (never pinned by the list)', () => {
    const t = open();
    t.pdown(t.act('amount', 'drag')!, t.yOf('amount'));
    t.pmove(t.yOf('ref') - 8);
    t.pup(t.yOf('ref') - 8);
    expect(fullOrder(t.g.kernel.columns)).toEqual(['ref', 'amount', 'name', 'date', 'qty', 'note']);
    expect(t.g.kernel.columns.layout.start.columns.map((c) => c.id)).toEqual(['ref']);
  });

  it('Escape during the drag: cancelled, said, nothing moved, the dialog still open', () => {
    const t = open();
    const n = t.columnsChanged().length;
    t.pdown(t.act('amount', 'drag')!, t.yOf('amount'));
    t.pmove(t.yOf('name'));
    const e = t.key('Escape', {}, t.search()!);
    expect(e.defaultPrevented).toBe(true);
    expect(t.said().at(-1)).toBe('Move cancelled');
    t.pup(t.yOf('name'));
    expect(t.columnsChanged().length).toBe(n);
    expect(t.dialog()).not.toBeNull();
    expect(t.bar()?.hidden ?? true).toBe(true);
  });

  it('pointercancel: cancelled quietly', () => {
    const t = open();
    const n = t.columnsChanged().length;
    t.pdown(t.act('amount', 'drag')!, t.yOf('amount'));
    t.pmove(t.yOf('name'));
    t.said().length = 0;
    document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 3 }));
    t.pup(t.yOf('name'));
    expect(t.columnsChanged().length).toBe(n);
    expect(t.said()).toEqual([]);
  });

  it('a finger on the handle drags the same (O5)', () => {
    const t = open();
    t.pdown(t.act('amount', 'drag')!, t.yOf('amount'), { pointerType: 'touch' });
    t.pmove(t.yOf('name') - 8, { pointerType: 'touch' });
    t.pup(t.yOf('name') - 8, { pointerType: 'touch' });
    expect(fullOrder(t.g.kernel.columns)).toEqual(['ref', 'amount', 'name', 'date', 'qty', 'note']);
  });

  it('a locked column\'s handle does not drag', () => {
    const t = cmake({ columns: [{ id: 'a', header: 'A', width: 100 }, { id: 'l', header: 'L', width: 100, movable: false }] as never });
    t.api().open(t.appButton);
    t.layout();
    const n = t.columnsChanged().length;
    t.pdown(t.act('l', 'drag')!, t.yOf('l'));
    t.pmove(t.yOf('a') - 8);
    t.pup(t.yOf('a') - 8);
    expect(t.columnsChanged().length).toBe(n);
  });
});
