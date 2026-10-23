/**
 * Pieces the grid's own layers and tests need, which hosts should not build
 * on: their shape may change in any release. `@dzgrid/core/internal`.
 */
export { ColumnCache, THREW } from './model/column-cache.js';
export { flatDisplayed } from './row/displayed.js';
export { ctxKey, intlTag } from './value/locale.js';
export { separatorsFor } from './value/number.js';
export { clearFormatCaches, formatParts } from './i18n/format.js';
export { collatorKey } from './i18n/collate.js';
export { foldSlow } from './i18n/fold.js';
export { canonical } from './model/query.js';
export type { ColumnEnv } from './model/column-cache.js';
export type { SourceIndex } from './ids.js';
export { isDataKey } from './ids.js';
export type { RowSnapshot, StoreDelta, RowStore } from './row/store.js';
export { createRowStore } from './row/store.js';
export { sortIndices } from './sort/compile.js';
export type { RowTest, CompiledFilter } from './filter/compile.js';
export { compileFilter, filterIndices } from './filter/compile.js';
export { filterKindLookup } from './filter/kind.js';
export { compileQuick, canNarrow } from './filter/quick.js';
export { storeOf } from './model/client.js';
export { Haystack } from './model/haystack.js';
export type { HayKind } from './model/column-cache.js';
export { emit, lockColumns, onCommand, setFocusOwner, setSelectionGate } from './kernel.js';
export { sameFocus, shownAncestor } from './focus.js';
export { checkPage, pageOf, resizeIndex, resolvePageOptions, samePage } from './model/page.js';
export type { PageConfig } from './model/page.js';
export { missingFeatureProblems } from './columns/span-rules.js';
export { hasRelative } from './value/relative.js';
