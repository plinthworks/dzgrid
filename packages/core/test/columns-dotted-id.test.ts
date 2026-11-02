import { describe, it, expect } from 'vitest';
import { resolveColumns } from '@dzgrid/core';

/**
 * A column id holding « . » (found in an Angular app, 2026-10-30; docs/behaviors/column-values.md):
 * with no `field` and no `value`, the id is read as the row's own property of that exact name first, then as a
 * path (`a.b.c`), so an id built from an ISO instant reads its cell. An explicit `field` is a path only.
 */
const read = (def: Parameters<typeof resolveColumns>[0][number], row: object) => {
  const { columns, problems } = resolveColumns([def]);
  expect(problems).toEqual([]);
  return columns[0]!.read(row);
};

describe('a column id with a dot', () => {
  it('an id built from an instant reads the own property of that exact name', () => {
    const id = 's2026-10-30T10:15:00.000Z';
    expect(read({ id }, { [id]: 42 })).toBe(42);
  });
  it('an id that is a real path still reads the path', () => {
    expect(read({ id: 'address.city' }, { address: { city: 'Oran' } })).toBe('Oran');
  });
  it('both there: the exact name wins (the id as written); neither: undefined', () => {
    expect(read({ id: 'a.b' }, { 'a.b': 1, a: { b: 2 } })).toBe(1);
    expect(read({ id: 'a.b' }, { a: {} })).toBeUndefined();
  });
  it('an inherited property of that name is not read (own properties only)', () => {
    const row = Object.create({ 'a.b': 'inherited' }) as object;
    expect(read({ id: 'a.b' }, row)).toBeUndefined();
  });
  it('an explicit field is a path only, even when the row has its exact name', () => {
    expect(read({ id: 'x', field: 'a.b' }, { 'a.b': 1, a: { b: 2 } })).toBe(2);
    expect(read({ id: 'x', field: 'a.b' }, { 'a.b': 1 })).toBeUndefined();
  });
  it('an id with no dot reads as before; a value function wins', () => {
    expect(read({ id: 'n' }, { n: 3 })).toBe(3);
    expect(read({ id: 'a.b', value: () => 'v' }, { 'a.b': 1 })).toBe('v');
  });
  it('an id that is no valid path (empty or prototype segment) is still refused', () => {
    for (const id of ['a..b', 'x.__proto__']) expect(resolveColumns([{ id }]).problems.map((p) => p.code)).toEqual(['invalid-field-path']);
  });
});
