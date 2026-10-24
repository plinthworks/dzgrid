// The refusal bubble (Phase 5 step 5; edit-validation.md 3, step05-plan 19–21; WCAG 2.4.11): one per grid, below
// the cell or above it when there is no room, at the cell's inline start (mirrored right to left), never over the
// cell; placed again at each paint while shown, hidden while the cell is out of the view, read only then.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ed, cleanup } from './support-editors.js';

afterEach(cleanup);

type Box = { top: number; bottom: number; left: number; right: number };
const rect = (b: Box) => ({ ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON() {} }) as DOMRect;

/** Rects by element: the edited cell's (changeable), the viewport's, the bubble's size (200 × 30). */
function stub(t: ReturnType<typeof ed>, cell: () => Box, view: Box = { top: 0, bottom: 700, left: 0, right: 1000 }) {
  const reads: Element[] = [];
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    reads.push(this);
    if (this.classList.contains('dzg-bubble')) return rect({ top: 0, bottom: 30, left: 0, right: 200 });
    if (this.classList.contains('dzg-viewport')) return rect(view);
    if (this.closest('[data-dzg-editing]')) return rect(cell());
    return rect({ top: 0, bottom: 0, left: 0, right: 0 });
  });
  return reads;
}
const refuse = (t: ReturnType<typeof ed>, id = 'r5') => {
  t.at(id, 'n');
  t.key('F2');
  t.type('x');
  t.key('Enter');
  return t.bubble()!;
};
const px = (el: HTMLElement, p: string) => parseFloat(el.style.getPropertyValue(p));
const clear = (b: HTMLElement, c: Box) => {
  const top = px(b, 'inset-block-start');
  return top >= c.bottom || top + 30 <= c.top;
};

describe('placement', () => {
  it('below the cell (bottom + 4), at its inline start (left to right)', () => {
    const t = ed();
    const c = { top: 100, bottom: 132, left: 300, right: 380 };
    stub(t, () => c);
    const b = refuse(t);
    expect(b.hidden).toBe(false);
    expect(px(b, 'inset-block-start')).toBe(136);
    expect(px(b, 'inset-inline-start')).toBe(300);
    expect(clear(b, c)).toBe(true);
    expect(b.id).toBeTruthy();
    expect(t.field()!.getAttribute('aria-describedby')).toBe(b.id);
  });

  it('above the cell when there is no room below (near the window’s bottom)', () => {
    const t = ed();
    const c = { top: 735, bottom: 767, left: 300, right: 380 };
    expect(window.innerHeight).toBe(768);
    stub(t, () => c, { top: 0, bottom: 768, left: 0, right: 1000 });
    const b = refuse(t);
    expect(px(b, 'inset-block-start')).toBe(735 - 4 - 30);
    expect(clear(b, c)).toBe(true);
  });

  it('right to left: the inline start is the cell’s right edge', () => {
    const t = ed({ lang: 'ar' });
    const c = { top: 100, bottom: 132, left: 300, right: 380 };
    stub(t, () => c);
    const b = refuse(t);
    expect(px(b, 'inset-inline-start')).toBe(window.innerWidth - 380);
    expect(clear(b, c)).toBe(true);
  });

  it('placed again at each paint while shown; hidden while the cell is out of the view, back when it returns', () => {
    const t = ed();
    let c = { top: 100, bottom: 132, left: 300, right: 380 };
    stub(t, () => c);
    const b = refuse(t);
    c = { top: 200, bottom: 232, left: 300, right: 380 };
    t.ctx.schedule();
    expect(px(b, 'inset-block-start')).toBe(236);
    c = { top: 900, bottom: 932, left: 300, right: 380 };
    t.ctx.schedule();
    expect(b.hidden).toBe(true);
    expect(t.field()!.isConnected).toBe(true);
    c = { top: 50, bottom: 82, left: 300, right: 380 };
    t.ctx.schedule();
    expect(b.hidden).toBe(false);
    expect(px(b, 'inset-block-start')).toBe(86);
  });

  it('no rect read in a paint while no bubble is shown; a bounded few while it is', () => {
    const t = ed();
    const reads = stub(t, () => ({ top: 100, bottom: 132, left: 300, right: 380 }));
    t.at('r5', 'n');
    t.key('F2');
    reads.length = 0;
    t.ctx.schedule();
    expect(reads.length).toBe(0);
    t.type('x');
    t.key('Enter');
    reads.length = 0;
    t.ctx.schedule();
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.length).toBeLessThanOrEqual(3);
  });
});

describe('the bubble element', () => {
  it('one per grid, outside the grid role, in the top layer where the browser has it; gone with the grid', () => {
    const t = ed();
    const b = refuse(t);
    refuse(t, 'r6');
    expect(t.host.querySelectorAll('.dzg-bubble').length).toBe(1);
    expect(b.closest('[role=grid]')).toBeNull();
    expect(b.textContent).toBe('number expected');
    t.g.destroy();
    expect(b.isConnected).toBe(false);
  });

  it('a nested grid’s bubble is its own (each grid one)', () => {
    const a = ed();
    const outer = refuse(a);
    const host2 = a.cell('r9', 's')!.appendChild(document.createElement('div'));
    const b = ed({ host: host2 });
    const inner = refuse(b, 'r1');
    expect(inner).not.toBe(outer);
  });
});
