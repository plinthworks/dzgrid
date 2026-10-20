/**
 * `@dzgrid/dom/internal` (step 17): what the feature entries share — slots, filters, search,
 * pagination — so a page with several of them loads it once. Each entry imports it by this name
 * (a self-reference of the package, external in each entry's size line); the base never imports
 * it. Not a public API: it may change in any release.
 */
export { mounted, type Mounted } from './internal/mounted.js';
export { settled } from './internal/settled.js';
export { cellKeys, composing, type CellPart } from './internal/keys.js';
