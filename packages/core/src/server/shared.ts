import type { AbortHandle } from '../abort.js';
import type { ColumnLookup } from '../columns/model.js';
import type { FilterModel } from '../filter/model.js';
import type { ModelEnv } from '../model/client.js';
import { problem, type Problem } from '../problems.js';
import type { LocaleCtx } from '../value/locale.js';
import { dayAt, hasRelative } from '../value/relative.js';
import { toWire } from './wire.js';

/**
 * What every model fed by a server shares (server pages, a fetched set, blocks — Phase 8 step 2): a plain abort handle,
 * the answer read, the wire form cached. Internal: each entry carries only what it imports.
 */

/** A handle that only records the abort: the core names no platform (the DOM passes a real one). */
export const plainAbort = (): AbortHandle => {
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

export const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  v !== null && (typeof v === 'object' || typeof v === 'function') && typeof (v as { then?: unknown }).then === 'function';

export const positiveInt = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n >= 1;
const warn = (path: string): Problem => problem('invalid-page-response', 'warning', path);

export interface Answer {
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
export function readAnswer(r: unknown, at: { readonly index: number; readonly size: number; readonly cursors: boolean } | null, maxRows: number): Answer {
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

/**
 * The last filter put in its wire form, for these columns, zone and — when it holds a shortcut — today's day there: the
 * request and membershipOf ask for the same one, and after midnight both send the new day without waiting for tick(),
 * as the client model does. `now` reads the model's columns, language and application context as they are.
 */
export function wireCache<T>(env: ModelEnv<T>, now: () => { readonly ctx: LocaleCtx; readonly columns: ColumnLookup<T>; readonly app: unknown }) {
  let wired: { readonly f: FilterModel; readonly ctx: LocaleCtx; readonly columns: ColumnLookup<T>; readonly v: number; readonly has: boolean; readonly day: string; readonly a: unknown; readonly w: ReturnType<typeof toWire> } | null = null;
  return {
    of(f: FilterModel): ReturnType<typeof toWire> {
      const { ctx, columns, app } = now();
      const has = wired && wired.f === f ? wired.has : hasRelative(f);
      const t = has && env.now ? env.now() : undefined;
      const day = t === undefined ? '' : dayAt(t, ctx.timeZone)?.day ?? '';
      if (!wired || wired.f !== f || wired.ctx !== ctx || wired.columns !== columns || wired.v !== columns.dataVersion || wired.day !== day || wired.a !== app) {
        wired = { f, ctx, columns, v: columns.dataVersion, has, day, a: app, w: toWire(f, { ctx, columns, app, ...(env.filterKinds && { kinds: env.filterKinds }), ...(t !== undefined && { now: t }) }) };
      }
      return wired.w;
    },
    clear(): void {
      wired = null;
    },
  };
}
