import { describe, it, expect } from 'vitest';
import { buildSpanMap } from '@dzgrid/core/spans';
import { shape, spanGrid, type Row } from './support/spans.js';

/**
 * 1.17.0 independent review: `fullWidth` answering `{ part }` (docs/behaviors/cell-spans.md, full-width rows). A rule that
 * answers nothing (undefined or null, as plain JavaScript or a `row.x && { part }` gives) for an ordinary row is « not
 * full width », as before 1.17.0 — never « fullWidth threw ». Expectations written by hand.
 */
describe('fullWidth answering nothing, a part or true', () => {
  it('undefined and null are not full width and tell nothing; { part } names it; true has none', () => {
    const answers: Record<string, unknown> = { r0: undefined, r1: { part: 'section' }, r2: null, r3: true, r4: '' };
    const fw = ((row: Row) => answers[row.id]) as never; // plain JavaScript's answers, outside the declared type
    const g = spanGrid([{ id: 'a' }, { id: 'b' }], [['x', 1], ['y', 2], ['z', 3], ['w', 4], ['v', 5]], { fullWidth: fw });
    const m = buildSpanMap(g.input);
    expect(shape(m)).toEqual([]);
    expect([0, 1, 2, 3, 4].map((r) => m.fullWidth(r))).toEqual([false, true, false, true, false]);
    expect([0, 1, 2, 3, 4].map((r) => m.fullPart?.(r))).toEqual([undefined, 'section', undefined, undefined, undefined]);
  });

  it('{ part } with no name or a name not a text: full width, no part', () => {
    const answers: Record<string, unknown> = { r0: {}, r1: { part: 7 } };
    const fw = ((row: Row) => answers[row.id]) as never; // plain JavaScript's answers, outside the declared type
    const m = buildSpanMap(spanGrid([{ id: 'a' }], [['x'], ['y']], { fullWidth: fw }).input);
    expect([m.fullWidth(0), m.fullWidth(1), m.fullPart?.(0), m.fullPart?.(1)]).toEqual([true, true, undefined, undefined]);
  });
});
