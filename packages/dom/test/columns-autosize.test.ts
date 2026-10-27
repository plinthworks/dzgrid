// Auto-size (Phase 6 step 6, docs/behaviors/column-resize.md 10–14; owner Q6-2 (the real cells measured), Q6-3 (the
// mounted rows plus the first 200 displayed), Q6-4, Q6-5; step06-plan §3, §5.2): the widest of the header and the cells,
// measured as rendered — clones of the mounted cells and header, a plain cell for each other sampled text — all written,
// then all read (one layout), then removed; one `column.state` patch, one `columnsChanged`, `columnResized finished:
// true` per column that changed only; min / max; hidden and `resizable: false` skipped; a flexible column fixed; the API
// silent unless asked; Home in the mode; the grip's double-click. jsdom has no layout: a probe's width is its text's
// length × 7 + 16 (the padding), by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { captureState } from '@dzgrid/core/state';
import { cleanup, colmake, rowsOf, SIX, type R } from './support-columns.js';

const own = HTMLElement.prototype.getBoundingClientRect;
afterEach(cleanup);

/** The probes: elements given `max-content` inline; their width by their text. Reads counted with the probes present at each read. */
function probes(t: ReturnType<typeof colmake>) {
  const reads: number[] = [];
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('dzg-move')) return t.vp.getBoundingClientRect();
    if (this.style.inlineSize === 'max-content') {
      reads.push(t.host.querySelectorAll('[style*="max-content"]').length);
      const w = (this.textContent ?? '').length * 7 + 16;
      return { left: 0, right: w, top: 0, bottom: 20, width: w, height: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    }
    return own.call(this);
  });
  return reads;
}
const width = (t: ReturnType<typeof colmake>, id: string) => {
  const L = t.g.kernel.columns.layout;
  for (const s of [L.start, L.center, L.end]) {
    const i = s.columns.findIndex((c) => c.id === id);
    if (i !== -1) return s.widths.sizeAt(i);
  }
  return -1;
};
const resized = (t: ReturnType<typeof colmake>) => t.events.filter((e) => e.type === 'columnResized') as Extract<(typeof t.events)[number], { type: 'columnResized' }>[];
/** Column b: `abcdefgh` (72 px) everywhere but `long` on the row `at` (20 letters: 156 px). */
const B = (at: number, long = 'abcdefghijklmnopqrst') => SIX({ b: { value: (r: R) => (r.n === at ? long : 'abcdefgh') } });

describe('what is measured (column-resize.md 11–12)', () => {
  it('the widest of the header and the cells; one read phase: every probe written before the first read, none left', () => {
    const t = colmake({ columns: B(-1) });
    const reads = probes(t);
    t.api().autoSize(['b']);
    expect(width(t, 'b')).toBe(72);
    expect(reads.length).toBeGreaterThan(1);
    // Every read sees all the probes: nothing written between two reads.
    expect(new Set(reads)).toEqual(new Set([reads.length]));
    expect(t.host.querySelectorAll('[style*="max-content"]')).toHaveLength(0);
  });

  it('the first 200 displayed rows count; row 200 (not mounted) does not', () => {
    const a = colmake({ columns: B(199), rows: rowsOf(300) });
    probes(a);
    a.api().autoSize(['b']);
    expect(width(a, 'b')).toBe(156);
    cleanup();
    const b = colmake({ columns: B(200), rows: rowsOf(300) });
    probes(b);
    b.api().autoSize(['b']);
    expect(width(b, 'b')).toBe(72);
  });

  it('the sample is the displayed order: after a sort, other rows', () => {
    const t = colmake({ columns: B(250), rows: rowsOf(300) });
    probes(t);
    t.api().autoSize(['b']);
    expect(width(t, 'b')).toBe(72);
    // Sorted on b descending: row 250's long text comes first.
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'b', dir: 'desc' }] }, 'api');
    t.api().autoSize(['b']);
    expect(width(t, 'b')).toBe(156);
  });

  it('the same text measured once (deduplicated) besides the mounted cells', () => {
    const t = colmake({ columns: B(-1), rows: rowsOf(300) });
    const reads = probes(t);
    t.api().autoSize(['b']);
    const mounted = t.ctx.el.body.querySelectorAll('.dzg-cell[data-col="b"]').length;
    // The header, each mounted cell, and no extra probe (every sampled text is a mounted one's).
    expect(reads.length).toBe(1 + mounted);
  });

  it('a long header wins over short cells; no rows: the header alone', () => {
    const t = colmake({ columns: SIX({ b: { header: 'A rather long header' } }), rows: [] });
    probes(t);
    t.api().autoSize(['b']);
    expect(width(t, 'b')).toBe(20 * 7 + 16);
  });

  it('clamped by min and max', () => {
    const t = colmake({ columns: SIX({ b: { value: () => 'abcdefghijklmnopqrst', maxWidth: 120 }, c: { value: () => 'a', minWidth: 60 } }) });
    probes(t);
    t.api().autoSize(['b', 'c']);
    expect([width(t, 'b'), width(t, 'c')]).toEqual([120, 60]);
  });
});

describe('what it changes (column-resize.md 12–14)', () => {
  it('one patch for all: one columnsChanged, `columnResized finished: true` for each column that changed only', () => {
    const t = colmake({ columns: SIX({ a: { value: () => 'abcdefghijkl' }, b: { value: () => 'abcdefghijklmnopqrst' }, c: { value: () => 'abcdefghijkl' } }) });
    probes(t);
    // a and c: 12 letters, 100 px: unchanged.
    t.api().autoSize(['a', 'b', 'c']);
    expect(t.moved()).toHaveLength(1);
    expect(resized(t).map((e) => [e.column, e.width, e.finished])).toEqual([['b', 156, true]]);
  });

  it('autoSizeAll: every shown column but the hidden and the `resizable: false` ones', () => {
    const t = colmake({ columns: SIX({ c: { hidden: true }, d: { resizable: false } }) });
    probes(t);
    t.api().autoSizeAll();
    // `r0a`…`r199a`: 5 letters at most, 51 px; the headers 1 letter.
    expect(['a', 'b', 'd', 'e', 'f'].map((id) => width(t, id))).toEqual([51, 51, 100, 51, 51]);
    expect(t.g.kernel.columns.state().find((s) => s.id === 'c')?.width).toBeUndefined();
    expect(t.g.kernel.columns.state().find((s) => s.id === 'd')?.width).toBeUndefined();
  });

  it('a flexible column becomes fixed; GridState has the width', () => {
    const t = colmake({ columns: SIX({ b: { flex: 1, width: undefined, value: () => 'abcdefghijklmnopqrst' } }) });
    probes(t);
    t.api().autoSize(['b']);
    expect(t.g.kernel.columns.state().find((s) => s.id === 'b')?.width).toBe(156);
    expect(captureState(t.g.kernel).columns?.find((c) => c.id === 'b')?.width).toBe(156);
  });

  it('silent by default; `say`: one column « B: 156 pixels », all « Columns fitted: n » (those that changed)', () => {
    const t = colmake({ columns: SIX({ b: { value: () => 'abcdefghijklmnopqrst' } }) });
    probes(t);
    t.api().autoSize(['b']);
    expect(t.said()).toEqual([]);
    t.api().autoSize(['a'], { say: true });
    expect(t.said()).toEqual(['A: 51 pixels']);
    t.api().autoSizeAll({ say: true });
    expect(t.said().at(-1)).toBe('Columns fitted: 4');
  });
});

describe('the other ways in (column-resize.md 4, 10)', () => {
  it('Home in the resize mode: fitted as a key (`finished: false`), Enter keeps it, Escape would restore', () => {
    const t = colmake({ columns: B(3) });
    probes(t);
    t.focusHeader('b');
    t.press('r', { altKey: true, code: 'KeyR' }, t.hcell('b')!);
    t.press('Home');
    expect(width(t, 'b')).toBe(156);
    expect(resized(t).map((e) => e.finished)).toEqual([false]);
    t.press('Escape');
    expect(width(t, 'b')).toBe(100);
    t.press('r', { altKey: true, code: 'KeyR' }, t.hcell('b')!);
    t.press('Home');
    t.press('Enter');
    expect(width(t, 'b')).toBe(156);
  });

  it('a double-click on the grip fits the column and says its width; the first click does not sort', () => {
    const t = colmake({ columns: B(3) });
    probes(t);
    const grip = t.hcell('b')!.querySelector<HTMLElement>('.dzg-resize')!;
    for (let i = 0; i < 2; i++) {
      grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: 199 }));
      grip.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: 199 }));
      grip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: i + 1 }));
    }
    grip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }));
    expect(width(t, 'b')).toBe(156);
    expect(t.said()).toEqual(['B: 156 pixels']);
    expect(t.sorted()).toHaveLength(0);
  });
});
