/**
 * `@dzgrid/dom/rules`: selection rules (docs/behaviors/selection-rules.md, step 21), kept out of the
 * base. It reaches the base only through the grid it is set up on; its texts come in their own
 * bundles (`locales/<lang>-rules`).
 */
export { rules, RULES_KEYS } from './rules/index.js';
export type { RulesMessageKey, RulesMessages } from './part-texts.js';
