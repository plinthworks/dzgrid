import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridFeature } from '../src/features.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; a: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

/** A feature that adds one header row: each cell shows its column's id (a floating filter row stands here later). */
const extraRow: GridFeature = {
  id: 'test.extra-row',
  setup: () => ({
    headerRows: [{ id: 'extra', mount: (cell, col) => { cell.dataset['extra'] = col.id; } }],
    destroy() {},
  }),
};

function make(rows = 50) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = [{ id: 'a', header: 'A' }, { id: 'n', header: 'N', type: 'number' }, ...Array.from({ length: 12 }, (_, i): ColumnDef<R, any> => ({ id: `x${i}`, value: () => i, width: 100 }))];
  const g = createGrid<R>(host, { rows: Array.from({ length: rows }, (_, i) => ({ id: `r${i}`, a: `a${i}`, n: i })), getRowId: (r) => r.id, columns, messages: EN, features: [extraRow] }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const press = (key: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  return { g, host, vp, box, press };
}

describe('header rows as a value', () => {
  it('counts every header row in aria-rowcount and in the body rows’ aria-rowindex', () => {
    const { host, vp } = make();
    const rows = host.querySelectorAll('.dzg-header [role=row]');
    expect([...rows].map((r) => r.getAttribute('aria-rowindex'))).toEqual(['1', '2']);
    expect(vp.getAttribute('aria-rowcount')).toBe('52');
    expect(host.querySelector('.dzg-layer > .dzg-row')!.getAttribute('aria-rowindex')).toBe('3');
  });

  it('gives the extra row the same columns as the column headers, in the same order', () => {
    const { host, box, vp } = make();
    box.scrollInline = 700;
    vp.dispatchEvent(new Event('scroll'));
    const [main, extra] = [...host.querySelectorAll('.dzg-header [role=row]')];
    const idx = (r: Element) => [...r.querySelectorAll('[aria-colindex]')].map((c) => c.getAttribute('aria-colindex'));
    expect(idx(extra!)).toEqual(idx(main!));
    // Every mounted cell of the extra row was filled for its own column.
    const cells = [...extra!.querySelectorAll<HTMLElement>('[data-col]')];
    expect(cells.length).toBeGreaterThan(3);
    for (const c of cells) expect(c.dataset['extra']).toBe(c.dataset['col']);
  });

  it('moves down through the header rows into the body, and back up', () => {
    const { g, host, press } = make();
    host.querySelector<HTMLElement>('.dzg-hrow[aria-rowindex="1"] [data-col="n"]')!.focus();
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: 1 });
    expect((document.activeElement as HTMLElement).closest('[role=row]')!.getAttribute('aria-rowindex')).toBe('2');
    press('ArrowDown');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: dataKey('r0'), column: 'n' });
    press('ArrowUp');
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'n', level: 1 });
    press('ArrowUp');
    expect(g.kernel.focus).toMatchObject({ kind: 'header', column: 'n' });
    expect((document.activeElement as HTMLElement).closest('[role=row]')!.getAttribute('aria-rowindex')).toBe('1');
  });

  it('does not sort from a cell of an extra header row', () => {
    const { g, host } = make();
    host.querySelector<HTMLElement>('.dzg-hrow[aria-rowindex="2"] [data-col="n"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(g.kernel.query.sort).toEqual([]);
  });

  it('puts the overlay under every header row', () => {
    const { g, host } = make(0);
    void g;
    expect(host.querySelector<HTMLElement>('.dzg-overlay')!.style.insetBlockStart).toBe('64px');
  });
});
