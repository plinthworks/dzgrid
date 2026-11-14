// 1.12.0, the base's side (docs/behaviors/presentation-settings.md 25, 29, 32; owner 2026-11-13 « toujours laisser le
// choix »): the last row and last column marks, the tooltip's side and arrow place, `icons.sortNone`. Written before the
// code; jsdom: attributes only (the look in browsers, scripts/browser-1-12.mjs).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { Tooltip } from '../src/render/tooltip.js';
import { Scope } from '../src/render/scope.js';
import { theming } from '../src/theme.js';
import { cleanup, COLUMNS, emake, rowsOf, type R } from './support-edit.js';

afterEach(cleanup);

const bodyRows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')];
/** The rows marked last, by their display index (one header row before the body). */
const lastRows = (host: HTMLElement) => bodyRows(host).filter((r) => r.hasAttribute('data-last-row')).map((r) => Number(r.getAttribute('aria-rowindex')) - 2);
/** The columns whose cells carry the last-column mark (header and body), each once. */
const lastCols = (host: HTMLElement) => [...new Set([...host.querySelectorAll<HTMLElement>('[data-last-col]')].map((c) => c.dataset['col']))];

describe('the last displayed row (29)', () => {
  it('marks the last row only once it is shown, and follows a scroll (pooled rows reused)', () => {
    const m = emake({ rows: rowsOf(200) });
    expect(lastRows(m.host)).toEqual([]);
    m.scroll(32 * 200);
    expect(lastRows(m.host)).toEqual([199]);
    m.scroll(0);
    expect(lastRows(m.host)).toEqual([]);
  });

  it('follows a sort and a smaller set of rows (a filter)', () => {
    const m = emake({ rows: rowsOf(5) });
    expect(lastRows(m.host)).toEqual([4]);
    expect(m.row('r4')!.hasAttribute('data-last-row')).toBe(true);
    m.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'host');
    expect(m.row('r0')!.hasAttribute('data-last-row')).toBe(true);
    expect(m.row('r4')!.hasAttribute('data-last-row')).toBe(false);
    m.g.update({ rows: rowsOf(5).filter((r) => r.id !== 'r0') });
    expect(m.row('r1')!.hasAttribute('data-last-row')).toBe(true);
    expect(lastRows(m.host)).toEqual([3]);
  });
});

describe('the last displayed column (29)', () => {
  it('marks the last column\'s header and body cells, nothing else', () => {
    const m = emake({ rows: rowsOf(5) });
    expect(lastCols(m.host)).toEqual(['q']);
    expect(m.host.querySelector('.dzg-hrow .dzg-hcell[data-col=q]')!.hasAttribute('data-last-col')).toBe(true);
    expect(m.cell('r2', 'q')!.hasAttribute('data-last-col')).toBe(true);
    expect(m.cell('r2', 's')!.hasAttribute('data-last-col')).toBe(false);
  });

  it('follows a column hidden, moved, then pinned to the start or the end', () => {
    const m = emake({ rows: rowsOf(5) });
    const set = (cols: ColumnDef<R, any>[]) => m.g.update({ columns: cols });
    set(COLUMNS.map((c) => (c.id === 'q' ? { ...c, hidden: true } : c)));
    expect(lastCols(m.host)).toEqual(['s']);
    set([COLUMNS[0]!, COLUMNS[3]!, COLUMNS[2]!, COLUMNS[1]!]);
    expect(lastCols(m.host)).toEqual(['n']);
    // Pinned to the start: no longer last; pinned to the end: last whatever comes after it in the list.
    set(COLUMNS.map((c) => (c.id === 'q' ? { ...c, pinned: 'start' as const } : c)));
    expect(lastCols(m.host)).toEqual(['s']);
    set(COLUMNS.map((c) => (c.id === 'name' ? { ...c, pinned: 'end' as const } : c)));
    expect(lastCols(m.host)).toEqual(['name']);
  });

  it('the same in right to left (a logical mark)', () => {
    const m = emake({ rows: rowsOf(5), settings: { direction: 'rtl' } });
    expect(lastCols(m.host)).toEqual(['q']);
  });
});

describe('the tooltip\'s side and arrow (32)', () => {
  const setup = (dir: 'ltr' | 'rtl', cell: { left: number; right: number; top: number; bottom: number }, tip = { width: 100, height: 30 }) => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(800);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600);
    const el = document.body.appendChild(document.createElement('div'));
    el.className = 'dzg-tooltip';
    el.hidden = true;
    const anchor = document.body.appendChild(document.createElement('div'));
    anchor.getBoundingClientRect = () => ({ ...cell, width: cell.right - cell.left, height: cell.bottom - cell.top, x: cell.left, y: cell.top, toJSON: () => null });
    // Its layout box (1.12.0, tooltips-popovers.md: a running `scale` animation does not count).
    Object.defineProperty(el, 'offsetWidth', { configurable: true, get: () => tip.width });
    Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => tip.height });
    const t = new Tooltip(el, new Scope());
    t.showFor(anchor, { text: 'Hello', col: {} as never /* the tooltip reads no column field */, row: null, value: null }, dir, 0);
    return el;
  };

  it('below its cell: block-end, the arrow at the cell\'s middle from the tooltip\'s start', () => {
    const el = setup('ltr', { left: 200, right: 260, top: 100, bottom: 130 });
    expect(el.getAttribute('data-side')).toBe('block-end');
    // The tooltip starts at the cell's start (200); the cell's middle is 30 px further.
    expect(el.style.getPropertyValue('--dzg-tip-at')).toBe('30px');
  });

  it('above it when there is no room below: block-start', () => {
    const el = setup('ltr', { left: 200, right: 260, top: 560, bottom: 590 });
    expect(el.getAttribute('data-side')).toBe('block-start');
  });

  it('right to left: measured from the inline start (the right edge)', () => {
    // Cell 600–700: its inline start is 800 - 700 = 100 from the window's right; its middle 50 further.
    const el = setup('rtl', { left: 600, right: 700, top: 100, bottom: 130 });
    expect(el.style.getPropertyValue('--dzg-tip-at')).toBe('50px');
  });

  it('a wide cell: the arrow held inside the tooltip (12 px from its edges)', () => {
    const el = setup('ltr', { left: 10, right: 610, top: 100, bottom: 130 });
    expect(el.style.getPropertyValue('--dzg-tip-at')).toBe('88px');
  });

  it('a cell near the window\'s end: the tooltip moved back, the arrow still over the cell\'s middle', () => {
    // The tooltip (100 wide) placed at 700; the cell's middle at 780: 80 from the tooltip's start.
    const el = setup('ltr', { left: 760, right: 800, top: 100, bottom: 130 });
    expect(el.style.getPropertyValue('--dzg-tip-at')).toBe('80px');
  });
});

describe('icons.sortNone (25)', () => {
  const none = '<svg viewBox="0 0 16 16"><path d="M8 2l4 5H4zM8 14l4-5H4z"/></svg>';
  const marks = (host: HTMLElement) => Object.fromEntries([...host.querySelectorAll<HTMLElement>('.dzg-hrow .dzg-hcell')].map((h) => [h.dataset['col'], h.querySelector(':scope > .dzg-sort')?.getAttribute('data-dir') ?? null]));
  const cols = COLUMNS.map((c) => (c.id === 's' ? { ...c, sortable: false } : c));

  it('not given: no mark on an unsorted column (today)', () => {
    const m = emake({ rows: rowsOf(5), columns: cols, settings: { features: [theming()] } });
    expect(marks(m.host)).toEqual({ name: null, n: null, s: null, q: null });
  });

  it('given: on every sortable unsorted column, hidden from screen readers; replaced when sorted, back after', () => {
    const m = emake({ rows: rowsOf(5), columns: cols, settings: { icons: { sortNone: none }, features: [theming()] } });
    expect(marks(m.host)).toEqual({ name: 'none', n: 'none', s: null, q: 'none' });
    const mark = m.host.querySelector('.dzg-hcell[data-col=n] > .dzg-sort')!;
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(m.host.querySelector('.dzg')?.getAttribute('data-dzg-icons') ?? m.host.firstElementChild!.getAttribute('data-dzg-icons')).toContain('sort-none');
    m.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'host');
    expect(marks(m.host)).toEqual({ name: 'none', n: 'asc', s: null, q: 'none' });
    expect(m.host.querySelector('.dzg-hcell[data-col=n]')!.getAttribute('aria-sort')).toBe('ascending');
    expect(m.host.querySelector('.dzg-hcell[data-col=name]')!.hasAttribute('aria-sort')).toBe(false);
    m.g.kernel.dispatch({ type: 'sort.set', sort: [] }, 'host');
    expect(marks(m.host)).toEqual({ name: 'none', n: 'none', s: null, q: 'none' });
  });

  it('live: given then taken away by update({ icons })', () => {
    const m = emake({ rows: rowsOf(5), columns: cols, settings: { features: [theming()] } });
    m.g.update({ icons: { sortNone: none } });
    expect(marks(m.host)).toEqual({ name: 'none', n: 'none', s: null, q: 'none' });
    m.g.update({ icons: {} });
    expect(marks(m.host)).toEqual({ name: null, n: null, s: null, q: null });
  });
});
