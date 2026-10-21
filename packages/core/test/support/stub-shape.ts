import { dataKey, groupKey, detailKey, type DisplayedRows, type DisplayIndex, type RowKey, type RowNode, type RowShape, type ShapeInput } from '@dzgrid/core';
import type { RowSnapshot } from '@dzgrid/core/internal';

/**
 * A shape written for the base's tests (step 2), before `@dzgrid/core/tree`: rows with a parent id
 * in `p`, flattened by plain recursion over the order it is given. `extra` adds rows that are not
 * data (a filler before the first row, a detail after it) to test the non-data rules.
 */
export type SR = { id: string; p?: string; n: number; t?: string };

export function stubShape(o: { extra?: boolean } = {}) {
  const calls: ShapeInput<SR>[] = [];
  let last: { open: (k: RowKey) => boolean } | null = null;
  const parentsOf = (snap: RowSnapshot<SR>) => {
    const kids = new Map<string, number[]>();
    for (let i = 0; i < snap.count; i++) {
      const p = snap.rows[i]!.p ?? '';
      if (p) (kids.get(p) ?? kids.set(p, []).get(p)!).push(i);
    }
    return kids;
  };
  const levelOf = (snap: RowSnapshot<SR>, src: number): number => {
    let l = 0;
    for (let p = snap.rows[src]!.p; p; p = snap.rows[snap.lookup(p) as number]?.p) l++;
    return l;
  };
  const shape: RowShape<SR> & { calls: typeof calls } = {
    kind: 'tree',
    calls,
    get problems() { return []; },
    parents(snap, depth) {
      const kids = parentsOf(snap);
      const out: RowKey[] = [];
      for (const id of kids.keys()) {
        const src = snap.lookup(id);
        if (src >= 0 && levelOf(snap, src) < depth) out.push(dataKey(id)!);
      }
      return out;
    },
    isOpen: (key) => last?.open(key) ?? false,
    build(i) {
      calls.push(i);
      const { snap } = i;
      const order = i.order ? [...i.order] : [...Array(snap.count).keys()];
      const open = (k: RowKey) => i.layer?.get(k) ?? i.expansion.has(k);
      last = { open };
      const rows: RowNode<SR>[] = [];
      const walk = (parent: string, level: number) => {
        for (const src of order) {
          const r = snap.rows[src]!;
          if ((r.p ?? '') !== parent) continue;
          rows.push({ ...snap.nodeAt(src as never), level });
          if (open(dataKey(r.id)!)) walk(r.id, level + 1);
        }
      };
      walk('', 0);
      if (o.extra && rows.length) {
        const first = rows[0]!;
        rows.unshift({ key: groupKey(['folder']), kind: 'group', level: 0, label: 'folder', path: ['folder'] });
        rows.splice(2, 0, { key: detailKey(first.key), kind: 'detail', level: 1, master: first.key, data: (first as { data: SR }).data });
      }
      const at = (n: number) => {
        if (!Number.isInteger(n) || n < 0 || n >= rows.length) throw new RangeError(`no displayed row ${n}`);
        return rows[n]!;
      };
      const d: DisplayedRows<SR> = {
        version: i.version,
        count: rows.length,
        ...(o.extra && { dataCount: rows.filter((r) => r.kind === 'data').length }),
        nodeAt: (n) => at(n),
        keyAt: (n) => at(n).key,
        index: (n) => (Number.isInteger(n) && n >= 0 && n < rows.length ? (n as DisplayIndex) : null),
        indexOf: (k) => rows.findIndex((r) => r.key === k) as DisplayIndex | -1,
        nextData(n, delta) {
          for (let j = n + delta; j >= 0 && j < rows.length; j += delta) if (rows[j]!.kind === 'data') return rows[j] as never;
          return null;
        },
        parentOf(k) {
          const src = snap.lookup(k.slice(k.indexOf(':', 2) + 1));
          const p = src < 0 ? '' : snap.rows[src]!.p ?? '';
          return p ? dataKey(p) : null;
        },
        levelAt: (n) => at(n).level,
      };
      return d;
    },
  };
  return shape;
}
