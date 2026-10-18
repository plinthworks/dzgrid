import type { ResolvedColumn } from '../columns/defs.js';
import type { FilterModel } from '../filter/model.js';
import { fold } from '../i18n/fold.js';
import type { Problem } from '../problems.js';
import type { LocaleCtx } from '../value/locale.js';

/** How many values a list holds by default (docs/behaviors/value-list.md): above, `truncated`, and the user refines. */
export const VALUES_MAX = 2000;

/**
 * One choice of a value list: `value` is the export text a set filter matches,
 * `label` the cell as shown. `count` is null when a server does not say it.
 * `selected`: a value ticked in the column's own filter that has no row now,
 * kept so the user can untick it (the owner's rule).
 */
export interface SetValue {
  readonly value: string;
  readonly label: string;
  readonly count: number | null;
  readonly selected?: boolean;
}

/** `blanks`: the rows whose cell is blank, null when a server does not say. */
export interface ValueList {
  readonly values: readonly SetValue[];
  readonly blanks: number | null;
  readonly truncated: boolean;
}

export interface ValuesOptions {
  readonly search?: string;
  /** VALUES_MAX by default; anything but a whole number ≥ 1 reads as the default. */
  readonly max?: number;
}

/** A column's value list, kept fresh while open (`kernel.values`, value-list.md). */
export interface ValuesHandle {
  readonly status: 'idle' | 'loading' | 'error';
  /** The last accepted list, kept while a new one loads or after a failure. */
  readonly result: ValueList | null;
  /** False: nothing to list here (a server without `values`, an unknown column): the UI uses the column's options. */
  readonly available: boolean;
  /** The host's error, unchanged, when `status` is `error`. */
  readonly failure?: unknown;
  readonly problems: readonly Problem[];
  /** Trimmed; the same text asks nothing. */
  search(text: string): void;
  refresh(): void;
  /** Called when the status or the result changes. */
  subscribe(fn: () => void): () => void;
  /** Cancels what is asked; nothing is told afterwards. */
  close(): void;
}

export const EMPTY_LIST: ValueList = { values: [], blanks: null, truncated: false };

/** A cap as asked, or the default. */
export const capOf = (max: unknown): number => (Number.isInteger(max) && (max as number) > 0 ? (max as number) : VALUES_MAX);

/** The values ticked in a column's own filter: its top-level set's `include`, when it has one. */
export const tickedIn = (filter: FilterModel, col: string): readonly string[] | undefined => {
  const f = filter[col];
  return f?.type === 'set' && Array.isArray(f.include) ? f.include.filter((x) => typeof x === 'string') : undefined;
};

/** Every word of a search found in the label or the value, folded. */
export const matches = (words: readonly string[], label: string, value: string): boolean => {
  const l = fold(label);
  const v = fold(value);
  return words.every((w) => l.includes(w) || v.includes(w));
};

/** A value as its column shows it, read back from its export text; the text itself when the codec cannot. */
export const labelFor = <T>(col: ResolvedColumn<T>, value: string, ctx: LocaleCtx): string => {
  try {
    const v = col.codec.coerce(value, ctx);
    return v === null ? value : col.codec.format(v, ctx);
  } catch {
    return value;
  }
};

/**
 * The owner's exception (value-list.md): the ticked values a list lacks, in
 * the order ticked, once each, count 0, `selected`; those a search leaves out
 * are left out.
 */
export const tickedMissing = (ticked: readonly string[] | undefined, has: (v: string) => boolean, label: (v: string) => string, words: readonly string[]): SetValue[] => {
  const out: SetValue[] = [];
  const seen = new Set<string>();
  for (const v of ticked ?? []) {
    if (seen.has(v) || has(v)) continue;
    seen.add(v);
    const l = label(v);
    if (matches(words, l, v)) out.push({ value: v, label: l, count: 0, selected: true });
  }
  return out;
};

const sameValue = (a: SetValue, b: SetValue): boolean => a.value === b.value && a.label === b.label && a.count === b.count && !a.selected === !b.selected;
/** Two lists with the same content: values, labels, counts, `selected`, blanks, `truncated`. */
export const sameList = (a: ValueList | null, b: ValueList | null): boolean =>
  a === b || (!!a && !!b && a.blanks === b.blanks && a.truncated === b.truncated && a.values.length === b.values.length && a.values.every((v, i) => sameValue(v, b.values[i]!)));

/**
 * The state behind a handle, shared by the browser's and a server's lists:
 * the owner sets `status`, `result`, `failure`, `problems`, then `ping()`
 * tells the listeners if the status or the result changed.
 */
export class ValuesBox implements ValuesHandle {
  status: ValuesHandle['status'] = 'idle';
  result: ValueList | null = null;
  failure?: unknown;
  problems: readonly Problem[] = [];
  closed = false;
  #fns = new Set<() => void>();
  #seen: [string, ValueList | null, boolean] = ['idle', null, true];

  constructor(
    public available: boolean,
    /** The search in force, trimmed. */
    public q = '',
    /** Asks again (the search changed, a refresh). */
    readonly run: () => void = () => {},
    readonly end: () => void = () => {},
  ) {}

  search(text: string): void {
    const t = String(text ?? '').trim();
    if (this.closed || t === this.q) return;
    this.q = t;
    this.run();
  }

  refresh(): void {
    if (!this.closed) this.run();
  }

  subscribe(fn: () => void): () => void {
    this.#fns.add(fn);
    return () => void this.#fns.delete(fn);
  }

  close(): void {
    if (this.closed) return;
    // No listener is left to tell: a closed box is silent.
    this.closed = true;
    this.#fns.clear();
    this.end();
  }

  /** Tells the listeners when the status, `available` or the result's content changed; an equal result keeps the object told. */
  ping(): void {
    const [st, was, av] = this.#seen;
    if (this.result !== was && sameList(this.result, was)) this.result = was;
    if (st === this.status && this.result === was && av === this.available) return;
    this.#seen = [this.status, this.result, this.available];
    for (const fn of [...this.#fns]) fn();
  }
}

/** A handle with nothing to list: an unknown column, a model without lists, a server without `values`. */
export const closedValues = (problems: readonly Problem[] = []): ValuesHandle => {
  const b = new ValuesBox(false);
  b.result = EMPTY_LIST;
  b.problems = problems;
  b.ping();
  b.closed = true;
  return b;
};
