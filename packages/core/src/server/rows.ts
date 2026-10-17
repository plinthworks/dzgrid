import type { AbortHandle } from '../abort.js';
import { clientRows, type ModelChange, type ModelEnv, type ModelStatus, type SearchWarmup, type SourceBinding } from '../model/client.js';
import { resolveOperations, splitQuery, type ServerQuery } from '../model/operations.js';
import { checkPage, DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZES, pageCountOf, resizeIndex, resolvePageOptions } from '../model/page.js';
import { canonical, EMPTY_QUERY } from '../model/query.js';
import type { ChangeSource } from '../model/types.js';
import { problem, type Problem } from '../problems.js';
import type { TransactionResult } from '../row/store.js';
import { createGate, type Ticket } from './gate.js';
import type { DataRequest, DataSource, Json, PageWindow, SourceModel, SourceRows, SourceRowsOptions } from './source.js';
import { toWire } from './wire.js';

type Kind = ModelChange<unknown>['kind'];
/** Several things in one call: the change says the largest. */
const RANK: Record<Kind, number> = { status: 1, context: 2, order: 3, rows: 4, page: 5, query: 6 };
const IDLE: ModelStatus = { phase: 'idle' };
const LOADING: ModelStatus = { phase: 'loading' };
const DONE: SearchWarmup = { step: () => true, progress: 1, cancel() {} };

/** A handle that only records the abort: the core names no platform (the DOM passes a real one). */
const plainAbort = (): AbortHandle => {
  const signal = { aborted: false, reason: undefined as unknown };
  return {
    signal,
    abort(reason) {
      if (signal.aborted) return;
      signal.aborted = true;
      signal.reason = reason;
    },
  };
};

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  v !== null && (typeof v === 'object' || typeof v === 'function') && typeof (v as { then?: unknown }).then === 'function';

/** What each binding carries, out of sight: another model can take it on `setSource`. */
const bound = new WeakMap<object, { readonly data: DataSource<any>; readonly params: Readonly<Record<string, Json>> }>();

/**
 * A model fed by a server (`source: sourceRows(data, …)`). With server pages
 * it holds one page in a client model with no query of its own (rows keep
 * their identity there, duplicates are told), and asks the server for every
 * other page, filter, search or sort through the request gate: whatever the
 * order the answers come in, the last ask is what shows.
 *
 * Every call — and every answer — is one change, of the largest kind it
 * caused: `query` (another server query, the first answer, a new source, a
 * purge), `page` (another page asked or answered), `rows` (the page shown
 * answered again), `status` (loading, failed). While a request runs the rows
 * shown stay; after a failure the page asked stays, for the retry.
 */
export function sourceRows<T>(data: DataSource<T>, o: SourceRowsOptions = {}): SourceRows<T> {
  const binding: SourceRows<T> = { create: (env: ModelEnv<T>): SourceModel<T> => createSource(binding, env, o) };
  bound.set(binding, { data, params: o.params ?? {} });
  return binding;
}

const positiveInt = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n >= 1;
const warn = (path: string): Problem => problem('invalid-page-response', 'warning', path);

/** An answer read for a page of `size`: what it says, bent where it says it wrong. Rows null: refused. */
function readAnswer(r: unknown, size: number): { rows: readonly unknown[] | null; total: number | null; hasNext: boolean | null; problems: Problem[] } {
  const a = r as { rows?: unknown; total?: unknown; hasNext?: unknown } | null;
  if (typeof r !== 'object' || a === null || !Array.isArray(a.rows)) return { rows: null, total: null, hasNext: null, problems: [problem('invalid-page-response', 'error', 'response')] };
  const problems: Problem[] = [];
  let total = a.total ?? null;
  if (total !== null && !(Number.isInteger(total) && (total as number) >= 0)) {
    problems.push(warn('response.total'));
    total = null;
  }
  let hasNext = a.hasNext ?? null;
  if (hasNext !== null && typeof hasNext !== 'boolean') {
    problems.push(warn('response.hasNext'));
    hasNext = null;
  } else if (hasNext === null && total === null) problems.push(warn('response.hasNext'));
  if (a.rows.length > size) problems.push(warn('response.rows'));
  return { rows: a.rows, total: total as number | null, hasNext: hasNext as boolean | null, problems };
}

function createSource<T>(binding: SourceBinding<T>, env: ModelEnv<T>, o: SourceRowsOptions): SourceModel<T> {
  const { ops, problems: opsProblems } = resolveOperations(env.operations, true);
  const serverPages = ops.page === 'server';
  const pageOptions = resolvePageOptions(env.page);
  const fixed: Problem[] = [...opsProblems];
  let paging: 'offset' | 'cursor' = 'offset';
  if (o.paging !== undefined) {
    if (o.paging === 'offset' || o.paging === 'cursor') paging = o.paging;
    else fixed.push(problem('invalid-page', 'error', 'source.paging'));
  }
  if (paging === 'cursor' && !serverPages) fixed.push(problem('invalid-page', 'warning', 'source.paging'));
  if (o.maxRows !== undefined && !positiveInt(o.maxRows)) fixed.push(problem('invalid-page', 'error', 'source.maxRows'));
  fixed.push(...pageOptions.problems);
  const sizes = pageOptions.config?.sizes ?? DEFAULT_PAGE_SIZES;

  const gate = createGate(o.abort ?? env.abort ?? plainAbort);
  const inner = clientRows<T>({ rows: [], getRowId: env.getRowId, columns: env.columns, ctx: env.ctx });
  let current = binding;
  let { data, params } = bound.get(binding)!;
  let ctx = env.ctx;
  let server: ServerQuery;
  let epochKey = '';
  // The page asked, and what the last accepted answer said of what follows.
  let index = 0;
  let size = pageOptions.config?.size ?? DEFAULT_PAGE_SIZE;
  let total: number | null = null;
  /** The answer's hasNext, said or inferred; null: read from the total. */
  let next: boolean | null = null;
  /** No row at or after this offset (an empty page past the end): no next from there, at any size. */
  let endAt: number | null = null;
  /** The page the rows shown answered: null before the first answer, after a purge or a new source. */
  let shown: { readonly key: string; readonly index: number; readonly size: number } | null = null;
  let status: ModelStatus = LOADING;
  let answerProblems: readonly Problem[] = [];
  let fetches = 0;
  let destroyed = false;
  const listeners = new Set<(c: ModelChange<T>) => void>();

  // One commit per call: what it changed is gathered, then said once.
  let depth = 0;
  let kind: Kind | null = null;
  let tx: TransactionResult | undefined;
  let told: Problem[] = [];
  let failure: ModelChange<T>['failure'];
  const mark = (k: Kind): void => {
    if (kind === null || RANK[k] > RANK[kind]) kind = k;
  };
  inner.subscribe((c) => {
    mark(c.kind);
    if (c.transaction) tx = c.transaction;
  });
  const problems = (): readonly Problem[] => [...fixed, ...inner.problems, ...answerProblems];
  const commit = (fn: () => void, source: ChangeSource): void => {
    if (destroyed) return;
    depth++;
    try {
      fn();
    } finally {
      depth--;
    }
    if (depth) return;
    const k = kind;
    const c: ModelChange<T> | null = k && !destroyed
      ? { source, displayed: inner.displayed, kind: k, problems: problems(), ...(tx && { transaction: tx }), ...(told.length > 0 && { told }), ...(failure && { failure }) }
      : null;
    kind = null;
    tx = undefined;
    told = [];
    failure = undefined;
    if (c) for (const fn of [...listeners]) fn(c);
  };
  // A failure always follows a loading (only the last request counts): a phase change is a change.
  const setStatus = (s: ModelStatus): void => {
    if (s.phase !== status.phase) mark('status');
    status = s;
  };

  const load = (): void => {
    setStatus(LOADING);
    const page: PageWindow | undefined = serverPages ? { index, size, offset: index * size, cursor: null } : undefined;
    const parts: { filter?: unknown; quick?: string; sort?: unknown; page?: PageWindow; params: Readonly<Record<string, Json>>; zone: string } = { params, zone: ctx.timeZone };
    if (server.filter) parts.filter = toWire(server.filter);
    if (server.quick !== undefined) parts.quick = server.quick;
    if (server.sort) parts.sort = server.sort;
    if (page) parts.page = page;
    const key = canonical(parts);
    const { ticket, signal } = gate.begin('rows', key);
    const req = { ...parts, key, signal } as DataRequest;
    fetches++;
    let done = false;
    const settle = (fn: (t: Ticket, req: DataRequest, v: unknown) => void) => (v: unknown): void => {
      if (done) return;
      done = true;
      if (gate.settle(ticket) === null) commit(() => fn(ticket, req, v), 'data');
    };
    const ok = settle(answer);
    const fail = settle(failed);
    try {
      const r: unknown = data.fetch(req);
      if (isThenable(r)) r.then(ok, fail);
      else ok(r);
    } catch (error) {
      fail(error);
    }
  };

  const failed = (_t: Ticket, req: DataRequest, error: unknown): void => {
    setStatus({ phase: 'error', failure: error });
    failure = { error, key: req.key, page: req.page?.index ?? null };
  };

  /** An accepted answer, for the page asked now (the gate accepts only the last request). */
  const answer = (t: Ticket, req: DataRequest, r: unknown): void => {
    const a = readAnswer(r, size);
    answerProblems = a.problems;
    told.push(...a.problems);
    if (!a.rows) return failed(t, req, a.problems[0]);
    const rows = a.rows as readonly T[];
    if (rows.length === 0 && index > 0) {
      if (a.total !== null) {
        const last = pageCountOf(a.total, size) - 1;
        if (a.total === 0) index = 0;
        else if (last < index) {
          // Past the last page the server knows: that page, asked once more.
          total = a.total;
          next = a.hasNext;
          index = last;
          mark('page');
          return load();
        }
        // A total that covers the page: the rows are trusted, empty.
      } else {
        // Past the end of an unknown total: halfway back to the page on screen (known not empty),
        // so a far page costs a few requests, not one per page; the page on screen is kept, not
        // asked again, once nothing is left between.
        endAt = index * size;
        mark('page');
        const known = shown && shown.key === epochKey && shown.size === size && shown.index < index ? shown.index : -1;
        index = Math.floor((known + index) / 2);
        if (index === known) return setStatus(IDLE);
        return load();
      }
    }
    mark(!shown || shown.key !== epochKey ? 'query' : shown.index === index && shown.size === size ? 'rows' : 'page');
    shown = { key: epochKey, index, size };
    total = a.total;
    next = a.hasNext ?? (a.total === null ? rows.length >= size : null);
    // An empty first page with nothing after it: the empty list.
    if (rows.length === 0 && index === 0 && total === null && !next) total = 0;
    inner.setRows(rows, 'data');
    setStatus(IDLE);
  };

  /** A new epoch: the server's query, the zone, the params or the source changed. */
  const restart = (): void => {
    epochKey = `${server.key}|${ctx.timeZone}|${canonical(params)}`;
    gate.newEpoch();
    index = 0;
    endAt = null;
    // What the last answer said belongs to the old query: no "no rows", no clamp, from it.
    total = null;
    next = null;
    mark('query');
    load();
  };
  const rekey = (): void => {
    if (`${server.key}|${ctx.timeZone}|${canonical(params)}` !== epochKey) restart();
  };

  const hasNext = (): boolean =>
    !(endAt !== null && (index + 1) * size >= endAt) && (next ?? (total !== null && (index + 1) * size < total));
  const unfiltered = (): boolean => server.quick === undefined && (!server.filter || Object.keys(server.filter).length === 0);

  commit(() => {
    const split = splitQuery(env.query ?? EMPTY_QUERY, ops);
    server = split.server;
    inner.setQuery(split.client);
    restart();
  }, 'data');

  return {
    kind: 'source',
    ops,
    get displayed() { return inner.displayed; },
    get status() { return status; },
    get problems() { return problems(); },
    get counts() {
      if (!serverPages) return inner.counts;
      return { total: unfiltered() ? total : null, filtered: total, displayed: inner.displayed.count };
    },
    selectAll: serverPages ? 'query' : 'displayed',
    keeps: serverPages ? () => true : inner.keeps,
    row: inner.row,
    get page() {
      if (!serverPages) return inner.page;
      return { index, size, sizes, total, pageCount: total === null ? null : pageCountOf(total, size), hasNext: hasNext(), canJump: paging === 'offset' };
    },
    get diagnostics() { return { fetches, gate: gate.diagnostics }; },
    warmSearch: () => (ops.quick === 'server' ? DONE : inner.warmSearch()),
    setQuery(q, source = 'api') {
      commit(() => {
        const split = splitQuery(q, ops);
        inner.setQuery(split.client, source);
        server = split.server;
        rekey();
      }, source);
    },
    setColumns(columns, source = 'host') {
      commit(() => inner.setColumns(columns, source), source);
    },
    setContext(next, source = 'host') {
      commit(() => {
        inner.setContext(next, source);
        ctx = next;
        rekey();
      }, source);
    },
    setPage(p, source = 'api') {
      if (!serverPages) return commit(() => inner.setPage(p, source), source);
      if (checkPage(p).length) return;
      let s = size;
      let i = index;
      if (p.size !== undefined && p.size !== s) {
        i = resizeIndex(i, s, p.size);
        s = p.size;
      }
      if (p.index !== undefined) i = p.index;
      if (total !== null) i = Math.min(i, pageCountOf(total, s) - 1);
      if (s === size && i === index) return;
      commit(() => {
        size = s;
        index = i;
        mark('page');
        load();
      }, source);
    },
    invalidate(opts) {
      commit(() => {
        if (opts?.purge) {
          // Nothing left to keep: the first-load overlay shows.
          inner.setRows([], 'data');
          shown = null;
          mark('query');
        }
        load();
      }, 'api');
    },
    // Page options, paging and maxRows stay the first binding's: the new one brings its data and params.
    setSource(nextBinding, source = 'api') {
      const b = bound.get(nextBinding);
      if (nextBinding === current || !b) return;
      commit(() => {
        current = nextBinding;
        ({ data, params } = b);
        shown = null;
        restart();
      }, source);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
      inner.destroy();
      gate.destroy();
    },
  };
}
