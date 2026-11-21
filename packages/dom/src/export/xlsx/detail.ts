import { detailKey, problem, resolveColumns, type ColumnOrGroup, type DisplayIndex, type DisplayedRows, type Problem, type RowKey } from '@dzgrid/core';
import type { XlsxInput, XlsxOptions } from '@dzgrid/core/xlsx';
import type { GridContext } from '../../context.js';
import type { SliceEnv } from '../run/slice.js';

/** What the export run hands the details: its signal (a cancel) and the « preparing » progress. */
export interface DetailRun {
  readonly signal?: AbortSignal;
  prep?(done: number, total: number): void;
}

/**
 * The masters' detail rows for the Excel file (1.16.0, xlsx-export.md 12–14), a chunk of its own loaded only when
 * `xlsx.detail` is set: the masters the scope writes — open on screen (`'expanded'`) or every one (`'all'`) — and, one
 * after another, their rows: the application's `detailRows` (a promise awaited, the export's `signal` given; a rejection
 * fails the export), else a `nestedGrid`'s `settings(…)` (its rows when a list; a server's: told once, no block). The
 * columns: `detailColumns`, else the nested grid's visible ones. Null when cancelled.
 */
export async function prepare(
  g: GridContext<unknown>, x: XlsxOptions, held: { readonly rows: DisplayedRows<unknown>; readonly at: Uint32Array | null }, env: SliceEnv, run: DetailRun = {},
): Promise<{ readonly input: Partial<XlsxInput<unknown>>; readonly options: Partial<XlsxOptions>; readonly problems: Problem[] } | null> {
  const m = g.masters;
  const all = x.detail === 'all';
  const own = x.detailRows;
  let cols = x.detailColumns as readonly ColumnOrGroup<unknown>[] | undefined;
  const problems: Problem[] = [];
  const list: [RowKey, Readonly<object>][] = [];
  const n = held.at ? held.at.length : held.rows.count;
  for (let k = 0; k < n; k++) {
    const nd = held.rows.nodeAt((held.at ? held.at[k]! : k) as DisplayIndex);
    if (nd.kind === 'data' && (all ? m?.is(nd.data) ?? true : m?.open(nd.key))) list.push([nd.key, nd.data as object]);
  }
  const got = new Map<RowKey, readonly unknown[]>();
  // A cancel ends the wait for an answer that may never come.
  const { signal } = run;
  const stop = new Promise<never>((_, no) => signal?.addEventListener('abort', () => no(signal.reason), { once: true }));
  stop.catch(() => {});
  run.prep?.(0, list.length);
  for (const [i, [key, row]] of list.entries()) {
    if (env.aborted()) return null;
    let rows: unknown;
    if (own) rows = await Promise.race([own(row, { key, ...(signal && { signal }) }), stop]);
    else if (m?.nested) {
      const s = m.nested({ ...g.partBase!, row, key: detailKey(key), master: key, height: 0 });
      cols ??= resolveColumns(s.columns ?? []).columns.filter((c) => !c.def.hidden).map((c) => c.def);
      rows = s.rows;
      if (rows !== undefined && !Array.isArray(rows) && !problems.length) problems.push(problem('unsupported-combination', 'warning', 'xlsx.detail', 'source'));
    }
    if (Array.isArray(rows) && rows.length) got.set(key, rows);
    run.prep?.(i + 1, list.length);
  }
  if (env.aborted()) return null;
  // Rows and no columns to write them with (an application's `detailRows` alone): told, no block.
  if (got.size && !cols?.length) problems.push(problem('invalid-setting', 'warning', 'xlsx.detailColumns'));
  const { xlsxDetails } = await import('@dzgrid/core/xlsx-detail');
  return {
    input: { details: xlsxDetails, expanded: (k) => got.has(k) },
    options: { detail: 'expanded', detailRows: (_r, c) => got.get(c.key), detailColumns: cols ?? [] },
    problems,
  };
}
