// `@dzgrid/dom/range`, the pointer (docs/behaviors/range-selection.md 8–9, owner QB1, S11-Q1; step11a-plan.md
// « Pointer »): a press and a drag over cells, Shift+click and Shift+drag from the anchor, the click after a drag
// swallowed, the presses that start nothing, the auto-scroll at the edges by frames (four directions, ltr and rtl,
// pinned segments, scaled scrolling), stopping at the ends and on release, cancel, Escape and blur.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { definePart } from '../src/part.js';
import { detail } from '../src/detail.js';
import { EN } from '../src/locales/en.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { cells, cleanup, COLUMNS, HEADER, ids, join, rmake, rowsOf, WIDE, type R, treeGrid } from './support-range.js';

afterEach(cleanup);

describe('range pointer: a press and a drag', () => {
  it('drags a block from the pressed cell to the cell under the pointer; the root says it is ranging; the focus stays on the pressed cell, the anchor, after the release too (S12-Q15, revising S11-Q1)', () => {
    const t = rmake();
    t.down(t.cell('r1', 'n')!, t.at('r1', 'n'));
    expect(t.where()).toBe('r1/n');
    t.move(t.at('r2', 'n'));
    t.move(t.at('r3', 's'));
    expect(t.block()).toBe('r1/n:r3/s');
    expect(t.ctx.el.root.hasAttribute('data-dzg-ranging')).toBe(true);
    expect(t.where()).toBe('r1/n');
    expect(t.ranged()).toEqual(cells(ids(1, 3), ['n', 's']));
    t.up(t.at('r3', 's'));
    expect(t.ctx.el.root.hasAttribute('data-dzg-ranging')).toBe(false);
    expect(t.where()).toBe('r1/n');
    expect(t.block()).toBe('r1/n:r3/s');
  });

  it('a press and a release on one cell is a click: no block, the click goes through', () => {
    const t = rmake({ settings: { selection: { mode: 'multi', click: true } } });
    t.down(t.cell('r2')!, t.at('r2'));
    t.move(t.at('r2'));
    t.up(t.at('r2'));
    t.click(t.cell('r2')!);
    expect(t.block()).toBeNull();
    expect(t.events.filter((e) => e.type === 'cellClicked')).toHaveLength(1);
    expect(t.g.kernel.selection.keys.size).toBe(1);
  });

  it('swallows the click after a drag, once: no rowClicked, no row selected (click: true); the next click goes through', () => {
    const t = rmake({ settings: { selection: { mode: 'multi', click: true } } });
    t.drag(['r1', 'name'], ['r3', 'n']);
    expect(t.block()).toBe('r1/name:r3/n');
    expect(t.events.filter((e) => e.type === 'rowClicked' || e.type === 'cellClicked')).toEqual([]);
    expect(t.g.kernel.selection.keys.size).toBe(0);
    t.click(t.cell('r5')!);
    expect(t.events.filter((e) => e.type === 'cellClicked')).toHaveLength(1);
  });

  it('Shift+click extends from the anchor and moves the focus there (QB2); again from the same anchor; Shift+drag goes on extending, its release leaves the focus where its press put it (S12-Q15: the release moves no focus)', () => {
    const t = rmake();
    t.focus('r1', 'n');
    const p = t.down(t.cell('r3', 's')!, t.at('r3', 's'), { shiftKey: true });
    expect(p.defaultPrevented).toBe(true);
    t.up(t.at('r3', 's'));
    expect(t.block()).toBe('r1/n:r3/s');
    expect(t.where()).toBe('r3/s');
    t.down(t.cell('r4', 'q')!, t.at('r4', 'q'), { shiftKey: true });
    t.move(t.at('r5', 'q'), { shiftKey: true });
    expect(t.block()).toBe('r1/n:r5/q');
    t.up(t.at('r5', 'q'));
    expect(t.where()).toBe('r4/q');
  });

  it('Shift+click on a cell makes cells, never rows, even with selection.click (QB1); Shift+click on a box still ticks rows', () => {
    const t = rmake({ settings: { selection: { mode: 'multi', click: true, checkbox: true } } });
    t.down(t.cell('r1')!, t.at('r1'));
    t.up(t.at('r1'));
    t.click(t.cell('r1')!);
    expect(t.g.kernel.selection.keys.size).toBe(1);
    t.down(t.cell('r3', 'n')!, t.at('r3', 'n'), { shiftKey: true });
    t.up(t.at('r3', 'n'));
    t.click(t.cell('r3', 'n')!, { shiftKey: true });
    expect(t.block()).toBe('r1/name:r3/n');
    expect(t.g.kernel.selection.keys.size).toBe(1);
    t.click(t.rowEl('r4')!.querySelector('.dzg-check')!, { shiftKey: true });
    expect(t.g.kernel.selection.keys.size).toBe(4);
  });

  it('the presses that start nothing: the box, a header, a field or a widget in a cell, a detail, a touch, another button; drag: false', () => {
    const part = definePart('detail', { mount: (host) => ((host.textContent = 'panel'), {}) });
    const t = rmake({ messages: join(EN, EN_RANGE, EN_DETAIL), settings: { selection: { mode: 'multi', checkbox: true } }, features: (r) => [detail<R>({ part, height: 64 }), r] });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(1)!)], expanded: true }, 'api');
    const tries: [string, Element, PointerEventInit?][] = [
      ['box', t.rowEl('r2')!.querySelector('.dzg-check')!],
      ['header', t.host.querySelector('.dzg-hcell[data-col="n"]')!],
      ['detail', t.rowEl('xr1')!.querySelector('.dzg-dcell')!],
      ['touch', t.cell('r2')!, { pointerType: 'touch' }],
      ['right button', t.cell('r2')!, { button: 2 }],
    ];
    const input = document.createElement('input');
    t.cell('r3')!.append(input);
    tries.push(['field', input]);
    for (const [what, el, init] of tries) {
      t.down(el, t.at('r2'), init);
      t.move(t.at('r5', 'q'), init);
      t.up(t.at('r5', 'q'), document, init);
      expect(t.block(), what).toBeNull();
      expect(t.ctx.el.root.hasAttribute('data-dzg-ranging'), what).toBe(false);
    }
    const off = rmake({ range: { drag: false } });
    off.drag(['r1', 'name'], ['r3', 'n']);
    expect(off.block()).toBeNull();
    // Shift+click still works without the drag.
    off.focus('r1');
    off.down(off.cell('r3', 'n')!, off.at('r3', 'n'), { shiftKey: true });
    expect(off.block()).toBe('r1/name:r3/n');
  });

  it('right to left: the cell under the pointer by its logical place, pinned start columns included', () => {
    const columns = WIDE.map((c, i) => (i === 0 ? { ...c, pinned: 'start' as const } : c));
    const t = rmake({ lang: 'ar', columns });
    t.drag(['r1', 'c0'], ['r2', 'c2']);
    expect(t.block()).toBe('r1/c0:r2/c2');
    expect(t.ranged()).toEqual(cells(ids(1, 2), ['c0', 'c1', 'c2']));
  });
});

describe('range pointer: the auto-scroll at the edges (one frame loop)', () => {
  it('down: near the bottom edge the view scrolls by frames, at most one row height a frame, the corner follows; the release stops it', () => {
    const t = rmake({ rows: rowsOf(500) });
    t.down(t.cell('r1')!, t.at('r1'));
    t.move(t.at('r2'));
    t.move({ clientX: 60, clientY: HEADER + 320 - 2 });
    let last = t.ctx.scroll.logicalTop;
    for (let i = 0; i < 10; i++) {
      expect(t.tick()).toBeGreaterThan(0);
      const now = t.ctx.scroll.logicalTop;
      expect(now - last).toBeGreaterThan(0);
      expect(now - last).toBeLessThanOrEqual(t.h());
      last = now;
    }
    const corner = t.api().get()!.focus.row;
    expect(t.g.kernel.rows.displayed.indexOf(corner)).toBeGreaterThan(10);
    t.up({ clientX: 60, clientY: HEADER + 320 - 2 });
    // The focus goes to the corner, brought into view whole (a little scroll); then nothing moves any more.
    const released = t.ctx.scroll.logicalTop;
    expect(released - last).toBeLessThan(t.h());
    t.tick();
    expect(t.pending()).toBe(0);
    expect(t.ctx.scroll.logicalTop).toBe(released);
  });

  it('faster deeper into the band', () => {
    const speed = (y: number) => {
      const t = rmake({ rows: rowsOf(500) });
      t.down(t.cell('r1')!, t.at('r1'));
      t.move(t.at('r2'));
      t.move({ clientX: 60, clientY: y });
      t.tick();
      return t.ctx.scroll.logicalTop;
    };
    expect(speed(HEADER + 320 - 2)).toBeGreaterThan(speed(HEADER + 320 - 20));
  });

  it('up: above the body (over the header) the view scrolls back, and stops at the top', () => {
    const t = rmake({ rows: rowsOf(500) });
    t.scroll(200);
    const from = t.ctx.layout!.indexAt(200) + 2;
    const id = `r${from}`;
    t.down(t.cell(id)!, t.at(id));
    t.move(t.at(`r${from + 1}`));
    t.move({ clientX: 60, clientY: HEADER - 10 });
    for (let i = 0; i < 40 && t.pending(); i++) t.tick();
    expect(t.ctx.scroll.logicalTop).toBe(0);
    expect(t.pending()).toBe(0);
    expect(t.api().get()!.focus.row).toBe(t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(0)!));
  });

  it('stops at the end, clamped (scaled scrolling, a million rows: logical, never past the last row)', () => {
    const t = rmake({ rows: rowsOf(1_000_000), maxPhysical: 100_000 });
    const max = (t.ctx.scroll.mapper as { maxLogical: number }).maxLogical;
    t.g.api.ensureVisible(t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(999_990)!));
    t.g.api.refresh();
    // Rows 999 983 … 999 992 are in view.
    const id = 'r999985';
    t.focus(id);
    t.down(t.cell(id)!, t.at(id));
    t.move(t.at('r999986'));
    t.move({ clientX: 60, clientY: HEADER + 320 - 1 });
    for (let i = 0; i < 40 && t.pending(); i++) t.tick();
    expect(t.pending()).toBe(0);
    expect(t.ctx.scroll.logicalTop).toBe(max);
    expect(t.block()).toBe(`${id}/name:r999999/name`);
  });

  it('inline: near the end edge the centre scrolls toward the end, logically, in both directions; back near the start it returns', () => {
    for (const lang of ['en', 'ar'] as const) {
      const columns = WIDE.map((c, i) => (i === 0 ? { ...c, pinned: 'start' as const } : c));
      const t = rmake({ lang, columns });
      t.down(t.cell('r1', 'c2')!, t.at('r1', 'c2'));
      t.move(t.at('r1', 'c3'));
      const endEdge = lang === 'ar' ? 2 : 598;
      t.move({ clientX: endEdge, clientY: t.at('r1', 'c3').clientY });
      for (let i = 0; i < 5; i++) t.tick();
      expect(t.box.scrollInline, lang).toBeGreaterThan(0);
      const far = t.box.scrollInline;
      // Over the pinned start column: back toward the start.
      t.move({ clientX: lang === 'ar' ? 550 : 50, clientY: t.at('r1', 'c3').clientY });
      t.tick();
      t.tick();
      expect(t.box.scrollInline, lang).toBeLessThan(far);
      t.up({ clientX: 0, clientY: 0 });
    }
  });

  it('inline: held at the end edge, the centre stops at its end (clamped by the grid, not the browser), and the frames stop', () => {
    const columns = WIDE.map((c, i) => (i === 0 ? { ...c, pinned: 'start' as const } : c));
    const t = rmake({ columns });
    t.down(t.cell('r1', 'c2')!, t.at('r1', 'c2'));
    t.move(t.at('r1', 'c3'));
    t.move({ clientX: 598, clientY: t.at('r1', 'c3').clientY });
    for (let i = 0; i < 60 && t.pending(); i++) t.tick();
    // c1 … c9 are 900 px in a 500 px centre: 400 at most.
    expect(t.box.scrollInline).toBe(400);
    expect(t.pending()).toBe(0);
    expect(t.api().get()!.focus.column).toBe('c9');
  });

  it('stops on pointercancel, on window blur, on lost capture (the drag\'s block gone), and on Escape (the block dropped)', () => {
    for (const how of ['cancel', 'blur', 'lost', 'escape'] as const) {
      const t = rmake({ rows: rowsOf(500) });
      t.down(t.cell('r1')!, t.at('r1'));
      t.move(t.at('r2'));
      t.move({ clientX: 60, clientY: HEADER + 320 - 2 });
      t.tick();
      if (how === 'cancel') document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
      if (how === 'blur') window.dispatchEvent(new Event('blur'));
      if (how === 'lost') t.ctx.el.body.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }));
      if (how === 'escape') t.press('Escape');
      t.tick();
      expect(t.pending(), how).toBe(0);
      expect(t.ctx.el.root.hasAttribute('data-dzg-ranging'), how).toBe(false);
      // Cancelled: the drag's block goes (review 2: the block from before it, none after a plain press); Escape drops it.
      expect(t.block(), how).toBeNull();
    }
  });
});

describe('range pointer: review of step 11a', () => {
  it('auto-scroll: at most one row height a frame, however far outside the body', () => {
    const t = rmake({ rows: rowsOf(500) });
    t.down(t.cell('r1')!, t.at('r1'));
    t.move(t.at('r2'));
    t.move({ clientX: 60, clientY: HEADER + 320 + 300 });
    const a = t.ctx.scroll.logicalTop;
    t.tick();
    expect(t.ctx.scroll.logicalTop - a).toBeGreaterThan(0);
    expect(t.ctx.scroll.logicalTop - a).toBeLessThanOrEqual(t.h());
  });

  it('the top band starts under the pinned parents', () => {
    const t = treeGrid();
    t.scroll(32 * 20);
    t.g.api.refresh();
    const inset = t.ctx.inset ?? 0;
    expect(inset).toBeGreaterThan(0);
    t.down(t.cell('r30')!, t.at('r30'));
    t.move(t.at('r31'));
    t.move({ clientX: 60, clientY: HEADER + inset + t.h() / 2 });
    const a = t.ctx.scroll.logicalTop;
    t.tick();
    expect(t.ctx.scroll.logicalTop).toBeLessThan(a);
  });

  it('a point over the pinned parents is the row under them', () => {
    const t = treeGrid();
    t.scroll(32 * 20);
    t.g.api.refresh();
    const inset = t.ctx.inset ?? 0;
    t.down(t.cell('r30')!, t.at('r30'));
    t.move(t.at('r31'));
    t.move({ clientX: 60, clientY: HEADER + 2 });
    const d = t.g.kernel.rows.displayed;
    expect(t.api().get()!.focus.row).toBe(d.keyAt(t.ctx.layout!.indexAt(t.ctx.scroll.logicalTop + inset)));
  });

  it('with the check box column the pointer finds the right column; a pinned end column in a narrow grid too', () => {
    const t = rmake({ settings: { selection: { mode: 'multi', checkbox: true } } });
    t.drag(['r1', 'name'], ['r3', 'n']);
    expect(t.block()).toBe('r1/name:r3/n');
    const e = rmake({ columns: COLUMNS.map((c) => (c.id === 'q' ? { ...c, pinned: 'end' as const } : c)) });
    e.drag(['r1', 'name'], ['r2', 'q']);
    expect(e.block()).toBe('r1/name:r2/q');
  });

  it('a move inside the pressed cell is no drag', () => {
    const t = rmake();
    const p = t.at('r2');
    t.down(t.cell('r2')!, p);
    t.move({ clientX: p.clientX + 3, clientY: p.clientY + 2 });
    expect(t.ctx.el.root.hasAttribute('data-dzg-ranging')).toBe(false);
  });

  it('the swallowed click is prevented; Shift+mousedown on a cell is prevented, a plain one not', () => {
    const t = rmake();
    t.down(t.cell('r1')!, t.at('r1'));
    t.move(t.at('r3'));
    t.up(t.at('r3'));
    const c = new MouseEvent('click', { bubbles: true, cancelable: true });
    t.cell('r3')!.dispatchEvent(c);
    expect(c.defaultPrevented).toBe(true);
    const m = new MouseEvent('mousedown', { bubbles: true, cancelable: true, shiftKey: true });
    t.cell('r1')!.dispatchEvent(m);
    const n = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    t.cell('r1')!.dispatchEvent(n);
    expect([m.defaultPrevented, n.defaultPrevented]).toEqual([true, false]);
  });

  it('a non-primary pointer starts nothing; another pointer moving, lifting or cancelled does not touch the drag', () => {
    const t = rmake();
    t.down(t.cell('r1')!, t.at('r1'), { isPrimary: false });
    t.move(t.at('r3'), { isPrimary: false });
    expect(t.block()).toBeNull();
    const u = rmake();
    u.down(u.cell('r1')!, u.at('r1'));
    u.move(u.at('r3'), { pointerId: 2 });
    expect(u.block()).toBeNull();
    u.move(u.at('r3'));
    expect(u.ctx.el.root.hasAttribute('data-dzg-ranging')).toBe(true);
    u.up(u.at('r3'), document, { pointerId: 2 });
    document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 2 }));
    expect(u.ctx.el.root.hasAttribute('data-dzg-ranging')).toBe(true);
    u.up(u.at('r4'));
    expect(u.ctx.el.root.hasAttribute('data-dzg-ranging')).toBe(false);
  });

  it('the drag\'s start empties the text selection and captures the pointer, not the press', () => {
    const t = rmake();
    const rm = vi.spyOn(Selection.prototype, 'removeAllRanges');
    const cap = vi.fn();
    (t.ctx.el.body as unknown as { setPointerCapture: unknown }).setPointerCapture = cap;
    t.down(t.cell('r1')!, t.at('r1'));
    expect(rm).not.toHaveBeenCalled();
    t.move(t.at('r3'));
    expect(rm).toHaveBeenCalled();
    expect(cap).toHaveBeenCalledWith(1);
  });

  it('Escape mid-drag: the focus stays on the pressed cell, the next click is not swallowed', () => {
    const t = rmake();
    t.down(t.cell('r1')!, t.at('r1'));
    t.move(t.at('r3'));
    t.press('Escape');
    expect(t.where()).toBe('r1/name');
    t.up(t.at('r3'));
    t.click(t.cell('r3')!);
    expect(t.events.filter((e) => e.type === 'cellClicked')).toHaveLength(1);
  });

  it('review 1: the swallow is armed by the release only, for the click of the same task: a later click (Enter on a link, a reader\'s click, el.click()) goes through', () => {
    vi.useFakeTimers();
    const t = rmake();
    t.down(t.cell('r1')!, t.at('r1'));
    t.move(t.at('r3'));
    t.up(t.at('r3'));
    // No click from the browser (released off the grid); later, a click by the keyboard or a reader.
    vi.advanceTimersByTime(0);
    t.click(t.cell('r5')!);
    expect(t.events.filter((e) => e.type === 'cellClicked')).toHaveLength(1);
    for (const how of ['cancel', 'blur', 'lost'] as const) {
      const u = rmake();
      u.down(u.cell('r1')!, u.at('r1'));
      u.move(u.at('r3'));
      if (how === 'cancel') document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
      if (how === 'blur') window.dispatchEvent(new Event('blur'));
      if (how === 'lost') u.ctx.el.body.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }));
      u.click(u.cell('r5')!);
      expect(u.events.filter((e) => e.type === 'cellClicked'), how).toHaveLength(1);
    }
  });

  it('review 2: a cancelled drag (pointercancel, blur) leaves no block of its own, the focus where it was pressed, nothing said; a Shift+drag cancelled gives back the block from before', () => {
    vi.useFakeTimers();
    for (const how of ['cancel', 'blur'] as const) {
      const t = rmake();
      t.down(t.cell('r1')!, t.at('r1'));
      t.move(t.at('r3', 'n'));
      if (how === 'cancel') document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
      else window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(1000);
      expect(t.block(), how).toBeNull();
      expect(t.where(), how).toBe('r1/name');
      expect(t.said(), how).toEqual([]);
      const s = rmake();
      s.focus('r1');
      s.down(s.cell('r2')!, s.at('r2'), { shiftKey: true });
      s.move(s.at('r4', 'n'), { shiftKey: true });
      expect(s.block()).toBe('r1/name:r4/n');
      if (how === 'cancel') document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
      else window.dispatchEvent(new Event('blur'));
      expect(s.block(), how).toBe('r1/name:r2/name');
      expect(s.where(), how).toBe('r2/name');
    }
  });

  it('review 2: a pen is like a finger: no drag-select (it would scroll and select at once); a mouse drags', () => {
    const t = rmake();
    t.down(t.cell('r1')!, t.at('r1'), { pointerType: 'pen' });
    t.move(t.at('r3'), { pointerType: 'pen' });
    t.up(t.at('r3'), document, { pointerType: 'pen' });
    expect(t.block()).toBeNull();
    expect(t.ctx.el.root.hasAttribute('data-dzg-ranging')).toBe(false);
  });

  it('review 5: under a CSS scale on an ancestor (×2), the cell under the pointer is still the right one', () => {
    const t = rmake();
    const z = 2;
    t.vp.getBoundingClientRect = () => ({ left: 0, right: 600 * z, top: 0, bottom: (40 + 320) * z, width: 600 * z, height: (40 + 320) * z, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    t.ctx.el.header.getBoundingClientRect = () => ({ left: 0, right: 600 * z, top: 0, bottom: 40 * z, width: 600 * z, height: 40 * z, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(t.vp, 'offsetWidth', { value: 600, configurable: true });
    Object.defineProperty(t.vp, 'offsetHeight', { value: 360, configurable: true });
    const at = (id: string, col: string) => {
      const p = t.at(id, col);
      return { clientX: p.clientX * z, clientY: p.clientY * z };
    };
    t.down(t.cell('r2')!, at('r2', 'name'));
    t.move(at('r5', 's'));
    t.up(at('r5', 's'));
    expect(t.block()).toBe('r2/name:r5/s');
  });
});
