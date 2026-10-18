import { describe, it, expect, afterEach } from 'vitest';
import { createColumnModel, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';

/** The review of the span seams (step 9b, commit 1). */
type R = { id: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

describe('span seams review', () => {
  it('a null column definition is a problem, never a throw', () => {
    expect(() => createColumnModel<R>([null as unknown as ColumnDef<R>, { id: 'n', type: 'number' }])).not.toThrow();
    const m = createColumnModel<R>([null as unknown as ColumnDef<R>, { id: 'n', type: 'number' }]);
    expect(m.problems.some((p) => p.code === 'invalid-column')).toBe(true);
  });

  it('a repaint that changes nothing does not touch the overlay', async () => {
    const box: ViewportBox = { block: 300, inline: 400, scrollTop: 0, scrollInline: 0 };
    const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
    const host = document.createElement('div');
    document.body.append(host);
    const g = createGrid<R>(host, { rows: [{ id: 'a', n: 1 }], getRowId: (r) => r.id, columns: [{ id: 'n', type: 'number' }], messages: EN }, { geometry, sync: true });
    grids.push(g);
    const overlay = host.querySelector('.dzg-overlay')!;
    const seen: MutationRecord[] = [];
    const mo = new MutationObserver((r) => seen.push(...r));
    mo.observe(overlay, { attributes: true });
    g.api.refresh();
    await Promise.resolve();
    mo.disconnect();
    expect(seen).toEqual([]);
  });

});
