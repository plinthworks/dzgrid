// `@dzgrid/dom/range` and `/fill`, the active cell after a mouse selection (owner S12-Q15, 2026-10-26; revises S11-Q1
// and QB2 for the pointer): a drag leaves the focus on its START cell (the anchor), as in Excel, the handle on the
// block's far corner; Shift+drag ends on the anchor too; Shift+arrows then move the far corner (the keys keep QB2: the
// focus follows the moving corner); a fill leaves the focus where it is, the block source ∪ filled, the handle at its
// new corner.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, rmake } from './support-range.js';
import { fmake } from './support-fill.js';

afterEach(cleanup);

describe('S12-Q15: the active cell after a mouse drag', () => {
  it('a drag leaves the focus (DOM and kernel) on the start cell; the block from it to the release', () => {
    const t = rmake();
    t.drag(['r1', 'n'], ['r4', 's']);
    expect(t.block()).toBe('r1/n:r4/s');
    expect(t.where()).toBe('r1/n');
    const f = t.g.kernel.focus;
    expect(f?.kind === 'cell' && f.column).toBe('n');
  });

  it('Shift+arrows after a drag move the far corner (the focus goes with it, QB2), the anchor kept', () => {
    const t = rmake();
    t.drag(['r1', 'n'], ['r4', 's']);
    expect(t.where()).toBe('r1/n');
    t.press('ArrowDown', { shiftKey: true });
    expect(t.block()).toBe('r1/n:r5/s');
    expect(t.where()).toBe('r5/s');
    t.press('ArrowRight', { shiftKey: true });
    expect(t.block()).toBe('r1/n:r5/q');
  });

  it('the release moves no focus: a Shift+drag ends with the focus where its Shift+press put it (QB2), not on the release cell', () => {
    const t = rmake();
    t.focus('r1', 'n');
    t.drag(['r3', 's'], ['r5', 'q'], { shift: true });
    expect(t.block()).toBe('r1/n:r5/q');
    expect(t.where()).toBe('r3/s');
  });
});

describe('S12-Q15: the handle and a fill after a mouse drag', () => {
  it('the handle on the far corner while the focus is on the start; a fill keeps the focus there, the block source ∪ filled, the handle at its new corner', () => {
    const t = fmake();
    t.down(t.cell('r1', 'name')!, t.pt('r1', 'name'));
    t.move(t.pt('r3', 'qty'));
    t.up(t.pt('r3', 'qty'));
    t.click(t.cell('r3', 'qty')!);
    expect(t.focusAt()).toBe('r1/name');
    expect(t.handleAt()).toBe('r3/qty');
    t.dragTo('r6', 'qty');
    expect(t.focusAt()).toBe('r1/name');
    expect(t.block()).toBe('r1/name:r6/qty');
    expect(t.handleAt()).toBe('r6/qty');
  });
});
