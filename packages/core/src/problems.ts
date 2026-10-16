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
  'invalid-cell-value',
  'too-many-pinned',
] as const;

export type ProblemCode = (typeof PROBLEM_CODES)[number];

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
