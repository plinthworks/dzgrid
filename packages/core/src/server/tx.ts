import type { ModelEnv } from '../model/client.js';
import type { ChangeSource } from '../model/types.js';
import { problem, type Problem } from '../problems.js';
import { dataKey, type RowKey } from '../ids.js';
import type { RowTransaction, TransactionResult } from '../row/store.js';
import type { BlockStore } from './blocks.js';

/** A row held in a block: a data row (`data`), or anything else a key names (a group, a footer), never updated. */
type Held = { readonly key: RowKey; readonly kind: string; readonly data?: unknown } | null;

export interface TxHooks<R extends Held> {
  readonly store: BlockStore<R>;
  /** Where each row held is: its block. */
  readonly index: ReadonlyMap<RowKey, number>;
  /** The model's one commit (one change per call). */
  commit(fn: () => void, source: ChangeSource): void;
  /** Inside the commit: the keys updated in place, whether rows were added or removed, what the batch told. */
  changed(updated: RowKey[], moved: boolean, told: Problem[]): void;
  /** The displayed rows' version once committed (each result's). */
  version(): number;
  dead(): boolean;
}

/**
 * A host's live changes on a list held in blocks (D11, row-transactions-async.md; the infinite and the server-side models
 * share it): `update` / `patch` replace the rows held in place (a new object for a patch), a row not held is left to the
 * server; `add` / `remove` are the model's to answer (it asks its window again). `applyTransactionAsync` gathers what
 * arrives within `ms` or before the next frame, whichever comes first, into one commit; `done` per transaction, in order.
 * Internal.
 */
export function heldTransactions<T, R extends Held>(env: ModelEnv<T>, ms: number, h: TxHooks<R>) {
  const take = (t: RowTransaction<T>, updated: RowKey[], bad: Problem[]): boolean => {
    const find = (key: RowKey | null): Held => {
      const n = key ? h.index.get(key) : undefined;
      return (n === undefined ? undefined : h.store.blocks.get(n)?.rows?.find((x) => x?.key === key && x.kind === 'data')) ?? null;
    };
    const put = (row: T, path: string): void => {
      let id: unknown;
      try {
        id = env.getRowId(row);
      } catch {}
      const key = dataKey(id);
      if (!key) return void bad.push(problem('invalid-row-id', 'error', path));
      const b = find(key) && h.store.blocks.get(h.index.get(key)!);
      if (!b?.rows) return;
      b.rows = b.rows.map((x) => (x?.key === key ? ({ ...x, data: row } as R) : x));
      updated.push(key);
    };
    t.update?.forEach((r, i) => put(r, `update[${i}]`));
    t.patch?.forEach((p, i) => {
      const key = dataKey(p.id);
      if (!key) return void bad.push(problem('invalid-row-id', 'error', `patch[${i}]`));
      const node = find(key);
      if (node) put({ ...(node.data as T), ...p.set } as T, `patch[${i}]`);
    });
    return !!(t.add?.length || t.remove?.length);
  };
  /** The transactions applied in one commit: one result each. */
  const apply = (q: readonly RowTransaction<T>[], source: ChangeSource): TransactionResult[] => {
    const out: [RowKey[], boolean, Problem[]][] = [];
    h.commit(() => {
      for (const t of q) {
        const u: RowKey[] = [];
        const bad: Problem[] = [];
        out.push([u, take(t, u, bad), bad]);
      }
      h.changed(out.flatMap((x) => x[0]), out.some((x) => x[1]), out.flatMap((x) => x[2]));
    }, source);
    return out.map(([updated, moved, problems]) => ({ kind: updated.length || moved ? 'delta' : 'none', version: h.version(), added: [], updated, removed: [], problems }));
  };
  let batch: [RowTransaction<T>, ((r: TransactionResult) => void) | undefined][] = [];
  let off: (() => void) | null = null;
  const flush = (): void => {
    off?.();
    off = null;
    const q = batch;
    batch = [];
    if (!q.length || h.dead()) return;
    const r = apply(q.map((x) => x[0]), 'data');
    q.forEach(([, done], i) => done?.(r[i]!));
  };
  return {
    apply: (t: RowTransaction<T>, source: ChangeSource): TransactionResult => apply([t], source)[0]!,
    async(t: RowTransaction<T>, done?: (r: TransactionResult) => void): void {
      if (h.dead()) return;
      batch.push([t, done]);
      if (!env.timer && !env.frame) return flush();
      if (batch.length > 1) return;
      // `ms` or the next frame, whichever comes first (Q-TX A): the first cancels the other.
      off = env.timer?.(flush, ms) ?? null;
      env.frame?.(flush);
    },
    stop(): void {
      off?.();
      batch = [];
    },
  };
}
