/**
 * `@dzgrid/core/server-pivot` (1.8.0, docs/behaviors/server-pivot.md; owner A to Q-SP1…Q-SP8, 2026-11-07): the plug that
 * lets a server pivot the rows it groups — `serverSideRows(data, { pivot: serverPivot() })`. Kept out of
 * `@dzgrid/core/server-side` and of `@dzgrid/core/pivot`: a server grid without a pivot, and a pivot in the browser, pay
 * nothing for it.
 */
export { serverPivot } from './server-pivot/plug.js';
