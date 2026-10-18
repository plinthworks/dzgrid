import { problem, type Problem } from '../problems.js';
import { leaves, type ColumnOrGroup } from './defs.js';

/**
 * Span rules given to a grid without the spans feature (`@dzgrid/dom/spans`):
 * each kind said once, at its first place, as a warning (the grid works, the
 * rules are ignored). Groups (`columns`), `merge` / `rowSpan` / `colSpan`
 * (`columns[i].<rule>`, i over the leaves), `settings.fullWidth`.
 */
export function missingFeatureProblems<T>(tree: readonly ColumnOrGroup<T>[], fullWidth: unknown): Problem[] {
  const out: Problem[] = [];
  if (tree.some((d) => d && Array.isArray((d as { children?: unknown }).children))) out.push(problem('missing-feature', 'warning', 'columns', 'groups'));
  const said = new Set<string>();
  leaves(tree).forEach((d, i) => {
    for (const k of ['merge', 'rowSpan', 'colSpan'] as const) {
      if (d?.[k] === undefined || said.has(k)) continue;
      said.add(k);
      out.push(problem('missing-feature', 'warning', `columns[${i}].${k}`, 'spans'));
    }
  });
  if (fullWidth !== undefined) out.push(problem('missing-feature', 'warning', 'settings.fullWidth', 'spans'));
  return out;
}
