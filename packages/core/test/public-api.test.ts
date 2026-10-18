import { describe, it, expect } from 'vitest';
import * as core from '@dzgrid/core';
import * as internal from '@dzgrid/core/internal';
import * as server from '@dzgrid/core/server';
import * as spans from '@dzgrid/core/spans';

/**
 * The public surface, written out by hand: adding an export is a decision,
 * made here on purpose, never a side effect of an `export *`. What only the
 * grid's own layers and tests need lives in `@dzgrid/core/internal`.
 */
const PUBLIC = [
  'DEFAULT_PAGE_SIZE', 'DEFAULT_PAGE_SIZES', 'EMPTY_QUERY', 'INTENT_OWNERS', 'MAX_INSTANT', 'MAX_PHYSICAL', 'NO_OVERLAY', 'NO_SELECTION', 'PROBLEM_CODES', 'PrefixSums', 'REBASE', 'REJECTED',
  'addDays', 'anchorFor', 'assignKeys', 'booleanCodec', 'booleanCodecWith', 'canonicalId', 'civilToEpochDay',
  'clearSelection', 'clientRows', 'createKernel', 'collatorFor', 'compareDays', 'compilePath', 'createColumnModel', 'dataKey', 'dayCodec', 'dayFieldOrder', 'dayToEpochDay', 'daysInMonth', 'detailKey',
  'enumCodec', 'epochDayToCivil', 'filterKindOf', 'epochDayToDay', 'fold', 'formattersFor', 'groupKey', 'headerSelection', 'liveChangeProblems', 'messageProblems', 'idOfDataKey',
  'instantCodec', 'instantToDayIn', 'intentFor', 'instantToIso', 'isAscii', 'isBlank', 'isKnownZone', 'isLeapYear', 'isSelected',
  'layerPlacement', 'localeCtx', 'makeQuery', 'nextSort', 'normalizeDigits', 'numberCodec', 'numberCodecWith', 'offsetAt',
  'overscanRows', 'parseDay', 'partNameFor', 'parseInstant', 'pinnedKey', 'problem', 'quickWords', 'readDayText', 'readInstant',
  'readMachineNumber', 'readNumber', 'reconcileFocus', 'reconcileSelection', 'resolveColumns', 'resolveOperations', 'resolveInstantRange', 'resolveWall',
  'scrollMapper', 'scrollTopFor', 'selectAll', 'selectOnly', 'selectRange', 'selectionCount', 'splitQuery', 'stripMarks',
  'textCodec', 'toggle', 'uniformRowLayout', 'VALUES_MAX', 'variableRowLayout', 'visibleWindow', 'windowAt', 'zoneDayBounds',
];

const INTERNAL = [
  'ColumnCache', 'Haystack', 'THREW', 'canNarrow', 'canonical', 'clearFormatCaches', 'collatorKey', 'compileFilter', 'compileQuick', 'createRowStore',
  'checkPage', 'ctxKey', 'emit', 'filterIndices', 'filterKindLookup', 'flatDisplayed', 'foldSlow', 'formatParts', 'intlTag', 'missingFeatureProblems', 'pageOf', 'resizeIndex', 'resolvePageOptions', 'sameFocus', 'samePage', 'separatorsFor', 'setFocusOwner', 'sortIndices', 'storeOf',
];

/** `@dzgrid/core/server`: what a grid fed by a server needs, never in the base. */
const SERVER = ['createGate', 'sourceRows', 'toWire'];

/** `@dzgrid/core/spans` (step 9b): cell spans, never in the base. */
const SPANS = ['buildSpanMap', 'headerBands', 'land', 'navigate', 'ownerFocus', 'spanAt'];

describe('the public surface', () => {
  it('keeps the server entry apart', () => {
    expect(Object.keys(server).sort()).toEqual([...SERVER].sort());
    for (const name of SERVER) expect(name in core, name).toBe(false);
  });

  it('keeps the spans entry apart', () => {
    expect(Object.keys(spans).sort()).toEqual([...SPANS].sort());
    for (const name of SPANS) expect(name in core || name in internal, name).toBe(false);
  });

  it('is exactly the list above', () => {
    expect(Object.keys(core).sort()).toEqual([...PUBLIC].sort());
  });

  it('keeps the internals out of it', () => {
    expect(Object.keys(internal).sort()).toEqual([...INTERNAL].sort());
    for (const name of INTERNAL) expect(name in core, name).toBe(false);
  });
});
