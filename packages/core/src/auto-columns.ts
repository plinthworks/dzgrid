/**
 * `@dzgrid/core/auto-columns`: column definitions made from the data (docs/behaviors/auto-columns.md, 1.9.0), kept out of
 * the base so a grid with written columns carries none of it. Pure: no DOM, no clock, no `Date`.
 */
import type { ColumnDef } from './columns/defs.js';
import { problem, type Problem } from './problems.js';
import type { ColumnType } from './value/codec.js';

/** A column made from several fields (auto-columns.md 12): any part of a definition, and the fields it reads. */
export type MergedColumn<T, C extends { readonly id: string } = ColumnDef<T>> = Partial<Omit<C, 'id'>> & { readonly from: readonly string[] };

/**
 * `autoColumns()`'s options (auto-columns.md 9–14); all optional. `C`: the columns' type (1.12.0) — a wrapper's own, as
 * `DzgColumnDef<T>` of `@dzgrid/angular` whose `ui.cell` takes a component class, so `override` and `add` need no cast.
 */
export interface AutoColumnsOptions<T, C extends { readonly id: string } = ColumnDef<T>> {
  /** The first rows inspected (50 by default). */
  readonly sample?: number;
  /** A made column's header from its field's name (translation); the name otherwise. */
  readonly header?: (field: string) => string;
  /** By field: any part of a definition laid over the guess (the id stays). */
  readonly override?: Readonly<Record<string, Partial<C>>>;
  /** New columns reading several fields (joined as text, or the given `value`); the fields hidden. */
  readonly merge?: Readonly<Record<string, MergedColumn<T, C>>>;
  /** Fields made hidden (`hidden: true`, still in the list). */
  readonly hide?: readonly string[];
  /** Columns absent from the data (an « actions » column), after the data's. */
  readonly add?: readonly C[];
  /** Columns listed first, in this order; the others after, in data order. */
  readonly order?: readonly string[];
}

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const INSTANT = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/;
const blank = (v: unknown): boolean => v == null || v === '';
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v == 'object' && !Array.isArray(v);

/** The type every non-blank value fits (auto-columns.md 4–7); null: no scalar value at all (an object-only field). */
function typeOf(values: readonly unknown[]): ColumnType | null | undefined {
  const set = values.filter((v) => !blank(v));
  if (set.length && set.every((v) => typeof v == 'object')) return null;
  const all = (test: (v: unknown) => boolean): boolean => set.length > 0 && set.every(test);
  return all((v) => typeof v == 'number' && Number.isFinite(v)) ? 'number'
    : all((v) => typeof v == 'boolean') ? 'boolean'
    : all((v) => typeof v == 'string' && DAY.test(v)) ? 'day'
    : all((v) => typeof v == 'string' && INSTANT.test(v)) ? 'instant'
    : undefined;
}

/**
 * Column definitions made from the first rows (auto-columns.md): one per field, typed by its values (number, boolean, a
 * `YYYY-MM-DD` day, an ISO date-time with an offset as an instant, else text), with the developer's `override`, `merge`,
 * `hide`, `add`, `order` and `header`. Returns them with the problems (a name at most, never a value). Never throws.
 *
 * ```ts
 * import { autoColumns } from '@dzgrid/core/auto-columns';
 * const { columns } = autoColumns(rows, { hide: ['id'], header: (f) => t(`col.${f}`) });
 * ```
 */
export function autoColumns<T, C extends { readonly id: string } = ColumnDef<T>>(rows: readonly T[], o: AutoColumnsOptions<T, NoInfer<C>> = {}): { columns: C[]; problems: Problem[] } {
  const problems: Problem[] = [];
  const warn = (code: 'invalid-setting' | 'unknown-column' | 'duplicate-column-id', path: string, detail?: string): void => void problems.push(problem(code, 'warning', `autoColumns.${path}`, detail));
  if (!Array.isArray(rows)) return warn('invalid-setting', 'rows'), { columns: [], problems };
  // Each option checked once: a wrong one told and left out (14).
  const opt = <K extends keyof AutoColumnsOptions<T, C>>(k: K, ok: (v: unknown) => boolean): AutoColumnsOptions<T, C>[K] | undefined => {
    const v = o?.[k];
    if (v === undefined || ok(v)) return v;
    warn('invalid-setting', k);
    return undefined;
  };
  const order = opt('order', Array.isArray) ?? [];
  const hide = opt('hide', Array.isArray) ?? [];
  const override = opt('override', plain) ?? {};
  const merge = opt('merge', plain) ?? {};
  const add = opt('add', Array.isArray) ?? [];
  const header = opt('header', (v) => typeof v == 'function');
  const sample = opt('sample', (v) => typeof v == 'number' && v >= 1) ?? 50;
  const head = (f: string): string => (header ? header(f) : f);

  // The fields, in the order first met (1).
  const seen = new Map<string, unknown[]>();
  for (const row of rows.slice(0, sample)) if (plain(row)) for (const k of Object.keys(row)) (seen.get(k) ?? seen.set(k, []).get(k)!).push(row[k]);
  // The made columns are plain definitions (an id, a header, a type): every column type C holds them.
  type D = ColumnDef<T>;
  const made = new Map<string, D>();
  for (const [f, values] of seen) {
    const type = typeOf(values);
    if (type !== null) made.set(f, { id: f, header: head(f), ...(type && { type }) });
  }
  const has = (f: string): boolean => made.has(f);
  hide.forEach((f, i) => (has(f) ? (made.set(f, { ...made.get(f)!, hidden: true })) : warn('unknown-column', `hide[${i}]`, f)));

  // Merged columns (12): each at its first source's place, its sources hidden.
  const at = new Map<string, D[]>();
  for (const [id, m] of Object.entries(merge)) {
    if (has(id)) {
      warn('duplicate-column-id', `merge.${id}`, id);
      continue;
    }
    const from = (Array.isArray(m?.from) ? m.from : []).filter((f, i) => has(f) || void warn('unknown-column', `merge.${id}.from[${i}]`, f));
    for (const f of from) made.set(f, { ...made.get(f)!, hidden: true });
    const { from: _, ...rest } = m;
    const col = { id, header: head(id), value: (row: T) => from.map((f) => (row as Record<string, unknown>)[f]).filter((v) => !blank(v)).join(' – '), ...rest } as unknown as D;
    const key = from[0] ?? '';
    at.set(key, [...(at.get(key) ?? []), col]);
  }
  for (const [f, part] of Object.entries(override)) has(f) ? made.set(f, { ...made.get(f)!, ...(part as object), id: f } as D) : warn('unknown-column', `override.${f}`, f);

  // Data order, a merged column before its first source; merges with no source and the added columns after (13).
  const list: D[] = [];
  for (const [f, col] of made) list.push(...(at.get(f) ?? []), col);
  list.push(...(at.get('') ?? []), ...(add as readonly unknown[] as readonly D[]));
  // `order` first (3).
  const first: D[] = [];
  order.forEach((id, i) => {
    const c = list.find((x) => x.id === id);
    c && !first.includes(c) ? first.push(c) : warn('unknown-column', `order[${i}]`, id);
  });
  return { columns: [...first, ...list.filter((c) => !first.includes(c))] as unknown as C[], problems };
}
