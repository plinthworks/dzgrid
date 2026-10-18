/** The span engine's modules, gathered for `../spans.ts` (the entry). */
export { buildSpanMap, spanAt } from './map.js';
export type { SpanCell, SpanColumns, SpanInput, SpanLookup, SpanMap } from './map.js';
export { headerBands } from './bands.js';
export type { BandFragment, HeaderBands } from './bands.js';
export { land, navigate, ownerFocus } from './nav.js';
export type { NavMove, NavShape, Slot } from './nav.js';
