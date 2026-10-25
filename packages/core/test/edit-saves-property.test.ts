// Phase 5 step 3 (step03-plan.md « Tests first » 5): 1 000 seeds of random commits, answers in any
// order (saved, refused, refused in part), undo, redo, host updates, removals, reloads, server pages and
// reapply, on a client model and on a source model, against the oracle (`support/edit-oracle.ts`).
// After each step: every held cell shows the oracle's value and state; the requests are the oracle's;
// at most one request per cell in flight, their generations growing per cell; the rows fed never
// written; undo / redo as the oracle's stacks; on the client, the same (reader version, store version)
// shows the same values and the edits alone never move a row. EDIT_SEEDS=n runs n seeds; EDIT_SEED=s one.
import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, localeCtx,
  type ClientModel, type ColumnDef, type RowKey, type RowModel,
} from '@dzgrid/core';
import { storeOf } from '@dzgrid/core/internal';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { createEdits, type CellInput, type SaveRequest } from '@dzgrid/core/edit';
import { fakeSource } from './support/fake-source.js';
import { mulberry32 } from './support/rng.js';
import { EditOracle } from './support/edit-oracle.js';

type Row = { id: string; v: number; w: number; n: string };
const IDS = ['a', 'b', 'c'];
/** Two number columns and a text column (spaces are a value there, empty text is null). */
const COLS = ['v', 'w', 'n'] as const;
const WORDS = ['p', 'q', '  '];
const CELLS = IDS.flatMap((id) => COLS.map((c) => `${id}.${c}`));
const k = (id: string): RowKey => dataKey(id)!;
const drain = () => new Promise<void>((r) => setImmediate(r));

export async function runSeed(seed: number, kind: 'client' | 'source', steps = 40): Promise<string[]> {
  const rnd = mulberry32(seed);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(rnd() * xs.length)]!;
  const fails: string[] = [];
  const check = (ok: boolean, what: string) => {
    if (!ok && fails.length < 5) fails.push(what);
  };
  const defs: ColumnDef<Row, any>[] = COLS.map((id) => ({ id, type: id === 'n' ? 'text' : 'number', editable: true }));
  const columns = createColumnModel<Row>(defs);
  const ctx = localeCtx({ locale: 'en-US' });
  /** The host's rows (the client's held rows; the server's truth), each object frozen as fed. */
  let truth: Row[] = IDS.map((id, i) => ({ id, v: i, w: 10 + i, n: WORDS[i]! }));
  const fed: [Row, string][] = [];
  // Frozen (Part A gate G5): a write to a host row by the edits or a rollback throws here, besides the snapshot check.
  const feed = (r: Row): Row => (fed.push([r, JSON.stringify(r)]), Object.freeze(r));
  truth.forEach(feed);
  const fake = fakeSource();
  let model: RowModel<Row>;
  if (kind === 'client') model = clientRows<Row>({ rows: truth, getRowId: (r) => r.id, columns, ctx });
  else {
    model = sourceRows<Row>(fake.source as DataSource<Row>).create({ getRowId: (r) => r.id, columns, ctx, page: { pageSize: 2, pageSizes: [2] }, abort: fake.abort });
  }
  const kernel = createKernel<Row>({ rows: model, columns });
  /** Answers every fetch outstanding with fresh objects of the server's rows (a server answer replaces rows). */
  let answered = 0;
  const answer = () => {
    while (answered < fake.calls.length) {
      const c = fake.calls[answered++]!;
      const p = c.req.page as { offset?: number; index?: number; size?: number } | undefined;
      const start = p?.offset ?? (p?.index ?? 0) * (p?.size ?? 2);
      c.resolve({ rows: truth.slice(start, start + 2).map((r) => feed({ ...r })), total: truth.length });
    }
  };
  if (kind === 'source') answer();

  // Row tokens: a new token each time the row object held changes.
  const toks = new Map<object, number>();
  let nextTok = 0;
  const tokOf = (o: object) => {
    if (!toks.has(o)) toks.set(o, ++nextTok);
    return toks.get(o)!;
  };
  const held = (id: string) => model.row(k(id))?.data;
  const src = (cell: string) => {
    const [id, col] = cell.split('.') as [string, 'v' | 'w' | 'n'];
    const r = held(id);
    return r ? { v: r[col], tok: tokOf(r) } : undefined;
  };
  let hasSave = rnd() < 0.85;
  const oracle = new EditOracle(src, kind === 'client', () => hasSave);

  const requests: SaveRequest<Row>[] = [];
  const pending = new Map<number, { ok: () => void; fail: (e: unknown) => void; req: SaveRequest<Row> }>();
  const save = (req: SaveRequest<Row>) => {
    requests.push(req);
    return new Promise<void>((ok, fail) => pending.set(req.generation, { ok: () => ok(), fail, req }));
  };
  const edits = createEdits<Row>(kernel, { ctx: () => ctx, ...(hasSave && { save }) });
  const reader = edits.reader;
  const cellOf = (key: RowKey, column: string) => `${IDS.find((id) => k(id) === key)}.${column}`;
  const versions = new Map<string, string>();

  const compare = (step: string) => {
    for (const cell of CELLS) {
      const [id, col] = cell.split('.') as [string, string];
      const r = held(id);
      if (!r) continue;
      const got = reader.value(columns.get(col)!, r, id);
      check(Object.is(got, oracle.shown(cell)) || (got == null && oracle.shown(cell) == null), `${step}: ${cell} shows ${String(got)}, oracle ${String(oracle.shown(cell))}`);
      check(edits.state(k(id), col)?.status === oracle.status(cell), `${step}: ${cell} state ${edits.state(k(id), col)?.status}, oracle ${oracle.status(cell)}`);
      const st = edits.state(k(id), col);
      if (st?.status === 'failed') check(JSON.stringify([st.reason, st.code]) === JSON.stringify(oracle.refusal(cell)), `${step}: ${cell} refusal ${st.reason}/${st.code}, oracle ${oracle.refusal(cell)}`);
    }
    const sent = requests.map((q) => ({ g: q.generation, origin: q.origin, changes: q.changes.map((c) => [cellOf(c.key, c.column), c.value, c.previous]) }));
    check(JSON.stringify(sent) === JSON.stringify(oracle.sent), `${step}: requests ${JSON.stringify(sent)} oracle ${JSON.stringify(oracle.sent)}`);
    // At most one request in flight per cell; generations grow per cell.
    const flying = new Map<string, number>();
    for (const [g, p] of pending) for (const c of p.req.changes) {
      const cell = cellOf(c.key, c.column);
      check(!flying.has(cell), `${step}: two requests in flight for ${cell} (${flying.get(cell)}, ${g})`);
      flying.set(cell, g);
    }
    const lastG = new Map<string, number>();
    for (const q of requests) for (const c of q.changes) {
      const cell = cellOf(c.key, c.column);
      check((lastG.get(cell) ?? 0) < q.generation, `${step}: generations of ${cell} do not grow`);
      lastG.set(cell, q.generation);
    }
    for (const [r, json] of fed) check(JSON.stringify(r) === json, `${step}: a row fed was written: ${json} → ${JSON.stringify(r)}`);
    check(edits.canUndo === oracle.undo.length > 0 && edits.canRedo === oracle.redo.length > 0, `${step}: undo ${edits.canUndo}/${edits.canRedo}, oracle ${oracle.undo.length}/${oracle.redo.length}`);
    check(edits.dirty === oracle.gestures.length > 0, `${step}: dirty ${edits.dirty}, oracle ${oracle.gestures.length} gestures`);
    if (kind === 'client') {
      const key = `${reader.version}|${storeOf(model as ClientModel<Row>).version}`;
      const values = JSON.stringify(CELLS.map((cell) => (held(cell.split('.')[0]!) ? reader.value(columns.get(cell.split('.')[1]!)!, held(cell.split('.')[0]!)!, cell.split('.')[0]!) : null)));
      check(!versions.has(key) || versions.get(key) === values, `${step}: same versions ${key}, other values`);
      versions.set(key, values);
    }
  };

  const order = () => Array.from({ length: model.displayed.count }, (_, i) => model.displayed.keyAt(model.displayed.index(i)!)).join();
  const removed: Row[] = [];
  for (let step = 0; step < steps && fails.length === 0; step++) {
    const x = rnd();
    const before = order();
    let editOnly = true;
    let label: string;
    if (x < 0.35) {
      // A gesture of one or two cells; some refused (text), some unchanged.
      const n = rnd() < 0.7 ? 1 : 2;
      const cells = [...new Set(Array.from({ length: n }, () => pick(CELLS)))];
      const inputOf = (cell: string): CellInput => {
        const y = rnd();
        if (cell.endsWith('.n')) return y < 0.5 ? { value: pick(WORDS) } : { text: pick(['p', 'q', '', '  ']) };
        return y < 0.6 ? { value: Math.floor(rnd() * 4) } : y < 0.8 ? { text: String(Math.floor(rnd() * 4)) } : y < 0.9 ? { text: '' } : { text: 'x' };
      };
      const given = cells.map((cell) => ({ cell, input: inputOf(cell) }));
      const accepted = (list: typeof given): [string, unknown][] =>
        list
          .filter(({ cell, input }) => src(cell) && !('text' in input && input.text === 'x'))
          .map(({ cell, input }) => [cell, 'value' in input ? input.value : input.text === '' ? null : cell.endsWith('.n') ? input.text : Number(input.text)]);
      // Sometimes a listener commits again while it hears the first cellEdited (review R1).
      const nc = rnd() < 0.15 ? pick(CELLS) : null;
      const nested = nc ? [{ cell: nc, input: inputOf(nc) }] : null;
      label = `commit ${JSON.stringify(given)}${nested ? ` then from cellEdited ${JSON.stringify(nested)}` : ''}`;
      let off: (() => void) | undefined;
      let nestedG: number | null | undefined;
      if (nested) {
        off = kernel.subscribe((e) => {
          if (e.type !== 'cellEdited' || !off) return;
          off();
          off = undefined;
          nestedG = edits.commit(nested.map(({ cell, input }) => ({ key: k(cell.split('.')[0]!), column: cell.split('.')[1]!, input }))).generation;
        });
      }
      const r = edits.commit(given.map(({ cell, input }) => ({ key: k(cell.split('.')[0]!), column: cell.split('.')[1]!, input })));
      off?.();
      let oracleNested: number | null | undefined;
      const g = oracle.commit(accepted(given), 'edit', nested ? () => (oracleNested = oracle.commit(accepted(nested))) : undefined);
      check(r.generation === g && nestedG === oracleNested, `${label}: generations ${r.generation}/${nestedG}, oracle ${g}/${oracleNested}`);
    } else if (x < 0.65) {
      const gs = [...pending.keys()];
      if (!gs.length) continue;
      const g = pick(gs);
      const p = pending.get(g)!;
      pending.delete(g);
      const y = rnd();
      const cells = p.req.changes.map((c) => cellOf(c.key, c.column));
      if (y < 0.6) {
        label = `ok ${g}`;
        p.ok();
        oracle.settle(g);
      } else if (y < 0.85 || cells.length < 2) {
        label = `fail ${g}`;
        const error = pick([{ reason: 'no' }, { code: 'c' }, {}, 'down']);
        p.fail(error);
        const why = (error as { reason?: string }).reason ?? null;
        const code = (error as { code?: string }).code ?? null;
        oracle.settle(g, new Map(cells.map((c) => [c, [why, code]])));
      } else {
        const named = p.req.changes.filter(() => rnd() < 0.5);
        const some = named.length ? named : [p.req.changes[0]!];
        // A named cell: by its RowKey or the host's plain id, with or without its own reason (review R5).
        const items = some.map((c) => ({ key: rnd() < 0.5 ? c.key : cellOf(c.key, c.column).split('.')[0]!, column: c.column, ...(rnd() < 0.5 && { reason: 'r' }) }));
        label = `fail ${g} in part ${JSON.stringify(items)}`;
        p.fail({ cells: items });
        oracle.settle(g, new Map(some.map((c, i) => [cellOf(c.key, c.column), [(items[i] as { reason?: string }).reason ?? null, null]])));
      }
    } else if (x < 0.73) {
      label = 'undo';
      const r = edits.undo();
      const o = oracle.move('undo', (c) => !!src(c));
      check(JSON.stringify(r && { cells: r.cells.map((c) => cellOf(c.key, c.column)), skipped: r.skipped }) === JSON.stringify(o), `undo ${JSON.stringify(r)} oracle ${JSON.stringify(o)}`);
    } else if (x < 0.78) {
      label = 'redo';
      const r = edits.redo();
      const o = oracle.move('redo', (c) => !!src(c));
      check(JSON.stringify(r && { cells: r.cells.map((c) => cellOf(c.key, c.column)), skipped: r.skipped }) === JSON.stringify(o), `redo ${JSON.stringify(r)} oracle ${JSON.stringify(o)}`);
    } else if (x < 0.86) {
      editOnly = false;
      // The host replaces a row (a client update), or the server answers again (a refresh).
      const id = pick(IDS);
      const i = truth.findIndex((r) => r.id === id);
      const col = pick(COLS);
      if (i >= 0) truth = truth.map((r, j) => (j === i ? { ...r, [col]: col === 'n' ? pick(WORDS) : rnd() < 0.5 ? r.v : Math.floor(rnd() * 4) } : r));
      if (kind === 'client') {
        if (i < 0 || !held(id)) continue;
        label = `update ${id}`;
        (model as ClientModel<Row>).applyTransaction({ update: [feed({ ...truth[i]! })] }, 'host');
      } else {
        label = 'refresh';
        kernel.dispatch({ type: 'rows.refresh' }, 'user');
        answer();
      }
      oracle.rowsChanged(CELLS);
    } else if (x < 0.91) {
      editOnly = false;
      if (kind === 'client') {
        if (rnd() < 0.5 && removed.length) {
          const r = removed.pop()!;
          label = `add ${r.id}`;
          (model as ClientModel<Row>).applyTransaction({ add: [feed({ ...r })] }, 'host');
        } else {
          const id = pick(IDS);
          if (!held(id)) continue;
          label = `remove ${id}`;
          removed.push(held(id)!);
          (model as ClientModel<Row>).applyTransaction({ remove: [id] }, 'host');
        }
      } else {
        label = 'page';
        kernel.dispatch({ type: 'page.go', index: (model.page?.index ?? 0) === 0 ? 1 : 0 }, 'user');
        answer();
      }
      oracle.rowsChanged(CELLS);
    } else if (x < 0.95) {
      editOnly = false;
      if (kind === 'client') {
        label = 'reload';
        (model as ClientModel<Row>).setRows(IDS.filter((id) => held(id)).map((id) => feed({ ...held(id)! })), 'host');
      } else {
        label = 'refresh';
        kernel.dispatch({ type: 'rows.refresh' }, 'user');
        answer();
      }
      oracle.rowsChanged(CELLS);
    } else if (x < 0.98) {
      editOnly = false;
      label = 'reapply';
      kernel.dispatch({ type: 'rows.reapply' }, 'user');
      if (kind === 'source') answer();
      oracle.rowsChanged(CELLS);
    } else {
      label = `save ${hasSave ? 'off' : 'on'}`;
      hasSave = !hasSave;
      edits.setSave(hasSave ? save : undefined);
    }
    await drain();
    compare(`seed ${seed} ${kind} step ${step} ${label}`);
    if (editOnly && kind === 'client') check(order() === before, `seed ${seed} step ${step} ${label}: the edits moved a row`);
  }
  edits.destroy();
  return fails;
}

const N = Number(process.env.EDIT_SEEDS ?? 1000);
const ONE = process.env.EDIT_SEED;

describe('edit saves against the oracle', () => {
  for (const kind of ['client', 'source'] as const) {
    it(`${ONE ? `seed ${ONE}` : `${N} seeds`}, ${kind} model`, async () => {
      const seeds = ONE ? [Number(ONE)] : Array.from({ length: N }, (_, i) => i + 1);
      const fails: string[] = [];
      for (const seed of seeds) {
        fails.push(...(await runSeed(seed, kind)));
        if (fails.length) break;
      }
      expect(fails).toEqual([]);
    }, 120_000);
  }
});
