// Shared fixtures for lazy trees (Phase 4 step 7, docs/behaviors/tree-lazy.md).
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, type AbortHandle, type AbortSignalLike, type GridEvent, type RowKey } from '@dzgrid/core';
import { treeShape, type TreeOptions, type TreeRows } from '@dzgrid/core/tree';
import { lazyShape, type LazyOptions } from '@dzgrid/core/tree-lazy';

/** `p`: the parent's id; `lazy`: children not loaded yet; `n`: a number to sort and filter by. */
export type LR = { id: string; p?: string | null; n: number; lazy?: boolean };
export const k = (id: string): RowKey => dataKey(id)!;
export const lk = (id: string): RowKey => `l:${k(id)}` as RowKey;
export const UTC = localeCtx({ locale: 'en-US' });
export const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

/** One call of the host's loader: the row asked, the signal, the test's hands on the answer. */
export interface Load {
  readonly row: LR;
  readonly signal: AbortSignalLike;
  resolve(rows: unknown): void;
  reject(e: unknown): void;
}

/** A recording abort factory: every handle made, and what aborted it. */
export function aborts() {
  const made: { signal: { aborted: boolean; reason: unknown } }[] = [];
  const make = (): AbortHandle => {
    const signal = { aborted: false, reason: undefined as unknown };
    made.push({ signal });
    return { signal, abort(reason) { if (!signal.aborted) (signal.aborted = true), (signal.reason = reason); } };
  };
  return { made, make };
}

/** The rows shown: a dot per level, the id (`…` loading, `!` failed, under the parent id), pos/size. */
export function shownOf(d: TreeRows<LR>): string[] {
  return Array.from({ length: d.count }, (_, i) => {
    const at = d.index(i)!;
    const node = d.nodeAt(at);
    const name = node.kind === 'loading' ? (node.failed ? '!' : '…') : node.kind === 'data' ? node.id : node.key;
    return `${'. '.repeat(d.levelAt(at))}${String(name)} ${d.posAt(at)}/${d.sizeAt(at)}`;
  });
}

export const ROWS: LR[] = [
  { id: 'a', n: 3, lazy: true },
  { id: 'b', n: 1, lazy: true },
  { id: 'c', n: 2 },
  { id: 'c1', p: 'c', n: 5 },
];

/** A client model with a lazy tree (A): every call of `load` recorded, answered by the test. */
export function setupA(o: { rows?: LR[]; tree?: Partial<TreeOptions<LR>>; lazy?: Partial<LazyOptions<LR>>; noLoad?: boolean } = {}) {
  const columns = createColumnModel<LR>([{ id: 'n', type: 'number' }, { id: 'id' }]);
  const loads: Load[] = [];
  const shape = lazyShape(treeShape<LR>({ parentId: (r) => r.p, ...o.tree }), {
    has: (r) => !!r.lazy,
    ...(!o.noLoad && { load: (row: LR, { signal }: { signal: AbortSignalLike }) => new Promise<readonly LR[]>((resolve, reject) => loads.push({ row, signal, resolve: resolve as (v: unknown) => void, reject })) }),
    ...o.lazy,
  });
  const ab = aborts();
  shape.lazy.abort = ab.make;
  const model = clientRows<LR>({ rows: o.rows ?? ROWS, getRowId: (r) => r.id, columns, ctx: UTC, shape });
  const kernel = createKernel<LR>({ rows: model, columns });
  const events: GridEvent<LR>[] = [];
  kernel.subscribe((e) => events.push(e));
  const d = () => model.displayed as TreeRows<LR>;
  const open = (id: string, expanded = true) => kernel.dispatch({ type: 'rows.expand', rows: [k(id)], expanded }, 'user');
  return { model, kernel, events, shape, loads, aborts: ab, columns, d, shown: () => shownOf(d()), open };
}
