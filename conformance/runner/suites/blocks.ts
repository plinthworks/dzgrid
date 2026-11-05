import { createColumnModel, localeCtx, makeQuery, type ModelChange } from '@dzgrid/core';
import { infiniteRows, type InfiniteModel, type InfiniteOptions } from '@dzgrid/core/infinite';
import type { DataSource, Json } from '@dzgrid/core/server';
import { fakeSource } from '../../../packages/core/test/support/fake-source.js';
import type { Suite } from './index.js';

type Row = { id: string; name: string };

type Step =
  /** The window painted (`want`), and the positions kept besides (the focused row). */
  | { want: [number, number]; keep?: number[] }
  /** Call `cN` answered: `rows` rows from its offset (a full block by default), `ids` instead, `total`, `hasNext`; or a raw `response`. */
  | { answer: string; rows?: number; ids?: string[]; total?: number; hasNext?: boolean; response?: unknown }
  | { fail: string; error?: Json }
  /** The timers due fire (the rest after a jump, an async batch). */
  | { rest: true }
  | { sort: [string, 'asc' | 'desc'][] }
  | { quick: string }
  | { refresh: true }
  | { purge: true }
  | { update: [string, string][] }
  | { add: string[] }
  | { remove: string[] }
  | { swap: Record<string, Json> }
  | { destroy: true };

export interface BlockInput {
  options?: InfiniteOptions;
  steps: Step[];
}

/**
 * A list loaded in blocks (`@dzgrid/core/infinite`, infinite-scroll.md) over a fake source: calls named c1, c2… in
 * order, answered or failed by name. What was asked (block numbers), what was aborted and why, the kinds of the
 * changes, and at the end the list's length, the blocks held, the status and the counters.
 */
function runBlocks(input: BlockInput) {
  const fake = fakeSource();
  const due: (() => void)[] = [];
  const model = infiniteRows<Row>(fake.source as DataSource<Row>, input.options).create({
    getRowId: (r) => r.id,
    columns: createColumnModel<Row>([{ id: 'name' }]),
    ctx: localeCtx({ locale: 'en-US' }),
    abort: fake.abort,
    timer: (fn) => {
      let on = true;
      due.push(() => on && fn());
      return () => void (on = false);
    },
  }) as InfiniteModel<Row>;
  const changes: string[] = [];
  const told: string[] = [];
  model.subscribe((c: ModelChange<Row>) => {
    changes.push(c.kind);
    for (const p of c.told ?? []) told.push(`${p.code} ${p.path}`);
  });
  const call = (name: string) => fake.calls.find((c) => c.name === name) ?? (() => { throw new Error(`no call ${name}`); })();
  for (const s of input.steps) {
    if ('want' in s) model.want(s.want[0], s.want[1], s.keep);
    else if ('answer' in s) {
      const c = call(s.answer);
      const p = c.req.page!;
      const n = s.rows ?? p.size;
      const rows = s.ids ? s.ids.map((id) => ({ id, name: id })) : Array.from({ length: n }, (_, j) => ({ id: `r${p.offset + j}`, name: `r${p.offset + j}` }));
      c.resolve('response' in s ? s.response : { rows, ...(s.total !== undefined && { total: s.total }), ...(s.hasNext !== undefined && { hasNext: s.hasNext }) });
    } else if ('fail' in s) call(s.fail).reject(s.error ?? 'down');
    else if ('rest' in s) for (const f of due.splice(0)) f();
    else if ('sort' in s) model.setQuery(makeQuery({ sort: s.sort.map(([column, dir]) => ({ column, dir })) }), 'user');
    else if ('quick' in s) model.setQuery(makeQuery({ quick: s.quick }), 'user');
    else if ('refresh' in s) model.invalidate();
    else if ('purge' in s) model.invalidate({ purge: true });
    else if ('update' in s) model.applyTransaction({ update: s.update.map(([id, name]) => ({ id, name })) });
    else if ('add' in s) model.applyTransaction({ add: s.add.map((id) => ({ id, name: id })) });
    else if ('remove' in s) model.applyTransaction({ remove: s.remove });
    else if ('swap' in s) model.setSource(infiniteRows<Row>(fake.source as DataSource<Row>, { ...input.options, params: s.swap }), 'host');
    else if ('destroy' in s) model.destroy();
  }
  const d = model.displayed;
  // Each held block as its first and last row shown, `!` for a failed place, `…` for one loading.
  const shown: string[] = [];
  for (let i = 0; i < d.count; ) {
    const node = d.nodeAt(d.index(i)!);
    const tag = node.kind === 'data' ? 'data' : node.kind === 'loading' ? (node.failed ? 'failed' : 'loading') : node.kind;
    let j = i;
    while (j + 1 < d.count) {
      const m = d.nodeAt(d.index(j + 1)!);
      if ((m.kind === 'data' ? 'data' : m.kind === 'loading' ? (m.failed ? 'failed' : 'loading') : m.kind) !== tag) break;
      j++;
    }
    shown.push(`${i}-${j} ${tag}`);
    i = j + 1;
  }
  const { blocks, fetches, gate } = model.diagnostics;
  return {
    calls: fake.calls.map((c) => [c.name, c.req.page!.index, ...(c.req.sort?.length ? [c.req.sort.map((x) => `${x.column} ${x.dir}`).join()] : []), ...(c.req.quick ? [c.req.quick] : []), ...(Object.keys(c.req.params).length ? [c.req.params] : [])]),
    aborted: fake.aborted,
    changes,
    told,
    final: { status: model.status.phase, count: d.count, shown, counts: model.counts },
    diagnostics: { fetches, blocks, dropped: gate.dropped },
  };
}

export const blocks: Record<string, Suite> = {
  'block-cache': (input: BlockInput) => runBlocks(input),
};
