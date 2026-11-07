import { createColumnModel, localeCtx, makeQuery, type ColumnDef, type ColumnOrGroup, type DisplayIndex, type ModelChange, type ValueCodec } from '@dzgrid/core';
import { serverSideRows, type ServerSideModel } from '@dzgrid/core/server-side';
import { pivotShape, type PivotOptions } from '@dzgrid/core/pivot';
import { serverPivot } from '@dzgrid/core/server-pivot';
import { fakeSource } from '../../../packages/core/test/support/fake-source.js';
import type { Suite } from './index.js';

type Row = Record<string, unknown>;

type Step =
  /** Call `cN` answered with this raw response (the server's words, as JSON). */
  | { answer: string; response: unknown }
  /** Groups shown opened, by their label; the window painted. */
  | { open: string[] }
  | { want: [number, number] }
  | { sort: [string, 'asc' | 'desc'][] }
  /** The pivot's own `set` (the bar's gestures, a restored state). */
  | { set: { on?: boolean; columns?: string[]; desc?: string[]; values?: Record<string, string> } };

export interface ServerPivotInput {
  /** The pivot shape's options (`values` `{ "function": true }` stands for an application's function). */
  pivot: Omit<PivotOptions, 'values'> & { values?: Record<string, string | { function: true }> };
  blockSize?: number;
  steps: Step[];
}

/** A custom column takes any value: its key keeps the value's own type (`1` and `'1'` two columns). */
const any: ValueCodec<unknown> = { kind: 'custom', keyKind: 'text', coerce: (v) => v, parse: () => null as never, format: String, sortKey: String, compare: () => 0, isEmpty: (v) => v == null, equals: Object.is, toExport: String };
const COLUMNS: ColumnDef<Row, any>[] = [ // any: each column's value type is the case's
  { id: 'region' },
  { id: 'city' },
  { id: 'year', type: 'number' },
  { id: 'month', type: 'number' },
  { id: 'day', type: 'day' },
  { id: 'code', type: 'custom', codec: any },
  { id: 'amount', header: 'Amount', type: 'number' },
  { id: 'visits', header: 'Visits', type: 'number' },
];

/**
 * The server pivot (`@dzgrid/core/server-pivot`, server-pivot.md) over a fake source: calls c1, c2… answered by name with
 * the server's raw words. Out: each call's level path, pivot part and sort; what was told; the created columns (each leaf
 * as its header chain and its id); the rows shown with their totals by created id; the model's problems, the last
 * request's totals asked, and the model's export part.
 */
function runServerPivot(input: ServerPivotInput) {
  const fake = fakeSource();
  const raw = input.pivot.values;
  const values = raw && Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'object' ? () => 0 : v]));
  const shape = pivotShape<Row>({ ...input.pivot, ...(values && { values }), labels: { blank: '(blank)', total: 'Total {name}' } } as PivotOptions);
  const model = serverSideRows<Row>(fake.source, { blockSize: input.blockSize ?? 10, pivot: serverPivot() }).create({
    getRowId: (r) => String(r.id),
    columns: createColumnModel<Row>(COLUMNS),
    ctx: localeCtx({ locale: 'en-US', timeZone: 'UTC' }),
    abort: fake.abort,
    shape,
  }) as ServerSideModel<Row>;
  const told: string[] = [];
  model.subscribe((c: ModelChange<Row>) => {
    for (const p of c.told ?? []) told.push(`${p.code} ${p.path}${p.detail ? ` ${p.detail}` : ''}`);
  });
  const call = (name: string) => fake.calls.find((c) => c.name === name) ?? (() => { throw new Error(`no call ${name}`); })();
  const d = () => model.displayed as typeof model.displayed & { expandedAt(i: DisplayIndex): boolean };
  const keyOf = (label: string) => {
    for (let i = 0; i < d().count; i++) {
      const n = d().nodeAt(i as DisplayIndex);
      if (n.kind === 'group' && n.label === label) return n.key;
    }
    throw new Error(`no group ${label}`);
  };
  for (const s of input.steps) {
    if ('answer' in s) call(s.answer).resolve(s.response);
    else if ('open' in s) model.expand(s.open.map(keyOf), true, 'user');
    else if ('want' in s) model.want(s.want[0], s.want[1]);
    else if ('sort' in s) model.setQuery(makeQuery({ sort: s.sort.map(([column, dir]) => ({ column, dir })) }), 'user');
    else if ('set' in s) shape.set(s.set as never, 'user'); // never: the JSON's function names as the shape's Fns
  }
  const columns: string[] = [];
  const walk = (t: readonly ColumnOrGroup<Row>[], up: string[]): void =>
    t.forEach((n) => ('children' in n ? walk(n.children, [...up, n.header ?? '']) : columns.push(`${[...up, n.header ?? ''].join(' › ')} = ${n.id}`)));
  walk(shape.generated().columns, []);
  const rows: [string, unknown][] = [];
  for (let i = 0; i < d().count; i++) {
    const n = d().nodeAt(i as DisplayIndex);
    if (n.kind === 'group') rows.push([n.label, n.aggs]);
    else if (n.kind === 'footer') rows.push([`Σ${n.label}`, n.aggs]);
    else rows.push([n.kind, null]);
  }
  return {
    calls: fake.calls.map((c) => [c.name, c.req.group?.path ?? null, c.req.group?.pivot ?? null, c.req.sort ?? null]),
    told,
    final: { columns, count: shape.generated().count, rows, problems: model.problems.map((p) => `${p.code} ${p.path}${p.detail ? ` ${p.detail}` : ''}`), aggs: fake.calls.at(-1)?.req.group?.aggs ?? null, export: model.group?.pivot ?? null },
  };
}

export const serverPivotSuite: Record<string, Suite> = {
  'server-pivot': (input: ServerPivotInput) => runServerPivot(input),
};
