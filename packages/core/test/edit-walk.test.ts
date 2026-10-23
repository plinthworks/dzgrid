// Phase 5 step 3 (step03-plan.md « Tests first » 6): a random walk of edits, answers, undo and redo
// mixed with sorts, filters and quick searches on the client model. `orderStale` is true exactly
// when, since the last full run (a query change or a reapply), an edit changed a shown value in a
// column the sort, the applied filter or the search reads (edit-reapply.md 1–2, 10; K.14); edits
// alone never move a row; after a query change or a reapply the rows are in the oracle's order,
// read with the values shown. Host updates are left to the step-2 cases (`edit-order` tx-*).
// WALK_SEEDS=n runs n seeds; WALK_SEED=s one.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, dataKey, localeCtx, makeQuery, type RowKey } from '@dzgrid/core';
import { createEdits, type CellInput, type SaveRequest } from '@dzgrid/core/edit';
import { mulberry32 } from './support/rng.js';

type Row = { id: string; v: number; n: string };
const IDS = ['a', 'b', 'c', 'd', 'e'];
const WORDS = ['apple', 'berry', 'cherry', 'date', 'fig'];
const k = (id: string): RowKey => dataKey(id)!;
const drain = () => new Promise<void>((r) => setImmediate(r));

async function walk(seed: number, steps = 40): Promise<string[]> {
  const rnd = mulberry32(seed);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(rnd() * xs.length)]!;
  const fails: string[] = [];
  const check = (ok: boolean, what: string) => {
    if (!ok && fails.length < 5) fails.push(`seed ${seed}: ${what}`);
  };
  const rows: Row[] = IDS.map((id) => ({ id, v: Math.floor(rnd() * 5), n: pick(WORDS) }));
  const columns = createColumnModel<Row>([{ id: 'v', type: 'number', editable: true }, { id: 'n', editable: true }]);
  const ctx = localeCtx({ locale: 'en-US' });
  const model = clientRows<Row>({ rows, getRowId: (r) => r.id, columns, ctx });
  const kernel = createKernel<Row>({ rows: model, columns });
  const pending = new Map<number, { ok: () => void; fail: () => void }>();
  const save = (req: SaveRequest<Row>) => new Promise<void>((ok, fail) => pending.set(req.generation, { ok: () => ok(), fail: () => fail({}) }));
  const edits = createEdits<Row>(kernel, { ctx: () => ctx, save });

  let sort: { column: string; dir: 'asc' | 'desc' } | null = null;
  let over: number | null = null;
  let quick = '';
  let stale = false;
  const shown = (id: string, col: 'v' | 'n') => edits.reader.value(columns.get(col)!, model.row(k(id))!.data, id) as never;
  const snapshot = () => IDS.map((id) => [shown(id, 'v'), shown(id, 'n')] as const);
  const reads = () => new Set([...(sort ? [sort.column] : []), ...(over !== null ? ['v'] : []), ...(quick ? ['v', 'n'] : [])]);
  const order = () => Array.from({ length: model.displayed.count }, (_, i) => String((model.displayed.nodeAt(model.displayed.index(i)!) as { id: unknown }).id));
  const oracleOrder = () => {
    const s = snapshot();
    const at = (id: string) => s[IDS.indexOf(id)]!;
    const kept = IDS.filter((id) => (over === null || (at(id)[0] as number) > over) && (!quick || String(at(id)[1]).includes(quick)));
    if (!sort) return kept;
    const i = sort.column === 'v' ? 0 : 1;
    const sign = sort.dir === 'asc' ? 1 : -1;
    // Stable: equal values keep the rows' own order.
    return [...kept].sort((x, y) => {
      const a = at(x)[i], b = at(y)[i];
      return a === b ? 0 : (i === 0 ? (a as number) - (b as number) : String(a).localeCompare(String(b), 'en')) * sign;
    });
  };
  const setQuery = () => kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: sort ? [sort] : [], filter: over === null ? {} : { v: { type: 'number', op: 'gt', value: over } }, quick }) }, 'user');

  for (let step = 0; step < steps && !fails.length; step++) {
    const x = rnd();
    const before = order();
    const values = JSON.stringify(snapshot());
    const was = snapshot();
    let label: string;
    let queryStep = false;
    if (x < 0.3) {
      const id = pick(IDS);
      const col = rnd() < 0.5 ? 'v' : 'n';
      const input: CellInput = col === 'v' ? (rnd() < 0.85 ? { value: Math.floor(rnd() * 5) } : { text: 'x' }) : { value: pick(WORDS) };
      label = `commit ${id}.${col} ${JSON.stringify(input)}`;
      edits.commit([{ key: k(id), column: col, input }]);
      // The value kept shows at once (anything typed but the refused `x`).
      if ('value' in input) check(Object.is(shown(id, col), input.value), `step ${step} ${label}: shows ${String(shown(id, col))}`);
    } else if (x < 0.5) {
      const gs = [...pending.keys()];
      if (!gs.length) continue;
      const g = pick(gs);
      const ok = rnd() < 0.6;
      label = `${ok ? 'ok' : 'fail'} ${g}`;
      const p = pending.get(g)!;
      pending.delete(g);
      if (ok) p.ok();
      else p.fail();
    } else if (x < 0.6) {
      label = 'undo';
      edits.undo();
    } else if (x < 0.65) {
      label = 'redo';
      edits.redo();
    } else if (x < 0.75) {
      const next = rnd() < 0.2 ? null : { column: pick(['v', 'n']), dir: pick(['asc', 'desc'] as const) };
      if (JSON.stringify(next) === JSON.stringify(sort)) continue;
      sort = next;
      label = `sort ${JSON.stringify(sort)}`;
      queryStep = true;
      setQuery();
    } else if (x < 0.83) {
      const next = rnd() < 0.3 ? null : Math.floor(rnd() * 4);
      if (next === over) continue;
      over = next;
      label = `filter v > ${over}`;
      queryStep = true;
      setQuery();
    } else if (x < 0.9) {
      const next = pick(['', 'rr', 'ap', 'e']);
      if (next === quick) continue;
      quick = next;
      label = `quick "${quick}"`;
      queryStep = true;
      setQuery();
    } else {
      label = 'reapply';
      queryStep = true;
      kernel.dispatch({ type: 'rows.reapply' }, 'user');
    }
    await drain();
    const now = snapshot();
    if (queryStep) {
      stale = false;
      check(JSON.stringify(order()) === JSON.stringify(oracleOrder()), `step ${step} ${label}: order ${order()} oracle ${oracleOrder()}`);
    } else {
      const read = reads();
      IDS.forEach((_, i) => {
        if (!Object.is(now[i]![0], was[i]![0]) && read.has('v')) stale = true;
        if (!Object.is(now[i]![1], was[i]![1]) && read.has('n')) stale = true;
      });
      check(JSON.stringify(order()) === JSON.stringify(before), `step ${step} ${label}: the edit moved rows (${before} → ${order()}; values ${values})`);
    }
    check(kernel.orderStale === stale, `step ${step} ${label}: orderStale ${kernel.orderStale}, oracle ${stale}`);
  }
  edits.destroy();
  return fails;
}

const N = Number(process.env.WALK_SEEDS ?? 300);
const ONE = process.env.WALK_SEED;

describe('edits, sorts, filters and searches: the stale order', () => {
  it(`${ONE ? `seed ${ONE}` : `${N} seeds`}`, async () => {
    const fails: string[] = [];
    for (const seed of ONE ? [Number(ONE)] : Array.from({ length: N }, (_, i) => i + 1)) {
      fails.push(...(await walk(seed)));
      if (fails.length) break;
    }
    expect(fails).toEqual([]);
  }, 120_000);
});
