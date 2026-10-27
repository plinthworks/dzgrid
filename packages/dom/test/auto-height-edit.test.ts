// Automatic row height while editing (Phase 6 step 9 §5, auto-height.md 7): a row with an open editor keeps its
// height (its field is not its text); a saved value measures it again, a cancelled edit nothing; undo again.
// Written before the code.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { autoHeight } from '../src/auto-height.js';
import { ed, cleanup, k, type R } from './support-editors.js';
import { measureStub } from './support-auto-height.js';

afterEach(cleanup);

const COLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 200, editable: true, wrap: true },
  { id: 'n', header: 'Stock', type: 'number', width: 80, editable: true },
];
const LONG = 'word '.repeat(30).trim();

function make() {
  const m = measureStub();
  const t = ed({ columns: COLS, features: (e, x) => [e, x, autoHeight()] });
  const height = (id: string) => t.ctx.layout!.heightOf(t.g.kernel.rows.displayed.indexOf(k(id)) as never);
  return { ...t, m, height };
}

describe('auto height and the editors', () => {
  it('an open editor: its row is not measured; saved longer, the row grows; the row at the top stays', () => {
    const t = make();
    expect(t.height('r1')).toBe(32);
    t.at('r1', 'name');
    t.key('F2');
    t.type(LONG);
    const n = t.m.reads.length;
    t.g.api.refresh();
    // Nothing measured while the field is open, the row keeps its height.
    expect(t.m.reads.length).toBe(n);
    expect(t.height('r1')).toBe(32);
    t.key('Enter');
    expect(t.value('r1', 'name')).toBe(LONG);
    // 149 characters × 8 / 184 = 7 lines: 149.4 → 150.
    expect(t.height('r1')).toBe(150);
    expect(t.ctx.scroll.logicalTop).toBe(0);
  });

  it('a cancelled edit measures nothing; undo measures again and the row shrinks back', () => {
    const t = make();
    t.at('r1', 'name');
    t.key('F2');
    t.type(LONG);
    let n = t.m.reads.length;
    t.key('Escape');
    expect(t.m.reads.length).toBe(n);
    expect(t.height('r1')).toBe(32);
    t.at('r1', 'name');
    t.key('F2');
    t.type(LONG);
    t.key('Enter');
    expect(t.height('r1')).toBe(150);
    n = t.m.reads.length;
    t.api.undo();
    expect(t.m.reads.length).toBeGreaterThan(n);
    expect(t.height('r1')).toBe(32);
  });
});
