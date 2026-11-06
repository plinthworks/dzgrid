import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, dataKey, idOfDataKey, localeCtx, type DisplayedRows, type RowKey } from '@dzgrid/core';
import { dropPlace, moveRows, movingRows, nextPlace, placeOf, unchanged, type MoveStep, type RowDrop } from '@dzgrid/core/row-drag';
import { treeShape } from '@dzgrid/core/tree';
import { rng } from './support/spans.js';

/**
 * `@dzgrid/core/row-drag` over 1 000 seeds each (Phase 9, row-drag-plan.md R1, row-move.md): random flat lists and
 * `parentId` trees shown through the real client model (every parent open). Oracles written from the data, never from
 * the rules under test: a move then its opposite gives the list back; a managed move keeps every object (the same ones,
 * one each); every place the drag or the keys offer changes what shows, and a place `unchanged` calls a no-op changes
 * nothing; a tree never gets a cycle (no row under itself) and keeps every row.
 */
type R = { id: string; p: string | null };
const K = (id: string): RowKey => dataKey(id)!;
const ids = (rows: readonly R[]) => rows.map((r) => r.id).join(',');
const parentsOk = (rows: readonly R[]): boolean => {
  const by = new Map(rows.map((r) => [r.id, r]));
  return rows.every((r) => {
    let p = r.p;
    for (let n = 0; p !== null; n++) {
      if (n > rows.length || p === r.id) return false;
      p = by.get(p)?.p ?? null;
    }
    return true;
  });
};

function shown(rows: readonly R[], tree: boolean): DisplayedRows<R> {
  const columns = createColumnModel<R>([{ id: 'id' }]);
  const m = clientRows<R>({ rows, getRowId: (x) => x.id, columns, ctx: localeCtx({ locale: 'en-US' }), ...(tree && { shape: treeShape<R>({ parentId: (x) => x.p, initial: 'all' }) }) });
  return m.displayed;
}
/** What shows of a list: the ids in display order, with each one's parent in a tree. */
const view = (rows: readonly R[], tree: boolean): string => {
  const d = shown(rows, tree);
  return Array.from({ length: d.count }, (_, i) => {
    const n = d.nodeAt(d.index(i)!);
    return n.kind === 'data' ? `${(n.data as R).id}<${(n.data as R).p ?? ''}` : '?';
  }).join(',');
};
const opts = { parentId: (r: R) => r.p, setParent: (r: R, p: string | number | null): R => ({ ...r, p: p === null ? null : String(p) }) };

function flat(seed: number): R[] {
  const r = rng(seed);
  return Array.from({ length: 1 + r.int(10) }, (_, i) => ({ id: `r${i}`, p: null }));
}
function tree(seed: number): R[] {
  const r = rng(seed);
  const rows: R[] = [];
  const add = (p: string | null, depth: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const id = `${p ?? 'r'}.${i}`;
      rows.push({ id, p });
      if (depth < 3 && r.next() < 0.4) add(id, depth + 1, 1 + r.int(3));
    }
  };
  add(null, 0, 1 + r.int(4));
  // The application's order mixes levels (a parentId list is flat): shuffled, the tree shows the same.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = r.int(i + 1);
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
  }
  return rows;
}

describe('a flat list (1 000 seeds)', () => {
  it('a move then its opposite gives the list back; every object kept, once', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const rows = flat(seed);
      const r = rng(seed * 7);
      const i = r.int(rows.length);
      const k = rows[i]!;
      const others = rows.filter((x) => x !== k);
      const t: RowDrop = others.length && r.next() < 0.8 ? { key: K(r.pick(others).id), where: r.pick(['before', 'after'] as const) } : { key: null, where: 'after' };
      const moved = moveRows(rows, { keys: [K(k.id)], target: t }, (x) => x.id);
      expect(new Set(moved).size, `${seed}`).toBe(rows.length);
      expect(moved.every((x) => rows.includes(x)), `${seed}`).toBe(true);
      // The opposite: back after the row it followed, or before the one it led.
      const back: RowDrop = i > 0 ? { key: K(rows[i - 1]!.id), where: 'after' } : rows.length > 1 ? { key: K(rows[1]!.id), where: 'before' } : { key: null, where: 'after' };
      expect(ids(moveRows(moved, { keys: [K(k.id)], target: back }, (x) => x.id)), `${seed}`).toBe(ids(rows));
    }
  });

  it('every place the drag or the keys offer changes the order; a no-op place changes nothing', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const rows = flat(seed);
      const d = shown(rows, false);
      const r = rng(seed * 13);
      const keys = movingRows(d, rows.filter(() => r.next() < 0.3).map((x) => K(x.id)));
      if (!keys.length) continue;
      const tries: (RowDrop | null)[] = [dropPlace(d, r.int(d.count), r.next(), keys, false)];
      for (const by of [-1, 1, 'start', 'end'] as MoveStep[]) tries.push(nextPlace(d, keys, keys[0]!, by, false));
      for (const t of tries) if (t) expect(ids(moveRows(rows, { keys, target: t }, (x) => x.id)), `${seed}`).not.toBe(ids(rows));
      const any: RowDrop = { key: K(r.pick(rows).id), where: r.pick(['before', 'after'] as const) };
      if (!keys.includes(any.key!) && unchanged(d, keys, any, false)) expect(ids(moveRows(rows, { keys, target: any }, (x) => x.id)), `${seed}`).toBe(ids(rows));
    }
  });
});

describe('a parentId tree (1 000 seeds)', () => {
  it('a place offered changes what shows, never makes a cycle, keeps every row; a no-op place changes nothing', () => {
    let offered = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const rows = tree(seed);
      const d = shown(rows, true);
      const r = rng(seed * 31);
      const keys = movingRows(d, rows.filter(() => r.next() < 0.25).map((x) => K(x.id)));
      if (!keys.length) continue;
      const before = view(rows, true);
      const tries: (RowDrop | null)[] = [dropPlace(d, r.int(d.count), r.next(), keys, true), dropPlace(d, r.int(d.count), 0.5, keys, true)];
      for (const by of [-1, 1, 'start', 'end', 'in', 'out'] as MoveStep[]) tries.push(nextPlace(d, keys, keys[0]!, by, true));
      for (const t of tries) {
        if (!t) continue;
        offered++;
        const out = moveRows(rows, { keys, target: t }, (x) => x.id, opts);
        expect(out.length, `${seed}`).toBe(rows.length);
        expect(new Set(out.map((x) => x.id)).size, `${seed}`).toBe(rows.length);
        expect(parentsOk(out), `${seed} ${JSON.stringify(t)}`).toBe(true);
        expect(view(out, true), `${seed} ${JSON.stringify(t)}`).not.toBe(before);
        // Every moved row lands under the place's parent.
        const want = t.where === 'inside' ? t.key : t.key === null ? null : d.parentOf!(t.key);
        for (const k of keys) expect(out.find((x) => K(x.id) === k)!.p, `${seed}`).toBe(want === null ? null : idOfDataKey(want));
      }
      const any: RowDrop = { key: K(r.pick(rows).id), where: r.pick(['before', 'after', 'inside'] as const) };
      const under = (k: RowKey) => { for (let x: RowKey | null = k; x !== null; x = d.parentOf!(x)) if (keys.includes(x)) return true; return false; };
      if (!under(any.key!) && unchanged(d, keys, any, true)) expect(view(moveRows(rows, { keys, target: any }, (x) => x.id, opts), true), `${seed}`).toBe(before);
    }
    expect(offered).toBeGreaterThan(2000);
  });

  it('a place for a sentence: n of total among the siblings, the level from 1', () => {
    // r1 (a, b), r2: by hand.
    const rows: R[] = [{ id: 'r1', p: null }, { id: 'a', p: 'r1' }, { id: 'b', p: 'r1' }, { id: 'r2', p: null }];
    const d = shown(rows, true);
    expect([placeOf(d, K('a'), true), placeOf(d, K('b'), true), placeOf(d, K('r2'), true), placeOf(d, K('zz'), true)]).toEqual([{ n: 1, total: 2, level: 2 }, { n: 2, total: 2, level: 2 }, { n: 2, total: 2, level: 1 }, null]);
  });
});
