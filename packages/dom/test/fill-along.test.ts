// Step 14 (1.1.0, the owner's « arbre » screen; docs/behaviors/fill.md 26): `fill(blocks, { along: 'row' | 'column' })`
// — the target brought back onto the allowed axis for every way (drag, no-drag click, keyboard mode, api.fill), Ctrl+D /
// Ctrl+R for the forbidden axis not taken, a bad value warned once and ignored. Rows: frows (qty = i² mod 11: r2 4, r3 9,
// r4 5, r5 3; price = i + 0.5). Expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, flush, fmake, key } from './support-fill.js';
import { R_ } from './support-range.js';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const ctrl = { ctrlKey: true } as const;
const filling = (t: ReturnType<typeof fmake>) => t.ctx.el.root.hasAttribute('data-dzg-filling');
const warned = (t: ReturnType<typeof fmake>) => t.of('problems').flatMap((e) => e.problems).filter((p) => p.path.startsWith('fill'));

describe('default: both ways (fill.md 26, unchanged)', () => {
  it('a drag mostly down fills down, no warning', () => {
    const t = fmake();
    t.at('r2', 'qty');
    t.dragTo('r9', 'price');
    expect(t.changes()).toEqual(['r3/qty=4', 'r4/qty=4', 'r5/qty=4', 'r6/qty=4', 'r7/qty=4', 'r8/qty=4']);
    expect(warned(t)).toEqual([]);
  });
});

describe("along: 'row'", () => {
  it('a drag straight down never starts: no outline, no data-dzg-filling, nothing written or said', async () => {
    const t = fmake({ fill: { along: 'row' } });
    t.at('r2', 'qty');
    t.dragTo('r5', 'qty', { noUp: true });
    expect(filling(t)).toBe(false);
    expect(t.target()).toEqual([]);
    t.up(t.pt('r5', 'qty'), document);
    t.click(t.cell('r5', 'qty')!);
    await flush();
    expect(t.requests).toHaveLength(0);
    expect(t.said().filter((x) => x.startsWith('Cells filled'))).toEqual([]);
  });

  it('a diagonal drag fills along the row by its own distance, even when the rows distance is larger', () => {
    const t = fmake({ fill: { along: 'row' } });
    t.at('r2', 'qty');
    t.dragTo('r9', 'price', { noUp: true });
    expect(filling(t)).toBe(true);
    expect(t.target()).toEqual(['r2/price']);
    t.up(t.pt('r9', 'price'), document);
    expect(t.changes()).toEqual(['r2/price=4']);
    expect(t.block()).toBe('r2/qty:r2/price');
  });

  it('right to left: the pointer moving physically left (toward the inline end) fills the row', () => {
    const t = fmake({ lang: 'ar', fill: { along: 'row' } });
    t.at('r2', 'qty');
    // Price, after qty in reading order, is on its left on screen.
    expect(t.pt('r2', 'price').clientX).toBeLessThan(t.pt('r2', 'qty').clientX);
    t.dragTo('r6', 'price');
    expect(t.changes()).toEqual(['r2/price=4']);
  });

  it('the keyboard mode: ArrowDown taken and does nothing (no target, no sentence); ArrowRight then Enter fills the row', async () => {
    vi.useFakeTimers();
    const t = fmake({ fill: { along: 'row' } });
    t.at('r2', 'qty');
    t.press('Enter', { ctrlKey: true, shiftKey: true });
    expect(t.press('ArrowDown').defaultPrevented).toBe(true);
    t.press('ArrowDown');
    expect(t.target()).toEqual([]);
    vi.advanceTimersByTime(450);
    expect(t.said().filter((x) => x.startsWith('Down'))).toEqual([]);
    t.press('ArrowRight');
    expect(t.target()).toEqual(['r2/price']);
    t.press('Enter');
    expect(t.changes()).toEqual(['r2/price=4']);
  });

  it('the keyboard mode right to left: ArrowLeft goes toward the end of the row', () => {
    const t = fmake({ lang: 'ar', fill: { along: 'row' } });
    t.at('r2', 'qty');
    t.press('Enter', { ctrlKey: true, shiftKey: true });
    t.press('ArrowDown');
    t.press('ArrowLeft');
    expect(t.target()).toEqual(['r2/price']);
    t.press('Enter');
    expect(t.changes()).toEqual(['r2/price=4']);
  });

  it('the keyboard mode: PageDown does nothing; Ctrl+End goes to the last column on the same row only', () => {
    const t = fmake({ fill: { along: 'row' } });
    t.at('r2', 'qty');
    t.press('Enter', { ctrlKey: true, shiftKey: true });
    expect(t.press('PageDown').defaultPrevented).toBe(true);
    expect(t.target()).toEqual([]);
    t.press('End', ctrl);
    expect(t.target()).toEqual(['r2/at', 'r2/code', 'r2/day', 'r2/ok', 'r2/price', 'r2/ref', 'r2/st']);
  });

  it('Ctrl+D not taken (not prevented, nothing written); Ctrl+R fills from the previous column; api.down() null, api.end() counts', () => {
    const a = fmake({ fill: { along: 'row' } });
    a.at('r4', 'qty');
    expect(a.press('d', ctrl).defaultPrevented).toBe(false);
    expect(a.requests).toHaveLength(0);
    a.at('r4', 'price');
    expect(a.press('r', ctrl).defaultPrevented).toBe(true);
    expect(a.changes()).toEqual(['r4/price=5']);
    const b = fmake({ fill: { along: 'row' } });
    b.at('r4', 'price');
    expect(b.fapi().down()).toBeNull();
    expect(b.fapi().end()).toEqual({ filled: 1, refused: 0, readOnly: 0 });
  });

  it('api.fill: a cell below gives null; a cell below and to the end fills the row', () => {
    const t = fmake({ fill: { along: 'row' } });
    t.at('r2', 'qty');
    expect(t.fapi().fill({ row: key('r5'), column: 'qty' })).toBeNull();
    expect(t.fapi().fill({ row: key('r9'), column: 'price' })).toEqual({ filled: 1, refused: 0, readOnly: 0 });
    expect(t.changes()).toEqual(['r2/price=4']);
  });

  it('the no-drag click: a cell below and to the end fills the row', () => {
    const t = fmake({ fill: { along: 'row' } });
    t.at('r2', 'qty');
    t.pickTo('r6', 'price');
    expect(t.changes()).toEqual(['r2/price=4']);
  });

  it('bulk has no direction: Ctrl+Enter-like apply writes the whole 2 × 2 block', () => {
    const t = fmake({ fill: { along: 'row' } });
    t.at('r1', 'qty');
    t.api().set(R_(['r1', 'qty'], ['r2', 'price']));
    expect(t.fapi().apply({ value: 7 })).toEqual({ filled: 4, refused: 0, readOnly: 0 });
    expect(t.changes()).toEqual(['r1/qty=7', 'r1/price=7', 'r2/qty=7', 'r2/price=7']);
  });
});

describe("along: 'column'", () => {
  it('a drag along the row never starts; a diagonal one fills down; Ctrl+R not taken', () => {
    const a = fmake({ fill: { along: 'column' } });
    a.at('r2', 'qty');
    a.dragTo('r2', 'price', { noUp: true });
    expect(filling(a)).toBe(false);
    a.up(a.pt('r2', 'price'), document);
    expect(a.requests).toHaveLength(0);
    const b = fmake({ fill: { along: 'column' } });
    b.at('r2', 'qty');
    b.dragTo('r5', 'day');
    expect(b.changes()).toEqual(['r3/qty=4', 'r4/qty=4', 'r5/qty=4']);
    const c = fmake({ fill: { along: 'column' } });
    c.at('r4', 'price');
    expect(c.press('r', ctrl).defaultPrevented).toBe(false);
    expect(c.fapi().end()).toBeNull();
    expect(c.requests).toHaveLength(0);
  });
});

describe('a bad value', () => {
  it("along: 'x' — both ways, one invalid-setting warning per grid (fill.along, x), nothing thrown", () => {
    const t = fmake({ fill: { along: 'x' as never } });
    t.at('r2', 'qty');
    t.dragTo('r9', 'price');
    expect(t.changes()).toEqual(['r3/qty=4', 'r4/qty=4', 'r5/qty=4', 'r6/qty=4', 'r7/qty=4', 'r8/qty=4']);
    t.at('r4', 'price');
    t.press('r', ctrl);
    expect(warned(t)).toEqual([{ code: 'invalid-setting', severity: 'warning', path: 'fill.along', detail: 'x' }]);
  });
});
