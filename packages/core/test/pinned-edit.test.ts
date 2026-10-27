// Phase 6 step 8b-1 (step08b-plan.md §2.1, §2.4, §5; pinned-rows.md 11–16; Q4, Q5): the edit controller on pinned rows.
// A pinned cell's overlay entry is its own (a body row of the same id does not share it), a save carries `pinned`, a pinned
// edit never makes the body's order stale, undo / redo, a refusal rolls back, and the application replacing or removing a
// pinned row (`pinnedChanged`) ends its saved values or its changes as `rows.subscribe` does for the body.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery, pinnedKey, type ColumnDef, type DataNode, type GridEvent, type RowKey } from '@dzgrid/core';
import { emit, setPinned } from '@dzgrid/core/internal';
import { createEdits, type SaveRequest } from '@dzgrid/core/edit';

type Row = { id: string; v: number; n: string };
const settle = () => new Promise<void>((r) => setImmediate(r));
const PT = pinnedKey('top', 'a')!;
const PB = pinnedKey('bottom', 't')!;
type Pin = DataNode<Row> & { readonly pinned: 'top' | 'bottom' };

function setup(o: { defs?: ColumnDef<Row, any>[]; save?: boolean } = {}) {
  const body: Row[] = [{ id: 'a', v: 3, n: 'x' }, { id: 'b', v: 1, n: 'y' }];
  const columns = createColumnModel<Row>(o.defs ?? [{ id: 'v', type: 'number', editable: true }, { id: 'n', editable: true }]);
  const ctx = localeCtx({ locale: 'en-US' });
  const model = clientRows<Row>({ rows: body, getRowId: (r) => r.id, columns, ctx });
  const kernel = createKernel<Row>({ rows: model, columns, query: makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }) });
  const events: GridEvent<Row>[] = [];
  kernel.subscribe((e) => events.push(e));
  const held = new Map<RowKey, Pin>();
  const pin = (side: 'top' | 'bottom', data: Row) => {
    const key = pinnedKey(side, data.id)!;
    held.set(key, { key, kind: 'data', level: 0, id: data.id, data, pinned: side });
    return data;
  };
  const top = pin('top', { id: 'a', v: 100, n: 'ref' });
  const tot = pin('bottom', { id: 't', v: 4, n: 'total' });
  setPinned(kernel, (k) => held.get(k));
  const changed = () => emit(kernel, { type: 'pinnedChanged', source: 'api' });
  const reqs: { req: SaveRequest<Row>; ok: () => void; fail: (e: unknown) => void }[] = [];
  const save = (req: SaveRequest<Row>) => new Promise<void>((ok, fail) => reqs.push({ req, ok: () => ok(), fail }));
  const edits = createEdits<Row>(kernel, { ctx: () => ctx, ...(o.save !== false && { save }) });
  const v = columns.get('v')!;
  const shown = (key: RowKey) => edits.reader.value(v, kernel.rowOf(key)!.data, key.startsWith('d:') ? key.slice(4) : key);
  return { body, model, kernel, events, held, pin, top, tot, changed, reqs, edits, v, shown };
}

describe('pinned cells edit on their own', () => {
  it('a pinned row and a body row of the same id keep apart: each its own value, its own state', () => {
    const s = setup();
    s.edits.commit([{ key: dataKey('a')!, column: 'v', input: { value: 7 } }]);
    s.edits.commit([{ key: PT, column: 'v', input: { value: 8 } }]);
    expect(s.shown(dataKey('a')!)).toBe(7);
    expect(s.shown(PT)).toBe(8);
    expect(s.edits.state(PT, 'v')?.status).toBe('saving');
    expect(s.edits.state(dataKey('a')!, 'v')?.status).toBe('saving');
    // Two gestures, two requests: neither waits behind the other (not the same cell).
    expect(s.reqs).toHaveLength(2);
  });

  it('two pinned rows never collide', () => {
    const s = setup();
    s.edits.commit([{ key: PT, column: 'v', input: { value: 8 } }, { key: PB, column: 'v', input: { value: 9 } }]);
    expect([s.shown(PT), s.shown(PB)]).toEqual([8, 9]);
  });

  it('read-only when the rule says so for that side ({ pinned }, Q4)', () => {
    const s = setup({ defs: [{ id: 'v', type: 'number', editable: (_r, _c, i) => i?.pinned !== 'bottom' }] });
    expect(s.edits.check(PB, 'v', { value: 1 })).toEqual({ ok: false, code: 'read-only' });
    expect(s.edits.commit([{ key: PB, column: 'v', input: { value: 1 } }]).refused).toEqual([{ key: PB, column: 'v', code: 'read-only' }]);
    expect(s.edits.commit([{ key: PT, column: 'v', input: { value: 1 } }]).staged).toBe(1);
  });
});

describe('the save (Q5)', () => {
  it('one gesture, one request: the grid key, the app row, the value before, and pinned', () => {
    const s = setup();
    s.edits.commit([{ key: PB, column: 'v', input: { value: 9 } }]);
    expect(s.reqs[0]!.req.changes).toEqual([{ key: PB, column: 'v', value: 9, previous: 4, row: s.tot, pinned: 'bottom' }]);
    s.edits.commit([{ key: dataKey('b')!, column: 'n', input: { text: 'z' } }]);
    expect(s.reqs[1]!.req.changes[0]!.pinned).toBeUndefined();
  });

  it('a refusal rolls the pinned cell back to its source, failed, its refused value kept', async () => {
    const s = setup();
    s.edits.commit([{ key: PT, column: 'v', input: { value: 8 } }]);
    s.reqs[0]!.fail({ reason: 'no' });
    await settle();
    expect(s.shown(PT)).toBe(100);
    expect(s.edits.state(PT, 'v')).toMatchObject({ status: 'failed', refused: 8, reason: 'no' });
    expect(s.events.filter((e) => e.type === 'saveFailed').map((e) => (e as { key: RowKey }).key)).toEqual([PT]);
  });

  it('a cell named by the error by its key is refused alone', async () => {
    const s = setup();
    s.edits.commit([{ key: PT, column: 'v', input: { value: 8 } }, { key: PB, column: 'v', input: { value: 9 } }]);
    s.reqs[0]!.fail({ cells: [{ key: PB, column: 'v' }] });
    await settle();
    expect(s.edits.state(PT, 'v')?.status).toBe('saved');
    expect(s.edits.state(PB, 'v')?.status).toBe('failed');
  });
});

describe('never order-stale (pinned-rows.md 14)', () => {
  it('a pinned edit of the sorted column leaves the order in date; the same edit of a body row does not', () => {
    const s = setup();
    s.edits.commit([{ key: PT, column: 'v', input: { value: -5 } }]);
    expect(s.kernel.orderStale).toBe(false);
    expect(s.events.some((e) => e.type === 'orderStale')).toBe(false);
    s.edits.commit([{ key: dataKey('b')!, column: 'v', input: { value: 50 } }]);
    expect(s.kernel.orderStale).toBe(true);
  });

  it('a refused pinned save rolls back without staling the body either', async () => {
    const s = setup();
    s.edits.commit([{ key: PB, column: 'v', input: { value: 8 } }]);
    s.reqs[0]!.fail('no');
    await settle();
    expect(s.kernel.orderStale).toBe(false);
  });
});

describe('undo and redo (pinned-rows.md 15)', () => {
  it('a pinned gesture is undone and redone in the same history; the cell given back first', async () => {
    const s = setup({ save: false });
    s.edits.commit([{ key: PB, column: 'v', input: { value: 9 } }]);
    s.edits.commit([{ key: dataKey('a')!, column: 'v', input: { value: 2 } }]);
    s.edits.undo();
    expect(s.edits.undo()).toEqual({ cells: [{ key: PB, column: 'v' }], skipped: 0 });
    expect(s.shown(PB)).toBe(4);
    expect(s.edits.redo()).toEqual({ cells: [{ key: PB, column: 'v' }], skipped: 0 });
    expect(s.shown(PB)).toBe(9);
  });
});

describe('the application replaces or removes pinned rows (pinned-rows.md 16)', () => {
  it('a new row object (same id): its saved value goes, the new data shows', async () => {
    const s = setup();
    s.edits.commit([{ key: PB, column: 'v', input: { value: 9 } }]);
    s.reqs[0]!.ok();
    await settle();
    expect(s.shown(PB)).toBe(9);
    s.pin('bottom', { id: 't', v: 12, n: 'total' });
    s.events.length = 0;
    s.changed();
    expect(s.shown(PB)).toBe(12);
    expect(s.edits.state(PB, 'v')).toBeUndefined();
    expect(s.events.filter((e) => e.type === 'editStates')).toHaveLength(1);
  });

  it('a live change follows the new object of its row (same id), sent with it', () => {
    const s = setup({ save: false });
    const fresh = s.pin('top', { id: 'a', v: 100, n: 'ref' });
    s.edits.commit([{ key: PT, column: 'n', input: { text: 'q' } }]);
    expect(s.edits.state(PT, 'n')?.status).toBe('saved');
    void fresh;
  });

  it('a row removed while its save flies: its changes dropped once answered, nothing shown for it', async () => {
    const s = setup();
    s.edits.commit([{ key: PB, column: 'v', input: { value: 9 } }]);
    s.held.delete(PB);
    s.changed();
    expect(s.edits.dirty).toBe(true);
    s.reqs[0]!.ok();
    await settle();
    expect(s.edits.state(PB, 'v')).toBeUndefined();
    expect(s.edits.dirty).toBe(false);
  });

  it('a row removed with a change waiting (another in flight on it): the waiting one never sent', async () => {
    const s = setup();
    s.edits.commit([{ key: PB, column: 'v', input: { value: 9 } }]);
    s.edits.commit([{ key: PB, column: 'v', input: { value: 10 } }]);
    s.held.delete(PB);
    s.changed();
    s.reqs[0]!.ok();
    await settle();
    expect(s.reqs).toHaveLength(1);
  });
});
