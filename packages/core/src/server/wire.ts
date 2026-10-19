import type { ColumnLookup } from '../columns/model.js';
import type { ResolvedColumn } from '../columns/defs.js';
import { relativeOf, resolveInstantRange } from '../filter/instant.js';
import { INSTANT_OPS, isJson, NUM_OPS, TEXT_OPS, type ColumnFilter, type FilterModel, type Json, type NumOp, type RelativeRange, type TextOp, type WireKind } from '../filter/model.js';
import { problem, type Problem } from '../problems.js';
import { epochDayToDay, parseDay, type Day } from '../value/day.js';
import type { LocaleCtx } from '../value/locale.js';

export type { WireKind };

/** What `toWire` reads besides the filter. */
export interface WireEnv<T> {
  /** `ctx.timeZone` is the grid's zone: the one instant bounds are resolved in. */
  readonly ctx: LocaleCtx;
  readonly columns: ColumnLookup<T>;
  /** The custom filter kinds, by name. */
  readonly kinds?: (name: string) => WireKind | undefined;
  /** The clock, milliseconds since 1970 UTC: what a date shortcut is resolved against (filter-relative.md). Absent: a shortcut is refused (`no clock`). */
  readonly now?: number;
}

/** The filters as the server receives them: the model, cleaned and made absolute (docs/behaviors/server-filter.md). */
export type WireFilterModel = Readonly<Record<string, WireFilter>>;

/** UTC, `YYYY-MM-DDTHH:mm:ss.sssZ`, always three digits of milliseconds: comparing the strings compares the times. */
export type WireInstant = string;

export type WireFilter =
  | { readonly type: 'text'; readonly op: TextOp; readonly value?: string; readonly caseSensitive?: true }
  | { readonly type: 'number'; readonly op: NumOp; readonly value?: number; readonly valueTo?: number }
  /**
   * Civil days, no zone; `between` in order, both ends in. A shortcut travels
   * as `between` on its days, resolved in `zone`, with its name in `relative`.
   */
  | { readonly type: 'day'; readonly op: NumOp; readonly value?: Day; readonly valueTo?: Day; readonly relative?: RelativeRange; readonly zone?: string }
  | { readonly type: 'instant'; readonly op: 'blank' | 'notBlank' }
  | {
      readonly type: 'instant';
      readonly op: 'onDay' | 'betweenDays' | 'before' | 'after' | 'between';
      /** The fields the op reads, as the user gave them: for logs and saved views. */
      readonly day?: string;
      readonly dayTo?: string;
      readonly at?: string | number;
      readonly atTo?: string | number;
      /** What the server applies: `[from, to)`, null for an open end. */
      readonly resolved: { readonly from: WireInstant | null; readonly to: WireInstant | null };
      readonly zone: string;
      /** A shortcut: sent as `betweenDays` on the days it names now, its name here (for logs and saved views). */
      readonly relative?: RelativeRange;
    }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'set'; readonly include?: readonly string[]; readonly exclude?: readonly string[]; readonly blanks?: 'include' | 'exclude' }
  | { readonly type: 'combined'; readonly join: 'and' | 'or'; readonly conditions: readonly WireFilter[] }
  | { readonly type: 'custom'; readonly kind: string; readonly value: Json };

const MAX_DEPTH = 3;
const MS_PER_DAY = 86_400_000;
/** Half-typed: no filter, no problem. */
const OFF = 0;
type Out = WireFilter | typeof OFF | null;

/**
 * Milliseconds as the wire writes them, or null outside the years 0000–9999.
 * A fraction of a millisecond rounds up: `[from, to)` then keeps the same
 * whole-millisecond rows. No `Date`: day arithmetic and padding.
 */
function wireInstant(ms: number): WireInstant | null {
  const n = Math.ceil(ms);
  const day = Math.floor(n / MS_PER_DAY);
  const d = epochDayToDay(day);
  if (d === null) return null;
  const rest = n - day * MS_PER_DAY;
  const p = (v: number, w = 2): string => String(v).padStart(w, '0');
  return `${d}T${p(Math.floor(rest / 3_600_000))}:${p(Math.floor(rest / 60_000) % 60)}:${p(Math.floor(rest / 1000) % 60)}.${p(rest % 1000, 3)}Z`;
}

/**
 * The wire form of a filter model: what `sourceRows` sends. Each filter is
 * checked as the browser checks it (same problem codes and paths): an error
 * drops it with its problem, a half-typed one is dropped quietly. Instant
 * filters gain `resolved`, their bounds in `ctx.timeZone`, and that `zone`.
 */
export function toWire<T>(f: FilterModel, env: WireEnv<T>): { readonly filter: WireFilterModel; readonly problems: readonly Problem[] } {
  const problems: Problem[] = [];
  const filter: Record<string, WireFilter> = {};
  for (const [colId, cf] of Object.entries(f ?? {})) {
    const path = `filter.${colId}`;
    const col = env.columns.get(colId);
    if (!col) problems.push(problem('unknown-column', 'error', path));
    else if (!col.filterable) problems.push(problem('invalid-filter', 'error', path));
    else {
      const w = wireOne(col, cf, path, env, problems, 1);
      if (w) filter[colId] = w;
    }
  }
  return { filter, problems };
}

function wireOne<T>(col: ResolvedColumn<T>, f: ColumnFilter, path: string, env: WireEnv<T>, problems: Problem[], depth: number): Out {
  const bad = (at = path, detail?: string): null => {
    problems.push(problem('invalid-filter', 'error', at, detail));
    return null;
  };
  if (!f || typeof f !== 'object') return bad();
  switch (f.type) {
    case 'text': {
      if (col.type !== 'text' && col.type !== 'enum' && col.codec.keyKind !== 'text') return bad();
      if (!TEXT_OPS.has(f.op)) return bad(`${path}.op`);
      if (f.value !== undefined && typeof f.value !== 'string') return bad(`${path}.value`);
      if (f.op === 'blank' || f.op === 'notBlank') return { type: 'text', op: f.op };
      if (!f.value) return OFF;
      return { type: 'text', op: f.op, value: f.value, ...(f.caseSensitive === true && { caseSensitive: true }) };
    }
    case 'number':
    case 'day': {
      if (col.type !== f.type) return bad();
      const day = f.type === 'day';
      // A shortcut: its days, a value left from another op neither read nor sent.
      if (day && f.op === 'relative') {
        const days = relativeOf(f.range, env.ctx.timeZone, env.now, path, problems);
        return days && { type: 'day', op: 'between', value: days.from, valueTo: days.to, relative: f.range!, zone: env.ctx.timeZone };
      }
      if (day) {
        for (const k of ['value', 'valueTo'] as const) {
          if (f[k] !== undefined && !parseDay(f[k])) {
            problems.push(problem('invalid-day', 'error', `${path}.${k}`));
            return null;
          }
        }
      }
      if (!NUM_OPS.has(f.op)) return bad(`${path}.op`);
      if (f.op === 'blank' || f.op === 'notBlank') return { type: f.type, op: f.op } as WireFilter;
      // A day was checked above; a number must be finite.
      const ok = (v: unknown): boolean => v === undefined || day || (typeof v === 'number' && Number.isFinite(v));
      if (!ok(f.value)) return bad(`${path}.value`);
      if (!ok(f.valueTo)) return bad(`${path}.valueTo`);
      const v = f.value as number | string | undefined;
      const w = f.valueTo as number | string | undefined;
      if (v === undefined || (f.op === 'between' && w === undefined)) return OFF;
      if (f.op !== 'between') return { type: f.type, op: f.op, value: v } as WireFilter;
      // Days compare as strings: they are written in full.
      return { type: f.type, op: 'between', value: v <= w! ? v : w, valueTo: v <= w! ? w : v } as WireFilter;
    }
    case 'instant': {
      if (col.type !== 'instant') return bad();
      if (!INSTANT_OPS.has(f.op)) return bad(`${path}.op`);
      if (f.op === 'blank' || f.op === 'notBlank') return { type: 'instant', op: f.op };
      const r = resolveInstantRange(f, env.ctx.timeZone, path, env.now);
      problems.push(...r.problems);
      if (r.problems.length) return null;
      if (!r.range) return OFF;
      const { from, to } = r.range;
      const a = from === null ? null : wireInstant(from);
      const b = to === null ? null : wireInstant(to);
      if ((from !== null && a === null) || (to !== null && b === null)) {
        problems.push(problem('invalid-instant', 'error', `${path}.resolved`));
        return null;
      }
      // The fields the op read: a moment wins over a day for before and after.
      const fields =
        r.days ? { op: 'betweenDays', day: r.days.from, dayTo: r.days.to, relative: f.range } :
        f.op === 'onDay' ? { day: f.day } :
        f.op === 'betweenDays' ? { day: f.day, dayTo: f.dayTo } :
        f.op === 'between' ? { at: f.at, atTo: f.atTo } :
        f.at != null ? { at: f.at } : { day: f.day };
      return { type: 'instant', op: f.op, ...fields, resolved: { from: a, to: b }, zone: env.ctx.timeZone } as WireFilter;
    }
    case 'boolean':
      if (col.type !== 'boolean') return bad();
      if (f.value === null || f.value === undefined) return OFF;
      if (typeof f.value !== 'boolean') return bad(`${path}.value`);
      return { type: 'boolean', value: f.value };
    case 'set': {
      const list = f.include ?? f.exclude;
      if ((f.include && f.exclude) || (list !== undefined && (!Array.isArray(list) || list.some((x) => typeof x !== 'string')))) return bad();
      if (f.blanks !== undefined && f.blanks !== 'include' && f.blanks !== 'exclude') return bad(`${path}.blanks`);
      if (!list) return OFF;
      return { type: 'set', ...(f.include ? { include: list } : { exclude: list }), ...(f.blanks && { blanks: f.blanks }) };
    }
    case 'combined': {
      if (depth >= MAX_DEPTH || (f.join !== 'and' && f.join !== 'or') || !Array.isArray(f.conditions)) return bad();
      const parts = f.conditions.map((c, i) => wireOne(col, c, `${path}.conditions[${i}]`, env, problems, depth + 1));
      if (parts.includes(null)) return null;
      const live = parts.filter((p): p is WireFilter => p !== OFF);
      return live.length ? { type: 'combined', join: f.join, conditions: live } : OFF;
    }
    case 'custom': {
      const kind = typeof f.kind === 'string' ? env.kinds?.(f.kind) : undefined;
      if (!kind) return bad(path, 'unknown kind');
      if (kind.types && !kind.types.includes(col.type)) return bad(path, 'column type');
      try {
        const s = kind.read(f.state);
        if (s === 'invalid') return bad(path, 'invalid state');
        if (!kind.active(s)) return OFF;
        const value = kind.wire ? kind.wire(s, env.ctx, env.ctx.timeZone) : s;
        return isJson(value) ? { type: 'custom', kind: f.kind, value } : bad(path, 'not json');
      } catch {
        return bad(path, 'threw');
      }
    }
    default:
      return bad();
  }
}
