import { problem, type DisplayedRows, type Problem } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { gapLayout, gapsOf, roots, type GapRule } from '@dzgrid/core/row-gaps';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';

export { roots };

export interface RowGapsOptions<T> {
  /** Asked for each shown row but the first, once per new order of the rows shown: `true` a gap of `size`, a number that many pixels. */
  readonly before: GapRule<T>;
  /** Pixels at the default text size, scaled with the text like the row height: 16 by default. */
  readonly size?: number;
}

/**
 * `rowGaps({ before, size })`: an empty space above some rows, outside every row (docs/behaviors/row-gaps.md). The
 * core says where (`gapsOf`) and lays the rows out around the gaps (`gapLayout`); this feature asks the rule once
 * per shown-rows version, scales the sizes with the text, hands the base its layout (`gapsFor`, always the
 * outermost), tells the spans feature where a merge is cut (`gapAt`) and marks the row under a gap (`data-gap`,
 * `--dzg-gap`) for a theme.
 *
 * ```ts
 * import { rowGaps, roots } from '@dzgrid/dom/row-gaps';
 * createGrid(host, { …, features: [tree({ parentId, fixedOpen: isTable }), rowGaps({ before: roots })] });
 * ```
 */
export function rowGaps<T>(o: RowGapsOptions<T>): GridFeature {
  return { id: 'row-gaps', setup: (g) => setup(g as GridContext<T>, o) };
}

function setup<T>(g: GridContext<T>, o: RowGapsOptions<T>): FeatureHandle {
  const tell = (problems: Problem[]): unknown => problems.length && emit(g.kernel, { type: 'problems', source: 'host', problems });
  const rule = o.before;
  let size = o.size ?? 16;
  const bad: Problem[] = [];
  if (!(Number.isFinite(size) && size >= 0)) (size = 16), bad.push(problem('invalid-setting', 'warning', 'rowGaps.size'));
  // Detail panels set heights on the layout themselves (B-D8): no gap beside them in 1.1.0.
  const off = typeof rule !== 'function' ? 'before' : g.settings.features?.some((f) => f.id === 'detail') ? 'detail' : '';
  if (off) bad.push(off === 'detail' ? problem('unsupported-combination', 'warning', 'rowGaps', 'detail') : problem('invalid-setting', 'warning', 'rowGaps.before'));
  tell(bad);
  if (off) return { destroy() {} };

  /** The gaps of the rows shown, asked once per version of them; each kind of bad answer told once. */
  let memo: { readonly d: DisplayedRows<T>; readonly v: number; readonly by: Map<number, number> } | null = null;
  const told = new Set<unknown>();
  const gaps = (d: DisplayedRows<T>): Map<number, number> => {
    if (memo?.d !== d || memo.v !== d.version) {
      const r = gapsOf(d, rule, size);
      memo = { d, v: d.version, by: new Map(r.at.map((a, j) => [a, r.sizes[j]!])) };
      tell(r.problems.filter((p) => !told.has(p.detail) && told.add(p.detail)));
    }
    return memo.by;
  };
  /** A gap's pixels at this text size, as the row height scales. */
  const px = (s: number): number => Math.round((s * g.remPx) / 16);
  g.gapAt = (d, i) => gaps(d).has(i);
  g.gapsFor = (d, inner) => {
    const by = gaps(d);
    return gapLayout(inner, [...by.keys()], [...by.values()].map(px));
  };

  // Compared first: an unchanged repaint writes nothing.
  const mark = (el: HTMLElement, s: number | undefined): void => {
    const v = s === undefined ? '' : `${px(s)}px`;
    if (el.style.getPropertyValue('--dzg-gap') !== v) el.style.setProperty('--dzg-gap', v), el.toggleAttribute('data-gap', !!v);
  };
  return {
    afterRows(f) {
      const by = gaps(f.displayed as DisplayedRows<T>);
      for (const [key, v] of g.rowRenderer.mounted) mark(v.el, by.get(f.displayed.indexOf(key)));
    },
    destroy() {
      delete g.gapsFor;
      delete g.gapAt;
      delete g.laid;
      for (const v of g.rowRenderer.mounted.values()) mark(v.el, undefined);
    },
  };
}
