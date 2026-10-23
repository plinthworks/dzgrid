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
  | 'edit.saving' | 'edit.saveRefused' | 'edit.reasonUnknown' | 'edit.failedMark' | 'edit.stale' | 'edit.rowStale' | 'edit.reapply' | 'edit.reapplied' | 'header.withStale'
  | `validation.${ValidationCode}`;
/** The refusal codes a value check or a server gives (edit-validation.md 1; a host may add its own `validation.<code>`). */
export type ValidationCode = 'parse' | 'day' | 'invalid-instant' | 'wall-time-skipped' | 'wall-time-ambiguous' | 'required' | 'min' | 'max' | 'pattern' | 'options' | 'invalid';
/** An editing bundle, spread by the host into its messages: `text: { ...FR.text, ...FR_EDIT.text }`. */
export interface EditMessages {
  readonly locale: string;
  readonly text: { readonly [K in EditMessageKey]: MessageValue };
}

/** The detail panels' texts (`@dzgrid/dom/detail`, Phase 4 step 10), in their own bundles (`locales/<lang>-detail`): optional here, required by `detail()`. */
export type DetailMessageKey = 'detail.label' | 'detail.expanded' | 'detail.collapsed';
/** A detail bundle, spread by the host into its messages: `text: { ...FR.text, ...FR_DETAIL.text }`. */
export interface DetailMessages {
  readonly locale: string;
  readonly text: { readonly [K in DetailMessageKey]: MessageValue };
}
