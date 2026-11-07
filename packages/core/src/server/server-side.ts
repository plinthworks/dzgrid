import type { AggFuncName, ResolvedColumn } from '../columns/defs.js';
import type { ColumnLookup } from '../columns/model.js';
import type { SortItem } from '../sort/compile.js';
import type { LocaleCtx } from '../value/locale.js';
import { refusedValues, type ModelChange, type ModelEnv, type ModelStatus, type SearchWarmup, type SourceBinding, type SourceHandle } from '../model/client.js';
import { splitQuery, type Operations, type ServerQuery } from '../model/operations.js';
import { canonical, EMPTY_QUERY } from '../model/query.js';
import type { ChangeSource } from '../model/types.js';
import { closedValues, tickedIn } from '../model/values.js';
import { problem, type Problem } from '../problems.js';
import { dataKey, groupKey, type DisplayIndex, type RowKey } from '../ids.js';
import type { BlockLoadingNode, DataNode, FooterNode, GroupNode, LoadingNode, RowNode } from '../row/node.js';
import type { TreeRows } from '../tree/shape.js';
import type { RowTransaction, TransactionResult } from '../row/store.js';
import type { AbortHandle } from '../abort.js';
import { createBlockStore } from './blocks.js';
import { createGate, type GateDiagnostics, type Ticket } from './gate.js';
import { isThenable, plainAbort, readAnswer, wireCache } from './shared.js';
import { heldTransactions } from './tx.js';
import type { DataRequest, DataSource, GroupPart, GroupValue, Json, PivotPart } from './source.js';
import { serverValues } from './values.js';
import type { WireFilterModel } from './wire.js';

/** Fixed when the model is made (server-side-groups.md); another binding given later brings its data and params only. */
export interface ServerSideOptions {
  /** Rows (or groups) per request, at every level (100 by default). */
  readonly blockSize?: number;
  /** Blocks held at most across every level (20 by default): the least recently seen goes first. */
  readonly maxBlocks?: number;
  /** Blocks asked past the window (1). */
  readonly ahead?: number;
  /** Requests running at once (2). */
  readonly concurrency?: number;
  /** After a jump of more than one block, nothing is asked until the window has rested this long (60 ms). */
  readonly restMs?: number;
  /** `applyTransactionAsync` gathers what arrives within this delay into one change (50 ms, owner Q-TX A). */
  readonly batchMs?: number;
  /** The grouping columns, the first level first (empty: one flat list). `grouping({ by })` of `@dzgrid/dom/grouping` wins. */
  readonly by?: readonly string[];
  /** Totals asked of the server, by column id, by Phase 7's names (a function is refused: the server computes them). */
  readonly aggFuncs?: Readonly<Record<string, AggFuncName>>;
  /** Totals rows: none (default), a footer per open group (its server totals), the grand total (the server's), or both. */
  readonly footers?: 'none' | 'group' | 'grand' | 'both';
  readonly grandTotal?: 'top' | 'bottom';
  readonly params?: Readonly<Record<string, Json>>;
  /** Taken before the grid's: `() => new AbortController()` fits. */
  readonly abort?: () => AbortHandle;
  /** `serverPivot()` of `@dzgrid/core/server-pivot`: the server pivots the groups (server-pivot.md); else a pivot is refused. */
  readonly pivot?: ServerPivotPlug;
}

/** What `serverPivot()` gives: the model links it to its pivot shape (`grouping({ pivot })` of `@dzgrid/dom`). */
export interface ServerPivotPlug {
  /** @internal Null when the rows' shape is no pivot: the server groups as without it. */
  link(env: ModelEnv<any>, model: ServerPivotHooks): ServerPivotLink | null;
}

/** @internal What the model lends its plug: ask again (a new epoch when the request moved), and what it shows and reads. */
export interface ServerPivotHooks {
  again(source: ChangeSource): void;
  view(): TreeRows<any>;
  columns(): ColumnLookup<any>;
  ctx(): LocaleCtx;
}

/** @internal The plug at work (`@dzgrid/core/server-pivot`): the request's pivot part, then each answer read. */
export interface ServerPivotLink {
  /** The pivot part, the sort sent and the values, for this grouping and sort; null: pivot off or both bands empty. */
  part(by: readonly string[], sort: readonly SortItem[] | undefined, told: Problem[]): { readonly pivot: PivotPart; readonly sort?: readonly SortItem[]; readonly fns: Readonly<Record<string, unknown>> } | null;
  /** A first-level answer's `pivot` read (`first`: the epoch's first block): the grand total row's cells. */
  root(raw: Readonly<Record<string, unknown>>, first: boolean, told: Problem[]): Readonly<Record<string, unknown>> | undefined;
  /** A group's `cells` by created column id. */
  cells(x: unknown, path: string, told: Problem[]): Readonly<Record<string, unknown>>;
  /** The pivot part as an export carries it: with the crossings known. */
  full(p: PivotPart): PivotPart;
  /** What stands while the list does (above the limit: its count), as the browser pivot's problems. */
  readonly problems: readonly Problem[];
}

export interface ServerSideDiagnostics {
  readonly fetches: number;
  readonly valueFetches: number;
  readonly gate: GateDiagnostics;
  /** Over every level: `held` now, `asked` in all, `evicted` let go for room, `max` the most held at once, `failed`. */
  readonly blocks: { readonly held: number; readonly asked: number; readonly evicted: number; readonly max: number; readonly failed: number };
  /** Levels made (the root and each open group's), in all. */
  readonly levels: number;
  /** Rows shown built again (a flatten per change). */
  readonly flattens: number;
}

export interface ServerSideModel<T> extends SourceHandle<T> {
  readonly diagnostics: ServerSideDiagnostics;
  /** The window painted and the positions to keep (the DOM calls it after each paint): what lacks is asked. */
  want(first: number, last: number, keep?: readonly number[]): void;
  /** The grouping columns in use (unknown and refused ones dropped). */
  readonly by: readonly string[];
  /** Whether the server pivots (a `serverPivot()` linked to the rows' pivot shape; server-pivot.md). */
  readonly pivot?: boolean;
  /** The sort as the requests carry it (a server pivot's: no created column's id; an export's `server.sort`). */
  readonly wireSort?: readonly SortItem[] | undefined;
  /** Groups by other columns on the server: a new epoch (the open groups kept, their keys name their columns). */
  setBy(by: readonly string[], source?: ChangeSource): void;
  /** The server's grand totals, as sent (`{}` until it sends them): never computed in the browser. */
  totals(): Readonly<Record<string, unknown>>;
  /** The group part of a request for every row (an export's `server.group`): the columns, no path, the totals; null when not grouped. */
  readonly group: GroupPart | null;
  /** The open groups: kept across a sort, a filter or a regroup (Q-OPEN A). */
  readonly expansion: ReadonlySet<RowKey>;
  isExpanded(key: RowKey): boolean;
  setExpansion(set: ReadonlySet<RowKey>, source?: ChangeSource): void;
  expand(rows: readonly RowKey[], expanded: boolean, source?: ChangeSource): readonly RowKey[];
  /** The groups held above `depth` (1: the first level): never a level not loaded. */
  expandable(depth?: number): readonly RowKey[];
  /** Opens the groups held above `depth` (never a level not loaded: asked for more, told), or closes the open ones above it. */
  expandAll(expanded: boolean, depth?: number, source?: ChangeSource): readonly RowKey[];
  /**
   * A host's live change (server-side-groups.md « Live updates and edits »): the leaf rows held are updated or patched in
   * place; grouped, an update, and any add or remove, asks the window again behind, rows kept (the server's counts and
   * totals, never computed here). One change.
   */
  applyTransaction(tx: RowTransaction<T>, source?: ChangeSource): TransactionResult;
  /** The same, gathered: what arrives within `batchMs` or before the next frame is one change; `done` per transaction. */
  applyTransactionAsync(tx: RowTransaction<T>, done?: (r: TransactionResult) => void): void;
}

/** What `serverSideRows` gives: a binding for the `source` setting. */
export interface ServerSideRows<T> extends SourceBinding<T> {
  create(env: ModelEnv<T>): ServerSideModel<T>;
}

type Kind = ModelChange<unknown>['kind'];
const RANK: Record<Kind, number> = { status: 1, context: 2, expand: 2, order: 3, rows: 4, page: 5, query: 6 };
const IDLE: ModelStatus = { phase: 'idle' };
const LOADING: ModelStatus = { phase: 'loading' };
const DONE: SearchWarmup = { step: () => true, progress: 1, cancel() {} };
const OPS: Operations = { filter: 'server', quick: 'server', sort: 'server', page: 'off' };
const NAMES = ['sum', 'avg', 'min', 'max', 'count', 'first', 'last'];
const FOOTERS = ['none', 'group', 'grand', 'both'];
/** Block ids: a level's number times this, plus the block's number in the level. */
const B = 2 ** 21;
const bound = new WeakMap<object, { readonly data: DataSource<any>; readonly params: Readonly<Record<string, Json>> }>();

/** A level: the first one (its groups, or the rows when not grouped), or an open group's (its groups, or its rows at the last level). */
interface Level {
  readonly sid: number;
  /** The group's key; null for the first level. */
  readonly key: RowKey | null;
  readonly depth: number;
  readonly path: readonly GroupValue[];
  /** The key's parts so far (Phase 7's typed keys: column id, type tag and value). */
  readonly segs: readonly string[];
  readonly labels: readonly string[];
  readonly parent: Level | null;
  /** Its group row's place in the parent level (set by each flatten). */
  at: number;
  known: number | null;
  reach: number;
  more: boolean;
  far: number;
  /** A block answered in this epoch; `failed`: its first block failed (the loading row under the group says so). */
  answered: boolean;
  failed: boolean;
  totals?: Readonly<Record<string, unknown>>;
}

/** A displayed run: rows of a level, or one loading row under an opening group, a group's totals row, the grand total. */
interface Run {
  at: number;
  readonly len: number;
  readonly lv: Level;
  readonly from: number;
  /** 0 rows of the level, 1 the loading row of a group opening, 2 its totals row, 3 the grand total. */
  readonly kind: 0 | 1 | 2 | 3;
  readonly g?: GroupNode;
}

/** A group value's own type tag: `1` and `'1'`, a day and an instant of that day, are two groups (server-side-groups.md). */
export const tag = (v: GroupValue): string => (v === null ? '' : (typeof v)[0] + String(v));
export const okValue = (v: unknown): v is GroupValue => v === null || typeof v == 'string' || typeof v == 'boolean' || (typeof v == 'number' && Number.isFinite(v));
export const plain = (v: unknown): v is Readonly<Record<string, Json>> => typeof v == 'object' && v !== null && !Array.isArray(v);
/**
 * Whether a server's group (or crossing) value fits its column's type (owner Q-SP5 A): null; any in a `custom` column; a
 * number in a `number` or `instant` one; a boolean in a `boolean` one; a text in the others, a valid day in a `day` one.
 */
export const fitsColumn = (c: ResolvedColumn<any>, v: GroupValue, ctx: LocaleCtx): boolean =>
  v === null || c.type == 'custom' || (typeof v == (/^(number|instant)$/.test(c.type) ? 'number' : c.type == 'boolean' ? c.type : 'string') && (c.type != 'day' || c.codec.coerce(v, ctx) !== null));

/**
 * A server's list, grouped on the server (`source: serverSideRows(data, …)`, Phase 8 steps 6–7, server-side-groups.md):
 * the first level's groups (or rows) in blocks, each open group's content in blocks of its own under one cache of
 * `maxBlocks`; the totals the server's, never computed here; the open groups kept across a new query.
 */
export function serverSideRows<T>(data: DataSource<T>, o: ServerSideOptions = {}): ServerSideRows<T> {
  const binding: ServerSideRows<T> = { create: (env) => createServerSide(binding, env, o) };
  bound.set(binding, { data, params: o.params ?? {} });
  return binding;
}

function createServerSide<T>(binding: SourceBinding<T>, env: ModelEnv<T>, o: ServerSideOptions): ServerSideModel<T> {
  const fixed: Problem[] = [];
  const int = (v: unknown, min: number, def: number, path: string): number => {
    if (v === undefined) return def;
    if (typeof v === 'number' && Number.isInteger(v) && v >= min) return v;
    fixed.push(problem('invalid-page', 'error', `source.${path}`));
    return def;
  };
  const size = Math.min(int(o.blockSize, 1, 100, 'blockSize'), B);
  const restMs = int(o.restMs, 0, 60, 'restMs');
  const oi = env.operations as unknown;
  const badOp = (op: string): number => fixed.push(problem('invalid-operations', 'error', op ? `operations.${op}` : 'operations', 'blocks'));
  if (oi === 'client' || (oi !== undefined && oi !== 'server' && (typeof oi !== 'object' || oi === null))) badOp('');
  else if (typeof oi === 'object') for (const op of ['filter', 'quick', 'sort', 'page']) {
    const v = (oi as Record<string, unknown>)[op];
    if (v !== undefined && v !== 'server' && !(op === 'page' && v === 'off')) badOp(op);
  }
  if (env.page !== undefined) fixed.push(problem('invalid-page', 'warning', 'pagination'));
  // A grouping's shape (`grouping()` of the DOM) gives its columns and options; any other shape is refused (D17).
  const sh = env.shape as { kind: string; by?: readonly string[]; options?: ServerSideOptions } | undefined;
  if (sh && sh.kind !== 'group') fixed.push(problem('unsupported-combination', 'warning', 'shape', sh.kind));
  const go: ServerSideOptions = sh?.kind === 'group' ? { ...o, ...sh.options, by: sh.by ?? [] } : o;
  let footers = go.footers ?? 'none';
  if (!FOOTERS.includes(footers)) fixed.push(problem('invalid-setting', 'warning', 'grouping.footers', String(footers))), (footers = 'none');
  const footG = footers === 'group' || footers === 'both';
  const footT = footers === 'grand' || footers === 'both';
  const top = go.grandTotal === 'top';

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

  // ---- the grouping and its totals (Q-WIRE A, Q-TOT A): column ids and names only ----
  let asked: readonly string[] = Array.isArray(go.by) ? go.by.slice() : [];
  let by: readonly string[] = [];
  let byProblems: Problem[] = [];
  let aggs: GroupPart['aggs'] = [];
  let aggProblems: Problem[] = [];
  // ---- the server pivot (server-pivot.md): its part, the sort sent (no created id), null when off ----
  const pl = o.pivot?.link(env, { again: (s) => commit(rekey, s), view: () => view, columns: () => columns, ctx: () => ctx }) ?? null;
  let pw: PivotPart | null = null;
  let sent: readonly SortItem[] | undefined;
  /** The grouping columns in use and the totals asked, read again when the columns change. */
  const readGrouping = (): void => {
    byProblems = [];
    by = asked.filter((id, i) => {
      const col = columns.get(id);
      const ok = !!col && col.def.groupable !== false && asked.indexOf(id) === i;
      if (!ok) byProblems.push(problem(col ? 'invalid-setting' : 'unknown-column', 'warning', 'grouping.by', typeof id == 'string' ? id : typeof id));
      return ok;
    });
    aggProblems = [];
    const out: { column: string; fn: AggFuncName }[] = [];
    const own = go.aggFuncs ?? {};
    const take = (id: string, fn: unknown, path: string): void => {
      if (fn === undefined) return;
      // A function of the application's cannot run on the server: refused (Q-TOT A), the column's id and nothing else.
      if (typeof fn == 'function') return void aggProblems.push(problem('agg-type', 'warning', path, 'server'));
      if (!NAMES.includes(fn as string)) return void aggProblems.push(problem('invalid-setting', 'warning', path, typeof fn == 'string' ? fn : typeof fn));
      out.push({ column: id, fn: fn as AggFuncName });
    };
    const w = pl?.part(by, server.sort, aggProblems) ?? null;
    pw = w && w.pivot;
    sent = w ? w.sort : server.sort;
    // In pivot mode the totals asked are the values, never the shown columns' (a created column set asks nothing).
    if (w) for (const [id, fn] of Object.entries(w.fns)) columns.get(id) ? take(id, fn, `columns.${id}.aggFunc`) : aggProblems.push(problem('unknown-column', 'warning', 'pivot.values', id));
    else {
      const seen = new Set<string>();
      for (const c of columns.visible()) seen.add(c.id), take(c.id, Object.hasOwn(own, c.id) ? own[c.id] : c.def.aggFunc, `columns.${c.id}.aggFunc`);
      for (const id of Object.keys(own)) if (!seen.has(id)) columns.get(id) ? take(id, own[id], `columns.${id}.aggFunc`) : aggProblems.push(problem('unknown-column', 'warning', 'grouping.aggFuncs', id));
    }
    aggs = grp() ? out : [];
  };
  /** Grouped on the server: by columns, or pivoted (with no row column, the grand total row alone). */
  const grp = (): boolean => by.length > 0 || !!pw;
  /** A pivot's last level: its groups are the last rows (no children, never open, never asked). */
  const deep = (level: number): boolean => !!pw && level >= by.length - 1;
  readGrouping();
  const groupSig = (): string => canonical({ by, aggs, pw });

  // ---- levels and blocks ----
  let sids = 0;
  let levelsMade = 0;
  let levels = new Map<string, Level>();
  const bySid = new Map<number, Level>();
  const level = (parent: Level | null, g: GroupNode | null): Level => {
    const k = g ? g.key : '';
    let lv = levels.get(k);
    if (!lv) {
      const value = (g?.value ?? null) as GroupValue;
      lv = {
        sid: sids++, key: g ? g.key : null, depth: parent ? parent.depth + 1 : 0,
        path: parent && g ? [...parent.path, value] : [], segs: parent && g ? [...parent.segs, by[parent.depth]!, tag(value)] : [],
        labels: parent && g ? [...parent.labels, g.label] : [], parent, at: 0,
        known: null, reach: 0, more: false, far: -1, answered: false, failed: false,
      };
      levelsMade++;
      levels.set(k, lv);
      bySid.set(lv.sid, lv);
    }
    return lv;
  };
  /** The first level: made by each epoch's start. */
  let root = null as unknown as Level;
  const leaf = (lv: Level): boolean => !pw && lv.depth >= by.length;
  const lenOf = (lv: Level): number => lv.known ?? lv.reach + (lv.more ? size : 0);
  const idOf = (lv: Level, n: number): number => lv.sid * B + n;

  /** The open groups, by key: kept across epochs (Q-OPEN A). */
  let open = new Set<RowKey>();
  let status: ModelStatus = LOADING;
  let answerProblems: readonly Problem[] = [];
  let fetches = 0;
  let valueFetches = 0;
  let failedBlocks = 0;
  let flattens = 0;
  const tickets = new Map<number, Ticket>();
  let refreshing = new Set<number>();
  let dups = new Map<number, number>();
  /** Where each node held is: its block id (data rows and groups). */
  const index = new Map<RowKey, number>();
  let win: { first: number; last: number; keep: readonly number[] } | null = null;
  let lastFirst = -1;
  let rest: (() => void) | null = null;
  let held = !!env.held;
  const deferred = new Set<number>();
  let destroyed = false;
  const listeners = new Set<(c: ModelChange<T>) => void>();
  const lists = new Map<string, ReturnType<typeof serverValues<T>>>();
  let reask = false;
  let opening = true;
  let ahead = 1;
  /** Where a position of the current view is: its level and its place there (a group's loading row: the level's first); null for a totals row. */
  let locate: (i: number) => [Level, number] | null = () => null;

  const store = createBlockStore<RowNode<T> | null>({
    max: int(o.maxBlocks, 1, 20, 'maxBlocks'),
    ahead: (ahead = int(o.ahead, 0, 1, 'ahead')),
    concurrency: int(o.concurrency, 1, 2, 'concurrency'),
    ask: (id) => ask(id),
    cancel(id) {
      deferred.delete(id);
      tickets.delete(id);
      gate.cancel(`block:${id}`);
      gate.forget?.(`block:${id}`);
      if (refreshing.delete(id) && !refreshing.size) setStatus(IDLE);
    },
    dropped(b) {
      for (const r of b.rows as readonly (RowNode<T> | null)[]) if (r && index.get(r.key) === b.n) index.delete(r.key);
      touch('rows');
    },
  });

  // ---- one commit per call ----
  let depth = 0;
  let kind: Kind | null = null;
  let dirty = true;
  let view: TreeRows<T>;
  let version = 0;
  let told: Problem[] = [];
  let failure: ModelChange<T>['failure'];
  let tx: TransactionResult | undefined;
  /** An edit touched what the server orders, groups or totals by: the gate's count then (-1: none). */
  let staleAt = -1;
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
  const problems = (): readonly Problem[] => [...fixed, ...byProblems, ...aggProblems, ...wireProblems, ...answerProblems, ...(pw ? pl!.problems : [])];
  const commit = (fn: () => void, source: ChangeSource): void => {
    if (destroyed) return;
    depth++;
    try {
      fn();
    } finally {
      depth--;
    }
    if (depth) return;
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

  /** The rows shown at this version: the open levels flattened into runs, fixed once made. */
  const makeView = (): TreeRows<T> => {
    flattens++;
    const rows = new Map<number, readonly (RowNode<T> | null)[]>();
    const failed = new Set<number>();
    const bySidBlocks = new Map<number, number[]>();
    for (const b of store.blocks.values()) {
      if (b.rows) rows.set(b.n, b.rows);
      else if (b.state === 'failed') failed.add(b.n);
      if (b.rows) {
        const s = Math.floor(b.n / B);
        (bySidBlocks.get(s) ?? bySidBlocks.set(s, []).get(s)!).push(b.n % B);
      }
    }
    for (const l of bySidBlocks.values()) l.sort((a, b) => a - b);
    const runs: Run[] = [];
    let m = 0;
    const push = (r: Omit<Run, 'at'>): void => {
      if (r.len > 0) runs.push({ ...r, at: m }), (m += r.len);
    };
    const walk = (lv: Level, g: GroupNode | null): void => {
      if (!lv.answered) return void (g && push({ len: 1, lv, from: 0, kind: 1 }));
      const n = lenOf(lv);
      let i = 0;
      if (!leaf(lv)) for (const b of bySidBlocks.get(lv.sid) ?? []) {
        rows.get(idOf(lv, b))!.forEach((x, j) => {
          const p = b * size + j;
          if (x?.kind !== 'group' || p >= n || p < i || !open.has(x.key) || deep(x.level)) return;
          push({ len: p - i + 1, lv, from: i, kind: 0 });
          i = p + 1;
          const child = level(lv, x);
          child.at = p;
          walk(child, x);
        });
      }
      push({ len: n - i, lv, from: i, kind: 0 });
      if (g && footG) push({ len: 1, lv, from: 0, kind: 2, g });
    };
    const grand = footT && root.answered && !!root.totals && grp();
    if (grand && top) push({ len: 1, lv: root, from: 0, kind: 3 });
    walk(root, null);
    if (grand && !top) push({ len: 1, lv: root, from: 0, kind: 3 });
    const count = m;
    let data = 0;
    for (const r of runs) if (r.kind === 0 && leaf(r.lv)) for (const b of bySidBlocks.get(r.lv.sid) ?? []) rows.get(idOf(r.lv, b))!.forEach((x, j) => void (x && b * size + j >= r.from && b * size + j < r.from + r.len && data++));

    const check = (i: number): number => {
      if (!(Number.isInteger(i) && i >= 0 && i < count)) throw new RangeError(`no displayed row ${i}`);
      return i;
    };
    /** The run holding position `i` (binary search). */
    const runAt = (i: number): Run => {
      let lo = 0;
      let hi = runs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (runs[mid]!.at <= i) lo = mid;
        else hi = mid - 1;
      }
      return runs[lo]!;
    };
    const grandLen = lenOf(root) + 1;
    locate = (i) => {
      const r = runAt(i);
      return r.kind > 1 ? null : [r.lv, r.kind ? 0 : r.from + i - r.at];
    };
    const nodeAt = (i: number): RowNode<T> => {
      const r = runAt(check(i));
      const lv = r.lv;
      if (r.kind === 1) return { key: `l:${lv.key}` as RowKey, kind: 'loading', level: lv.depth, parent: lv.key!, failed: lv.failed } satisfies LoadingNode;
      if (r.kind === 2) return { key: `f:${r.g!.key}` as RowKey, kind: 'footer', level: lv.depth, group: r.g!.key, label: r.g!.label, count: r.g!.count ?? 0, aggs: r.g!.aggs ?? {} } satisfies FooterNode;
      if (r.kind === 3) return { key: `t:${top ? 'top' : 'bottom'}` as RowKey, kind: 'footer', level: 0, group: null, label: '', count: 0, aggs: root.totals ?? {} } satisfies FooterNode;
      const p = r.from + i - r.at;
      const b = Math.floor(p / size);
      const got = rows.get(idOf(lv, b));
      return got?.[p - b * size] ?? ({ key: `l:#${i}` as RowKey, kind: 'loading', level: lv.depth, parent: null, failed: failed.has(idOf(lv, b)) || !!got } satisfies BlockLoadingNode);
    };
    /** A row's place among its siblings, how many they are (-1 unknown), and its level's runs. */
    const sizeOf = (lv: Level): number => (lv.known === null ? -1 : lv.known + (lv.key ? +footG : +(footT && !!root.totals && grp())));
    let at: Map<RowKey, number> | null = null;
    const where = new Map<RowKey, RowKey | null>();
    const keys = (): Map<RowKey, number> => {
      if (at) return at;
      at = new Map();
      for (const r of runs) {
        if (r.kind) {
          const k = nodeAt(r.at).key;
          at.set(k, r.at);
          where.set(k, r.kind === 3 ? null : r.lv.key);
          continue;
        }
        for (const b of bySidBlocks.get(r.lv.sid) ?? []) rows.get(idOf(r.lv, b))!.forEach((x, j) => {
          const p = b * size + j;
          if (x && p >= r.from && p < r.from + r.len) at!.set(x.key, r.at + p - r.from), where.set(x.key, r.lv.key);
        });
      }
      return at;
    };
    const indexOf = (key: RowKey): DisplayIndex | -1 => {
      if (key.startsWith('l:#')) {
        const i = Number(key.slice(3));
        return Number.isInteger(i) && i >= 0 && i < count && nodeAt(i).key === key ? (i as DisplayIndex) : -1;
      }
      return (keys().get(key) ?? -1) as DisplayIndex | -1;
    };
    const groupAt = (i: number): GroupNode | null => {
      const n = nodeAt(i);
      return n.kind === 'group' ? n : null;
    };
    const kidsOf = (g: GroupNode): number => {
      const lv = levels.get(g.key);
      return deep(g.level) ? 0 : lv?.answered ? lenOf(lv) : g.count ?? 1;
    };
    return {
      version: ++version,
      count,
      dataCount: data,
      nodeAt: nodeAt as TreeRows<T>['nodeAt'],
      keyAt: (i) => nodeAt(i).key,
      index: (k) => (Number.isInteger(k) && k >= 0 && k < count ? (k as DisplayIndex) : null),
      indexOf,
      nextData(i, delta) {
        const j = i + delta;
        const node = j >= 0 && j < count ? nodeAt(j) : null;
        return node?.kind === 'data' ? node : null;
      },
      *held() {
        for (const r of runs) {
          if (r.kind === 2 || r.kind === 3) yield r.at as DisplayIndex;
          if (r.kind) continue;
          for (const b of bySidBlocks.get(r.lv.sid) ?? []) {
            const got = rows.get(idOf(r.lv, b))!;
            for (let j = 0; j < got.length; j++) {
              const p = b * size + j;
              if (got[j] && p >= r.from && p < r.from + r.len) yield (r.at + p - r.from) as DisplayIndex;
            }
          }
        }
      },
      parentOf(key) {
        if (key.startsWith('f:') || (key.startsWith('l:') && !key.startsWith('l:#'))) return key.slice(2) as RowKey;
        if (key.startsWith('l:#')) {
          const i = indexOf(key);
          return i < 0 ? null : runAt(i).lv.key;
        }
        keys();
        return where.get(key) ?? null;
      },
      levelAt: (i) => nodeAt(i).level,
      posAt(i) {
        const r = runAt(check(i));
        if (r.kind === 1) return 1;
        if (r.kind === 3) return top ? 1 : grandLen;
        if (r.kind === 2) return lenOf(levels.get(r.g!.key)!) + 1;
        return r.from + i - r.at + 1 + +(r.lv === root && footT && top && !!root.totals && grp());
      },
      sizeAt(i) {
        const r = runAt(check(i));
        if (r.kind === 1) return -1;
        if (r.kind === 3) return sizeOf(root);
        return sizeOf(r.kind === 2 ? levels.get(r.g!.key)! : r.lv);
      },
      childrenAt(i) {
        const g = groupAt(check(i));
        return g ? kidsOf(g) : 0;
      },
      kidsOf(key) {
        const i = indexOf(key);
        const g = i < 0 ? null : groupAt(i);
        return g ? kidsOf(g) : 0;
      },
      expandedAt(i) {
        const g = groupAt(check(i));
        return !!g && open.has(g.key) && !deep(g.level);
      },
      matchedAt: (i) => (check(i), true),
    };
  };

  const partsOf = (): { filter?: WireFilterModel; quick?: string; sort?: unknown; params: Readonly<Record<string, Json>>; zone: string } => ({
    ...(wire && { filter: wire }),
    ...(server.quick !== undefined && { quick: server.quick }),
    ...(sent && { sort: sent }),
    params,
    zone: ctx.timeZone,
  });

  /** Block `id` asked, on its own channel: its level's group part (the open groups' values from the top) and the block by offset. */
  function ask(id: number): void {
    if (held) return void deferred.add(id);
    const lv = bySid.get(Math.floor(id / B));
    if (!lv) return;
    const n = id % B;
    const ch = `block:${id}`;
    const parts = { ...partsOf(), page: { index: n, size, offset: n * size, cursor: null }, blocks: true as const, ...(grp() && { group: { by, path: lv.path, aggs, ...(pw && { pivot: pw }) } }) };
    const key = canonical(parts);
    const { ticket, signal } = gate.begin(ch, key);
    tickets.set(id, ticket);
    fetches++;
    let done = false;
    const settle = (ok: boolean) => (v: unknown): void => {
      if (done) return;
      done = true;
      const verdict = gate.settle(ticket);
      gate.forget?.(ch);
      if (verdict !== null || tickets.get(id) !== ticket) return;
      tickets.delete(id);
      commit(() => (ok ? answer(lv, id, v, key, ticket.seq) : fail(lv, id, v, key)), 'data');
    };
    try {
      const r: unknown = data.fetch({ ...parts, key, signal } as DataRequest);
      if (isThenable(r)) r.then(settle(true), settle(false));
      else settle(true)(r);
    } catch (error) {
      settle(false)(error);
    }
  }

  /** The first level's first block, or a refresh's, failing is the model's error; an open group's first block, its loading row's; later blocks, their rows'. */
  function fail(lv: Level, id: number, error: unknown, key: string): void {
    if (refreshing.has(id) || (lv === root && !lv.answered)) {
      refreshing = new Set();
      setStatus({ phase: 'error', failure: error, key, page: id % B });
      failure = { error, key, page: id % B };
    } else failedBlocks++;
    if (!lv.answered) lv.failed = true;
    store.failed(id);
    touch('rows');
  }

  function answer(lv: Level, id: number, r: unknown, asked: string, seq: number): void {
    const n = id % B;
    const isLeaf = leaf(lv);
    const raw = r as { groups?: unknown; totals?: unknown } | null;
    const a = readAnswer(isLeaf || typeof raw !== 'object' || raw === null ? r : { ...raw, rows: raw.groups }, { index: n, size, cursors: false }, 0);
    answerProblems = a.problems;
    told.push(...a.problems);
    if (!a.rows) return fail(lv, id, a.problems[0], asked);
    // Asked after the edit: in the server's order again.
    if (seq > staleAt) staleAt = -1;
    const first = opening && lv === root;
    // The grand totals as sent (Q-TOT A): any block of the first level may bring them; a pivot's column totals beside them.
    if (lv === root && !isLeaf && raw) {
      const gt = pw ? pl!.root(raw, first, told) : undefined;
      if (!('totals' in raw)) gt && (root.totals = { ...root.totals, ...gt });
      else if (plain(raw.totals)) root.totals = gt ? { ...raw.totals, ...gt } : raw.totals;
      else told.push(problem('invalid-page-response', 'warning', 'response.totals'));
    }
    const offset = n * size;
    const got = a.rows.slice(0, size);
    const old = store.blocks.get(id)?.rows;
    if (old) for (const x of old) if (x && index.get(x.key) === id) index.delete(x.key);
    const nodes: (RowNode<T> | null)[] = [];
    const col = by[lv.depth];
    const column = col === undefined ? undefined : columns.get(col);
    got.forEach((x, j) => {
      let key: RowKey | null;
      let node: RowNode<T> | null = null;
      if (isLeaf) {
        let rid: unknown;
        try {
          rid = env.getRowId(x as T);
        } catch {}
        key = dataKey(rid);
        if (key) node = { key, kind: 'data', level: lv.depth, id: rid as DataNode<T>['id'], data: x as T };
        else told.push(problem('invalid-row-id', 'error', `response.rows[${j}]`));
      } else {
        const g = x as { value?: unknown; count?: unknown; aggs?: unknown; cells?: unknown };
        // An entry that is no record (null, a number), or a group where none was asked (a pivot without row column): told by place.
        if (!plain(g) || !column) {
          told.push(problem('invalid-page-response', 'warning', `response.groups[${j}]`));
          return void nodes.push(null);
        }
        const v = g.value ?? null;
        // A value of no group type, a count that is no count, totals that are no record: told by place, never with the value.
        if (!okValue(v) || !fitsColumn(column, v, ctx)) {
          told.push(problem('invalid-page-response', 'warning', `response.groups[${j}].value`));
          return void nodes.push(null);
        }
        const count = g.count;
        if (count !== undefined && !(Number.isInteger(count) && (count as number) >= 0)) told.push(problem('invalid-page-response', 'warning', `response.groups[${j}].count`));
        if (g.aggs !== undefined && !plain(g.aggs)) told.push(problem('invalid-page-response', 'warning', `response.groups[${j}].aggs`));
        let label = '';
        try {
          label = v === null ? '' : String(column ? column.codec.format(v as never, ctx) : v);
        } catch {
          label = String(v);
        }
        key = groupKey([...lv.segs, col!, tag(v)]);
        node = {
          key, kind: 'group', level: lv.depth, label, path: [...lv.labels, label], column: col!, value: v,
          ...(Number.isInteger(count) && (count as number) >= 0 && { count: count as number }),
          aggs: pw ? { ...(plain(g.aggs) && g.aggs), ...pl!.cells(g.cells, `response.groups[${j}].cells`, told) } : plain(g.aggs) ? g.aggs : {},
        } satisfies GroupNode;
      }
      const was = key ? index.get(key) : undefined;
      if (!key || was === id) {
        if (key) told.push(problem('duplicate-row-id', 'warning', `response.${isLeaf ? 'rows' : 'groups'}[${j}]`));
        return void nodes.push(null);
      }
      if (was !== undefined) {
        told.push(problem('duplicate-row-id', 'warning', `response.${isLeaf ? 'rows' : 'groups'}[${j}]`));
        const d = (dups.get(was) ?? 0) + 1;
        dups.set(was, d);
        if (d > 1) (failedBlocks++, store.failed(was, true));
        else store.drop(was);
      }
      index.set(key, id);
      nodes.push(node);
    });
    const len = got.length;
    if (lv === root) opening = false;
    lv.answered = true;
    lv.failed = false;
    if (len < size || a.hasNext === false) lv.known = offset + len;
    else if (a.total !== null) lv.known = Math.max(a.total, offset + len);
    else if (lv.known === null) {
      if (offset + len > lv.reach) lv.reach = offset + len;
      if (n >= lv.far) (lv.far = n), (lv.more = a.hasNext ?? true);
    }
    if (lv.known !== null) for (const b of [...store.blocks.keys()]) if (Math.floor(b / B) === lv.sid && (b % B) * size >= lv.known && b !== id) store.drop(b);
    store.answered(id, nodes);
    if ((refreshing.delete(id) || status.phase === 'error') && !refreshing.size) setStatus(IDLE);
    touch(first ? 'query' : 'rows');
  }

  // ---- the query ----
  const keyNow = (): string => {
    const w = server.filter ? wired.of(server.filter) : undefined;
    wire = w?.filter;
    wireProblems = w?.problems ?? [];
    return canonical({ filter: wire, quick: server.quick, sort: sent, zone: ctx.timeZone, params, group: groupSig() });
  };
  /** A new epoch: every block, level and request dropped; the open groups kept (Q-OPEN A); the first block asked now. */
  const restart = (key = keyNow()): void => {
    epochKey = key;
    gate.newEpoch();
    tickets.clear();
    store.clear();
    index.clear();
    levels = new Map();
    bySid.clear();
    root = level(null, null);
    dups = new Map();
    win = null;
    lastFirst = -1;
    rest?.();
    rest = null;
    answerProblems = [];
    opening = true;
    refreshing = new Set([idOf(root, 0)]);
    setStatus(LOADING);
    touch('query');
    store.again(idOf(root, 0));
  };
  const rekey = (): void => {
    const sig = (): string => canonical([...wireProblems, ...byProblems, ...aggProblems].map((p) => [p.code, p.path, p.detail]));
    const was = sig();
    readGrouping();
    const key = keyNow();
    const news = sig() !== was && wireProblems.length + byProblems.length + aggProblems.length > 0;
    if (news) told.push(...wireProblems, ...byProblems, ...aggProblems);
    if (key !== epochKey) return restart(key);
    if (sig() !== was) mark('status');
  };
  /** The blocks of the window, in display order, the kept positions' blocks, and the group rows above them (pinned). */
  const plan = (w: { first: number; last: number; keep: readonly number[] }): { order: number[]; keep: number[] } => {
    const order: number[] = [];
    const keep: number[] = [];
    const d = view;
    if (!d.count) return { order: [idOf(root, 0)], keep };
    const blockAt = (i: number): number | null => {
      const x = locate(i);
      return x && idOf(x[0], Math.floor(x[1] / size));
    };
    const last = Math.min(w.last, d.count - 1);
    const touched = new Set<Level>();
    for (let i = Math.max(0, w.first); i <= last; i++) {
      const id = blockAt(i);
      if (id !== null) order.push(id), touched.add(bySid.get(Math.floor(id / B))!);
    }
    for (const i of w.keep) if (i < d.count) {
      const id = blockAt(i);
      if (id !== null) keep.push(id), touched.add(bySid.get(Math.floor(id / B))!);
    }
    // One block ahead in the last level touched.
    const tail = order.at(-1);
    if (tail !== undefined) for (let k = 1; k <= ahead; k++) {
      const lv = bySid.get(Math.floor(tail / B))!;
      const nb = (tail % B) + k;
      if (nb * size < lenOf(lv)) order.push(idOf(lv, nb));
    }
    // The group rows above every level shown stay held: their levels hang from them.
    for (const lv of touched) for (let x = lv; x.parent; x = x.parent) keep.push(idOf(x.parent, Math.floor(x.at / size)));
    return { order, keep };
  };
  const refresh = (): void => {
    reask = true;
    if (!view.count) {
      refreshing = new Set([idOf(root, 0)]);
      setStatus(LOADING);
      store.again(idOf(root, 0));
      return touch('status');
    }
    store.stale();
    // The window's blocks, an open group's failed first block among them.
    refreshing = new Set(win ? plan(win).order : []);
    for (const id of refreshing) store.again(id);
    if (refreshing.size) setStatus(LOADING);
    touch('status');
  };
  const unfiltered = (): boolean => server.quick === undefined && (!wire || Object.keys(wire).length === 0);
  const apply = (): void =>
    commit(() => {
      if (!win) return;
      const p = plan(win);
      store.take(p.order, p.keep, p.order[0] ?? 0);
    }, 'data');

  commit(() => restart(), 'data');

  const txs = heldTransactions(env, int(o.batchMs, 0, 50, 'batchMs'), {
    store,
    index,
    commit,
    changed(all, moved, bad) {
      if (all.length) touch('rows');
      // Grouped, a row updated may have changed its group's count and totals: the server's to say (Q-TOT A).
      if (moved || (all.length && grp())) refresh();
      told.push(...bad);
      tx = { kind: all.length || moved ? 'delta' : 'none', version: 0, added: [], updated: all, removed: [], problems: [] };
    },
    version: () => view.version,
    dead: () => destroyed,
  });

  /** Every group held above `depth`, in display order of their levels. */
  const groupsHeld = (depthBelow: number): RowKey[] => {
    const out: RowKey[] = [];
    for (const b of [...store.blocks.values()].sort((x, y) => x.n - y.n)) for (const x of b.rows ?? []) if (x?.kind === 'group' && x.level < depthBelow && !deep(x.level)) out.push(x.key);
    return out;
  };

  const model: ServerSideModel<T> = {
    kind: 'source',
    ops: OPS,
    get displayed() { return view; },
    allRows: undefined,
    get status() { return status; },
    get problems() { return problems(); },
    // Grouped, the rows' number is the groups' business: unknown here.
    get counts() { return { total: unfiltered() && !grp() ? root.known : null, filtered: grp() ? null : root.known, displayed: view.count }; },
    selectAll: 'query',
    keeps: () => true,
    membershipOf(q) {
      const s = splitQuery(q, OPS).server;
      return canonical({ wire: s.filter && wired.of(s.filter).filter, quick: s.quick, params });
    },
    get scope() { return { params, zone: ctx.timeZone }; },
    row(key) {
      const id = index.get(key);
      const x = id === undefined ? undefined : store.blocks.get(id)?.rows?.find((r) => r?.key === key);
      return x?.kind === 'data' ? x : undefined;
    },
    page: null,
    setPage() {},
    get diagnostics() { return { fetches, valueFetches, gate: gate.diagnostics, blocks: { ...store.diagnostics, failed: failedBlocks }, levels: levelsMade, flattens }; },
    want(first, last, keep = []) {
      if (destroyed) return;
      const jump = lastFirst >= 0 && Math.abs(Math.floor(first / size) - Math.floor(lastFirst / size)) > 1;
      lastFirst = first;
      win = { first, last, keep };
      rest?.();
      rest = null;
      if (jump && env.timer && restMs > 0) rest = env.timer(() => ((rest = null), apply()), restMs);
      else apply();
    },
    get by() { return by; },
    pivot: !!pl,
    get wireSort() { return sent; },
    setBy(next, source = 'api') {
      if (!Array.isArray(next)) return void commit(() => (told.push(problem('invalid-setting', 'warning', 'grouping.by', typeof next)), mark('status')), source);
      if (next.length === asked.length && next.every((c, i) => c === asked[i])) return;
      commit(() => {
        asked = next.slice();
        rekey();
      }, source);
    },
    totals: () => root.totals ?? {},
    get group() { return grp() ? { by, path: [], aggs, ...(pw && { pivot: pl!.full(pw) }) } : null; },
    get expansion() { return open; },
    isExpanded: (key) => open.has(key),
    setExpansion(set, source = 'api') {
      commit(() => {
        open = new Set([...set].filter((k) => k.startsWith('g:')));
        touch('expand');
      }, source);
    },
    expand(keys, expanded, source = 'api') {
      const changed = keys.filter((k) => k.startsWith('g:') && open.has(k) !== expanded);
      if (!changed.length) return changed;
      commit(() => {
        open = new Set(open);
        for (const k of changed) expanded ? open.add(k) : open.delete(k);
        touch('expand');
      }, source);
      return changed;
    },
    expandable: (d = Infinity) => groupsHeld(d),
    expandAll(expanded, d = Infinity, source = 'api') {
      // Only the groups held: a level not loaded is never asked by its thousands (D13); deeper levels, told.
      const keys = expanded ? groupsHeld(d) : [...open].filter((k) => { const i = view.indexOf(k); return i === -1 || view.levelAt(i) < d; });
      const changed = model.expand(keys, expanded, source);
      if (expanded && Math.min(d, by.length) > 1) commit(() => (told.push(problem('unsupported-combination', 'warning', 'expandAll', 'server')), mark('status')), source);
      return changed;
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
    invalidate(x) {
      commit(() => (x?.purge ? restart(epochKey) : refresh()), 'api');
    },
    hold(fn) {
      held = true;
      try {
        fn();
      } finally {
        held = false;
        for (const id of [...deferred]) {
          deferred.delete(id);
          if (store.running.has(id)) ask(id);
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
    // Edits (K.14): nothing moves; a column the server sorts, filters, searches, groups or totals by marks the order stale.
    setReader(_r, changed) {
      const read = [...(server.sort ?? []).map((s) => s.column), ...Object.keys(wire ?? {}), ...(server.quick?.trim() ? columns.visible().map((c) => c.id) : []), ...by, ...aggs.map((a) => a.column)];
      if (changed ? changed.some((c) => read.includes(c)) : read.length > 0) staleAt = gate.diagnostics.begun;
    },
    reapply(source = 'api') {
      commit(() => void (staleAt >= 0 && (refresh(), mark('order'))), source);
    },
    get orderStale() { return staleAt >= 0; },
    applyTransaction: (t, source = 'api') => txs.apply(t, source),
    applyTransactionAsync: (t, done) => txs.async(t, done),
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
      rest?.();
      txs.stop();
      gate.destroy();
      for (const h of [...lists.values()]) h.close();
    },
  };
  return model;
}
