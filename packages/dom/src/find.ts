/**
 * `@dzgrid/dom/find` (Phase 9, docs/behaviors/find.md; owner answers 2026-11-03): find in the grid — Ctrl/Cmd+F inside
 * the grid opens a bar that marks every cell showing the text (rows never hidden), walks them, opens closed tree nodes.
 * Its texts in `locales/<lang>-find`; its colours in `@dzgrid/theme/find.css`.
 */
export { find, FIND_KEYS } from './find/index.js';
export type { FindApi, FindFeature, FindHit, FindOptions, FindState } from './find/index.js';
export type { FindHeldKey, FindMessageKey, FindMessages } from './part-texts.js';
