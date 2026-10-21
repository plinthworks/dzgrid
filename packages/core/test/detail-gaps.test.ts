import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, detailKey, localeCtx, type RowKey } from '@dzgrid/core';
import { detailShape, sparseRowLayout, type DetailRows } from '@dzgrid/core/detail';

/**
 * Gaps left by detail.test.ts (step 8 review): transactions and reloads over open masters, a
 * detail's data after an update read before, and the expand-all depth. Each was a surviving mutant.
 */
type P = { id: string; n: number; t: string };
const ROWS: P[] = ['a', 'b', 'c', 'd'].map((id, n) => ({ id, n, t: 'ward' }));
const k = (id: string) => dataKey(id)!;
const x = (id: string) => detailKey(k(id));

function setup(rows: P[] = ROWS) {
  const columns = createColumnModel<P>([{ id: 'n', header: 'N', type: 'number' }, { id: 't', header: 'T' }]);
  const model = clientRows<P>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: detailShape<P>() });
  const kernel = createKernel<P>({ rows: model, columns });
  const open = (ids: string[], expanded = true) => kernel.dispatch({ type: 'rows.expand', rows: ids.map(k), expanded }, 'user');
  const keys = () => {
    const d = model.displayed as DetailRows<P>;
    return Array.from({ length: d.count }, (_, i) => d.keyAt(d.index(i)!));
  };
  return { model, kernel, open, keys };
}

describe('open masters across transactions and reloads', () => {
  it('a master removed and added again in one transaction keeps its detail open (now last)', () => {
    const { model, kernel, open, keys } = setup();
    open(['b']);
    model.applyTransaction({ remove: ['b'], add: [ROWS[1]!] });
    expect(keys()).toEqual([k('a'), k('c'), k('d'), k('b'), x('b')]);
    expect([...kernel.expansion]).toEqual([k('b')]);
  });

  it('removed in one transaction and added back in the next: closed', () => {
    const { model, kernel, open, keys } = setup();
    open(['b']);
    model.applyTransaction({ remove: ['b'] });
    model.applyTransaction({ add: [ROWS[1]!] });
    expect(keys()).toEqual([k('a'), k('c'), k('d'), k('b')]);
    expect([...kernel.expansion]).toEqual([]);
  });

  it('new rows from the host (setRows): the masters gone leave the expansion, those kept stay open', () => {
    const { model, kernel, open, keys } = setup();
    open(['a', 'c']);
    // Three of four rows gone: the store tells a reset (no list of removed keys), the masters go all the same.
    model.setRows([ROWS[2]!]);
    expect(keys()).toEqual([k('c'), x('c')]);
    expect([...kernel.expansion]).toEqual([k('c')]);
    model.setRows(ROWS);
    expect(keys()).toEqual([k('a'), k('b'), k('c'), x('c'), k('d')]);
  });

  it('a detail read before an update shows the master’s new data after it', () => {
    const { model, open } = setup();
    open(['c']);
    const node = () => {
      const d = model.displayed as DetailRows<P>;
      return d.nodeAt(d.index(d.indexOf(x('c')))!) as { data: P };
    };
    expect(node().data.t).toBe('ward');
    model.applyTransaction({ update: [{ id: 'c', n: 2, t: 'icu' }] });
    expect(node().data.t).toBe('icu');
  });
});

describe('expand-all and its depth over details (masters are level 0; depth 1 = the masters, as a tree’s roots)', () => {
  it('opening at depth 0 opens nothing; at depth 1, or none, every master', () => {
    const { model, kernel } = setup();
    expect(kernel.dispatch({ type: 'rows.expandAll', expanded: true, depth: 0 }, 'user').ok).toBe(true);
    expect([...kernel.expansion]).toEqual([]);
    kernel.dispatch({ type: 'rows.expandAll', expanded: true, depth: 1 }, 'user');
    expect([...kernel.expansion].length).toBe(4);
    kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect([...kernel.expansion].length).toBe(4);
    expect(model.expandable(0)).toEqual([]);
  });

  it('collapsing at depth 0 closes every detail, as it closes every row of a tree; at depth 1 none', () => {
    const { kernel, open, keys } = setup();
    open(['a', 'c']);
    expect(kernel.dispatch({ type: 'rows.expandAll', expanded: false, depth: 1 }, 'user').ok).toBe(true);
    expect([...kernel.expansion]).toEqual([k('a'), k('c')]);
    expect(kernel.dispatch({ type: 'rows.expandAll', expanded: false, depth: 0 }, 'user').ok).toBe(true);
    expect([...kernel.expansion]).toEqual([]);
    expect(keys()).toEqual(['a', 'b', 'c', 'd'].map(k));
  });
});

describe('focus on a detail whose master goes', () => {
  // Lead decision (step 8 review, master-detail.md): the row now at the master's place, not at the
  // detail's (one past it, which would skip the row that took the master's place).
  it('lands on the row now at the master’s place', () => {
    const { model, kernel, open } = setup();
    open(['b']);
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: x('b'), column: 'n' } }, 'user');
    model.applyTransaction({ remove: ['b'] });
    expect(kernel.focus).toEqual({ kind: 'cell', row: k('c'), column: 'n' });
  });
});

describe('the sparse layout with no rows', () => {
  it('indexAt answers -1 (no row) at any offset, as its doc says (RowLayout: only when count > 0)', () => {
    const L = sparseRowLayout({ count: 0, index: () => null }, 32, { at: [], heights: [] });
    for (const off of [-5, 0, 10, Infinity]) expect(L.indexAt(off)).toBe(-1);
    expect(L.total).toBe(0);
  });
});

describe('a height function that throws', () => {
  it('gives 240 for that detail and tells no problem (documented: no room in the budget)', () => {
    const columns = createColumnModel<P>([{ id: 'n', header: 'N', type: 'number' }]);
    const shape = detailShape<P>({ height: (r) => { if (r.id === 'b') throw Error('no'); return 50; } });
    const model = clientRows<P>({ rows: ROWS, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape });
    const kernel = createKernel<P>({ rows: model, columns });
    kernel.dispatch({ type: 'rows.expand', rows: [k('a'), k('b')], expanded: true }, 'user');
    expect((model.displayed as DetailRows<P>).heights).toEqual([50, 240]);
    expect(shape.problems).toEqual([]);
  });
});
