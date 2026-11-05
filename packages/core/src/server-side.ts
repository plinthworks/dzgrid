/**
 * `@dzgrid/core/server-side` (Phase 8 steps 6–7, server-side-groups.md): a server's list grouped on the server, each
 * open group loaded in blocks, the totals the server's. Kept out of the base, of `@dzgrid/core/server` and of
 * `@dzgrid/core/infinite` (it shares the block store with the latter).
 */
export { serverSideRows } from './server/server-side.js';
export type { ServerSideDiagnostics, ServerSideModel, ServerSideOptions, ServerSideRows } from './server/server-side.js';
export type { GroupPart, GroupResponse, GroupValue } from './server/source.js';
