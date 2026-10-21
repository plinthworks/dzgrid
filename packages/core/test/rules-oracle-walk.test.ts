// An independent oracle walk of the selection gate (step 21, docs/behaviors/selection-rules.md).
// Random rules (exclusive pairs, at most N through the context, one group only, a reason string),
// random commands (toggle, only, Shift ranges both ways, additive or not, the box, Ctrl+A / all,
// all matching, host set include and exclude with unknown keys, filters, keepOnFilter, pages,
// server pages, data patches and removals, rule and context swaps). The oracle holds its own copy
// of the rows and recomputes, greedily in screen order, what each command may add; the kernel must
// agree on the selection, the anchor, the selectionRefused event, the refused look and the box.
import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, localeCtx, isSelected,
  type ColumnFilter, type GridEvent, type RowKey, type RowModel, type DataNode, type SelectionState,
} from '@dzgrid/core';
import { setSelectionGate } from '@dzgrid/core/internal';
import { ruleGate } from '@dzgrid/core/rules';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource, type Call } from './support/fake-source.js';
import { mulberry32 } from './support/rng.js';

type R = { id: string; n: number; g: number; t: string };
type Kind = 'client' | 'client-paged' | 'server';
type RuleKind = 'pairs' | 'max' | 'group' | 'pairs+max' | 'reason';
type Ctx = { readonly max: number };

const PAIRS: readonly (readonly [number, number])[] = [[0, 1], [2, 5], [3, 4], [6, 9], [7, 8]];
const digit = (id: string) => Number(id.slice(1)) % 10;
const conflicts = (a: string, b: string) => PAIRS.some(([x, y]) => (x === digit(a) && y === digit(b)) || (y === digit(a) && x === digit(b)));
const k = (id: string): RowKey => dataKey(id)!;
const idOf = (key: RowKey): string => String(key).replace(/^d:\d+:/, '');

/** The oracle's rule, over its own rows: true, false or a reason. */
function oracleRule(kind: RuleKind, id: string, held: readonly string[], ctx: Ctx, gOf: (id: string) => number): boolean | string {
  const pairs = () => !held.some((o) => conflicts(id, o));
  const max = () => held.length < ctx.max;
  switch (kind) {
    case 'pairs': return pairs();
    case 'max': return max();
    case 'pairs+max': return pairs() && max();
    case 'group': return held.every((o) => gOf(o) === gOf(id));
    case 'reason': return pairs() ? true : `no ${digit(id)}`;
  }
}

function run(kind: Kind, seed: number, steps = 50, patches = false) {
  const rnd = mulberry32(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const pick = <X>(xs: readonly X[]): X => xs[int(xs.length)]!;
  const log: string[] = [];
  const fail = (m: string) => `seed ${seed} (${kind}): ${m}\n  ${log.join('\n  ')}`;

  // The oracle's rows (its own copy: the model's are never read for the rule).
  const db: R[] = Array.from({ length: 14 + int(8) }, (_, i) => ({ id: `r${i}`, n: i, g: int(3), t: i % 2 ? 'odd' : 'even' }));
  const gOf = (id: string) => db.find((r) => r.id === id)?.g ?? -1;
  let ruleKind: RuleKind = pick(['pairs', 'max', 'group', 'pairs+max', 'reason'] as const);
  let ctx: Ctx = { max: 2 + int(4) };

  // The grid's rule: one function per kind (a stable identity), reading the row the grid holds.
  const fns = new Map<RuleKind, (row: DataNode<R>, s: SelectionState, c: unknown) => boolean | string>();
  const fnOf = (rk: RuleKind) => {
    let f = fns.get(rk);
    if (!f) {
      f = (row, s, c) => {
        const held = [...s.keys].map(idOf);
        // The grid's own row data for the group, so a stale node would show.
        const g = (id: string) => (id === row.data.id ? row.data.g : gOf(id));
        return oracleRule(rk, row.data.id, held, c as Ctx, g);
      };
      fns.set(rk, f);
    }
    return f;
  };

  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const fake = fakeSource();
  const done = new Set<Call>();
  let model: RowModel<R>;
  const client = kind !== 'server';
  if (client) model = clientRows<R>({ rows: db.map((r) => ({ ...r })), getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), ...(kind === 'client-paged' && { page: { pageSize: 4 } }) });
  else model = sourceRows<R>(fake.source as DataSource<R>).create({ getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), abort: fake.abort, operations: 'server', page: { pageSize: 4 } });
  const answer = () => {
    for (const c of fake.calls) {
      if (done.has(c)) continue;
      done.add(c);
      const w = JSON.stringify(c.req.filter ?? {});
      const all = db.filter((r) => (w.includes('"odd"') ? r.t === 'odd' : w.includes('"even"') ? r.t === 'even' : true));
      const off = c.req.page!.offset;
      c.resolve({ rows: all.slice(off, off + c.req.page!.size).map((r) => ({ ...r })), total: all.length });
    }
  };
  const kernel = createKernel<R>({ rows: model, columns });
  answer();
  const gate = ruleGate<R>(() => fnOf(ruleKind), (key) => model.row(key), () => kernel.selection, () => ctx, (e) => { throw e; });
  setSelectionGate(kernel, gate);
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));

  // The oracle.
  let sel: string[] = [];
  let anchor: string | null = null;
  let keepOnFilter = true;
  const shown = (): string[] => { const d = model.displayed; return Array.from({ length: d.count }, (_, i) => idOf(d.keyAt(d.index(i)!))); };
  const held = (id: string) => (client ? db.some((r) => r.id === id) : !!model.row(k(id)));
  const allowed = (id: string, set: readonly string[]) => oracleRule(ruleKind, id, set, ctx, gOf);
  /** What a command makes of `next` (ordered): kept first, each added id asked in order. */
  let expectRefusal: { rows: string[]; reason: string | null } | null = null;
  const vetO = (next: readonly string[], row?: string | null) => {
    const running = next.filter((id) => sel.includes(id));
    const refused: string[] = [];
    let reason: string | null = null;
    let took = false;
    for (const id of next) {
      if (sel.includes(id)) continue;
      const v = held(id) ? allowed(id, running) : false;
      if (v === true) { running.push(id); took = true; } else { refused.push(id); if (reason === null && typeof v === 'string') reason = v; }
    }
    if (refused.length) expectRefusal = { rows: refused, reason };
    if (row !== undefined && !refused.length) anchor = row;
    if (!refused.length || took) sel = running;
  };

  const check = (what: string) => {
    answer();
    const s = kernel.selection;
    expect(s.mode, fail(`${what}: include`)).toBe('include');
    expect([...s.keys].map(idOf).sort(), fail(`${what}: selection`)).toEqual([...sel].sort());
    expect(kernel.anchor === null ? null : idOf(kernel.anchor), fail(`${what}: anchor`)).toBe(anchor);
    const told = events.filter((e) => e.type === 'selectionRefused');
    // A command tells selectionChanged once when it changed the selection, never when nothing moved.
    const cmdChanged = events.filter((e) => e.type === 'selectionChanged' && e.source !== 'data').length;
    expect(cmdChanged, fail(`${what}: selectionChanged told`)).toBe(String([...before].sort()) !== String([...sel].sort()) && !dataCleared ? 1 : 0);
    // selectionRefused comes after selectionChanged.
    const iR = events.findIndex((e) => e.type === 'selectionRefused');
    const iC = events.findIndex((e) => e.type === 'selectionChanged');
    if (iR !== -1 && iC !== -1) expect(iC < iR, fail(`${what}: order`)).toBe(true);
    expect(told.length, fail(`${what}: refusals told`)).toBe(expectRefusal ? 1 : 0);
    if (expectRefusal && told[0]?.type === 'selectionRefused') {
      expect(told[0].rows.map(idOf), fail(`${what}: refused rows`)).toEqual(expectRefusal.rows);
      expect(told[0].reason, fail(`${what}: reason`)).toBe(expectRefusal.reason);
    }
    // The refused look and the box, against the oracle's rule over the rows shown.
    const rows = shown();
    for (const id of rows) if (!sel.includes(id)) expect(gate.refused(k(id)), fail(`${what}: refused look ${id}`)).toBe(allowed(id, sel) !== true);
    const on = rows.filter((id) => sel.includes(id)).length;
    const rest = rows.filter((id) => !sel.includes(id)).every((id) => allowed(id, sel) !== true);
    expect(kernel.headerState, fail(`${what}: box`)).toBe(on === 0 ? 'none' : on === rows.length || rest ? 'all' : 'some');
    events.length = 0;
    expectRefusal = null;
    before = [...sel];
    dataCleared = false;
  };
  let before: string[] = [];
  let dataCleared = false;
  check('start');

  let filter: 'none' | 'odd' | 'even' = 'none';
  for (let step = 0; step < steps; step++) {
    const rows = shown();
    const id = rows.length ? pick(rows) : null;
    const r = int(16);
    let what = '';
    if (r === 0 && id) {
      what = `toggle ${id}`;
      kernel.dispatch({ type: 'selection.toggle', row: k(id) }, 'user');
      if (sel.includes(id)) { sel = sel.filter((x) => x !== id); anchor = id; } else vetO([...sel, id], id);
    } else if (r === 1 && id) {
      what = `only ${id}`;
      kernel.dispatch({ type: 'selection.only', row: k(id) }, 'user');
      vetO([id], id);
    } else if ((r === 2 || r === 3) && id) {
      const additive = r === 2;
      what = `range to ${id}${additive ? ' additive' : ''}`;
      kernel.dispatch({ type: 'selection.range', target: k(id), additive }, 'user');
      const a = anchor === null ? -1 : rows.indexOf(anchor);
      if (a !== -1) {
        const b = rows.indexOf(id);
        const span = rows.slice(Math.min(a, b), Math.max(a, b) + 1);
        vetO(additive ? [...sel, ...span.filter((x) => !sel.includes(x))] : span);
      }
    } else if (r === 4) {
      what = 'all';
      kernel.dispatch({ type: 'selection.all' }, 'user');
      vetO(model.page ? [...sel, ...rows.filter((x) => !sel.includes(x))] : rows);
    } else if (r === 5) {
      what = 'allFiltered';
      kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
      if (kind === 'client') vetO(rows);
      else if (kind === 'client-paged' && model.counts.filtered === 0) { sel = []; anchor = null; }
      else expectRefusal = { rows: [], reason: null };
    } else if (r === 6) {
      what = 'clear';
      kernel.dispatch({ type: 'selection.clear' }, 'user');
      sel = []; anchor = null;
    } else if (r === 7) {
      // A host's include set, some keys unknown, some of other pages.
      const ids = Array.from({ length: 1 + int(5) }, () => (int(6) ? pick(db).id : `zz${int(3)}`));
      const uniq = [...new Set(ids)];
      what = `set include ${uniq.join(',')}`;
      kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set(uniq.map(k)) } }, 'host');
      // A key no model keeps is dropped before the gate sees it.
      vetO(uniq.filter((x) => model.keeps(k(x))));
    } else if (r === 8) {
      what = 'set exclude';
      kernel.dispatch({ type: 'selection.set', selection: { mode: 'exclude', keys: new Set(sel.slice(0, 1).map(k)) } }, 'host');
      expectRefusal = { rows: [], reason: null };
    } else if (r === 9) {
      const next = pick(['none', 'odd', 'even'] as const);
      what = `filter ${next}`;
      const f: ColumnFilter | null = next === 'none' ? null : { type: 'text', op: 'equals', value: next };
      kernel.dispatch({ type: 'filter.column', column: 't', filter: f }, 'user');
      if (next !== filter && !keepOnFilter && sel.length) { sel = []; anchor = null; dataCleared = true; }
      filter = next;
    } else if (r === 10) {
      keepOnFilter = !keepOnFilter;
      what = `keepOnFilter ${keepOnFilter}`;
      kernel.dispatch({ type: 'selection.keepOnFilter', keep: keepOnFilter }, 'host');
    } else if (r === 11 && model.page) {
      const index = int(model.page.pageCount ?? 3);
      what = `page ${index}`;
      kernel.dispatch({ type: 'page.go', index }, 'user');
    } else if (r === 12) {
      ctx = { max: 1 + int(5) };
      what = `context max ${ctx.max}`;
    } else if (r === 13) {
      ruleKind = pick(['pairs', 'max', 'group', 'pairs+max', 'reason'] as const);
      what = `rule ${ruleKind}`;
    } else if (r === 14 && client && patches) {
      // A host patch moves a row to another group.
      const row = pick(db);
      row.g = (row.g + 1 + int(2)) % 3;
      what = `patch ${row.id} g=${row.g}`;
      (model as ReturnType<typeof clientRows<R>>).applyTransaction({ patch: [{ id: row.id, set: { g: row.g } }] }, 'host');
    } else if (r === 15 && client && db.length > 6) {
      const row = pick(db);
      what = `remove ${row.id}`;
      db.splice(db.indexOf(row), 1);
      (model as ReturnType<typeof clientRows<R>>).applyTransaction({ remove: [row.id] }, 'host');
      if (sel.includes(row.id)) dataCleared = true;
      sel = sel.filter((x) => x !== row.id);
      if (anchor === row.id) anchor = null;
    } else continue;
    log.push(what);
    check(what);
    void isSelected;
  }
}

const SEEDS = Number(process.env['WALK_SEEDS'] ?? 80);
describe('the selection gate against an independent oracle', () => {
  for (const kind of ['client', 'client-paged', 'server'] as const) {
    it(`${kind}: ${SEEDS} seeded scripts, data held still`, () => {
      for (let seed = 1; seed <= SEEDS; seed++) run(kind === 'client' ? 'client' : kind, seed * 7919 + kind.length, 50);
    });
  }
});

describe('the refused look after a host changes row data (step 21 review: the cache followed rule, context and selection only)', () => {
  it('client: seeded scripts with patches that move rows between groups', () => {
    for (let seed = 1; seed <= SEEDS; seed++) run('client', seed * 7919 + 6, 50, true);
  });

  it('a row the rule refused, patched so the rule now allows it, still reads refused and the box reads ticked', () => {
    type Q = { id: string; v: string };
    const cols = createColumnModel<Q>([{ id: 'v' }]);
    const rows = clientRows<Q>({ rows: [{ id: 'a', v: 'ok' }, { id: 'b', v: 'bad' }], getRowId: (r) => r.id, columns: cols, ctx: localeCtx({ locale: 'en-US' }) });
    const kernel = createKernel<Q>({ rows, columns: cols });
    const rule = (row: DataNode<Q>) => row.data.v !== 'bad';
    const gate = ruleGate<Q>(() => rule, (key) => rows.row(key), () => kernel.selection, () => null, () => {});
    setSelectionGate(kernel, gate);
    kernel.dispatch({ type: 'selection.toggle', row: k('a') }, 'user');
    expect(gate.refused(k('b'))).toBe(true);
    expect(kernel.headerState).toBe('all');
    rows.applyTransaction({ patch: [{ id: 'b', set: { v: 'ok' } }] }, 'host');
    // b may now join: its box is not greyed and the header box reads mixed (a click would add b, not clear).
    expect(gate.refused(k('b'))).toBe(false);
    expect(kernel.headerState).toBe('some');
  });
});
