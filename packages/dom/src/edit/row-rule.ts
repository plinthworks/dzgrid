import { isBlank, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import type { RowRefusal, RowRule } from '@dzgrid/core/edit';
import type { GridContext } from '../context.js';

/**
 * A row's refusals by the application's rule (1.15.0, edit-row.md 9, edit-batch.md 6): every column's value as the cell
 * shows it, `over` the values about to be kept in its place. A rule that throws is reported and refuses on `anchor`
 * (`invalid`): nothing unchecked leaves. Shared by `@dzgrid/dom/edit-batch` and `@dzgrid/dom/editors-row`.
 */
export function rowRefusals<T>(g: GridContext<unknown>, rule: RowRule<T> | undefined, key: RowKey, anchor: string, over?: ReadonlyMap<string, unknown>): RowRefusal[] {
  const node = g.kernel.rowOf(key);
  if (!rule || !node) return [];
  const values: Record<string, unknown> = {};
  for (const { id } of g.kernel.columns.state()) values[id] = over?.has(id) ? over.get(id) : g.edit!.read(g.columns.get(id)!, node.data, key);
  try {
    const r = rule(values, node.data as T, g.settings.context);
    return (Array.isArray(r) ? r : r ? [r] : []).filter((x: RowRefusal | null) => typeof x?.column == 'string' && typeof x.code == 'string');
  } catch (err) {
    g.report(err);
    return [{ column: anchor, code: 'invalid' }];
  }
}

/** Two values of a column the same, as the edit controller reads them: the same, both empty, or equal once coerced. */
export function same(g: GridContext<unknown>, col: ResolvedColumn<unknown>, a: unknown, b: unknown): boolean {
  if (Object.is(a, b) || (isBlank(a) && isBlank(b))) return true;
  const x = col.codec.coerce(a, g.ctx);
  const y = col.codec.coerce(b, g.ctx);
  return x !== null && y !== null && col.codec.equals(x as never, y as never);
}
