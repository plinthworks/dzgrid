// Which row is « last » (docs/behaviors/presentation-settings.md 29; review 1.12.0): the last displayed body row,
// whatever its kind — a group row, a totals row, a tree's child, a detail panel — never a pinned row (their bands are
// not the body). Expectations by hand.
import { afterEach, describe, expect, it } from 'vitest';
import { dataKey, detailKey, type ColumnDef } from '@dzgrid/core';
import { cleanup as gclean, gmake, k as gk } from './support-grouping.js';
import { cleanup as tclean, tmake, wide, k as tk } from './support-tree.js';
import { cleanup as pclean, pm, rowsOf, tot, k as pk } from './support-pinned.js';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridContext } from '../src/context.js';
import { detail } from '../src/detail.js';
import { definePart } from '../src/part.js';
import { EN } from '../src/locales/en.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';

afterEach(() => { gclean(); tclean(); pclean(); });

/** The keys of every element marked last in the grid (body, bands, anything). */
const marked = (host: HTMLElement, ctx: { rowRenderer: { keyOf(el: Element): string | null | undefined } }) =>
  [...host.querySelectorAll('[data-last-row]')].map((r) => ctx.rowRenderer.keyOf(r) ?? r.className);

describe('the last row (29): the last displayed body row, whatever its kind', () => {
  it('grouping: the last group row while closed, its last child open; the grand total when it ends the list', () => {
    const t = gmake({ grouping: { by: ['region'] } });
    // Nord, Sud, then the blank region, all closed.
    const blank = t.keyAt(2);
    expect(marked(t.host, t.ctx)).toEqual([blank]);
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [blank], expanded: true }, 'api');
    expect(marked(t.host, t.ctx)).toEqual([gk('r6')]);
    const f = gmake({ grouping: { by: ['region'], footers: 'grand' } });
    // Three closed groups, then the grand total (a footer, shown as Σ).
    expect(f.shown()).toHaveLength(4);
    expect(f.shown()[3]).toBe('Σ');
    expect(marked(f.host, f.ctx)).toEqual([f.keyAt(3)]);
  });

  it('tree: the last root while closed, its last child once open', () => {
    const t = tmake({ rows: wide(2, 2) });
    expect(marked(t.host, t.ctx)).toEqual([tk('S1')]);
    t.expand(['S1']);
    expect(marked(t.host, t.ctx)).toEqual([tk('S1-1')]);
  });

  it('detail: the last master\'s panel when open, the master again when closed', () => {
    type D = { id: string; name: string };
    const host = document.body.appendChild(document.createElement('div'));
    const part = definePart('detail', { mount: (h) => (h.append('x'), { destroy() {} }) });
    const g = createGrid<D>(host, {
      rows: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], getRowId: (r) => r.id, columns: [{ id: 'name' }] as ColumnDef<D, any>[], // any: the column's value type is not under test
      messages: { locale: 'en', text: { ...EN.text, ...EN_DETAIL.text } }, features: [detail<D>({ part })],
    }, { sync: true, geometry: { read: () => ({ block: 400, inline: 600, scrollTop: 0, scrollInline: 0 }), writeScrollTop() {}, writeScrollInline() {} } }) as GridInstance<D, any>; // any: the client model, not under test
    const ctx = (g as unknown as { context: GridContext<D> }).context; // unknown: the test's handle on the grid's context
    try {
      expect(marked(host, ctx)).toEqual([dataKey('b')]);
      g.kernel.dispatch({ type: 'rows.expand', rows: [dataKey('b')!], expanded: true }, 'api');
      expect(marked(host, ctx)).toEqual([detailKey(dataKey('b')!)]);
      g.kernel.dispatch({ type: 'rows.expand', rows: [dataKey('b')!], expanded: false }, 'api');
      expect(marked(host, ctx)).toEqual([dataKey('b')]);
    } finally {
      g.destroy();
      host.remove();
    }
  });

  it('pinned rows: a bottom total is not the last row; the body\'s last is', () => {
    const t = pm({ rows: rowsOf(3), bottom: [tot()] });
    expect(t.host.querySelectorAll('.dzg-row').length).toBe(4); // three body rows and the total's band
    expect(marked(t.host, t.ctx)).toEqual([pk('r2')]);
  });
});
