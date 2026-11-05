import { createColumnModel, localeCtx, makeQuery, type DisplayIndex, type ModelChange, type RowKey } from '@dzgrid/core';
import { serverSideRows, type ServerSideModel, type ServerSideOptions } from '@dzgrid/core/server-side';
import type { DataSource, Json } from '@dzgrid/core/server';
import { fakeSource } from '../../../packages/core/test/support/fake-source.js';
import type { Suite } from './index.js';

type Row = { id: string; region: string; day: string; qty: number };

type Step =
  /** The window painted (`want`), the positions kept besides. */
  | { want: [number, number]; keep?: number[] }
  /** Call `cN` answered: `groups` (values; each with count 5 and qty total 100 unless given), or `rows` rows from its offset, `total`, `hasNext`, `totals`; or a raw `response`. */
  | { answer: string; groups?: (Json | { value: Json; count?: number; aggs?: Record<string, Json> })[]; rows?: number; total?: number; hasNext?: boolean; totals?: Record<string, Json>; response?: unknown }
  | { fail: string }
  /** Groups shown opened or closed, by their label. */
  | { open: string[] }
  | { close: string[] }
  | { sort: [string, 'asc' | 'desc'][] }
  | { setBy: string[] }
  | { expandAll: boolean; depth?: number }
  | { refresh: true };

export interface ServerSideInput {
  /** `aggFuncs` values `{ "function": true }` stand for an application's function (JSON has none). */
  options?: Omit<ServerSideOptions, 'aggFuncs'> & { aggFuncs?: Record<string, string | { function: true }> };
  steps: Step[];
}

/**
 * A list grouped on the server (`@dzgrid/core/server-side`, server-side-groups.md) over a fake source with three columns
 * (`region` text, `day` a day, `qty` a number totalled by `sum`): calls named c1, c2… answered or failed by name. What was
 * asked (each call's level path and block), the kinds of the changes, what was told, and at the end the rows shown (a
 * group's label, `+` open; a row's id; `…` loading; `!` failed; `Σ` a totals row and its group's label), the keys and
 * totals of the group and totals rows, the status and the cache.
 */
function runServerSide(input: ServerSideInput) {
  const fake = fakeSource();
  const raw = input.options?.aggFuncs;
  const aggFuncs = raw && Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'object' ? () => 0 : v]));
  const model = serverSideRows<Row>(fake.source as DataSource<Row>, { ...input.options, ...(aggFuncs && { aggFuncs }) } as ServerSideOptions).create({
    getRowId: (r) => r.id,
    columns: createColumnModel<Row>([{ id: 'region' }, { id: 'day', type: 'day' }, { id: 'qty', type: 'number', aggFunc: 'sum' }]),
    ctx: localeCtx({ locale: 'en-US' }),
    abort: fake.abort,
  }) as ServerSideModel<Row>;
  const changes: string[] = [];
  const told: string[] = [];
  model.subscribe((c: ModelChange<Row>) => {
    changes.push(c.kind);
    for (const p of c.told ?? []) told.push(`${p.code} ${p.path}${p.detail ? ` ${p.detail}` : ''}`);
  });
  const call = (name: string) => fake.calls.find((c) => c.name === name) ?? (() => { throw new Error(`no call ${name}`); })();
  const keyOf = (label: string): RowKey => {
    const d = model.displayed;
    for (let i = 0; i < d.count; i++) {
      const n = d.nodeAt(i as DisplayIndex);
      if (n.kind === 'group' && n.label === label) return n.key;
    }
    throw new Error(`no group ${label}`);
  };
  for (const s of input.steps) {
    if ('want' in s) model.want(s.want[0], s.want[1], s.keep);
    else if ('answer' in s) {
      const c = call(s.answer);
      const p = c.req.page!;
      const path = c.req.group?.path ?? [];
      const extra = { ...(s.total !== undefined && { total: s.total }), ...(s.hasNext !== undefined && { hasNext: s.hasNext }), ...(s.totals && { totals: s.totals }) };
      if ('response' in s) c.resolve(s.response);
      else if (s.groups) c.resolve({ groups: s.groups.map((g) => (typeof g === 'object' && g !== null && !Array.isArray(g) ? { count: 5, aggs: { qty: 100 }, ...g } : { value: g, count: 5, aggs: { qty: 100 } })), ...extra });
      else {
        const n = s.rows ?? p.size;
        c.resolve({ rows: Array.from({ length: n }, (_, j) => ({ id: `${path.join('/')}#${p.offset + j}`, region: String(path[0] ?? ''), day: '2026-03-04', qty: 1 })), ...extra });
      }
    } else if ('fail' in s) call(s.fail).reject('down');
    else if ('open' in s) model.expand(s.open.map(keyOf), true, 'user');
    else if ('close' in s) model.expand(s.close.map(keyOf), false, 'user');
    else if ('sort' in s) model.setQuery(makeQuery({ sort: s.sort.map(([column, dir]) => ({ column, dir })) }), 'user');
    else if ('setBy' in s) model.setBy(s.setBy, 'user');
    else if ('expandAll' in s) model.expandAll(s.expandAll, s.depth);
    else if ('refresh' in s) model.invalidate();
  }
  const d = model.displayed as typeof model.displayed & { expandedAt(i: DisplayIndex): boolean };
  const shown: string[] = [];
  const keys: string[] = [];
  const totals: [string, unknown][] = [];
  for (let i = 0; i < d.count; i++) {
    const n = d.nodeAt(i as DisplayIndex);
    if (n.kind === 'group') shown.push(`${n.label}${d.expandedAt(i as DisplayIndex) ? '+' : ''}`), keys.push(n.key), totals.push([n.label, n.aggs]);
    else if (n.kind === 'footer') shown.push(`Σ${n.label}`), keys.push(n.key), totals.push([`Σ${n.label}`, n.aggs]);
    else if (n.kind === 'data') shown.push((n.data as Row).id);
    else shown.push(n.kind === 'loading' && n.failed ? '!' : '…');
  }
  const { blocks, levels } = model.diagnostics;
  return {
    calls: fake.calls.map((c) => [c.name, c.req.group ? c.req.group.path : null, c.req.page!.index]),
    changes,
    told,
    final: { status: model.status.phase, shown, keys, totals, by: model.by, aggs: fake.calls.at(-1)?.req.group?.aggs ?? null, grand: model.totals() },
    diagnostics: { blocks: { held: blocks.held, max: blocks.max, evicted: blocks.evicted }, levels },
  };
}

export const serverSide: Record<string, Suite> = {
  'server-side': (input: ServerSideInput) => runServerSide(input),
};
