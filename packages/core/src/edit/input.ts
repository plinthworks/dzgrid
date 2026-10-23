import type { ResolvedColumn } from '../columns/defs.js';
import type { EnumOption } from '../value/codecs/enum.js';
import { isBlank, REJECTED } from '../value/codec.js';
import { resolveWall } from '../value/zone-day.js';
import type { LocaleCtx } from '../value/locale.js';

/** What a cell is given: text typed or pasted, or a value picked, toggled or given back by undo. */
export type CellInput = { readonly text: string } | { readonly value: unknown };

/** A value kept (`null`: the column's empty value), or the code of its refusal (`validation.<code>`). */
export type Checked = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly code: string };

const no = (code: string): Checked => ({ ok: false, code });
const yes = (value: unknown): Checked => ({ ok: true, value });

/**
 * Reads what a cell is given (edit-validation.md 1): empty text is the empty value (`null`; spaces too,
 * except in a text column, which keeps them as typed); other text through the codec's `parse`, its
 * refusal coded by the column's type; a value through `coerce`, refused `invalid` when it gives null.
 * An instant refused in the grid's zone is read again in UTC: read there, its wall time fell in a
 * clock change (`wall-time-skipped` / `-ambiguous`), else `invalid-instant`.
 */
export function parseInput<T>(col: ResolvedColumn<T>, input: CellInput, ctx: LocaleCtx): Checked {
  const { codec, type } = col;
  if ('text' in input) {
    const t = input.text;
    if (t === '' || (type !== 'text' && !t.trim())) return yes(null);
    const v = codec.parse(t, ctx);
    if (v !== REJECTED) return yes(v);
    if (type !== 'instant') return no(type === 'number' ? 'parse' : type === 'day' ? 'day' : type === 'enum' ? 'options' : 'invalid');
    const wall = codec.parse(t, { ...ctx, timeZone: 'UTC' });
    const r = wall === REJECTED ? null : resolveWall(wall as number, ctx.timeZone, 'reject');
    return no(r && !r.ok ? r.code : 'invalid-instant');
  }
  if (isBlank(input.value)) return yes(null);
  const v = codec.coerce(input.value, ctx);
  return v === null ? no('invalid') : yes(v);
}

type Options = readonly EnumOption[] | ((row: never, context: unknown) => readonly EnumOption[]);

/** A column's `edit` rules made ready: the limits read by the codec, the pattern anchored, and the rules found wrong. */
export interface Rules {
  readonly min: unknown;
  readonly max: unknown;
  readonly re: RegExp | null;
  readonly options: Options | null;
  /** `edit.min`, `edit.max`, `edit.pattern`, `edit.options`, `validate`: each ignored. */
  readonly bad: readonly string[];
}

/**
 * The rules of a column's `edit` and its `validate`, read at each check (and by the controller when the
 * columns change, to tell what is wrong): a limit the codec
 * cannot read, a pattern that is not a string or a RegExp or does not compile, options that are
 * neither a list nor a function, a `validate` that is not a function, each named in `bad` and ignored.
 * An enum column without `options` checks against its `enumOptions`.
 */
export function rulesOf<T>(col: ResolvedColumn<T>, ctx: LocaleCtx): Rules {
  const def = col.def;
  const e = def.edit ?? {};
  const bad: string[] = [];
  const limit = (key: 'min' | 'max') => {
    const v = e[key] === undefined ? null : col.codec.coerce(e[key], ctx);
    if (v === null && e[key] !== undefined) bad.push(`edit.${key}`);
    return v;
  };
  let re: RegExp | null = null;
  const p: unknown = e.pattern;
  if (p !== undefined) {
    try {
      // The whole value: `m` would let `^`/`$` match at a line, `g`/`y` carry a position (review R3); `i`, `u`, `s` kept.
      // Neither a string nor a RegExp: `(` never compiles.
      re = new RegExp(`^(?:${typeof p === 'string' ? p : p instanceof RegExp ? p.source : '('})$`, p instanceof RegExp ? p.flags.replace(/[gmy]/g, '') : '');
    } catch {
      bad.push('edit.pattern');
    }
  }
  let options: unknown = e.options ?? (col.type === 'enum' ? def.enumOptions : null) ?? null;
  if (options !== null && typeof options !== 'function' && !Array.isArray(options)) {
    options = null;
    bad.push('edit.options');
  }
  if (def.validate !== undefined && typeof def.validate !== 'function') bad.push('validate');
  return { min: limit('min'), max: limit('max'), re, options: options as Options | null, bad };
}

/**
 * The column's checks of a value read (edit-validation.md 1; owner S3-O3), the first failing wins:
 * `required`, `min`, `max`, `pattern` (string values), `options` (the cell's `current` value passes
 * though not listed, editors.md 17), then `validate` (its non-empty string is the code). An `options`
 * function or a `validate` that throws refuses `invalid`; `threw` hears which (`edit.options`,
 * `validate`; the controller tells it once per column and rule).
 */
export function checkValue<T>(
  col: ResolvedColumn<T>, value: unknown,
  o: { readonly row: Readonly<T>; readonly app: unknown; readonly ctx: LocaleCtx; readonly current?: unknown; readonly threw?: (column: string, rule: string) => void },
): Checked {
  const r = rulesOf(col, o.ctx);
  const { codec, def } = col;
  if (value === null) {
    if (def.edit?.required) return no('required');
  } else {
    if (r.min !== null && codec.compare(value, r.min, o.ctx) < 0) return no('min');
    if (r.max !== null && codec.compare(value, r.max, o.ctx) > 0) return no('max');
    if (r.re && typeof value === 'string' && !r.re.test(value)) return no('pattern');
  }
  let rule = 'edit.options';
  try {
    const list = value === null ? null : typeof r.options === 'function' ? (r.options as (row: Readonly<T>, c: unknown) => readonly EnumOption[])(o.row, o.app) : r.options;
    if (list && !list.some?.((x) => x?.value === value) && !same(col, value, o.current, o.ctx)) return no('options');
    rule = 'validate';
    const code = typeof def.validate === 'function' ? def.validate(value, o.row, o.app) : null;
    if (typeof code === 'string' && code) return no(code);
  } catch {
    o.threw?.(col.id, rule);
    return no('invalid');
  }
  return yes(value);
}

/** Whether two values of a column are the same: the same value, both empty, or equal once read by the codec. */
export function same<T>(col: ResolvedColumn<T>, a: unknown, b: unknown, ctx: LocaleCtx): boolean {
  if (Object.is(a, b) || (isBlank(a) && isBlank(b))) return true;
  const x = col.codec.coerce(a, ctx);
  const y = col.codec.coerce(b, ctx);
  return x !== null && y !== null && col.codec.equals(x, y);
}
