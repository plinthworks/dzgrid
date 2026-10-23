import {
  clientRows, createColumnModel, createKernel, dataKey, idOfDataKey, localeCtx, makeQuery,
  type ChangeSource, type ColumnDef, type GridEvent, type RowKey, type RowModel, type RowTransaction,
} from '@dzgrid/core';
import { lockColumns } from '@dzgrid/core/internal';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { createEdits, type CellInput, type SaveRequest } from '@dzgrid/core/edit';
import { fakeSource } from '../../../packages/core/test/support/fake-source.js';
import { iso } from '../iso.js';
import type { Suite } from './index.js';
import { keyOf } from './edit-order.js';

type Row = Record<string, unknown> & { id: string };

/**
 * The functions a case names (`{fn: name}`), the same table for every implementation: `validate`
 * rules, `edit.options` lists, `editable` rules.
 */
const FN: Record<string, (...a: any[]) => unknown> = {
  // validate (value, row, context)
  negative: (v: unknown) => (typeof v === 'number' && v < 0 ? 'negative' : null),
  'empty-string': () => '',
  'not-string': () => 5,
  throws: () => {
    throw new Error('the rule failed');
  },
  'context-says': (_v: unknown, _row: unknown, context: any) => context?.code ?? null,
  // options (row, context)
  'context-options': (_row: unknown, context: any) => context?.options ?? [],
  'row-options': (row: any) => (row.opts ?? []).map((value: string) => ({ value })),
  // editable (row, context)
  'row-ok': (row: any) => row.ok === true,
};

/** A case's column: `{fn}` objects become the table's functions, `{regex, flags}` a RegExp. */
const columnOf = (d: any): ColumnDef<Row, any> => {
  if (!d || typeof d !== 'object') return d;
  const fn = (x: any) => (x && typeof x === 'object' && typeof x.fn === 'string' ? FN[x.fn] : x);
  const out: any = { ...d };
  if ('validate' in d) out.validate = fn(d.validate);
  if (d.editable && typeof d.editable === 'object') out.editable = FN[d.editable.fn];
  if (d.edit && typeof d.edit === 'object') {
    out.edit = { ...d.edit };
    if ('options' in d.edit) out.edit.options = fn(d.edit.options);
    if (d.edit.pattern && typeof d.edit.pattern === 'object' && 'regex' in d.edit.pattern) out.edit.pattern = new RegExp(d.edit.pattern.regex, d.edit.pattern.flags ?? '');
  }
  return out;
};

/** `{text}` stays; anything else is a value given (picked, toggled, or by the API). */
const inputOf = (x: unknown): CellInput => (x && typeof x === 'object' && 'text' in x ? (x as { text: string }) : { value: x });
const k = (id: string): RowKey => dataKey(id)!;
const id = (key: RowKey): string => idOfDataKey(key) ?? String(key);
const shapeP = (p: { code: string; severity: string; path: string; detail?: string }) => ({ code: p.code, severity: p.severity, path: p.path, ...(p.detail !== undefined && { detail: p.detail }) });

function setup(input: any) {
  const columns = createColumnModel<Row>((input.columns as any[]).map(columnOf));
  const ctx = localeCtx({ locale: input.locale ?? 'en-US', ...(input.timeZone && { timeZone: input.timeZone }), ...(input.numerals && { numerals: input.numerals }) });
  const fake = fakeSource();
  const q = input.query ?? {};
  const query = input.query && makeQuery({ sort: q.sort ?? [], filter: q.filter ?? {}, quick: q.quick ?? '' });
  const model: RowModel<Row> =
    input.model === 'source'
      ? sourceRows<Row>(fake.source as DataSource<Row>).create({ getRowId: (r) => r.id, columns, ctx, page: input.page ?? { pageSize: 2, pageSizes: [2] }, abort: fake.abort })
      : clientRows<Row>({ rows: input.rows, getRowId: (r) => r.id, columns, ctx, ...(input.page && { page: input.page }) });
  const kernel = createKernel<Row>({ rows: model, columns, ...(query && { query }) });
  const problems: unknown[] = columns.problems.map(shapeP);
  return { columns, ctx, model, kernel, fake, problems };
}

/**
 * Checks of kept values (edit-validation.md 1, 8–11; owner S3-O3): columns, rows, then steps
 * (`check: [id, column, input]` through the controller, `>id` a detail row's key, `app: value`, `lock: ids`). `results`: per
 * check `{value}` (an instant as ISO UTC) or `{code}`; `problems`: the columns' own, then every one told.
 */
export function runEditInput(input: any) {
  const { kernel, ctx, columns, problems } = setup(input);
  kernel.subscribe((e) => {
    if (e.type === 'problems') problems.push(...e.problems.map(shapeP));
  });
  if ('app' in input) kernel.dispatch({ type: 'context.app', value: input.app }, 'host');
  const edits = createEdits<Row>(kernel, { ctx: () => ctx });
  const results: unknown[] = [];
  for (const s of input.steps) {
    if ('app' in s) kernel.dispatch({ type: 'context.app', value: s.app }, 'host');
    if (s.lock) lockColumns(kernel, s.lock);
    if (s.columns) kernel.dispatch({ type: 'columns.set', defs: (s.columns as any[]).map(columnOf) }, 'host');
    if (s.check) {
      const [rid, column, x] = s.check;
      const r = edits.check(keyOf(rid), column, inputOf(x));
      const type = columns.get(column)?.type;
      results.push(r.ok ? { value: type === 'instant' && typeof r.value === 'number' ? iso(r.value as never) : r.value } : { code: r.code });
    }
  }
  return { results, problems };
}

const settle = () => new Promise<void>((r) => setImmediate(r));
const cellName = (key: RowKey, column: string) => `${id(key)}.${column}`;
const j = (v: unknown) => (v === undefined ? 'undefined' : JSON.stringify(v));

/**
 * Saves and undo (edit-save.md 1–5, 13–21; edit-undo.md 1–13; ARCH §3.10 rules 1–6). A save held
 * until a step settles it (`save: 'held'`, the default), none (`'none'`: saved at once), or one that
 * answers at once (`'void'`) or throws (`'throw'`, with `{reason: 'sync'}`). Steps: `commit: [[id,
 * column, input]…]` (+ `origin`, `source`), `ok: g`, `fail: g` + `error`, `undo` / `redo` (a source
 * or true), `tx`, `load`, `answer: {call, rows, total}` (a source model's fetch), `page: n`, `sort`,
 * `reapply`, `setSave`, `destroy`. Output (a case compares the keys it states): `results` (commit,
 * undo, redo, destroy), `requests` (`changes: [id, column, value, previous]`, `rows`: each change's
 * row id and whether it is the row held when sent), `after` (the watched cells after each step,
 * `id.column=value status`), `events` (in order), `shown` (the rows' order at the end), `intact`
 * (the rows the case fed, deep-equal at the end), `dirty`, `canUndo`, `canRedo`.
 */
export async function runEdits(input: any) {
  const fed = JSON.stringify(input.rows ?? []);
  const { kernel, ctx, model, fake } = setup(input);
  const events: string[] = [];
  const results: unknown[] = [];
  const requests: unknown[] = [];
  const held = new Map<number, { ok: (v: unknown) => void; fail: (e: unknown) => void }>();
  const record = (req: SaveRequest<Row>) =>
    requests.push({
      generation: req.generation,
      origin: req.origin,
      changes: req.changes.map((c) => [id(c.key), c.column, c.value, c.previous]),
      rows: req.changes.map((c) => [String(c.row.id), c.row === model.row(c.key)?.data]),
    });
  const saves: Record<string, ((req: SaveRequest<Row>) => unknown) | undefined> = {
    held: (req) => {
      record(req);
      return new Promise((ok, fail) => held.set(req.generation, { ok, fail }));
    },
    none: undefined,
    void: (req) => void record(req),
    throw: (req) => {
      record(req);
      throw { reason: 'sync' };
    },
  };
  kernel.subscribe((e: GridEvent<Row>) => {
    switch (e.type) {
      case 'cellEdited': return void events.push(`edited ${cellName(e.key, e.column)} ${j(e.value)}<-${j(e.previous)} ${e.origin} ${e.source}`);
      case 'editStates': return void events.push(`states ${e.cells.map((c) => cellName(c.key, c.column)).join(',')} ${e.source}`);
      case 'saveFailed': return void events.push(`failed ${cellName(e.key, e.column)} ${j(e.value)} ${j(e.reason)} ${j(e.code)} ${e.source}`);
      case 'undoChanged': return void events.push(`undo ${e.canUndo} ${e.canRedo} ${e.source}`);
      case 'orderStale': return void events.push(`stale ${e.stale} ${e.source}`);
      case 'problems': return void events.push(...e.problems.map((p) => `problem ${p.code} ${p.path}${p.detail ? ` ${p.detail}` : ''} ${e.source}`));
    }
  });
  const edits = createEdits<Row>(kernel, { ctx: () => ctx, ...(saves[input.save ?? 'held'] && { save: saves[input.save ?? 'held'] }) });
  // The readers the controller hands the kernel from now on (the one it installs at creation is not a step's).
  const dispatch = kernel.dispatch.bind(kernel);
  (kernel as { dispatch: typeof kernel.dispatch }).dispatch = (cmd, source) => {
    if (cmd.type === 'edits.reader') events.push(`reader ${(cmd.columns ?? ['*']).join(',')} ${source}`);
    return dispatch(cmd, source);
  };
  const watched: string[] = input.watch ?? [];
  const look = () =>
    watched.map((w) => {
      const [rid, column] = w.split('.') as [string, string];
      const col = kernel.columns.get(column)!;
      const row = model.row(k(rid))?.data;
      const st = edits.state(k(rid), column);
      return `${w}=${row ? j(edits.reader.value(col, row, rid)) : 'gone'} ${st?.status ?? '-'}`;
    });
  const after: string[][] = [];
  const steps: any[] = input.steps;
  for (const s of steps) {
    const source: ChangeSource = s.source ?? 'user';
    if (s.commit) {
      const r = edits.commit(s.commit.map(([rid, column, x]: [string, string, unknown]) => ({ key: k(rid), column, input: inputOf(x) })), { ...(s.origin && { origin: s.origin }), ...(s.source && { source: s.source }) });
      results.push({ generation: r.generation, staged: r.staged, refused: r.refused.map((x) => [id(x.key), x.column, x.code]) });
    }
    if (s.ok !== undefined) held.get(s.ok)!.ok(s.value);
    if (s.fail !== undefined) held.get(s.fail)!.fail(s.error);
    if (s.undo || s.redo) {
      const r = s.undo ? edits.undo(typeof s.undo === 'string' ? s.undo : undefined) : edits.redo(typeof s.redo === 'string' ? s.redo : undefined);
      results.push(r && { cells: r.cells.map((c) => [id(c.key), c.column]), skipped: r.skipped });
    }
    if (s.tx) (model as unknown as { applyTransaction(t: RowTransaction<Row>, s: ChangeSource): void }).applyTransaction(s.tx, 'host');
    if (s.load) (model as unknown as { setRows(r: Row[], s: ChangeSource): void }).setRows(s.load, 'host');
    if (s.answer) fake.calls.find((c) => c.name === s.answer.call)!.resolve({ rows: s.answer.rows, total: s.answer.total ?? s.answer.rows.length });
    if (s.page !== undefined) kernel.dispatch({ type: 'page.go', index: s.page }, 'user');
    if (s.sort) kernel.dispatch({ type: 'sort.set', sort: s.sort }, 'user');
    if (s.reapply) kernel.dispatch({ type: 'rows.reapply' }, 'user');
    if ('setSave' in s) edits.setSave(saves[s.setSave]);
    if (s.destroy) results.push(edits.destroy());
    await settle();
    after.push(look());
  }
  const d = model.displayed;
  // `events: [prefixes]` in the input keeps only the events starting with one of them.
  const kept: string[] | undefined = input.events;
  return {
    results,
    requests,
    after,
    final: look(),
    events: kept ? events.filter((e) => kept.some((p) => e.startsWith(p))) : events,
    shown: Array.from({ length: d.count }, (_, i) => String((d.nodeAt(d.index(i)!) as { id: unknown }).id)),
    intact: JSON.stringify(input.rows ?? []) === fed,
    dirty: edits.dirty,
    canUndo: edits.canUndo,
    canRedo: edits.canRedo,
    calls: fake.calls.map((c) => c.name),
  };
}

export const edit: Record<string, Suite> = {
  'edit-input': runEditInput,
  'edit-saves': runEdits,
  undo: runEdits,
};
