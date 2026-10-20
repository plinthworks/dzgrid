import { clientRows, createColumnModel, createKernel, dataKey, idOfDataKey, localeCtx, type GridEvent, type GridKernel, type RowKey, type RowModel, type SelectionState } from '@dzgrid/core';
import { setSelectionGate } from '@dzgrid/core/internal';
import { vetSelection } from '@dzgrid/core/rules';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource } from '../../../packages/core/test/support/fake-source.js';
import { ruleOf, type RuleSpec } from '../harness.js';
import { memoryServer } from './selection-across.js';
import type { Suite } from './index.js';

/** Rows r1…rN; `v` is "odd" or "even" by the number. */
type Row = { id: string; v: string };

type Op =
  | { op: 'toggle' | 'only'; id: string }
  | { op: 'range'; target: string; additive?: boolean }
  | { op: 'all' | 'allDisplayed' | 'allFiltered' | 'clear' }
  /** The selection set as a whole, by the user (the box on browser pages) or the host. */
  | { op: 'set'; mode: 'include' | 'exclude'; ids: string[]; source?: 'user' | 'host' }
  | { op: 'page'; index: number }
  | { op: 'filter'; value: string | null }
  | { op: 'keepOnFilter'; keep: boolean }
  /** Another rule, live; null: none. */
  | { op: 'rule'; rule: RuleSpec | null };

/**
 * A kernel with the selection gate (step 21): `model` `client` (unpaged), `client-paged` or
 * `server` (pages of `pageSize` from a server in memory). The rule is declarative (`ruleOf`); the
 * gate vets with `@dzgrid/core/rules`, and its `skip` asks the rule of the selection now.
 * Expected: the selection, the anchor, the header box, and every selection event in order
 * (`["changed", count]`, `["refused", ids, reason, cause, source]`).
 */
export const selectionRules: Record<string, Suite> = {
  'selection-rules': ({ model: kind, rows: n, pageSize, rule: first, ops }: { model: 'client' | 'client-paged' | 'server'; rows: number; pageSize?: number; rule: RuleSpec | null; ops: Op[] }) => {
    const columns = createColumnModel<Row>([{ id: 'v' }]);
    const ctx = localeCtx({ locale: 'en-US' });
    let model: RowModel<Row>;
    if (kind === 'server') {
      const server = memoryServer(n);
      const fake = fakeSource({ reply: (req) => server.reply(req) });
      model = sourceRows<Row>(fake.source as DataSource<Row>).create({ getRowId: (r) => r.id, columns, ctx, abort: fake.abort, operations: 'server', page: { pageSize: pageSize ?? 5 } });
    } else {
      const data = Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, v: (i + 1) % 2 ? 'odd' : 'even' }));
      model = clientRows<Row>({ rows: data, getRowId: (r) => r.id, columns, ctx, ...(kind === 'client-paged' && { page: { pageSize: pageSize ?? 5 } }) });
    }
    const kernel: GridKernel<Row> = createKernel<Row>({ rows: model, columns });
    const k = (id: string): RowKey => dataKey(id)!;
    const id = (key: RowKey): string => String(idOfDataKey(key));
    const gateFor = (spec: RuleSpec | null) => {
      if (!spec) return undefined;
      const rule = ruleOf(spec, k, id);
      const skip = (key: RowKey): boolean => {
        const node = model.row(key);
        return !node || rule(node, kernel.selection) !== true;
      };
      return { on: true, vet: (prev: SelectionState, next: SelectionState) => vetSelection(rule, (key) => model.row(key), prev, next), skip };
    };
    setSelectionGate(kernel, gateFor(first));
    const events: unknown[] = [];
    kernel.subscribe((e: GridEvent<Row>) => {
      if (e.type === 'selectionChanged') events.push(['changed', e.count]);
      if (e.type === 'selectionRefused') events.push(['refused', e.rows.map(id), e.reason, e.cause, e.source]);
    });
    for (const o of ops) {
      switch (o.op) {
        case 'toggle': kernel.dispatch({ type: 'selection.toggle', row: k(o.id) }, 'user'); break;
        case 'only': kernel.dispatch({ type: 'selection.only', row: k(o.id) }, 'user'); break;
        case 'range': kernel.dispatch({ type: 'selection.range', target: k(o.target), additive: o.additive ?? false }, 'user'); break;
        case 'all': kernel.dispatch({ type: 'selection.all' }, 'user'); break;
        case 'allDisplayed': kernel.dispatch({ type: 'selection.allDisplayed' }, 'user'); break;
        case 'allFiltered': kernel.dispatch({ type: 'selection.allFiltered' }, 'user'); break;
        case 'clear': kernel.dispatch({ type: 'selection.clear' }, 'user'); break;
        case 'set': kernel.dispatch({ type: 'selection.set', selection: { mode: o.mode, keys: new Set(o.ids.map(k)) } }, o.source ?? 'user'); break;
        case 'page': kernel.dispatch({ type: 'page.go', index: o.index }, 'user'); break;
        case 'filter': kernel.dispatch({ type: 'filter.column', column: 'v', filter: o.value === null ? null : { type: 'text', op: 'contains', value: o.value } }, 'user'); break;
        case 'keepOnFilter': kernel.dispatch({ type: 'selection.keepOnFilter', keep: o.keep }, 'host'); break;
        case 'rule': setSelectionGate(kernel, gateFor(o.rule)); break;
      }
    }
    const s = kernel.selection;
    return {
      mode: s.mode,
      keys: [...s.keys].map(id).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
      anchor: kernel.anchor === null ? null : id(kernel.anchor),
      header: kernel.headerState,
      events,
    };
  },
};
