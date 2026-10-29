/**
 * `@dzgrid/core/compare` (step 16e; docs/behaviors/row-identity-transactions.md « Rows compared by value »): a
 * ready `sameRow` for plain data, kept out of the base so a grid that does not compare by value pays nothing.
 */

/** An object made by a literal or `JSON.parse` (no class, no `Date`, no `Map`). */
const plain = (x: object): boolean => {
  const p = Object.getPrototypeOf(x);
  return p === Object.prototype || p === null;
};

/**
 * Plain data compared deeply: objects by their own enumerable keys, arrays item by item, numbers with `Object.is`
 * (`NaN` equals `NaN`, `0` and `-0` differ); anything else (a `Date`, a `Map`, a class instance, a function) by
 * identity. For `GridSettings.sameRow`; a cycle is not looked for (rows from JSON have none).
 */
export function sameValues(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a != 'object' || typeof b != 'object') return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValues(v, b[i]));
  if (Array.isArray(b) || !plain(a) || !plain(b)) return false;
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every((k) => Object.hasOwn(y, k) && sameValues(x[k], y[k]));
}
