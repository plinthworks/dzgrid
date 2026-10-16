import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

/** A fake whose inline scroll is read through the direction, as a browser flips it. */
function make(settings: Partial<GridSettings<R>> = {}) {
  // The browser keeps a raw, physical offset: negative in RTL. The logical reading depends on the
  // direction in force, so a direction change alone flips what the grid would read.
  const box = { block: 320, inline: 600, scrollTop: 0, raw: 0 };
  const host = document.createElement('div');
  const rtl = () => host.querySelector('.dzg')?.getAttribute('dir') === 'rtl';
  const geometry: Geometry = {
    read: (): ViewportBox => ({ block: box.block, inline: box.inline, scrollTop: box.scrollTop, scrollInline: rtl() ? -box.raw : box.raw }),
    writeScrollTop: (px) => { box.scrollTop = px; },
    writeScrollInline: (px) => { box.raw = rtl() ? -px : px; },
  };
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = Array.from({ length: 20 }, (_, i): ColumnDef<R, any> => ({ id: `c${i}`, value: () => i, width: 100 }));
  const g = createGrid<R>(host, { rows: [{ id: 'a', n: 1 }], getRowId: (r) => r.id, columns, messages: EN, ...settings }, { geometry, sync: true });
  grids.push(g);
  return { g, host, box };
}

describe('found in the browser suite', () => {
  it('writes the logical inline scroll back when the direction changes (the browser flips it)', () => {
    const { g, box } = make();
    box.raw = 300;
    g.update({ direction: 'rtl' });
    expect(box.raw).toBe(-300);
    g.update({ direction: 'ltr' });
    expect(box.raw).toBe(300);
  });

  it('names the box column with words when there is no select-all box', () => {
    const { host } = make({ selection: { mode: 'single', checkbox: true } });
    const cell = host.querySelector('.dzg-header .dzg-check')!;
    expect(cell.textContent).toBe(EN.text['selection.column']);
    expect(cell.querySelector('.dzg-sr')).not.toBeNull();
    const multi = make({ selection: { mode: 'multi', checkbox: true } });
    expect(multi.host.querySelector('.dzg-header .dzg-check .dzg-sr')).toBeNull();
  });
});
