import { isBlank, REJECTED, type ValueCodec } from '../codec.js';

/** A sparkline's values in time order; a blank point (null) is a gap. */
export type SparklineValues = readonly (number | null)[];

const read = (raw: unknown): SparklineValues | null => {
  const a = typeof raw == 'string' ? raw.trim().split(/[\s;,]+/) : raw;
  if (!Array.isArray(a)) return null;
  const v = a.map((x) => (isBlank(x) ? null : typeof x == 'number' || typeof x == 'string' ? +x : NaN));
  return v.every((n) => n === null || Number.isFinite(n)) ? v : null;
};
const last = (v: SparklineValues): number => v.findLast((n) => n !== null) ?? -Infinity;
const text = (v: SparklineValues): string => v.map((n) => n ?? '').join(' ');

/**
 * `type: 'sparkline'` (1.16.0, docs/behaviors/sparklines.md): a list of numbers in time order — an array, or text of
 * numbers (`.` decimals) between spaces, `;` or `,`. Sorted by its last value; written to files and the clipboard as its
 * numbers between spaces (read back the same way); drawn by `sparklines()` of `@dzgrid/dom/sparkline`.
 */
export const sparklineCodec: ValueCodec<SparklineValues> = {
  kind: 'sparkline',
  keyKind: 'number',
  coerce: read,
  parse: (t) => read(t) ?? REJECTED,
  format: text,
  sortKey: last,
  compare: (a, b) => last(a) - last(b),
  isEmpty: (v) => isBlank(v) || (Array.isArray(v) && !v.length),
  equals: (a, b) => text(a) === text(b),
  toExport: text,
};
