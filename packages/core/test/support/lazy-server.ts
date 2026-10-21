// A server tree for tests (Phase 4 step 7, B, docs/behaviors/tree-lazy.md): roots by `fetch`, children by `children`.
import { createColumnModel, createKernel, type GridEvent, type ModelEnv } from '@dzgrid/core';
import { sourceRows, type ChildRequest, type DataRequest, type DataSource, type SourceRowsOptions } from '@dzgrid/core/server';
import { treeShape, type TreeRows } from '@dzgrid/core/tree';
import { lazyShape } from '@dzgrid/core/tree-lazy';
import { aborts, k, shownOf, UTC, type LR } from './lazy.js';

export interface Req<Q> {
  readonly req: Q;
  resolve(v: unknown): void;
  reject(e: unknown): void;
}

export function setupB(o: { options?: SourceRowsOptions; env?: Partial<ModelEnv<LR>>; children?: boolean } = {}) {
  const fetches: Req<DataRequest>[] = [];
  const kids: Req<ChildRequest<LR>>[] = [];
  const source: DataSource<LR> = {
    fetch: (req) => new Promise((resolve, reject) => fetches.push({ req, resolve: resolve as never, reject })),
    ...(o.children !== false && { children: (req: ChildRequest<LR>) => new Promise((resolve, reject) => kids.push({ req, resolve: resolve as never, reject })) }),
  };
  const columns = createColumnModel<LR>([{ id: 'n', type: 'number' }, { id: 'id' }]);
  const shape = lazyShape(treeShape<LR>({ parentId: (r) => r.p }), { has: (r) => !!r.lazy });
  const ab = aborts();
  const model = sourceRows<LR>(source, o.options).create({ getRowId: (r) => r.id, columns, ctx: UTC, abort: ab.make, shape, ...o.env });
  const kernel = createKernel<LR>({ rows: model, columns });
  const events: GridEvent<LR>[] = [];
  kernel.subscribe((e) => events.push(e));
  const d = () => model.displayed as TreeRows<LR>;
  const open = (id: string, expanded = true) => kernel.dispatch({ type: 'rows.expand', rows: [k(id)], expanded }, 'user');
  return { model, kernel, events, shape, fetches, kids, aborts: ab, columns, d, shown: () => shownOf(d()), open, last: () => kids[kids.length - 1]! };
}
