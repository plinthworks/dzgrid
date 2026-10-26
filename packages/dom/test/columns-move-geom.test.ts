// Where a drag lands, from the fake geometry (Phase 6 step 2, column-move.md 3–6; step02-plan §2): the gap in logical
// coordinates (left to right and right to left, the same expectations), the centre with its scroll, the pinned segments;
// the bar centred on the gap and clamped inside its segment; auto-scroll near the centre's edges at
// ceil(24 × (32 − d) / 32) px a frame, stopped at 0, at the end, on leaving the band and on release; 1 000 columns: no
// read per column.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { cleanup, colmake, SIX, WIDE, type R } from './support-columns.js';

afterEach(cleanup);

const barAt = (t: ReturnType<typeof colmake>) => t.bar()!.style.getPropertyValue('inset-inline-start');

for (const lang of ['en', 'ar'] as const) {
  describe(`gaps and the bar (${lang === 'ar' ? 'right to left' : 'left to right'}): the same logical numbers`, () => {
    it('the centre without scroll: the bar 1 px before the gap\'s edge (2 px wide), clamped inside the view', () => {
      const t = colmake({ lang, columns: SIX() });
      t.drag('b', 360, { noUp: true });
      expect(t.bar()!.hidden).toBe(false);
      expect(barAt(t)).toBe('399px');
      t.move(t.pt(10));
      t.tick();
      expect(barAt(t)).toBe('0px');
      t.move(t.pt(595));
      t.tick();
      expect(barAt(t)).toBe('598px');
      t.up(t.pt(595));
      expect(t.shown()).toEqual(['a', 'c', 'd', 'e', 'f', 'b']);
    });

    it('the centre scrolled 250 px: the gap counts the scroll', () => {
      const t = colmake({ lang, columns: WIDE });
      t.box.scrollInline = 250;
      t.ctx.el.viewport.dispatchEvent(new Event('scroll'));
      // c5 is 500–600 in the centre, 250–350 on screen; 330 is past its half: after c5.
      t.drag('c3', 330, { noUp: true });
      expect(barAt(t)).toBe('349px');
      t.up(t.pt(330));
      expect(t.shown().slice(0, 7)).toEqual(['c0', 'c1', 'c2', 'c4', 'c5', 'c3', 'c6']);
    });

    it('pinned segments: the bar stays inside the segment it targets (start 0–100, end 500–600)', () => {
      const t = colmake({ lang, columns: SIX({ a: { pinned: 'start' }, f: { pinned: 'end' } }) });
      t.drag('c', 95, { noUp: true });
      // The gap after a (100) is the start segment's end: the bar inside it.
      expect(barAt(t)).toBe('98px');
      t.move(t.pt(505));
      t.tick();
      expect(barAt(t)).toBe('500px');
      t.move(t.pt(105));
      t.tick();
      // The centre's first gap (100): inside the centre.
      expect(barAt(t)).toBe('100px');
      t.up(t.pt(105));
      expect(t.seg('center')).toEqual(['c', 'b', 'd', 'e']);
      expect(t.moved()).toHaveLength(1);
    });

    it('a root with a 1 px border: the bar placed from the layer\'s box (the root\'s padding box), not the root\'s border box', () => {
      const t = colmake({ lang, columns: SIX() });
      t.ctx.el.root.getBoundingClientRect = () => ({ left: -1, right: 601, top: -1, bottom: 361, width: 602, height: 362, x: -1, y: -1, toJSON: () => ({}) }) as DOMRect;
      t.drag('b', 360, { noUp: true });
      expect(barAt(t)).toBe('399px');
    });

    it('the ghost: the header\'s text, its inline size capped at 240 px, at the pointer', () => {
      const t = colmake({ lang, columns: SIX({ b: { width: 300 } }) });
      t.drag('b', 420, { noUp: true });
      expect(t.ghost()!.textContent).toBe('B');
      expect(t.ghost()!.style.getPropertyValue('inline-size')).toBe('240px');
      expect(t.ghost()!.style.getPropertyValue('inset-inline-start')).toBe('420px');
    });
  });
}

describe('auto-scroll (M5)', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: within 32 px of the centre's end, ceil(24 × (32 − d) / 32) a frame; at the start edge back; stops at 0 and on leaving the band`, () => {
      const t = colmake({ lang, columns: WIDE });
      t.drag('c1', 590, { noUp: true });
      // The first frame (tick in drag) scrolled 17 (d = 10): 24 × 22 / 32 = 16.5 → 17.
      expect(t.box.scrollInline).toBe(17);
      t.tick();
      expect(t.box.scrollInline).toBe(34);
      t.move(t.pt(599));
      t.tick();
      expect(t.box.scrollInline).toBe(58);
      t.move(t.pt(300));
      t.tick();
      expect(t.box.scrollInline).toBe(58);
      expect(t.pending()).toBe(0);
      t.move(t.pt(5));
      t.tick();
      // d = 5: 24 × 27 / 32 = 20.25 → 21.
      expect(t.box.scrollInline).toBe(37);
      t.tick();
      t.tick();
      expect(t.box.scrollInline).toBe(0);
      t.tick();
      expect(t.pending()).toBe(0);
      t.up(t.pt(5));
      expect(t.shown()[0]).toBe('c1');
    });
  }

  it('stops at the end of the columns (400 px of scroll in WIDE) and on release', () => {
    const t = colmake({ columns: WIDE });
    t.drag('c1', 599, { noUp: true });
    for (let i = 0; i < 30; i++) t.tick();
    expect(t.box.scrollInline).toBe(400);
    expect(t.pending()).toBe(0);
    t.up(t.pt(599));
    expect(t.shown().at(-1)).toBe('c1');
    t.tick();
    expect(t.pending()).toBe(0);
  });

  it('next to a pinned segment: the band is inside the centre (start pinned 0–100: the band 100–132)', () => {
    const cols: ColumnDef<R, any>[] = WIDE.map((c, i) => (i === 0 ? { ...c, pinned: 'start' as const } : c));
    const t = colmake({ columns: cols });
    t.box.scrollInline = 100;
    t.drag('c5', 120, { noUp: true });
    // d = 20: 24 × 12 / 32 = 9.
    expect(t.box.scrollInline).toBe(91);
    t.move(t.pt(90));
    t.tick();
    expect(t.box.scrollInline).toBe(91);
  });
});

describe('1 000 columns', () => {
  it('a gap is found from the layout: a frame reads the view\'s box a constant number of times, never per column', () => {
    const many: ColumnDef<R, any>[] = Array.from({ length: 1000 }, (_, i) => ({ id: `k${i}`, header: `K${i}`, width: 80 }));
    const t = colmake({ columns: many });
    t.drag('k2', 500, { noUp: true });
    const rect = vi.spyOn(t.vp, 'getBoundingClientRect');
    const read = vi.spyOn(t.ctx.geometry, 'read');
    const cells = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    t.move(t.pt(300));
    t.tick();
    expect(rect.mock.calls.length).toBeLessThanOrEqual(3);
    expect(read.mock.calls.length).toBeLessThanOrEqual(3);
    expect(cells.mock.calls.length).toBeLessThanOrEqual(4);
    t.up(t.pt(300));
    expect(t.shown().slice(0, 4)).toEqual(['k0', 'k1', 'k3', 'k2']);
  });
});
