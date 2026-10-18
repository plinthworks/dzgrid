import type { AnyFilterKind } from '@dzgrid/core';

const obj = (s: unknown): s is Record<string, unknown> => s !== null && typeof s === 'object' && !Array.isArray(s);
const bound = (v: unknown): boolean => v === null || typeof v === 'number';

/**
 * Custom filter kinds a case may name in `kinds`: a fixture table, the same
 * for every implementation. The wire, filter, problems and source suites read it.
 */
export const KINDS: Record<string, AnyFilterKind> = {
  // A range on a number column, both ends in, either order; one end missing: inactive. No wire function: the state travels as it is.
  between: {
    name: 'between',
    types: ['number'],
    read: (s) => (obj(s) && bound(s.lo) && bound(s.hi) ? s : 'invalid'),
    active: (s) => s.lo !== null && s.hi !== null,
    test: (s) => {
      const lo = Math.min(s.lo, s.hi);
      const hi = Math.max(s.lo, s.hi);
      return (v) => typeof v === 'number' && v >= lo && v <= hi;
    },
  },
  // No browser rule: runs on a server only. A null state is half-typed.
  'server-only': { name: 'server-only', read: (s) => s, active: (s) => s !== null },
  // The rule throws on the value 3, keeps every other row.
  'throws-test': {
    name: 'throws-test',
    read: (s) => s,
    active: () => true,
    test: () => (v) => {
      if (v === 3) throw new Error('the rule failed');
      return true;
    },
  },
  throws: {
    name: 'throws',
    read: (s) => s,
    active: () => true,
    wire: () => {
      throw new Error('the kind failed');
    },
  },
  'bad-json': { name: 'bad-json', read: (s) => s, active: () => true, wire: () => Number.NaN },
};

/** The lookup a case's `kinds` names allow: a kind not named is unknown. */
export const kindsOf = (names: readonly string[] | undefined): ((name: string) => AnyFilterKind | undefined) | undefined => {
  if (!names) return undefined;
  const named = new Set(names);
  return (name) => (named.has(name) ? KINDS[name] : undefined);
};
