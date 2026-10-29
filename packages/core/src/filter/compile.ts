import { fold } from '../i18n/fold.js';
import type { ColumnEnv } from '../model/column-cache.js';
import type { ResolvedColumn } from '../columns/defs.js';
import { problem, type Problem } from '../problems.js';
import { dayToEpochDay, parseDay } from '../value/day.js';
import { relativeOf, resolveInstantRange } from './instant.js';
import type { AnyFilterKind } from './kind.js';
import { INSTANT_OPS, NUM_OPS, setFault, TEXT_OPS, type ColumnFilter, type FilterModel } from './model.js';

/** A test on a source row index (D7): no node is built per row. */
export type RowTest = (src: number) => boolean;

export interface CompiledFilter {
  /** False when nothing filters: every row passes. */
  readonly active: boolean;
  test(src: number): boolean;
  readonly problems: readonly Problem[];
}

const MAX_DEPTH = 3;
const INACTIVE = Symbol('inactive');

/**
 * Compiles a filter model into one test. Columns are joined by AND. A filter
 * that cannot apply — unknown column, wrong type for the column, bad value —
 * is ignored with a problem; one half-typed (a `between` with one bound, an
 * empty box) is simply inactive.
 *
 * Negations are exact complements (D4): `notX` is `!X`, so blanks, which no
 * comparison matches, are kept by every negation.
 *
 * `applied`: the filters that apply, the half-typed and the refused left out
 * (which rows match reads these, as the wire form does for a server).
 *
 * `kinds`: the custom filter kinds by name. A rule that throws on a row does
 * not keep it, and is said once in `problems` (filled as the rows are tested).
 */
export function compileFilter<T>(model: FilterModel, env: ColumnEnv<T>, kinds?: Lookup): CompiledFilter & { readonly applied: FilterModel } {
  const problems: Problem[] = [];
  const tests: RowTest[] = [];
  const applied: Record<string, ColumnFilter> = {};
  for (const [colId, f] of Object.entries(model ?? {})) {
    const path = `filter.${colId}`;
    const col = env.columns.get(colId);
    if (!col) { problems.push(problem('unknown-column', 'error', path)); continue; }
    if (!col.filterable) { problems.push(problem('invalid-filter', 'error', path)); continue; }
    const t = compileOne(col, f, path, env, problems, 1, kinds);
    if (t !== null && t !== INACTIVE) {
      tests.push(t);
      applied[colId] = t.a ?? f;
    }
  }
  if (!tests.length) return { active: false, test: () => true, problems, applied };
  const test: RowTest = tests.length === 1 ? tests[0]! : (src) => tests.every((t) => t(src));
  return { active: true, test, problems, applied };
}

/** The rows that pass every active test, in the order given; null when nothing filters. */
export function filterIndices(count: number, filters: readonly CompiledFilter[], within: Uint32Array | null = null): Uint32Array | null {
  const active = filters.filter((f) => f.active);
  if (!active.length) return within;
  const out = new Uint32Array(within ? within.length : count);
  let n = 0;
  const pass = active.length === 1 ? active[0]!.test : (src: number) => active.every((f) => f.test(src));
  if (within) {
    for (let k = 0; k < within.length; k++) if (pass(within[k]!)) out[n++] = within[k]!;
  } else {
    for (let i = 0; i < count; i++) if (pass(i)) out[n++] = i;
  }
  return out.slice(0, n);
}

/** A combined filter's test carries the conditions that apply (`a`). */
type Compiled = (RowTest & { a?: ColumnFilter }) | typeof INACTIVE | null;
type Lookup = (name: string) => AnyFilterKind | undefined;

function compileOne<T>(col: ResolvedColumn<T>, f: ColumnFilter, path: string, env: ColumnEnv<T>, problems: Problem[], depth: number, kinds?: Lookup): Compiled {
  if (!f || typeof f !== 'object') return bad(problems, path);
  switch (f.type) {
    case 'text': return textTest(col, f, path, env, problems);
    case 'number': return col.type === 'number' ? rangeTest(col, f, path, env, problems, (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)) : bad(problems, path);
    case 'day': return col.type === 'day' ? dayTest(col, f, path, env, problems) : bad(problems, path);
    case 'instant': return col.type === 'instant' ? instantTest(col, f, path, env, problems) : bad(problems, path);
    case 'boolean': {
      if (col.type !== 'boolean') return bad(problems, path);
      if (f.value === null || f.value === undefined) return INACTIVE;
      if (typeof f.value !== 'boolean') return bad(problems, `${path}.value`);
      const want = f.value ? 1 : 0;
      const { keys } = env.cache.keys(col, env);
      return (src) => keys[src] === want;
    }
    case 'set': return setTest(col, f, path, env, problems);
    case 'combined': {
      if (depth >= MAX_DEPTH || (f.join !== 'and' && f.join !== 'or') || !Array.isArray(f.conditions)) return bad(problems, path);
      const parts = f.conditions.map((c, i) => compileOne(col, c, `${path}.conditions[${i}]`, env, problems, depth + 1, kinds));
      if (parts.some((p) => p === null)) return null;
      const live = parts.filter((p): p is RowTest => p !== INACTIVE);
      if (!live.length) return INACTIVE;
      const t: Compiled = f.join === 'and' ? (src) => live.every((t) => t(src)) : (src) => live.some((t) => t(src));
      t.a = { ...f, conditions: f.conditions.flatMap((c, i) => (parts[i] === INACTIVE ? [] : [parts[i]!.a ?? c])) };
      return t;
    }
    case 'custom': return customTest(col, f, path, env, problems, kinds);
    default:
      return bad(problems, path);
  }
}

const bad = (problems: Problem[], path: string, detail?: string): null => {
  problems.push(problem('invalid-filter', 'error', path, detail));
  return null;
};

/** The same checks, codes and details as the wire form's (server/wire.ts), then the kind's rule over the column's values. */
function customTest<T>(col: ResolvedColumn<T>, f: Extract<ColumnFilter, { type: 'custom' }>, path: string, env: ColumnEnv<T>, problems: Problem[], kinds?: Lookup): Compiled {
  const kind = typeof f.kind === 'string' ? kinds?.(f.kind) : undefined;
  if (!kind) return bad(problems, path, 'unknown kind');
  if (kind.types && !kind.types.includes(col.type)) return bad(problems, path, 'column type');
  let pred: ReturnType<NonNullable<AnyFilterKind['test']>>;
  try {
    const s = kind.read(f.state);
    if (s === 'invalid') return bad(problems, path, 'invalid state');
    if (!kind.active(s)) return INACTIVE;
    if (!kind.test) {
      problems.push(problem('filter-needs-server', 'error', path, f.kind));
      return null;
    }
    pred = kind.test(s, env.ctx, env.app);
  } catch {
    return bad(problems, path, 'threw');
  }
  const values = env.cache.values(col, env);
  const rows = env.source.rows;
  let threw = false;
  return (src) => {
    try {
      return pred(values[src], rows[src]!);
    } catch {
      if (!threw) {
        threw = true;
        bad(problems, path, 'threw');
      }
      return false;
    }
  };
}

/** The negation of a test, when the op names one: `notEqual` of `equals`, `notContains` of `contains`. */
const negate = (t: RowTest): RowTest => (src) => !t(src);

function textTest<T>(col: ResolvedColumn<T>, f: Extract<ColumnFilter, { type: 'text' }>, path: string, env: ColumnEnv<T>, problems: Problem[]): Compiled {
  if (col.type !== 'text' && col.type !== 'enum' && col.codec.keyKind !== 'text') return bad(problems, path);
  if (!TEXT_OPS.has(f.op)) return bad(problems, `${path}.op`);
  if (f.value !== undefined && typeof f.value !== 'string') return bad(problems, `${path}.value`);
  const exact = f.caseSensitive === true;
  const hay = env.cache.haystack(exact ? 'exact' : 'search', col, env);
  if (f.op === 'blank') return (src) => hay.isBlank(src);
  if (f.op === 'notBlank') return (src) => !hay.isBlank(src);
  // An empty box is no filter at all.
  if (f.value === undefined || f.value === '') return INACTIVE;

  const needle = exact ? f.value.normalize('NFC') : fold(f.value);
  switch (f.op) {
    case 'contains': {
      const mask = hay.containsMask(needle);
      return (src) => mask[src] === 1;
    }
    case 'notContains': {
      const mask = hay.containsMask(needle);
      return (src) => mask[src] !== 1;
    }
    case 'equals': return (src) => hay.equalsAt(src, needle);
    case 'notEqual': return (src) => !hay.equalsAt(src, needle);
    case 'startsWith': return (src) => hay.startsAt(src, needle);
    case 'endsWith': return (src) => hay.endsAt(src, needle);
  }
}

function rangeTest<T>(
  col: ResolvedColumn<T>,
  f: { op: string; value?: unknown; valueTo?: unknown },
  path: string,
  env: ColumnEnv<T>,
  problems: Problem[],
  key: (v: unknown) => number | null,
): Compiled {
  if (!NUM_OPS.has(f.op)) return bad(problems, `${path}.op`);
  const { keys } = env.cache.keys(col, env);
  if (f.op === 'blank') return (src) => keys[src] !== keys[src];
  if (f.op === 'notBlank') return (src) => keys[src] === keys[src];
  const v = f.value === undefined ? undefined : key(f.value);
  const w = f.valueTo === undefined ? undefined : key(f.valueTo);
  if (v === null) return bad(problems, `${path}.value`);
  if (w === null) return bad(problems, `${path}.valueTo`);
  if (v === undefined || (f.op === 'between' && w === undefined)) return INACTIVE;
  const eq: RowTest = (src) => keys[src] === v;
  switch (f.op) {
    case 'equals': return eq;
    case 'notEqual': return negate(eq);
    case 'lt': return (src) => keys[src]! < v;
    case 'lte': return (src) => keys[src]! <= v;
    case 'gt': return (src) => keys[src]! > v;
    case 'gte': return (src) => keys[src]! >= v;
    case 'between': {
      const lo = Math.min(v, w!);
      const hi = Math.max(v, w!);
      return (src) => keys[src]! >= lo && keys[src]! <= hi;
    }
  }
  return bad(problems, `${path}.op`);
}

function dayTest<T>(col: ResolvedColumn<T>, f: Extract<ColumnFilter, { type: 'day' }>, path: string, env: ColumnEnv<T>, problems: Problem[]): Compiled {
  let g: { op: string; value?: unknown; valueTo?: unknown } = f;
  if (f.op === 'relative') {
    // A shortcut is between on the days it names now, in the grid's zone (a Day has none); a value left from another op is not read.
    const days = relativeOf(f.range, env.ctx.timeZone, env.now, path, problems);
    if (!days) return null;
    g = { op: 'between', value: days.from, valueTo: days.to };
  } else {
    for (const k of ['value', 'valueTo'] as const) {
      if (f[k] !== undefined && !parseDay(f[k])) {
        problems.push(problem('invalid-day', 'error', `${path}.${k}`));
        return null;
      }
    }
  }
  return rangeTest(col, g, path, env, problems, (v) => dayToEpochDay(parseDay(v)!));
}

function instantTest<T>(col: ResolvedColumn<T>, f: Extract<ColumnFilter, { type: 'instant' }>, path: string, env: ColumnEnv<T>, problems: Problem[]): Compiled {
  if (!INSTANT_OPS.has(f.op)) return bad(problems, `${path}.op`);
  const { keys } = env.cache.keys(col, env);
  if (f.op === 'blank') return (src) => keys[src] !== keys[src];
  if (f.op === 'notBlank') return (src) => keys[src] === keys[src];
  // The clock is read for a shortcut only.
  const r = resolveInstantRange(f, env.ctx.timeZone, path, f.op === 'relative' ? env.now : undefined);
  problems.push(...r.problems);
  if (r.problems.length) return null;
  if (!r.range) return INACTIVE;
  const from = r.range.from ?? -Infinity;
  const to = r.range.to ?? Infinity;
  // NaN (blank) fails every comparison, so blanks never match a range.
  return (src) => keys[src]! >= from && keys[src]! < to;
}

function setTest<T>(col: ResolvedColumn<T>, f: Extract<ColumnFilter, { type: 'set' }>, path: string, env: ColumnEnv<T>, problems: Problem[]): Compiled {
  const x = setFault(f, col.def.filter);
  if (x) return bad(problems, path + x[0], x[1]);
  const list = f.include ?? f.exclude;
  if (!list) return INACTIVE;
  const wanted = new Set(list);
  const exports = env.cache.exports(col, env);
  // An include keeps what it lists (blanks when it says so); an exclude the rest (blanks unless it says not).
  const inc = !!f.include;
  const blanks = inc ? f.blanks === 'include' : f.blanks !== 'exclude';
  return (src) => (exports[src] === null ? blanks : wanted.has(exports[src]!) === inc);
}

