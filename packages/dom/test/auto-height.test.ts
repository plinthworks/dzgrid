// Automatic row height (Phase 6 step 9, docs/behaviors/auto-height.md, docs/phase-6-steps/step09-plan.md §1–§4;
// owner Q-R1, Q9-1..Q9-4). jsdom has no layout: a measure stub gives a hidden probe a height from its text and
// its inline size (support-auto-height.ts). Written before the code; expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import type { GridEvent } from '@dzgrid/core';
import { sparseRowLayout } from '@dzgrid/core/detail';
import { LAYOUT_CSS } from '../src/styles.js';
import { amake, cleanup, measureStub, NOTES, problemsOf, type N } from './support-auto-height.js';

afterEach(cleanup);

describe('auto row height: measure (auto-height.md 1–4)', () => {
  it('a row is as tall as its tallest wrapped cell; short rows keep the row height; the row element follows', () => {
    measureStub();
    const t = amake();
    // R0: 150 characters × 8 px over 184 px = 7 lines = 149 px (the stub's 149.4, rounded up to 150); R1 'short' = 1 line,
    // 29.4 → 30, under 32: the floor.
    expect(t.heightOf('R0')).toBe(150);
    expect(t.heightOf('R1')).toBe(32);
    expect(t.rowEl('R0')!.style.blockSize).toBe('150px');
    expect(t.rowEl('R1')!.style.blockSize).toBe('32px');
    expect(t.offsetOf('R2')).toBe(150 + 32);
  });

  it('the floor: never under the density\'s row height (compact 28, spacious 40), whole pixels', () => {
    measureStub();
    const t = amake({ settings: { density: 'spacious' } });
    expect(t.heightOf('R1')).toBe(40);
    expect(t.heightOf('R0')).toBe(150);
    // Compact: the one line (30) is taller than its floor (28).
    t.g.update({ density: 'compact' });
    expect(t.heightOf('R1')).toBe(30);
  });

  it('the wrap column\'s cells say so (data-wrap), the others not; the layout CSS lets them wrap in the body only', () => {
    measureStub();
    const t = amake();
    expect(t.cell('R0')!.hasAttribute('data-wrap')).toBe(true);
    expect(t.cell('R0', 'name')!.hasAttribute('data-wrap')).toBe(false);
    expect(LAYOUT_CSS).toMatch(/\.dzg-body \.dzg-cell\[data-wrap\][^{]*\{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere/);
  });

  it('probes: all written, then read, then all removed — never a read between two writes, none left', () => {
    const m = measureStub();
    const t = amake();
    expect(m.reads.length).toBeGreaterThan(0);
    // Every read of the first pass sees every probe of the pass in the page (written first, removed after).
    const first = m.reads[0]!;
    // The first pass mounted the rows the estimate fits (320 / 32 + the overscan): one probe each.
    expect(first).toBe(12);
    expect(m.reads.slice(0, first)).toEqual(Array(first).fill(first));
    expect(m.hidden()).toBe(0);
    // The rows hold their cells only.
    for (const r of t.host.querySelectorAll('.dzg-layer > .dzg-row')) expect(r.querySelectorAll('.dzg-cell').length).toBe(2);
  });

  it('at most three extra passes in a frame (measure, lay out, paint again)', () => {
    measureStub();
    const t = amake();
    const p = (t.g as unknown as { paints: number }).paints;
    expect(p).toBeGreaterThanOrEqual(2);
    expect(p).toBeLessThanOrEqual(4);
  });

  it('a fixed rowHeight wins: no measure at all, no warning, rows that tall (choice 1)', () => {
    const m = measureStub();
    const t = amake({ settings: { rowHeight: 40 } });
    expect(m.reads).toEqual([]);
    expect(t.heightOf('R0')).toBe(40);
    expect(problemsOf(t.events)).toEqual([]);
    // Taken off: measured again.
    t.g.update({ rowHeight: undefined });
    expect(t.heightOf('R0')).toBe(150);
  });

  it('wrap without autoHeight(): the text wraps in the fixed height, one missing-feature warning', () => {
    const m = measureStub();
    const t = amake({ features: [] });
    expect(m.reads).toEqual([]);
    expect(t.heightOf('R0')).toBe(32);
    expect(t.cell('R0')!.hasAttribute('data-wrap')).toBe(true);
    expect(problemsOf(t.events)).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'columns.note.wrap', detail: 'auto-height' }]);
  });

  it('only mounted rows are measured; a row measured once is not measured again when it comes back', () => {
    const m = measureStub();
    const t = amake();
    // The rows the first pass mounted (12), and none twice; R100 never mounted, never measured.
    expect(m.reads.length).toBe(12);
    expect(t.mounted()).not.toContain('R100');
    expect(t.heightOf('R100')).toBe(32);
    const before = m.reads.length;
    t.scroll(4000);
    const mid = m.reads.length;
    expect(mid).toBeGreaterThan(before);
    t.scroll(0);
    // Back at the top: R0.. are in the cache, measured at this width: no read.
    expect(m.reads.length).toBe(mid);
    expect(t.heightOf('R0')).toBe(150);
  });
});

describe('auto row height: re-measured when (auto-height.md 7)', () => {
  it('the wrap column narrowed or widened: rows grow or shrink; another column\'s width measures nothing', () => {
    const m = measureStub();
    const t = amake();
    let n = m.reads.length;
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', width: 150 }] }, 'user');
    t.g.api.refresh();
    expect(m.reads.length).toBe(n);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'note', width: 400 }] }, 'user');
    t.g.api.refresh();
    expect(m.reads.length).toBeGreaterThan(n);
    // 150 chars × 8 / 384 = 4 lines: 89.4 → 90.
    expect(t.heightOf('R0')).toBe(90);
    n = m.reads.length;
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'note', width: 100 }] }, 'user');
    t.g.api.refresh();
    // 1200 / 84 = 15 lines: 309.4 → 310.
    expect(t.heightOf('R0')).toBe(310);
  });

  it('the language, the direction, the density: measured again; another column hidden or shown: nothing (the wrapped widths kept)', () => {
    const m = measureStub();
    const t = amake();
    const step = (fn: () => void) => {
      const n = m.reads.length;
      fn();
      t.g.api.refresh();
      return m.reads.length - n;
    };
    // Heights depend on the wrapped columns' widths only (as built: a column hidden beside them measures nothing).
    expect(step(() => t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', hidden: true }] }, 'user'))).toBe(0);
    expect(step(() => t.g.update({ direction: 'rtl' }))).toBeGreaterThan(0);
    expect(step(() => t.g.update({ locale: 'fr-FR' }))).toBeGreaterThan(0);
    expect(step(() => t.g.update({ density: 'compact' }))).toBeGreaterThan(0);
    expect(t.heightOf('R1')).toBe(30);
    expect(step(() => t.g.update({ density: 'spacious' }))).toBeGreaterThan(0);
    expect(t.heightOf('R1')).toBe(40);
    // Nothing changed: nothing measured.
    expect(step(() => {})).toBe(0);
  });

  it('the wrap column hidden: rows back to the row height, nothing measured', () => {
    const m = measureStub();
    const t = amake();
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'note', hidden: true }] }, 'user');
    t.g.api.refresh();
    const n = m.reads.length;
    expect(t.heightOf('R0')).toBe(32);
    t.scroll(3000);
    expect(m.reads.length).toBe(n);
  });

  it('one row\'s data changed: that row only is measured again, and grows', () => {
    const m = measureStub();
    const rows = NOTES(200);
    const t = amake({ rows });
    const n = m.reads.length;
    (t.g.kernel.rows as unknown as { applyTransaction(t: object): void }).applyTransaction({ update: [{ ...rows[1]!, note: 'word '.repeat(10) }] });
    expect(m.reads.length - n).toBe(1);
    // 50 chars × 8 / 184 = 3 lines: 69.4 → 70.
    expect(t.heightOf('R1')).toBe(70);
  });

  it('the fonts loaded late: measured again once (Q9-4)', () => {
    const m = measureStub();
    const fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    try {
      const t = amake();
      const n = m.reads.length;
      fonts.dispatchEvent(new Event('loadingdone'));
      expect(m.reads.length - n).toBe(t.mounted().length);
    } finally {
      delete (document as { fonts?: unknown }).fonts;
    }
  });
});

describe('auto row height: no jump (auto-height.md 5, S3)', () => {
  /** Where offset `x` falls in the layout now: its row and the distance into it (before the scroll measures anything there). */
  const where = (t: ReturnType<typeof amake>, x: number) => {
    const L = t.ctx.layout!;
    const i = L.indexAt(x);
    return { key: String(t.d().keyAt(i)).replace(/^d:\d+:/, ''), into: x - L.offsetOf(i), i };
  };

  it('jumped to the middle: the row at the top keeps its distance into it while rows around it are measured', () => {
    measureStub();
    const t = amake({ rows: NOTES(2000, (i) => i % 2 === 0) });
    const w = where(t, 30_000);
    expect(w.into).toBeGreaterThan(0);
    // The rows above it (the overscan) are short-or-long and unmeasured: they are measured and grow, the top row stays.
    const above = String(t.d().keyAt((w.i - 1) as never)).replace(/^d:\d+:/, '');
    expect(t.heightOf(above)).toBe(32);
    t.scroll(30_000);
    expect(t.heightOf(above)).toBe((w.i - 1) % 2 === 0 ? 150 : 32);
    expect(t.topKey()).toBe(w.key);
    expect(t.top() - t.offsetOf(w.key)).toBe(w.into);
  });

  it('the top row itself grows: its top stays where it was (the same distance into it)', () => {
    measureStub();
    const t = amake({ rows: NOTES(2000) });
    // R500 (long), 5 px into it, as the layout places it before it is measured.
    const x = t.offsetOf('R500') + 5;
    t.scroll(x);
    expect(t.topKey()).toBe('R500');
    expect(t.heightOf('R500')).toBe(150);
    expect(t.top() - t.offsetOf('R500')).toBe(5);
  });

  it('at the end it stays at the end; at the top it stays at the top', () => {
    measureStub();
    const t = amake({ rows: NOTES(2000) });
    expect(t.top()).toBe(0);
    const s = t.ctx.scroll as unknown as { mapper: { maxLogical: number } };
    // At the end before the rows there are measured: they grow, the view stays at the end.
    const end = s.mapper.maxLogical;
    t.scroll(end);
    expect(s.mapper.maxLogical).toBeGreaterThan(end);
    expect(t.top()).toBe(s.mapper.maxLogical);
    expect(t.mounted()).toContain('R1999');
  });

  it('a million rows past the browser\'s height (scaled): a measured top row holds still, the end is reachable', () => {
    measureStub();
    const t = amake({ rows: NOTES(1_000_000), maxPhysical: 1_000_000 });
    const s = (t.g as unknown as { scroll: { mapper: { scaled: boolean; maxLogical: number }; scrollTo(l: number): void } }).scroll;
    expect(s.mapper.scaled).toBe(true);
    // Where the logical 16 000 005 falls before anything there is measured: that row stays at that distance into it.
    const w = where(t, 16_000_005);
    s.scrollTo(16_000_005);
    expect(t.topKey()).toBe(w.key);
    expect(t.top() - t.offsetOf(w.key)).toBeCloseTo(w.into, 6);
    expect(t.heightOf(w.key)).toBe(+w.key.slice(1) % 5 === 0 ? 150 : 32);
    s.scrollTo(s.mapper.maxLogical);
    expect(t.top()).toBe(s.mapper.maxLogical);
    expect(t.mounted()).toContain('R999999');
  });
});

describe('auto row height: the warning (auto-height.md 6)', () => {
  const large = (events: GridEvent<N>[]) => problemsOf(events).filter((p) => (p.code as string) === 'auto-height-large');
  it('10 000 rows: none; 10 001: one, once', () => {
    measureStub();
    expect(large(amake({ rows: NOTES(10_000) }).events)).toEqual([]);
    const t = amake({ rows: NOTES(10_001) });
    t.scroll(5000);
    t.g.api.refresh();
    expect(large(t.events)).toEqual([{ code: 'auto-height-large', severity: 'warning', path: 'columns.note.wrap' }]);
  });
});

describe('auto row height: the base seams', () => {
  it('the feature taken away: rows back to the row height, nothing left on the grid', () => {
    measureStub();
    const t = amake();
    const h = t.g.kernel as unknown;
    expect(h).toBeTruthy();
    for (const f of t.ctx.features) f.destroy();
    t.g.api.refresh();
    expect(t.heightOf('R0')).toBe(32);
    expect(t.ctx.again).toBeUndefined();
  });

  it('rows laid out again after the user scrolled: the row at the user\'s top holds still, never the one before the scroll (S3)', () => {
    // Frames of the test's own: a scroll and a new layout land in the same frame (a measure from a frame before, a panel).
    const queue: FrameRequestCallback[] = [];
    const raf = { requestAnimationFrame: (f: FrameRequestCallback) => queue.push(f), cancelAnimationFrame: () => {} };
    const flush = () => { while (queue.length) queue.shift()!(0); };
    const t = amake({ features: [], rows: NOTES(500), raf });
    flush();
    t.scroll(3200);
    flush();
    expect(t.topKey()).toBe('R100');
    // The user scrolls up to R50; before the frame, row 10 (above both) grows by 100 px.
    t.scroll(1600);
    t.ctx.layoutFor = (d, h) => sparseRowLayout(d, h, { at: [10], heights: [h + 100] });
    flush();
    expect(t.topKey()).toBe('R50');
    expect(t.top()).toBe(1700);
    // A scroll written just before the frame, its event not come yet (an app's own frame): the paint reads it. Row 5 grows by 50.
    t.box.scrollTop = 1000;
    t.ctx.layoutFor = (d, h) => sparseRowLayout(d, h, { at: [5, 10], heights: [h + 50, h + 100] });
    t.g.api.refresh();
    flush();
    // 1000 was R28, 4 px into it (rows 0–9, row 10 132 px, then 17 rows): R28 now 50 px lower.
    expect(t.topKey()).toBe('R28');
    expect(t.top()).toBe(1050);
  });
});
