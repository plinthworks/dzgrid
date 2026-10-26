// Moving a column with the pointer (Phase 6 step 2, docs/behaviors/column-move.md 1–9, 11; step02-plan §2, §6): 3 px is a
// click (sort), 4 px a drag; a finger never; the controls inside a header, the grip, the box column never arm; one patch
// and one `columnsChanged` (source user) per drop, none on the same place; the click after a drag swallowed; Escape (said),
// pointercancel, a lost capture, a blur, new definitions, a direction change, destroy cancel quietly; segments pin and
// unpin; released outside, cancelled, the column still shown; an open editor makes the press a click; `drag: false`.
// Six columns of 100 px in a 600 px view (a 0–100, b 100–200, …): the gaps by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, colmake, SIX, HEADER } from './support-columns.js';

afterEach(cleanup);

describe('the threshold, the pointer types, what never arms (M1, M2)', () => {
  it('3 px is a click: the column sorts and stays; 4 px is a drag: no sort', () => {
    const t = colmake({ columns: SIX() });
    t.hold('b');
    t.move(t.pt(t.mid('b') + 3));
    expect(t.dragging()).toBe(false);
    t.up(t.pt(t.mid('b') + 3));
    t.click(t.hcell('b')!);
    expect(t.sorted()).toHaveLength(1);
    expect(t.moved()).toHaveLength(0);
    t.hold('c');
    t.move(t.pt(t.mid('c') + 4));
    expect(t.dragging()).toBe(true);
    expect(t.layer()).not.toBeNull();
    t.up(t.pt(t.mid('c') + 4));
    t.click(t.hcell('c')!);
    expect(t.dragging()).toBe(false);
    expect(t.layer()).toBeNull();
    expect(t.sorted()).toHaveLength(1);
    expect(t.moved()).toHaveLength(0);
  });

  it('the block axis counts too (4 px down is a drag)', () => {
    const t = colmake({ columns: SIX() });
    t.hold('b');
    t.move({ ...t.pt(t.mid('b')), clientY: HEADER / 2 + 4 });
    expect(t.dragging()).toBe(true);
  });

  it('a finger or a pen never drags (Q-M3; a pen is click-only, as for blocks and the fill): no layer, no move; the mouse does', () => {
    const t = colmake({ columns: SIX() });
    t.drag('b', 360, { init: { pointerType: 'touch' }, noClick: true });
    t.drag('b', 360, { init: { pointerType: 'pen' }, noClick: true });
    expect(t.moved()).toHaveLength(0);
    expect(t.layer()).toBeNull();
    expect(t.dragging()).toBe(false);
    t.drag('b', 360);
    expect(t.shown()).toEqual(['a', 'c', 'd', 'b', 'e', 'f']);
  });

  it('a press on a floating-filter cell (a header row a feature adds) never arms', () => {
    const rowsFeature = { id: 'rows', setup: () => ({ headerRows: [{ id: 'f', mount() {} }], destroy() {} }) };
    const t = colmake({ columns: SIX(), more: [rowsFeature as never] });
    const cell = t.ctx.el.header.querySelector<HTMLElement>('.dzg-hextra[data-col="b"]')!;
    expect(cell).not.toBeNull();
    t.down(cell, t.pt(t.mid('b')));
    t.move(t.pt(t.mid('b') + 10));
    expect(t.dragging()).toBe(false);
    t.up(t.pt(t.mid('b') + 10));
  });

  it('a secondary button, a second finger, the resize grip, a control or a part\'s element inside the header never arm', () => {
    const t = colmake({ columns: SIX() });
    t.drag('b', 360, { init: { button: 2 } });
    t.drag('b', 360, { init: { isPrimary: false } });
    const grip = t.hcell('b')!.querySelector('.dzg-resize')!;
    expect(grip).not.toBeNull();
    t.drag(grip, 360, { noClick: true });
    t.up(t.pt(360));
    const button = document.createElement('button');
    t.hcell('c')!.append(button);
    t.drag(button, 460);
    const owned = document.createElement('span');
    owned.dataset['dzgOwner'] = 'popup';
    t.hcell('d')!.append(owned);
    t.drag(owned, 60);
    expect(t.moved()).toHaveLength(0);
    expect(t.layer()).toBeNull();
  });

  it('the select-all box\'s column never arms', () => {
    const t = colmake({ columns: SIX(), settings: { selection: { mode: 'multi', checkbox: true } } });
    t.down(t.ctx.headerRenderer.check!, t.pt(20));
    t.move(t.pt(200));
    expect(t.dragging()).toBe(false);
  });

  it('a locked column (movable: false) is a click: no ghost, it sorts (M11)', () => {
    const t = colmake({ columns: SIX({ b: { movable: false } }) });
    t.drag('b', 360, { noUp: true });
    expect(t.layer()).toBeNull();
    expect(t.dragging()).toBe(false);
    t.up(t.pt(360));
    t.click(t.hcell('b')!);
    expect(t.sorted()).toHaveLength(1);
    expect(t.moved()).toHaveLength(0);
  });

  it('an open editor: the press is a click (it saves or stays as Phase 5 says), no drag', () => {
    const t = colmake({ columns: SIX() });
    const cell = document.createElement('div');
    t.ctx.editor = { key: 'd:0:r0' as never, column: 'a', cell, field: cell };
    t.drag('b', 360);
    expect(t.moved()).toHaveLength(0);
    expect(t.dragging()).toBe(false);
  });

  it('drag: false — the pointer never moves a column; the keys and the API still do', () => {
    const t = colmake({ columns: SIX(), cols: { drag: false } });
    t.drag('b', 360);
    expect(t.moved()).toHaveLength(0);
    expect(t.sorted()).toHaveLength(1);
    expect(t.api().move('b', 1)).toBe('moved');
    expect(t.shown()).toEqual(['a', 'c', 'b', 'd', 'e', 'f']);
  });
});

describe('the drop (M4, M6, M7)', () => {
  it('one patch, one columnsChanged from the user, the new place said at once; the click after it swallowed (no sort)', () => {
    const t = colmake({ columns: SIX() });
    t.drag('b', 360);
    expect(t.shown()).toEqual(['a', 'c', 'd', 'b', 'e', 'f']);
    expect(t.moved()).toHaveLength(1);
    expect(t.moved()[0]).toMatchObject({ source: 'user' });
    expect(t.said()).toEqual(['B: column 4 of 6']);
    expect(t.sorted()).toHaveLength(0);
    // The swallow is spent: the next click sorts.
    t.click(t.hcell('a')!);
    expect(t.sorted()).toHaveLength(1);
    t.drag('d', 40);
    expect(t.shown()).toEqual(['d', 'a', 'c', 'b', 'e', 'f']);
    expect(t.moved()).toHaveLength(2);
  });

  it('no click after the release (a release outside the header): the swallow ends with the task, a later keyboard click sorts', async () => {
    const t = colmake({ columns: SIX() });
    t.drag('b', 360, { noClick: true });
    await new Promise((r) => setTimeout(r, 0));
    t.click(t.hcell('a')!);
    expect(t.sorted()).toHaveLength(1);
  });

  it('a drag without its click, then a new press: the next click sorts (M8)', () => {
    const t = colmake({ columns: SIX() });
    t.drag('b', 360, { noClick: true });
    t.down(t.hcell('d')!, t.pt(t.mid('d')));
    t.up(t.pt(t.mid('d')));
    t.click(t.hcell('d')!);
    expect(t.sorted()).toHaveLength(1);
  });

  it('half a column decides the gap: 340 is before d, 360 after it', () => {
    const t = colmake({ columns: SIX() });
    t.drag('b', 340);
    expect(t.shown()).toEqual(['a', 'c', 'b', 'd', 'e', 'f']);
  });

  it('Shift held: still a move, never a multi-sort', () => {
    const t = colmake({ columns: SIX() });
    t.drag('b', 360, { init: { shiftKey: true } });
    expect(t.shown()).toEqual(['a', 'c', 'd', 'b', 'e', 'f']);
    expect(t.sorted()).toHaveLength(0);
  });

  it('released on its own place (either gap next to it, or over itself): nothing, no event, no sentence; the click still swallowed', () => {
    const t = colmake({ columns: SIX() });
    t.drag('b', 190);
    t.drag('b', 110);
    expect(t.moved()).toHaveLength(0);
    expect(t.said()).toEqual([]);
    expect(t.sorted()).toHaveLength(0);
  });

  it('the other columns do not move before the drop; the source header is marked while it lasts', () => {
    const t = colmake({ columns: SIX() });
    t.drag('b', 360, { noUp: true });
    expect(t.shown()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(t.hcell('b')!.hasAttribute('data-dzg-moving')).toBe(true);
    expect(t.hcell('c')!.hasAttribute('data-dzg-moving')).toBe(false);
    expect(t.ghost()!.textContent).toBe('B');
    expect(t.layer()!.getAttribute('aria-hidden')).toBe('true');
    t.up(t.pt(360));
    expect(t.hcell('b')!.hasAttribute('data-dzg-moving')).toBe(false);
  });

  it('segments: into the start segment pins it start, into the end one end; out of a pinned one unpins (M6)', () => {
    const t = colmake({ columns: SIX({ a: { pinned: 'start' }, f: { pinned: 'end' } }) });
    t.drag('c', 40);
    expect(t.seg('start')).toEqual(['c', 'a']);
    expect(t.g.kernel.columns.state().find((s) => s.id === 'c')!.pinned).toBe('start');
    expect(t.moved()).toHaveLength(1);
    expect(t.said()).toEqual(['C: column 1 of 6']);
    t.drag('d', 560);
    expect(t.seg('end')).toEqual(['f', 'd']);
    // Start [c, a] 0–200, centre [b, e] 200–400, end [f, d] 400–600: a dropped between b and e.
    t.drag('a', 300);
    expect(t.seg('start')).toEqual(['c']);
    expect(t.seg('center')).toEqual(['b', 'a', 'e']);
    expect(t.g.kernel.columns.state().find((s) => s.id === 'a')!.pinned).toBeNull();
  });

  it('next to a hidden column it lands after it (M4)', () => {
    const t = colmake({ columns: SIX({ c: { hidden: true } }) });
    // Shown a, b, d, e, f (d 200–300): e dropped before d.
    t.drag('e', 210);
    expect(t.shown()).toEqual(['a', 'b', 'e', 'd', 'f']);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'c', hidden: false }] }, 'api');
    expect(t.shown()).toEqual(['a', 'b', 'c', 'e', 'd', 'f']);
  });
});

describe('cancelling (M8, M9)', () => {
  it('Escape: put back, « Move cancelled », the key never reaches the grid (the block\'s Escape)', () => {
    const t = colmake({ columns: SIX() });
    const heard = vi.fn();
    t.ctx.el.viewport.addEventListener('keydown', heard);
    t.drag('b', 360, { noUp: true });
    const e = t.press('Escape', {}, t.hcell('b')!);
    expect(e.defaultPrevented).toBe(true);
    expect(heard).not.toHaveBeenCalled();
    expect(t.said()).toEqual(['Move cancelled']);
    expect(t.layer()).toBeNull();
    expect(t.dragging()).toBe(false);
    t.up(t.pt(360));
    t.click(t.hcell('b')!);
    expect(t.moved()).toHaveLength(0);
    expect(t.sorted()).toHaveLength(0);
    // Escape with no drag is not taken.
    expect(t.press('Escape', {}, t.hcell('b')!).defaultPrevented).toBe(false);
  });

  for (const [what, end] of [
    ['pointercancel', (t: ReturnType<typeof colmake>) => document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }))],
    ['a lost capture', (t: ReturnType<typeof colmake>) => t.ctx.el.header.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }))],
    ['the window losing focus', () => window.dispatchEvent(new Event('blur'))],
    ['new definitions', (t: ReturnType<typeof colmake>) => t.g.kernel.dispatch({ type: 'columns.set', defs: SIX() }, 'host')],
    ['a direction change', (t: ReturnType<typeof colmake>) => (t.g.update({ direction: 'rtl' }), t.tick())],
  ] as const) {
    it(`${what}: cancelled quietly (no sentence, no move)`, () => {
      const t = colmake({ columns: SIX() });
      t.drag('b', 360, { noUp: true });
      expect(t.dragging()).toBe(true);
      end(t);
      expect(t.layer()).toBeNull();
      expect(t.dragging()).toBe(false);
      expect(t.hcell('b')!.hasAttribute('data-dzg-moving')).toBe(false);
      t.up(t.pt(360));
      // The click of that gesture is still swallowed: a cancelled drag never sorts.
      t.click(t.hcell('b') ?? t.ctx.el.header);
      expect(t.sorted()).toHaveLength(0);
      expect(t.shown()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
      expect(t.said()).toEqual([]);
      expect(t.moved().filter((e) => e.source === 'user')).toHaveLength(0);
    });
  }

  it('destroyed mid-drag: the layer goes, nothing thrown on the later release', () => {
    const t = colmake({ columns: SIX() });
    t.drag('b', 360, { noUp: true });
    expect(t.layer()).not.toBeNull();
    t.g.destroy();
    expect(document.querySelector('.dzg-move')).toBeNull();
    expect(() => t.up(t.pt(360))).not.toThrow();
  });

  it('released outside the grid: cancelled quietly, the column still shown (never hidden by dragging out, M9)', () => {
    const t = colmake({ columns: SIX() });
    t.drag('b', 360, { y: 2000, noUp: true });
    expect(t.bar()!.hidden).toBe(true);
    expect(t.ghost()).not.toBeNull();
    t.up({ ...t.pt(360), clientY: 2000 });
    t.click(t.hcell('b')!);
    expect(t.shown()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(t.moved()).toHaveLength(0);
    expect(t.said()).toEqual([]);
    expect(t.sorted()).toHaveLength(0);
  });
});
