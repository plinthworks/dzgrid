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
const MAX_ROWS = 100_000;

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
 * order the answers come in, the last ask is what shows. By cursor, each page
 * is asked with the cursor the page before gave, so only pages reached can be
 * asked. Without server pages it fetches the whole set the server's part of
 * the query matches, once, and the client model filters, sorts and pages the
 * rest in the browser: a change there asks nothing.
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

interface Answer {
  /** Null: refused. */
  readonly rows: readonly unknown[] | null;
  readonly total: number | null;
  readonly hasNext: boolean | null;
  /** By cursor, the next page's; null: no next page. */
  readonly cursor: string | null;
  readonly problems: Problem[];
}

/**
 * An answer read: what it says, bent where it says it wrong. For page `index`
 * of `size` (`cursors`: a next page needs its cursor), or for the fetched set
 * (`at` null), where only the rows count, and their number against `maxRows`.
 */
function readAnswer(r: unknown, at: { readonly index: number; readonly size: number; readonly cursors: boolean } | null, maxRows: number): Answer {
  const a = r as { rows?: unknown; total?: unknown; hasNext?: unknown; nextCursor?: unknown } | null;
  if (typeof r !== 'object' || a === null || !Array.isArray(a.rows)) return { rows: null, total: null, hasNext: null, cursor: null, problems: [problem('invalid-page-response', 'error', 'response')] };
  const problems: Problem[] = [];
  if (!at) {
    // Kept whole: cutting the set would make the counts lie.
    if (a.rows.length > maxRows) problems.push(problem('fetched-set-large', 'warning', 'response.rows'));
    return { rows: a.rows, total: null, hasNext: null, cursor: null, problems };
  }
  const { index, size } = at;
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
  let cursor: string | null = null;
  // A next page, said, from the total or inferred, is reached only by its cursor: none, no next page.
  if (at.cursors && (hasNext ?? (total !== null ? (index + 1) * size < (total as number) : a.rows.length >= size))) {
    if (typeof a.nextCursor === 'string') cursor = a.nextCursor;
    else {
      problems.push(warn('response.nextCursor'));
      hasNext = false;
    }
  }
  return { rows: a.rows, total: total as number | null, hasNext: hasNext as boolean | null, cursor, problems };
}

function createSource<T>(binding: SourceBinding<T>, env: ModelEnv<T>, o: SourceRowsOptions): SourceModel<T> {
  const { ops, problems: opsProblems } = resolveOperations(env.operations, true);
  const serverPages = ops.page === 'server';
  const fixed: Problem[] = [...opsProblems];
  let paging: 'offset' | 'cursor' = 'offset';
  if (o.paging !== undefined) {
    if (o.paging === 'offset' || o.paging === 'cursor') paging = o.paging;
    else fixed.push(problem('invalid-page', 'error', 'source.paging'));
  }
  if (paging === 'cursor' && !serverPages) fixed.push(problem('invalid-page', 'warning', 'source.paging'));
  // Read under server pages only: a fetched set has no cursor.
  const cursorMode = paging === 'cursor';
  let maxRows = MAX_ROWS;
  if (o.maxRows !== undefined) {
    if (positiveInt(o.maxRows)) maxRows = o.maxRows;
    else fixed.push(problem('invalid-page', 'error', 'source.maxRows'));
  }
  // Paging off wins over a pagination setting: ignored, with a warning (its values are not read).
  if (ops.page === 'off' && env.page !== undefined) fixed.push(problem('invalid-page', 'warning', 'pagination'));
  // Pages in the browser: the client model reads the setting and tells its faults.
  const pageOptions = resolvePageOptions(serverPages ? env.page : undefined);
  fixed.push(...pageOptions.problems);
  const sizes = pageOptions.config?.sizes ?? DEFAULT_PAGE_SIZES;

  const gate = createGate(o.abort ?? env.abort ?? plainAbort);
  const inner = clientRows<T>({ rows: [], getRowId: env.getRowId, columns: env.columns, ctx: env.ctx, ...(ops.page === 'client' && { page: env.page ?? {} }) });
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
  // A refresh asked for fresh rows: the step-back asks the page on screen again rather than keep it.
  let fresh = false;
  /** By cursor: the cursor of each page reached in the epoch (page 0 has none); only these pages can be asked. */
  let cursors: (string | null)[] = [null];
  /** The page the rows shown answered: null before the first answer, after a purge or a new source. */
  let shown: { readonly key: string; readonly index: number; readonly size: number } | null = null;
  /** The fetched set answers the current epoch: a new epoch (even back to the key shown) forgets its counts until then. */
  let answered = false;
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
    const page: PageWindow | undefined = serverPages ? { index, size, offset: index * size, cursor: cursorMode ? cursors[index]! : null } : undefined;
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
    setStatus({ phase: 'error', failure: error, key: req.key, page: req.page?.index ?? null });
    failure = { error, key: req.key, page: req.page?.index ?? null };
  };

  /** An accepted answer, for the page asked now (the gate accepts only the last request). */
  const answer = (t: Ticket, req: DataRequest, r: unknown): void => {
    const a = readAnswer(r, serverPages ? { index, size, cursors: cursorMode } : null, maxRows);
    answerProblems = a.problems;
    told.push(...a.problems);
    if (!a.rows) return failed(t, req, a.problems[0]);
    const rows = a.rows as readonly T[];
    if (!serverPages) {
      // The set of another epoch: its first page. The same set again (a refresh): the page kept, clamped.
      if (!shown || shown.key !== epochKey) {
        mark('query');
        inner.setPage({ index: 0 }, 'data');
      }
      shown = { key: epochKey, index: 0, size };
      answered = true;
      inner.setRows(rows, 'data');
      return setStatus(IDLE);
    }
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
        // The empty page's cursor leads nowhere: the pages from it are out of reach.
        if (cursorMode) cursors.length = index;
        mark('page');
        const known = shown && shown.key === epochKey && shown.size === size && shown.index < index ? shown.index : -1;
        index = Math.floor((known + index) / 2);
        if (index === known && !fresh) return setStatus(IDLE);
        return load();
      }
    }
    fresh = false;
    mark(!shown || shown.key !== epochKey ? 'query' : shown.index === index && shown.size === size ? 'rows' : 'page');
    shown = { key: epochKey, index, size };
    total = a.total;
    next = a.hasNext ?? (a.total === null ? rows.length >= size : null);
    // What follows this page is what it says now: cursors after it came from older answers.
    if (cursorMode) {
      cursors.length = index + 1;
      if (a.cursor !== null) cursors.push(a.cursor);
    }
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
    cursors = [null];
    answered = false;
    // What the last answer said belongs to the old query: no "no rows", no clamp, no warning, from it.
    total = null;
    next = null;
    answerProblems = [];
    mark('query');
    load();
  };
  const rekey = (): void => {
    if (`${server.key}|${ctx.timeZone}|${canonical(params)}` !== epochKey) restart();
  };

  const hasNext = (): boolean =>
    !(endAt !== null && (index + 1) * size >= endAt) && (next ?? (total !== null && (index + 1) * size < total)) && (!cursorMode || index + 1 < cursors.length);
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
      if (!serverPages) {
        // The set held counts once it answers the current epoch: a set of another query is not this one's total.
        const c = inner.counts;
        return { total: answered && unfiltered() ? c.total : null, filtered: answered ? c.filtered : null, displayed: c.displayed };
      }
      return { total: unfiltered() ? total : null, filtered: total, displayed: inner.displayed.count };
    },
    selectAll: serverPages ? 'query' : 'displayed',
    keeps: serverPages ? () => true : inner.keeps,
    row: inner.row,
    get page() {
      if (!serverPages) return inner.page;
      return { index, size, sizes, total, pageCount: total === null ? null : pageCountOf(total, size), hasNext: hasNext(), canJump: !cursorMode };
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
      const resized = p.size !== undefined && p.size !== s;
      if (resized) {
        i = resizeIndex(i, s, p.size!);
        s = p.size!;
      }
      if (p.index !== undefined) i = p.index;
      if (total !== null) i = Math.min(i, pageCountOf(total, s) - 1);
      // By cursor, no further than the last page reached; at a new size no page is reached but the first.
      if (cursorMode) i = Math.min(i, resized ? 0 : cursors.length - 1);
      if (s === size && i === index) return;
      commit(() => {
        if (resized) cursors = [null];
        size = s;
        index = i;
        mark('page');
        load();
      }, source);
    },
    invalidate(opts) {
      commit(() => {
        // Asked again: the server may say more now (an end found past an unknown total may have moved).
        endAt = null;
        fresh = true;
        if (opts?.purge) {
          // Nothing left to keep: the first-load overlay shows.
          inner.setRows([], 'data');
          shown = null;
          answered = false;
          answerProblems = [];
          // No cursor survives: by cursor, back to the first page.
          if (cursorMode) {
            index = 0;
            cursors = [null];
          }
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
