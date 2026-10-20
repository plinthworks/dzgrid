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
