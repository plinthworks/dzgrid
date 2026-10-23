/**
 * `@dzgrid/dom/edit` (Phase 5 step 4, docs/phase-5-steps/step04-plan.md): editing wired to the grid, kept out
 * of the base — the save marks and their clocks, the rows out of the order shown, the header's reapply mark,
 * the sentences, the API. It reaches the base only through the grid it is set up on (the `edit` seam, the
 * editor host); its texts come in their own bundles (`locales/<lang>-edit`). The fields are step 5's
 * (`@dzgrid/dom/editors`).
 */
export { edit, EDIT_KEYS } from './edit/index.js';
export type { EditApi, EditFeature, EditFeatureOptions } from './edit/index.js';
export type { EditMessageKey, EditMessages, ValidationCode } from './part-texts.js';
