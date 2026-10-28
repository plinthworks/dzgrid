/**
 * Why an input was refused or bent. A code and raw detail only: the sentences
 * belong to the DOM layer's messages, translated, never to the core. Bad data
 * never throws; a bad *context* (a zone that does not exist) is a programming
 * error and does.
 */
export const PROBLEM_CODES = [
  'invalid-row-id',
  'duplicate-row-id',
  'unknown-row-id',
  'invalid-transaction',
  'invalid-day',
  'invalid-instant',
  'ambiguous-instant',
  'unknown-zone',
  'wall-time-skipped',
  'wall-time-ambiguous',
  'invalid-column',
  'duplicate-column-id',
  'invalid-field-path',
  'unknown-column',
  'invalid-sort',
  'invalid-filter',
  'filter-needs-server',
  'invalid-cell-value',
  'too-many-pinned',
  'invalid-operations',
  'unsupported-live-change',
  'unknown-part',
  'missing-message',
  'invalid-page',
  'invalid-page-response',
  'fetched-set-large',
  'invalid-values-response',
  'invalid-span',
  'span-overlap',
  'span-clipped',
  'invalid-column-group',
  'missing-feature',
  'selection-refused',
  'part-shadowed',
  'unsupported-combination',
  'tree-orphan',
  'tree-cycle',
  'tree-column-not-first',
  'tree-shape',
  'edit-structure',
  'invalid-setting',
] as const;

/**
 * The codes of `@dzgrid/core/state` (Phase 6 step 5, owner E5-2): a type here, their list there (`STATE_CODES`), so the
 * base ships no byte for them.
 */
export type StateProblemCode = 'state-version' | 'state-column' | 'state-group' | 'state-field' | 'state-storage';

/** `@dzgrid/dom/pinned-rows`' own (Phase 6 step 8b-1): a type here, so the base ships no byte for it. */
export type PinnedProblemCode = 'too-many-pinned-rows';

/** `@dzgrid/dom/auto-height`'s own (Phase 6 step 9): more than 10 000 rows with a wrapped column, told once; a type only. */
export type AutoHeightProblemCode = 'auto-height-large';

/**
 * `unknown-ui-key`: a column's `ui` key the grid does not know (feedback pass D), told by `@dzgrid/dom`; `print-too-many`:
 * `@dzgrid/dom/print`'s (Phase 6 step 11), more shown rows than `maxRows`, counts only. Types only.
 */
export type ProblemCode = (typeof PROBLEM_CODES)[number] | StateProblemCode | PinnedProblemCode | AutoHeightProblemCode | 'print-too-many' | 'unknown-ui-key';

export type Severity = 'error' | 'warning';

export interface Problem {
  readonly code: ProblemCode;
  /** An error rejects the input; a warning accompanies an accepted one. */
  readonly severity: Severity;
  /** Where in the input: `rows[12]`. */
  readonly path: string;
  /** Raw, untranslated. Never a row's data: rows may hold health records. */
  readonly detail?: string;
}

export const problem = (code: ProblemCode, severity: Severity, path: string, detail?: string): Problem =>
  detail === undefined ? { code, severity, path } : { code, severity, path, detail };
