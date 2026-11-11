/**
 * `@dzgrid/dom/groups`: collapsible header groups (Phase 6 step 7, docs/behaviors/header-groups.md; owner Q-GH, Q8-4),
 * with `@dzgrid/dom/spans` (the group rows). Its own entry, so a grid without collapsible groups carries none of it.
 */
export { groups } from './groups/index.js';
/** Its layout CSS, for a page that sets `injectStyles: false` and loads it itself. */
export { GROUPS_CSS } from './groups/styles.js';
export type { GroupsApi, GroupsFeature } from './groups/index.js';
