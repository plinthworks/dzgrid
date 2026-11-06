/**
 * `@dzgrid/dom/pivot`: a pivot table over the row grouping (docs/behaviors/pivot.md 17–30; Phase 10), kept out of the base
 * and of `@dzgrid/dom/grouping`: an application hands `pivot()` to `grouping({ pivot })`. Texts in `locales/<lang>-pivot`;
 * the strip's look in `@dzgrid/theme/grouping.css`; the bands drawn by `spans()`.
 */
export { pivot, PIVOT_KEYS } from './pivot/index.js';
export type { PivotApi, PivotFeature, PivotFeatureOptions } from './pivot/index.js';
export type { PivotMessageKey, PivotMessages } from './part-texts.js';
export type { PivotSeries } from '@dzgrid/core/pivot';
