import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, type GridCommand, type GridEvent, type RowKey, type RowModel, type SelectionGate, type SelectionState } from '@dzgrid/core';
import { setSelectionGate } from '@dzgrid/core/internal';
import { vetSelection } from '@dzgrid/core/rules';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource } from './support/fake-source.js';

/**
 * The kernel's selection gate (step 21, docs/behaviors/selection-rules.md): set through
 * `@dzgrid/core/internal`; without one, nothing changes.
 */
type R = { id: string; v: string };
const k = (id: string): RowKey => dataKey(id)!;
const columns = () => createColumnModel<R>([{ id: 'v' }]);
const data = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, v: i % 2 ? 'even' : 'odd' }));
const ctx = localeCtx({ locale: 'en-US' });

function client(n = 10, page?: number) {
  const cols = columns();
  const rows = clientRows<R>({ rows: data(n), getRowId: (r) => r.id, columns: cols, ctx, ...(page && { page: { pageSize: page } }) });
  const kernel = createKernel<R>({ rows, columns: cols });
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));
  return { kernel, rows, events };
}

function server(n = 12, pageSize = 5) {
  const all = data(n);
  const fake = fakeSource({ reply: (req) => ({ rows: all.slice(req.page!.offset, req.page!.offset + req.page!.size), total: all.length }) });
  const cols = columns();
  const rows = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns: cols, ctx, abort: fake.abort, operations: 'server', page: { pageSize } });
  const kernel = createKernel<R>({ rows, columns: cols });
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));
  return { kernel, rows, events };
}

/** A gate refusing the ids given, with the rule's vetting; `skip` asks it of the selection now. */
function refusing(rows: RowModel<R>, sel: () => SelectionState, ids: string[], reason: string | false = false): SelectionGate & { calls: number } {
  const rule = (row: { data: R }) => (ids.includes(row.data.id) ? reason : true);
  const gate = {
    on: true,
    calls: 0,
    vet(prev: SelectionState, next: SelectionState) {
      gate.calls++;
      return vetSelection(rule, (key) => rows.row(key), prev, next);
    },
    skip: (key: RowKey) => { const n = rows.row(key); return !n || rule(n) !== true; },
  };
  void sel;
  return gate;
}

const sel = (events: GridEvent<R>[]) => events.filter((e) => e.type === 'selectionChanged' || e.type === 'selectionRefused').map((e) => e.type);

describe('the selection gate', () => {
  it('without a gate, or with one that lets everything through, a script tells the same events', () => {
    const script: GridCommand[] = [
      { type: 'selection.toggle', row: k('r2') }, { type: 'selection.only', row: k('r3') }, { type: 'selection.range', target: k('r6'), additive: true },
      { type: 'selection.all' }, { type: 'selection.toggle', row: k('r4') }, { type: 'selection.allFiltered' }, { type: 'selection.clear' },
      { type: 'selection.set', selection: { mode: 'exclude', keys: new Set([k('r1')]) } }, { type: 'page.go', index: 1 }, { type: 'selection.all' },
    ];
    const a = client(10, 4);
    const b = client(10, 4);
    setSelectionGate(b.kernel, { on: false, vet: () => null, skip: () => false });
    for (const cmd of script) {
      expect(b.kernel.dispatch(cmd, 'user')).toEqual(a.kernel.dispatch(cmd, 'user'));
      expect(b.kernel.headerState).toBe(a.kernel.headerState);
      expect(b.kernel.anchor).toBe(a.kernel.anchor);
    }
    const shape = (es: GridEvent<R>[]) => es.map((e) => (e.type === 'selectionChanged' ? [e.type, e.selection.mode, [...e.selection.keys], e.count, e.reason] : [e.type]));
    expect(shape(b.events)).toEqual(shape(a.events));
  });

  it('applies what the gate returns: selectionChanged first, then selectionRefused, state read by both', () => {
    const t = client();
    setSelectionGate(t.kernel, refusing(t.rows, () => t.kernel.selection, ['r3']));
    const seen: [string, number][] = [];
    t.kernel.subscribe((e) => { if (e.type === 'selectionChanged' || e.type === 'selectionRefused') seen.push([e.type, t.kernel.selection.keys.size]); });
    t.kernel.dispatch({ type: 'selection.allDisplayed' }, 'user');
    expect(seen).toEqual([['selectionChanged', 9], ['selectionRefused', 9]]);
    const refused = t.events.find((e) => e.type === 'selectionRefused');
    expect(refused).toEqual({ type: 'selectionRefused', source: 'user', rows: [k('r3')], reason: null, cause: 'rule' });
  });

  it('tells no selectionChanged when the gate keeps the selection as it was', () => {
    const t = client();
    setSelectionGate(t.kernel, refusing(t.rows, () => t.kernel.selection, ['r3'], 'nope'));
    t.kernel.dispatch({ type: 'selection.toggle', row: k('r3') }, 'host');
    expect(sel(t.events)).toEqual(['selectionRefused']);
    expect(t.events.at(-1)).toMatchObject({ source: 'host', reason: 'nope' });
    expect(t.kernel.selection.keys.size).toBe(0);
  });

  it('moves the anchor only to an accepted row', () => {
    const t = client();
    setSelectionGate(t.kernel, refusing(t.rows, () => t.kernel.selection, ['r5']));
    t.kernel.dispatch({ type: 'selection.only', row: k('r2') }, 'user');
    expect(t.kernel.anchor).toBe(k('r2'));
    t.kernel.dispatch({ type: 'selection.toggle', row: k('r5') }, 'user');
    expect(t.kernel.anchor).toBe(k('r2'));
    t.kernel.dispatch({ type: 'selection.only', row: k('r5') }, 'user');
    expect(t.kernel.anchor).toBe(k('r2'));
    expect([...t.kernel.selection.keys]).toEqual([k('r2')]);
    t.kernel.dispatch({ type: 'selection.toggle', row: k('r7') }, 'user');
    expect(t.kernel.anchor).toBe(k('r7'));
  });

  it('keeps the anchor when select all matching is refused', () => {
    const t = client(10, 4);
    setSelectionGate(t.kernel, refusing(t.rows, () => t.kernel.selection, []));
    t.kernel.dispatch({ type: 'selection.toggle', row: k('r2') }, 'user');
    t.kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
    expect(t.kernel.anchor).toBe(k('r2'));
    expect(t.kernel.selection.mode).toBe('include');
    expect(t.kernel.selectionScope).toBeNull();
  });

  it('on server pages, select all takes the rows shown while a rule is on, and the query again once it is off', () => {
    const t = server();
    const gate = refusing(t.rows, () => t.kernel.selection, ['r2']);
    setSelectionGate(t.kernel, gate);
    t.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(t.kernel.selection.mode).toBe('include');
    expect([...t.kernel.selection.keys]).toEqual([k('r1'), k('r3'), k('r4'), k('r5')]);
    // r2 refused: the box over the page reads ticked.
    expect(t.kernel.headerState).toBe('all');
    setSelectionGate(t.kernel);
    t.kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(t.kernel.selection.mode).toBe('exclude');
  });

  it('reads the box again when the gate hands a new skip, or a new gate is set', () => {
    const t = client(4);
    let refused = ['r4'];
    let skip = (key: RowKey) => refused.includes(String(key).replace(/^d:\d+:/, ''));
    const gate = { on: true, vet: () => null, get skip() { return skip; } };
    setSelectionGate(t.kernel, gate);
    t.kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([k('r1'), k('r2'), k('r3')]) } }, 'user');
    expect(t.kernel.headerState).toBe('all');
    // The same skip: cached, even though what it says moved.
    refused = [];
    expect(t.kernel.headerState).toBe('all');
    skip = (key: RowKey) => refused.includes(String(key).replace(/^d:\d+:/, ''));
    expect(t.kernel.headerState).toBe('some');
    refused = ['r4'];
    setSelectionGate(t.kernel, { on: true, vet: () => null, skip: (key) => refused.includes(String(key).replace(/^d:\d+:/, '')) });
    expect(t.kernel.headerState).toBe('all');
  });

  it('reads the box as before for none and all, never asking skip', () => {
    const t = client(4);
    let asked = 0;
    setSelectionGate(t.kernel, { on: true, vet: () => null, skip: () => (asked++, true) });
    expect(t.kernel.headerState).toBe('none');
    t.kernel.dispatch({ type: 'selection.allDisplayed' }, 'user');
    expect(t.kernel.headerState).toBe('all');
    expect(asked).toBe(0);
  });

  it('never vets what the data or a filter clears', () => {
    const t = client();
    const gate = refusing(t.rows, () => t.kernel.selection, []);
    setSelectionGate(t.kernel, gate);
    t.kernel.dispatch({ type: 'selection.toggle', row: k('r1') }, 'user');
    t.kernel.dispatch({ type: 'selection.keepOnFilter', keep: false }, 'host');
    const before = gate.calls;
    t.kernel.dispatch({ type: 'filter.column', column: 'v', filter: { type: 'text', op: 'equals', value: 'even' } }, 'user');
    expect(gate.calls).toBe(before);
    expect(t.kernel.selection.keys.size).toBe(0);
  });
});
