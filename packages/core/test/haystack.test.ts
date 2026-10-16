import { describe, it, expect } from 'vitest';
import { Haystack } from '@dzgrid/core/internal';

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('Haystack', () => {
  it('agrees with plain per-cell tests on random cells, patched or not', () => {
    const next = rng(3);
    const letters = 'abcé ';
    const cells = Array.from({ length: 2000 }, () => (next() < 0.1 ? null : Array.from({ length: Math.floor(next() * 6) }, () => letters[Math.floor(next() * letters.length)]).join('')));
    const h = new Haystack(cells);
    for (let k = 0; k < 50; k++) {
      const i = Math.floor(next() * cells.length);
      const v = next() < 0.2 ? null : `p${Math.floor(next() * 3)}`;
      h.patch(i, v);
      cells[i] = v;
    }
    for (const w of ['a', 'ab', 'é', ' ', 'p1', 'zz', 'abc']) {
      const mask = h.containsMask(w);
      cells.forEach((c, i) => {
        expect(mask[i] === 1, `${w} in ${c}`).toBe(c !== null && c.includes(w));
        expect(h.equalsAt(i, w)).toBe(c === w);
        expect(h.startsAt(i, w)).toBe(c !== null && c.startsWith(w));
        expect(h.endsAt(i, w)).toBe(c !== null && c.endsWith(w));
        expect(h.isBlank(i)).toBe(c === null);
        expect(h.cell(i)).toBe(c);
      });
    }
  });

  it('never matches across two cells', () => {
    const h = new Haystack(['ab', 'cd']);
    expect([...h.containsMask('bc')]).toEqual([0, 0]);
  });

  it('marks every non-blank cell for the empty word', () => {
    expect([...new Haystack(['', null, 'x']).containsMask('')]).toEqual([1, 0, 1]);
  });
});
