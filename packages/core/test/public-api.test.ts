import { describe, it, expect } from 'vitest';
import * as core from '@dzgrid/core';
import * as internal from '@dzgrid/core/internal';

/**
 * The public surface, written out by hand: adding an export is a decision,
 * made here on purpose, never a side effect of an `export *`. What only the
 * grid's own layers and tests need lives in `@dzgrid/core/internal`.
 */
const PUBLIC = [
  'EMPTY_QUERY', 'MAX_INSTANT', 'MAX_PHYSICAL', 'NO_OVERLAY', 'NO_SELECTION', 'PROBLEM_CODES', 'PrefixSums', 'REBASE', 'REJECTED',
  'addDays', 'anchorFor', 'assignKeys', 'booleanCodec', 'booleanCodecWith', 'canNarrow', 'canonicalId', 'civilToEpochDay',
  'clearSelection', 'clientRows', 'collatorFor', 'compareDays', 'compileFilter', 'compilePath', 'compileQuick',
  'createColumnModel', 'createRowStore', 'dataKey', 'dayCodec', 'dayFieldOrder', 'dayToEpochDay', 'daysInMonth', 'detailKey',
  'enumCodec', 'epochDayToCivil', 'epochDayToDay', 'filterIndices', 'fold', 'formattersFor', 'groupKey', 'idOfDataKey',
  'instantCodec', 'instantToDayIn', 'instantToIso', 'isAscii', 'isBlank', 'isKnownZone', 'isLeapYear', 'isSelected',
  'layerPlacement', 'localeCtx', 'makeQuery', 'normalizeDigits', 'numberCodec', 'numberCodecWith', 'offsetAt',
  'overscanRows', 'parseDay', 'parseInstant', 'pinnedKey', 'problem', 'quickWords', 'readDayText', 'readInstant',
  'readMachineNumber', 'readNumber', 'reconcileSelection', 'resolveColumns', 'resolveInstantRange', 'resolveWall',
  'scrollMapper', 'scrollTopFor', 'selectAll', 'selectOnly', 'selectRange', 'selectionCount', 'sortIndices', 'stripMarks',
  'textCodec', 'toggle', 'uniformRowLayout', 'variableRowLayout', 'visibleWindow', 'zoneDayBounds',
];

const INTERNAL = ['ColumnCache', 'THREW', 'canonical', 'clearFormatCaches', 'collatorKey', 'ctxKey', 'flatDisplayed', 'foldSlow', 'formatParts', 'intlTag', 'separatorsFor'];

describe('the public surface', () => {
  it('is exactly the list above', () => {
    expect(Object.keys(core).sort()).toEqual([...PUBLIC].sort());
  });

  it('keeps the internals out of it', () => {
    expect(Object.keys(internal).sort()).toEqual([...INTERNAL].sort());
    for (const name of INTERNAL) expect(name in core, name).toBe(false);
  });
});
