import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number; t: string };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

function make(count = 5000, maxPhysical = 40_000) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  // The body's height bounds the scroll, as in a browser: read at write time.
  let bodyHeight = () => Infinity;
  const geometry: Geometry = {
    read: () => ({ ...box }),
    writeScrollTop: (px) => { box.scrollTop = Math.max(0, Math.min(px, bodyHeight() - box.block)); },
    writeScrollInline: (px) => { box.scrollInline = px; },
  };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = [{ id: 'n', type: 'number' }, { id: 't' }];
  const g = createGrid<R>(host, { rows: Array.from({ length: count }, (_, i) => ({ id: `r${i}`, n: i, t: i % 2 ? 'odd' : 'even' })), getRowId: (r) => r.id, columns, messages: EN }, { geometry, sync: true, maxPhysical });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const bodyEl = host.querySelector<HTMLElement>('.dzg-body')!;
  bodyHeight = () => parseFloat(bodyEl.style.blockSize) || 0;
  const s = (g as unknown as { scroll: { logicalTop: number; scrollTo(l: number): void; mapper: { maxLogical: number; maxPhysical: number } } }).scroll;
  return { g, host, vp, box, s };
}

describe('phase 2 steps 10-11 review', () => {
  it('leaves Ctrl+wheel and Cmd+wheel (zoom, pinch) to the browser', () => {
    const { vp, s } = make();
    for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
      const e = new WheelEvent('wheel', { deltaY: 100, cancelable: true, ...mod });
      vp.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    }
    expect(s.logicalTop).toBe(0);
  });

  it('keeps one tab stop when the first cell has scrolled out with nothing focused', () => {
    const { host, s } = make(5000, 1e9);
    s.scrollTo(3000 * 32);
    const stops = host.querySelectorAll('[tabindex="0"]');
    expect(stops.length).toBe(1);
  });

  it('reaches the true end after rows are appended while at the end', () => {
    const { g, s, box } = make(1000, 1e9);
    s.scrollTo(1e9);
    g.kernel.rows.applyTransaction({ add: Array.from({ length: 50 }, (_, i) => ({ id: `z${i}`, n: 1e6 + i, t: 'odd' })) });
    expect(s.logicalTop).toBe(s.mapper.maxLogical);
    expect(box.scrollTop).toBe(s.mapper.maxPhysical);
  });

  it('does not take focus back after the user left the grid', () => {
    const { g, host } = make(100, 1e9);
    const outside = document.createElement('button');
    document.body.append(outside);
    g.api.focusCell(dataKey('r2')!, 'n');
    // Focus leaves with no related target (a click on a non-focusable area, another window).
    (document.activeElement as HTMLElement).blur();
    g.kernel.dispatch({ type: 'query.set', query: { sort: [], filter: { t: { type: 'text', op: 'equals', value: 'odd' } }, quick: '', key: 'odd' } }, 'user');
    expect(host.contains(document.activeElement)).toBe(false);
  });

  it('forgets a pending focus once the user focuses something else in the grid', () => {
    const { g, host } = make(100, 1e9);
    g.api.focusCell(dataKey('r2')!, 'n');
    g.kernel.dispatch({ type: 'query.set', query: { sort: [], filter: { t: { type: 'text', op: 'equals', value: 'odd' } }, quick: '', key: 'odd' } }, 'user');
    const other = host.querySelector<HTMLElement>('.dzg-row[aria-rowindex="5"] [data-col="t"]')!;
    other.focus();
    g.kernel.dispatch({ type: 'query.set', query: { sort: [], filter: {}, quick: '', key: 'none' } }, 'user');
    expect(document.activeElement).toBe(other);
  });
});
