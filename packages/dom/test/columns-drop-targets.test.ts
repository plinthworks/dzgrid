// The drop protocol (Phase 6 step 2, group-drop-zone.md D1–D5, column-move.md 10): a registered element whose `accept`
// says yes takes the drop — the bar hidden, the element marked `data-dzg-drop="over"`, `drop(column)` once on release, no
// patch, no sentence, the column still shown; `accept` false or throwing: ignored; a throwing `drop`: reported once, no
// patch; a target removed mid-drag ignored; Escape over a target cancels; targets are per grid.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { DropTarget } from '../src/columns.js';
import { columns } from '../src/columns.js';
import { cleanup, colmake, SIX } from './support-columns.js';

afterEach(cleanup);

/** An element outside the grid, its box at y 500–560 (below the 360 px view), x 0–600. */
const zone = () => {
  const el = document.body.appendChild(document.createElement('div'));
  el.getBoundingClientRect = () => ({ left: 0, right: 600, top: 500, bottom: 560, width: 600, height: 60, x: 0, y: 500, toJSON: () => ({}) }) as DOMRect;
  return el;
};

describe('drop targets', () => {
  it('accepting: bar hidden, marked over, drop(column) once on release; no patch, no columnsChanged, no sentence; the column stays', () => {
    const t = colmake({ columns: SIX() });
    const el = zone();
    const drop = vi.fn();
    const accept = vi.fn(() => true);
    t.api().dropTargets.add(el, { accept, drop, label: 'Group' });
    t.drag('b', 300, { y: 530, noUp: true });
    expect(accept).toHaveBeenCalledWith('b');
    expect(el.getAttribute('data-dzg-drop')).toBe('over');
    expect(t.bar()!.hidden).toBe(true);
    expect(t.ghost()).not.toBeNull();
    // Back over the header: the mark goes, the bar comes back.
    t.move(t.pt(300));
    t.tick();
    expect(el.hasAttribute('data-dzg-drop')).toBe(false);
    expect(t.bar()!.hidden).toBe(false);
    t.move({ ...t.pt(300), clientY: 530 });
    t.tick();
    t.up({ ...t.pt(300), clientY: 530 });
    t.click(t.hcell('b')!);
    expect(drop).toHaveBeenCalledTimes(1);
    expect(drop).toHaveBeenCalledWith('b');
    expect(el.hasAttribute('data-dzg-drop')).toBe(false);
    expect(t.moved()).toHaveLength(0);
    expect(t.said()).toEqual([]);
    expect(t.shown()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(t.sorted()).toHaveLength(0);
  });

  it('accept false, or accept throwing: ignored (released there: cancelled quietly, outside the grid)', () => {
    const t = colmake({ columns: SIX() });
    const a = zone();
    const drop = vi.fn();
    t.api().dropTargets.add(a, { accept: () => false, drop });
    t.drag('b', 300, { y: 530 });
    const b = zone();
    t.api().dropTargets.add(b, { accept: () => { throw new Error('host bug'); }, drop });
    t.drag('b', 300, { y: 530, noUp: true });
    expect(b.hasAttribute('data-dzg-drop')).toBe(false);
    t.up({ ...t.pt(300), clientY: 530 });
    expect(drop).not.toHaveBeenCalled();
    expect(t.moved()).toHaveLength(0);
  });

  it('a throwing drop: reported once (the grid\'s report), nothing patched, the drag over', () => {
    const t = colmake({ columns: SIX() });
    const report = vi.spyOn(t.ctx, 'report').mockImplementation(() => {});
    const el = zone();
    const err = new Error('host bug');
    t.api().dropTargets.add(el, { accept: () => true, drop: () => { throw err; } });
    t.drag('b', 300, { y: 530 });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(err);
    expect(t.moved()).toHaveLength(0);
    expect(t.layer()).toBeNull();
  });

  it('a target removed during the drag: ignored from then on, its mark taken off', () => {
    const t = colmake({ columns: SIX() });
    const el = zone();
    const drop = vi.fn();
    const off = t.api().dropTargets.add(el, { accept: () => true, drop });
    t.drag('b', 300, { y: 530, noUp: true });
    expect(el.getAttribute('data-dzg-drop')).toBe('over');
    off();
    expect(el.hasAttribute('data-dzg-drop')).toBe(false);
    t.move({ ...t.pt(310), clientY: 530 });
    t.tick();
    t.up({ ...t.pt(310), clientY: 530 });
    expect(drop).not.toHaveBeenCalled();
  });

  it('Escape over a target cancels (« Move cancelled »), no drop', () => {
    const t = colmake({ columns: SIX() });
    const el = zone();
    const drop = vi.fn();
    t.api().dropTargets.add(el, { accept: () => true, drop });
    t.drag('b', 300, { y: 530, noUp: true });
    t.press('Escape', {}, t.hcell('b')!);
    expect(el.hasAttribute('data-dzg-drop')).toBe(false);
    t.up({ ...t.pt(300), clientY: 530 });
    expect(drop).not.toHaveBeenCalled();
    expect(t.said()).toEqual(['Move cancelled']);
  });

  it('per grid (D5): one feature object on two grids; a target added through grid A never takes grid B\'s headers', () => {
    const f = columns();
    const a = colmake({ columns: SIX(), feature2: f });
    const b = colmake({ columns: SIX(), feature2: f });
    const el = zone();
    const drop = vi.fn();
    const t: DropTarget = { accept: () => true, drop };
    f.api(a.g)!.dropTargets.add(el, t);
    b.drag('b', 300, { y: 530 });
    expect(drop).not.toHaveBeenCalled();
    expect(el.hasAttribute('data-dzg-drop')).toBe(false);
    a.drag('c', 300, { y: 530 });
    expect(drop).toHaveBeenCalledWith('c');
  });
});
