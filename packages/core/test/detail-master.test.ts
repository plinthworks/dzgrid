// Rows without a detail (docs/behaviors/master-detail.md « Rows without a detail », step 16c): `isMaster`, decided
// once by the core. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, type GridEvent, type RowNode } from '@dzgrid/core';
import { detailShape, type DetailOptions, type DetailRows } from '@dzgrid/core/detail';

type P = { id: string; kids: number };
// Rows 1 and 3 have children: the masters.
const ROWS: P[] = [{ id: '1', kids: 2 }, { id: '2', kids: 0 }, { id: '3', kids: 1 }, { id: '4', kids: 0 }];
const k = (id: string) => dataKey(id)!;

function setup(o: DetailOptions<P> = {}, rows = ROWS) {
  const columns = createColumnModel<P>([{ id: 'kids', type: 'number' }]);
  const model = clientRows<P>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: detailShape<P>({ isMaster: (r) => r.kids > 0, ...o }) });
  const kernel = createKernel<P>({ rows: model, columns });
  const events: GridEvent<P>[] = [];
  kernel.subscribe((e) => events.push(e));
  const view = () => {
    const d = model.displayed as DetailRows<P>;
    return Array.from({ length: d.count }, (_, i) => {
      const n = d.nodeAt(d.index(i)!) as RowNode<P>;
      return n.kind === 'detail' ? `> ${(n.data as P).id}` : n.kind === 'data' ? n.data.id : '?';
    });
  };
  const expanded = () => events.filter((e) => e.type === 'rowExpanded');
  return { model, kernel, events, view, expanded };
}

describe('detail({ isMaster })', () => {
  it('expand-all opens exactly the masters', () => {
    const t = setup();
    t.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(t.view()).toEqual(['1', '> 1', '2', '3', '> 3', '4']);
    expect([...t.kernel.expansion].sort()).toEqual([k('1'), k('3')]);
  });

  it('rows.expand of a row that is not a master: nothing opens, no rowExpanded', () => {
    const t = setup();
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('2')], expanded: true }, 'user');
    expect(t.view()).toEqual(['1', '2', '3', '4']);
    expect(t.expanded()).toEqual([]);
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('3')], expanded: true }, 'user');
    expect(t.view()).toEqual(['1', '2', '3', '> 3', '4']);
    expect(t.expanded()).toHaveLength(1);
  });

  it("initial: 'all' opens the masters only", () => {
    const t = setup({ initial: 'all' });
    expect(t.view()).toEqual(['1', '> 1', '2', '3', '> 3', '4']);
  });

  it('DetailRows.isMaster answers for the build', () => {
    const t = setup();
    const d = t.model.displayed as DetailRows<P>;
    expect(['1', '2', '3', '4'].map((id) => d.isMaster!(k(id)))).toEqual([true, false, true, false]);
  });

  it('a master patched to a non-master while open: shown closed, its key kept; patched back: open again', () => {
    const t = setup();
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('3')], expanded: true }, 'user');
    t.model.applyTransaction({ update: [{ id: '3', kids: 0 }] });
    expect(t.view()).toEqual(['1', '2', '3', '4']);
    expect((t.model.displayed as DetailRows<P>).isMaster!(k('3'))).toBe(false);
    expect(t.kernel.expansion.has(k('3'))).toBe(true);
    t.model.applyTransaction({ update: [{ id: '3', kids: 4 }] });
    expect(t.view()).toEqual(['1', '2', '3', '> 3', '4']);
  });

  it('an open master patched to a non-master can still be closed; patched back, it stays closed (review of 16c)', () => {
    const t = setup();
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('3')], expanded: true }, 'user');
    t.model.applyTransaction({ update: [{ id: '3', kids: 0 }] });
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('3')], expanded: false }, 'host');
    expect(t.kernel.expansion.has(k('3'))).toBe(false);
    t.model.applyTransaction({ update: [{ id: '3', kids: 5 }] });
    expect(t.view()).toEqual(['1', '2', '3', '4']);
    // Opening a row that is not a master is still refused.
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('2')], expanded: true }, 'user');
    expect(t.kernel.expansion.has(k('2'))).toBe(false);
  });

  it('a throwing isMaster: not a master, nothing thrown', () => {
    const t = setup({ isMaster: (r) => { if (r.id === '1') throw new Error('app broke'); return true; } });
    expect(() => t.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user')).not.toThrow();
    expect(t.view()).toEqual(['1', '2', '> 2', '3', '> 3', '4', '> 4']);
  });

  it('asks the function once per row and per version of the rows', () => {
    let asked = 0;
    const t = setup({ isMaster: (r) => (asked++, r.kids > 0) });
    t.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    const d = t.model.displayed as DetailRows<P>;
    for (let i = 0; i < 3; i++) for (const id of ['1', '2', '3', '4']) d.isMaster!(k(id));
    expect(asked).toBe(4);
  });

  it('without isMaster, every row is a master (as before)', () => {
    const t = setup({ isMaster: undefined });
    t.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(t.view()).toEqual(['1', '> 1', '2', '> 2', '3', '> 3', '4', '> 4']);
  });
});
