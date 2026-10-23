import { describe, it, expectTypeOf } from 'vitest';
import type { DisplayIndex, RowKey, Day, InstantMs, DisplayedRows, ColumnDef, EditableRule, FilterKind, LocaleCtx, Json } from '@dzgrid/core';

/**
 * Invariants held by the type system. Each `@ts-expect-error` line must stay
 * an error: if a change makes it compile, `npm run typecheck` fails.
 */
describe('branded types', () => {
  it('never take a plain number for a display position', () => {
    expectTypeOf<number>().not.toMatchTypeOf<DisplayIndex>();
    // @ts-expect-error — a number is not a DisplayIndex
    const i: DisplayIndex = 3;
    void i;
  });

  it('never take a plain string for a row key or a day', () => {
    expectTypeOf<string>().not.toMatchTypeOf<RowKey>();
    expectTypeOf<string>().not.toMatchTypeOf<Day>();
    // @ts-expect-error — a string is not a RowKey
    const k: RowKey = 'd:1:a';
    // @ts-expect-error — a string is not a Day
    const d: Day = '2026-03-05';
    void k;
    void d;
  });

  it('keep days and instants apart', () => {
    expectTypeOf<Day>().not.toMatchTypeOf<InstantMs>();
    expectTypeOf<InstantMs>().not.toMatchTypeOf<Day>();
    // @ts-expect-error — a number is not an instant without parsing
    const t: InstantMs = 0;
    void t;
  });

  it('never let a number address a displayed row', () => {
    const shown = null as unknown as DisplayedRows<unknown>;
    // @ts-expect-error — nodeAt takes a DisplayIndex, which only index() makes
    const f = () => shown.nodeAt(3);
    void f;
  });
});

describe('the edit seams (Phase 5 step 2)', () => {
  type Row = { id: string; stock: number };
  it('an editable rule reads the row and the context; validate the value, the row and the context', () => {
    expectTypeOf<EditableRule<Row>>().toEqualTypeOf<boolean | ((row: Readonly<Row>, context: unknown) => boolean)>();
    const col: ColumnDef<Row, number> = {
      id: 'stock',
      editable: (row, context) => row.stock >= 0 && context !== null,
      validate: (value, row, context) => (value !== null && value < 0 && row.id && context ? 'min' : null),
    };
    void col;
    // @ts-expect-error — a rule returns a boolean
    const bad: ColumnDef<Row, number> = { id: 'stock', editable: () => 'yes' };
    void bad;
  });

  it('a kind whose test or wire takes two or three parameters is still a kind; the context comes last', () => {
    const old: FilterKind<Json, number> = { name: 'old', read: (s) => s as Json, active: () => true, test: (_s, _ctx: LocaleCtx) => (v) => v === 1 };
    const withContext: FilterKind<Json, number> = {
      name: 'ctx', read: (s) => s as Json, active: () => true,
      test: (_s, _ctx, context) => (v) => v === (context as number),
      wire: (s, _ctx, _zone, context) => ({ s, c: context as Json }),
    };
    void old;
    void withContext;
    expectTypeOf<Parameters<NonNullable<FilterKind['test']>>[2]>().toEqualTypeOf<unknown>();
    expectTypeOf<Parameters<NonNullable<FilterKind['wire']>>[3]>().toEqualTypeOf<unknown>();
  });
});
