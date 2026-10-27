import type { MessageValue } from './messages.js';

/**
 * The ready cell parts' texts (`@dzgrid/dom/parts`, step 20), in their own bundles (`locales/<lang>-parts`):
 * optional in `GridMessages`, required by `cellBoolean` (a missing one is reported by the cell it fails).
 * Types only, in a file of their own that the base imports as types: its bundle is the same, byte for byte.
 */
export type PartsMessageKey = 'cell.yes' | 'cell.no';
/** A parts bundle, spread by the host into its messages: `text: { ...FR.text, ...FR_PARTS.text }`. */
export interface PartsMessages {
  readonly locale: string;
  readonly text: { readonly [K in PartsMessageKey]: MessageValue };
}

/** The selection rules' texts (`@dzgrid/dom/rules`, step 21), in their own bundles (`locales/<lang>-rules`): optional here, required by `rules()`. */
export type RulesMessageKey = 'rules.refused' | 'rules.refusedReason' | 'rules.partly';
/** A rules bundle, spread by the host into its messages: `text: { ...FR.text, ...FR_RULES.text }`. */
export interface RulesMessages {
  readonly locale: string;
  readonly text: { readonly [K in RulesMessageKey]: MessageValue };
}

/** The tree's texts (`@dzgrid/dom/tree`, Phase 4 step 4), in their own bundles (`locales/<lang>-tree`): optional here, required by `tree()`. */
export type TreeMessageKey = 'tree.expanded' | 'tree.collapsed' | 'tree.expandedSome' | 'tree.empty';
/** A tree bundle, spread by the host into its messages: `text: { ...FR.text, ...FR_TREE.text }`. */
export interface TreeMessages {
  readonly locale: string;
  readonly text: { readonly [K in TreeMessageKey]: MessageValue };
}

/** The editing texts (`@dzgrid/dom/edit`, Phase 5 step 4), in their own bundles (`locales/<lang>-edit`): optional here, required by `edit()`. */
export type EditMessageKey =
  | 'edit.saving' | 'edit.saveRefused' | 'edit.reasonUnknown' | 'edit.reasonNetwork' | 'edit.failedMark' | 'edit.stale' | 'edit.rowStale' | 'edit.reapply' | 'edit.reapplied' | 'header.withStale'
  | 'edit.undone' | 'edit.undoneMany' | 'edit.redone' | 'edit.redoneMany' | 'edit.undoSkipped' | 'edit.redoSkipped' | 'edit.nothingToUndo' | 'edit.nothingToRedo'
  | `validation.${Exclude<ValidationCode, ParseCode>}`;
/** The refusal codes a value check or a server gives (edit-validation.md 1; a host may add its own `validation.<code>`). */
export type ValidationCode = ParseCode | 'required' | 'min' | 'max' | 'pattern' | 'options' | 'invalid';
/** The codes of a text the column's codec could not read: their texts are the editors' (`locales/<lang>-editors`, step 5). */
export type ParseCode = 'parse' | 'day' | 'invalid-instant' | 'wall-time-skipped' | 'wall-time-ambiguous';
/** An editing bundle, spread by the host into its messages: `text: { ...FR.text, ...FR_EDIT.text }`. */
export interface EditMessages {
  readonly locale: string;
  readonly text: { readonly [K in EditMessageKey]: MessageValue };
}

/** The editors' texts (`@dzgrid/dom/editors`, Phase 5 step 5), in their own bundles (`locales/<lang>-editors`): optional here, required by `editors()`. */
export type EditorsMessageKey = 'edit.refused' | 'edit.refusedDropped' | 'editors.fieldName' | 'edit.calendar' | 'edit.calendarLoading' | 'edit.calendarFailed' | 'edit.optionNotInList' | 'edit.rowRemoved' | 'edit.pageDropped' | `validation.${ParseCode}`;
/** An editors bundle, spread by the host into its messages: `text: { ...FR.text, ...FR_EDIT.text, ...FR_EDITORS.text }`. */
export interface EditorsMessages {
  readonly locale: string;
  readonly text: { readonly [K in EditorsMessageKey]: MessageValue };
}

/** The detail panels' texts (`@dzgrid/dom/detail`, Phase 4 step 10), in their own bundles (`locales/<lang>-detail`): optional here, required by `detail()`. */
export type DetailMessageKey = 'detail.label' | 'detail.expanded' | 'detail.collapsed';
/** A detail bundle, spread by the host into its messages: `text: { ...FR.text, ...FR_DETAIL.text }`. */
export interface DetailMessages {
  readonly locale: string;
  readonly text: { readonly [K in DetailMessageKey]: MessageValue };
}

/** The block's texts (`@dzgrid/dom/range`, Phase 5 step 11a), in their own bundles (`locales/<lang>-range`): optional here, required by `range()`. */
export type RangeMessageKey =
  | 'range.rows' | 'range.cols' | 'range.size' | 'range.cleared' | 'range.reordered'
  // The clipboard (step 11b): a label and its count each, no plural forms (owner S11b-Q4); the parts after the first carry their separator.
  | 'range.copied' | 'range.cut' | 'range.pasted' | 'range.erased' | 'range.refused' | 'range.readOnly' | 'range.tooLong' | 'range.outside' | 'range.tooBig' | 'range.noCopy';
/** The fill's texts (`@dzgrid/dom/fill`, Phase 5 step 12), in their own bundles (`locales/<lang>-fill`): optional here, required by `fill()`. */
export type FillMessageKey =
  | 'fill.filled' | 'fill.bulk' | 'fill.mode' | 'fill.pick' | 'fill.cancel'
  // The target's size in the fill mode, by its way (`FillWay`): `{n}` a `range.rows` or `range.cols` text.
  | 'fill.down' | 'fill.up' | 'fill.end' | 'fill.start';
/** A fill bundle, spread by the host into its messages: `text: { ...FR.text, ...FR_RANGE.text, ...FR_FILL.text }`. */
export interface FillMessages {
  readonly locale: string;
  readonly text: { readonly [K in FillMessageKey]: MessageValue };
}
/** A range bundle, spread by the host into its messages: `text: { ...FR.text, ...FR_RANGE.text }`. */
export interface RangeMessages {
  readonly locale: string;
  readonly text: { readonly [K in RangeMessageKey]: MessageValue };
}

/** Moving columns' texts (`@dzgrid/dom/columns`, Phase 6 step 2), in their own bundles (`locales/<lang>-columns`): optional here, required by `columns()`. */
export type ColumnsMessageKey = 'move.placed' | 'move.edge' | 'move.locked' | 'move.cancelled' | `size.${'mode' | 'modeHint' | 'width' | 'min' | 'max' | 'cancelled' | 'autoAll' | 'locked'}`
  // Collapsible header groups (`@dzgrid/dom/spans`, Phase 6 step 7, owner Q8-1).
  | `group.${'toggle' | 'open' | 'closed' | 'closedSaid' | 'openedSaid'}`;
/** The column chooser's texts (`@dzgrid/dom/columns-panel`, Phase 6 step 4, owner Q4-1): in the same `-columns` bundles, required by `columnsChooser()`. */
export type ColumnsChooserMessageKey = `chooser.${'title' | 'search' | 'list' | 'handle' | 'up' | 'down' | 'placed' | 'showAll' | 'reset' | 'close' | 'none' | 'matches' | 'shown' | 'hidden' | 'allShown' | 'resetDone' | 'pinnedStart' | 'pinnedEnd' | 'last' | 'clearToMove' | 'inClosedGroup'}`;
/** A columns bundle (the moves' and the chooser's texts), spread by the host into its messages: `text: { ...FR.text, ...FR_COLUMNS.text }`. */
export interface ColumnsMessages {
  readonly locale: string;
  readonly text: { readonly [K in ColumnsMessageKey | ColumnsChooserMessageKey]: MessageValue };
}

/** The column menu's texts (`@dzgrid/dom/column-menu`, Phase 6 step 3, owner Q3-2), in their own bundles (`locales/<lang>-column-menu`): optional here, required by `columnMenu()`. */
export type ColumnMenuMessageKey =
  | 'menu.button' | 'menu.label' | 'menu.sort' | 'menu.sortAsc' | 'menu.sortDesc' | 'menu.sortNone' | 'menu.pin' | 'menu.pinStart' | 'menu.pinEnd' | 'menu.pinNone'
  | 'menu.sizeAuto' | 'menu.sizeAutoAll' | 'menu.sizeResize' | 'menu.sizeWiden' | 'menu.sizeNarrow' | 'menu.width' | 'menu.moveStart' | 'menu.moveEnd' | 'menu.fillDown' | 'menu.fillEnd'
  | 'menu.filter' | 'menu.hide' | 'menu.choose' | 'menu.reset' | 'menu.pinnedStart' | 'menu.pinnedEnd' | 'menu.unpinned' | 'menu.hidden' | 'menu.resetDone'
  // The density line (density.md, owner Q3-4).
  | 'density.label' | 'density.compact' | 'density.comfortable' | 'density.spacious' | 'density.changed';
/** A column menu bundle, spread by the host into its messages: `text: { ...FR.text, ...FR_COLUMN_MENU.text }`. */
export interface ColumnMenuMessages {
  readonly locale: string;
  readonly text: { readonly [K in ColumnMenuMessageKey]: MessageValue };
}
