// `sameValues` (@dzgrid/core/compare, step 16e; row-identity-transactions.md « Rows compared by value »).
import { describe, it, expect } from 'vitest';
import { sameValues } from '@dzgrid/core/compare';

describe('sameValues', () => {
  it('plain data deeply: objects by own keys, arrays by items', () => {
    expect(sameValues({ a: 1, b: { c: [1, 2, { d: 'x' }] } }, { b: { c: [1, 2, { d: 'x' }] }, a: 1 })).toBe(true);
    expect(sameValues({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameValues([1, 2], [1, 2, 3])).toBe(false);
    expect(sameValues([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(sameValues({ a: [1] }, { a: [2] })).toBe(false);
  });

  it('numbers with Object.is: NaN equals NaN, 0 and -0 differ', () => {
    expect(sameValues(NaN, NaN)).toBe(true);
    expect(sameValues({ v: NaN }, { v: NaN })).toBe(true);
    expect(sameValues(0, -0)).toBe(false);
  });

  it('anything else by identity: a Date, a Map, a class instance, a function', () => {
    expect(sameValues(new Date(0), new Date(0))).toBe(false);
    const d = new Date(0);
    expect(sameValues({ d }, { d })).toBe(true);
    expect(sameValues(new Map(), new Map())).toBe(false);
    class P { x = 1; }
    expect(sameValues(new P(), new P())).toBe(false);
    expect(sameValues(() => 1, () => 1)).toBe(false);
  });

  it('null, undefined and strings', () => {
    expect(sameValues(null, null)).toBe(true);
    expect(sameValues(null, undefined)).toBe(false);
    expect(sameValues({ a: null }, { a: undefined })).toBe(false);
    expect(sameValues('é', 'é')).toBe(true);
    expect(sameValues({}, null)).toBe(false);
  });
});
