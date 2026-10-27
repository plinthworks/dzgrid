// Phase 6 step 8b-1 (step08b-plan.md §2.1, §5; pinned-rows.md 7, 8, 11; editing.md 1 widened, C6): the kernel's one seam
// for pinned rows — a store it asks for keys its rows do not hold (`setPinned`). Through it: `rowOf`, the focus on a
// pinned cell (set, kept across sorts, filters and updates, its column fixed as any cell's), `editable` with the third
// argument `{ pinned }`; a pinned key is never selected.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery, pinnedKey, type ColumnDef, type DataNode, type GridEvent, type RowKey, type RowModel } from '@dzgrid/core';
import { setPinned } from '@dzgrid/core/internal';

type Row = { id: string; v: number; n: string };
const body: Row[] = [
  { id: 'a', v: 3, n: 'x' },
  { id: 'b', v: 1, n: 'y' },
  { id: 'c', v: 2, n: 'x' },
];
const top: Row = { id: 'a', v: 100, n: 'ref' };
const tot: Row = { id: 't', v: 6, n: 'total' };
const PT = pinnedKey('top', 'a')!;
const PB = pinnedKey('bottom', 't')!;
type Pin = DataNode<Row> & { readonly pinned: 'top' | 'bottom' };
const node = (key: RowKey, data: Row, pinned: 'top' | 'bottom'): Pin => ({ key, kind: 'data', level: 0, id: data.id, data, pinned });

function setup(defs: ColumnDef<Row, any>[] = [{ id: 'v', type: 'number', editable: true }, { id: 'n' }], wrap?: (m: RowModel<Row>) => RowModel<Row>) {
  const columns = createColumnModel<Row>(defs);
  const model = clientRows<Row>({ rows: body, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
  const kernel = createKernel<Row>({ rows: wrap ? wrap(model) : model, columns });
  const events: GridEvent<Row>[] = [];
  kernel.subscribe((e) => events.push(e));
  const held = new Map<RowKey, Pin>([[PT, node(PT, top, 'top')], [PB, node(PB, tot, 'bottom')]]);
  setPinned(kernel, (k) => held.get(k));
  return { model, kernel, events, held };
}

describe('rowOf', () => {
  it('a body row from the rows, a pinned row from the store; nothing else', () => {
    const { kernel } = setup();
    expect(kernel.rowOf(dataKey('a')!)?.data).toBe(body[0]);
    expect(kernel.rowOf(PT)).toMatchObject({ key: PT, kind: 'data', data: top, pinned: 'top' });
    expect(kernel.rowOf(PB)?.data).toBe(tot);
    expect(kernel.rowOf(pinnedKey('top', 'zz')!)).toBeUndefined();
  });

  it('without a store (or after it is removed): only the rows', () => {
    const { kernel } = setup();
    setPinned(kernel);
    expect(kernel.rowOf(PT)).toBeUndefined();
    expect(kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: PT, column: 'v' } }, 'user')).toMatchObject({ ok: false, reason: 'row-not-displayed' });
  });
});

describe('the focus on a pinned cell', () => {
  it('is set for a key the store holds; a key it does not hold is refused as before', () => {
    const { kernel } = setup();
    expect(kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: PB, column: 'n' } }, 'user')).toEqual({ ok: true });
    expect(kernel.focus).toEqual({ kind: 'cell', row: PB, column: 'n' });
    expect(kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: pinnedKey('bottom', 'gone')!, column: 'n' } }, 'user')).toMatchObject({ ok: false, reason: 'row-not-displayed' });
    expect(kernel.focus).toEqual({ kind: 'cell', row: PB, column: 'n' });
  });

  it('stays across a sort, a filter that empties the body and an update of the rows', () => {
    const { kernel, model, events } = setup();
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: PT, column: 'v' } }, 'user');
    events.length = 0;
    kernel.dispatch({ type: 'sort.set', sort: [{ column: 'v', dir: 'desc' }] }, 'user');
    kernel.dispatch({ type: 'filter.set', filter: { n: { type: 'text', op: 'equals', value: 'none' } } }, 'user');
    expect(model.displayed.count).toBe(0);
    model.setRows([{ id: 'z', v: 9, n: 'x' }]);
    expect(kernel.focus).toEqual({ kind: 'cell', row: PT, column: 'v' });
    expect(events.filter((e) => e.type === 'focusChanged')).toEqual([]);
  });

  it('a hidden column gives way to the first visible one, as for any cell; the row is kept', () => {
    const { kernel } = setup();
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: PB, column: 'n' } }, 'user');
    kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', hidden: true }] }, 'user');
    expect(kernel.focus).toEqual({ kind: 'cell', row: PB, column: 'v' });
  });

  it('a pinned key the store no longer holds falls back as a removed row does (the body row at its place, else the header)', () => {
    const { kernel, held, model } = setup();
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: PB, column: 'v' } }, 'user');
    held.delete(PB);
    model.setRows(body.map((r) => ({ ...r })));
    expect(kernel.focus).toEqual({ kind: 'cell', row: dataKey('a'), column: 'v' });
  });
});

describe('editable on a pinned row (editing.md 1 widened, C6; Q4: a third argument)', () => {
  it('the rule is told { pinned } as its third argument; a body row: pinned absent', () => {
    const seen: unknown[] = [];
    const { kernel } = setup([{ id: 'v', type: 'number', editable: (r, ctx, info) => (seen.push([r.id, ctx, info]), info?.pinned !== 'bottom') }, { id: 'n' }]);
    kernel.dispatch({ type: 'context.app', value: 'app' }, 'host');
    expect(kernel.editable(PT, 'v')).toBe(true);
    expect(kernel.editable(PB, 'v')).toBe(false);
    expect(kernel.editable(dataKey('b')!, 'v')).toBe(true);
    expect(seen).toEqual([['a', 'app', { pinned: 'top' }], ['t', 'app', { pinned: 'bottom' }], ['b', 'app', {}]]);
    expect((seen[2] as unknown[])[2]).toEqual({});
  });

  it('`editable: true` and a column not editable, as in the body; a key nobody holds: false', () => {
    const { kernel } = setup();
    expect(kernel.editable(PB, 'v')).toBe(true);
    expect(kernel.editable(PB, 'n')).toBe(false);
    expect(kernel.editable(pinnedKey('top', 'zz')!, 'v')).toBe(false);
  });

  it('a rule that throws says no, told once', () => {
    const { kernel, events } = setup([{ id: 'v', type: 'number', editable: () => { throw new Error('boom'); } }]);
    expect(kernel.editable(PT, 'v')).toBe(false);
    expect(kernel.editable(PB, 'v')).toBe(false);
    expect(events.filter((e) => e.type === 'problems')).toHaveLength(1);
  });
});

describe('never selected (pinned-rows.md 7)', () => {
  it('a toggle or an only on a pinned key is refused and selects nothing, on the browser rows', () => {
    const { kernel } = setup();
    expect(kernel.dispatch({ type: 'selection.toggle', row: PT }, 'user')).toMatchObject({ ok: false, reason: 'unknown-row' });
    expect(kernel.dispatch({ type: 'selection.only', row: PB }, 'user')).toMatchObject({ ok: false, reason: 'unknown-row' });
    expect(kernel.selection.keys.size).toBe(0);
  });

  it('nor on a model that keeps every key (server pages)', () => {
    const keepsAll = (m: RowModel<Row>): RowModel<Row> => new Proxy(m, { get: (t, p) => (p === 'keeps' ? () => true : Reflect.get(t, p, t)) });
    const { kernel } = setup(undefined, keepsAll);
    expect(kernel.dispatch({ type: 'selection.toggle', row: PT }, 'user')).toMatchObject({ ok: false });
    expect(kernel.selection.keys.size).toBe(0);
    // A data key still selects.
    expect(kernel.dispatch({ type: 'selection.toggle', row: dataKey('a')! }, 'user')).toEqual({ ok: true });
  });

  it('select-all takes the body rows only', () => {
    const { kernel } = setup();
    kernel.dispatch({ type: 'selection.allDisplayed' }, 'user');
    expect([...kernel.selection.keys].sort()).toEqual(['a', 'b', 'c'].map((id) => dataKey(id)).sort());
  });
});

describe('the query is never touched', () => {
  it('a pinned row is never counted, sorted or filtered: the rows shown are the body', () => {
    const { model, kernel } = setup();
    kernel.dispatch({ type: 'sort.set', sort: [{ column: 'v', dir: 'asc' }] }, 'user');
    expect(model.displayed.count).toBe(3);
    expect(model.displayed.indexOf(PT)).toBe(-1);
    void makeQuery;
  });
});
