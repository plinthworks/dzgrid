/**
 * `@dzgrid/dom/editors` (Phase 5 step 5, docs/phase-5-steps/step05-plan.md): the fields that edit a cell — text
 * and number (step 5), day and instant with a calendar loaded on demand, yes/no, a list, the application's own (step 6) — their start and end keys, the local refusal (the bubble), the editor host. It works
 * with `edit()` of `@dzgrid/dom/edit`, which it reaches through the grid (never imported); its texts come in
 * their own bundles (`locales/<lang>-editors`). Its calendar is tzslot's (`@tzslot/core` and `@tzslot/dom`, needed
 * at build time): without them, `@dzgrid/dom/editors-base` (1.2.0).
 */
import type { GridFeature } from './features.js';
import { editorsWith, type EditorsOptions } from './editors/index.js';

export { EDITORS_KEYS } from './editors/index.js';
/** Its layout CSS, for a page that sets `injectStyles: false` and loads it itself. */
export { EDITORS_CSS } from './editors/index.js';
export type { EditorsOptions } from './editors/index.js';
export type { CalendarAdapter, CalendarKit, CalendarView } from './editors/dates.js';
export type { CellInput, EditorHandle } from './part.js';
export type { EditorsMessageKey, EditorsMessages } from './part-texts.js';

/**
 * `editors(options)`: the editors of a cell (editing.md, editors.md, edit-validation.md 3–9): text and number fields;
 * day and instant fields with tzslot's calendar loaded on demand (`loadCalendar` replaces that import); a yes/no cell
 * toggled in place; a list; the application's own editor (a part of slot `editor`).
 *
 * ```ts
 * import { edit } from '@dzgrid/dom/edit';
 * import { editors } from '@dzgrid/dom/editors';
 * createGrid(host, { …, messages: { ...FR, text: { ...FR.text, ...FR_EDIT.text, ...FR_EDITORS.text } }, features: [edit({ save }), editors()] });
 * ```
 */
export function editors(o: EditorsOptions = {}): GridFeature {
  return editorsWith(o, o.loadCalendar ?? (() => import('./editors/dates/calendar.js')));
}
