import { refusedValues, type ModelChange, type ModelEnv, type ModelStatus, type SearchWarmup, type SourceBinding, type SourceHandle } from '../model/client.js';
import { splitQuery, type Operations, type ServerQuery } from '../model/operations.js';
import { canonical, EMPTY_QUERY } from '../model/query.js';
import type { ChangeSource } from '../model/types.js';
import { closedValues, tickedIn } from '../model/values.js';
import { problem, type Problem } from '../problems.js';
import { dataKey, type DisplayIndex, type RowKey } from '../ids.js';
import type { DisplayedRows } from '../row/displayed.js';
import type { BlockLoadingNode, DataNode } from '../row/node.js';
import type { RowTransaction, TransactionResult } from '../row/store.js';
import type { AbortHandle } from '../abort.js';
import { createBlockStore } from './blocks.js';
import { createGate, type GateDiagnostics, type Ticket } from './gate.js';
import { isThenable, plainAbort, readAnswer, wireCache } from './shared.js';
import type { DataRequest, DataSource, Json } from './source.js';
import { serverValues } from './values.js';
import type { WireFilterModel } from './wire.js';

/** Fixed when the model is made (infinite-scroll.md); another binding given later brings its data and params only. */
export interface InfiniteOptions {
  /** Rows per request (100 by default, owner Q-BLK A). */
  readonly blockSize?: number;
  /** Blocks held at most (20 by default): the least recently seen goes first. */
  readonly maxBlocks?: number;
  /** Blocks asked past the window in the scroll's direction (1). */
  readonly ahead?: number;
  /** Requests running at once (2). */
  readonly concurrency?: number;
  /** After a jump of more than one block, nothing is asked until the window has rested this long (60 ms). */
  readonly restMs?: number;
  /** `applyTransactionAsync` gathers what arrives within this delay into one change (50 ms, owner Q-TX A). */
  readonly batchMs?: number;
  readonly params?: Readonly<Record<string, Json>>;
  /** Taken before the grid's: `() => new AbortController()` fits. */
  readonly abort?: () => AbortHandle;
}

export interface InfiniteDiagnostics {
  /** Block requests sent. */
  readonly fetches: number;
  readonly valueFetches: number;
  readonly gate: GateDiagnostics;
  /** `held` now, `asked` in all, `evicted` let go for room, `max` the most held at once, `failed` blocks that failed. */
  readonly blocks: { readonly held: number; readonly asked: number; readonly evicted: number; readonly max: number; readonly failed: number };
}

export interface InfiniteModel<T> extends SourceHandle<T> {
  readonly diagnostics: InfiniteDiagnostics;
  /** The window painted and the positions to keep (the DOM calls it after each paint): what lacks is asked. */
  want(first: number, last: number, keep?: readonly number[]): void;
  /**
   * A host's live change (D11): rows updated or patched by id replace the rows held in place (a row not held is left to
   * the server); rows added or removed ask the window again, its rows kept. One change.
   */
  applyTransaction(tx: RowTransaction<T>, source?: ChangeSource): TransactionResult;
  /** The same, gathered: what arrives within `batchMs` is one change, at most one request of the window; `done` per transaction. */
  applyTransactionAsync(tx: RowTransaction<T>, done?: (r: TransactionResult) => void): void;
}

/** What `infiniteRows` gives: a binding for the `source` setting. */
export interface InfiniteRows<T> extends SourceBinding<T> {
  create(env: ModelEnv<T>): InfiniteModel<T>;
}

type Kind = ModelChange<unknown>['kind'];
const RANK: Record<Kind, number> = { status: 1, context: 2, expand: 2, order: 3, rows: 4, page: 5, query: 6 };
const IDLE: ModelStatus = { phase: 'idle' };
const LOADING: ModelStatus = { phase: 'loading' };
const DONE: SearchWarmup = { step: () => true, progress: 1, cancel() {} };
/** Everything on the server, one list (D3). */
const OPS: Operations = { filter: 'server', quick: 'server', sort: 'server', page: 'off' };
const bound = new WeakMap<object, { readonly data: DataSource<any>; readonly params: Readonly<Record<string, Json>> }>();

/**
 * A list fed by a server in blocks as it scrolls (`source: infiniteRows(data, …)`, Phase 8, infinite-scroll.md): every
 * row of the query in one list, the rows held in at most `maxBlocks` blocks of `blockSize`, the others shown as loading
 * rows. The grid tells the window after each paint (`want`); the blocks it touches are asked through the request gate,
 * one channel per block, so an answer of an older query or of a request asked again since is never applied.
 */
export function infiniteRows<T>(data: DataSource<T>, o: InfiniteOptions = {}): InfiniteRows<T> {
  const binding: InfiniteRows<T> = { create: (env) => createInfinite(binding, env, o) };
  bound.set(binding, { data, params: o.params ?? {} });
  return binding;
}

function createInfinite<T>(binding: SourceBinding<T>, env: ModelEnv<T>, o: InfiniteOptions): InfiniteModel<T> {
  const fixed: Problem[] = [];
  const int = (v: unknown, min: number, def: number, path: string): number => {
    if (v === undefined) return def;
    if (typeof v === 'number' && Number.isInteger(v) && v >= min) return v;
    fixed.push(problem('invalid-page', 'error', `source.${path}`));
    return def;
  };
  const size = int(o.blockSize, 1, 100, 'blockSize');
  const restMs = int(o.restMs, 0, 60, 'restMs');
  const batchMs = int(o.batchMs, 0, 50, 'batchMs');
  // Operations (D3): a placement in the browser is refused, read as the server's; `page` reads `off` (one list).
  const oi = env.operations as unknown;
  const bad = (op: string): number => fixed.push(problem('invalid-operations', 'error', op ? `operations.${op}` : 'operations', 'blocks'));
  if (oi === 'client' || (oi !== undefined && oi !== 'server' && (typeof oi !== 'object' || oi === null))) bad('');
  else if (typeof oi === 'object') for (const op of ['filter', 'quick', 'sort', 'page']) {
    const v = (oi as Record<string, unknown>)[op];
    if (v !== undefined && v !== 'server' && !(op === 'page' && v === 'off')) bad(op);
  }
  if (env.page !== undefined) fixed.push(problem('invalid-page', 'warning', 'pagination'));
  // A tree, details, groups (D17): positions the server counts cannot hold rows of the browser's making.
  if (env.shape) fixed.push(problem('unsupported-combination', 'warning', 'shape', env.shape.kind));

  const gate = createGate(o.abort ?? env.abort ?? plainAbort);
  let current = binding;
  let { data, params } = bound.get(binding)!;
  let ctx = env.ctx;
  let columns = env.columns;
  let dataVersion = columns.dataVersion;
  let app = env.app;
  let server: ServerQuery = splitQuery(env.query ?? EMPTY_QUERY, OPS).server;
  let wire: WireFilterModel | undefined;
  let wireProblems: readonly Problem[] = [];
  let epochKey = '';
  const wired = wireCache<T>(env, () => ({ ctx, columns, app }));

  /** The list's length when known (a total, or an end found); else `reach` (the furthest row answered), and `more` after it. */
  let known: number | null = null;
  let reach = 0;
  let more = false;
  let far = -1;
  let status: ModelStatus = LOADING;
  let answerProblems: readonly Problem[] = [];
  let fetches = 0;
  let valueFetches = 0;
  let failedBlocks = 0;
  /** Each block's running request: an answer counts only for it. */
  const tickets = new Map<number, Ticket>();
  /** The blocks a refresh (or the first load) waits for: the model is `loading` until they answer. */
  let refreshing = new Set<number>();
  /** Blocks let go for a duplicate id, by epoch: the second time, they fail. */
  let dups = new Map<number, number>();
  /** Where each data row held is: its block. */
  const index = new Map<RowKey, number>();
  let win: { lo: number; hi: number; keep: readonly number[] } | null = null;
  let lastLo = -1;
  let rest: (() => void) | null = null;
  let held = !!env.held;
  const deferred = new Set<number>();
  let destroyed = false;
  const listeners = new Set<(c: ModelChange<T>) => void>();
  const lists = new Map<string, ReturnType<typeof serverValues<T>>>();
  let reask = false;
  /** No block of this epoch answered yet: the first answer is told as a new query's. */
  let opening = true;

  const count = (): number => known ?? reach + (more ? size : 0);
  const limit = (): number => Math.ceil(count() / size);

  const store = createBlockStore<DataNode<T> | null>({
    max: int(o.maxBlocks, 1, 20, 'maxBlocks'),
    ahead: int(o.ahead, 0, 1, 'ahead'),
    concurrency: int(o.concurrency, 1, 2, 'concurrency'),
    ask: (n) => ask(n),
    cancel(n) {
      deferred.delete(n);
      tickets.delete(n);
      gate.cancel(`block:${n}`);
      gate.forget?.(`block:${n}`);
      if (refreshing.delete(n) && !refreshing.size) setStatus(IDLE);
    },
    dropped(b) {
      for (const r of b.rows as readonly (DataNode<T> | null)[]) if (r && index.get(r.key) === b.n) index.delete(r.key);
      touch('rows');
    },
  });

  // ---- one commit per call, as `sourceRows` ----
  let depth = 0;
  let kind: Kind | null = null;
  let dirty = true;
  let view: DisplayedRows<T>;
  let version = 0;
  let told: Problem[] = [];
  let failure: ModelChange<T>['failure'];
  let tx: TransactionResult | undefined;
  const mark = (k: Kind): void => {
    if (kind === null || RANK[k] > RANK[kind]) kind = k;
  };
  const touch = (k: Kind): void => {
    mark(k);
    dirty = true;
  };
  const setStatus = (s: ModelStatus): void => {
    if (s.phase !== status.phase) mark('status');
    status = s;
  };
  const problems = (): readonly Problem[] => [...fixed, ...wireProblems, ...answerProblems];
  const commit = (fn: () => void, source: ChangeSource): void => {
    if (destroyed) return;
    depth++;
    try {
      fn();
    } finally {
      depth--;
    }
    if (depth) return;
    // A block a refresh waited for, let go without a request ended (left the window while waiting, dropped by an end
    // found or a duplicate, evicted): nothing will answer it, the refresh does not wait for it (review 1).
    let gone = false;
    for (const n of refreshing) if (!store.running.has(n) && store.blocks.get(n)?.state !== 'waiting') (refreshing.delete(n), (gone = true));
    if (gone && !refreshing.size && status.phase === 'loading') setStatus(IDLE);
    if (dirty) view = makeView();
    dirty = false;
    const k = kind;
    const c: ModelChange<T> | null = k && !destroyed ? { source, displayed: view, kind: k, problems: problems(), ...(told.length > 0 && { told }), ...(failure && { failure }), ...(tx && { transaction: tx }) } : null;
    kind = null;
    told = [];
    failure = undefined;
    tx = undefined;
    if (c) for (const fn of [...listeners]) fn(c);
    const again = reask;
    reask = false;
    if (!destroyed) for (const h of [...lists.values()]) h.reconcile(again);
  };

  /** The rows shown at this version (D4): fixed once made, whatever the blocks do next. */
  const makeView = (): DisplayedRows<T> => {
    const n = count();
    const rows = new Map<number, readonly (DataNode<T> | null)[]>();
    const failed = new Set<number>();
    for (const b of store.blocks.values()) {
      if (b.rows) rows.set(b.n, b.rows);
      else if (b.state === 'failed') failed.add(b.n);
    }
    const order = [...rows.keys()].sort((a, b) => a - b);
    let at: Map<RowKey, number> | null = null;
    let data = 0;
    for (const b of order) rows.get(b)!.forEach((r, j) => void (r && b * size + j < n && data++));
    const check = (i: number): number => {
      if (!(Number.isInteger(i) && i >= 0 && i < n)) throw new RangeError(`no displayed row ${i}`);
      return i;
    };
    // A place not held: loading; failed when its block failed, or when its row could not be taken (no id, an id twice).
    const nodeAt = (i: number): DataNode<T> | BlockLoadingNode => {
      const b = Math.floor(check(i) / size);
      const r = rows.get(b);
      return r?.[i - b * size] ?? { key: `l:#${i}` as RowKey, kind: 'loading', level: 0, parent: null, failed: failed.has(b) || !!r };
    };
    const v: DisplayedRows<T> = {
      version: ++version,
      count: n,
      dataCount: data,
      nodeAt: nodeAt as DisplayedRows<T>['nodeAt'],
      keyAt: (i) => nodeAt(i).key,
      index: (k) => (Number.isInteger(k) && k >= 0 && k < n ? (k as DisplayIndex) : null),
      indexOf(key) {
        if (key.startsWith('l:#')) {
          const i = Number(key.slice(3));
          return Number.isInteger(i) && i >= 0 && i < n && nodeAt(i).key === key ? (i as DisplayIndex) : -1;
        }
        if (!at) {
          at = new Map();
          for (const b of order) rows.get(b)!.forEach((r, j) => r && b * size + j < n && at!.set(r.key, b * size + j));
        }
        return (at.get(key) ?? -1) as DisplayIndex | -1;
      },
      nextData(i, delta) {
        const j = i + delta;
        const node = j >= 0 && j < n ? nodeAt(j) : null;
        return node?.kind === 'data' ? node : null;
      },
      *held() {
        for (const b of order) {
          const r = rows.get(b)!;
          for (let j = 0; j < r.length && b * size + j < n; j++) if (r[j]) yield (b * size + j) as DisplayIndex;
        }
      },
    };
    return v;
  };

  /** The server's part of the query as sent (the wire filter, the search, the sort), the params and the zone. */
  const partsOf = (): { filter?: WireFilterModel; quick?: string; sort?: unknown; params: Readonly<Record<string, Json>>; zone: string } => ({
    ...(wire && { filter: wire }),
    ...(server.quick !== undefined && { quick: server.quick }),
    ...(server.sort && { sort: server.sort }),
    params,
    zone: ctx.timeZone,
  });

  /** Block `n` asked, on its own channel; held (`hold(fn)`): sent at the hold's end. */
  function ask(n: number): void {
    if (held) return void deferred.add(n);
    const ch = `block:${n}`;
    const page = { index: n, size, offset: n * size, cursor: null };
    const parts = { ...partsOf(), page, blocks: true as const };
    const key = canonical(parts);
    const { ticket, signal } = gate.begin(ch, key);
    tickets.set(n, ticket);
    fetches++;
    let done = false;
    const settle = (ok: boolean) => (v: unknown): void => {
      if (done) return;
      done = true;
      const verdict = gate.settle(ticket);
      gate.forget?.(ch);
      if (verdict !== null || tickets.get(n) !== ticket) return;
      tickets.delete(n);
      commit(() => (ok ? answer(n, v, key) : fail(n, v, key)), 'data');
    };
    try {
      const r: unknown = data.fetch({ ...parts, key, signal } as DataRequest);
      if (isThenable(r)) r.then(settle(true), settle(false));
      else settle(true)(r);
    } catch (error) {
      settle(false)(error);
    }
  }

  /** A failure: the model's when nothing is shown or a refresh waited for it; otherwise its block's only, said by its rows. */
  function fail(n: number, error: unknown, key: string): void {
    if (refreshing.has(n) || count() === 0) {
      refreshing = new Set();
      setStatus({ phase: 'error', failure: error, key, page: n });
      failure = { error, key, page: n };
      // Rows kept (a refresh) stay as they were; a block without rows fails its places.
      store.failed(n);
      if (count()) dirty = true;
    } else {
      failedBlocks++;
      store.failed(n);
      touch('rows');
    }
  }

  function answer(n: number, r: unknown, asked: string): void {
    const a = readAnswer(r, { index: n, size, cursors: false }, 0);
    answerProblems = a.problems;
    told.push(...a.problems);
    if (!a.rows) return fail(n, a.problems[0], asked);
    const offset = n * size;
    const rows = a.rows.slice(0, size) as readonly T[];
    // This block's own keys go first: its new rows replace them.
    const old = store.blocks.get(n)?.rows;
    if (old) for (const x of old) if (x && index.get(x.key) === n) index.delete(x.key);
    const nodes: (DataNode<T> | null)[] = [];
    rows.forEach((row, j) => {
      let id: unknown;
      try {
        id = env.getRowId(row);
      } catch {}
      const key = dataKey(id);
      const was = key ? index.get(key) : undefined;
      if (!key || was === n) {
        told.push(problem(key ? 'duplicate-row-id' : 'invalid-row-id', key ? 'warning' : 'error', `response.rows[${j}]`));
        return void nodes.push(null);
      }
      if (was !== undefined) {
        // The list changed under the view: the row takes its new place; its old block goes (asked again once when shown).
        told.push(problem('duplicate-row-id', 'warning', `response.rows[${j}]`));
        const d = (dups.get(was) ?? 0) + 1;
        dups.set(was, d);
        if (d > 1) {
          failedBlocks++;
          store.failed(was, true);
        } else store.drop(was);
      }
      index.set(key, n);
      nodes.push({ key, kind: 'data', level: 0, id: id as DataNode<T>['id'], data: row });
    });
    const len = rows.length;
    const first = opening;
    opening = false;
    if (len < size || a.hasNext === false) known = offset + len;
    else if (a.total !== null) known = Math.max(a.total, offset + len);
    else if (known === null) {
      if (offset + len > reach) reach = offset + len;
      if (n >= far) {
        far = n;
        more = a.hasNext ?? true;
      }
    }
    // An end before blocks held: they go.
    if (known !== null) for (const b of [...store.blocks.keys()]) if (b * size >= known && b !== n) store.drop(b);
    store.answered(n, nodes);
    // An error before (the first block, a refresh) is over once rows arrive and nothing else is awaited (review 2).
    if ((refreshing.delete(n) || status.phase === 'error') && !refreshing.size) setStatus(IDLE);
    touch(first ? 'query' : 'rows');
  }

  // ---- the query ----
  const keyNow = (): string => {
    const w = server.filter ? wired.of(server.filter) : undefined;
    wire = w?.filter;
    wireProblems = w?.problems ?? [];
    return canonical({ filter: wire, quick: server.quick, sort: server.sort, zone: ctx.timeZone, params });
  };
  /** A new epoch (D9): every block and request dropped, the end forgotten, the first block asked now. */
  const restart = (key = keyNow()): void => {
    epochKey = key;
    gate.newEpoch();
    tickets.clear();
    store.clear();
    index.clear();
    dups = new Map();
    known = null;
    reach = 0;
    more = false;
    far = -1;
    win = null;
    lastLo = -1;
    rest?.();
    rest = null;
    answerProblems = [];
    opening = true;
    refreshing = new Set([0]);
    setStatus(LOADING);
    touch('query');
    store.again(0);
  };
  const rekey = (): void => {
    const sig = (): string => canonical(wireProblems.map((p) => [p.code, p.path, p.detail]));
    const was = sig();
    const key = keyNow();
    const news = wireProblems.length > 0 && sig() !== was;
    if (news) told.push(...wireProblems);
    if (key !== epochKey) return restart(key);
    if (sig() !== was) {
      if (!news) told.push(...wireProblems);
      mark('status');
    }
  };
  /** A refresh (D10 A): the window asked again, its rows kept; every other block stale. */
  const refresh = (): void => {
    reask = true;
    if (!count()) {
      refreshing = new Set([0]);
      setStatus(LOADING);
      store.again(0);
      return touch('status');
    }
    store.stale();
    refreshing = new Set();
    if (win) for (let n = win.lo; n <= win.hi && n < limit(); n++) refreshing.add(n);
    for (const n of refreshing) store.again(n);
    if (refreshing.size) setStatus(LOADING);
    touch('status');
  };
  const unfiltered = (): boolean => server.quick === undefined && (!wire || Object.keys(wire).length === 0);

  /** The window applied: what lacks asked (D6). */
  const apply = (): void => commit(() => void (win && store.want(win.lo, win.hi, win.keep, limit())), 'data');

  // ---- transactions (D11) ----
  const take = (t: RowTransaction<T>, updated: RowKey[], bad: Problem[]): boolean => {
    const put = (row: T, path: string): void => {
      let id: unknown;
      try {
        id = env.getRowId(row);
      } catch {}
      const key = dataKey(id);
      if (!key) return void bad.push(problem('invalid-row-id', 'error', path));
      const n = index.get(key);
      const b = n === undefined ? undefined : store.blocks.get(n);
      if (!b?.rows) return;
      b.rows = b.rows.map((x) => (x?.key === key ? { ...x, data: row } : x));
      updated.push(key);
    };
    t.update?.forEach((r, i) => put(r, `update[${i}]`));
    t.patch?.forEach((p, i) => {
      const key = dataKey(p.id);
      const n = key ? index.get(key) : undefined;
      const node = n === undefined ? undefined : store.blocks.get(n)?.rows?.find((x) => x?.key === key);
      if (node) put({ ...node.data, ...p.set } as T, `patch[${i}]`);
    });
    return !!(t.add?.length || t.remove?.length);
  };
  const result = (updated: RowKey[], moved: boolean, bad: Problem[]): TransactionResult => ({ kind: updated.length || moved ? 'delta' : 'none', version: view.version, added: [], updated, removed: [], problems: bad });
  let batch: [RowTransaction<T>, ((r: TransactionResult) => void) | undefined][] = [];
  let flushing: (() => void) | null = null;
  const flush = (): void => {
    flushing = null;
    const q = batch;
    batch = [];
    const out: [RowKey[], boolean, Problem[]][] = [];
    commit(() => {
      let moved = false;
      for (const [t] of q) {
        const u: RowKey[] = [];
        const bad: Problem[] = [];
        const m = take(t, u, bad);
        moved ||= m;
        out.push([u, m, bad]);
        if (u.length) touch('rows');
      }
      if (moved) refresh();
      told.push(...out.flatMap((x) => x[2]));
    }, 'data');
    q.forEach(([, done], i) => done?.(result(...out[i]!)));
  };

  commit(() => restart(), 'data');

  const model: InfiniteModel<T> = {
    kind: 'source',
    ops: OPS,
    get displayed() { return view; },
    allRows: undefined,
    get status() { return status; },
    get problems() { return problems(); },
    get counts() { return { total: unfiltered() ? known : null, filtered: known, displayed: count() }; },
    selectAll: 'query',
    keeps: () => true,
    membershipOf(q) {
      const s = splitQuery(q, OPS).server;
      return canonical({ wire: s.filter && wired.of(s.filter).filter, quick: s.quick, params });
    },
    get scope() { return { params, zone: ctx.timeZone }; },
    row(key) {
      const n = index.get(key);
      return n === undefined ? undefined : store.blocks.get(n)?.rows?.find((x) => x?.key === key) ?? undefined;
    },
    page: null,
    // One list: no page to go to.
    setPage() {},
    get diagnostics() { return { fetches, valueFetches, gate: gate.diagnostics, blocks: { ...store.diagnostics, failed: failedBlocks } }; },
    want(first, last, keep = []) {
      if (destroyed) return;
      const lo = Math.floor(first / size);
      const hi = Math.floor(last / size);
      const jump = lastLo >= 0 && Math.abs(lo - lastLo) > 1;
      lastLo = lo;
      win = { lo, hi, keep: keep.map((i) => Math.floor(i / size)) };
      rest?.();
      rest = null;
      // Moving faster than a block at a time (a thumb drag, Page Down held): asked once the window rests.
      if (jump && env.timer && restMs > 0) rest = env.timer(() => ((rest = null), apply()), restMs);
      else apply();
    },
    setValues(column, vo = {}) {
      lists.get(column)?.close();
      const refused = refusedValues(columns.get(column), column);
      if (refused) return refused;
      if (!data.values || destroyed) return closedValues();
      const h = serverValues<T>({
        gate,
        data: () => data,
        parts: (col) => {
          const filter = { ...wire };
          delete filter[col];
          return { ...(Object.keys(filter).length > 0 && { filter }), ...(server.quick !== undefined && { quick: server.quick }), params, zone: ctx.timeZone };
        },
        ticked: (col) => tickedIn(server.filter ?? {}, col),
        column: (id) => columns.get(id),
        ctx: () => ctx,
        counted: () => void valueFetches++,
      }, column, vo, () => lists.delete(column));
      lists.set(column, h);
      return h;
    },
    warmSearch: () => DONE,
    setQuery(q, source = 'api') {
      commit(() => {
        server = splitQuery(q, OPS).server;
        rekey();
      }, source);
    },
    setColumns(next, source = 'host') {
      commit(() => {
        if (next === columns && next.dataVersion === dataVersion) return;
        columns = next;
        dataVersion = next.dataVersion;
        rekey();
      }, source);
    },
    setContext(next, source = 'host') {
      commit(() => {
        ctx = next;
        rekey();
      }, source);
    },
    tick() {
      commit(() => {
        wired.clear();
        rekey();
      }, 'data');
    },
    setApp(next, source = 'api') {
      commit(() => {
        app = next;
        rekey();
      }, source);
    },
    invalidate(opts) {
      commit(() => (opts?.purge ? restart(epochKey) : refresh()), 'api');
    },
    hold(fn) {
      held = true;
      try {
        fn();
      } finally {
        held = false;
        for (const n of [...deferred]) {
          deferred.delete(n);
          if (store.running.has(n)) ask(n);
        }
      }
    },
    setSource(nextBinding, source = 'api') {
      const b = bound.get(nextBinding);
      if (nextBinding === current || !b) return;
      commit(() => {
        current = nextBinding;
        ({ data, params } = b);
        restart();
      }, source);
    },
    applyTransaction(t, source = 'api') {
      const u: RowKey[] = [];
      const bad: Problem[] = [];
      let m = false;
      commit(() => {
        m = take(t, u, bad);
        if (u.length) touch('rows');
        if (m) refresh();
        told.push(...bad);
        tx = { kind: u.length || m ? 'delta' : 'none', version: 0, added: [], updated: u, removed: [], problems: [] };
      }, source);
      return result(u, m, bad);
    },
    applyTransactionAsync(t, done) {
      if (destroyed) return;
      batch.push([t, done]);
      if (!env.timer) return flush();
      flushing ??= env.timer(flush, batchMs);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
      rest?.();
      flushing?.();
      gate.destroy();
      for (const h of [...lists.values()]) h.close();
    },
  };
  return model;
}
