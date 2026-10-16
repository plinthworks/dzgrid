import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; a: string; n: number; t: string };
const rowsOf = (n: number, tag = '') => Array.from({ length: n }, (_, i): R => ({ id: `r${i}`, a: `a${i}${tag}`, n: i, t: i % 2 ? 'odd' : 'even' }));
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

const COLUMNS: ColumnDef<R, any>[] = [
  { id: 'a', header: 'A', width: 100, pinned: 'start' },
  { id: 'n', header: 'N', type: 'number', width: 100 },
  { id: 't', header: 'T', width: 100 },
  ...Array.from({ length: 20 }, (_, i): ColumnDef<R, any> => ({ id: `x${i}`, header: `X${i}`, value: () => i, width: 100 })),
  { id: 'z', header: 'Z', width: 80, pinned: 'end' },
];

function make(over: Partial<GridSettings<R>> = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const g = createGrid<R>(host, { rows: rowsOf(1000), getRowId: (r) => r.id, columns: COLUMNS, messages: EN, ...over }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const active = () => document.activeElement as HTMLElement;
  const where = () => {
    const a = active();
    const row = a.closest('[role=row]');
    return `${row?.getAttribute('aria-rowindex')}/${a.dataset['col'] ?? a.closest<HTMLElement>('[data-col]')?.dataset['col']}`;
  };
  const press = (key: string, mods: KeyboardEventInit = {}) => active().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
  const blurs: string[] = [];
  document.addEventListener('focusout', (e) => blurs.push(String((e.target as HTMLElement).dataset?.['col'])), true);
  const scroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  return { g, host, vp, box, active, where, press, blurs, scroll };
}

describe('keyboard and focus', () => {
  it('offers exactly one tab stop, the first cell, before any focus', () => {
    const { host } = make();
    const stops = host.querySelectorAll('[tabindex="0"]');
    expect(stops.length).toBe(1);
    expect((stops[0] as HTMLElement).dataset['col']).toBe('a');
    expect(stops[0]!.closest('[role=row]')!.getAttribute('aria-rowindex')).toBe('2');
  });

  it('enters on the tab stop and takes the cell as focus', () => {
    const { host, g } = make();
    (host.querySelector('[tabindex="0"]') as HTMLElement).focus();
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: dataKey('r0'), column: 'a' });
  });

  it('moves with arrows in reading order, mirrored in RTL', () => {
    const ltr = make();
    ltr.g.api.focusCell(dataKey('r0')!, 'n');
    ltr.press('ArrowRight');
    expect(ltr.where()).toBe('2/t');
    ltr.press('ArrowLeft');
    ltr.press('ArrowLeft');
    expect(ltr.where()).toBe('2/a');
    ltr.press('ArrowDown');
    expect(ltr.where()).toBe('3/a');
    const rtl = make({ direction: 'rtl' });
    rtl.g.api.focusCell(dataKey('r0')!, 'n');
    rtl.press('ArrowLeft');
    expect(rtl.where()).toBe('2/t');
    expect(rtl.host.querySelectorAll('[tabindex="0"]').length).toBe(1);
  });

  it('pages, and goes to the ends', () => {
    const { g, press, where } = make();
    g.api.focusCell(dataKey('r0')!, 'n');
    press('PageDown');
    // 320 px of body at 32 px a row: a page is 9 rows (one row of context kept).
    expect(where()).toBe('11/n');
    press('End', { ctrlKey: true });
    expect(where()).toBe('1001/z');
    press('Home', { ctrlKey: true });
    expect(where()).toBe('2/a');
  });

  it('goes from the header to the first row, and up from the first row to the header', () => {
    const { g, press, where, host } = make();
    g.api.focusCell(dataKey('r0')!, 't');
    press('ArrowUp');
    expect(document.activeElement!.getAttribute('role')).toBe('columnheader');
    expect((document.activeElement as HTMLElement).dataset['col']).toBe('t');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 't' });
    press('ArrowDown');
    expect(where()).toBe('2/t');
    expect(host.querySelectorAll('[tabindex="0"]').length).toBe(1);
  });

  it('keeps the focused row and cell in the page, and focused, while scrolled away', () => {
    const { g, host, scroll, active } = make();
    g.api.focusCell(dataKey('r3')!, 'x1');
    const el = active();
    scroll(800 * 32);
    expect(active()).toBe(el);
    expect(el.isConnected).toBe(true);
    const rows = [...host.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => Number(r.getAttribute('aria-rowindex')));
    expect(rows[0]).toBe(5);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
  });

  it('keeps the focused centre cell in its row when its column scrolls out', () => {
    const { g, host, box, vp, active } = make();
    g.api.focusCell(dataKey('r1')!, 'n');
    const el = active();
    box.scrollInline = 1800;
    vp.dispatchEvent(new Event('scroll'));
    expect(active()).toBe(el);
    const row = el.closest('[role=row]')!;
    const cols = [...row.querySelectorAll<HTMLElement>('[data-col]')].map((c) => Number(c.getAttribute('aria-colindex')));
    expect(cols).toEqual([...cols].sort((a, b) => a - b));
    // The header keeps no stale cell for it.
    expect(host.querySelector('.dzg-header [data-col="n"]')).toBeNull();
  });

  it('keeps the same focused element through updates of rows, columns, language and direction', () => {
    const { g, active, blurs } = make();
    g.api.focusCell(dataKey('r42')!, 't');
    const el = active();
    blurs.length = 0;
    g.update({ rows: rowsOf(1000, '!') });
    g.update({ columns: [...COLUMNS] });
    g.update({ locale: 'ar-DZ' });
    g.update({ direction: 'rtl' });
    expect(active()).toBe(el);
    expect(blurs).toEqual([]);
  });

  it('follows focus to the row now at its place when its row is filtered out', () => {
    const { g, where } = make();
    g.api.focusCell(dataKey('r2')!, 'n');
    g.kernel.dispatch({ type: 'query.set', query: { sort: [], filter: { t: { type: 'text', op: 'equals', value: 'odd' } }, quick: '', key: 'odd' } }, 'user');
    expect(where()).toBe('4/n');
    expect(g.kernel.focus).toMatchObject({ row: dataKey('r5') });
  });

  it('turns scroll keys on the scroller itself into moves of the focus cell (D5)', () => {
    const { g, vp, where } = make();
    g.api.focusCell(dataKey('r0')!, 'n');
    vp.focus();
    const e = new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true });
    vp.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(where()).toBe('11/n');
  });

  it('leaves keys alone that are not the grid’s, and while composing', () => {
    const { g, press, where } = make();
    g.api.focusCell(dataKey('r0')!, 'n');
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    press('ArrowDown', { isComposing: true } as KeyboardEventInit);
    expect(where()).toBe('2/n');
  });

  it('takes a clicked cell as focus', () => {
    const { host, g } = make();
    const cell = host.querySelector<HTMLElement>('.dzg-row[aria-rowindex="5"] [data-col="t"]')!;
    cell.focus();
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: dataKey('r3'), column: 't' });
  });
});
