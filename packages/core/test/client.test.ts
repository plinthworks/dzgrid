import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, localeCtx, makeQuery, dataKey, type ValueReader, type ModelChange } from '@dzgrid/core';

type Row = { id: string; v: number; n: string };

const rows: Row[] = [
  { id: 'a', v: 3, n: 'x' },
  { id: 'b', v: 1, n: 'y' },
  { id: 'c', v: 2, n: 'x' },
  { id: 'd', v: 0, n: 'y' },
];
const make = (reader?: ValueReader<Row>) =>
  clientRows<Row>({
    rows,
    getRowId: (r) => r.id,
    columns: createColumnModel<Row>([{ id: 'v', type: 'number' }, { id: 'n' }]),
    ctx: localeCtx({ locale: 'en-US' }),
    ...(reader && { reader }),
  });
const shown = (m: ReturnType<typeof make>) => Array.from({ length: m.displayed.count }, (_, i) => m.displayed.nodeAt(m.displayed.index(i)!).id);

describe('the client model', () => {
  it('does not filter again for a sort change', () => {
    const m = make();
    m.setQuery(makeQuery({ filter: { n: { type: 'text', op: 'equals', value: 'x' } } }));
    const runs = m.diagnostics.filterRuns;
    m.setQuery(makeQuery({ filter: { n: { type: 'text', op: 'equals', value: 'x' } }, sort: [{ column: 'v', dir: 'asc' }] }));
    expect(m.diagnostics.filterRuns).toBe(runs);
    expect(shown(m)).toEqual(['c', 'a']);
  });

  it('does nothing for a query equal to the current one', () => {
    const m = make();
    m.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }));
    const before = m.displayed;
    let calls = 0;
    m.subscribe(() => calls++);
    m.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }));
    expect(m.displayed).toBe(before);
    expect(calls).toBe(0);
  });

  it('re-tests only the updated row, and keeps the order when no sort key moved', () => {
    const m = make();
    m.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'asc' }], filter: { v: { type: 'number', op: 'gte', value: 0 } } }));
    const sorts = m.diagnostics.sortRuns;
    const retested = m.diagnostics.retested;
    m.applyTransaction({ patch: [{ id: 'b', set: { n: 'changed' } }] });
    expect(m.diagnostics.retested - retested).toBe(1);
    expect(m.diagnostics.sortRuns).toBe(sorts);
    expect(m.displayed.nodeAt(m.displayed.index(1)!).data.n).toBe('changed');
  });

  it('moves an updated row when its sort key changes', () => {
    const m = make();
    m.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }));
    m.applyTransaction({ patch: [{ id: 'd', set: { v: 9 } }] });
    expect(shown(m)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('keeps edits from reordering rows until reapply() (K.14)', () => {
    const edits: Record<string, Partial<Row>> = {};
    let version = 0;
    const reader: ValueReader<Row> = {
      get version() { return version; },
      overlay: true,
      value: (col, row, id) => (edits[id] as Record<string, unknown> | undefined)?.[col.id] ?? col.read(row),
    };
    const m = make(reader);
    m.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }));
    expect(shown(m)).toEqual(['d', 'b', 'c', 'a']);
    edits['d'] = { v: 99 };
    version++;
    m.setReader(reader);
    expect(shown(m)).toEqual(['d', 'b', 'c', 'a']);
    m.reapply();
    expect(shown(m)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('keeps indexOf and nodeAt in agreement after sort, filter and transactions', () => {
    const m = make();
    m.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'desc' }], filter: { n: { type: 'text', op: 'notEqual', value: 'zz' } } }));
    m.applyTransaction({ add: [{ id: 'e', v: 5, n: 'x' }], remove: ['b'] });
    for (let i = 0; i < m.displayed.count; i++) {
      const node = m.displayed.nodeAt(m.displayed.index(i)!);
      expect(m.displayed.indexOf(node.key)).toBe(i);
    }
    expect(m.displayed.indexOf(dataKey('b')!)).toBe(-1);
  });

  it('sends one notification per change, and none after destroy', () => {
    const m = make();
    const seen: ModelChange<Row>['kind'][] = [];
    m.subscribe((c) => seen.push(c.kind));
    m.setQuery(makeQuery({ sort: [{ column: 'v', dir: 'asc' }] }));
    m.applyTransaction({ patch: [{ id: 'a', set: { v: -1 } }] });
    m.destroy();
    m.applyTransaction({ patch: [{ id: 'a', set: { v: 7 } }] });
    expect(seen).toEqual(['query', 'rows']);
  });

  it('counts the rows that pass', () => {
    const m = make();
    m.setQuery(makeQuery({ quick: 'x' }));
    expect(m.counts).toEqual({ total: 4, filtered: 2, displayed: 2 });
  });

  it('never writes to the rows it was given', () => {
    const frozen = rows.map((r) => Object.freeze({ ...r }));
    const m = clientRows<Row>({ rows: frozen, getRowId: (r) => r.id, columns: createColumnModel<Row>([{ id: 'v', type: 'number' }]), ctx: localeCtx({ locale: 'en-US' }) });
    m.applyTransaction({ patch: [{ id: 'a', set: { v: 100 } }] });
    expect(frozen[0]!.v).toBe(3);
  });

  it('finds the new value of an updated row with filters and the search box', () => {
    const m = make();
    m.setQuery(makeQuery({ quick: 'y', filter: { n: { type: 'set', include: ['y'] } } }));
    expect(shown(m)).toEqual(['b', 'd']);
    m.applyTransaction({ patch: [{ id: 'a', set: { n: 'y' } }, { id: 'b', set: { n: 'q' } }] });
    expect(shown(m)).toEqual(['a', 'd']);
  });
});

describe('emptying the search box', () => {
  it('releases the search caches and still filters by text afterwards', () => {
    const m = clientRows<{ id: string; n: string }>({
      rows: [{ id: 'a', n: 'Hélène' }, { id: 'b', n: 'Zoé' }],
      getRowId: (r) => r.id,
      columns: createColumnModel([{ id: 'n' }]),
      ctx: localeCtx({ locale: 'fr-FR' }),
    });
    m.setQuery(makeQuery({ quick: 'hel' }));
    expect(m.counts.filtered).toBe(1);
    m.setQuery(makeQuery({ filter: { n: { type: 'text', op: 'contains', value: 'zo' } } }));
    expect(m.counts.filtered).toBe(1);
    expect(m.displayed.nodeAt(m.displayed.index(0)!).id).toBe('b');
  });
});
