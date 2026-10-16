import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number };
const H = 32;
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

/**
 * 5 000 rows of 32 px (160 000 px) under a cap of 40 000 px: a ratio of
 * about 4, the scaled mode of a million rows at a size jsdom can hold.
 */
let onBar = false;
function make(count = 5000, maxPhysical = 40_000) {
  onBar = false;
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const writes: number[] = [];
  const geometry: Geometry = {
    read: () => ({ ...box }),
    writeScrollTop: (px) => { writes.push(px); box.scrollTop = Math.max(0, Math.min(px, maxPhysical - box.block)); },
    writeScrollInline: (px) => { box.scrollInline = px; },
  };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = [{ id: 'n', type: 'number' }];
  const g = createGrid<R>(host, { rows: Array.from({ length: count }, (_, i) => ({ id: `r${i}`, n: i })), getRowId: (r) => r.id, columns, messages: EN }, { geometry, sync: true, maxPhysical, isOnScrollbar: () => onBar });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const internals = g as unknown as { scroll: { readonly logicalTop: number; readonly mapper: { scaled: boolean; ratio: number; maxPhysical: number; maxLogical: number } | null; scrollTo(logical: number): void } };
  const nativeScroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  const first = () => Number(host.querySelector('.dzg-layer > .dzg-row')!.getAttribute('aria-rowindex')) - 2;
  const rowTop = (id: string) => {
    // Where a row shows, relative to the viewport's body top: layer + row offset − scroll.
    const layer = parseFloat(host.querySelector<HTMLElement>('.dzg-layer')!.style.insetBlockStart);
    const row = host.querySelector<HTMLElement>(`.dzg-layer > .dzg-row[data-key="${dataKey(id)}"]`);
    return row ? layer + parseFloat(row.style.insetBlockStart) - box.scrollTop : null;
  };
  return { g, vp, box, writes, s: internals.scroll, nativeScroll, first, rowTop };
}

describe('scaled scrolling', () => {
  it('is scaled at this size', () => {
    const { s } = make();
    expect(s.mapper!.scaled).toBe(true);
    expect(s.mapper!.ratio).toBeGreaterThan(3.5);
  });

  it('moves the logical offset by the wheel’s distance, not ratio times it', () => {
    const { vp, s, box } = make();
    const e = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    vp.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(s.logicalTop).toBe(100);
    expect(box.scrollTop).toBeCloseTo(100 / s.mapper!.ratio, 6);
    vp.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, cancelable: true }));
    expect(s.logicalTop).toBe(100 + 3 * H);
  });

  it('ignores the scroll event its own write causes', () => {
    const { vp, s, box } = make();
    s.scrollTo(80_000);
    vp.dispatchEvent(new Event('scroll'));
    expect(s.logicalTop).toBe(80_000);
    // The browser rounds what we wrote: its event reports a little off, still ours.
    box.scrollTop += 0.6;
    vp.dispatchEvent(new Event('scroll'));
    expect(s.logicalTop).toBe(80_000);
  });

  it('writes a huge request clamped to the physical range', () => {
    const { s, writes } = make();
    s.scrollTo(1e12);
    expect(Math.max(...writes)).toBeLessThanOrEqual(s.mapper!.maxPhysical);
    expect(s.logicalTop).toBe(s.mapper!.maxLogical);
  });

  it('maps a native scroll (touch) relatively: the finger’s distance', () => {
    const { s, nativeScroll, box } = make();
    s.scrollTo(40_000);
    const physical = box.scrollTop;
    nativeScroll(physical + 50);
    expect(s.logicalTop).toBeCloseTo(40_050, 6);
  });

  it('maps a scrollbar drag absolutely', () => {
    const { vp, s, nativeScroll } = make();
    // A pointer on the scrollbar: jsdom has no layout, so the test says where it is.
    onBar = true;
    vp.dispatchEvent(new PointerEvent('pointerdown', { clientX: 599, clientY: 10 }));
    nativeScroll(20_000);
    expect(s.logicalTop).toBeCloseTo(20_000 * s.mapper!.ratio, 3);
    vp.ownerDocument.dispatchEvent(new PointerEvent('pointerup'));
    nativeScroll(20_010);
    expect(s.logicalTop).toBeCloseTo(20_000 * s.mapper!.ratio + 10, 3);
  });

  it('snaps to the ends when a relative scroll reaches them', () => {
    const { s, nativeScroll, box } = make();
    s.scrollTo(100);
    nativeScroll(0);
    expect(s.logicalTop).toBe(0);
    s.scrollTo(s.mapper!.maxLogical - 200);
    nativeScroll(s.mapper!.maxPhysical);
    expect(s.logicalTop).toBe(s.mapper!.maxLogical);
    expect(box.scrollTop).toBe(s.mapper!.maxPhysical);
  });

  it('keeps the row at the top of the view where it was when rows are inserted above it', () => {
    const { g, s, rowTop } = make(2000, 1e9);
    g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    s.scrollTo(500 * H + 10);
    const before = rowTop('r500');
    g.kernel.rows.applyTransaction({ add: Array.from({ length: 10 }, (_, i) => ({ id: `new${i}`, n: -1 - i })) });
    expect(rowTop('r500')).toBe(before);
    expect(s.logicalTop).toBe(510 * H + 10);
  });

  it('stays at the top when rows arrive above while at the top, and at the end while at the end', () => {
    const { g, s } = make(2000, 1e9);
    g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    g.kernel.rows.applyTransaction({ add: [{ id: 'a', n: -5 }] });
    expect(s.logicalTop).toBe(0);
    s.scrollTo(1e9);
    const end = s.logicalTop;
    g.kernel.rows.applyTransaction({ add: [{ id: 'z', n: 1e9 }] });
    expect(s.logicalTop).toBe(end + H);
  });

  it('is not scaled, and maps 1:1, below the cap', () => {
    const { s, nativeScroll } = make(100, 1e9);
    expect(s.mapper!.scaled).toBe(false);
    nativeScroll(777);
    expect(s.logicalTop).toBe(777);
  });
});
