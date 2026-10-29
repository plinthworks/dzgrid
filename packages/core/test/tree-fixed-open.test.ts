import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery, type GridEvent } from '@dzgrid/core';
import { treeShape, type TreeOptions, type TreeRows } from '@dzgrid/core/tree';

/**
 * `tree({ fixedOpen })` (1.1.0, step 14; tree-view.md « rows always open »): a row the function answers true for is
 * always open — no close through the kernel (one row, collapse-all at any depth, under a filter), no event for a close
 * refused, never listed by expand-all / collapse-all, open whatever expansion the host sets. Expectations by hand.
 */
type R = { id: string; p?: string | null; n: number; t?: string; top?: boolean };
const k = (id: string) => dataKey(id)!;
// Two tables (A, B), each a top-level node always open; A holds a nested node a2 with its own child.
const ROWS: R[] = [
  { id: 'A', n: 1, t: 'table', top: true },
  { id: 'a1', p: 'A', n: 1, t: 'line' },
  { id: 'a2', p: 'A', n: 2, t: 'group' },
  { id: 'a21', p: 'a2', n: 1, t: 'line' },
  { id: 'B', n: 2, t: 'table', top: true },
  { id: 'b1', p: 'B', n: 1, t: 'line' },
];

function setup(tree: Partial<TreeOptions<R>> = { fixedOpen: (r) => !!r.top }, rows: R[] = ROWS) {
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const model = clientRows<R>({ rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape: treeShape<R>({ parentId: (r) => r.p, ...tree }) });
  const kernel = createKernel<R>({ rows: model, columns });
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));
  const shown = () => {
    const d = model.displayed as TreeRows<R>;
    return Array.from({ length: d.count }, (_, i) => {
      const at = d.index(i)!;
      return `${String((d.nodeAt(at) as { id: unknown }).id)}${d.childrenAt(at) ? (d.expandedAt(at) ? '+' : '-') : ''}`;
    });
  };
  const toggled = () => events.filter((e) => e.type === 'rowExpanded').map((e) => `${e.expanded ? 'open' : 'close'} ${e.rows.map((x) => String(x).replace(/^d:\d+:/, '')).join(',')}`);
  return { model, kernel, events, shown, toggled };
}

describe('fixedOpen: always open', () => {
  it('open from the first load, whatever `initial` says; other parents closed as usual', () => {
    const t = setup();
    expect(t.shown()).toEqual(['A+', 'a1', 'a2-', 'B+', 'b1']);
    expect(t.toggled()).toEqual([]);
  });

  it('rows.expand(false) on it: refused silently (no event), still open; a nested parent opens and closes as usual', () => {
    const t = setup();
    expect(t.kernel.dispatch({ type: 'rows.expand', rows: [k('A')], expanded: false }, 'user').ok).toBe(true);
    expect(t.shown()).toEqual(['A+', 'a1', 'a2-', 'B+', 'b1']);
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('a2')], expanded: true }, 'user');
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('A'), k('a2')], expanded: false }, 'user');
    expect(t.shown()).toEqual(['A+', 'a1', 'a2-', 'B+', 'b1']);
    expect(t.toggled()).toEqual(['open a2', 'close a2']);
  });

  it('collapse-all (any depth) and expand-all leave it out; it stays open', () => {
    const t = setup();
    t.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'user');
    expect(t.shown()).toEqual(['A+', 'a1', 'a2+', 'a21', 'B+', 'b1']);
    t.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    expect(t.shown()).toEqual(['A+', 'a1', 'a2-', 'B+', 'b1']);
    t.kernel.dispatch({ type: 'rows.expandAll', expanded: false, depth: 0 }, 'user');
    expect(t.shown()).toEqual(['A+', 'a1', 'a2-', 'B+', 'b1']);
    expect(t.toggled()).toEqual(['open a2', 'close a2']);
    expect(t.model.expandable().map((x) => String(x).replace(/^d:\d+:/, ''))).toEqual(['a2']);
  });

  it('initial "all": the others opened, the fixed ones open without being in the expansion', () => {
    const t = setup({ fixedOpen: (r) => !!r.top, initial: 'all' });
    expect(t.shown()).toEqual(['A+', 'a1', 'a2+', 'a21', 'B+', 'b1']);
    expect([...t.kernel.expansion].map((x) => String(x).replace(/^d:\d+:/, ''))).toEqual(['a2']);
  });

  it('under a filter (its layer): a close asked for is refused, the row stays open', () => {
    const t = setup();
    t.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { t: { type: 'text', op: 'equals', value: 'line' } } }) }, 'user');
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('B')], expanded: false }, 'user');
    t.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user');
    expect(t.shown().filter((x) => x.startsWith('B'))).toEqual(['B+']);
    expect(t.toggled().filter((x) => x.includes('B'))).toEqual([]);
  });

  it('a row made fixed by a transaction is open at once; the function asked again when the rows change', () => {
    const t = setup();
    t.model.applyTransaction({ update: [{ id: 'a2', p: 'A', n: 2, t: 'group', top: true }] });
    expect(t.shown()).toEqual(['A+', 'a1', 'a2+', 'a21', 'B+', 'b1']);
  });

  it('bad input never throws: a throw counts as false; a value that is not a function is ignored with one warning', () => {
    const a = setup({ fixedOpen: (r) => { if (r.id === 'B') throw new Error('no'); return !!r.top; } });
    expect(a.shown()).toEqual(['A+', 'a1', 'a2-', 'B-']);
    const b = setup({ fixedOpen: true as never });
    expect(b.shown()).toEqual(['A-', 'B-']);
    expect(b.model.problems.map((p) => [p.code, p.severity, p.path, p.detail])).toEqual([['invalid-setting', 'warning', 'tree.fixedOpen', 'true']]);
  });

  it('without it: nothing changes (A closes as before)', () => {
    const t = setup({});
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('A')], expanded: true }, 'user');
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('A')], expanded: false }, 'user');
    expect(t.shown()).toEqual(['A-', 'B-']);
    expect(t.toggled()).toEqual(['open A', 'close A']);
  });
});
