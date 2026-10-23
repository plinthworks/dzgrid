// Phase 5 step 2: `settings.context` reaches the kernel (`context.app`, owner Q12 / S2-O3), at creation
// and on each change of identity; an equal reference sends nothing.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { GridCommand } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number };
let grids: GridInstance<R, any>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.restoreAllMocks(); });

function make(settings: Partial<GridSettings<R>> = {}) {
  const geometry: Geometry = { read: () => ({ block: 200, inline: 400, scrollTop: 0, scrollInline: 0 }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const g = createGrid<R>(host, {
    rows: [{ id: 'a', n: 1 }], getRowId: (r) => r.id, columns: [{ id: 'n', type: 'number' }], messages: EN, ...settings,
  }, { geometry, sync: true });
  grids.push(g);
  return g;
}
const appCommands = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter((c) => (c[0] as GridCommand).type === 'context.app');

describe('settings.context reaches the kernel', () => {
  it('at creation', () => {
    const ctx = { role: 'pharmacist' };
    expect(make({ context: ctx }).kernel.app).toBe(ctx);
    expect(make().kernel.app).toBeUndefined();
  });

  it('once per change of identity, from the host; never for the same reference or another setting', () => {
    const ctx = { role: 'pharmacist' };
    const g = make({ context: ctx });
    const spy = vi.spyOn(g.kernel, 'dispatch');
    g.update({ context: ctx });
    g.update({ density: 'compact' });
    expect(appCommands(spy)).toEqual([]);
    const next = { role: 'nurse' };
    g.update({ context: next });
    expect(appCommands(spy)).toEqual([[{ type: 'context.app', value: next }, 'host']]);
    expect(g.kernel.app).toBe(next);
    g.update({ context: undefined });
    expect(appCommands(spy).length).toBe(2);
    expect(g.kernel.app).toBeUndefined();
  });
});
