import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { UPDATE_POLICY, type UpdatePolicy } from '../src/update.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; key: string; a: string };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

function make() {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [{ id: 'a', header: 'A' }, { id: 'b', header: 'B', value: () => 1 }];
  const g = createGrid<R>(host, { rows: Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, key: `k${i}`, a: `a${i}` })), getRowId: (r) => r.id, columns, messages: EN, selection: { mode: 'multi' }, onEvent: (e) => events.push(e) }, { geometry, sync: true });
  grids.push(g);
  return { g, host, events, columns };
}

describe('update policy', () => {
  it('lists every setting: a new one without a policy does not compile', () => {
    // @ts-expect-error a policy entry is missing
    const partial: UpdatePolicy = { getRowId: 'fixed' };
    void partial;
    expect(UPDATE_POLICY.getRowId).toBe('fixed');
    expect(UPDATE_POLICY.columns).toBe('live');
  });

  it('refuses a new getRowId live, says so, and keeps the old ids', () => {
    const { g, events } = make();
    g.update({ getRowId: (r) => r.key });
    expect(events.some((e) => e.type === 'problems' && e.problems.some((p) => p.code === 'unsupported-live-change' && p.path === 'settings.getRowId'))).toBe(true);
    g.update({ rows: [{ id: 'r1', key: 'zz', a: 'changed' }] });
    expect(g.kernel.rows.row(dataKey('r1')!)).toBeDefined();
  });

  it('changes the selection mode live, clearing what a narrower mode cannot hold', () => {
    const { g, host } = make();
    g.kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([dataKey('r1')!, dataKey('r2')!]) } }, 'user');
    g.update({ selection: { mode: 'single' } });
    expect(g.kernel.selection.keys.size).toBe(0);
    expect(host.querySelector('.dzg-viewport')!.hasAttribute('aria-multiselectable')).toBe(false);
    g.kernel.dispatch({ type: 'selection.only', row: dataKey('r3')! }, 'user');
    g.update({ selection: { mode: 'multi', checkbox: true } });
    expect([...g.kernel.selection.keys]).toEqual([dataKey('r3')]);
    expect(host.querySelector('.dzg-check')).not.toBeNull();
  });

  it('sends new columns through the kernel: columnsChanged, focus on the same element', () => {
    const { g, events, columns } = make();
    g.api.focusCell(dataKey('r2')!, 'b');
    const el = document.activeElement;
    events.length = 0;
    g.update({ columns: [...columns] });
    expect(events.find((e) => e.type === 'columnsChanged')).toMatchObject({ source: 'host' });
    expect(document.activeElement).toBe(el);
  });
});
