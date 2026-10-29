import type { LocaleCtx } from './locale.js';

/** What `parse` returns for text it will not read as the column's type. */
export const REJECTED: unique symbol = Symbol();
export type Rejected = typeof REJECTED;

export type ColumnType = 'text' | 'number' | 'day' | 'instant' | 'boolean' | 'enum' | 'custom';

/**
 * How one type of value is read, written, compared and exported.
 *
 * Two readers, on purpose (D7): `coerce` reads machine values — the host's
 * JSON, ISO strings — and never guesses; `parse` reads what a person typed or
 * pasted, by the locale's rules, and refuses what it would have to guess.
 */
export interface ValueCodec<V> {
  readonly kind: ColumnType;
  /** What `sortKey` returns: numbers compared directly, or text to rank with the collator. */
  readonly keyKind: 'number' | 'text';
  /** A machine value, or null for a blank or an invalid one (see `why`). */
  coerce(raw: unknown, ctx: LocaleCtx): V | null;
  /** Why `coerce` gave null for a non-blank value, as a problem code or detail. */
  why?(raw: unknown, ctx: LocaleCtx): string;
  /** A warning about a value `coerce` accepted by making a choice (a wall time inside a clock change). */
  warning?(raw: unknown, ctx: LocaleCtx): 'wall-time-skipped' | 'wall-time-ambiguous' | null;
  /** Typed or pasted text; empty text is REJECTED except for text columns. */
  parse(text: string, ctx: LocaleCtx): V | Rejected;
  format(v: V, ctx: LocaleCtx): string;
  sortKey(v: V, ctx: LocaleCtx): number | string;
  compare(a: V, b: V, ctx: LocaleCtx): number;
  isEmpty(v: unknown): boolean;
  equals(a: V, b: V): boolean;
  /** Raw and stable: what CSV, the clipboard and value-list filters use. Never the display. */
  toExport(v: V): string;
}

/** null, undefined and '' are blank for every type. */
export const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';
