import { describe, it, expect } from 'vitest';
import { dataKey, groupKey, detailKey, pinnedKey, assignKeys } from '@dzgrid/core';

/** mulberry32: a seeded generator, so a failing case can be replayed. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('row keys', () => {
  it('cannot be made to collide across families', () => {
    // A host id shaped like another family's key stays a data key.
    const keys = [dataKey('g:1:a'), dataKey('x:d:1:a'), dataKey('p:t:0'), groupKey(['a']), detailKey(dataKey('a')!), pinnedKey('top', 0)];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps group paths apart however their values are cut', () => {
    expect(groupKey(['a', 'bc'])).not.toBe(groupKey(['ab', 'c']));
    expect(groupKey(['1:a'])).not.toBe(groupKey(['1', 'a']));
  });

  it('gives distinct ids distinct keys, whatever characters they hold', () => {
    const next = rng(42);
    const alphabet = ['a', ':', '1', 'd', 'g', '|', ' ', 'ي', '\u0000'];
    const ids = new Set<string>();
    while (ids.size < 2000) {
      const len = 1 + Math.floor(next() * 6);
      ids.add(Array.from({ length: len }, () => alphabet[Math.floor(next() * alphabet.length)]).join(''));
    }
    const keys = new Set([...ids].map((id) => dataKey(id)));
    expect(keys.size).toBe(ids.size);
  });

  it('treats a number and its string as one id', () => {
    expect(dataKey(1)).toBe(dataKey('1'));
    expect(dataKey(-0)).toBe(dataKey(0));
  });
});

describe('assignKeys', () => {
  it('refuses an id that identifies nothing, and says where', () => {
    const { keys, problems } = assignKeys(['a', '', NaN, null, {}, 'b']);
    expect(keys.map((k) => k !== null)).toEqual([true, false, false, false, false, true]);
    expect(problems.map((p) => [p.code, p.path])).toEqual([
      ['invalid-row-id', 'rows[1]'],
      ['invalid-row-id', 'rows[2]'],
      ['invalid-row-id', 'rows[3]'],
      ['invalid-row-id', 'rows[4]'],
    ]);
  });

  it('keeps the first of two rows with one id and refuses the second', () => {
    const { keys, problems } = assignKeys(['a', 1, 'a', '1']);
    expect(keys).toEqual([dataKey('a'), dataKey(1), null, null]);
    expect(problems.map((p) => [p.code, p.path])).toEqual([
      ['duplicate-row-id', 'rows[2]'],
      ['duplicate-row-id', 'rows[3]'],
    ]);
  });

  it('never copies an id into a problem', () => {
    // Ids can be patient numbers; problems travel to consoles and logs.
    const { problems } = assignKeys(['secret-123', 'secret-123', '']);
    expect(JSON.stringify(problems)).not.toContain('secret');
  });
});
