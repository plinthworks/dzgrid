import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, REBASE, type ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { EN } from '../src/locales/en.js';

/**
 * Step 9b commit 1 moved row placement to the row layout (`rowTop`, with the
 * rebased `base`) and changed the row renderer's fast path (`#matches`) and
 * the header ArrowUp shortcut. None of the existing tests scrolls past one
 * REBASE, shrinks a column window, or watches a repaint that changes nothing:
 * these do.
 */
type R = { id: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

let reads = 0;
function make(count: number, over: Partial<GridSettings<R>> = {}, maxPhysical?: number) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = [
    { id: 'p', header: 'P', width: 80, pinned: 'start', value: (r: R) => { reads++; return r.n; } },
    ...Array.from({ length: 30 }, (_, i): ColumnDef<R, any> => ({ id: `c${i}`, header: `C${i}`, width: 100, value: (r: R) => { reads++; return r.n + i; } })),
    { id: 'z', header: 'Z', width: 80, pinned: 'end', value: () => { reads++; return 'z'; } },
  ];
  const g = createGrid<R>(host, { rows: Array.from({ length: count }, (_, i) => ({ id: `r${i}`, n: i })), getRowId: (r) => r.id, columns, messages: EN, ...over }, { geometry, sync: true, ...(maxPhysical ? { maxPhysical } : {}) });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const layer = host.querySelector<HTMLElement>('.dzg-layer')!;
  const s = (g as unknown as { scroll: { logicalTop: number; physicalTop: number; scrollTo(l: number): void } }).scroll;
  const rowEls = () => [...layer.querySelectorAll<HTMLElement>(':scope > .dzg-row')];
  const px = (el: HTMLElement, prop: string) => parseFloat(el.style.getPropertyValue(prop));
  return { g, host, vp, box, s, layer, rowEls, px };
}

describe('rows placed from the row layout, past a rebase', () => {
  it('puts every mounted row at its true place in the view once the layer is rebased (rowTop − base)', () => {
    // 200 000 rows of 32 px: 6.4 M px, past MAX_PHYSICAL and three REBASEs.
    const { s, layer, rowEls, px, box } = make(200_000);
    const h = 32;
    for (const logical of [3.5 * REBASE, 5 * REBASE + 77]) {
      s.scrollTo(logical);
      const lt = s.logicalTop;
      expect(lt).toBeGreaterThan(2 * REBASE);
      const layerTop = px(layer, 'inset-block-start');
      const rows = rowEls();
      expect(rows.length).toBeGreaterThan(5);
      for (const el of rows) {
        const i = Number(el.getAttribute('aria-rowindex')) - 2; // one header row
        // Where the row shows in the scroller, against where it is in the data.
        expect(layerTop + px(el, 'inset-block-start') - box.scrollTop).toBeCloseTo(i * h - lt, 3);
        expect(Math.abs(px(el, 'inset-block-start'))).toBeLessThanOrEqual(REBASE + 2 * box.block);
      }
    }
  });

  it('keeps the focused row, scrolled far away, at a bounded distance (S11)', () => {
    const { g, s, rowEls, px } = make(200_000);
    g.api.focusCell(dataKey('r0')!, 'c0');
    s.scrollTo(5 * REBASE);
    const focused = rowEls().find((el) => el.getAttribute('aria-rowindex') === '2');
    expect(focused).toBeDefined();
    const top = px(focused!, 'inset-block-start');
    expect(top).toBeLessThan(0);
    expect(top).toBeGreaterThanOrEqual(-2 * REBASE);
  });
});

describe('the row renderer’s fast path', () => {
  it('unmounts the centre cells that leave a column window that shrinks (cell count checked)', () => {
    const { g, rowEls } = make(20, { overscan: { cols: 6 } });
    const count = () => rowEls()[0]!.querySelectorAll('.dzg-cell').length;
    const wide = count();
    g.update({ overscan: { cols: 0 } });
    const narrow = count();
    expect(narrow).toBeLessThan(wide);
    // Exactly the window and the two pinned cells, on every row.
    for (const el of rowEls()) expect(el.querySelectorAll('.dzg-cell').length).toBe(narrow);
    const centre = rowEls()[0]!.querySelectorAll('.dzg-seg-center .dzg-cell').length;
    expect(centre).toBe(narrow - 2);
  });

  it('reads no value again on a repaint that changes nothing', () => {
    const { g, vp } = make(20);
    reads = 0;
    vp.dispatchEvent(new Event('scroll'));
    g.update({ label: 'again' });
    expect(reads).toBe(0);
  });
});

describe('ArrowUp on the column headers without group rows', () => {
  it('is not taken by the grid (as before step 9b): no focus move, default not prevented', () => {
    const { g, host } = make(20);
    host.querySelector<HTMLElement>('.dzg-header .dzg-hcell[data-col="c1"]')!.focus();
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'c1' });
    const e = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    (document.activeElement as HTMLElement).dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(g.kernel.focus).toEqual({ kind: 'header', column: 'c1' });
  });
});
