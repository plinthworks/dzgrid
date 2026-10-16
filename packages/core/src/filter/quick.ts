import { fold } from '../i18n/fold.js';
import type { ColumnEnv } from '../model/column-cache.js';
import type { ResolvedColumn } from '../columns/defs.js';
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

type Probe = (src: number, word: string) => boolean;

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

  const always: Probe[] = [];
  const withDigits: Probe[] = [];
  for (const col of columns) {
    if (col.type === 'text' || col.type === 'enum' || (col.type === 'custom' && col.codec.keyKind === 'text')) {
      const cells = env.cache.searchable(col, env);
      if (col.type === 'enum') {
        const values = env.cache.exports(col, env);
        always.push((src, w) => {
          const c = cells[src];
          return (c != null && c.includes(w)) || !!values[src]?.toLowerCase().includes(w);
        });
      } else {
        always.push((src, w) => {
          const c = cells[src];
          return c != null && c.includes(w);
        });
      }
    } else if (col.type === 'number' || col.type === 'day' || col.type === 'instant') {
      const shown = env.cache.displays(col, env);
      const raw = env.cache.exports(col, env);
      withDigits.push((src, w) => !!shown[src]?.includes(w) || !!raw[src]?.toLowerCase().includes(w));
    }
  }
  const plans = words.map((w) => ({ w, probes: /[0-9]/.test(w) ? [...always, ...withDigits] : always }));
  const stats = env.cache.stats;
  return {
    active: true,
    problems: [],
    test: (src) => {
      stats.quickScanned++;
      for (const { w, probes } of plans) {
        let found = false;
        for (const p of probes) if (p(src, w)) { found = true; break; }
        if (!found) return false;
      }
      return true;
    },
  };
}
