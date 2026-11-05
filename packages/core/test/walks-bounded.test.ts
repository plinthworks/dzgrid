import { describe, expect, it } from 'vitest';
import { createColumnModel, createKernel, dataKey, headerSelection, type DisplayIndex, type DisplayedRows, type RowKey, type RowModel, type RowNode } from '@dzgrid/core';
import { setSelectionGate } from '@dzgrid/core/internal';

/**
 * Phase 8 step 2 (D15): a list loaded in blocks shows ten million rows and holds a few hundred. Every place of the core
 * that walks the rows shown must walk the rows held (`DisplayedRows.held`), never ten million. A planted 10⁷ list whose
 * `nodeAt` / `keyAt` count their calls: each walk stays under 10⁴ calls.
 */
type R = { id: string };
const N = 10_000_000;
/** Rows 0–99 and 5 000 000–5 000 099 held, the rest loading. */
const HELD = [...Array.from({ length: 100 }, (_, i) => i), ...Array.from({ length: 100 }, (_, i) => 5_000_000 + i)];

function planted() {
  let calls = 0;
  const has = new Set(HELD);
  const node = (i: number): RowNode<R> => {
    calls++;
    return has.has(i) ? { key: dataKey(`r${i}`)!, kind: 'data', level: 0, id: `r${i}`, data: { id: `r${i}` } } : { key: `l:#${i}` as RowKey, kind: 'loading', level: 0, parent: null, failed: false };
  };
  const d: DisplayedRows<R> = {
    version: 1,
    count: N,
    dataCount: HELD.length,
    nodeAt: (i) => node(i),
    keyAt: (i) => node(i).key,
    index: (n) => (Number.isInteger(n) && n >= 0 && n < N ? (n as DisplayIndex) : null),
    indexOf(key) {
      const m = /^d:\d+:r(\d+)$/.exec(key) ?? /^l:#(\d+)$/.exec(key);
      const i = m ? Number(m[1]) : -1;
      return i >= 0 && i < N && key[0] === (has.has(i) ? 'd' : 'l') ? (i as DisplayIndex) : -1;
    },
    nextData: () => null,
    held: () => HELD as DisplayIndex[],
  };
  const model = {
    kind: 'source', ops: { filter: 'server', quick: 'server', sort: 'server', page: 'off' }, displayed: d, status: { phase: 'idle' },
    counts: { total: N, filtered: N, displayed: N }, problems: [], selectAll: 'query', keeps: () => true, membershipOf: () => 'm',
    // never: a planted node read back as the model's data node (only its key is used)
    scope: { params: {}, zone: 'UTC' }, row: (k: RowKey) => { const i = d.indexOf(k); return i === -1 ? undefined : (d.nodeAt(i) as never); },
    setQuery() {}, setColumns() {}, setContext() {}, invalidate() {}, page: null, setPage() {}, subscribe: () => () => {}, destroy() {},
  } as unknown as RowModel<R>; // a stand-in model: only what the kernel reads
  return { d, model, calls: () => calls, reset: () => void (calls = 0) };
}

describe('every walk of the core is bounded by the rows held (planted 10⁷ rows)', () => {
  it('select-all and the header box under a selection rule walk the rows held', () => {
    const p = planted();
    const kernel = createKernel({ rows: p.model, columns: createColumnModel<R>([{ id: 'id' }]) });
    setSelectionGate(kernel, { on: true, vet: () => null, skip: () => false });
    p.reset();
    kernel.dispatch({ type: 'selection.all' }, 'user');
    expect(kernel.selection.keys.size).toBe(200);
    expect(kernel.headerState).toBe('all');
    expect(p.calls()).toBeLessThan(10_000);
  });

  it('the header box of an everything-except selection reads the rows held', () => {
    const p = planted();
    p.reset();
    expect(headerSelection({ mode: 'exclude', keys: new Set([dataKey('r3')!]) }, p.d)).toBe('some');
    expect(p.calls()).toBeLessThan(10_000);
  });

  it('a range of rows from row 0 to row 5 000 050 is refused without walking the gap', () => {
    const p = planted();
    const kernel = createKernel({ rows: p.model, columns: createColumnModel<R>([{ id: 'id' }]) });
    kernel.dispatch({ type: 'selection.only', row: dataKey('r0')! }, 'user');
    p.reset();
    expect(kernel.dispatch({ type: 'selection.range', target: dataKey('r5000050')!, additive: false }, 'user')).toMatchObject({ ok: false, reason: 'rows-not-loaded' });
    expect(p.calls()).toBeLessThan(10_000);
    expect(kernel.dispatch({ type: 'selection.range', target: dataKey('r50')!, additive: false }, 'user').ok).toBe(true);
    expect(kernel.selection.keys.size).toBe(51);
  });
});
