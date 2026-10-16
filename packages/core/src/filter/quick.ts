import { fold } from '../i18n/fold.js';
import type { ColumnEnv } from '../model/column-cache.js';
import type { ResolvedColumn } from '../columns/defs.js';
import type { Haystack } from '../model/haystack.js';
import type { CompiledFilter } from './compile.js';

/** The words of a search, folded, split on whitespace. */
export function quickWords(text: string): readonly string[] {
  return fold(text ?? '').split(/\s+/).filter(Boolean);
}

/**
 * True when every row matching `next` also matches `prev`: same words or more,
 * each one containing the word it extends. The model then searches only the
 * previous matches — typing `h`, `he`, `hel` scans less each time.
 */
export function canNarrow(prev: readonly string[], next: readonly string[]): boolean {
  if (!prev.length || next.length < prev.length) return false;
  return prev.every((w, i) => next[i]!.includes(w));
}


/**
 * One search box over the visible columns (quick-filter.md). Every word must
 * be found in at least one column. Text and enum columns are always searched
 * (an enum by its label and its value); number, day and instant columns only
 * for a word with a digit, by their displayed text and their export text —
 * so `05/03` and `2026-03` both find a day. Hidden columns are never searched.
 */
export function compileQuick<T>(text: string, columns: readonly ResolvedColumn<T>[], env: ColumnEnv<T>): CompiledFilter {
  const words = quickWords(text);
  if (!words.length) return { active: false, test: () => true, problems: [] };

  // Per column, the haystacks a word is looked for in: text and enum always,
  // numbers and dates only for a word with a digit.
  const always: Haystack[] = [];
  const withDigits: Haystack[] = [];
  for (const col of columns) {
    if (col.type === 'text' || col.type === 'enum' || (col.type === 'custom' && col.codec.keyKind === 'text')) {
      always.push(env.cache.haystack('search', col, env));
      if (col.type === 'enum') always.push(env.cache.haystack('export', col, env));
    } else if (col.type === 'number' || col.type === 'day' || col.type === 'instant') {
      withDigits.push(env.cache.haystack('display', col, env), env.cache.haystack('export', col, env));
    }
  }
  // Every word in at least one column: OR across columns, AND across words, once.
  const n = env.source.count;
  const pass = new Uint8Array(n).fill(1);
  for (const w of words) {
    const any = new Uint8Array(n);
    for (const hay of /[0-9]/.test(w) ? [...always, ...withDigits] : always) {
      const m = hay.containsMask(w);
      for (let i = 0; i < n; i++) any[i]! |= m[i]!;
    }
    for (let i = 0; i < n; i++) pass[i]! &= any[i]!;
  }
  const stats = env.cache.stats;
  return {
    active: true,
    problems: [],
    test: (src) => {
      stats.quickScanned++;
      return pass[src] === 1;
    },
  };
}
