import type { ResolvedColumn } from '../columns/defs.js';
import { quickWords } from '../filter/quick.js';
import { canonical } from '../model/query.js';
import { capOf, labelFor, tickedMissing, ValuesBox, type SetValue, type ValueList, type ValuesHandle, type ValuesOptions } from '../model/values.js';
import { problem, type Problem } from '../problems.js';
import type { LocaleCtx } from '../value/locale.js';
import type { RequestGate, Ticket } from './gate.js';
import type { DataSource, Json, ValuesRequest } from './source.js';
import type { WireFilterModel } from './wire.js';

/** At most this many bad entries are told one by one; the rest are counted. */
const MAX_TOLD = 10;
const warn = (path: string, detail?: string): Problem => problem('invalid-values-response', 'warning', path, detail);
const count = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/**
 * A server's answer read (value-list.md): what it says, bent where it says it
 * wrong; null when it is not a list at all. Values with count 0 are dropped
 * (the owner's rule) before the limit cuts.
 */
export function readValues(r: unknown, limit: number): { readonly list: ValueList | null; readonly problems: readonly Problem[] } {
  const o = r as { values?: unknown; blanks?: unknown; truncated?: unknown } | null;
  const items = Array.isArray(r) ? r : typeof r === 'object' && o !== null && Array.isArray(o.values) ? o.values : null;
  if (!items) return { list: null, problems: [problem('invalid-values-response', 'error', 'response')] };
  const problems: Problem[] = [];
  let bad = 0;
  const say = (p: Problem): void => void (bad++ < MAX_TOLD && problems.push(p));
  const seen = new Set<string>();
  const values: SetValue[] = [];
  items.forEach((it: { value?: unknown; label?: unknown; count?: unknown } | null, i) => {
    const at = `response.values[${i}]`;
    if (typeof it !== 'object' || it === null || typeof it.value !== 'string' || seen.has(it.value)) return say(warn(at));
    seen.add(it.value);
    let label = it.value;
    if (typeof it.label === 'string') label = it.label;
    else if (it.label != null) say(warn(`${at}.label`));
    let n: number | null = null;
    if (count(it.count)) n = it.count;
    else if (it.count != null) say(warn(`${at}.count`));
    if (n !== 0) values.push({ value: it.value, label, count: n });
  });
  if (bad > MAX_TOLD) problems.push(warn('response.values', `${bad - MAX_TOLD} more`));
  let truncated = false;
  let blanks: number | null = null;
  if (!Array.isArray(r)) {
    if (count(o!.blanks)) blanks = o!.blanks;
    else if (o!.blanks != null) problems.push(warn('response.blanks'));
    if (typeof o!.truncated === 'boolean') truncated = o!.truncated;
    else if (o!.truncated !== undefined) problems.push(warn('response.truncated'));
  }
  if (values.length > limit) {
    values.length = limit;
    truncated = true;
    problems.push(warn('response.values'));
  }
  return { list: { values, blanks, truncated }, problems };
}

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  v !== null && (typeof v === 'object' || typeof v === 'function') && typeof (v as { then?: unknown }).then === 'function';

/** What a server's list reads of the model it belongs to, always as it is now. */
export interface ValuesHost<T> {
  readonly gate: RequestGate;
  data(): DataSource<T>;
  /** The request's parts besides the column, the search and the limit: the wire filter less this column, the server search, params, zone. */
  parts(column: string): { readonly filter?: WireFilterModel; readonly quick?: string; readonly params: Readonly<Record<string, Json>>; readonly zone: string };
  ticked(column: string): readonly string[] | undefined;
  column(id: string): ResolvedColumn<T> | undefined;
  ctx(): LocaleCtx;
  counted(): void;
}

/**
 * A column's list from `DataSource.values`, through the gate channel
 * `values:<column>` (request-order.md). `reconcile()`, after every change of
 * the model: asks again only when the request would differ, or when a new
 * epoch dropped the one in flight; otherwise refreshes the ticked values it
 * adds (the column's own filter, the language).
 */
export function serverValues<T>(host: ValuesHost<T>, column: string, o: ValuesOptions, end: () => void): ValuesHandle & { reconcile(): void; close(): void } {
  const channel = `values:${column}`;
  const limit = capOf(o.max);
  let asked: { key: string; ticket: Ticket };
  /** The last accepted list, as read, and the values it holds. */
  let raw: ValueList | null = null;
  let has = new Set<string>();
  let shown = '';

  /** The list shown: the accepted one, with the ticked values it lacks first. */
  const show = (): void => {
    if (!raw) return;
    const ticked = host.ticked(column);
    const ctx = host.ctx();
    const now = canonical([ticked, ctx.locale, ctx.numerals, ctx.timeZone]);
    if (now === shown && b.result) return;
    shown = now;
    const col = host.column(column);
    const missing = tickedMissing(ticked, (v) => has.has(v), (v) => (col ? labelFor(col, v, ctx) : v), quickWords(b.q));
    b.result = missing.length ? { ...raw, values: [...missing, ...raw.values] } : raw;
  };

  const ask = (): void => {
    const parts = { column, search: b.q, limit, ...host.parts(column) };
    const key = canonical(parts);
    const { ticket, signal } = host.gate.begin(channel, key);
    asked = { key, ticket };
    host.counted();
    b.status = 'loading';
    let done = false;
    const settle = (ok: boolean) => (v: unknown): void => {
      if (done) return;
      done = true;
      if (host.gate.settle(ticket) !== null || b.closed) return;
      const r = ok ? readValues(v, limit) : null;
      b.problems = r?.problems ?? [];
      if (r?.list) {
        raw = r.list;
        has = new Set(raw.values.map((x) => x.value));
        shown = '';
        b.status = 'idle';
        b.failure = undefined;
        show();
      } else {
        b.status = 'error';
        b.failure = ok ? b.problems[0] : v;
      }
      b.ping();
    };
    try {
      const r: unknown = host.data().values!({ ...parts, key, signal } as ValuesRequest);
      if (isThenable(r)) r.then(settle(true), settle(false));
      else settle(true)(r);
    } catch (error) {
      settle(false)(error);
    }
    b.ping();
  };

  const b = new ValuesBox(true, String(o.search ?? '').trim(), ask, () => {
    host.gate.cancel(channel);
    end();
  });
  ask();
  return Object.assign(b, {
    reconcile(): void {
      if (b.closed) return;
      const key = canonical({ column, search: b.q, limit, ...host.parts(column) });
      if (key !== asked.key || (b.status === 'loading' && host.gate.accepts(asked.ticket) !== null)) return ask();
      show();
      b.ping();
    },
  });
}
