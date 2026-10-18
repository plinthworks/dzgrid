import { collatorFor, collatorKey, type CollatorSpec } from '../i18n/collate.js';
import { fold } from '../i18n/fold.js';
import { Haystack } from './haystack.js';
import type { ColumnLookup } from '../columns/model.js';
import type { ResolvedColumn, ValueReader } from '../columns/defs.js';
import { problem, type Problem } from '../problems.js';
import type { SourceIndex } from '../ids.js';
import type { RowSnapshot, StoreDelta } from '../row/store.js';
import { isBlank } from '../value/codec.js';
import type { LocaleCtx } from '../value/locale.js';
import { quickWords } from '../filter/quick.js';
import { capOf, labelFor, tickedMissing, type SetValue, type ValueList } from './values.js';

/** What sorting and filtering read: one generation of rows, their columns, the user's language, the edit overlay. */
export interface ColumnEnv<T> {
  readonly source: RowSnapshot<T>;
  readonly columns: ColumnLookup<T>;
  readonly ctx: LocaleCtx;
  readonly reader: ValueReader<T>;
  readonly cache: ColumnCache<T>;
}

/** What `raw` returns for a cell whose accessor threw. */
export const THREW: unique symbol = Symbol('dzgrid.threw');

/** The coerced value of a raw cell, or null; `bad` is set when a non-blank value could not be read. */
function coerceCell<T>(col: ResolvedColumn<T>, raw: unknown, env: ColumnEnv<T>): { v: unknown; bad: string | null; warn: 'wall-time-skipped' | 'wall-time-ambiguous' | null } {
  if (raw === THREW) return { v: null, bad: 'read threw', warn: null };
  if (isBlank(raw)) return { v: null, bad: null, warn: null };
  const v = col.codec.coerce(raw, env.ctx);
  if (v === null) return { v: null, bad: typeof raw, warn: null };
  return { v, bad: null, warn: col.codec.warning ? col.codec.warning(raw, env.ctx) : null };
}

/** At most this many invalid cells are reported per column; the rest are counted. */
const MAX_CELL_PROBLEMS = 10;

interface KeyEntry<T> { col: ResolvedColumn<T>; version: number; reader: number; ctx: string; keys: Float64Array; blanks: number; problems: Problem[] }
interface RankEntry<T> { col: ResolvedColumn<T>; version: number; reader: number; ctx: string; ranks: Float64Array; dict: Map<string, number>; distinct: number; problems: Problem[]; used: number }

/**
 * Sort keys per column, computed once per generation and reused: a number
 * per row (`NaN` for a blank), or for text a rank (S5 — the distinct values
 * are collated once, then rows sort by an integer). An update that only
 * changes values already present patches the ranks in place.
 */
export type HayKind = 'search' | 'exact' | 'display' | 'export';

const listCtx = <T>(env: ColumnEnv<T>): string => `${env.ctx.locale}|${env.ctx.numerals}|${env.ctx.timeZone}`;

/** One cell's text for a haystack of `kind`, or null when blank or unreadable. */
function hayCell<T>(kind: HayKind, col: ResolvedColumn<T>, env: ColumnEnv<T>, src: number): string | null {
  const { v } = coerceCell(col, ColumnCache.raw(col, env, src), env);
  if (v === null) return null;
  switch (kind) {
    case 'search': return fold(col.type === 'enum' ? col.codec.format(v, env.ctx) : String(v));
    case 'exact': return (col.type === 'enum' ? col.codec.format(v, env.ctx) : String(v)).normalize('NFC');
    case 'display': return fold(col.codec.format(v, env.ctx));
    case 'export': return col.codec.toExport(v).toLowerCase();
  }
}

/**
 * A column's distinct values (value-list.md), level 1: each export text once
 * (`e`), a row holding it (`r`), its label (`l`), in the column's sort order;
 * `of[i]`, row i's entry (-1 for a blank). Level 2 hangs on it: the counts
 * under one set of other filters, then the last list cut from them.
 */
interface ValueIndex<T> {
  col: ResolvedColumn<T>; version: number; reader: number; ctx: string;
  entries: { e: string; r: number; l: string; f?: string }[];
  ids: Map<string, number>;
  of: Int32Array;
  counts?: { key: string; n: Int32Array; blanks: number; last?: { s: string; x: number; t: string; out: ValueList } };
}

/** What the rows the other filters keep are, as a key and a test (null: every row). Supplied by the model. */
export interface OtherFilters {
  readonly key: string;
  test(): ((src: number) => boolean) | null;
}

/** Past this many patched rows a haystack is rebuilt rather than patched further. */
const MAX_PATCHED = 1000;

export class ColumnCache<T> {
  readonly stats = { keyBuilds: 0, rankBuilds: 0, rankPatches: 0, textBuilds: 0, foldBuilds: 0, exportBuilds: 0, valueBuilds: 0, displayBuilds: 0, quickScanned: 0, warmBuilds: 0, indexBuilds: 0, countBuilds: 0 };
  #index = new Map<string, ValueIndex<T>>();
  #lists = new Map<string, { col: ResolvedColumn<T>; version: number; reader: number; ctx: string; values: unknown[] }>();
  #hays = new Map<string, { col: ResolvedColumn<T>; version: number; reader: number; ctx: string; hay: Haystack }>();
  #keys = new Map<string, KeyEntry<T>>();
  #ranks = new Map<string, RankEntry<T>>();
  #clock = 0;

  /**
   * The raw value a cell holds, through the edit overlay when there is one.
   * A host accessor that throws gives THREW: the cell is read as blank and
   * reported, and one bad row never stops a sort.
   */
  static raw<T>(col: ResolvedColumn<T>, env: ColumnEnv<T>, src: number | SourceIndex): unknown {
    const row = env.source.rows[src]!;
    try {
      return env.reader.overlay ? env.reader.value(col, row, env.source.ids[src]!) : col.read(row);
    } catch {
      return THREW;
    }
  }

  keys(col: ResolvedColumn<T>, env: ColumnEnv<T>): { keys: Float64Array; blanks: number; problems: readonly Problem[] } {
    const ctx = `${env.ctx.locale}|${env.ctx.timeZone}`;
    const hit = this.#keys.get(col.id);
    if (hit && hit.col === col && hit.version === env.source.version && hit.reader === env.reader.version && hit.ctx === ctx) return hit;
    this.stats.keyBuilds++;
    const n = env.source.count;
    const keys = new Float64Array(n);
    const problems: Problem[] = [];
    let blanks = 0;
    let invalid = 0;
    for (let i = 0; i < n; i++) {
      const { v, bad, warn } = coerceCell(col, ColumnCache.raw(col, env, i), env);
      if (v === null) {
        keys[i] = Number.NaN;
        blanks++;
        if (bad && invalid++ < MAX_CELL_PROBLEMS) problems.push(problem('invalid-cell-value', 'warning', `rows[${i}].${col.id}`, bad));
      } else {
        keys[i] = col.codec.sortKey(v, env.ctx) as number;
        if (warn && invalid++ < MAX_CELL_PROBLEMS) problems.push(problem(warn, 'warning', `rows[${i}].${col.id}`));
      }
    }
    if (invalid > MAX_CELL_PROBLEMS) problems.push(problem('invalid-cell-value', 'warning', `rows.${col.id}`, `${invalid - MAX_CELL_PROBLEMS} more`));
    const entry = { col, version: env.source.version, reader: env.reader.version, ctx, keys, blanks, problems };
    this.#keys.set(col.id, entry);
    return entry;
  }

  ranks(col: ResolvedColumn<T>, env: ColumnEnv<T>, spec: CollatorSpec = {}): { ranks: Float64Array; distinct: number; problems: readonly Problem[] } {
    const ckey = collatorKey(env.ctx, spec);
    const id = `${col.id}|${ckey}`;
    const hit = this.#ranks.get(id);
    if (hit && hit.col === col && hit.version === env.source.version && hit.reader === env.reader.version && hit.ctx === ckey) {
      hit.used = ++this.#clock;
      return hit;
    }
    this.stats.rankBuilds++;
    const n = env.source.count;
    const texts: (string | null)[] = new Array(n);
    const problems: Problem[] = [];
    let invalid = 0;
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
      const { v, bad } = coerceCell(col, ColumnCache.raw(col, env, i), env);
      if (v === null) {
        texts[i] = null;
        if (bad && invalid++ < MAX_CELL_PROBLEMS) problems.push(problem('invalid-cell-value', 'warning', `rows[${i}].${col.id}`, bad));
        continue;
      }
      const t = String(col.codec.sortKey(v, env.ctx));
      texts[i] = t;
      seen.add(t);
    }
    if (invalid > MAX_CELL_PROBLEMS) problems.push(problem('invalid-cell-value', 'warning', `rows.${col.id}`, `${invalid - MAX_CELL_PROBLEMS} more`));
    // Collate the distinct values once; collator-equal values share a rank.
    const collator = collatorFor(env.ctx, spec);
    const distinct = [...seen].sort(collator.compare);
    const dict = new Map<string, number>();
    let rank = 0;
    distinct.forEach((t, k) => {
      if (k > 0 && collator.compare(distinct[k - 1]!, t) !== 0) rank++;
      dict.set(t, rank);
    });
    const ranks = new Float64Array(n);
    for (let i = 0; i < n; i++) ranks[i] = texts[i] === null ? Number.NaN : dict.get(texts[i]!)!;
    const entry: RankEntry<T> = { col, version: env.source.version, reader: env.reader.version, ctx: ckey, ranks, dict, distinct: rank + (distinct.length ? 1 : 0), problems, used: ++this.#clock };
    this.#ranks.set(id, entry);
    if (this.#ranks.size > 8) {
      let oldest: string | null = null;
      for (const [k, e] of this.#ranks) if (oldest === null || e.used < this.#ranks.get(oldest)!.used) oldest = k;
      this.#ranks.delete(oldest!);
    }
    return entry;
  }

  #list(kind: 'export' | 'values', col: ResolvedColumn<T>, env: ColumnEnv<T>, build: () => unknown[]): unknown[] {
    const id = `${kind}|${col.id}`;
    const ctx = listCtx(env);
    const hit = this.#lists.get(id);
    if (hit && hit.col === col && hit.version === env.source.version && hit.reader === env.reader.version && hit.ctx === ctx) return hit.values;
    const values = build();
    this.#lists.set(id, { col, version: env.source.version, reader: env.reader.version, ctx, values });
    return values;
  }

  /**
   * A column joined for searching (see `Haystack`):
   * - `search` — the cell's text (an enum's label), folded;
   * - `exact` — the cell's text in NFC, for a case-sensitive filter;
   * - `display` — the cell as displayed in the user's language, folded (numbers, dates);
   * - `export` — the cell's export text, lowercased (an enum's value, a number's raw form).
   */
  /**
   * The same haystack, built a few cells at a time (D13: in idle time).
   * `step` returns true when done — built and stored under the same validity
   * as `haystack`, or abandoned because the rows, the reader or the language
   * changed since it began (nothing is stored then). Null when already built.
   */
  haystackBuilder(kind: HayKind, col: ResolvedColumn<T>, env: ColumnEnv<T>, current: () => ColumnEnv<T>): { step(maxCells: number): boolean; readonly built: number; readonly total: number } | null {
    const id = `${kind}|${col.id}`;
    const ctx = listCtx(env);
    const hit = this.#hays.get(id);
    if (hit && hit.col === col && hit.version === env.source.version && hit.reader === env.reader.version && hit.ctx === ctx) return null;
    const version = env.source.version;
    const reader = env.reader.version;
    const n = env.source.count;
    const cells: (string | null)[] = new Array(n);
    let i = 0;
    let finished = false;
    return {
      get built() { return i; },
      total: n,
      step: (maxCells) => {
        if (finished) return true;
        const now = current();
        if (now.source.version !== version || now.reader.version !== reader || listCtx(now) !== ctx || now.columns.get(col.id) !== col) {
          finished = true;
          return true;
        }
        const end = Math.min(n, i + Math.max(1, maxCells));
        for (; i < end; i++) cells[i] = hayCell(kind, col, env, i);
        if (i < n) return false;
        finished = true;
        this.stats.warmBuilds++;
        this.#hays.set(id, { col, version, reader, ctx, hay: new Haystack(cells) });
        return true;
      },
    };
  }

  haystack(kind: HayKind, col: ResolvedColumn<T>, env: ColumnEnv<T>): Haystack {
    const id = `${kind}|${col.id}`;
    const ctx = listCtx(env);
    const hit = this.#hays.get(id);
    if (hit && hit.col === col && hit.version === env.source.version && hit.reader === env.reader.version && hit.ctx === ctx) return hit.hay;
    if (kind === 'display') this.stats.displayBuilds++;
    else this.stats.foldBuilds++;
    const n = env.source.count;
    const cells: (string | null)[] = new Array(n);
    for (let i = 0; i < n; i++) cells[i] = hayCell(kind, col, env, i);
    const hay = new Haystack(cells);
    this.#hays.set(id, { col, version: env.source.version, reader: env.reader.version, ctx, hay });
    return hay;
  }

  /** Each cell's stable export text (what value lists match on), or null for a blank. */
  exports(col: ResolvedColumn<T>, env: ColumnEnv<T>): readonly (string | null)[] {
    return this.#list('export', col, env, () => {
      this.stats.exportBuilds++;
      const out: (string | null)[] = new Array(env.source.count);
      for (let i = 0; i < out.length; i++) {
        const { v } = coerceCell(col, ColumnCache.raw(col, env, i), env);
        out[i] = v === null ? null : col.codec.toExport(v);
      }
      return out;
    }) as (string | null)[];
  }

  /**
   * Each cell's value as the column's codec reads it (through the edit
   * overlay), null for a blank or unreadable one: what a custom filter kind
   * tests. Built when first asked for, one array per column.
   */
  values(col: ResolvedColumn<T>, env: ColumnEnv<T>): readonly unknown[] {
    return this.#list('values', col, env, () => {
      this.stats.valueBuilds++;
      const out: unknown[] = new Array(env.source.count);
      for (let i = 0; i < out.length; i++) out[i] = coerceCell(col, ColumnCache.raw(col, env, i), env).v;
      return out;
    });
  }

  /**
   * A column's value list (value-list.md): its distinct export texts in the
   * column's sort order (the collator's, ties by code units), labelled by the
   * codec, counted over the rows `others` keeps; values with no row left out,
   * but the `selected` ones a list lacks come first (count 0); the `search`
   * narrows, `max` cuts, but never a `selected` one: those past the cap follow
   * the cut, in order. Equal inputs give the same object.
   */
  distinct(col: ResolvedColumn<T>, env: ColumnEnv<T>, o: { readonly search?: string; readonly max?: number; readonly others?: OtherFilters; readonly selected?: readonly string[] | undefined }): ValueList {
    const ctx = `${listCtx(env)}|${collatorKey(env.ctx)}`;
    let ix = this.#index.get(col.id);
    if (!ix || ix.col !== col || ix.version !== env.source.version || ix.reader !== env.reader.version || ix.ctx !== ctx) {
      this.stats.indexBuilds++;
      const ex = this.exports(col, env);
      const ids = new Map<string, number>();
      const entries: ValueIndex<T>['entries'] = [];
      const of = new Int32Array(ex.length);
      for (let i = 0; i < ex.length; i++) {
        const x = ex[i];
        let k = x === null ? -1 : ids.get(x!);
        if (k === undefined) {
          ids.set(x!, (k = entries.length));
          entries.push({ e: x!, r: i, l: col.codec.format(coerceCell(col, ColumnCache.raw(col, env, i), env).v, env.ctx) });
        }
        of[i] = k;
      }
      // The column's sort order: its keys, or its ranks by the collator; equal ones by their code units.
      const keys = col.codec.keyKind === 'number' ? this.keys(col, env).keys : this.ranks(col, env).ranks;
      const sorted = entries.map((e, k) => ({ ...e, k })).sort((a, b) => keys[a.r]! - keys[b.r]! || (a.e < b.e ? -1 : a.e > b.e ? 1 : 0));
      const at = new Int32Array(entries.length);
      sorted.forEach((e, k) => (at[e.k] = k));
      for (let i = 0; i < of.length; i++) if (of[i]! >= 0) of[i] = at[of[i]!]!;
      for (const [x, k] of ids) ids.set(x, at[k]!);
      ix = { col, version: env.source.version, reader: env.reader.version, ctx, entries: sorted, ids, of };
      this.#index.set(col.id, ix);
    }
    const key = o.others?.key ?? '';
    let c = ix.counts;
    if (!c || c.key !== key) {
      this.stats.countBuilds++;
      const test = o.others?.test() ?? null;
      const n = new Int32Array(ix.entries.length);
      let blanks = 0;
      for (let i = 0; i < ix.of.length; i++) {
        if (test && !test(i)) continue;
        if (ix.of[i]! < 0) blanks++;
        else n[ix.of[i]!]!++;
      }
      ix.counts = c = { key, n, blanks };
    }
    const s = o.search ?? '';
    const x = capOf(o.max);
    const words = quickWords(s);
    const { entries, ids } = ix;
    const n = c.n;
    // The ticked values with no row: only those change the list, never a tick of a value that has rows.
    const missing = tickedMissing(o.selected, (v) => !!n[ids.get(v) ?? -1], (v) => (ids.has(v) ? entries[ids.get(v)!]!.l : labelFor(col, v, env.ctx)), words);
    const t = JSON.stringify(o.selected ?? []);
    const last = c.last;
    if (last && last.s === s && last.x === x && last.t === t) return last.out;
    const ticked = new Set(o.selected);
    const found: SetValue[] = [];
    let kept = 0;
    let more = false;
    for (let k = 0; k < entries.length; k++) {
      const e = entries[k]!;
      if (!n[k]) continue;
      // The label and the value folded once, joined by a character no search word holds.
      if (words.length && !words.every((w) => (e.f ??= `${fold(e.l)}\n${fold(e.e)}`).includes(w))) continue;
      // Past the cap only the ticked values go on, in order: one is never cut (the owner's rule).
      if (found.length - kept === x) {
        more = true;
        if (!ticked.has(e.e)) continue;
        kept++;
      }
      found.push({ value: e.e, label: e.l, count: n[k]! });
    }
    const out: ValueList = { values: missing.length ? [...missing, ...found] : found, blanks: c.blanks, truncated: more };
    c.last = { s, x, t, out };
    return out;
  }

  /**
   * Follows the store: an update that only rewrites some rows patches the
   * keys of those rows, and their ranks when the new text already has one;
   * anything else drops the cache.
   */
  patch(delta: StoreDelta, next: RowSnapshot<T>, envOf: (source: RowSnapshot<T>) => Omit<ColumnEnv<T>, 'source' | 'cache'>): void {
    if (delta.kind === 'none') return;
    this.#index.clear();
    if (delta.kind !== 'update' || !delta.changedSrc) return this.invalidateAll();
    const base = envOf(next);
    const env: ColumnEnv<T> = { ...base, source: next, cache: this };
    const lctx = listCtx(env);
    const keyCtx = `${env.ctx.locale}|${env.ctx.timeZone}`;
    // An entry built under another column definition, reader or context is not
    // this one's to patch: patched with today's rules, it would answer later
    // for yesterday's. It is dropped and rebuilt when asked for.
    const current = (col: ResolvedColumn<T>) => base.columns.get(col.id) === col;
    for (const [id, e] of this.#lists) if (e.ctx !== lctx || e.reader !== env.reader.version || !current(e.col)) this.#lists.delete(id);
    for (const [id, e] of this.#hays) if (e.ctx !== lctx || e.reader !== env.reader.version || !current(e.col)) this.#hays.delete(id);
    for (const [id, e] of this.#hays) {
      if (e.version !== delta.from || e.hay.patchedCount + delta.changedSrc.length > Math.max(MAX_PATCHED, e.hay.count >> 4)) {
        this.#hays.delete(id);
        continue;
      }
      const kind = id.slice(0, id.indexOf('|')) as HayKind;
      for (const src of delta.changedSrc) e.hay.patch(src, hayCell(kind, e.col, env, src));
      e.version = next.version;
    }
    for (const [id, e] of this.#keys) if (e.ctx !== keyCtx || e.reader !== env.reader.version || !current(e.col)) this.#keys.delete(id);
    for (const [id, e] of this.#ranks) if (e.reader !== env.reader.version || !current(e.col) || !id.endsWith(`|${collatorKey(env.ctx)}`)) this.#ranks.delete(id);
    this.#patchLists(delta, next, envOf);
    for (const [id, e] of this.#keys) {
      if (e.version !== delta.from) { this.#keys.delete(id); continue; }
      // Problems carry a cap and a summary: an entry that has any, or would gain
      // one, is rebuilt rather than patched, so it always reads as a fresh build.
      let clean = e.problems.length === 0;
      for (const src of delta.changedSrc) {
        const { v, bad, warn } = coerceCell(e.col, ColumnCache.raw(e.col, env, src), env);
        if (bad || warn) { clean = false; break; }
        const wasBlank = Number.isNaN(e.keys[src]!);
        e.keys[src] = v === null ? Number.NaN : (e.col.codec.sortKey(v, env.ctx) as number);
        e.blanks += (v === null ? 1 : 0) - (wasBlank ? 1 : 0);
      }
      if (!clean) { this.#keys.delete(id); continue; }
      e.version = next.version;
    }
    for (const [id, e] of this.#ranks) {
      if (e.version !== delta.from) { this.#ranks.delete(id); continue; }
      let ok = e.problems.length === 0;
      for (const src of delta.changedSrc) {
        if (!ok) break;
        const { v, bad, warn } = coerceCell(e.col, ColumnCache.raw(e.col, env, src), env);
        if (bad || warn) { ok = false; break; }
        if (v === null) { e.ranks[src] = Number.NaN; continue; }
        const r = e.dict.get(String(e.col.codec.sortKey(v, env.ctx)));
        if (r === undefined) { ok = false; break; }
        e.ranks[src] = r;
      }
      if (ok) {
        e.version = next.version;
        this.stats.rankPatches++;
      }
      else this.#ranks.delete(id);
    }
  }

  /** Export texts and values: recompute the changed rows only. */
  #patchLists(delta: StoreDelta, next: RowSnapshot<T>, envOf: (source: RowSnapshot<T>) => Omit<ColumnEnv<T>, 'source' | 'cache'>): void {
    const env: ColumnEnv<T> = { ...envOf(next), source: next, cache: this };
    for (const [id, e] of this.#lists) {
      if (e.version !== delta.from) { this.#lists.delete(id); continue; }
      const kind = id.slice(0, id.indexOf('|'));
      for (const src of delta.changedSrc!) {
        const { v } = coerceCell(e.col, ColumnCache.raw(e.col, env, src), env);
        e.values[src] = kind === 'values' || v === null ? v : e.col.codec.toExport(v);
      }
      e.version = next.version;
    }
  }

  invalidateAll(): void {
    this.#index.clear();
    this.#keys.clear();
    this.#ranks.clear();
    this.#lists.clear();
    this.#hays.clear();
  }

  /** Drops the search haystacks: a model calls this when its search box is emptied. */
  releaseSearch(): void {
    for (const [id] of this.#hays) if (!id.startsWith('exact|')) this.#hays.delete(id);
  }
}
