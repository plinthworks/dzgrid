import { describe, it, expect } from 'vitest';
import { resolveColumns, compilePath, createColumnModel, PrefixSums } from '@dzgrid/core';

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('resolveColumns', () => {
  it('refuses a column that cannot work, says where, and keeps the others', () => {
    const { columns, problems } = resolveColumns([
      { id: '' } as never,
      { id: 'a' },
      { id: 'a' },
      { id: 'p', field: 'x..y' },
      { id: 'e', type: 'enum' },
      { id: 'c', type: 'custom' },
      { id: 'n', type: 'number' },
    ]);
    expect(columns.map((c) => c.id)).toEqual(['a', 'n']);
    expect(problems.map((p) => [p.code, p.path])).toEqual([
      ['invalid-column', 'columns[0]'],
      ['duplicate-column-id', 'columns[2]'],
      ['invalid-field-path', 'columns[3].field'],
      ['invalid-column', 'columns[4]'],
      ['invalid-column', 'columns[5]'],
    ]);
  });

  it('reads the id as the field by default, or the given value function', () => {
    const { columns } = resolveColumns<{ a: number; b: number }>([{ id: 'a' }, { id: 'sum', value: (r) => r.a + r.b }]);
    expect(columns[0]!.read({ a: 1, b: 2 })).toBe(1);
    expect(columns[1]!.read({ a: 1, b: 2 })).toBe(3);
  });
});

describe('compilePath', () => {
  it('reads nested fields and gives undefined when one is missing', () => {
    const city = compilePath('address.city')!;
    expect(city({ address: { city: 'Oran' } })).toBe('Oran');
    expect(city({})).toBeUndefined();
    expect(city(null)).toBeUndefined();
  });

  it('refuses prototype keys and empty segments', () => {
    for (const p of ['', 'a..b', '.a', 'a.', '__proto__', 'a.constructor', 'prototype.x']) expect(compilePath(p), p).toBeNull();
  });

  it('never reads what the row only inherits', () => {
    expect(compilePath('toString')!({})).toBeUndefined();
  });
});

describe('column model', () => {
  it('keeps what the user set when the host sends new definitions', () => {
    const m = createColumnModel([{ id: 'a', width: 100 }, { id: 'b', width: 100 }]);
    m.apply([{ id: 'a', width: 150 }], 'user');
    m.setDefs([{ id: 'a', width: 100 }, { id: 'b', width: 120 }]);
    expect(m.layout.center.widths.sizeAt(0)).toBe(150);
    expect(m.layout.center.widths.sizeAt(1)).toBe(120);
  });

  it('counts a version only when something changed', () => {
    const m = createColumnModel([{ id: 'a', width: 100 }]);
    const v = m.version;
    m.setAvailableInline(500);
    expect(m.version).toBe(v);
    m.apply([{ id: 'a', width: 200 }], 'user');
    expect(m.version).toBe(v + 1);
  });

  it('refuses a patch for an unknown column or a bad width, with a problem', () => {
    const m = createColumnModel([{ id: 'a' }]);
    const r = m.apply([{ id: 'zz', width: 10 }, { id: 'a', width: -5 }], 'user');
    expect(r.problems.map((p) => p.code)).toEqual(['unknown-column', 'invalid-column']);
    expect(m.layout.center.widths.sizeAt(0)).toBe(150);
  });

  it('lists visible columns start, centre, end', () => {
    const m = createColumnModel([{ id: 'c' }, { id: 'e', pinned: 'end' }, { id: 's', pinned: 'start' }]);
    expect(m.visible().map((c) => c.id)).toEqual(['s', 'c', 'e']);
  });
});

describe('PrefixSums', () => {
  it('agrees with a plain running total under random updates', () => {
    const next = rng(7);
    const n = 1000;
    const sizes = Array.from({ length: n }, () => Math.floor(next() * 200));
    const ps = new PrefixSums(sizes);
    for (let step = 0; step < 2000; step++) {
      const i = Math.floor(next() * n);
      const v = next() < 0.1 ? 0 : Math.floor(next() * 200);
      ps.set(i, v);
      sizes[i] = v;
      if (step % 100 === 0) {
        let acc = 0;
        for (let k = 0; k <= n; k++) {
          expect(ps.offsetOf(k)).toBe(acc);
          if (k < n) acc += sizes[k]!;
        }
        expect(ps.total).toBe(acc);
        for (let probe = 0; probe < 50; probe++) {
          const off = Math.floor(next() * (acc + 10));
          const i2 = ps.indexAt(off);
          // The largest i with offsetOf(i) <= off, clamped to the last entry.
          let want = 0;
          for (let k = 0; k < n; k++) if (ps.offsetOf(k) <= off) want = k;
          expect(i2).toBe(want);
        }
      }
    }
  });

  it('handles the empty list and refuses sizes that are not sizes', () => {
    const empty = new PrefixSums([]);
    expect(empty.indexAt(10)).toBe(-1);
    expect(empty.total).toBe(0);
    expect(() => new PrefixSums([1, -1])).toThrow(RangeError);
    expect(() => new PrefixSums([1]).set(0, Number.NaN)).toThrow(RangeError);
    expect(new PrefixSums([5]).set(0, 5)).toBe(false);
  });
});
