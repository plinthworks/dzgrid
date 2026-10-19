import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { FeatureHandle, GridFeature } from '../src/features.js';
import { EN } from '../src/locales/en.js';

/**
 * Asked by the review of the seams (step 9b, commit 1): the rows kept mounted
 * out of the window are the focused row first, then the anchors of tall
 * cells; only the focused row is never moved in the DOM (S10). With the focus
 * on a header, or nowhere, the first anchor is placed like any row.
 */
type R = { id: string; a: string };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });
const k = (s: string): RowKey => dataKey(s)!;

function make(anchors: readonly RowKey[], focus?: RowKey) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const handle: Omit<FeatureHandle, 'destroy'> = { spans: { plan: () => null, at: () => undefined, anchors: () => anchors } };
  const feature: GridFeature = { id: 'test.anchors', setup: () => ({ ...handle, destroy() {} }) };
  const g = createGrid<R>(host, { rows: Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, a: `a${i}` })), getRowId: (r) => r.id, columns: [{ id: 'a' }], messages: EN, features: [feature] }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const layer = host.querySelector<HTMLElement>('.dzg-layer')!;
  const rowEl = (i: number) => layer.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${i + 2}"]`)!;
  if (focus) g.api.focusCell(focus, 'a');
  box.scrollTop = 32 * 300;
  vp.dispatchEvent(new Event('scroll'));
  return { g, host, layer, rowEl };
}

const order = (layer: HTMLElement) => [...layer.children].map((r) => Number(r.getAttribute('aria-rowindex')));

describe('rows kept out of the window', () => {
  for (const where of ['nowhere', 'a header'] as const) {
    it(`with the focus on ${where}, the first anchor is placed in order like any row`, () => {
      const { g, layer, rowEl } = make([k('r3')]);
      if (where === 'a header') g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'a' } }, 'api');
      // Out of place by hand (a host's script, a row reused): the next paint puts it back first.
      layer.append(rowEl(3));
      expect(order(layer).at(-1)).toBe(5);
      g.api.refresh();
      expect(order(layer)[0]).toBe(5);
      expect(order(layer)).toEqual([...order(layer)].sort((x, y) => x - y));
    });
  }

  it('the focused row is never moved, even out of place', () => {
    // Focused on row 1, then scrolled far from it: it stays mounted out of the window.
    const { g, layer, rowEl } = make([k('r3')], k('r1'));
    const focused = rowEl(1);
    layer.append(focused);
    const mo = new MutationObserver(() => {});
    mo.observe(layer, { childList: true });
    g.api.refresh();
    const moved = mo.takeRecords().some((r) => [...r.removedNodes, ...r.addedNodes].includes(focused));
    mo.disconnect();
    expect(moved).toBe(false);
    expect(focused.parentNode).toBe(layer);
    // The others are placed around it, in order: the anchor right after it, then the window.
    expect(order(layer).slice(0, 2)).toEqual([3, 5]);
    expect(order(layer).slice(1)).toEqual([...order(layer).slice(1)].sort((x, y) => x - y));
  });
});
