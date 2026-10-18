import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, isSelected, type ColumnOrGroup, type GridEvent, type Problem, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import { spans } from '../src/spans.js';
import { EN } from '../src/locales/en.js';

/**
 * Step 9b, commit 3: the DOM spans feature (docs/behaviors/spans.md) — tall
 * and wide cells under virtual scrolling, their ARIA, the keys and the pointer
 * over them, full-width rows. jsdom: behaviour and the geometry written, not
 * layout (the real browser checks are commit 4's).
 */
type R = { id: string; ward: string; name: string; n: number; kind?: 'title' };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });
const k = (s: string): RowKey => dataKey(s)!;
const H = 32;

/** `wards`: run lengths of the merged column, in order (A, B, C…). */
function rowsOf(wards: readonly number[]): R[] {
  const out: R[] = [];
  wards.forEach((len, w) => {
    for (let j = 0; j < len; j++) out.push({ id: `r${out.length}`, ward: String.fromCharCode(65 + w), name: `p${out.length}`, n: out.length });
  });
  return out;
}

const COLS: ColumnOrGroup<R>[] = [{ id: 'ward', header: 'Ward', merge: true }, { id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }];

function make(o: { rows?: R[]; columns?: ColumnOrGroup<R>[]; settings?: Partial<GridSettings<R>>; inline?: number; features?: boolean } = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: o.inline ?? 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, {
    rows: o.rows ?? rowsOf([5, 1, 4, 30, 200]), getRowId: (r) => r.id, columns: o.columns ?? COLS, messages: EN,
    features: o.features === false ? [] : [spans()], onEvent: (e) => events.push(e), ...o.settings,
  }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const ctx = (g as unknown as { context: GridContext<R> }).context;
  const row = (i: number) => host.querySelector<HTMLElement>(`.dzg-layer > .dzg-row[aria-rowindex="${i + 2}"]`);
  const cell = (i: number, col: string) => row(i)?.querySelector<HTMLElement>(`[data-col="${col}"]`) ?? null;
  const press = (key: string, init: KeyboardEventInit = {}) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  const scrollTo = (top: number) => {
    box.scrollTop = top;
    vp.dispatchEvent(new Event('scroll'));
  };
  const problems = () => events.flatMap((e) => (e.type === 'problems' ? e.problems : [])) as Problem[];
  return { g, host, vp, box, ctx, row, cell, press, scrollTo, events, problems };
}

const indexes = (host: HTMLElement) => [...host.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => Number(r.getAttribute('aria-rowindex')));

describe('tall cells under virtual scrolling', () => {
  it('a merge is one cell in the row where it starts; the slots it covers have none', () => {
    const { cell, row } = make();
    const a = cell(0, 'ward')!;
    expect(a.getAttribute('aria-rowspan')).toBe('5');
    expect(a.hasAttribute('aria-colspan')).toBe(false);
    expect(a.textContent).toBe('A');
    for (let i = 1; i < 5; i++) {
      expect(cell(i, 'ward')).toBeNull();
      expect(cell(i, 'name')).not.toBeNull();
    }
    // A run of one is a plain cell.
    expect(cell(5, 'ward')!.hasAttribute('aria-rowspan')).toBe(false);
    expect(cell(6, 'ward')!.getAttribute('aria-rowspan')).toBe('4');
    // Rows a tall cell starts in or covers contain style only (data-spans); others are plain.
    expect([0, 1, 4, 6, 9].map((i) => row(i)!.hasAttribute('data-spans'))).toEqual([true, true, true, true, true]);
    expect(row(5)!.hasAttribute('data-spans')).toBe(false);
  });

  it('keeps the row a span starts in mounted when the window starts inside it, in display order', () => {
    // Rows 10 to 39 are one run (D); the window at row 20 starts inside it.
    const { host, scrollTo, cell } = make();
    scrollTo(20 * H);
    const order = indexes(host);
    expect(order[0]).toBe(12);
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(cell(10, 'ward')!.getAttribute('aria-rowspan')).toBe('30');
    expect(cell(20, 'ward')).toBeNull();
    // Past the run, the anchor goes.
    scrollTo(60 * H);
    expect(host.querySelector('.dzg-layer > .dzg-row[aria-rowindex="12"]')).toBeNull();
    expect(indexes(host)).toEqual([...indexes(host)].sort((x, y) => x - y));
  });

  it('draws a tall cell over the window (and its margin) only, and puts its label at the span’s centre', () => {
    const { scrollTo, cell, row } = make();
    // Window at row 20: rows 18 to 32 (overscan 2) are drawn; the run is 10 to 39.
    scrollTo(20 * H);
    const d = cell(10, 'ward')!;
    const top = parseFloat(row(10)!.style.getPropertyValue('inset-block-start'));
    const first = parseFloat(row(18)!.style.getPropertyValue('inset-block-start'));
    const lastRow = row(Math.max(...[...document.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => Number(r.getAttribute('aria-rowindex')) - 2)))!;
    const last = parseFloat(lastRow.style.getPropertyValue('inset-block-start'));
    expect(parseFloat(d.style.getPropertyValue('inset-block-start'))).toBe(first - top);
    expect(parseFloat(d.style.getPropertyValue('block-size'))).toBe(last + H - first);
    // The span's centre (rows 10 to 39: 25 * 32 − 16 from its first row's top, minus where the drawn part starts).
    const mid = (10 * H + 40 * H - H) / 2;
    expect(parseFloat(d.style.getPropertyValue('--dzg-span-at'))).toBe(mid - 18 * H);
    // The text is in the label (sticky by CSS); the cell holds nothing else.
    expect(d.children.length).toBe(1);
    expect(d.firstElementChild!.className).toBe('dzg-span-label');
    expect(d.firstElementChild!.textContent).toBe('D');
  });

  it('the label stays inside the part drawn when the span’s centre is out of it (then sticky carries it)', () => {
    // Run E: rows 40 to 239, centre near row 139. At row 50 the window ends far above it.
    const { scrollTo, cell } = make({ settings: { overscan: { rows: 2 } } });
    scrollTo(50 * H);
    const e = cell(40, 'ward')!;
    const size = parseFloat(e.style.getPropertyValue('block-size'));
    expect(e.style.getPropertyValue('--dzg-span-at')).toBe(`${size - H}px`);
    // At row 220 the centre is far above: the label at the top of the part drawn.
    scrollTo(220 * H);
    expect(cell(40, 'ward')!.style.getPropertyValue('--dzg-span-at')).toBe('0px');
  });

  it('a short merge in view is drawn whole, label at its centre', () => {
    const { cell } = make();
    const a = cell(0, 'ward')!;
    expect(a.style.getPropertyValue('inset-block-start')).toBe('0px');
    expect(a.style.getPropertyValue('block-size')).toBe(`${5 * H}px`);
    expect(a.style.getPropertyValue('--dzg-span-at')).toBe(`${2 * H}px`);
  });

  it('keeps DOM order equal to aria-rowindex order, with the focused row and anchors out of the window', () => {
    const { host, scrollTo, cell } = make();
    cell(6, 'name')!.focus();
    for (const top of [20, 35, 120, 15, 0, 236].map((r) => r * H)) {
      scrollTo(top);
      const order = indexes(host);
      expect(order).toEqual([...order].sort((x, y) => x - y));
      expect(new Set(order).size).toBe(order.length);
    }
  });

  it('the same node stays focused when the view scrolls away and back', () => {
    const { scrollTo, cell } = make();
    const d = cell(10, 'ward')!;
    d.focus();
    expect(document.activeElement).toBe(d);
    scrollTo(25 * H);
    expect(document.activeElement).toBe(d);
    // Far past the run: the focused row stays mounted, its cell one row tall.
    scrollTo(150 * H);
    expect(document.activeElement).toBe(d);
    expect(d.style.getPropertyValue('block-size')).toBe(`${H}px`);
    scrollTo(10 * H);
    expect(document.activeElement).toBe(d);
    expect(cell(10, 'ward')).toBe(d);
  });

  it('mounts at most the window, one anchor per span column and the focused row', () => {
    // The margin fixed (it grows while scrolling fast).
    const { ctx, scrollTo, cell } = make({ settings: { overscan: { rows: 2 } } });
    cell(0, 'name')!.focus();
    const before = ctx.rowRenderer.made;
    let most = 0;
    for (let r = 0; r < 240; r += 3) {
      scrollTo(r * H);
      most = Math.max(most, ctx.rowRenderer.mounted.size);
    }
    // 10 rows in view, overscan 2 on each side (+1 for a partial row), one span column, the focused row.
    const windowRows = 10 + 2 * 2 + 1;
    expect(most).toBeLessThanOrEqual(windowRows + 1 + 1);
    expect(ctx.rowRenderer.made).toBeLessThanOrEqual(Math.max(before, windowRows + 1 + 1));
  });

  it('an unchanged repaint writes nothing', () => {
    const { g, host, scrollTo } = make({ settings: { selection: { mode: 'multi', checkbox: true } } });
    scrollTo(20 * H);
    const mo = new MutationObserver(() => {});
    mo.observe(host, { subtree: true, attributes: true, childList: true, characterData: true });
    g.api.refresh();
    g.api.refresh();
    expect(mo.takeRecords()).toEqual([]);
    mo.disconnect();
  });

  it('a cell no longer tall (a sort) is a plain cell again, its text back in it', () => {
    // Wards A A B B; by name a, b, c, d they alternate: nothing merges.
    const rows: R[] = [['a', 'A'], ['c', 'A'], ['b', 'B'], ['d', 'B']].map(([name, ward], i) => ({ id: `r${i}`, ward: ward!, name: name!, n: i }));
    const { g, cell } = make({ rows });
    expect(cell(0, 'ward')!.firstElementChild?.className).toBe('dzg-span-label');
    g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'asc' }] }, 'user');
    const top = cell(0, 'ward')!;
    expect(top.hasAttribute('aria-rowspan')).toBe(false);
    expect(top.querySelector('.dzg-span-label')).toBeNull();
    expect(top.textContent).toBe('A');
    expect(top.style.getPropertyValue('block-size')).toBe('');
    expect(top.style.getPropertyValue('--dzg-span-at')).toBe('');
    expect([1, 2, 3].map((i) => cell(i, 'ward')!.textContent)).toEqual(['B', 'A', 'B']);
  });
});

describe('ARIA of spanned cells', () => {
  it('says aria-rowspan and aria-colspan from two, and the origin’s aria-colindex (after the selection box)', () => {
    const rows = [...rowsOf([3]), { id: 'total', ward: 'T', name: 'Total', n: 9 }];
    const columns: ColumnOrGroup<R>[] = [
      { id: 'ward', merge: true }, { id: 'name', colSpan: (c) => (c.key === k('total') ? 2 : 1) }, { id: 'n', type: 'number' }, { id: 'x', value: () => 1 },
    ];
    const { cell, host } = make({ rows, columns, settings: { selection: { mode: 'multi', checkbox: true } } });
    const a = cell(0, 'ward')!;
    expect([a.getAttribute('aria-rowspan'), a.getAttribute('aria-colspan'), a.getAttribute('aria-colindex')]).toEqual(['3', null, '2']);
    const t = cell(3, 'name')!;
    expect([t.getAttribute('aria-rowspan'), t.getAttribute('aria-colspan'), t.getAttribute('aria-colindex')]).toEqual([null, '2', '3']);
    expect(cell(3, 'n')).toBeNull();
    expect(cell(3, 'x')!.getAttribute('aria-colindex')).toBe('5');
    expect(host.querySelector('.dzg-viewport')!.getAttribute('aria-colcount')).toBe('5');
    // The total's width is both columns'.
    expect(t.style.getPropertyValue('inline-size')).toBe(`${2 * 150}px`);
  });

  it('a colspan whose first column left the column window is still mounted, from its origin', () => {
    const cols = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, width: 100, value: (r: R) => `${r.id}-${i}` }));
    const rows = rowsOf([4]);
    const columns: ColumnOrGroup<R>[] = cols.map((c) => (c.id === 'c2' ? { ...c, colSpan: (x) => (x.index === 1 ? 3 : 1) } : c));
    const { cell, box, vp } = make({ rows, columns, inline: 300 });
    box.scrollInline = 450;
    vp.dispatchEvent(new Event('scroll'));
    // The window (with its margin) starts at c3; the span c2..c4 starts before it.
    expect(cell(0, 'c2')).toBeNull();
    const o = cell(1, 'c2')!;
    expect(o).not.toBeNull();
    expect(o.getAttribute('aria-colspan')).toBe('3');
    expect(o.style.getPropertyValue('inset-inline-start')).toBe('200px');
    expect(o.style.getPropertyValue('inline-size')).toBe('300px');
    expect(cell(1, 'c3')).toBeNull();
    expect(cell(1, 'c4')).toBeNull();
    expect(cell(1, 'c5')).not.toBeNull();
  });
});

describe('pinned columns and right to left', () => {
  it('a tall cell in a pinned segment: drawn like a centre one; the row’s pinned cells placed (a covered slot leaves no hole)', () => {
    const columns: ColumnOrGroup<R>[] = [{ id: 'ward', merge: true, pinned: 'start', width: 120 }, { id: 'name', pinned: 'start', width: 80 }, { id: 'n', type: 'number' }];
    const { cell, row, scrollTo } = make({ columns, settings: { selection: { mode: 'multi', checkbox: true } } });
    scrollTo(20 * H);
    const d = cell(10, 'ward')!;
    expect(d.parentElement!.classList.contains('dzg-seg-start')).toBe(true);
    expect(d.style.getPropertyValue('block-size')).not.toBe('');
    // In a covered row the name cell is placed after the selection box and the covered slot.
    expect(cell(20, 'name')!.style.getPropertyValue('inset-inline-start')).toBe(`${40 + 120}px`);
    expect(cell(10, 'ward')!.style.getPropertyValue('inset-inline-start')).toBe('40px');
    // The host row's pinned segments are raised above the rows the cell covers; others are not.
    expect(row(10)!.querySelector<HTMLElement>('.dzg-seg-start')!.style.zIndex).not.toBe('');
    expect(row(20)!.querySelector<HTMLElement>('.dzg-seg-start')!.style.zIndex).toBe('');
  });

  it('an earlier host row stands above a later one (by rank)', () => {
    const columns: ColumnOrGroup<R>[] = [{ id: 'ward', merge: true, pinned: 'start' }, { id: 'name' }];
    const { row } = make({ columns });
    const z = (i: number) => Number(row(i)!.querySelector<HTMLElement>('.dzg-seg-start')!.style.zIndex);
    // Rows 0 (A) and 6 (C) host tall cells; row 5 (B, one row) does not.
    expect(z(0)).toBeGreaterThan(z(6));
    expect(z(6)).toBeGreaterThan(2);
    expect(row(5)!.querySelector<HTMLElement>('.dzg-seg-start')!.style.zIndex).toBe('');
  });

  it('a row reused for a row hosting nothing loses the raise', () => {
    const columns: ColumnOrGroup<R>[] = [{ id: 'ward', merge: true, pinned: 'start' }, { id: 'name' }];
    const { scrollTo, host, ctx } = make({ columns, settings: { overscan: { rows: 2 } } });
    for (const top of [0, 30, 120, 150]) scrollTo(top * H);
    const hostRows = new Set<HTMLElement>();
    ctx.rowRenderer.forEach((_, v) => { if (v.el.querySelector('.dzg-cell[aria-rowspan]')) hostRows.add(v.el); });
    for (const r of host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')) {
      const z = r.querySelector<HTMLElement>('.dzg-seg-start')!.style.zIndex;
      expect(z === '', r.getAttribute('aria-rowindex')!).toBe(!hostRows.has(r));
    }
    expect(hostRows.size).toBe(1);
  });

  it('a colspan is cut at its segment’s edge, and said once', () => {
    const rows = rowsOf([3]);
    const columns: ColumnOrGroup<R>[] = [{ id: 'ward', pinned: 'start', colSpan: (c) => (c.index === 0 ? 3 : 1) }, { id: 'name', pinned: 'start' }, { id: 'n', type: 'number' }];
    const { cell, problems, g } = make({ rows, columns });
    expect(cell(0, 'ward')!.getAttribute('aria-colspan')).toBe('2');
    expect(cell(0, 'n')).not.toBeNull();
    g.api.refresh();
    expect(problems().filter((p) => p.code === 'span-clipped')).toEqual([{ code: 'span-clipped', severity: 'warning', path: 'columns.ward', detail: 'segment' }]);
  });

  it('right to left: the same logical geometry', () => {
    const columns: ColumnOrGroup<R>[] = [{ id: 'ward', merge: true, pinned: 'start', width: 120 }, { id: 'name', pinned: 'start', width: 80 }, { id: 'n', type: 'number' }];
    const ltr = make({ columns });
    const rtl = make({ columns, settings: { direction: 'rtl' } });
    for (const m of [ltr, rtl]) m.scrollTo(20 * H);
    const geo = (m: typeof ltr) => {
      const d = m.cell(10, 'ward')!;
      return [d.style.getPropertyValue('inset-block-start'), d.style.getPropertyValue('block-size'), m.cell(20, 'name')!.style.getPropertyValue('inset-inline-start')];
    };
    expect(rtl.host.querySelector('.dzg')!.getAttribute('dir')).toBe('rtl');
    expect(geo(rtl)).toEqual(geo(ltr));
    expect(geo(rtl)[2]).toBe('120px');
  });
});

describe('the keys over spanned cells', () => {
  it('Down from a tall cell leaves below its last row; Up into one lands on its origin and comes back to the row aimed at', () => {
    const { g, cell, press } = make();
    cell(0, 'ward')!.focus();
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r5'), column: 'ward' });
    // Up from B (row 5) into A (rows 0-4): the origin, aiming at row 4; Right goes to row 4.
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'ward' });
    expect(document.activeElement).toBe(cell(0, 'ward'));
    press('ArrowRight');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r4'), column: 'name' });
    // Left goes back into A, aiming at row 4; Down leaves it at row 5.
    press('ArrowLeft');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'ward' });
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r5'), column: 'ward' });
  });

  it('Up from the first row still reaches the header', () => {
    const { g, cell, press } = make();
    cell(0, 'ward')!.focus();
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'ward' });
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'ward' });
  });

  it('Left and Right step over a colspan', () => {
    const rows = [...rowsOf([2]), { id: 'total', ward: 'T', name: 'Total', n: 9 }];
    const columns: ColumnOrGroup<R>[] = [{ id: 'ward' }, { id: 'name', colSpan: (c) => (c.key === k('total') ? 2 : 1) }, { id: 'n', type: 'number' }, { id: 'x', value: () => 1 }];
    const { g, cell, press } = make({ rows, columns });
    cell(2, 'ward')!.focus();
    press('ArrowRight');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('total'), column: 'name' });
    press('ArrowRight');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('total'), column: 'x' });
    press('ArrowLeft');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('total'), column: 'name' });
    // Left from x reached the slot n inside the total: Up goes on in that column.
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r1'), column: 'n' });
  });

  it('Page Down inside a cell taller than a page: the focus stays while the row aimed at moves on, shown, then leaves', () => {
    const { g, cell, press, ctx } = make({ rows: rowsOf([30, 5, 40]) });
    cell(0, 'ward')!.focus();
    const origin = cell(0, 'ward');
    // A page is 9 rows (10 in view, less one).
    press('PageDown');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'ward' });
    expect(document.activeElement).toBe(origin);
    // The row aimed at (9) is in view; the origin is not dragged back into it.
    const view = (): [number, number] => [ctx.scroll.logicalTop, ctx.scroll.logicalTop + 320];
    press('PageDown');
    press('PageDown');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'ward' });
    const [top, bottom] = view();
    expect(27 * H).toBeGreaterThanOrEqual(top);
    expect(28 * H).toBeLessThanOrEqual(bottom);
    // 27 + 9 = 36, past A (0-29) and B (30-34): in C (35-74), on its first row.
    press('PageDown');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r35'), column: 'ward' });
  });

  it('Space on a tall cell selects the row it starts in', () => {
    const { g, cell, press } = make({ settings: { selection: { mode: 'multi' } } });
    cell(0, 'ward')!.focus();
    // Aim at row 4 first: Space still toggles the origin row.
    press('ArrowDown');
    press('ArrowUp');
    press(' ');
    expect(isSelected(g.kernel.selection, k('r0'))).toBe(true);
    expect(isSelected(g.kernel.selection, k('r4'))).toBe(false);
  });
});

describe('the pointer on a tall cell', () => {
  const clickAt = (el: HTMLElement, rowsDown: number, init: MouseEventInit = {}) => {
    el.getBoundingClientRect = () => ({ top: 100, bottom: 100 + 5 * H, left: 0, right: 150, width: 150, height: 5 * H, x: 0, y: 100, toJSON() {} }) as DOMRect;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientY: 100 + rowsDown * H + 5, ...init }));
  };

  it('a click selects the row under the pointer; cellClicked and rowClicked carry it', () => {
    const { g, cell, events } = make({ settings: { selection: { mode: 'multi', click: true } } });
    clickAt(cell(0, 'ward')!, 3);
    expect(isSelected(g.kernel.selection, k('r3'))).toBe(true);
    expect(isSelected(g.kernel.selection, k('r0'))).toBe(false);
    const clicked = events.filter((e) => e.type === 'cellClicked' || e.type === 'rowClicked') as { type: string; row: { key: RowKey }; column?: string }[];
    expect(clicked.map((e) => [e.type, e.row.key, e.column])).toEqual([['cellClicked', k('r3'), 'ward'], ['rowClicked', k('r3'), undefined]]);
  });

  it('a click on a tall cell drawn from inside the window counts from the row it is drawn from', () => {
    const { g, cell, scrollTo } = make({ settings: { selection: { mode: 'multi', click: true } } });
    scrollTo(20 * H);
    // Drawn from row 18: two rows down is row 20.
    clickAt(cell(10, 'ward')!, 2);
    expect(isSelected(g.kernel.selection, k('r20'))).toBe(true);
  });

  it('Shift+click on a tall cell extends the range to the row under the pointer', () => {
    const { g, cell } = make({ settings: { selection: { mode: 'multi', click: true } } });
    cell(7, 'name')!.click();
    clickAt(cell(0, 'ward')!, 2, { shiftKey: true });
    const sel = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'].map((r) => isSelected(g.kernel.selection, k(r)));
    expect(sel).toEqual([false, true, true, true, true, true, true, false]);
  });

  it('a click on a plain cell is as before', () => {
    const { g, cell } = make({ settings: { selection: { mode: 'multi', click: true } } });
    cell(3, 'name')!.click();
    expect(isSelected(g.kernel.selection, k('r3'))).toBe(true);
  });
});

describe('full-width rows', () => {
  const rows: R[] = [{ id: 't1', ward: 'Service : A', name: '', n: 0, kind: 'title' }, ...rowsOf([3]), { id: 't2', ward: 'Service : B', name: '', n: 0, kind: 'title' }, ...rowsOf([2]).map((r) => ({ ...r, id: `${r.id}b` }))];
  const columns: ColumnOrGroup<R>[] = [{ id: 'ward' }, { id: 'name' }, { id: 'n', type: 'number' }];

  it('are one cell across, marked, with the whole text; the selection box stays', () => {
    const { row, cell, host } = make({ rows, columns, settings: { fullWidth: (r) => r.kind === 'title', selection: { mode: 'multi', checkbox: true } } });
    const t = row(0)!;
    expect(t.hasAttribute('data-full')).toBe(true);
    expect(t.querySelectorAll('.dzg-cell').length).toBe(1);
    expect(t.querySelector('.dzg-check')).not.toBeNull();
    const c = cell(0, 'ward')!;
    expect(c.textContent).toBe('Service : A');
    expect([c.getAttribute('aria-colspan'), c.getAttribute('aria-colindex')]).toEqual(['3', '2']);
    expect(row(1)!.hasAttribute('data-full')).toBe(false);
    expect(row(1)!.querySelectorAll('.dzg-cell').length).toBe(3);
    // The selection box's width, for the sticky cell after it.
    expect(host.querySelector<HTMLElement>('.dzg')!.style.getPropertyValue('--dzg-check-w')).toBe('40px');
  });

  it('Left and Right stay put; Down and Up go through', () => {
    const { g, cell, press } = make({ rows, columns, settings: { fullWidth: (r) => r.kind === 'title' } });
    cell(1, 'name')!.focus();
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('t1'), column: 'ward' });
    press('ArrowRight');
    press('End');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('t1'), column: 'ward' });
    // Down comes back to the column aimed at.
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'name' });
  });
});

describe('the spans CSS', () => {
  it('is injected once per document by the feature, and not when the host loads it itself', () => {
    make();
    make();
    const styles = document.querySelectorAll('style[data-dzgrid-spans]');
    expect(styles.length).toBe(1);
    const css = styles[0]!.textContent!;
    for (const rule of ['contain:style', 'overflow:clip', 'position:sticky', '--dzg-span-at', 'display:contents', 'isolation:isolate']) expect(css).toContain(rule);
    document.head.querySelectorAll('style[data-dzgrid-spans]').forEach((st) => st.remove());
    make({ settings: { injectStyles: false } });
    expect(document.querySelectorAll('style[data-dzgrid-spans]').length).toBe(0);
  });
});

describe('without the feature', () => {
  it('span rules are told once as missing-feature, and ignored', () => {
    const { problems, cell, g } = make({ features: false, settings: { fullWidth: () => false } });
    g.api.refresh();
    expect(problems().filter((p) => p.code === 'missing-feature')).toEqual([
      { code: 'missing-feature', severity: 'warning', path: 'columns[0].merge', detail: 'spans' },
      { code: 'missing-feature', severity: 'warning', path: 'settings.fullWidth', detail: 'spans' },
    ]);
    expect(cell(1, 'ward')!.textContent).toBe('A');
    expect(cell(0, 'ward')!.hasAttribute('aria-rowspan')).toBe(false);
  });

  it('nothing is told without rules, nor with the feature', () => {
    expect(make({ features: false, columns: [{ id: 'ward' }] }).problems()).toEqual([]);
    expect(make().problems().filter((p) => p.code === 'missing-feature')).toEqual([]);
  });

  it('the feature with no rule changes no cell', () => {
    const plain = make({ features: false, columns: [{ id: 'ward' }, { id: 'name' }] });
    const fed = make({ columns: [{ id: 'ward' }, { id: 'name' }] });
    const shape = (m: typeof plain) => [...m.host.querySelectorAll('.dzg-layer .dzg-cell')].map((c) => [c.getAttribute('data-col'), c.textContent, c.getAttribute('aria-colindex'), c.hasAttribute('aria-rowspan')]);
    expect(shape(fed)).toEqual(shape(plain));
  });
});

describe('the focus on a covered slot', () => {
  it('goes to the cell owning it after a sort', () => {
    // A: r0-r2, B: r3-r5. A focus on r1's ward (covered by r0's A); sorted by n descending,
    // A starts at r2, so the focus goes there.
    const { g } = make({ rows: rowsOf([3, 3]) });
    g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r1'), column: 'ward' } }, 'api');
    g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 'ward' });
    // A plain column's focus stays where it is.
    g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r4'), column: 'name' } }, 'api');
    g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: k('r4'), column: 'name' });
  });
});
