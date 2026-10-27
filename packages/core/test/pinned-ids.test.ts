// Phase 6 step 8b-1 (docs/phase-6-steps/step08b-plan.md §0, §2.1, §5; pinned-rows.md 1): a pinned row's key is built from
// its id (the same id across `set()` keeps the open field, pinned-rows.md 16), length-prefixed like a data key, in its own
// family per side, so it never clashes with a body row of the same id. `isCellKey`: what a cell can be focused and edited on.
import { describe, it, expect } from 'vitest';
import { assignKeys, dataKey, detailKey, groupKey, idOfDataKey, pinnedKey } from '@dzgrid/core';
import { isCellKey, isDataKey } from '@dzgrid/core/internal';

describe('pinnedKey', () => {
  it('is built from the id, its length first, one family per side', () => {
    expect(pinnedKey('top', 'a')).toBe('p:t:1:a');
    expect(pinnedKey('bottom', 'total')).toBe('p:b:5:total');
    expect(pinnedKey('top', 'a:b')).toBe('p:t:3:a:b');
  });

  it('reads ids as the grid does: 1 and "1" the same row, -0 is 0', () => {
    expect(pinnedKey('bottom', 1)).toBe('p:b:1:1');
    expect(pinnedKey('bottom', '1')).toBe(pinnedKey('bottom', 1));
    expect(pinnedKey('top', -0)).toBe('p:t:1:0');
  });

  it('is null for an id that identifies nothing', () => {
    for (const bad of ['', Number.NaN, Infinity, null, undefined, {}]) expect(pinnedKey('top', bad as never), String(bad)).toBeNull();
  });

  it('never equals a body row of the same id, nor the other side', () => {
    expect(pinnedKey('top', 'a')).not.toBe(dataKey('a'));
    expect(pinnedKey('top', 'a')).not.toBe(pinnedKey('bottom', 'a'));
    expect(idOfDataKey(pinnedKey('top', 'a')!)).toBeNull();
    // A data id that looks like a pinned key stays a data key.
    expect(dataKey('p:t:1:a')).toBe('d:7:p:t:1:a');
  });
});

describe('isCellKey', () => {
  it('a data row or a pinned row; never a group, a detail or a loading row', () => {
    expect(isCellKey(dataKey('a')!)).toBe(true);
    expect(isCellKey(pinnedKey('top', 'a')!)).toBe(true);
    expect(isCellKey(pinnedKey('bottom', 'a')!)).toBe(true);
    expect(isCellKey(groupKey(['a']))).toBe(false);
    expect(isCellKey(detailKey(dataKey('a')!))).toBe(false);
    expect(isCellKey(`l:${dataKey('a')}` as never)).toBe(false);
  });

  it('a pinned key is not a data key (selection never takes it)', () => {
    expect(isDataKey(pinnedKey('top', 'a')!)).toBe(false);
  });
});

describe('assignKeys with a key maker (a pinned side)', () => {
  it('keys each id with the maker given; a duplicate or an unusable id is refused, at the path given', () => {
    const { keys, problems } = assignKeys(['t', 1, 't', '', '1'], 'pinnedRows.bottom', (id) => pinnedKey('bottom', id));
    expect(keys).toEqual(['p:b:1:t', 'p:b:1:1', null, null, null]);
    expect(problems).toEqual([
      { code: 'duplicate-row-id', severity: 'error', path: 'pinnedRows.bottom[2]' },
      { code: 'invalid-row-id', severity: 'error', path: 'pinnedRows.bottom[3]', detail: 'empty string' },
      { code: 'duplicate-row-id', severity: 'error', path: 'pinnedRows.bottom[4]' },
    ]);
  });

  it('without a maker: data keys, as before', () => {
    expect(assignKeys(['a']).keys).toEqual([dataKey('a')]);
  });
});
