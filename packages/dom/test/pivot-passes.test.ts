// Phase 11 L3 (docs/phase-11-steps/decisions.md « L3 »): a pivot grid made over dataset A took 500 ms at 4× CPU, over the
// §5.4 line (150 × 3). Its crossing pass ran three times at creation, the value columns' keys were read three times: each
// time the DOM set the effective columns, the value columns under « Total » were new definitions (the key cache and the
// pass know a column by its definition, R4). Kept when nothing in them changed: the pass runs twice (the crossings must be
// known before the created columns can be set), the keys are read twice (the application's definitions, then the ones
// under « Total », whose headers differ), and a later change of the pivot columns reads the value columns' keys no more.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { GroupShape } from '@dzgrid/core/grouping';
import type { ClientModel } from '@dzgrid/core';
import { pivot } from '../src/pivot.js';
import { cleanup } from './support-grouping.js';
import { pmake } from './support-pivot.js';

afterEach(cleanup);

const made = () => {
  const p = pivot({ columns: ['month'], values: { amount: 'sum', qty: 'sum', sold: 'max' } });
  const make = vi.spyOn(p, 'make');
  const t = pmake({ feature: p });
  // The shape the grid took: a pivot shape, `passes` its own count (the core's pivot.ts).
  const shape = make.mock.results[0]!.value as GroupShape<unknown> & { readonly passes: number };
  // The grid's rows are a client model here (pmake gives rows): its diagnostics are the client model's.
  const rows = t.g.kernel.rows as ClientModel<unknown>;
  return { t, shape, keys: () => rows.diagnostics.keyBuilds };
};

describe('a pivot grid: the value columns kept between the effective columns set', () => {
  it('made: the crossing pass twice, the value columns’ keys twice each', () => {
    const { shape, keys } = made();
    expect(shape.passes).toBe(2);
    // amount, qty, sold: the application's definitions, then the ones under « Total ».
    expect(keys()).toBe(6);
  });

  it('the pivot columns changed: one pass more, no value column read again', () => {
    const { t, shape, keys } = made();
    const [p0, k0] = [shape.passes, keys()];
    t.papi().setBy(['region']);
    expect(shape.passes).toBe(p0 + 1);
    expect(keys()).toBe(k0);
  });
});
