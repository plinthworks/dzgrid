/**
 * `@dzgrid/dom/edit-batch` (1.15.0, docs/behaviors/edit-batch.md): the changes kept pending in the grid until the
 * application saves them together (`saveAll()`, one request) or drops them (`discardAll()`). Beside `edit()` of
 * `@dzgrid/dom/edit`; its texts in `@dzgrid/dom/locales/<lang>-forms`, its mark in `@dzgrid/theme/forms.css`.
 */
export { editBatch, BATCH_KEYS } from './edit-batch/index.js';
export type { EditBatchApi, EditBatchFeature, EditBatchOptions, PendingChange, SaveAllResult } from './edit-batch/index.js';
export type { RowRefusal, RowRule } from '@dzgrid/core/edit';
