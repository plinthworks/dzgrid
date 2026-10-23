import { describe, it, expect } from 'vitest';
import * as core from '@dzgrid/core';
import * as internal from '@dzgrid/core/internal';
import * as server from '@dzgrid/core/server';
import * as spans from '@dzgrid/core/spans';
import * as csv from '@dzgrid/core/csv';
import * as rules from '@dzgrid/core/rules';
import * as tree from '@dzgrid/core/tree';
import * as detail from '@dzgrid/core/detail';
import * as edit from '@dzgrid/core/edit';

/**
 * The public surface, written out by hand: adding an export is a decision,
 * made here on purpose, never a side effect of an `export *`. What only the
 * grid's own layers and tests need lives in `@dzgrid/core/internal`.
 */
const PUBLIC = [
  'editableAt',
  'DEFAULT_PAGE_SIZE', 'DEFAULT_PAGE_SIZES', 'EMPTY_QUERY', 'INTENT_OWNERS', 'MAX_INSTANT', 'MAX_PHYSICAL', 'NO_OVERLAY', 'NO_SELECTION', 'PROBLEM_CODES', 'PrefixSums', 'REBASE', 'REJECTED', 'RELATIVE_RANGES',
  'addDays', 'anchorFor', 'assignKeys', 'booleanCodec', 'booleanCodecWith', 'canonicalId', 'civilToEpochDay',
  'clearSelection', 'clientRows', 'createKernel', 'collatorFor', 'compareDays', 'compilePath', 'createColumnModel', 'dataKey', 'dayAt', 'dayCodec', 'dayFieldOrder', 'dayToEpochDay', 'daysInMonth', 'detailKey',
  'enumCodec', 'epochDayToCivil', 'filterKindOf', 'epochDayToDay', 'fold', 'formattersFor', 'groupKey', 'headerSelection', 'liveChangeProblems', 'messageProblems', 'idOfDataKey',
  'instantCodec', 'instantToDayIn', 'intentFor', 'instantToIso', 'isAscii', 'isBlank', 'isKnownZone', 'isLeapYear', 'isSelected',
  'layerPlacement', 'localeCtx', 'makeQuery', 'nextSort', 'normalizeDigits', 'numberCodec', 'numberCodecWith', 'offsetAt',
  'overscanRows', 'parseDay', 'partNameFor', 'parseInstant', 'pinnedKey', 'problem', 'quickWords', 'readDayText', 'readInstant',
  'readMachineNumber', 'readNumber', 'reconcileFocus', 'relativeDays', 'reconcileSelection', 'resolveColumns', 'resolveOperations', 'resolveInstantRange', 'resolveWall',
  'scrollMapper', 'scrollTopFor', 'selectAll', 'selectOnly', 'selectRange', 'selectionCount', 'splitQuery', 'stripMarks',
  'textCodec', 'toggle', 'uniformRowLayout', 'VALUES_MAX', 'variableRowLayout', 'visibleWindow', 'windowAt', 'zoneDayBounds',
];

const INTERNAL = [
  'ColumnCache', 'Haystack', 'THREW', 'canNarrow', 'canonical', 'clearFormatCaches', 'collatorKey', 'compileFilter', 'compileQuick', 'createRowStore',
  'checkPage', 'ctxKey', 'emit', 'filterIndices', 'filterKindLookup', 'flatDisplayed', 'foldSlow', 'formatParts', 'hasRelative', 'intlTag', 'isDataKey', 'lockColumns', 'missingFeatureProblems', 'onCommand', 'pageOf', 'resizeIndex', 'resolvePageOptions', 'sameFocus', 'samePage', 'separatorsFor', 'setFocusOwner', 'setSelectionGate', 'shownAncestor', 'sortIndices', 'storeOf',
];

/** `@dzgrid/core/server`: what a grid fed by a server needs, never in the base. */
const SERVER = ['createGate', 'sourceRows', 'toWire'];

/** `@dzgrid/core/spans` (step 9b): cell spans, never in the base. */
const SPANS = ['buildSpanMap', 'headerBands', 'land', 'navigate', 'ownerFocus', 'rowPlanner', 'spanAt'];

/** `@dzgrid/core/csv` (step 10): the CSV writer, never in the base. */
const CSV = ['csvChunks', 'csvColumns', 'csvRows', 'csvSeparatorFor', 'toCsv'];

/** `@dzgrid/core/rules` (step 21): the selection rules' vetting, never in the base. */
const RULES = ['refusalProblems', 'ruleGate', 'vetSelection'];

/** `@dzgrid/core/tree` (Phase 4 step 3): the tree view, never in the base; `treeColumnProblems` (step 4). */
const TREE = ['treeColumnProblems', 'treeConflicts', 'treeShape'];

/** `@dzgrid/core/detail` (Phase 4 step 8): master/detail rows and their sparse layout, never in the base. */
const DETAIL = ['detailConflicts', 'detailShape', 'sparseRowLayout'];

/** `@dzgrid/core/edit` (Phase 5 step 3): the edit controller and its pure checks, never in the base. */
const EDIT = ['checkValue', 'createEdits', 'parseInput'];

describe('the public surface', () => {
  it('keeps the edit entry apart (Phase 5 step 3)', () => {
    expect(Object.keys(edit).sort()).toEqual([...EDIT].sort());
    for (const name of EDIT) expect(name in core || name in internal || name in server || name in spans || name in csv || name in rules || name in tree || name in detail, name).toBe(false);
  });

  it('keeps the detail entry apart (Phase 4 step 8)', () => {
    expect(Object.keys(detail).sort()).toEqual([...DETAIL].sort());
    for (const name of DETAIL) expect(name in core || name in internal || name in server || name in spans || name in csv || name in rules || name in tree, name).toBe(false);
  });

  it('keeps the tree entry apart (Phase 4 step 3)', () => {
    expect(Object.keys(tree).sort()).toEqual([...TREE].sort());
    for (const name of TREE) expect(name in core || name in internal || name in server || name in spans || name in csv || name in rules, name).toBe(false);
  });

  it('keeps the rules entry apart (step 21)', () => {
    expect(Object.keys(rules).sort()).toEqual([...RULES].sort());
    for (const name of RULES) expect(name in core || name in internal || name in server || name in spans || name in csv, name).toBe(false);
  });

  it('keeps the csv entry apart', () => {
    expect(Object.keys(csv).sort()).toEqual([...CSV].sort());
    for (const name of CSV) expect(name in core || name in internal || name in server || name in spans, name).toBe(false);
  });

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
