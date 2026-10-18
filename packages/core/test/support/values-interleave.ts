import { expect } from 'vitest';
import { createColumnModel, localeCtx, makeQuery, type AbortHandle, type ColumnDef, type ColumnFilter, type ValuesHandle } from '@dzgrid/core';
import { sourceRows, type DataSource, type ValuesRequest } from '@dzgrid/core/server';
import { mulberry32 } from './rng.js';

/**
 * docs/behaviors/value-list.md and request-order.md, on a server, under seeded
 * interleavings of searches, closes and reopens, refreshes, queries (other
 * filters, the column's own, the server search), pages, invalidations, zones,
 * sources, and answers (rows and values, good, bad or failed) in any order.
 *
 * The property, like the gate's: the list shown always comes from the answer
 * to the last request of the handle, and that request is the one the current
 * state asks (its search, the other filters as sent, the server search, zone,
 * params, from the current source). No storm: at most one request per step,
 * and a request repeating the last one's key only for a refresh, a reopen or
 * a new epoch that dropped it in flight, or an invalidate (the data changed). One notification per change of
 * status or result, none otherwise; a closed handle tells nothing.
 */
type R = { id: string; name: string; city?: string };
const DEFS: ColumnDef<R>[] = [{ id: 'name' }, { id: 'city' }, { id: 'n', type: 'number' }];

interface VCall { name: string; src: string; req: ValuesRequest; state: 'pending' | 'done'; ok?: (v: unknown) => void; err?: (e: unknown) => void; settled?: { ok: boolean; v: unknown } }
interface RCall { name: string; src: string; req: { filter?: unknown; quick?: string; zone: string; params: unknown; sort?: unknown; key: string }; state: 'pending' | 'done'; ok?: (v: unknown) => void; err?: (e: unknown) => void }

const thenable = (c: { ok?: (v: unknown) => void; err?: (e: unknown) => void }) => ({ then(ok: (v: unknown) => void, err: (e: unknown) => void) { c.ok = ok; c.err = err; } });
/** The rows request's filter less a column; none when nothing is left (the values request sends none then). */
const omit = (o: unknown, k: string) => { const x = { ...(o as Record<string, unknown> ?? {}) }; delete x[k]; return Object.keys(x).length ? x : undefined; };
const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s: string) => fold(s).split(/\s+/).filter(Boolean);

export function run(seed: number, steps: number, o: { sources: boolean }) {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const vcalls: VCall[] = [];
  const rcalls: RCall[] = [];
  const mk = (src: string): DataSource<R> => ({
    fetch(req) {
      const c: RCall = { name: `c${rcalls.length + 1}`, src, req: req as RCall['req'], state: 'pending' };
      rcalls.push(c);
      return thenable(c) as never;
    },
    values(req) {
      const c: VCall = { name: `v${vcalls.length + 1}`, src, req, state: 'pending' };
      vcalls.push(c);
      return thenable(c) as never;
    },
  });
  const abort = (): AbortHandle => {
    const signal = { aborted: false, reason: undefined as unknown };
    return { signal, abort(reason) { if (!signal.aborted) { signal.aborted = true; signal.reason = reason; } } };
  };
  const A = sourceRows<R>(mk('A'), { params: { t: 'a' } });
  const B = sourceRows<R>(mk('B'), { params: { t: 'a' } });
  const C = sourceRows<R>(mk('C'), { params: { t: 'c' } });
  const bindings = { A, B, C } as const;
  let src: keyof typeof bindings = 'A';
  const m = A.create({ getRowId: (r) => r.id, columns: createColumnModel<R>(DEFS), ctx: localeCtx({ locale: 'en-US' }), abort, page: { pageSize: 2 } });

  // The test's state.
  let filter: Record<string, ColumnFilter> = {};
  let quick = '';
  let search = '';
  let h = null as ValuesHandle | null;
  /** The calls made by the open handle, its first one's index. */
  let since = 0;
  let accepted: { values: { value: string }[] } | null = null;
  let lastVerdict: 'ok' | 'error' | null = null;
  let notes = 0;
  const open = () => {
    const t = pick(['', 'a', ' b ']);
    search = t.trim();
    since = vcalls.length;
    accepted = null;
    lastVerdict = null;
    h = m.setValues!('city', { search: t, max: 3 });
    h.subscribe(() => notes++);
  };
  const current = () => vcalls.length > since ? vcalls[vcalls.length - 1]! : null;
  const ticked = (): readonly string[] => { const f = filter['city']; return f?.type === 'set' && f.include ? f.include : []; };
  open();

  const log: string[] = [];
  const closedTold: (() => number)[] = [];
  for (let step = 1; step <= steps; step++) {
    const beforeCalls = vcalls.length;
    const L0 = current();
    const lastRows0 = rcalls[rcalls.length - 1]!;
    const epoch0 = JSON.stringify([lastRows0.req.filter, lastRows0.req.quick, lastRows0.req.sort, lastRows0.req.zone, lastRows0.req.params, lastRows0.src]);
    const snap0 = h ? [h.status, h.result] : null;
    notes = 0;
    let what = '';
    let mayRepeat = false;
    const r = rnd();
    if (r < 0.12) {
      const t = pick(['', 'a', ' a ', 'b', 'ab']);
      what = `search "${t}"`;
      if (h) { h.search(t); search = t.trim(); }
    } else if (r < 0.18) {
      what = 'refresh';
      mayRepeat = true;
      h?.refresh();
    } else if (r < 0.24) {
      if (h) {
        what = 'close';
        const old = h;
        const pending = current();
        old.close();
        let told = 0;
        old.subscribe(() => told++);
        h = null;
        if (pending && pending.state === 'pending') expect(pending.req.signal.aborted, `seed ${seed} step ${step}: close aborts`).toBe(true);
        closedTold.push(() => told);
      } else {
        what = 'open';
        mayRepeat = true;
        open();
      }
    } else if (r < 0.42) {
      const k = rnd();
      if (k < 0.35) filter = { ...filter, name: pick([{ type: 'text', op: 'contains', value: pick(['x', 'y', '']) }, { type: 'set', include: [pick(['p', 'q'])] }] as ColumnFilter[]) };
      else if (k < 0.5) { filter = { ...filter }; delete filter['name']; }
      else if (k < 0.85) filter = { ...filter, city: pick([{ type: 'set', include: pick([['a'], ['ghost'], ['a', 'ghost'], ['b', 'zz']]) }, { type: 'set', exclude: ['a'] }, { type: 'text', op: 'contains', value: 'o' }] as ColumnFilter[]) };
      else { filter = { ...filter }; delete filter['city']; }
      what = `query ${JSON.stringify(filter)}`;
      mayRepeat = true; // an own-filter change is a new epoch: a request in flight is asked again
      m.setQuery(makeQuery({ filter, quick }));
    } else if (r < 0.48) {
      quick = pick(['', 'q', 'w']);
      what = `quick "${quick}"`;
      mayRepeat = true;
      m.setQuery(makeQuery({ filter, quick }));
    } else if (r < 0.52) {
      what = 'sort';
      mayRepeat = true;
      m.setQuery(makeQuery({ filter, quick, sort: [{ column: 'name', dir: pick(['asc', 'desc'] as const) }] }));
    } else if (r < 0.57) {
      what = 'page';
      m.setPage({ index: Math.floor(rnd() * 3) });
    } else if (r < 0.6) {
      what = 'invalidate';
      m.invalidate(rnd() < 0.5 ? { purge: true } : undefined);
    } else if (r < 0.64) {
      const z = pick(['UTC', 'Africa/Algiers']);
      what = `zone ${z}`;
      mayRepeat = true;
      m.setContext(localeCtx({ locale: pick(['en-US', 'fr-FR']), timeZone: z }));
    } else if (r < 0.68 && o.sources) {
      const s = pick(['A', 'B', 'C'] as const);
      what = `source ${s}`;
      mayRepeat = true;
      src = s;
      m.setSource(bindings[s]);
    } else if (r < 0.82) {
      // A values answer, to any call still waiting (stale ones too).
      const waiting = vcalls.filter((c) => c.state === 'pending' && c.ok);
      if (waiting.length) {
        const c = pick(waiting);
        c.state = 'done';
        const k = rnd();
        const isLast = c === current() && h !== null;
        if (k < 0.75) {
          const list = [{ value: `${c.name}-1`, count: 1 }, ...(['a', 'b', 'ghost'] as const).filter(() => rnd() < 0.4).map((value) => ({ value, count: 2 })), { value: `${c.name}-2` }, { value: 'zero', count: 0 }];
          what = `answer ${c.name}`;
          c.ok!(list);
          if (isLast) { accepted = { values: list.filter((x) => x.count !== 0).slice(0, 3) }; lastVerdict = 'ok'; }
        } else if (k < 0.88) {
          what = `bad answer ${c.name}`;
          c.ok!({ nope: 1 });
          if (isLast) lastVerdict = 'error';
        } else {
          what = `failure ${c.name}`;
          c.err!(new Error(c.name));
          if (isLast) lastVerdict = 'error';
        }
      } else what = 'nothing to answer';
    } else {
      const waiting = rcalls.filter((c) => c.state === 'pending' && c.ok);
      if (waiting.length) {
        const c = pick(waiting);
        c.state = 'done';
        what = `rows ${c.name}`;
        if (rnd() < 0.85) c.ok!({ rows: [{ id: `${c.name}a`, name: 'p' }, { id: `${c.name}b`, name: 'q' }], total: 6 });
        else c.err!(new Error(c.name));
      } else what = 'no rows to answer';
    }
    log.push(what);
    const where = `seed ${seed} step ${step}: ${what}\n  ${log.join('\n  ')}`;

    for (const t of closedTold) expect(t(), `${where}\na closed handle told`).toBe(0);
    // No storm: one request a step at most.
    const made = vcalls.length - beforeCalls;
    expect(made, `${where}\nrequests made`).toBeLessThanOrEqual(1);
    if (!h) {
      expect(made, `${where}\nno handle, no request`).toBe(0);
      continue;
    }
    const L = current()!;
    expect(L, `${where}\nan open handle has asked`).toBeTruthy();
    // The host said its data changed: an open list asks again (value-list.md).
    if (what === 'invalidate') expect(made, `${where}\ninvalidate asks again`).toBe(1);
    // The last request is the one the state asks now.
    const rows = rcalls[rcalls.length - 1]!;
    expect({ src: L.src, search: L.req.search, limit: L.req.limit, filter: L.req.filter, quick: L.req.quick, zone: L.req.zone, params: L.req.params }, `${where}\nthe request in force`)
      .toEqual({ src, search, limit: 3, filter: omit(rows.req.filter, 'city'), quick: rows.req.quick, zone: rows.req.zone, params: rows.req.params });
    // A repeated key only where it is allowed.
    if (made === 1 && L0 && L.req.key === L0.req.key) {
      const epoch1 = JSON.stringify([rows.req.filter, rows.req.quick, rows.req.sort, rows.req.zone, rows.req.params, rows.src]);
      const allowed = what === 'refresh' || what === 'open' || what === 'invalidate' || (mayRepeat && L0.state === 'pending' && epoch1 !== epoch0) || (what.startsWith('source') && epoch1 !== epoch0);
      expect(allowed, `${where}\nasked the same again`).toBe(true);
    }
    // The list shown: the last request's answer.
    if (L.state === 'pending') expect(h.status, `${where}\nstatus while waiting`).toBe('loading');
    else expect(h.status, `${where}\nstatus after the answer`).toBe(lastVerdict === 'ok' ? 'idle' : 'error');
    const fromServer = h.result ? h.result.values.filter((v) => !v.selected).map((v) => v.value) : null;
    expect(fromServer, `${where}\nthe list's origin`).toEqual(accepted ? accepted.values.map((v) => v.value) : null);
    if (h.status === 'idle' && accepted) {
      const has = new Set(accepted.values.map((v) => v.value));
      const sw = words(search);
      const want = [...new Set(ticked())].filter((v) => !has.has(v) && sw.every((w) => fold(v).includes(w)));
      expect(h.result!.values.filter((v) => v.selected).map((v) => v.value), `${where}\nticked values`).toEqual(want);
    }
    // One notification per change of status or result.
    const snap1 = [h.status, h.result];
    const changed = !snap0 || snap0[0] !== snap1[0] || snap0[1] !== snap1[1];
    if (what !== 'open') expect(notes, `${where}\nnotifications`).toBe(changed ? 1 : 0);
  }
  return { vcalls: vcalls.length, rcalls: rcalls.length };
}

