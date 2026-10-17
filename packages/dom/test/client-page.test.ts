import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { UPDATE_POLICY } from '../src/update.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

function make() {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [{ id: 'n', type: 'number' }];
  const g = createGrid<R>(host, { rows: Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, n: i })), getRowId: (r) => r.id, columns, messages: EN, pagination: { pageSize: 5 }, selection: { mode: 'multi', checkbox: true }, onEvent: (e) => events.push(e) }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const rowIndexes = () => [...host.querySelectorAll('.dzg-layer > .dzg-row')].map((r) => Number(r.getAttribute('aria-rowindex'))).sort((a, b) => a - b);
  const texts = () => [...host.querySelectorAll('.dzg-layer > .dzg-row')].sort((a, b) => Number(a.getAttribute('aria-rowindex')) - Number(b.getAttribute('aria-rowindex'))).map((r) => r.querySelector('[data-col="n"]')!.textContent);
  return { g, host, vp, events, rowIndexes, texts };
}

describe('client paging in the grid', () => {
  it('shows one page: the rows, aria-rowcount and aria-rowindex per page', () => {
    const { vp, rowIndexes, texts } = make();
    expect(vp.getAttribute('aria-rowcount')).toBe('6');
    expect(rowIndexes()).toEqual([2, 3, 4, 5, 6]);
    expect(texts()).toEqual(['0', '1', '2', '3', '4']);
  });

  it('follows page.go: the rows, the counts restart, the events', () => {
    const { g, vp, rowIndexes, texts, events } = make();
    g.kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
    expect(vp.getAttribute('aria-rowcount')).toBe('3');
    expect(rowIndexes()).toEqual([2, 3]);
    expect(texts()).toEqual(['10', '11']);
    expect(events.some((e) => e.type === 'pageChanged' && e.page.index === 2)).toBe(true);
  });

  it('reads the select-all box over the page, and keeps the focus at its place', () => {
    const { g, host } = make();
    g.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(host.querySelector('.dzg-box')!.getAttribute('aria-checked')).toBe('true');
    g.api.focusCell(dataKey('r3')!, 'n');
    g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    expect(host.querySelector('.dzg-box')!.getAttribute('aria-checked')).toBe('false');
    expect(g.kernel.focus).toEqual({ kind: 'cell', row: dataKey('r8'), column: 'n' });
  });

  it('is set once: a live change is refused and told', () => {
    const { g, events } = make();
    expect(UPDATE_POLICY.pagination).toBe('fixed');
    g.update({ pagination: { pageSize: 10 } });
    expect(events.some((e) => e.type === 'problems' && e.problems.some((p) => p.code === 'unsupported-live-change' && p.path === 'settings.pagination'))).toBe(true);
    expect(g.kernel.rows.page!.size).toBe(5);
  });
});
