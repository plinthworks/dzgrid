import { describe, it, expectTypeOf } from 'vitest';
import type { DisplayIndex, RowKey, Day, InstantMs, DisplayedRows } from '@dzgrid/core';

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
