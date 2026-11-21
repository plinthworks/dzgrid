/**
 * `@dzgrid/dom/sparkline` (1.16.0, docs/behaviors/sparklines.md): a `type: 'sparkline'` column drawn as a small line,
 * area, bar or win / loss chart. Its own entry, so a grid without sparklines carries none of it; its texts in
 * `@dzgrid/dom/locales/<lang>-sparkline`, its look in `@dzgrid/theme/sparkline.css`.
 */
export { sparklines, SPARKLINE_KEYS } from './sparkline/index.js';
export type { SparklineOptions, SparklineValues } from '@dzgrid/core';
