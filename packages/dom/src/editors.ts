/**
 * `@dzgrid/dom/editors` (Phase 5 step 5, docs/phase-5-steps/step05-plan.md): the fields that edit a cell — text
 * and number at this step — their start and end keys, the local refusal (the bubble), the editor host. It works
 * with `edit()` of `@dzgrid/dom/edit`, which it reaches through the grid (never imported); its texts come in
 * their own bundles (`locales/<lang>-editors`).
 */
export { editors, EDITORS_KEYS } from './editors/index.js';
export type { EditorsOptions } from './editors/index.js';
export type { EditorsMessageKey, EditorsMessages } from './part-texts.js';
