/**
 * `@dzgrid/core/server`: what a grid fed by a server needs, kept out of the
 * base so a grid on rows in memory carries none of it.
 */
export { createGate } from './server/gate.js';
export type { DropReason, GateDiagnostics, RequestGate, Ticket } from './server/gate.js';
export { sourceRows } from './server/rows.js';
export type { DataRequest, DataResponse, DataSource, Json, PageWindow, SourceModel, SourceRows, SourceRowsOptions, ValuesRequest, ValuesResponse } from './server/source.js';
export { toWire } from './server/wire.js';
export type { WireEnv, WireFilter, WireFilterModel, WireInstant, WireKind } from './server/wire.js';
export type { AbortHandle, AbortSignalLike } from './abort.js';
