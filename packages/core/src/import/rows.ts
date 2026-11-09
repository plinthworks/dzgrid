import type { ResolvedColumn } from '../columns/defs.js';
import { parseInput, type Checked } from '../edit/input.js';
import { fold } from '../i18n/fold.js';
import { problem, type Problem } from '../problems.js';
import { epochDayToDay } from '../value/day.js';
import type { LocaleCtx } from '../value/locale.js';
import { resolveWall } from '../value/zone-day.js';
import type { ImportCell } from './sheet.js';

/** The rows read and what was refused (file-import.md 1, 9). */
export interface ImportResult {
  /** One object per line after the header, each value at its column's `field` (a dotted path nested) or id. */
  readonly rows: Record<string, unknown>[];
  /** `import-file`, `import-header`, `import-cell`: paths and codes, never a cell's text. */
  readonly problems: Problem[];
}

/** The serial of 1970-01-01 in Excel's 1900 system; a day's milliseconds. */
const EPOCH = 25_569;
const DAY = 86_400_000;
const blank = (c: ImportCell | undefined): boolean => c == null || (typeof c == 'string' && !c.trim());
const no = (code: string): Checked => ({ ok: false, code });

/** A cell as the column reads it: text as if typed; an Excel number, boolean or serial date as a value (file-import.md 8). */
function valueOf(col: ResolvedColumn<unknown>, c: ImportCell, ctx: LocaleCtx): Checked {
  if (typeof c == 'object' && c) return no('invalid');
  if (typeof c == 'number' && col.type === 'day') {
    const d = epochDayToDay(Math.floor(c) - EPOCH);
    return d ? { ok: true, value: d } : no('day');
  }
  if (typeof c == 'number' && col.type === 'instant') {
    const w = resolveWall(Math.round((c - EPOCH) * DAY), ctx.timeZone, 'reject');
    return w.ok ? { ok: true, value: w.value } : no(w.code);
  }
  return parseInput(col, typeof c == 'string' ? { text: c } : { value: c }, ctx);
}

/**
 * Rows from a file's table (file-import.md 7–10): the first non-blank line is the header, each cell matched to a column by
 * its title or id, folded; a header matching none, or a column's second, told and its cells ignored; then each non-blank
 * line one row, each cell through its column's codec (blank: null), a refused one left out and told by path and code.
 */
export function importRows<T>(table: readonly (readonly ImportCell[])[], columns: readonly ResolvedColumn<T>[], ctx: LocaleCtx): ImportResult {
  const problems: Problem[] = [];
  const rows: Record<string, unknown>[] = [];
  const h = table.findIndex((r) => r.some((c) => !blank(c)));
  const names = new Map<string, ResolvedColumn<T>>();
  for (const c of columns) names.set(fold((c.def.header ?? c.id).trim()), c);
  for (const c of columns) if (!names.has(fold(c.id))) names.set(fold(c.id), c);
  const used = new Set<ResolvedColumn<T>>();
  const at: [number, ResolvedColumn<T>][] = [];
  (table[h] ?? []).forEach((c, i) => {
    if (blank(c)) return;
    const col = names.get(fold(String(c).trim()));
    if (!col || used.has(col)) return void problems.push(problem('import-header', 'warning', `header[${i}]`, col && 'duplicate'));
    used.add(col);
    at.push([i, col]);
  });
  if (!at.length) return { rows, problems: [problem('import-file', 'warning', 'file', 'header')] };
  for (const line of table.slice(h + 1)) {
    if (!line.some((c) => !blank(c))) continue;
    const row: Record<string, unknown> = {};
    for (const [i, col] of at) {
      const c = line[i];
      const r = blank(c) ? ({ ok: true, value: null } as const) : valueOf(col as ResolvedColumn<unknown>, c!, ctx);
      if (!r.ok) {
        problems.push(problem('import-cell', 'warning', `rows[${rows.length}].${col.id}`, r.code));
        continue;
      }
      // At the column's field, a dotted path made nested; else its id.
      const path = col.def.field?.split('.') ?? [col.id];
      let o = row;
      for (const k of path.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
      o[path.at(-1)!] = r.value;
    }
    rows.push(row);
  }
  return { rows, problems };
}
