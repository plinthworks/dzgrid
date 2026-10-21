import { createColumnModel, localeCtx, makeQuery, type ColumnDef, type OperationsInput, type PageOptions, type Problem } from '@dzgrid/core';
import type { ValuesHandle } from '@dzgrid/core';
import { sourceRows, type DataSource, type Json, type SourceRowsOptions } from '@dzgrid/core/server';
import { fakeSource, rowsOf } from '../../../packages/core/test/support/fake-source.js';
import { kindsOf } from '../kinds.js';
import type { Suite } from './index.js';

type Row = { id: string; name: string };

type Step =
  | { op: 'query'; filter?: any; quick?: string; sort?: any[] }
  | { op: 'go'; index: number }
  | { op: 'size'; size: number }
  | { op: 'refresh' | 'purge' | 'destroy' }
  | { op: 'swap'; params?: Record<string, Json> }
  | { op: 'ctx'; locale?: string; timeZone?: string }
  | { op: 'answer'; call: string; rows?: string[]; total?: unknown; hasNext?: unknown; nextCursor?: unknown; response?: unknown }
  | { op: 'fail'; call: string; error: unknown }
  /** A value list opened on a column (named `l1`, `l2`… in order), searched, closed; its calls `v1`, `v2`… answered or failed. */
  | { op: 'values'; column: string; search?: string; max?: number }
  | { op: 'search'; list: string; text: string }
  | { op: 'close'; list: string }
  | { op: 'valuesAnswer'; call: string; response: unknown }
  | { op: 'valuesFail'; call: string; error: unknown };

export interface SourceInput {
  columns: ColumnDef<Row>[];
  operations?: OperationsInput;
  pagination?: PageOptions;
  timeZone?: string;
  /** Custom filter kinds from the fixture table (`conformance/runner/kinds.ts`). */
  kinds?: string[];
  options?: SourceRowsOptions;
  steps: Step[];
}

const shape = (ps: readonly Problem[]) => ps.map((p) => ({ code: p.code, severity: p.severity, path: p.path }));
const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

/**
 * A script against a source model over a fake source: calls are named c1, c2…
 * in order, answered or failed by name (synchronously). What was asked, what
 * was aborted, the kinds of the changes, and the state at the end.
 */
export function runSource(input: SourceInput) {
  const lists: ValuesHandle[] = [];
  const fake = fakeSource({ values: input.steps.some((st) => st.op === 'values') });
  const data = fake.source as DataSource<Row>;
  const model = sourceRows<Row>(data, input.options).create({
    getRowId: (r) => r.id,
    columns: createColumnModel<Row>(input.columns),
    ctx: localeCtx({ locale: 'en-US', ...(input.timeZone && { timeZone: input.timeZone }) }),
    ...(input.operations && { operations: input.operations }),
    ...(input.pagination && { page: input.pagination }),
    abort: fake.abort,
    ...(input.kinds && { filterKinds: kindsOf(input.kinds)! }),
  });
  const changes: string[] = [];
  const failures: { error: unknown; page: number | null }[] = [];
  model.subscribe((c) => {
    changes.push(c.kind);
    if (c.failure) failures.push({ error: c.failure.error, page: c.failure.page });
  });
  const vcall = (name: string) => {
    const c = fake.valueCalls.find((x) => x.name === name);
    if (!c) throw new Error(`no call ${name}`);
    return c;
  };
  const list = (name: string) => lists[Number(name.slice(1)) - 1]!;
  const call = (name: string) => {
    const c = fake.calls.find((x) => x.name === name);
    if (!c) throw new Error(`no call ${name}`);
    return c;
  };
  for (const s of input.steps) {
    switch (s.op) {
      case 'query':
        model.setQuery(makeQuery({ filter: s.filter ?? {}, quick: s.quick ?? '', sort: s.sort ?? [] }), 'user');
        break;
      case 'go':
        model.setPage({ index: s.index }, 'user');
        break;
      case 'size':
        model.setPage({ size: s.size }, 'user');
        break;
      case 'refresh':
        model.invalidate();
        break;
      case 'purge':
        model.invalidate({ purge: true });
        break;
      case 'destroy':
        model.destroy();
        break;
      case 'swap':
        model.setSource(sourceRows<Row>(data, { ...input.options, ...(s.params && { params: s.params }) }), 'host');
        break;
      case 'ctx':
        model.setContext(localeCtx({ locale: s.locale ?? 'en-US', ...(s.timeZone && { timeZone: s.timeZone }) }), 'host');
        break;
      case 'answer':
        call(s.call).resolve('response' in s ? s.response : { rows: rowsOf(s.rows ?? []), ...pick(s, ['total', 'hasNext', 'nextCursor']) });
        break;
      case 'fail':
        call(s.call).reject(s.error);
        break;
      case 'values':
        lists.push(model.setValues!(s.column, { ...(s.search !== undefined && { search: s.search }), ...(s.max !== undefined && { max: s.max }) }));
        break;
      case 'search':
        list(s.list).search(s.text);
        break;
      case 'close':
        list(s.list).close();
        break;
      case 'valuesAnswer':
        vcall(s.call).resolve(s.response);
        break;
      case 'valuesFail':
        vcall(s.call).reject(s.error);
        break;
    }
  }
  const d = model.displayed;
  const p = model.page;
  return {
    calls: fake.calls.map((c) => {
      const r = c.req;
      return {
        name: c.name,
        ...(r.page && { page: r.page }),
        ...(r.filter && Object.keys(r.filter).length > 0 && { filter: r.filter }),
        ...(r.quick !== undefined && { quick: r.quick }),
        ...(r.sort && r.sort.length > 0 && { sort: r.sort }),
        ...(Object.keys(r.params).length > 0 && { params: r.params }),
      };
    }),
    aborted: fake.aborted,
    changes,
    final: {
      status: model.status.phase,
      displayed: Array.from({ length: d.count }, (_, i) => String((d.nodeAt(d.index(i)!) as { id: unknown }).id)),
      page: p && { index: p.index, size: p.size, total: p.total, pageCount: p.pageCount, hasNext: p.hasNext, canJump: p.canJump },
      counts: model.counts,
    },
    problems: shape(model.problems),
    failures,
    // Only for a script that opens value lists: the other cases keep their shape.
    ...(lists.length > 0 && {
      valueCalls: fake.valueCalls.map((c) => {
        const { signal, key, ...rest } = c.req;
        return { name: c.name, ...rest };
      }),
      lists: lists.map((h) => ({ status: h.status, result: h.result, ...(h.problems.length > 0 && { problems: shape(h.problems) }) })),
    }),
  };
}

export const source: Record<string, Suite> = {
  'source-model': (input: SourceInput) => runSource(input),
};
