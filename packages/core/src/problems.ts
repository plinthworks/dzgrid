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
/** `@dzgrid/core/row-gaps`' own (1.1.0 step 15, row-gaps.md): a gap rule that threw or answered no size; a type only. */
export type GapProblemCode = 'invalid-gap';

/**
 * `@dzgrid/core/xlsx`'s own (Phase 9, xlsx-export.md), counts only: a day before 1900-03-01 written as text, a text cut at
 * 32 767 characters, a tree deeper than Excel's seven outline levels, more than 60 000 styles, a file past Excel's or
 * ZIP's limits. A type only.
 */
export type XlsxProblemCode = 'xlsx-early-day' | 'xlsx-text-cut' | 'xlsx-outline-depth' | 'xlsx-style-limit' | 'xlsx-too-large';

/**
 * `@dzgrid/core/grouping`'s own (Phase 7, aggregation.md 3, 15): a total that does not fit its column's type, an
 * application's total function that threw; path `columns.<id>.aggFunc`, never a value. `@dzgrid/core/pivot`'s (Phase 10,
 * pivot.md 9): more created columns than `maxColumns`, path `pivot.columns`, the count only. Types only.
 */
export type GroupProblemCode = 'agg-type' | 'agg-threw' | 'pivot-too-many';

export type ProblemCode = (typeof PROBLEM_CODES)[number] | GroupProblemCode | StateProblemCode | PinnedProblemCode | AutoHeightProblemCode | GapProblemCode | XlsxProblemCode | 'print-too-many' | 'unknown-ui-key'
  /** A block of cells over rows a list loaded in blocks does not hold yet: its copy, cut, paste or erase refused (Phase 8). */
  | 'rows-not-loaded';

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
