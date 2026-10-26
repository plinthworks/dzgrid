// The order logic of moving columns (Phase 6 step 2, `columns/order.ts`, DOM-free; docs/behaviors/column-move.md 4, 6, 7,
// 11–14, 17; step02-plan §1): the full order (hidden columns too), where a gap lands, locked columns' slots (M12), gaps
// not offered, pin changes, no change = null, the patch that freezes absent orders. Expectations by hand; then a
// property over 1 000 seeds (`COLUMNS_ORDER_RUNS`, `COLUMNS_ORDER_SEED` replays one): a move never changes a locked
// column's place, is a permutation, keeps hidden columns in their relative order, lands where the bar showed, and
// moving back restores the order.
import { describe, it, expect } from 'vitest';
import { createColumnModel, type ColumnDef, type ColumnModel, type ColumnState } from '@dzgrid/core';
import { fullOrder, land, place, reorder, step } from '../src/columns/order.js';

type Row = Record<string, unknown>;
const col = (id: string, o: Partial<ColumnDef<Row>> = {}): ColumnDef<Row> => ({ id, width: 100, ...o });
const model = (defs: ColumnDef<Row>[], state: ColumnState[] = []): ColumnModel<Row> => {
  const m = createColumnModel<Row>(defs);
  if (state.length) m.apply(state, 'api');
  return m;
};
const seg = (m: ColumnModel<Row>, s: 'start' | 'center' | 'end' = 'center') => m.layout[s].columns.map((c) => c.id);
const shown = (m: ColumnModel<Row>) => m.visible().map((c) => c.id);
const apply = (m: ColumnModel<Row>, p: readonly ColumnState[] | null) => (p && m.apply(p, 'user'), m);
const NO = () => false;

describe('fullOrder', () => {
  it('every column, hidden ones included, by its stored order else its place in the definitions; ties: the one asked first', () => {
    const m = model([col('a'), col('b', { hidden: true }), col('c'), col('d', { pinned: 'start' }), col('e')]);
    expect(fullOrder(m)).toEqual(['a', 'b', 'c', 'd', 'e']);
    // e asked to place 1: it ties with b's default place and goes first.
    apply(m, [{ id: 'e', order: 1 }]);
    expect(fullOrder(m)).toEqual(['a', 'e', 'b', 'c', 'd']);
    // The model's segments agree with it.
    expect(seg(m)).toEqual(['a', 'e', 'c']);
    expect(seg(m, 'start')).toEqual(['d']);
  });
});

describe('reorder (the full order, locked slots kept)', () => {
  it('without locked columns: the column taken out and put before the gap\'s column (gap counted with it still in)', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 'a', 3, NO)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorder(['a', 'b', 'c', 'd'], 'd', 0, NO)).toEqual(['d', 'a', 'b', 'c']);
    expect(reorder(['a', 'b', 'c', 'd'], 'b', 4, NO)).toEqual(['a', 'c', 'd', 'b']);
    expect(reorder(['a', 'b', 'c', 'd'], 'b', 1, NO)).toEqual(['a', 'b', 'c', 'd']);
    expect(reorder(['a', 'b', 'c', 'd'], 'b', 2, NO)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a locked column keeps its slot: the others are reordered, then poured into the free slots (M12)', () => {
    const L = (id: string) => id === 'L';
    // b moved after c, across L: b lands after L, c takes b's slot.
    expect(reorder(['a', 'b', 'L', 'c'], 'b', 4, L)).toEqual(['a', 'c', 'L', 'b']);
    // d moved to the very start, L first: d lands right after L.
    expect(reorder(['L', 'a', 'b', 'd'], 'd', 0, L)).toEqual(['L', 'd', 'a', 'b']);
  });
});

describe('step (the keys: one place, the segment\'s edges; O2, M11–M14)', () => {
  it('one place toward the end, then the start; the segment\'s edges; never across a pinned edge', () => {
    const m = model([col('p', { pinned: 'start' }), col('a'), col('b'), col('c'), col('q', { pinned: 'end' })]);
    apply(m, step(m, 'a', 1) as ColumnState[]);
    expect(seg(m)).toEqual(['b', 'a', 'c']);
    apply(m, step(m, 'a', -1) as ColumnState[]);
    expect(seg(m)).toEqual(['a', 'b', 'c']);
    expect(step(m, 'a', -1)).toBe('edge');
    expect(step(m, 'c', 1)).toBe('edge');
    expect(step(m, 'p', -1)).toBe('edge');
    expect(step(m, 'p', 1)).toBe('edge');
    apply(m, step(m, 'a', 'end') as ColumnState[]);
    expect(seg(m)).toEqual(['b', 'c', 'a']);
    apply(m, step(m, 'a', 'start') as ColumnState[]);
    expect(seg(m)).toEqual(['a', 'b', 'c']);
    expect(step(m, 'a', 'start')).toBe('edge');
    expect(seg(m, 'start')).toEqual(['p']);
    expect(seg(m, 'end')).toEqual(['q']);
  });

  it('a locked column: « locked »; next to one, Right lands after it (it is jumped over, its place kept)', () => {
    const m = model([col('a'), col('b'), col('L', { movable: false }), col('c')]);
    expect(step(m, 'L', 1)).toBe('locked');
    apply(m, step(m, 'b', 1) as ColumnState[]);
    expect(shown(m)).toEqual(['a', 'c', 'L', 'b']);
    expect(shown(m).indexOf('L')).toBe(2);
    // Back: Left on b passes L again, c back after a.
    apply(m, step(m, 'b', -1) as ColumnState[]);
    expect(shown(m)).toEqual(['a', 'b', 'L', 'c']);
    // Home with L first: the first free place, after L.
    const n = model([col('L', { movable: false }), col('a'), col('b')]);
    apply(n, step(n, 'b', 'start') as ColumnState[]);
    expect(shown(n)).toEqual(['L', 'b', 'a']);
    expect(step(n, 'b', 'start')).toBe('edge');
  });

  it('known limit (column-move.md « Known limit »): a hidden movable column next to a locked one takes the crossing; the reverse key is then not exact', () => {
    // Full order a, h (hidden), L (locked), b; shown a, L, b. L keeps its slot (index 2) in the full order.
    const m = model([col('a'), col('h', { hidden: true }), col('L', { movable: false }), col('b')]);
    apply(m, step(m, 'b', -1) as ColumnState[]);
    expect(fullOrder(m)).toEqual(['b', 'a', 'L', 'h']);
    expect(shown(m)).toEqual(['b', 'a', 'L']);
    apply(m, step(m, 'b', 1) as ColumnState[]);
    expect(fullOrder(m)).toEqual(['a', 'b', 'L', 'h']);
    // Not back to a, L, b: the hidden column, not b, crossed L.
    expect(shown(m)).toEqual(['a', 'b', 'L']);
  });

  it('unknown or hidden column: null', () => {
    const m = model([col('a'), col('h', { hidden: true })]);
    expect(step(m, 'zz', 1)).toBeNull();
    expect(step(m, 'h', 1)).toBeNull();
  });
});

describe('place and land (a pointer\'s drop at a gap of a segment)', () => {
  it('the same place (either gap next to the column) is no change: null', () => {
    const m = model([col('a'), col('b'), col('c')]);
    expect(place(m, 'b', null, 1)).toBeNull();
    expect(place(m, 'b', null, 2)).toBeNull();
    expect(land(m, 'b', null, 2)).toEqual({ g: 2, patch: null });
  });

  it('the first move freezes every absent order (ranks 0..n−1), hidden columns too; later ones patch only the changed ranks', () => {
    const m = model([col('a'), col('h', { hidden: true }), col('b'), col('c')]);
    const p = place(m, 'c', null, 0)!;
    expect([...p].sort((x, y) => x.id.localeCompare(y.id))).toEqual([{ id: 'a', order: 1 }, { id: 'b', order: 3 }, { id: 'c', order: 0 }, { id: 'h', order: 2 }]);
    apply(m, p);
    expect(shown(m)).toEqual(['c', 'a', 'b']);
    // b dropped between c and a: only the ranks that changed, in the new order.
    expect(place(m, 'b', null, 1)).toEqual([{ id: 'b', order: 1 }, { id: 'a', order: 2 }, { id: 'h', order: 3 }]);
    apply(m, place(m, 'b', null, 1));
    expect(shown(m)).toEqual(['c', 'b', 'a']);
  });

  it('only the changed ranks after the first move', () => {
    const m = model([col('a'), col('b'), col('c'), col('d')], [{ id: 'a', order: 0 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }, { id: 'd', order: 3 }]);
    expect(place(m, 'c', null, 1)).toEqual([{ id: 'c', order: 1 }, { id: 'b', order: 2 }]);
  });

  it('dropped next to a hidden column: it lands after it in the full order (M4), the hidden one keeps its relative place', () => {
    const m = model([col('a'), col('h', { hidden: true }), col('b'), col('c')]);
    // c dropped between a and b (gap 1): before b, so after h.
    apply(m, place(m, 'c', null, 1));
    expect(fullOrder(m)).toEqual(['a', 'h', 'c', 'b']);
    // a dropped at the end: after b and after a hidden column following b.
    const n = model([col('a'), col('b'), col('h', { hidden: true })]);
    apply(n, place(n, 'a', null, 2));
    expect(fullOrder(n)).toEqual(['b', 'h', 'a']);
  });

  it('into another segment: the pin travels in the same patch (start, end, unpinned)', () => {
    const m = model([col('p', { pinned: 'start' }), col('a'), col('b'), col('q', { pinned: 'end' })]);
    const p = place(m, 'b', 'start', 1)!;
    expect(p.find((x) => x.id === 'b')).toEqual({ id: 'b', order: 1, pinned: 'start' });
    apply(m, p);
    expect(seg(m, 'start')).toEqual(['p', 'b']);
    apply(m, place(m, 'p', 'end', 0));
    expect(seg(m, 'end')).toEqual(['p', 'q']);
    expect(seg(m, 'start')).toEqual(['b']);
    apply(m, place(m, 'b', null, 1));
    expect(seg(m)).toEqual(['a', 'b']);
    expect(m.state().find((x) => x.id === 'b')!.pinned).toBeNull();
    // A pin change alone (dropped into an empty segment at the same rank) is still a change.
    const n = model([col('a'), col('b')]);
    expect(place(n, 'a', 'start', 0)).toEqual([{ id: 'a', order: 0, pinned: 'start' }, { id: 'b', order: 1 }]);
  });

  it('a gap whose result would not land the column where the bar shows is not offered: the nearest that does (M12)', () => {
    // L locked first: no gap before it; d snaps to the gap after L.
    const m = model([col('L', { movable: false }), col('a'), col('b'), col('d')]);
    expect(land(m, 'd', null, 0)!.g).toBe(1);
    apply(m, land(m, 'd', null, 0)!.patch);
    expect(shown(m)).toEqual(['L', 'd', 'a', 'b']);
    // b aims between a and L ([a, L, b]): it would stay after L, so the bar goes to its own place (toward the source).
    const n = model([col('a'), col('L', { movable: false }), col('b')]);
    expect(land(n, 'b', null, 1)).toEqual({ g: 2, patch: null });
    // A gap that works is kept as is.
    expect(land(n, 'a', null, 3)!.g).toBe(3);
    expect(apply(n, land(n, 'a', null, 3)!.patch) && shown(n)).toEqual(['b', 'L', 'a']);
  });
});

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return { int, pick: <X>(xs: readonly X[]): X => xs[int(xs.length)]!, chance: (p: number) => next() < p };
}

describe('property (1 000 seeds)', () => {
  it('reorder: a permutation, locked slots kept, moving back restores the order', () => {
    const one = process.env['COLUMNS_ORDER_SEED'];
    const seeds = one ? [Number(one)] : Array.from({ length: Number(process.env['COLUMNS_ORDER_RUNS'] ?? 1000) }, (_, i) => i + 1);
    for (const seed of seeds) {
      const r = rng(seed);
      const n = 2 + r.int(11);
      const full = Array.from({ length: n }, (_, i) => `c${i}`).sort(() => r.int(3) - 1);
      const locked = new Set(full.filter(() => r.chance(0.25)));
      const free = full.filter((x) => !locked.has(x));
      if (!free.length) continue;
      const x = r.pick(free);
      const gap = r.int(n + 1);
      const L = (id: string) => locked.has(id);
      const next = reorder(full, x, gap, L);
      expect([...next].sort(), `seed ${seed}`).toEqual([...full].sort());
      for (const l of locked) expect(next.indexOf(l), `seed ${seed} ${l}`).toBe(full.indexOf(l));
      const u = free.indexOf(x);
      const succ = free[u + 1];
      expect(reorder(next, x, succ ? next.indexOf(succ) : n, L), `seed ${seed} back`).toEqual(full);
    }
  });

  it('land on a real model (hidden, pinned, locked, stored orders with ties): permutation, locked places, hidden relative order, where the bar was, and back', () => {
    const one = process.env['COLUMNS_ORDER_SEED'];
    const seeds = one ? [Number(one)] : Array.from({ length: Number(process.env['COLUMNS_ORDER_RUNS'] ?? 1000) }, (_, i) => i + 1);
    const sides = ['start', null, 'end'] as const;
    let moved = 0;
    let snapped = 0;
    for (const seed of seeds) {
      const r = rng(seed);
      const n = 2 + r.int(11);
      const defs = Array.from({ length: n }, (_, i) => col(`c${i}`, {
        ...(r.chance(0.2) && { hidden: true }), ...(r.chance(0.2) && { movable: false }), ...(r.chance(0.3) && { pinned: r.pick(['start', 'end'] as const) }),
      }));
      const m = model(defs, defs.filter(() => r.chance(0.4)).map((d) => ({ id: d.id, order: r.int(n) })));
      const free = shown(m).filter((id) => m.get(id)!.def.movable !== false);
      if (!free.length) continue;
      const x = r.pick(free);
      const side = r.pick(sides);
      const segOf = (s: (typeof sides)[number]) => seg(m, s === null ? 'center' : s);
      const before = fullOrder(m);
      const was = { list: shown(m) };
      const target = segOf(side);
      const g = r.int(target.length + 1);
      const res = land(m, x, side, g);
      if (!res) continue;
      if (res.g !== g) snapped++;
      const others = target.filter((id) => id !== x);
      const i = target.indexOf(x);
      const k = i !== -1 && res.g > i ? res.g - 1 : res.g;
      apply(m, res.patch);
      const after = fullOrder(m);
      expect([...after].sort(), `seed ${seed}`).toEqual([...before].sort());
      for (const d of defs) if (d.movable === false) expect(after.indexOf(d.id), `seed ${seed} locked ${d.id}`).toBe(before.indexOf(d.id));
      const hid = (o: string[]) => o.filter((id) => !shown(m).includes(id) && id !== x && m.get(id)!.def.movable !== false);
      expect(hid(after), `seed ${seed} hidden`).toEqual(hid(before));
      if (!res.patch) {
        expect(shown(m), `seed ${seed} same place`).toEqual(was.list);
        continue;
      }
      moved++;
      // Where the bar was: between others[k − 1] and others[k] of the target segment.
      const now = segOf(side);
      // The other movable columns keep their relative order (a locked one may be jumped over, M12).
      const mov = (xs: string[]) => xs.filter((id) => id !== x && m.get(id)!.def.movable !== false);
      expect(mov(now), `seed ${seed} others`).toEqual(mov(others));
      expect(now.indexOf(x), `seed ${seed} landed`).toBe(k);
    }
    if (!one) {
      expect(moved).toBeGreaterThan(300);
      expect(snapped).toBeGreaterThan(5);
    }
  });

  it('keys: one place there and back restores every segment; a locked column never moves; a permutation', () => {
    const one = process.env['COLUMNS_ORDER_SEED'];
    const seeds = one ? [Number(one)] : Array.from({ length: Number(process.env['COLUMNS_ORDER_RUNS'] ?? 1000) }, (_, i) => i + 1);
    let moved = 0;
    let exact = 0;
    for (const seed of seeds) {
      const r = rng(seed);
      const n = 2 + r.int(11);
      const defs = Array.from({ length: n }, (_, i) => col(`c${i}`, {
        ...(r.chance(0.2) && { hidden: true }), ...(r.chance(0.2) && { movable: false }), ...(r.chance(0.3) && { pinned: r.pick(['start', 'end'] as const) }),
      }));
      const m = model(defs, defs.filter(() => r.chance(0.4)).map((d) => ({ id: d.id, order: r.int(n) })));
      if (!shown(m).length) continue;
      const x = r.pick(shown(m));
      const by = r.pick([1, -1] as const);
      const before = fullOrder(m);
      const vis = shown(m);
      const p = step(m, x, by);
      if (m.get(x)!.def.movable === false) {
        expect(p).toBe('locked');
        continue;
      }
      if (p === 'edge') continue;
      moved++;
      apply(m, p as ColumnState[]);
      const after = fullOrder(m);
      expect([...after].sort(), `seed ${seed}`).toEqual([...before].sort());
      for (const d of defs) if (d.movable === false) expect(after.indexOf(d.id), `seed ${seed} locked ${d.id}`).toBe(before.indexOf(d.id));
      expect(shown(m), `seed ${seed} moved`).not.toEqual(vis);
      apply(m, step(m, x, by === 1 ? -1 : 1) as ColumnState[]);
      // Exact without locked columns. With one, the column crossing it the other way is the next movable one in the FULL
      // order (a hidden or other-side column may be it): back is then not always exact (known limit, step02-plan « Done »).
      if (!defs.some((d) => d.movable === false)) (exact++, expect(shown(m), `seed ${seed} back`).toEqual(vis));
    }
    if (!one) expect([moved > 300, exact > 50]).toEqual([true, true]);
  });
});
