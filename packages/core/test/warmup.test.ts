import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, localeCtx, makeQuery } from '@dzgrid/core';
import { ColumnCache } from '@dzgrid/core/internal';

type R = { id: string; a: string; b: string; e: string; n: number };
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const WORDS = ['Hélène', 'مُحَمَّد', 'Zoé', 'ÉCOLE', 'radio', 'ﻻ', 'Ångström', '', 'Ödön'];
const rows = (n: number, seed = 1): R[] => {
  const r = rng(seed);
  const pick = () => WORDS[Math.floor(r() * WORDS.length)]!;
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, a: `${pick()} ${pick()}`, b: pick(), e: i % 3 ? 'x' : 'y', n: i }));
};
const make = (n = 3000) => {
  const columns = createColumnModel<R>([{ id: 'a' }, { id: 'b' }, { id: 'e', type: 'enum', enumOptions: [{ value: 'x', label: 'Ex' }, { value: 'y', label: 'Why' }] }, { id: 'n', type: 'number' }]);
  return clientRows<R>({ rows: rows(n), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'fr-FR' }) });
};

describe('quick-search warm-up', () => {
  it('builds, in steps of any size, the haystacks a search would build at once', () => {
    for (const size of [1, 7, 500, 1e9]) {
      const warm = make();
      const w = warm.warmSearch();
      let guard = 0;
      while (!w.step(size)) if (++guard > 1e5) throw new Error('never done');
      expect(w.progress).toBe(1);
      const cold = make();
      const words = ['hel', 'محمد', 'ecole', 'why'];
      for (const q of words) {
        warm.setQuery(makeQuery({ quick: q }));
        cold.setQuery(makeQuery({ quick: q }));
        const ids = (m: typeof warm) => Array.from({ length: m.displayed.count }, (_, i) => m.displayed.keyAt(m.displayed.index(i)!));
        expect(ids(warm), `${q} in steps of ${size}`).toEqual(ids(cold));
      }
    }
  });

  it('leaves the first keystroke nothing to build', () => {
    const m = make();
    const w = m.warmSearch();
    while (!w.step(2000));
    const f0 = m.diagnostics.foldBuilds;
    m.setQuery(makeQuery({ quick: 'hel' }));
    expect(m.diagnostics.foldBuilds).toBe(f0);
    expect(m.displayed.count).toBeGreaterThan(0);
  });

  it('gives up, keeping nothing stale, when the rows change mid-way', () => {
    const m = make();
    const w = m.warmSearch();
    w.step(100);
    m.applyTransaction({ update: [{ id: 'r0', a: 'Nouveau', b: 'x', e: 'x', n: 0 }] });
    expect(w.step(1e9)).toBe(true);
    expect(w.progress).toBeLessThan(1);
    m.setQuery(makeQuery({ quick: 'nouveau' }));
    expect(m.displayed.count).toBe(1);
  });

  it('stops on cancel', () => {
    const m = make();
    const w = m.warmSearch();
    w.step(10);
    w.cancel();
    expect(w.step(1e9)).toBe(true);
    expect(w.progress).toBeLessThan(1);
  });

  it('is done at once when there is nothing to warm', () => {
    const m = clientRows<{ id: string; n: number }>({ rows: [{ id: '1', n: 1 }], getRowId: (r) => r.id, columns: createColumnModel([{ id: 'n', type: 'number' }]), ctx: localeCtx({ locale: 'en-US' }) });
    expect(m.warmSearch().step(1)).toBe(true);
    void ColumnCache;
  });
});
