/**
 * `@dzgrid/core/spans`: cells spanning rows and columns (docs/behaviors/spans.md),
 * kept out of the base so a grid without span rules carries none of it.
 */
export { buildSpanMap, spanAt, headerBands, land, navigate, ownerFocus } from './spans/index.js';
export type { BandFragment, HeaderBands, NavMove, NavShape, Slot, SpanCell, SpanColumns, SpanInput, SpanLookup, SpanMap } from './spans/index.js';
