import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

function make(settings: Partial<GridSettings<R>> = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = [{ id: 'n', header: 'N', type: 'number' }, { id: 'm', header: 'M', value: (r: R) => r.n * 2 }];
  const g = createGrid<R>(host, { rows: Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, n: i })), getRowId: (r) => r.id, columns, messages: EN, ...settings }, { geometry, sync: true });
  grids.push(g);
  const key = (el: Element, k: string, init: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  const headBox = () => host.querySelector<HTMLElement>('.dzg-header [role=checkbox]');
  const rowCheck = (i: number) => host.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${i + 2}"] .dzg-check`)!;
  return { g, host, key, headBox, rowCheck };
}

describe('phase 2 steps 12-14 review', () => {
  it('shows no select-all box in single mode, and its row boxes still line up', () => {
    const { host, headBox, rowCheck, g } = make({ selection: { mode: 'single', checkbox: true } });
    expect(headBox()).toBeNull();
    expect(host.querySelector('.dzg-header .dzg-check')).not.toBeNull();
    expect(rowCheck(1)).not.toBeNull();
    host.querySelector<HTMLElement>('.dzg-header .dzg-check')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(g.kernel.selection.keys.size).toBe(0);
  });

  it('works the select-all box with the keyboard: reached from the first header, Space and Enter toggle', () => {
    const { g, key, headBox, host } = make({ selection: { mode: 'multi', checkbox: true } });
    host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!.focus();
    key(document.activeElement!, 'ArrowLeft');
    expect(document.activeElement).toBe(headBox());
    key(headBox()!, ' ');
    expect(g.kernel.selection.keys.size).toBe(6);
    key(headBox()!, 'Enter');
    expect(g.kernel.selection.keys.size).toBe(0);
    expect(g.kernel.query.sort).toEqual([]);
    key(headBox()!, 'ArrowRight');
    expect((document.activeElement as HTMLElement).dataset['col']).toBe('n');
  });

  it('takes a click on a row box as focus on that row, so the keys keep working', () => {
    const { g, rowCheck, key } = make({ selection: { mode: 'multi', checkbox: true } });
    rowCheck(2).focus();
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: dataKey('r2'), column: 'n' });
    key(document.activeElement!, 'ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: dataKey('r3'), column: 'n' });
  });

  it('starts a range at the clicked row when there is no anchor yet, without announcing a cancel', async () => {
    const { g, host } = make({ selection: { mode: 'multi', click: true } });
    const cell = host.querySelector<HTMLElement>('.dzg-row[aria-rowindex="4"] [data-col="n"]')!;
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    await new Promise((r) => setTimeout(r, 80));
    expect([...g.kernel.selection.keys]).toEqual([dataKey('r2')]);
    expect(g.kernel.anchor).toBe(dataKey('r2'));
    expect(host.querySelector('.dzg-live')!.textContent).toBe('');
  });

  it('does not let a Shift+click select the page’s text', () => {
    const { host } = make({ selection: { mode: 'multi', click: true } });
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true, shiftKey: true });
    host.querySelector('.dzg-row [data-col="n"]')!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
