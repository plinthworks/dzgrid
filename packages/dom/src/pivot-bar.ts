/**
 * `@dzgrid/dom/pivot-bar`: the pivot's one bar « Lignes │ Colonnes │ Valeurs » and the columns panel's pivot sections
 * (docs/behaviors/pivot.md 31–37; owner 2026-11-07), kept out of `@dzgrid/dom/pivot` and `@dzgrid/dom/group-zone`.
 * Texts in `locales/<lang>-pivot-bar` (with the -group and -pivot ones); look in `@dzgrid/theme/pivot.css`.
 */
export { pivotBar, PIVOT_BAR_KEYS, PIVOT_BAR_CSS } from './pivot-bar/index.js';
export type { PivotBarOptions } from './pivot-bar/index.js';
export type { PivotBarMessageKey, PivotBarMessages } from './part-texts.js';
