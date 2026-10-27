import { describe, it, expect } from 'vitest';
import { canonicalId, dataKey, idOfDataKey, groupKey, detailKey, pinnedKey, PROBLEM_CODES, type RowKey } from '@dzgrid/core';

describe('canonicalId', () => {
  it('writes numbers as text, one zero, and refuses what identifies nothing', () => {
    expect(canonicalId(1)).toBe('1');
    expect(canonicalId(-0)).toBe('0');
    expect(canonicalId(1.5)).toBe('1.5');
    expect(canonicalId('a')).toBe('a');
    for (const v of ['', NaN, Infinity, null, undefined, {}, [], true, 10n]) expect(canonicalId(v), String(v)).toBeNull();
  });
});

describe('idOfDataKey', () => {
  it('reads back the id a data key was made from', () => {
    for (const id of ['a', 'a:b', 'd:1:x', 'ي', '0', 'x'.repeat(1000)]) expect(idOfDataKey(dataKey(id)!)).toBe(id);
    expect(idOfDataKey(dataKey(42)!)).toBe('42');
  });

  it('gives null for every other family and for malformed keys', () => {
    expect(idOfDataKey(groupKey(['a']))).toBeNull();
    expect(idOfDataKey(detailKey(dataKey('a')!))).toBeNull();
    expect(idOfDataKey(pinnedKey('top', 0)!)).toBeNull();
    for (const k of ['d:5:ab', 'd:2:a', 'd::a', 'd:01:a', 'd:a', 'd:0:', '']) expect(idOfDataKey(k as RowKey), k).toBeNull();
  });
});

describe('problem codes', () => {
  it('are listed once each', () => {
    expect(new Set(PROBLEM_CODES).size).toBe(PROBLEM_CODES.length);
  });
});
