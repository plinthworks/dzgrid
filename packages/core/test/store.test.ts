import { describe, it, expect } from 'vitest';
import { createRowStore, dataKey, type RowTransaction } from '@dzgrid/core';
import { flatDisplayed } from '@dzgrid/core/internal';

type Row = { readonly id: string; readonly v: number };

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('the row store', () => {
  it("never writes to the host's arrays or rows", () => {
    const rows = Object.freeze([Object.freeze({ id: 'a', v: 1 }), Object.freeze({ id: 'b', v: 2 })]);
    const s = createRowStore<Row>((r) => r.id);
    s.replaceAll(rows);
    s.apply({ patch: [{ id: 'a', set: { v: 9 } }], add: [Object.freeze({ id: 'c', v: 3 })], remove: ['b'] });
    expect(rows[0]).toEqual({ id: 'a', v: 1 });
    expect(s.snapshot.rows.map((r) => r.v)).toEqual([9, 3]);
  });

  it('builds a new object for a patch and leaves the old one', () => {
    const a = { id: 'a', v: 1 };
    const s = createRowStore<Row>((r) => r.id);
    s.replaceAll([a]);
    s.apply({ patch: [{ id: 'a', set: { v: 2 } }] });
    expect(a.v).toBe(1);
    expect(s.snapshot.rows[0]).not.toBe(a);
  });

  it('keeps an old generation valid after later changes', () => {
    const s = createRowStore<Row>((r) => r.id);
    s.replaceAll([{ id: 'a', v: 1 }, { id: 'b', v: 2 }]);
    const old = s.snapshot;
    s.apply({ remove: ['a'] });
    s.apply({ add: [{ id: 'z', v: 0 }] });
    expect(old.lookup('a')).toBe(0);
    expect(old.lookup('z')).toBe(-1);
    expect(old.rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('keeps the version when nothing applies', () => {
    const s = createRowStore<Row>((r) => r.id);
    s.replaceAll([{ id: 'a', v: 1 }]);
    const v = s.version;
    expect(s.apply({ remove: ['zz'] }).kind).toBe('none');
    expect(s.replaceAll(s.snapshot.rows).kind).toBe('none');
    expect(s.version).toBe(v);
  });

  it('reports a getRowId that throws without its message or the row', () => {
    const s = createRowStore<{ id?: string; secret?: string }>((r) => {
      if (!r.id) throw new Error('boom: ' + r.secret);
      return r.id;
    });
    const r = s.replaceAll([{ secret: 'patient 42' }]);
    expect(r.problems.map((p) => [p.code, p.detail])).toEqual([['invalid-row-id', 'getRowId threw']]);
    expect(JSON.stringify(r.problems)).not.toContain('patient');
  });

  it('finds a node by key', () => {
    const s = createRowStore<Row>((r) => r.id);
    s.replaceAll([{ id: 'a', v: 1 }]);
    expect(s.get(dataKey('a')!)?.data.v).toBe(1);
    expect(s.get(dataKey('zz')!)).toBeUndefined();
  });

  it('agrees with a naive list under 200 random transactions', () => {
    const next = rng(42);
    const s = createRowStore<Row>((r) => r.id);
    let model: Row[] = [];
    let fresh = 0;
    const pickId = () => (model.length && next() < 0.8 ? model[Math.floor(next() * model.length)]!.id : `n${fresh++}`);
    for (let step = 0; step < 200; step++) {
      const tx: { add?: Row[]; addAt?: number; update?: Row[]; patch?: { id: string; set: Partial<Row> }[]; remove?: string[] } = {};
      if (next() < 0.4) tx.remove = Array.from({ length: Math.floor(next() * 3) }, pickId);
      if (next() < 0.5) tx.update = Array.from({ length: Math.floor(next() * 3) }, () => ({ id: pickId(), v: step }));
      if (next() < 0.3) tx.patch = Array.from({ length: Math.floor(next() * 2) }, () => ({ id: pickId(), set: { v: -step } }));
      if (next() < 0.6) tx.add = Array.from({ length: Math.floor(next() * 4) }, () => ({ id: next() < 0.2 ? pickId() : `n${fresh++}`, v: step }));
      if (tx.add && next() < 0.3) tx.addAt = Math.floor(next() * (model.length + 3));
      s.apply(tx as RowTransaction<Row>);

      // The naive model, written from the documented order: remove, update/patch, add.
      const removed = new Set((tx.remove ?? []).filter((id) => model.some((r) => r.id === id)));
      let next2 = model.filter((r) => !removed.has(r.id));
      for (const u of tx.update ?? []) next2 = next2.map((r) => (r.id === u.id ? u : r));
      for (const p of tx.patch ?? []) next2 = next2.map((r) => (r.id === p.id ? { ...r, ...p.set } : r));
      const adds: Row[] = [];
      for (const a of tx.add ?? []) if (!next2.some((r) => r.id === a.id) && !adds.some((r) => r.id === a.id)) adds.push(a);
      const at = Math.min(tx.addAt ?? next2.length, next2.length);
      next2.splice(at, 0, ...adds);
      model = next2;

      expect(s.snapshot.rows.map((r) => [r.id, r.v])).toEqual(model.map((r) => [r.id, r.v]));
      for (const r of model) expect(s.snapshot.lookup(r.id)).toBe(model.indexOf(r));
    }
  });
});

describe('displayed rows', () => {
  const s = createRowStore<Row>((r) => r.id);
  s.replaceAll([{ id: 'a', v: 3 }, { id: 'b', v: 1 }, { id: 'c', v: 2 }]);
  const shown = flatDisplayed(s.snapshot, Uint32Array.of(1, 2, 0), 1);

  it('maps positions to the rows on screen, and back', () => {
    expect(shown.nodeAt(shown.index(0)!).id).toBe('b');
    expect(shown.indexOf(dataKey('a')!)).toBe(2);
    expect(shown.indexOf(dataKey('zz')!)).toBe(-1);
  });

  it('makes a position only from a number in range', () => {
    expect(shown.index(3)).toBeNull();
    expect(shown.index(-1)).toBeNull();
    expect(shown.index(1.5)).toBeNull();
    expect(() => shown.nodeAt(7 as never)).toThrow(RangeError);
  });

  it('steps to the next row in display order', () => {
    expect(shown.nextData(shown.index(0)!, 1)?.id).toBe('c');
    expect(shown.nextData(shown.index(0)!, -1)).toBeNull();
  });

  it('reports -1 for a row filtered out', () => {
    const filtered = flatDisplayed(s.snapshot, Uint32Array.of(2, 0), 2);
    expect(filtered.indexOf(dataKey('b')!)).toBe(-1);
  });
});
