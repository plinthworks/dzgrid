import { describe, it, expect } from 'vitest';
import {
  clientRows, createColumnModel, createKernel, dataKey, localeCtx,
  type ColumnFilter, type GridEvent, type GridKernel, type RowKey, type RowModel,
} from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { fakeSource, type Call } from './support/fake-source.js';
import { mulberry32 } from './support/rng.js';

/**
 * Selection invariants under random scripts (step 7), over five models: the
 * browser paged and unpaged, a fetched set filtered in the browser, a fetched
 * set searched on the server, and server pages (total known or not). The
 * oracle is naive and shares nothing with the kernel but the row ids: it keeps
 * its own selection, its own idea of membership (docs/behaviors/server-selection.md)
 * and its own matching rows.
 *
 * Checked after every step:
 * - the selection equals the oracle's, keys and mode (so include keys are never
 *   lost on server pages unless cleared or keepOnFilter is off);
 * - an everything-except selection never survives a membership change, and
 *   always survives anything else (sort, page, refresh, same params);
 * - the last count told equals |selected ∩ matching| (include: the keys held)
 *   whenever the total is known, null for everything-except otherwise;
 * - selectionScope is non-null exactly for everything-except, and carries the
 *   oracle's zone and params; a selection cleared by the data says why;
 * - the header box: over the rows shown (browser, fetched set); on server pages
 *   over the query, an include set 'all' only when every row shown is ticked and
 *   it holds as many keys as the query matches.
 *
 * The scripts include half-typed filters and blank searches (no filter, no
 * search, in every model) and host updates that move a row in or out of the
 * filters (the browser): the count stays exact (selection-scope-bugs.test.ts).
 */
type R = { id: string; n: number; t: string };
type Kind = 'client-paged' | 'client' | 'fetched' | 'fetched-qs' | 'server' | 'server-unknown';
type F = 'none' | 'odd' | 'even' | 'half';
const k = (id: string) => dataKey(id)!;
const ZONES = [localeCtx({ locale: 'en-US' }), localeCtx({ locale: 'en-US', timeZone: 'Asia/Riyadh' })];
const filterOf = (f: F): ColumnFilter | null =>
  f === 'none' ? null : f === 'half' ? { type: 'text', op: 'contains', value: '' } : { type: 'text', op: 'equals', value: f };
type Sel = Extract<GridEvent<R>, { type: 'selectionChanged' }>;

function run(kind: Kind, seed: number, steps = 40) {
  const rnd = mulberry32(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const pick = <X>(xs: readonly X[]): X => xs[int(xs.length)]!;
  const where: string[] = [];
  const fail = (why: string) => `${kind} seed ${seed}, after ${where.join(' > ')}: ${why}`;

  const sourced = kind !== 'client' && kind !== 'client-paged';
  const serverPages = kind === 'server' || kind === 'server-unknown';
  const quickOnServer = serverPages || kind === 'fetched-qs';
  const filterOnServer = serverPages;
  const paged = kind !== 'client';

  // The world: the rows the host or the server has.
  let next = 0;
  const mk = (): R => { const i = next++; return { id: `r${i}`, n: i, t: i % 2 ? 'odd' : 'even' }; };
  let db: R[] = Array.from({ length: 10 }, mk);

  // The oracle.
  const o = {
    filter: 'none' as F, quick: '', zone: 0, ward: 'A', tHidden: false, keep: true,
    mode: 'include' as 'include' | 'exclude', keys: new Set<string>(), allMem: '',
    /** The rows a fetched set holds (its last accepted answer). */
    held: [] as R[],
    /** The last request was answered: counts are known. */
    settled: !sourced,
    /** A fetched set's epoch last answered (its counts are those of the epoch answered, `''` after a purge). */
    answered: '',
  };
  /** A fetched set's epoch: what its request depends on (a refresh is the same epoch). */
  const epoch = (): string => JSON.stringify([ZONES[o.zone]!.timeZone, o.ward, bindings, kind === 'fetched-qs' ? searched() : null]);
  /** The search as applied: a blank one is none. */
  const searched = (): string => (o.quick.trim() ? o.quick : '');
  /** Each setSource starts over, even with the same params. */
  let bindings = 0;
  /** The counts the kernel reads are this query's. */
  const known = (): boolean => (sourced && !serverPages ? o.answered === epoch() : o.settled);
  // A half-typed filter is no filter, in the browser as on a server.
  const effFilter = (f: F): F => (f === 'half' ? 'none' : f);
  const membership = (): string => JSON.stringify([
    effFilter(o.filter),
    searched(),
    ZONES[o.zone]!.timeZone,
    !quickOnServer && searched() ? o.tHidden : null,
    sourced ? o.ward : null,
  ]);
  const passFilter = (r: R) => o.filter === 'none' || o.filter === 'half' || r.t === o.filter;
  const passQuick = (r: R, onServer: boolean) => !searched() || ((onServer || !o.tHidden) && r.t.includes(o.quick));
  /** What the server answers for the fetched set (its own part of the query only). */
  const serverSet = (): R[] => (kind === 'fetched-qs' ? db.filter((r) => passQuick(r, true)) : db);
  /** Every row the query matches, on every page. */
  const matching = (): R[] => {
    if (serverPages) return db.filter((r) => passFilter(r) && passQuick(r, true));
    const base = sourced ? o.held : db;
    return base.filter((r) => passFilter(r) && (quickOnServer || passQuick(r, false)));
  };
  /** Rows a selected key can stand for (the browser and a fetched set: held; server pages: any). */
  const heldIds = (): Set<string> => new Set((sourced ? o.held : db).map((r) => r.id));
  const clearO = () => { o.mode = 'include'; o.keys = new Set(); };
  const nonEmpty = () => o.mode === 'exclude' || o.keys.size > 0;
  /** The selection the oracle expects to be cleared by a scope change this step. */
  let scopeCleared = false;
  let rowsDropped = false;
  const dropStaleO = () => {
    if (o.mode === 'exclude' && o.allMem !== membership()) { clearO(); scopeCleared = true; }
  };
  const reconcileO = () => {
    if (serverPages) return;
    const ids = heldIds();
    const before = o.keys.size;
    o.keys = new Set([...o.keys].filter((id) => ids.has(id)));
    if (o.mode === 'include' && o.keys.size < before) rowsDropped = true;
  };

  // The grid.
  const columns = createColumnModel<R>([{ id: 'n', type: 'number' }, { id: 't' }]);
  const fake = fakeSource();
  const done = new Set<Call>();
  const bind = (ward: string) => sourceRows<R>(fake.source as DataSource<R>, { params: { ward } });
  let model: RowModel<R>;
  if (!sourced) {
    model = clientRows<R>({ rows: db, getRowId: (r) => r.id, columns, ctx: ZONES[0]!, ...(paged && { page: { pageSize: 3 } }) });
  } else {
    const operations = serverPages ? 'server' : kind === 'fetched' ? 'client' : { page: 'client', quick: 'server' } as const;
    model = bind('A').create({ getRowId: (r) => r.id, columns, ctx: ZONES[0]!, abort: fake.abort, operations, page: { pageSize: 3 } });
  }
  const kernel: GridKernel<R> = createKernel<R>({ rows: model, columns });
  const events: GridEvent<R>[] = [];
  kernel.subscribe((e) => events.push(e));

  /** Answers the open request (a server pages' last-page retry asks again): ok, or fails with `failP`. */
  const settle = (failP: number) => {
    for (let guard = 0; guard < 4; guard++) {
      const c = fake.calls.at(-1);
      if (!c || done.has(c)) return;
      done.add(c);
      if (rnd() < failP) {
        c.reject(new Error('503'));
        o.settled = false;
        return;
      }
      if (serverPages) {
        const all = matching();
        const { offset, size } = c.req.page!;
        const rows = all.slice(offset, offset + size);
        c.resolve({ rows, ...(kind === 'server' ? { total: all.length } : { hasNext: offset + size < all.length }) });
      } else {
        o.held = serverSet().slice();
        o.answered = epoch();
        c.resolve({ rows: o.held });
        reconcileO();
      }
      o.settled = true;
    }
  };
  settle(0);

  /** The id a data key was made of (`d:<length>:<id>`): checked against dataKey, not assumed. */
  const idOf = (key: RowKey): string => { const id = String(key).replace(/^d:\d+:/, ''); expect(k(id)).toBe(key); return id; };
  const displayedIds = (): string[] => {
    const d = model.displayed;
    const out: string[] = [];
    for (let i = 0; i < d.count; i++) out.push(idOf(d.keyAt(d.index(i)!)));
    return out;
  };

  const check = (stepEvents: GridEvent<R>[]) => {
    const s = kernel.selection;
    expect(s.mode, fail('mode')).toBe(o.mode);
    expect([...s.keys].map(idOf).sort(), fail('keys')).toEqual([...o.keys].sort());
    // The scope a bulk action reads.
    const scope = kernel.selectionScope;
    if (o.mode === 'exclude') {
      expect(scope, fail('scope')).not.toBeNull();
      expect(scope!.zone, fail('scope zone')).toBe(ZONES[o.zone]!.timeZone);
      expect(scope!.params, fail('scope params')).toEqual(sourced ? { ward: o.ward } : {});
      expect(scope!.query, fail('scope query')).toBe(kernel.query);
    } else expect(scope, fail('no scope for include')).toBeNull();
    // The count last told is the count now.
    const told = events.filter((e): e is Sel => e.type === 'selectionChanged').at(-1);
    const toldCount = told ? told.count : 0;
    if (o.mode === 'include') expect(toldCount, fail('include count')).toBe(o.keys.size);
    // Unknown total, except an empty first page with nothing after it: the empty list.
    else if (kind === 'server-unknown') { if (o.settled) expect(toldCount, fail('unknown total')).toBe(matching().length === 0 ? 0 : null); }
    else if (known()) {
      const m = matching();
      if (!serverPages) expect(model.counts.filtered, fail('oracle matching agrees with the model')).toBe(m.length);
      expect(toldCount, fail('exclude count')).toBe(m.filter((r) => !o.keys.has(r.id)).length);
    }
    // A selection the data changed says why.
    const data = stepEvents.filter((e): e is Sel => e.type === 'selectionChanged' && e.source === 'data');
    if (scopeCleared) expect(data.some((e) => e.reason === 'scope-changed'), fail('scope-changed told')).toBe(true);
    if (rowsDropped && !scopeCleared) expect(data.some((e) => e.reason === 'rows-dropped'), fail('rows-dropped told')).toBe(true);
    for (const e of data) if (e.reason === 'scope-changed') expect(scopeCleared, fail('scope-changed only when cleared')).toBe(true);
    // Elsewhere the header box speaks for the rows shown.
    if (!serverPages) {
      const shown = displayedIds();
      const on = shown.filter((id) => (o.mode === 'include' ? o.keys.has(id) : !o.keys.has(id))).length;
      expect(kernel.headerState, fail('header over the rows shown')).toBe(on === 0 ? 'none' : on === shown.length ? 'all' : 'some');
    }
    // The header box on server pages speaks for the query.
    if (serverPages && o.mode === 'exclude' && kind === 'server' && o.settled) {
      const m = matching().filter((r) => !o.keys.has(r.id)).length;
      expect(kernel.headerState, fail('header')).toBe(m === 0 ? 'none' : o.keys.size === 0 ? 'all' : 'some');
    }
    // An include set there: 'all' only for this query's rows, every one shown ticked.
    if (serverPages && o.mode === 'include' && o.settled) {
      const shown = displayedIds();
      const all = kind === 'server' && o.keys.size === matching().length && shown.length > 0 && shown.every((id) => o.keys.has(id));
      expect(kernel.headerState, fail('header include')).toBe(o.keys.size === 0 ? 'none' : all ? 'all' : 'some');
    }
  };

  const filters: F[] = ['none', 'odd', 'even', 'half'];
  for (let step = 0; step < steps; step++) {
    const mark = events.length;
    scopeCleared = false;
    rowsDropped = false;
    const r = int(15);
    switch (r) {
      case 0: case 1: {
        const shown = displayedIds();
        // Server pages after a failed request show the rows of the query before: a probe of its own (B4).
        if (!shown.length || (serverPages && !o.settled)) { where.push('toggle-none'); break; }
        const id = pick(shown);
        where.push(`toggle ${id}`);
        kernel.dispatch({ type: 'selection.toggle', row: k(id) }, 'user');
        if (o.keys.has(id)) o.keys.delete(id); else o.keys.add(id);
        o.keys = new Set(o.keys);
        break;
      }
      case 2: {
        where.push('all');
        const shown = displayedIds();
        kernel.dispatch({ type: 'selection.all' }, 'user');
        // An all-pages selection stays one: "all" re-ticks, never shrinks to the page.
        if (serverPages || o.mode === 'exclude') { o.mode = 'exclude'; o.keys = new Set(); o.allMem = membership(); }
        else { o.mode = 'include'; o.keys = new Set(shown); }
        break;
      }
      case 3: {
        where.push('allFiltered');
        const shown = displayedIds();
        kernel.dispatch({ type: 'selection.allFiltered' }, 'user');
        if (!serverPages && !paged) { o.mode = 'include'; o.keys = new Set(shown); }
        else if (!serverPages && known() && matching().length === 0) clearO();
        else { o.mode = 'exclude'; o.keys = new Set(); o.allMem = membership(); }
        break;
      }
      case 4:
        where.push('clear');
        kernel.dispatch({ type: 'selection.clear' }, 'user');
        clearO();
        break;
      case 5: case 6: {
        const f = pick(filters);
        where.push(`filter ${f}`);
        const before = o.filter;
        o.filter = f;
        dropStaleO();
        if (!o.keep && before !== f && nonEmpty()) { clearO(); scopeCleared = true; }
        kernel.dispatch({ type: 'filter.column', column: 't', filter: filterOf(f) }, 'user');
        settle(0.15);
        break;
      }
      case 7: {
        const q = pick(['', 'odd', 'even', '  ']);
        where.push(`quick '${q}'`);
        const before = o.quick;
        o.quick = q;
        dropStaleO();
        if (!o.keep && before !== q && nonEmpty()) { clearO(); scopeCleared = true; }
        kernel.dispatch({ type: 'quick.set', text: q }, 'user');
        settle(0.15);
        break;
      }
      case 8:
        where.push('sort');
        kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
        settle(0.15);
        break;
      case 9: {
        const i = int(4);
        where.push(`page ${i}`);
        if (model.page) kernel.dispatch({ type: 'page.go', index: i }, 'user');
        settle(0.15);
        break;
      }
      case 10: {
        where.push('zone');
        o.zone = 1 - o.zone;
        kernel.dispatch({ type: 'context.set', ctx: ZONES[o.zone]! }, 'host');
        dropStaleO();
        settle(0.15);
        break;
      }
      case 11: {
        if (!sourced) {
          // The host's rows: one added, one removed, or one moved in or out of the filters.
          const dice = rnd();
          if (dice < 0.35 && db.length) {
            const was = pick(db);
            const row = { ...was, t: was.t === 'odd' ? 'even' : 'odd' };
            where.push(`update ${row.id} ${row.t}`);
            db = db.map((x) => (x === was ? row : x));
            (model as ReturnType<typeof clientRows<R>>).applyTransaction({ update: [row] });
          } else if (dice < 0.7 || db.length < 3) {
            const row = mk();
            where.push(`add ${row.id}`);
            db = [...db, row];
            (model as ReturnType<typeof clientRows<R>>).applyTransaction({ add: [row] });
          } else {
            const gone = pick(db);
            where.push(`remove ${gone.id}`);
            db = db.filter((x) => x !== gone);
            (model as ReturnType<typeof clientRows<R>>).applyTransaction({ remove: [gone.id] });
          }
          reconcileO();
          break;
        }
        const ward = pick(['A', 'B']);
        where.push(`params ${ward}`);
        o.ward = ward;
        bindings++;
        (model as unknown as { setSource(b: unknown, s: string): void }).setSource(bind(ward), 'host');
        dropStaleO();
        settle(0.15);
        break;
      }
      case 12: {
        // A refresh; the fetched set's server may have lost or gained a row meanwhile (server pages: never, see the sheet).
        if (sourced && !serverPages && rnd() < 0.6) {
          if (rnd() < 0.5 && db.length > 2) db = db.filter((x) => x !== pick(db));
          else db = [...db, mk()];
        }
        const purge = sourced && rnd() < 0.3;
        where.push(purge ? 'purge' : 'refresh');
        if (purge) (model as unknown as { invalidate(o: object): void }).invalidate({ purge: true });
        else kernel.dispatch({ type: 'rows.refresh' }, 'user');
        if (purge) { o.settled = false; o.answered = ''; }
        settle(0.15);
        break;
      }
      case 13: {
        o.tHidden = !o.tHidden;
        where.push(o.tHidden ? 'hide t' : 'show t');
        kernel.dispatch({ type: 'column.state', patch: [{ id: 't', hidden: o.tHidden }] }, 'user');
        dropStaleO();
        settle(0.15);
        break;
      }
      case 14:
        o.keep = !o.keep;
        where.push(`keep ${o.keep}`);
        kernel.dispatch({ type: 'selection.keepOnFilter', keep: o.keep }, 'host');
        break;
    }
    // A pending request is answered now and then on its own.
    if (sourced && rnd() < 0.3) settle(0);
    check(events.slice(mark));
  }
}

describe('selection invariants under random scripts (step 7)', () => {
  const kinds: Kind[] = ['client-paged', 'client', 'fetched', 'fetched-qs', 'server', 'server-unknown'];
  for (const kind of kinds) {
    it(`${kind}: 80 seeded scripts of 40 steps`, () => {
      for (let seed = 1; seed <= 80; seed++) run(kind, seed * 7919 + kind.length);
    });
  }
});
