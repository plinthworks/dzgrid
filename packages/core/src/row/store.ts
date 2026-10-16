import { canonicalId, dataKey, idOfDataKey, type RowIdInput, type RowKey, type SourceIndex } from '../ids.js';
import { problem, type Problem } from '../problems.js';
import type { DataNode } from './node.js';

export interface RowTransaction<T> {
  readonly add?: readonly T[];
  readonly addAt?: number;
  /** Whole rows replaced by identity. */
  readonly update?: readonly T[];
  /** Fields set on a row; a new object is built, the host's row is untouched. */
  readonly patch?: readonly { readonly id: RowIdInput; readonly set: Partial<T> }[];
  readonly remove?: readonly RowIdInput[];
}

export interface TransactionResult {
  /** `reset`: first load, or more than half the rows changed — the key arrays are then empty. */
  readonly kind: 'reset' | 'delta' | 'none';
  readonly version: number;
  readonly added: readonly RowKey[];
  readonly updated: readonly RowKey[];
  readonly removed: readonly RowKey[];
  readonly problems: readonly Problem[];
}

/** One generation of the rows: immutable once published, valid as long as anyone holds it. */
export interface RowSnapshot<T> {
  readonly version: number;
  readonly count: number;
  readonly rows: readonly T[];
  /** Canonical ids, parallel to `rows`. */
  readonly ids: readonly string[];
  /** The source index of an id, or −1. */
  lookup(id: string): SourceIndex | -1;
  keyAt(src: SourceIndex): RowKey;
  nodeAt(src: SourceIndex): DataNode<T>;
}

/** What the last change did to source positions, for the pipeline to patch rather than redo. */
export interface StoreDelta {
  readonly from: number;
  readonly to: number;
  readonly kind: 'reset' | 'update' | 'append' | 'structural' | 'none';
  /** Source indices whose row object changed (update), or the first appended index (append). */
  readonly changedSrc?: Uint32Array;
}

export interface RowStore<T> {
  readonly version: number;
  readonly size: number;
  readonly snapshot: RowSnapshot<T>;
  readonly lastDelta: StoreDelta;
  get(key: RowKey): DataNode<T> | undefined;
  apply(tx: RowTransaction<T>): TransactionResult;
  replaceAll(rows: Iterable<T>): TransactionResult;
}

function snapshot<T>(version: number, rows: readonly T[], ids: readonly string[], index: ReadonlyMap<string, number>): RowSnapshot<T> {
  const count = rows.length;
  return {
    version,
    count,
    rows,
    ids,
    // The Map may be shared with later generations that appended to it: an index
    // past this generation's end, or for another id, is not ours.
    lookup: (id) => {
      const i = index.get(id);
      return i !== undefined && i < count && ids[i] === id ? (i as SourceIndex) : -1;
    },
    keyAt: (src) => dataKey(ids[src]!)!,
    nodeAt: (src) => {
      if (!Number.isInteger(src) || src < 0 || src >= count) throw new RangeError(`no source row ${src}`);
      return { key: dataKey(ids[src]!)!, kind: 'data', level: 0, id: ids[src]!, data: rows[src]! };
    },
  };
}

/**
 * The host's rows, by identity (D1): parallel arrays and an id → index Map,
 * a new generation per change. An update copies the row array only (the ids
 * and the Map are shared); an append shares the Map too; a removal or an
 * insertion at a position rebuilds them — O(n), the non-hot path.
 *
 * Inside one transaction: removals, then updates and patches, then additions.
 * Every refusal is a problem on its entry; the others still apply, in one
 * version. The host's arrays and rows are never written to.
 */
export function createRowStore<T>(getRowId: (row: T) => RowIdInput): RowStore<T> {
  let version = 0;
  let snap = snapshot<T>(0, [], [], new Map());
  let index = new Map<string, number>();
  let lastDelta: StoreDelta = { from: 0, to: 0, kind: 'none' };

  const idOf = (row: unknown): string | null => {
    if (row === null || typeof row !== 'object') return null;
    try {
      return canonicalId(getRowId(row as T));
    } catch {
      return null;
    }
  };
  const idProblem = (row: unknown, path: string): Problem =>
    problem('invalid-row-id', 'error', path, row === null || typeof row !== 'object' ? 'not a row' : safeThrew(row) ? 'getRowId threw' : undefined);
  const safeThrew = (row: unknown): boolean => {
    try {
      getRowId(row as T);
      return false;
    } catch {
      return true;
    }
  };

  const publish = (rows: readonly T[], ids: readonly string[], map: Map<string, number>, delta: Omit<StoreDelta, 'from' | 'to'>, keys: { added: RowKey[]; updated: RowKey[]; removed: RowKey[] }, problems: Problem[], prevCount: number): TransactionResult => {
    const from = version;
    version++;
    index = map;
    snap = snapshot(version, rows, ids, map);
    const changes = keys.added.length + keys.updated.length + keys.removed.length;
    const reset = prevCount === 0 || changes > Math.max(prevCount, rows.length) / 2;
    lastDelta = { from, to: version, ...(reset ? { kind: 'reset' } : delta) } as StoreDelta;
    return reset
      ? { kind: 'reset', version, added: [], updated: [], removed: [], problems }
      : { kind: 'delta', version, ...keys, problems };
  };
  const none = (problems: Problem[]): TransactionResult => {
    lastDelta = { from: version, to: version, kind: 'none' };
    return { kind: 'none', version, added: [], updated: [], removed: [], problems };
  };

  return {
    get version() { return version; },
    get size() { return snap.count; },
    get snapshot() { return snap; },
    get lastDelta() { return lastDelta; },
    get(key) {
      const id = idOfDataKey(key);
      if (id === null) return undefined;
      const i = snap.lookup(id);
      return i === -1 ? undefined : snap.nodeAt(i);
    },

    apply(tx) {
      const problems: Problem[] = [];
      const prev = snap;
      const keys = { added: [] as RowKey[], updated: [] as RowKey[], removed: [] as RowKey[] };

      let addAt: number | undefined = tx.addAt;
      if (addAt !== undefined && (!Number.isInteger(addAt) || addAt < 0)) {
        problems.push(problem('invalid-transaction', 'error', 'addAt'));
        addAt = undefined;
        // Without a valid position the additions are refused too: their place is unknown.
      }
      const addRefused = tx.addAt !== undefined && addAt === undefined;

      const removed = new Set<number>();
      (tx.remove ?? []).forEach((rid, i) => {
        const id = canonicalId(rid);
        const src = id === null ? -1 : prev.lookup(id);
        if (src < 0 || removed.has(src)) return void problems.push(problem('unknown-row-id', 'error', `remove[${i}]`));
        removed.add(src);
        keys.removed.push(dataKey(id!)!);
      });

      const replaced = new Map<number, T>();
      (tx.update ?? []).forEach((row, i) => {
        const id = idOf(row);
        if (id === null) return void problems.push(idProblem(row, `update[${i}]`));
        const src = prev.lookup(id);
        if (src < 0 || removed.has(src)) return void problems.push(problem('unknown-row-id', 'error', `update[${i}]`));
        if (!replaced.has(src)) keys.updated.push(dataKey(id)!);
        replaced.set(src, row);
      });
      (tx.patch ?? []).forEach((p, i) => {
        const id = canonicalId(p?.id);
        const src = id === null ? -1 : prev.lookup(id);
        if (src < 0 || removed.has(src)) return void problems.push(problem('unknown-row-id', 'error', `patch[${i}]`));
        const next = { ...(replaced.get(src) ?? prev.rows[src]!), ...p.set } as T;
        if (idOf(next) !== id) return void problems.push(problem('invalid-transaction', 'error', `patch[${i}]`, 'id changed'));
        if (!replaced.has(src)) keys.updated.push(dataKey(id!)!);
        replaced.set(src, next);
      });

      const adds: { row: T; id: string }[] = [];
      const adding = new Set<string>();
      if (!addRefused) {
        (tx.add ?? []).forEach((row, i) => {
          const id = idOf(row);
          if (id === null) return void problems.push(idProblem(row, `add[${i}]`));
          const existing = prev.lookup(id);
          if ((existing >= 0 && !removed.has(existing)) || adding.has(id)) return void problems.push(problem('duplicate-row-id', 'error', `add[${i}]`));
          adding.add(id);
          adds.push({ row, id });
          keys.added.push(dataKey(id)!);
        });
      }

      if (!removed.size && !replaced.size && !adds.length) return none(problems);

      // Updates and appends only: share what has not moved.
      if (!removed.size && (addAt === undefined || addAt >= prev.count)) {
        const rows = prev.rows.slice();
        for (const [src, row] of replaced) rows[src] = row;
        let ids = prev.ids as string[];
        let map = index;
        if (adds.length) {
          ids = prev.ids.slice();
          for (const a of adds) {
            map.set(a.id, rows.length);
            rows.push(a.row);
            ids.push(a.id);
          }
        }
        const kind = adds.length ? (replaced.size ? 'structural' : 'append') : 'update';
        const changedSrc = kind === 'update' ? Uint32Array.from(replaced.keys()) : kind === 'append' ? Uint32Array.of(prev.count) : undefined;
        return publish(rows, ids, map, { kind, ...(changedSrc && { changedSrc }) }, keys, problems, prev.count);
      }

      // Structural: new arrays and a fresh Map.
      const rows: T[] = [];
      const ids: string[] = [];
      for (let i = 0; i < prev.count; i++) {
        if (removed.has(i)) continue;
        rows.push(replaced.get(i) ?? prev.rows[i]!);
        ids.push(prev.ids[i]!);
      }
      const at = Math.min(addAt ?? rows.length, rows.length);
      rows.splice(at, 0, ...adds.map((a) => a.row));
      ids.splice(at, 0, ...adds.map((a) => a.id));
      const map = new Map<string, number>();
      for (let i = 0; i < ids.length; i++) map.set(ids[i]!, i);
      return publish(rows, ids, map, { kind: 'structural' }, keys, problems, prev.count);
    },

    replaceAll(input) {
      const problems: Problem[] = [];
      const prev = snap;
      const rows: T[] = [];
      const ids: string[] = [];
      const map = new Map<string, number>();
      const keys = { added: [] as RowKey[], updated: [] as RowKey[], removed: [] as RowKey[] };
      let i = 0;
      let sameOrder = true;
      for (const row of input) {
        const at = `rows[${i++}]`;
        const id = idOf(row);
        if (id === null) { problems.push(idProblem(row, at)); continue; }
        if (map.has(id)) { problems.push(problem('duplicate-row-id', 'error', at)); continue; }
        const was = prev.lookup(id);
        if (was < 0) keys.added.push(dataKey(id)!);
        else if (prev.rows[was] !== row) keys.updated.push(dataKey(id)!);
        if (was !== rows.length) sameOrder = false;
        map.set(id, rows.length);
        rows.push(row);
        ids.push(id);
      }
      for (let k = 0; k < prev.count; k++) if (!map.has(prev.ids[k]!)) keys.removed.push(dataKey(prev.ids[k]!)!);
      if (sameOrder && rows.length === prev.count && !keys.added.length && !keys.removed.length) {
        if (!keys.updated.length) return none(problems);
        // Same rows in the same place, some replaced: an update, which caches can patch.
        const changedSrc = Uint32Array.from(keys.updated, (k) => prev.lookup(idOfDataKey(k)!));
        return publish(rows, prev.ids, index, { kind: 'update', changedSrc }, keys, problems, prev.count);
      }
      return publish(rows, ids, map, { kind: 'structural' }, keys, problems, prev.count);
    },
  };
}
