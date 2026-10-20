/**
 * `@dzgrid/dom/parts`: ready cell parts (docs/behaviors/badge-boolean.md, step 20), a badge and
 * yes/no. Parts only: no feature, no setup, no style (the theme draws them), nothing internal; a
 * host registers them in `settings.parts`. Their texts: `@dzgrid/dom/locales/<lang>-parts`.
 */
export { badge, cellBoolean, PARTS_KEYS } from './parts/index.js';
export type { BadgeOptions, Tone } from './parts/index.js';
