import { describe, it, expect } from 'vitest';
import { createRowStore, createColumnModel, localeCtx, NO_OVERLAY, ColumnCache, compileFilter, filterIndices, resolveInstantRange, type FilterModel } from '@dzgrid/core';

type Row = { id: string; t: string | null; n: unknown; d: string | null };

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function setup(rows: Row[]) {
  const store = createRowStore<Row>((r) => r.id);
  store.replaceAll(rows);
  const columns = createColumnModel<Row>([{ id: 't' }, { id: 'n', type: 'number' }, { id: 'd', type: 'day' }]);
  const cache = new ColumnCache<Row>();
  const env = () => ({ source: store.snapshot, columns, ctx: localeCtx({ locale: 'fr-FR' }), reader: NO_OVERLAY, cache });
  const ids = (m: FilterModel) => {
    const o = filterIndices(store.snapshot.count, [compileFilter(m, env())]);
    return o ? [...o].map((i) => store.snapshot.ids[i]!) : [...store.snapshot.ids];
  };
  return { store, cache, env, ids };
}

describe('negations', () => {
  it('are exact complements of their operator, blanks included (D4)', () => {
    const next = rng(5);
    const words = ['Éric', 'eric', 'zoé', 'محمد', 'مُحَمَّد', '', null, '  ', 'abc'];
    const rows: Row[] = Array.from({ length: 300 }, (_, i) => ({
      id: String(i),
      t: words[Math.floor(next() * words.length)]!,
      n: next() < 0.1 ? null : next() < 0.05 ? 'x' : Math.floor(next() * 10),
      d: next() < 0.1 ? null : `2026-03-0${1 + Math.floor(next() * 9)}`,
    }));
    const h = setup(rows);
    const all = new Set(rows.map((r) => r.id));
    const pairs: [FilterModel, FilterModel][] = [
      [{ t: { type: 'text', op: 'contains', value: 'eri' } }, { t: { type: 'text', op: 'notContains', value: 'eri' } }],
      [{ t: { type: 'text', op: 'equals', value: 'محمد' } }, { t: { type: 'text', op: 'notEqual', value: 'محمد' } }],
      [{ t: { type: 'text', op: 'blank' } }, { t: { type: 'text', op: 'notBlank' } }],
      [{ n: { type: 'number', op: 'equals', value: 5 } }, { n: { type: 'number', op: 'notEqual', value: 5 } }],
      [{ n: { type: 'number', op: 'blank' } }, { n: { type: 'number', op: 'notBlank' } }],
      [{ d: { type: 'day', op: 'equals', value: '2026-03-05' } }, { d: { type: 'day', op: 'notEqual', value: '2026-03-05' } }],
    ];
    for (const [a, b] of pairs) {
      const x = h.ids(a);
      const y = h.ids(b);
      expect(new Set([...x, ...y])).toEqual(all);
      expect(x.filter((id) => y.includes(id))).toEqual([]);
    }
  });
});

describe('the fold cache', () => {
  it('is built once per column and generation, and reused by a second filter', () => {
    const rows: Row[] = Array.from({ length: 100 }, (_, i) => ({ id: String(i), t: `Élodie ${i}`, n: i, d: null }));
    const h = setup(rows);
    h.ids({ t: { type: 'text', op: 'contains', value: 'elo' } });
    h.ids({ t: { type: 'text', op: 'startsWith', value: 'élodie 1' } });
    expect(h.cache.stats.foldBuilds).toBe(1);
  });
});

describe('filterIndices', () => {
  it('returns null when nothing filters, and keeps the order it is given', () => {
    const h = setup([{ id: 'a', t: 'x', n: 1, d: null }, { id: 'b', t: 'y', n: 2, d: null }]);
    expect(filterIndices(2, [compileFilter({}, h.env())])).toBeNull();
    const f = compileFilter({ n: { type: 'number', op: 'gte', value: 1 } }, h.env());
    expect([...filterIndices(2, [f], Uint32Array.of(1, 0))!]).toEqual([1, 0]);
  });
});

describe('resolveInstantRange', () => {
  it('resolves days in the zone once, half-open', () => {
    const r = resolveInstantRange({ type: 'instant', op: 'onDay', day: '2026-03-29' }, 'Europe/Paris');
    expect(r.range).toEqual({ from: Date.UTC(2026, 2, 28, 23), to: Date.UTC(2026, 2, 29, 22) });
  });

  it('reports a bad day or an offset-less moment at its path', () => {
    expect(resolveInstantRange({ type: 'instant', op: 'onDay', day: '2026-02-30' }, 'UTC', 'filter.t').problems.map((p) => [p.code, p.path])).toEqual([['invalid-day', 'filter.t.day']]);
    expect(resolveInstantRange({ type: 'instant', op: 'between', at: '2026-03-05T10:00', atTo: '2026-03-06T10:00Z' }, 'UTC', 'filter.t').problems.map((p) => [p.code, p.path])).toEqual([['ambiguous-instant', 'filter.t.at']]);
  });

  it('is inactive while half-typed', () => {
    expect(resolveInstantRange({ type: 'instant', op: 'betweenDays', day: '2026-03-05' }, 'UTC')).toEqual({ range: null, problems: [] });
  });
});
