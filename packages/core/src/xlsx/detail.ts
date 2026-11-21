import { resolveColumns, type ResolvedColumn } from '../columns/defs.js';
import type { DisplayIndex, RowKey } from '../ids.js';
import { problem } from '../problems.js';
import type { DataNode } from '../row/node.js';
import type { XlsxDetailBlocks, XlsxDetailContext } from './sheet.js';
import { colName } from './xml.js';

/** Excel's deepest outline level. */
const OUTLINE = 7;

/**
 * `xlsxDetails` (1.16.0, docs/behaviors/xlsx-export.md 12–19): the masters' detail blocks, handed to the writer in its
 * input (`details`). Asks `detailRows` once per chosen master (`'expanded'`: the input's `expanded`; `'all'`: every
 * data row written) — a list at once: one that throws or is not a list is told once at `xlsx.detailRows`, that master
 * without a block; the columns from `detailColumns`, a refused one told at `xlsx.detailColumns[i]`. Each block: a header
 * row of the detail's labels one column in (after the level column), then its rows, one outline level under its master.
 */
export function xlsxDetails<T>(c: XlsxDetailContext<T>): XlsxDetailBlocks {
  const o = c.options;
  const blocks = new Map<number, readonly unknown[]>();
  const r = resolveColumns(o.detailColumns ?? []);
  const cols = r.columns as ResolvedColumn<unknown>[];
  for (const p of r.problems) c.tell({ ...p, path: p.path.replace(/^columns/, 'xlsx.detailColumns') });
  let extra = 0;
  let top = 0;
  let bad = false;
  const at = (k: number): number => (c.at ? c.at[k]! : k);
  for (let k = 0; o.detail && o.detailRows && cols.length && k < c.total; k++) {
    const nd = c.rows.nodeAt(at(k) as DisplayIndex);
    if (c.skip(nd) || nd.kind !== 'data' || (o.detail !== 'all' && !c.expanded?.(nd.key))) continue;
    let d: unknown;
    try {
      d = o.detailRows(nd.data, { key: nd.key });
    } catch {
      d = 0;
    }
    if (d != null && !Array.isArray(d)) bad = true;
    else if (d?.length) {
      blocks.set(k, d);
      extra += d.length + 1;
      top = Math.max(top, Math.min(c.level(at(k)) + 1, OUTLINE));
    }
  }
  if (bad) c.tell(problem('invalid-setting', 'warning', 'xlsx.detailRows'));
  // The cell writers, made at the first block (the writer's own are ready by then).
  let cells: ReturnType<typeof c.cell>[] | undefined;
  let count = 0;
  return {
    extra,
    top,
    get count() {
      return count;
    },
    write(k, y) {
      const b = blocks.get(k);
      if (!b) return undefined;
      cells ??= cols.map((col, j) => c.cell(col, j));
      const lv = Math.min(c.level(at(k)) + 1, OUTLINE);
      const row = (dy: number, f: (ref: string, j: number) => string): string => `<row r="${dy}" outlineLevel="${lv}">${cols.map((col, j) => f(colName(c.first + j) + dy, j)).join('')}</row>`;
      let xml = row(y, (ref, j) => c.head(cols[j]!, ref));
      b.forEach((data, q) => (xml += row(y + q + 1, (ref, j) => cells![j]!(ref, { kind: 'data', key: '' as RowKey, data } as DataNode<unknown>))));
      count += b.length;
      return [xml, b.length + 1];
    },
  };
}
