import { collatorFor, collatorKey, type CollatorSpec } from '../i18n/collate.js';
import { fold } from '../i18n/fold.js';
import type { ColumnLookup } from '../columns/model.js';
import type { ResolvedColumn, ValueReader } from '../columns/defs.js';
import { problem, type Problem } from '../problems.js';
import type { RowSnapshot, StoreDelta } from '../row/store.js';
import { isBlank } from '../value/codec.js';
import type { LocaleCtx } from '../value/locale.js';

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
/** The source row a cell problem's path names, or −1. */
const rowOf = (path: string): number => {
  const m = /^rows\[(\d+)\]/.exec(path);
  return m ? Number(m[1]) : -1;
};

export class ColumnCache<T> {
  readonly stats = { keyBuilds: 0, rankBuilds: 0, rankPatches: 0, textBuilds: 0, foldBuilds: 0, exportBuilds: 0, displayBuilds: 0, quickScanned: 0 };
  #lists = new Map<string, { col: ResolvedColumn<T>; version: number; reader: number; ctx: string; values: (string | null | undefined)[] }>();
  #keys = new Map<string, KeyEntry<T>>();
  #ranks = new Map<string, RankEntry<T>>();
  #clock = 0;

  /**
   * The raw value a cell holds, through the edit overlay when there is one.
   * A host accessor that throws gives THREW: the cell is read as blank and
   * reported, and one bad row never stops a sort.
   */
  static raw<T>(col: ResolvedColumn<T>, env: ColumnEnv<T>, src: number): unknown {
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

  #list(kind: 'text' | 'export' | 'display' | 'search', col: ResolvedColumn<T>, env: ColumnEnv<T>, build: () => (string | null | undefined)[]): (string | null | undefined)[] {
    const id = `${kind}|${col.id}`;
    const ctx = `${env.ctx.locale}|${env.ctx.timeZone}`;
    const hit = this.#lists.get(id);
    if (hit && hit.col === col && hit.version === env.source.version && hit.reader === env.reader.version && hit.ctx === ctx) return hit.values;
    const values = build();
    this.#lists.set(id, { col, version: env.source.version, reader: env.reader.version, ctx, values });
    return values;
  }

  /** Each cell as text — the value, or an enum's label — or null for a blank or unreadable cell. */
  texts(col: ResolvedColumn<T>, env: ColumnEnv<T>): readonly (string | null)[] {
    return this.#list('text', col, env, () => {
      this.stats.textBuilds++;
      const out: (string | null)[] = new Array(env.source.count);
      for (let i = 0; i < out.length; i++) {
        const { v } = coerceCell(col, ColumnCache.raw(col, env, i), env);
        out[i] = v === null ? null : col.type === 'enum' ? col.codec.format(v, env.ctx) : String(v);
      }
      return out;
    }) as (string | null)[];
  }

  /**
   * Each cell as a search compares it: folded, lowercased — the ASCII ones
   * too, so a search never lowercases a cell twice. Built on first search.
   */
  searchable(col: ResolvedColumn<T>, env: ColumnEnv<T>): readonly (string | null)[] {
    const texts = this.texts(col, env);
    return this.#list('search', col, env, () => {
      this.stats.foldBuilds++;
      const out: (string | null)[] = new Array(texts.length);
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i];
        // fold() lowercases ASCII itself, cheaply.
        out[i] = t == null ? null : fold(t);
      }
      return out;
    }) as (string | null)[];
  }

  /** Each cell as displayed in the user's language, folded — what a search reads for numbers and dates. */
  displays(col: ResolvedColumn<T>, env: ColumnEnv<T>): readonly (string | null)[] {
    return this.#list('display', col, env, () => {
      this.stats.displayBuilds++;
      const out: (string | null)[] = new Array(env.source.count);
      for (let i = 0; i < out.length; i++) {
        const { v } = coerceCell(col, ColumnCache.raw(col, env, i), env);
        out[i] = v === null ? null : fold(col.codec.format(v, env.ctx));
      }
      return out;
    }) as (string | null)[];
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
   * Follows the store: an update that only rewrites some rows patches the
   * keys of those rows, and their ranks when the new text already has one;
   * anything else drops the cache.
   */
  patch(delta: StoreDelta, next: RowSnapshot<T>, envOf: (source: RowSnapshot<T>) => Omit<ColumnEnv<T>, 'source' | 'cache'>): void {
    if (delta.kind === 'none') return;
    if (delta.kind !== 'update' || !delta.changedSrc) return this.invalidateAll();
    this.#patchLists(delta, next, envOf);
    const base = envOf(next);
    const env: ColumnEnv<T> = { ...base, source: next, cache: this };
    for (const [id, e] of this.#keys) {
      if (e.version !== delta.from) { this.#keys.delete(id); continue; }
      // Problems are per row: drop the changed rows' reports, then report again what is still bad.
      const changed = new Set(delta.changedSrc);
      e.problems = e.problems.filter((p) => !changed.has(rowOf(p.path)));
      for (const src of delta.changedSrc) {
        const { v, bad } = coerceCell(e.col, ColumnCache.raw(e.col, env, src), env);
        const wasBlank = Number.isNaN(e.keys[src]!);
        e.keys[src] = v === null ? Number.NaN : (e.col.codec.sortKey(v, env.ctx) as number);
        e.blanks += (v === null ? 1 : 0) - (wasBlank ? 1 : 0);
        if (bad) e.problems.push(problem('invalid-cell-value', 'warning', `rows[${src}].${e.col.id}`, bad));
      }
      e.problems.sort((a, b) => rowOf(a.path) - rowOf(b.path));
      e.version = next.version;
    }
    for (const [id, e] of this.#ranks) {
      if (e.version !== delta.from) { this.#ranks.delete(id); continue; }
      let ok = true;
      const changed = new Set(delta.changedSrc);
      e.problems = e.problems.filter((p) => !changed.has(rowOf(p.path)));
      for (const src of delta.changedSrc) {
        const { v, bad } = coerceCell(e.col, ColumnCache.raw(e.col, env, src), env);
        if (bad) e.problems.push(problem('invalid-cell-value', 'warning', `rows[${src}].${e.col.id}`, bad));
        if (v === null) { e.ranks[src] = Number.NaN; continue; }
        const r = e.dict.get(String(e.col.codec.sortKey(v, env.ctx)));
        if (r === undefined) { ok = false; break; }
        e.ranks[src] = r;
      }
      if (ok) {
        e.problems.sort((a, b) => rowOf(a.path) - rowOf(b.path));
        e.version = next.version;
        this.stats.rankPatches++;
      }
      else this.#ranks.delete(id);
    }
  }

  /** Text, export, display and search lists: recompute the changed rows only. */
  #patchLists(delta: StoreDelta, next: RowSnapshot<T>, envOf: (source: RowSnapshot<T>) => Omit<ColumnEnv<T>, 'source' | 'cache'>): void {
    const env: ColumnEnv<T> = { ...envOf(next), source: next, cache: this };
    for (const [id, e] of this.#lists) {
      if (e.version !== delta.from) { this.#lists.delete(id); continue; }
      const kind = id.slice(0, id.indexOf('|'));
      for (const src of delta.changedSrc!) {
        const { v } = coerceCell(e.col, ColumnCache.raw(e.col, env, src), env);
        let out: string | null = null;
        if (v !== null) {
          if (kind === 'export') out = e.col.codec.toExport(v);
          else if (kind === 'display') out = fold(e.col.codec.format(v, env.ctx));
          else {
            const text = e.col.type === 'enum' ? e.col.codec.format(v, env.ctx) : String(v);
            out = kind === 'search' ? fold(text) : text;
          }
        }
        e.values[src] = out;
      }
      e.version = next.version;
    }
  }

  invalidateAll(): void {
    this.#keys.clear();
    this.#ranks.clear();
    this.#lists.clear();
  }
}
