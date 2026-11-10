/**
 * `@dzgrid/dom/wrapped-headers`: column titles on several lines (docs/behaviors/header-wrap.md, 1.10.0), for the columns
 * marked `headerWrap: true`; the column headers' row grows to the tallest. Its own entry, so a grid without them carries
 * none of it; its few layout rules injected by the feature (`WRAPPED_HEADERS_CSS` for a host that loads them itself).
 */
export { wrappedHeaders, WRAPPED_HEADERS_CSS } from './wrapped-headers/index.js';
export type { WrappedHeadersOptions } from './wrapped-headers/index.js';
