/**
 * `@dzgrid/dom/column-hover`: the column under the pointer (docs/behaviors/column-hover.md, 1.10.0) — `data-hover-col` on
 * the root, `data-col-hover` on its cells, tinted by `--dzg-column-hover-bg` (unset: nothing drawn). Its own entry, so a
 * grid without it carries none of it; its one rule injected by the feature (`COLUMN_HOVER_CSS` for a host that loads it itself).
 */
export { columnHover, COLUMN_HOVER_CSS } from './column-hover/index.js';
