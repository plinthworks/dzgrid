/**
 * The audit journal's fake server, copied from perf/fake-server.ts (step 18) as an application
 * would own its server: not imported from the repository (step 23). Row i is computed from i.
 */
import type { DataRequest, DataResponse, DataSource, ValuesRequest, ValuesResponse, WireFilter, WireFilterModel } from '@dzgrid/core/server';
import { idOfDataKey, type RowKey } from '@dzgrid/core';

export interface AuditRow {
  readonly id: string;
  /** UTC, `YYYY-MM-DDTHH:mm:ss.sssZ`. */
  readonly occurredAt: string;
  /** The Algiers day of `occurredAt` (UTC+1, no clock change). */
  readonly day: string;
  readonly actor: string;
  readonly action: string;
  readonly resource: string | null;
  readonly outcome: boolean;
  readonly durationMs: number;
}

/** Row 0's time; each row is 37 s older than the one before. */
export const T0 = Date.UTC(2026, 9, 20, 12, 0, 0);
export const STEP_MS = 37_000;
const ALGIERS_MS = 3_600_000;

const FR_FIRST = ['Amina', 'Bilal', 'Chafia', 'Djamel', 'Elias', 'Farida', 'Ghani', 'Hania', 'Idir', 'Jamila', 'Karim', 'Lydia', 'Mourad', 'Nadia'];
const FR_LAST = ['Benali', 'Cherif', 'Haddad', 'Mansouri', 'Saidi', 'Touati', 'Ziani'];
const AR_NAMES = ['أمينة', 'بلال', 'جميلة', 'خالد', 'سعاد', 'عمر', 'فاطمة', 'كريم', 'ليلى', 'مراد', 'نادية', 'هشام', 'وليد', 'ياسمين'];
/** 97 actors: every seventh in Arabic. */
export const ACTORS: readonly string[] = Array.from({ length: 97 }, (_, k) =>
  k % 7 === 0 ? `${AR_NAMES[(k / 7) % 14]} ${AR_NAMES[(k / 7 + 5) % 14]}` : `${FR_FIRST[k % 14]} ${FR_LAST[Math.floor(k / 14) % 7]}`);
/** The action codes; the screen labels them in the user's language. */
export const ACTIONS: readonly string[] = ['login', 'logout', 'read', 'create', 'update', 'delete', 'export', 'print', 'share', 'sign', 'approve', 'reject'];
const KINDS = ['dossier', 'patient', 'rapport', 'compte', 'ordonnance'];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const iso = (ms: number): string => new Date(ms).toISOString();
/** One resource in 2 000 per row (7919 is prime to 2 000), a blank every 101 rows. */
export const resourceOf = (i: number): string | null => {
  if (i % 101 === 0) return null;
  const n = (i * 7919) % 2000;
  return n % 41 === 0 ? `ملف ${n}` : `${KINDS[n % 5]}-${pad(n, 4)}`;
};

export function auditRow(i: number): AuditRow {
  const at = T0 - i * STEP_MS;
  return {
    id: `e${i}`, occurredAt: iso(at), day: iso(at + ALGIERS_MS).slice(0, 10),
    actor: ACTORS[i % 97]!, action: ACTIONS[(i * 7) % 12]!, resource: resourceOf(i),
    outcome: i % 11 !== 3, durationMs: (i * 7919) % 4999,
  };
}

/** The server's folding: case and accents ignored. */
export const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

type Cell = string | number | boolean | null;
const cell = (r: AuditRow, column: string): Cell => (r as unknown as Record<string, Cell>)[column] ?? null;
const blank = (v: Cell) => v === null || v === '';

function test(v: Cell, f: WireFilter): boolean {
  switch (f.type) {
    case 'text': {
      if (f.op === 'blank') return blank(v);
      if (f.op === 'notBlank') return !blank(v);
      const norm = (s: string) => (f.caseSensitive ? s : fold(s));
      const a = norm(v === null ? '' : String(v));
      const b = norm(f.value ?? '');
      switch (f.op) {
        case 'contains': return a.includes(b);
        case 'notContains': return !a.includes(b);
        case 'equals': return a === b;
        case 'notEqual': return a !== b;
        case 'startsWith': return a.startsWith(b);
        case 'endsWith': return a.endsWith(b);
      }
      return true;
    }
    case 'number':
    case 'day': {
      if (f.op === 'blank') return blank(v);
      if (f.op === 'notBlank') return !blank(v);
      if (blank(v)) return false;
      const x = v as number | string;
      const a = f.value as number | string;
      switch (f.op) {
        case 'equals': return x === a;
        case 'notEqual': return x !== a;
        case 'lt': return x < a;
        case 'lte': return x <= a;
        case 'gt': return x > a;
        case 'gte': return x >= a;
        case 'between': return x >= a && x <= (f.valueTo as number | string);
      }
      return true;
    }
    case 'instant': {
      if (f.op === 'blank') return blank(v);
      if (f.op === 'notBlank') return !blank(v);
      if (blank(v) || !('resolved' in f)) return false;
      const s = String(v);
      return (f.resolved.from === null || s >= f.resolved.from) && (f.resolved.to === null || s < f.resolved.to);
    }
    case 'boolean': return v === f.value;
    case 'set': {
      const list = f.include ?? f.exclude;
      if (!list) return true;
      if (blank(v)) return f.include ? f.blanks === 'include' : f.blanks !== 'exclude';
      return f.include ? list.includes(String(v)) : !list.includes(String(v));
    }
    case 'combined': return f.join === 'and' ? f.conditions.every((c) => test(v, c)) : f.conditions.some((c) => test(v, c));
    default: return true;
  }
}

export interface AuditQuery {
  readonly filter?: WireFilterModel;
  readonly quick?: string;
  readonly sort?: DataRequest['sort'];
}

/** Whether row `r` passes the query's filters and its search (actor, action, resource). */
export function matches(r: AuditRow, q: AuditQuery): boolean {
  for (const col in q.filter ?? {}) if (!test(cell(r, col), q.filter![col]!)) return false;
  const s = q.quick ? fold(q.quick.trim()) : '';
  return !s || fold(r.actor).includes(s) || r.action.includes(s) || (r.resource !== null && fold(r.resource).includes(s));
}

const filtered = (q: AuditQuery) => Object.keys(q.filter ?? {}).length > 0 || !!q.quick?.trim();
const byTime = (q: AuditQuery) => !q.sort?.length || (q.sort.length === 1 && q.sort[0]!.column === 'occurredAt');
const ascending = (q: AuditQuery) => q.sort?.[0]?.column === 'occurredAt' && q.sort[0].dir === 'asc';

export interface Universe {
  readonly universe: number;
  /** A filtered query looks at the newest `scanCap` events only (200 000 by default). */
  readonly scanCap?: number;
}

/** Every match, in the query's order (any column sorts here: the materialised case). */
export function queryAll(u: Universe, q: AuditQuery): AuditRow[] {
  const n = filtered(q) ? Math.min(u.universe, u.scanCap ?? 200_000) : u.universe;
  const out: AuditRow[] = [];
  for (let i = 0; i < n; i++) {
    const r = auditRow(i);
    if (matches(r, q)) out.push(r);
  }
  if (byTime(q)) return ascending(q) ? out.reverse() : out;
  // Stable: ties keep the index order.
  const keys = q.sort!;
  return out.map((r, i) => ({ r, i })).sort((a, b) => {
    for (const s of keys) {
      const x = cell(a.r, s.column);
      const y = cell(b.r, s.column);
      if (x === y) continue;
      const c = x === null ? -1 : y === null ? 1 : x < y ? -1 : 1;
      return s.dir === 'asc' ? c : -c;
    }
    return a.i - b.i;
  }).map((x) => x.r);
}

/** One page: by arithmetic without a filter, by a scan until the page and one more otherwise. */
export function queryPage(u: Universe, q: AuditQuery, offset: number, size: number, withTotal: boolean): { rows: AuditRow[]; hasNext: boolean; total?: number } {
  if (!byTime(q)) {
    const all = queryAll(u, q);
    return { rows: all.slice(offset, offset + size), hasNext: offset + size < all.length, ...(withTotal && { total: all.length }) };
  }
  const asc = ascending(q);
  if (!filtered(q)) {
    const N = u.universe;
    const rows: AuditRow[] = [];
    for (let k = offset; k < Math.min(N, offset + size); k++) rows.push(auditRow(asc ? N - 1 - k : k));
    return { rows, hasNext: offset + size < N, ...(withTotal && { total: N }) };
  }
  const n = Math.min(u.universe, u.scanCap ?? 200_000);
  const rows: AuditRow[] = [];
  let seen = 0;
  let more = false;
  for (let k = 0; k < n; k++) {
    const r = auditRow(asc ? n - 1 - k : k);
    if (!matches(r, q)) continue;
    if (seen >= offset && seen < offset + size) rows.push(r);
    else if (seen >= offset + size) {
      more = true;
      if (!withTotal) break;
    }
    seen++;
  }
  return { rows, hasNext: more, ...(withTotal && { total: seen }) };
}

/** The value list of a column: the values in the rows the request's filter and search keep, with counts. */
export function queryValues(u: Universe, req: Pick<ValuesRequest, 'column' | 'search' | 'limit' | 'filter' | 'quick'>): { values: { value: string; label: string; count: number }[]; blanks: number; truncated: boolean } {
  const q: AuditQuery = { ...(req.filter && { filter: req.filter }), ...(req.quick && { quick: req.quick }) };
  const n = Math.min(u.universe, u.scanCap ?? 200_000);
  const counts = new Map<string, number>();
  let blanks = 0;
  const s = fold(req.search.trim());
  for (let i = 0; i < n; i++) {
    const r = auditRow(i);
    if (!matches(r, q)) continue;
    const v = cell(r, req.column);
    if (blank(v)) blanks++;
    else if (!s || fold(String(v)).includes(s)) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  }
  const all = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  const cut = all.slice(0, req.limit);
  return { values: cut.map((value) => ({ value, label: value, count: counts.get(value)! })), blanks, truncated: all.length > cut.length };
}

export interface FakeServerOptions extends Universe {
  /** Configuration A: no page asked, the whole set in the query's order. */
  readonly fetched?: boolean;
  /** Configuration B: give the total (unknown otherwise: `hasNext` only). */
  readonly total?: boolean;
  readonly mode?: 'timers' | 'hold';
  /** Timers: milliseconds before an answer (150 by default), plus up to `jitter` more, drawn from `seed`. */
  readonly latency?: number;
  readonly jitter?: number;
  /** Timers: the share of requests that fail (0 to 1), drawn from `seed`. */
  readonly failRate?: number;
  readonly seed?: number;
  /** False: an aborted request still answers (late), to test that the grid drops it. True by default. */
  readonly honourSignal?: boolean;
  /** For `settledAt` (milliseconds); `performance.now` by default. */
  readonly now?: () => number;
}

export interface LogEntry {
  readonly seq: number;
  readonly channel: string;
  readonly key: string;
  readonly req: DataRequest | ValuesRequest;
  state: 'pending' | 'ok' | 'failed' | 'aborted';
  /** The signal's reason once it aborted (honoured or not). */
  abort: unknown;
  settledAt: number | null;
  /** Rows answered (their ids), and what the answer said of the rest. */
  ids?: string[];
  total?: number | null;
  hasNext?: boolean;
}

export interface FakeServer {
  readonly source: DataSource<AuditRow>;
  readonly log: readonly LogEntry[];
  /** Hold mode: the requests waiting, oldest first. */
  pending(): LogEntry[];
  release(seq: number): boolean;
  fail(seq: number, error?: unknown): boolean;
  /** The next request fails (timers mode; in hold mode, its release fails it). */
  failNext(): void;
  /** Draws the next latency (timers mode). */
  delay(): number;
  /** Live changes (the playground's controls). */
  configure(o: Partial<Pick<FakeServerOptions, 'latency' | 'jitter' | 'failRate' | 'total'>>): void;
  /**
   * The server's own CSV export (step 19, `csvExport({ exportAll })`): the whole query's rows (the
   * request's server part, `queryAll`), only the selected ones for `selected`, the columns asked, raw
   * values (instants in ISO UTC), BOM and CRLF. Logged as channel `export`; it waits like any request.
   */
  exportAll(req: ExportAsk, ctx: { readonly signal: AbortSignal }): Promise<{ blob: Blob; fileName: string }>;
}

/** What the grid's `exportAll` receives, as far as this server reads it (`ExportRequest`). */
export interface ExportAsk {
  readonly scope: 'displayed' | 'all' | 'selected';
  readonly columns: readonly string[];
  readonly selection?: { readonly mode: 'include' | 'exclude'; readonly keys: ReadonlySet<RowKey> };
  readonly server?: { readonly filter?: WireFilterModel; readonly quick?: string; readonly sort?: DataRequest['sort']; readonly key: string };
}

const csvField = (v: Cell): string => {
  const s = v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The file the server writes for `req` (BOM, a header of column ids, CRLF). */
export function serverCsv(u: Universe, req: ExportAsk): string {
  const s = req.server;
  const q: AuditQuery = { ...(s?.filter && { filter: s.filter }), ...(s?.quick && { quick: s.quick }), ...(s?.sort && { sort: s.sort }) };
  let rows = queryAll(u, q);
  const sel = req.selection;
  if (req.scope === 'selected' && sel) {
    const ids = new Set([...sel.keys].map((k) => idOfDataKey(k)));
    rows = rows.filter((r) => ids.has(r.id) === (sel.mode === 'include'));
  }
  let out = '\uFEFF' + req.columns.map(csvField).join(',') + '\r\n';
  for (const r of rows) out += req.columns.map((c) => csvField(cell(r, c))).join(',') + '\r\n';
  return out;
}

/** A small seeded generator (LCG), the same on every engine. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]! };
}

interface Signal { readonly aborted: boolean; readonly reason?: unknown; addEventListener?(t: 'abort', fn: () => void, o?: object): void }

export function createFakeServer(opts: FakeServerOptions): FakeServer {
  let o = { latency: 150, jitter: 0, failRate: 0, ...opts };
  const r = rng(o.seed ?? 1);
  const now = o.now ?? (() => performance.now());
  const log: LogEntry[] = [];
  const waiting = new Map<number, { ok(): void; err(e: unknown): void }>();
  let failOne = false;
  let seq = 0;
  const failure = (e: LogEntry) => new Error(`fake server: request ${e.seq} (${e.channel}) failed`);

  function answerRows(req: DataRequest): DataResponse<AuditRow> & { total?: number } {
    const q: AuditQuery = { ...(req.filter && { filter: req.filter }), ...(req.quick && { quick: req.quick }), ...(req.sort && { sort: req.sort }) };
    if (o.fetched || !req.page) return { rows: queryAll(o, q) };
    const p = queryPage(o, q, req.page.offset, req.page.size, !!o.total);
    return { rows: p.rows, hasNext: p.hasNext, ...(p.total !== undefined && { total: p.total }) };
  }

  function start<R>(channel: string, req: DataRequest | ValuesRequest, compute: () => R, note: (e: LogEntry, v: R) => void): Promise<R> {
    const e: LogEntry = { seq: ++seq, channel, key: req.key, req, state: 'pending', abort: null, settledAt: null };
    log.push(e);
    const signal = req.signal as Signal;
    return new Promise<R>((resolve, reject) => {
      let cancelTimer = () => {};
      const settle = (state: LogEntry['state']) => {
        waiting.delete(e.seq);
        cancelTimer();
        e.state = state;
        e.settledAt = now();
      };
      const honour = o.honourSignal !== false;
      const abort = () => {
        e.abort ??= signal.reason ?? 'aborted';
        if (honour && e.state === 'pending') settle('aborted'), reject(signal.reason);
      };
      if (signal.aborted) return abort();
      signal.addEventListener?.('abort', abort, { once: true });
      const fails = failOne || (o.mode !== 'hold' && o.failRate > 0 && r.next() < o.failRate);
      failOne = false;
      const ok = () => {
        if (e.state !== 'pending') return;
        if (fails) return err(failure(e));
        const v = compute();
        settle('ok');
        note(e, v);
        resolve(v);
      };
      const err = (x: unknown) => {
        if (e.state !== 'pending') return;
        settle('failed');
        reject(x);
      };
      waiting.set(e.seq, { ok, err });
      if (o.mode !== 'hold') {
        const t = setTimeout(ok, delay());
        cancelTimer = () => clearTimeout(t);
      }
    });
  }

  function delay(): number {
    return o.latency + (o.jitter > 0 ? Math.round(r.next() * o.jitter) : 0);
  }

  const source: DataSource<AuditRow> = {
    fetch: (req) => start('rows', req, () => answerRows(req), (e, v) => {
      e.ids = v.rows.map((x) => x.id);
      e.total = v.total ?? null;
      if (v.hasNext !== undefined) e.hasNext = v.hasNext;
    }),
    values: (req): Promise<ValuesResponse> => start(`values:${req.column}`, req, () => queryValues(o, req), (e, v) => {
      e.ids = v.values.map((x) => x.value);
    }),
  };

  return {
    source,
    log,
    pending: () => log.filter((e) => e.state === 'pending' && waiting.has(e.seq)),
    release(n) {
      const w = waiting.get(n);
      if (!w) return false;
      w.ok();
      return true;
    },
    fail(n, error) {
      const w = waiting.get(n);
      if (!w) return false;
      w.err(error ?? failure(log[n - 1]!));
      return true;
    },
    failNext: () => void (failOne = true),
    delay,
    exportAll: (req, ctx) => start('export', { key: req.server?.key ?? 'export', signal: ctx.signal } as unknown as DataRequest, () => serverCsv(o, req), (e, text) => {
      e.ids = [];
      e.total = text.split('\r\n').length - 2;
    }).then((text) => ({ blob: new Blob([text], { type: 'text/csv;charset=utf-8' }), fileName: 'journal-serveur.csv' })),
    configure(c) {
      o = { ...o, ...c };
    },
  };
}
