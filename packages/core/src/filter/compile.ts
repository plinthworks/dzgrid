import { fold } from '../i18n/fold.js';
import type { ColumnEnv } from '../model/column-cache.js';
import type { ResolvedColumn } from '../columns/defs.js';
import { problem, type Problem } from '../problems.js';
import { dayToEpochDay, parseDay } from '../value/day.js';
import { resolveInstantRange } from './instant.js';
import { INSTANT_OPS, NUM_OPS, TEXT_OPS, type ColumnFilter, type FilterModel } from './model.js';

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
 */
export function compileFilter<T>(model: FilterModel, env: ColumnEnv<T>): CompiledFilter {
  const problems: Problem[] = [];
  const tests: RowTest[] = [];
  for (const [colId, f] of Object.entries(model ?? {})) {
    const path = `filter.${colId}`;
    const col = env.columns.get(colId);
    if (!col) { problems.push(problem('unknown-column', 'error', path)); continue; }
    if (!col.filterable) { problems.push(problem('invalid-filter', 'error', path)); continue; }
    const t = compileOne(col, f, path, env, problems, 1);
    if (t !== null && t !== INACTIVE) tests.push(t);
  }
  if (!tests.length) return { active: false, test: () => true, problems };
  const test: RowTest = tests.length === 1 ? tests[0]! : (src) => tests.every((t) => t(src));
  return { active: true, test, problems };
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

type Compiled = RowTest | typeof INACTIVE | null;

function compileOne<T>(col: ResolvedColumn<T>, f: ColumnFilter, path: string, env: ColumnEnv<T>, problems: Problem[], depth: number): Compiled {
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
      const parts = f.conditions.map((c, i) => compileOne(col, c, `${path}.conditions[${i}]`, env, problems, depth + 1));
      if (parts.some((p) => p === null)) return null;
      const live = parts.filter((p): p is RowTest => p !== INACTIVE);
      if (!live.length) return INACTIVE;
      return f.join === 'and' ? (src) => live.every((t) => t(src)) : (src) => live.some((t) => t(src));
    }
    default:
      return bad(problems, path);
  }
}

const bad = (problems: Problem[], path: string): null => {
  problems.push(problem('invalid-filter', 'error', path));
  return null;
};

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
  for (const k of ['value', 'valueTo'] as const) {
    if (f[k] !== undefined && !parseDay(f[k])) {
      problems.push(problem('invalid-day', 'error', `${path}.${k}`));
      return null;
    }
  }
  return rangeTest(col, f, path, env, problems, (v) => dayToEpochDay(parseDay(v)!));
}

function instantTest<T>(col: ResolvedColumn<T>, f: Extract<ColumnFilter, { type: 'instant' }>, path: string, env: ColumnEnv<T>, problems: Problem[]): Compiled {
  if (!INSTANT_OPS.has(f.op)) return bad(problems, `${path}.op`);
  const { keys } = env.cache.keys(col, env);
  if (f.op === 'blank') return (src) => keys[src] !== keys[src];
  if (f.op === 'notBlank') return (src) => keys[src] === keys[src];
  const r = resolveInstantRange(f, env.ctx.timeZone, path);
  problems.push(...r.problems);
  if (r.problems.length) return null;
  if (!r.range) return INACTIVE;
  const from = r.range.from ?? -Infinity;
  const to = r.range.to ?? Infinity;
  // NaN (blank) fails every comparison, so blanks never match a range.
  return (src) => keys[src]! >= from && keys[src]! < to;
}

function setTest<T>(col: ResolvedColumn<T>, f: Extract<ColumnFilter, { type: 'set' }>, path: string, env: ColumnEnv<T>, problems: Problem[]): Compiled {
  const list = f.include ?? f.exclude;
  if ((f.include && f.exclude) || (list !== undefined && (!Array.isArray(list) || list.some((x) => typeof x !== 'string')))) return bad(problems, path);
  if (f.blanks !== undefined && f.blanks !== 'include' && f.blanks !== 'exclude') return bad(problems, `${path}.blanks`);
  if (!list) return INACTIVE;
  const wanted = new Set(list);
  const exports = env.cache.exports(col, env);
  if (f.include) {
    const blanks = f.blanks === 'include';
    return (src) => (exports[src] === null ? blanks : wanted.has(exports[src]!));
  }
  const blanks = f.blanks !== 'exclude';
  return (src) => (exports[src] === null ? blanks : !wanted.has(exports[src]!));
}

