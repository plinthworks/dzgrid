import { createColumnModel, createKernel, dataKey, idOfDataKey, localeCtx, type GridEvent, type OperationsInput } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource, type Json } from '@dzgrid/core/server';
import { fakeSource } from '../../../packages/core/test/support/fake-source.js';
import type { Suite } from './index.js';

/** Rows r1…rN; `v` is "odd" or "even" by the number. */
type Row = { id: string; v: string };

type Op =
  | { op: 'page'; index: number }
  /** The first row alone (a click), then the others added. */
  | { op: 'only'; ids: string[] }
  /** Added (Ctrl+click), each toggled. */
  | { op: 'only-add'; ids: string[] }
  | { op: 'toggle'; id: string }
  /** The selection set as a whole (what the header box sends on browser pages). */
  | { op: 'set'; mode: 'include' | 'exclude'; ids: string[] }
  | { op: 'all' | 'allFiltered' | 'clear' | 'refresh' }
  /** A text `contains` on `v`; null removes it. */
  | { op: 'filter'; column: string; value: string | null }
  | { op: 'quick'; text: string }
  | { op: 'sort'; sort: { column: string; dir: 'asc' | 'desc' }[] }
  | { op: 'setParams'; params: Record<string, Json> }
  | { op: 'zone'; zone: string }
  | { op: 'keepOnFilter'; keep: boolean }
  /** Rows the server no longer has (the next request shows it). */
  | { op: 'serverRemove'; ids: string[] };

/**
 * A server in memory answering at once: `contains` filters, the search on
 * the id, a stable sort on the fields, a page by offset with its
 * total, or the whole set without a page.
 */
function memoryServer(n: number) {
  let data: Row[] = Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, v: (i + 1) % 2 ? 'odd' : 'even' }));
  const reply = (req: DataRequest) => {
    let rows = data.slice();
    for (const [col, f] of Object.entries(req.filter ?? {})) {
      if (f.type === 'text' && f.op === 'contains') rows = rows.filter((r) => String(r[col as keyof Row]).includes(f.value!));
    }
    if (req.quick) rows = rows.filter((r) => r.id.includes(req.quick!));
    for (const s of [...(req.sort ?? [])].reverse()) {
      const sign = s.dir === 'asc' ? 1 : -1;
      rows = rows.map((r, i) => [r, i] as const).sort(([a, i], [b, j]) => {
        const x = a[s.column as keyof Row];
        const y = b[s.column as keyof Row];
        return x < y ? -sign : x > y ? sign : i - j;
      }).map(([r]) => r);
    }
    if (!req.page) return { rows };
    return { rows: rows.slice(req.page.offset, req.page.offset + req.page.size), total: rows.length };
  };
  return { reply, remove: (ids: string[]) => { data = data.filter((r) => !ids.includes(r.id)); } };
}

export const selectionAcross: Record<string, Suite> = {
  'selection-across-pages': ({ rows, pageSize, operations, params, ops }: { rows: number; pageSize: number; operations?: OperationsInput; params?: Record<string, Json>; ops: Op[] }) => {
    const server = memoryServer(rows);
    const fake = fakeSource({ reply: (req) => server.reply(req) });
    const data = fake.source as DataSource<Row>;
    const columns = createColumnModel<Row>([{ id: 'v' }]);
    const model = sourceRows<Row>(data, { ...(params && { params }) }).create({
      getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), abort: fake.abort,
      operations: operations ?? 'server', page: { pageSize },
    });
    const kernel = createKernel<Row>({ rows: model, columns });
    let last: Extract<GridEvent<Row>, { type: 'selectionChanged' }> | null = null;
    kernel.subscribe((e) => { if (e.type === 'selectionChanged') last = e; });
    const k = (id: string) => dataKey(id)!;
    for (const o of ops) {
      switch (o.op) {
        case 'page': kernel.dispatch({ type: 'page.go', index: o.index }, 'user'); break;
        case 'only':
          kernel.dispatch({ type: 'selection.only', row: k(o.ids[0]!) }, 'user');
          for (const id of o.ids.slice(1)) kernel.dispatch({ type: 'selection.toggle', row: k(id) }, 'user');
          break;
        case 'only-add': for (const id of o.ids) kernel.dispatch({ type: 'selection.toggle', row: k(id) }, 'user'); break;
        case 'toggle': kernel.dispatch({ type: 'selection.toggle', row: k(o.id) }, 'user'); break;
        case 'set': kernel.dispatch({ type: 'selection.set', selection: { mode: o.mode, keys: new Set(o.ids.map(k)) } }, 'user'); break;
        case 'all': kernel.dispatch({ type: 'selection.all' }, 'user'); break;
        case 'allFiltered': kernel.dispatch({ type: 'selection.allFiltered' }, 'user'); break;
        case 'clear': kernel.dispatch({ type: 'selection.clear' }, 'user'); break;
        case 'refresh': kernel.dispatch({ type: 'rows.refresh' }, 'user'); break;
        case 'filter':
          kernel.dispatch({ type: 'filter.column', column: o.column, filter: o.value === null ? null : { type: 'text', op: 'contains', value: o.value } }, 'user');
          break;
        case 'quick': kernel.dispatch({ type: 'quick.set', text: o.text }, 'user'); break;
        case 'sort': kernel.dispatch({ type: 'sort.set', sort: o.sort }, 'user'); break;
        case 'setParams': model.setSource(sourceRows<Row>(data, { params: o.params }), 'host'); break;
        case 'zone': kernel.dispatch({ type: 'context.set', ctx: localeCtx({ locale: 'en-US', timeZone: o.zone }) }, 'host'); break;
        case 'keepOnFilter': kernel.dispatch({ type: 'selection.keepOnFilter', keep: o.keep }, 'host'); break;
        case 'serverRemove': server.remove(o.ids); break;
      }
    }
    const told = last as Extract<GridEvent<Row>, { type: 'selectionChanged' }> | null;
    return {
      mode: kernel.selection.mode,
      keys: [...kernel.selection.keys].map((key) => String(idOfDataKey(key))).sort(),
      count: told ? told.count : 0,
      reason: told ? told.reason : null,
      header: kernel.headerState,
    };
  },
};
