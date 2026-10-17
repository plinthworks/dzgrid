import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridFeature } from '../src/features.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; a: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });
const feat = (n: number, height?: number): GridFeature => ({
  id: 'f' + n,
  setup: () => ({ headerRows: Array.from({ length: n }, (_, i) => ({ id: 'x' + i, height, mount: (cell: HTMLElement, col: any) => { cell.dataset['extra'] = col.id; } })), destroy() {} }),
});
function make(o: any = {}, rows = 50) {
  const box: any = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = [{ id: 'a', header: 'A' }, { id: 'n', header: 'N', type: 'number' }, ...Array.from({ length: 12 }, (_, i): ColumnDef<R, any> => ({ id: `x${i}`, value: () => i, width: 100 }))];
  const g = createGrid<R>(host, { rows: Array.from({ length: rows }, (_, i) => ({ id: `r${i}`, a: `a${i}`, n: i })), getRowId: (r) => r.id, columns, messages: EN, features: [feat(1)], ...o }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const press = (key: string, m: any = {}) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...m }));
  const lvl = () => (document.activeElement as HTMLElement).closest('[role=row]')?.getAttribute('aria-rowindex');
  return { g, host, vp, box, press, lvl };
}
const at = (host: HTMLElement, row: number, col: string) => host.querySelector<HTMLElement>(`.dzg-hrow[aria-rowindex="${row}"] [data-col="${col}"]`)!;

describe('probe', () => {
  it('P1 Enter on an extra-row cell does not sort', () => {
    const { g, host, press } = make();
    at(host, 2, 'n').focus(); press('Enter');
    expect(g.kernel.query.sort).toEqual([]);
  });
  it('P2 ArrowLeft from the first extra cell with checkbox stays in the extra row', () => {
    const { g, host, press } = make({ selection: { mode: 'multi', checkbox: true } });
    at(host, 2, 'a').focus(); press('ArrowLeft');
    expect(document.activeElement!.classList.contains('dzg-box')).toBe(false);
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'a', level: 1 });
  });
  it('P3 ArrowDown from the select-all box goes to the extra row', () => {
    const { g, host, press } = make({ selection: { mode: 'multi', checkbox: true } });
    host.querySelector<HTMLElement>('.dzg-box')!.focus(); press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'a', level: 1 });
  });
  it('P4 extra row check cell', () => {
    const { host } = make({ selection: { mode: 'multi', checkbox: true } });
    const c = host.querySelector('.dzg-hrow[aria-rowindex="2"] .dzg-check')!;
    expect(c.getAttribute('role')).toBe('gridcell'); expect(c.getAttribute('aria-colindex')).toBe('1'); expect(c.querySelector('.dzg-box')).toBeNull();
    expect(at(host, 2, 'a').getAttribute('aria-colindex')).toBe('2');
  });
  it('P5 two extra rows: indices and ArrowUp from body row 0', () => {
    const { g, host, vp, press, lvl } = make({ features: [feat(2, 40)] });
    expect([...host.querySelectorAll('.dzg-header [role=row]')].map((r) => r.getAttribute('aria-rowindex'))).toEqual(['1', '2', '3']);
    expect(vp.getAttribute('aria-rowcount')).toBe('53');
    expect(host.querySelector('.dzg-layer > .dzg-row')!.getAttribute('aria-rowindex')).toBe('4');
    g.focusCell?.(dataKey('r0')!, 'n');
    host.querySelector<HTMLElement>('.dzg-layer .dzg-row [data-col="n"]')!.focus();
    press('ArrowUp'); expect(g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: 2 }); expect(lvl()).toBe('3');
    press('ArrowUp'); expect(g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: 1 }); expect(lvl()).toBe('2');
    press('ArrowUp'); expect(g.kernel.focus).toEqual({ kind: 'header', column: 'n' }); expect(lvl()).toBe('1');
    press('ArrowDown'); press('ArrowDown'); expect(g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: 2 });
    press('ArrowDown'); expect(g.kernel.focus).toMatchObject({ kind: 'cell', column: 'n' });
  });
  it('P5b overlay with custom heights', () => {
    const { host } = make({ features: [feat(2, 40)] }, 0);
    expect(host.querySelector<HTMLElement>('.dzg-overlay')!.style.insetBlockStart).toBe('112px');
  });
  it('P6 Home/End/ArrowRight keep the level; PageDown goes to body', () => {
    const { g, host, press } = make();
    at(host, 2, 'n').focus();
    press('ArrowRight'); expect(g.kernel.focus).toEqual({ kind: 'header', column: 'x0', level: 1 });
    press('End'); expect(g.kernel.focus).toEqual({ kind: 'header', column: 'x11', level: 1 });
    press('Home'); expect(g.kernel.focus).toEqual({ kind: 'header', column: 'a', level: 1 });
    press('PageDown'); expect(g.kernel.focus).toMatchObject({ kind: 'cell', column: 'a' });
  });
  it('P7 RTL arrows in the extra row', () => {
    const { g, host, press } = make({ direction: 'rtl' });
    at(host, 2, 'a').focus(); press('ArrowLeft');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: 1 });
  });
  it('P8 focused extra cell scrolled out keeps its element and stop', () => {
    const { g, host, vp, box } = make();
    const c = at(host, 2, 'a'); c.focus();
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'a', level: 1 });
    box.scrollInline = 1000; vp.dispatchEvent(new Event('scroll'));
    expect(c.isConnected).toBe(true);
    expect(document.activeElement).toBe(c);
    expect(c.tabIndex).toBe(0);
    expect(at(host, 1, 'a')?.tabIndex ?? -1).not.toBe(0);
  });
  it('P9 focusin on an extra cell then ArrowUp', () => {
    const { g, host, press } = make({ features: [feat(2)] });
    at(host, 3, 'n').focus();
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: 2 });
    press('ArrowUp'); expect(g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: 1 });
  });
});
describe('probe2', () => {
  it('P10 focused extra-row cell whose column is hidden hands focus to the same row', () => {
    const { g, host } = make();
    at(host, 2, 'n').focus();
    g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', hidden: true }] }, 'host');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'a', level: 1 });
    expect(document.activeElement).toBe(at(host, 2, 'a'));
  });
});
