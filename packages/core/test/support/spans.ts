import { createColumnModel, localeCtx, type ColumnOrGroup, type DisplayedRows, type ColumnModel } from '@dzgrid/core';
import { createRowStore, flatDisplayed } from '@dzgrid/core/internal';
import type { SpanCell, SpanInput, SpanMap } from '@dzgrid/core/spans';

export type Row = Record<string, unknown> & { id: string };

/**
 * A grid for span tests: rows given as value arrays in the order of the leaf
 * columns, an optional display order (display -> source), an optional page
 * cut of it.
 */
export function spanGrid(defs: readonly ColumnOrGroup<Row>[], data: readonly (readonly unknown[])[], o: { order?: readonly number[]; fullWidth?: SpanInput<Row>['fullWidth']; version?: number; columns?: ColumnModel<Row> } = {}) {
  const columns = o.columns ?? createColumnModel<Row>(defs);
  const ids = columns.state().map((s) => s.id);
  const store = createRowStore<Row>((r) => r.id);
  store.replaceAll(data.map((vals, i) => ({ id: `r${i}`, ...Object.fromEntries(ids.map((id, j) => [id, vals[j]])) })));
  const rows = flatDisplayed(store.snapshot, o.order ? Uint32Array.from(o.order) : null, o.version ?? 1);
  const input: SpanInput<Row> = { rows, columns, ctx: localeCtx({ locale: 'en-US' }), ...(o.fullWidth && { fullWidth: o.fullWidth }) };
  return { input, rows, columns, store };
}

/** Every span of a map (rows or columns > 1, full-width cells included), once, in reading order. */
export function cellsOf(m: SpanMap, rows: number, cols: number): SpanCell[] {
  const out: SpanCell[] = [];
  const seen = new Set<string>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const o = m.ownerAt(r, c);
      if (!o) continue;
      const k = `${o.row},${o.col}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ row: o.row, col: o.col, rows: o.rows, cols: o.cols });
    }
  }
  return out;
}

export const shape = (m: SpanMap) => m.problems.map((p) => ({ code: p.code, severity: p.severity, path: p.path, ...(p.detail !== undefined && { detail: p.detail }) }));

/** Displayed rows over plain nodes, for kinds and levels the store cannot make yet. */
export function nodeRows(nodes: readonly { kind: string; level: number; data: Row }[], version = 1): DisplayedRows<Row> {
  return {
    version,
    count: nodes.length,
    nodeAt: (i) => ({ key: `d:${nodes[i]!.data.id}`, id: nodes[i]!.data.id, ...nodes[i]! }) as never,
    keyAt: (i) => `d:${nodes[i]!.data.id}` as never,
    indexOf: (k) => nodes.findIndex((n) => `d:${n.data.id}` === k) as never,
    index: (n) => (Number.isInteger(n) && n >= 0 && n < nodes.length ? (n as never) : null),
    nextData: () => null,
  };
}

/** A seeded generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <X>(xs: readonly X[]) => xs[Math.floor(next() * xs.length)]! };
}
