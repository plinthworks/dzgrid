/** The span engine's modules, gathered for `../spans.ts` (the entry). */
export { buildSpanMap, spanAt } from './map.js';
export type { SpanCell, SpanColumns, SpanInput, SpanLookup, SpanMap } from './map.js';
export { headerBands } from './bands.js';
export type { BandFragment, HeaderBands } from './bands.js';
export { diffState, foldedColumns, groupTable } from './groups.js';
export type { GroupEntry, GroupTable } from './groups.js';
export { land, navigate, ownerFocus } from './nav.js';
export type { NavMove, NavShape, Slot } from './nav.js';
export { rowPlanner } from './plan.js';
export type { RowSpanPlan } from './plan.js';
