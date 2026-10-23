// A tiny seeded generator for the showcase demos (docs/phase-5-steps/demos-plan.md §1): the same rows on
// every machine and every load. mulberry32 on an integer seed; no Math.random, no clock.

export interface Seeded {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max]. */
  int(min: number, max: number): number;
  /** One item of a list. */
  pick<X>(list: readonly X[]): X;
  /** A calendar day `YYYY-MM-DD` from `from` (a year) to `to` (a year), inclusive; days 1–28 only. */
  day(from: number, to: number): string;
}

export function seeded(seed: number): Seeded {
  let s = seed | 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const two = (n: number): string => String(n).padStart(2, '0');
  return {
    next,
    int,
    pick: (list) => list[int(0, list.length - 1)]!,
    day: (from, to) => `${int(from, to)}-${two(int(1, 12))}-${two(int(1, 28))}`,
  };
}
