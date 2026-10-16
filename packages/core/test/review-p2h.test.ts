import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, dataKey, headerSelection, localeCtx, makeQuery, reconcileSelection, selectOnly } from '@dzgrid/core';

type R = { id: string; t: string; n: number };
const make = () => clientRows<R>({
  rows: [{ id: 'a', t: 'x', n: -5 }, { id: 'b', t: '-y', n: 1 }, { id: 'c', t: 'z', n: 0.5 }],
  getRowId: (r) => r.id, columns: createColumnModel<R>([{ id: 't' }, { id: 'n', type: 'number' }]), ctx: localeCtx({ locale: 'en-US' }),
});
const ids = (m: ReturnType<typeof make>) => Array.from({ length: m.displayed.count }, (_, i) => m.displayed.keyAt(m.displayed.index(i)!));

describe('phase 2 end review (core)', () => {
  it('finds the same rows whichever way the words were typed, a digit arriving included', () => {
    for (const [first, then] of [['-', '-5'], ['.', '.5'], ['x', 'x']] as const) {
      const typed = make();
      typed.setQuery(makeQuery({ quick: first }));
      typed.setQuery(makeQuery({ quick: then }));
      const fresh = make();
      fresh.setQuery(makeQuery({ quick: then }));
      expect(ids(typed), `${first} then ${then}`).toEqual(ids(fresh));
    }
  });

  it('keeps the same selection object when no selected row is gone', () => {
    const s = selectOnly([dataKey('a')!, dataKey('b')!]);
    expect(reconcileSelection(s, () => true)).toBe(s);
  });

  it('reads the header box once per selection and displayed rows', () => {
    const m = make();
    const s = selectOnly([dataKey('a')!, dataKey('b')!, dataKey('c')!]);
    let looked = 0;
    const d = m.displayed;
    const counting = { ...d, version: d.version, count: d.count, nodeAt: d.nodeAt, keyAt: d.keyAt, index: d.index, nextData: d.nextData, indexOf: (k: Parameters<typeof d.indexOf>[0]) => { looked++; return d.indexOf(k); } };
    expect(headerSelection(s, counting)).toBe('all');
    const first = looked;
    expect(headerSelection(s, counting)).toBe('all');
    expect(looked).toBe(first);
  });
});

describe('problems are told, not only stored', () => {
  it('emits the problems of a load and of a transaction', async () => {
    const { createKernel } = await import('@dzgrid/core');
    const columns = createColumnModel<R>([{ id: 't' }]);
    const m = clientRows<R>({ rows: [], getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }) });
    const k = createKernel({ rows: m, columns });
    const told: string[] = [];
    k.subscribe((e) => { if (e.type === 'problems') told.push(...e.problems.map((p) => `${e.source}:${p.code}`)); });
    m.setRows([{ id: 'a', t: 'x', n: 1 }, { id: 'a', t: 'y', n: 2 }], 'host');
    // A transaction that changes nothing tells only its caller (its result); one that does, everyone.
    m.applyTransaction({ remove: ['a', 'zzz'] }, 'host');
    expect(told).toEqual(['host:duplicate-row-id', 'host:unknown-row-id']);
  });
});

describe('pinned columns', () => {
  it('raise no warning at six on a side', async () => {
    const { resolveColumns } = await import('@dzgrid/core');
    expect(resolveColumns(Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, pinned: 'end' as const }))).problems).toEqual([]);
  });
});
