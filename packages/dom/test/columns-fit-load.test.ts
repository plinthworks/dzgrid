// Columns fitted at load (1.10.0, docs/behaviors/column-resize.md 16–21; owner 2026-11-10, review 1.8): `columns({
// fitOnLoad: 'content' })` fits the shown columns once, when the first rows are shown; flexible, fixed-by-someone and
// `resizable: false` columns left alone; not again on a data change; `fitContent()` again on the app's call, never over a
// width the user set. jsdom has no layout: a probe's width is its text's length × 7 + 16 (the padding), by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, colmake, rowsOf, SIX, type R } from './support-columns.js';

const own = HTMLElement.prototype.getBoundingClientRect;
afterEach(cleanup);

function probes(t: ReturnType<typeof colmake>) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('dzg-move')) return t.vp.getBoundingClientRect();
    if (this.style.inlineSize === 'max-content' || this.style.inlineSize === 'min-content') {
      // min-content: the longest word.
      const text = this.style.inlineSize === 'min-content' ? Math.max(...(this.textContent ?? '').split(' ').map((w) => w.length)) : (this.textContent ?? '').length;
      const w = text * 7 + 16;
      return { left: 0, right: w, top: 0, bottom: 20, width: w, height: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    }
    return own.call(this);
  });
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
/** Column a: « r0a » … (at most 4 or 5 letters); b: 10 letters on every row (86 px); c: 20 letters (156 px). */
const COLS = (over: Parameters<typeof SIX>[0] = {}) =>
  SIX({ ...over, b: { value: () => 'abcdefghij', ...over['b'] }, c: { value: () => 'abcdefghijklmnopqrst', ...over['c'] } }).slice(0, 4);

/** A grid painted at the frames the test runs: the probes in place before the first paint. */
function lmake(o: Parameters<typeof colmake>[0] = {}) {
  const t = colmake({ sync: false, ...o });
  probes(t);
  t.tick();
  return t;
}

describe('fitOnLoad (column-resize.md 16–21)', () => {
  it('fits the shown columns at the first rows, silently, source api (16, 19)', () => {
    const t = lmake({ columns: COLS(), cols: { fitOnLoad: 'content' } });
    expect(width(t, 'b')).toBe(86);
    expect(width(t, 'c')).toBe(156);
    // « r199a »: 5 letters, 51 px.
    expect(width(t, 'a')).toBe(51);
    expect(resized(t).map((e) => [e.column, e.source, e.finished])).toEqual(expect.arrayContaining([['b', 'api', true], ['c', 'api', true]]));
    expect(t.announce).not.toHaveBeenCalled();
  });

  it('without it: nothing measured, the definitions’ widths', () => {
    const t = lmake({ columns: COLS() });
    expect(width(t, 'c')).toBe(100);
    expect(resized(t)).toHaveLength(0);
  });

  it('min and max kept; flexible and resizable: false columns left alone (16, 17)', () => {
    const t = lmake({ columns: COLS({ b: { minWidth: 120 }, c: { maxWidth: 130 }, a: { resizable: false }, d: { flex: 1, width: undefined } }), cols: { fitOnLoad: 'content' } });
    expect(width(t, 'b')).toBe(120);
    expect(width(t, 'c')).toBe(130);
    expect(width(t, 'a')).toBe(100);
    // d shares the room left: 600 − 100 − 120 − 130.
    expect(width(t, 'd')).toBe(250);
    expect(t.g.kernel.columns.state().find((c) => c.id === 'd')?.width ?? null).toBe(null);
  });

  it('a width already set when it runs (a restored state, the app) is kept (17)', () => {
    const t = colmake({ sync: false, columns: COLS(), cols: { fitOnLoad: 'content' } });
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'c', width: 90 }] }, 'api');
    probes(t);
    t.tick();
    expect(width(t, 'c')).toBe(90);
    expect(width(t, 'b')).toBe(86);
  });

  it('not again on new rows, a sort, a filter (18)', () => {
    const t = lmake({ columns: COLS({ b: { value: (r: R) => (r.n > 1000 ? 'abcdefghijklmnopqrstuvwxyz' : 'abcdefghij') } }), cols: { fitOnLoad: 'content' } });
    expect(width(t, 'b')).toBe(86);
    t.g.update({ rows: rowsOf(2000).slice(1500) });
    t.tick();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'b', dir: 'desc' }] }, 'api');
    t.tick();
    expect(width(t, 'b')).toBe(86);
  });

  it('a grid that starts empty fits when rows first come (16)', () => {
    const t = lmake({ rows: [], columns: COLS(), cols: { fitOnLoad: 'content' } });
    expect(width(t, 'c')).toBe(100);
    t.g.update({ rows: rowsOf(10) });
    t.tick();
    expect(width(t, 'c')).toBe(156);
  });

  it('fitContent(): again, on the app’s call, never over a width the user set (18)', () => {
    const t = lmake({ columns: COLS({ b: { value: (r: R) => (r.n > 1000 ? 'abcdefghijklmnopqrstuvwxyz' : 'abcdefghij') } }), cols: { fitOnLoad: 'content' } });
    // The user drags c to 140.
    t.g.kernel.dispatch({ type: 'column.resize', column: 'c', width: 140, finished: true }, 'user');
    t.g.update({ rows: rowsOf(1010).slice(1001) });
    t.tick();
    t.api().fitContent!();
    t.tick();
    // b: 26 letters, 198 px; c kept.
    expect(width(t, 'b')).toBe(198);
    expect(width(t, 'c')).toBe(140);
  });

  it('fitContent() without fitOnLoad fits too, with the same rules', () => {
    const t = lmake({ columns: COLS({ d: { flex: 1, width: undefined } }) });
    t.api().fitContent!();
    t.tick();
    expect(width(t, 'c')).toBe(156);
    expect(t.g.kernel.columns.state().find((c) => c.id === 'd')?.width ?? null).toBe(null);
  });
});

describe('a column whose title wraps (header-wrap.md 10)', () => {
  it('is fitted to its cells and its title’s longest word (min-content), not to its title on one line', () => {
    const t = lmake({ columns: COLS({ b: { header: 'A title much longer than the cells', headerWrap: true }, c: { header: 'Extraordinarily long', headerWrap: true } }), cols: { fitOnLoad: 'content' } });
    // b: the cells (86 px) over « longer » (58 px); c: « Extraordinarily » (15 letters, 121 px) under the cells (156 px).
    expect(width(t, 'b')).toBe(86);
    expect(width(t, 'c')).toBe(156);
    t.g.update({ columns: COLS({ c: { header: 'Extraordinarily long', headerWrap: true, value: () => 'abc' } }) });
    t.tick();
    t.api().autoSize(['c']);
    expect(width(t, 'c')).toBe(121);
  });
});
