// Phase 5 step 2, owner Q12 narrowed by S2-O3: the application's context reaches the filter kinds
// (`test`, `wire`), `editable` and `validate`. docs/behaviors/filter-custom.md.
import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery,
  type AnyFilterKind, type FilterModel, type GridEvent, type ValueReader,
} from '@dzgrid/core';

type Row = { id: string; v: number; n: string };
const rows: Row[] = Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, v: i, n: i % 2 ? 'odd' : 'even' }));

/** At least the context's `min`: the application decides the floor. */
const atLeast: AnyFilterKind = {
  name: 'atLeast',
  read: (s) => s,
  active: () => true,
  test: (_s, _ctx, context) => {
    const min = (context as { min?: number } | undefined)?.min ?? 0;
    return (v) => typeof v === 'number' && v >= min;
  },
};
const CUSTOM: FilterModel = { v: { type: 'custom', kind: 'atLeast', state: {} } };
const TEXT: FilterModel = { n: { type: 'text', op: 'equals', value: 'odd' } };

function setup(filter: FilterModel, page = false) {
  const columns = createColumnModel<Row>([{ id: 'v', type: 'number' }, { id: 'n' }]);
  const model = clientRows<Row>({
    rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }),
    filterKinds: (name) => (name === 'atLeast' ? atLeast : undefined), ...(page && { page: { pageSize: 2 } }),
  });
  const kernel = createKernel<Row>({ rows: model, columns, query: makeQuery({ filter }) });
  const events: GridEvent<Row>[] = [];
  kernel.subscribe((e) => events.push(e));
  const ids = () => Array.from({ length: model.displayed.count }, (_, i) => String((model.displayed.nodeAt(model.displayed.index(i)!) as { id: unknown }).id));
  return { model, kernel, events, ids };
}

describe('the application context reaches the filter kinds', () => {
  it('a kind\'s test gets it as its third argument, and runs again when it changes', () => {
    const s = setup(CUSTOM);
    expect(s.ids()).toEqual(['r0', 'r1', 'r2', 'r3', 'r4', 'r5']);
    s.kernel.dispatch({ type: 'context.app', value: { min: 4 } }, 'host');
    expect(s.ids()).toEqual(['r4', 'r5']);
    expect(s.events.filter((e) => e.type === 'modelUpdated').map((e) => [(e as { kind: string }).kind, e.source])).toEqual([['context', 'host']]);
  });

  it('runs no filter again without a custom filter on, nor for the same context', () => {
    const s = setup(TEXT);
    const runs = s.model.diagnostics.filterRuns;
    s.kernel.dispatch({ type: 'context.app', value: { min: 4 } }, 'host');
    expect(s.model.diagnostics.filterRuns).toBe(runs);
    expect(s.events.filter((e) => e.type === 'modelUpdated')).toEqual([]);
    const c = setup(CUSTOM);
    const ctx = { min: 1 };
    c.kernel.dispatch({ type: 'context.app', value: ctx }, 'host');
    const after = c.model.diagnostics.filterRuns;
    c.kernel.dispatch({ type: 'context.app', value: ctx }, 'host');
    expect(c.model.diagnostics.filterRuns).toBe(after);
  });

  it('an everything-except selection is dropped by a context change only when a custom filter is on', () => {
    const plain = setup(TEXT, true);
    plain.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    expect(plain.kernel.selection.mode).toBe('exclude');
    plain.kernel.dispatch({ type: 'context.app', value: { min: 4 } }, 'host');
    expect(plain.kernel.selection.mode).toBe('exclude');

    const custom = setup(CUSTOM, true);
    custom.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    expect(custom.kernel.selection.mode).toBe('exclude');
    custom.kernel.dispatch({ type: 'context.app', value: { min: 4 } }, 'host');
    expect(custom.kernel.selection.mode).toBe('include');
    const last = custom.events.filter((e) => e.type === 'selectionChanged').at(-1) as { reason: string };
    expect(last.reason).toBe('scope-changed');
  });

  it('membershipOf moves with the context only under a custom filter', () => {
    const plain = setup(TEXT);
    const q = makeQuery({ filter: TEXT });
    const before = plain.model.membershipOf(q);
    plain.model.setApp({ min: 3 });
    expect(plain.model.membershipOf(q)).toBe(before);
    const custom = setup(CUSTOM);
    const qc = makeQuery({ filter: CUSTOM });
    const was = custom.model.membershipOf(qc);
    custom.model.setApp({ min: 3 });
    expect(custom.model.membershipOf(qc)).not.toBe(was);
  });

  it('a row the context lets in is found by key', () => {
    const s = setup(CUSTOM);
    s.model.setApp({ min: 5 });
    expect(s.model.matches!(dataKey('r5')!)).toBe(true);
    expect(s.model.matches!(dataKey('r4')!)).toBe(false);
  });
});

describe('the context while the order is stale, and the value lists', () => {
  it('a context change under a custom filter while stale reruns whole with the edits and clears it (C1)', () => {
    const s = setup(CUSTOM);
    let version = 0;
    const reader: ValueReader<Row> = { get version() { return version; }, overlay: true, value: (col, row, id) => (id === 'r0' && col.id === 'v' ? 9 : col.read(row)) };
    version++;
    s.kernel.dispatch({ type: 'edits.reader', reader, columns: ['v'] }, 'user');
    expect(s.kernel.orderStale).toBe(true);
    s.kernel.dispatch({ type: 'context.app', value: { min: 5 } }, 'host');
    expect(s.kernel.orderStale).toBe(false);
    expect(s.ids()).toEqual(['r0', 'r5']);
  });

  it('a value list\'s counts follow a context change under a custom filter on another column (C6)', () => {
    const s = setup(CUSTOM);
    const h = s.kernel.values('n');
    const count = (v: string) => h.result!.values.find((x) => x.value === v)?.count;
    expect([count('even'), count('odd')]).toEqual([3, 3]);
    s.kernel.dispatch({ type: 'context.app', value: { min: 4 } }, 'host');
    expect([count('even'), count('odd')]).toEqual([1, 1]);
  });
});
