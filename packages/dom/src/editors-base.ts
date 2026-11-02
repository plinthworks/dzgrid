/**
 * `@dzgrid/dom/editors-base` (1.2.0, docs/behaviors/editors.md « Without tzslot »): `editors()` of
 * `@dzgrid/dom/editors` without tzslot's calendar, for an application that has no `@tzslot/*` installed — nothing it
 * reaches names them, so the application's bundler finds no import to resolve. A day or instant column is typed only
 * (no calendar button, no Alt+Down), unless `loadCalendar` brings a calendar of the application's own.
 *
 * ```ts
 * import { editors } from '@dzgrid/dom/editors-base';
 * createGrid(host, { …, features: [edit({ save }), editors()] });
 * ```
 */
import type { GridFeature } from './features.js';
import { editorsWith, type EditorsOptions } from './editors/index.js';

export { EDITORS_KEYS } from './editors/index.js';
export type { EditorsOptions } from './editors/index.js';
export type { CalendarAdapter, CalendarKit, CalendarView } from './editors/dates.js';
export type { CellInput, EditorHandle } from './part.js';
export type { EditorsMessageKey, EditorsMessages } from './part-texts.js';

/** The editors of a cell, as `editors()` of `@dzgrid/dom/editors`; a calendar only through `loadCalendar`. */
export function editors(o: EditorsOptions = {}): GridFeature {
  return editorsWith(o, o.loadCalendar);
}
