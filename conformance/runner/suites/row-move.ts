import { dataKey, idOfDataKey, type DataNode, type DisplayedRows, type RowKey, type RowNode } from '@dzgrid/core';
import { dropPlace, moveRows, movingRows, nextPlace, placeOf, type MoveStep, type RowDrop } from '@dzgrid/core/row-drag';
import type { Suite } from './index.js';

/**
 * `@dzgrid/core/row-drag` (Phase 9, docs/behaviors/row-move.md): the rows shown are written by hand in display order —
 * `{ "id": "a", "parent": "p" }` a data row (its parent in a tree), `{ "detail": "a" }` a's detail panel, `{ "group": "g" }`
 * a group row, `{ "loading": "a" }` a's loading row, `{ "id": "x", "pinned": true }` a pinned row. Ids in, ids out.
 */
type Row = { id?: string; parent?: string | null; detail?: string; group?: string; loading?: string; pinned?: boolean };
const K = (id: string): RowKey => dataKey(id)!;
const back = (k: RowKey | null): string | null => (k === null ? null : idOfDataKey(k) ?? k);
const drop = (t: RowDrop | null) => (t === null ? null : { key: back(t.key), where: t.where });

function shown(rows: readonly Row[], tree: boolean): DisplayedRows<unknown> {
  const nodes: RowNode<unknown>[] = rows.map((r): RowNode<unknown> => {
    if (r.detail !== undefined) return { key: `x:${K(r.detail)}` as RowKey, kind: 'detail', level: 0, master: K(r.detail), data: {} };
    if (r.group !== undefined) return { key: `g:${r.group}` as RowKey, kind: 'group', level: 0, label: r.group, path: [r.group] };
    if (r.loading !== undefined) return { key: `l:${K(r.loading)}` as RowKey, kind: 'loading', level: 0, parent: K(r.loading), failed: false };
    return { key: K(r.id!), kind: 'data', level: 0, id: r.id!, data: {}, ...(r.pinned && { pinned: 'top' as const }) } as DataNode<unknown>;
  });
  const parents = new Map(rows.filter((r) => r.id !== undefined).map((r) => [K(r.id!), r.parent ? K(r.parent) : null] as const));
  return {
    version: 1,
    count: nodes.length,
    nodeAt: (i) => nodes[i]!,
    keyAt: (i) => nodes[i]!.key,
    // never: plain numbers as the branded index (a fake displayed list, by hand)
    indexOf: (k) => nodes.findIndex((n) => n.key === k) as never,
    index: (n) => (Number.isInteger(n) && n >= 0 && n < nodes.length ? (n as never) : null), // never: as above
    nextData: () => null,
    ...(tree && { parentOf: (k: RowKey) => parents.get(k) ?? null }),
  };
}

export const rowMove: Record<string, Suite> = {
  /**
   * `shown` the rows in display order, `tree`; each step one of: `{ "drop": [i, frac], "moving": [ids] }` (dropPlace),
   * `{ "next": by, "keys": [ids], "focus": id }` (nextPlace), `{ "moving": [ids] }` alone (movingRows), `{ "place": id }`
   * (placeOf). Expected per step: a place `{ key, where }` or null; ids; `{ n, total, level }` or null.
   */
  'row-move': (input) => {
    const tree = !!input.tree;
    const d = shown(input.shown as Row[], tree);
    const steps = input.steps as { drop?: [number, number]; moving?: string[]; next?: MoveStep; keys?: string[]; focus?: string; place?: string }[];
    return {
      steps: steps.map((s) => {
        if (s.drop) return drop(dropPlace(d, s.drop[0], s.drop[1], movingRows(d, s.moving!.map(K)), tree));
        if (s.next !== undefined) return drop(nextPlace(d, movingRows(d, s.keys!.map(K)), K(s.focus!), s.next, tree));
        if (s.place !== undefined) return placeOf(d, K(s.place), tree);
        return movingRows(d, s.moving!.map(K)).map(back);
      }),
    };
  },
  /**
   * `moveRows`: `rows` the application's (`{ id, parent? }`), `tree` (read and write `parent`), each move `{ keys, target:
   * { key, where } }` applied to the rows so far. Expected per move: the rows as `id` or `id<parent` (a tree).
   */
  'row-move-apply': (input) => {
    type A = { id: string; parent?: string | null };
    const tree = !!input.tree;
    let rows = (input.rows as A[]).map((r) => ({ ...r }));
    const given = new Set(rows);
    const out: string[][] = [];
    for (const m of input.moves as { keys: string[]; target: { key: string | null; where: 'before' | 'after' | 'inside' } }[]) {
      rows = moveRows(rows, { keys: m.keys.map(K), target: { key: m.target.key === null ? null : K(m.target.key), where: m.target.where } }, (r) => r.id, tree ? { parentId: (r) => r.parent, setParent: (r, p) => ({ ...r, parent: p === null ? null : String(p) }) } : {});
      out.push(rows.map((r) => (tree ? `${r.id}<${r.parent ?? ''}` : r.id)));
    }
    // The rows a flat move never copies: every object the application gave is still there.
    return { rows: out, ...(!tree && { same: rows.every((r) => given.has(r)) }) };
  },
};
