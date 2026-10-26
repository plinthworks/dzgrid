// Phase 6 step 5 (step05-plan §4.4, grid-state.md 8, 11; plan risk 9): a state comes from the browser's storage or the
// address — user-controlled. 2 000 random garbage values (nested, cyclic, huge, `__proto__` keys, getters that throw, BigInt,
// functions, half-right states): restoreState never throws, never pollutes a prototype, applies nothing on a bad version.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, type ColumnDef } from '@dzgrid/core';
import { captureState, restoreState, stateText } from '@dzgrid/core/state';
import { mulberry32 } from './support/rng.js';

type Row = { id: string };
const DEFS: ColumnDef<Row>[] = [{ id: 'name' }, { id: 'age', type: 'number' }, { id: '__proto__' }, { id: 'constructor' }];

function garbage(r: () => number, depth = 0): unknown {
  const k = Math.floor(r() * 16);
  const deeper = () => (depth > 4 ? null : garbage(r, depth + 1));
  switch (k) {
    case 0: return null;
    case 1: return undefined;
    case 2: return r() < 0.5 ? NaN : r() * 1e9 - 5e8;
    case 3: return ['', 'v', '1', 'محمد', '__proto__', 'constructor', 'name', 'start'][Math.floor(r() * 8)];
    case 4: return r() < 0.5;
    case 5: return Array.from({ length: Math.floor(r() * 4) }, deeper);
    case 6: return JSON.parse(`{"__proto__": {"polluted": ${depth}}, "v": 1, "columns": [{"id": "__proto__", "order": 0, "pinned": null}]}`);
    case 7: {
      const o: Record<string, unknown> = { v: 1 };
      o.self = o;
      return o;
    }
    case 8: return { v: 1, get columns() { throw new Error('getter'); } };
    case 9: return BigInt(7);
    case 10: return () => 1;
    case 11: return { v: 1, columns: Array.from({ length: 2000 }, (_, i) => ({ id: `c${i}`, order: i, pinned: null })) };
    case 12: return { v: [1, 2, 3, 0, -1, 1.5, '1', null][Math.floor(r() * 8)], columns: deeper(), sort: deeper() };
    default: {
      // A state almost right: every part present, each one possibly garbage.
      const part = () => (r() < 0.5 ? deeper() : undefined);
      return {
        v: 1, columns: r() < 0.5 ? [{ id: 'name', width: part(), hidden: part(), pinned: part(), order: part() }, deeper()] : deeper(),
        groups: part(), sort: r() < 0.5 ? [{ column: part(), dir: part(), nulls: part() }, deeper()] : deeper(),
        filter: r() < 0.5 ? { name: deeper(), __proto__: deeper(), constructor: deeper() } : deeper(),
        quick: part(), page: part(), pageSize: part(), density: part(), extra: part(),
      };
    }
  }
}

describe('restoreState never throws (2 000 garbage values)', () => {
  it('no throw, no prototype touched, nothing applied when the version is bad', () => {
    const r = mulberry32(65);
    for (let i = 0; i < 2000; i++) {
      const columns = createColumnModel<Row>(DEFS);
      const k = createKernel<Row>({ rows: clientRows<Row>({ rows: [{ id: 'a' }, { id: 'b' }], getRowId: (x) => x.id, columns, ctx: localeCtx({ locale: 'fr-FR' }), page: { pageSize: 1 } }), columns });
      const before = stateText(captureState(k));
      const g = garbage(r);
      let problems: ReturnType<typeof restoreState> = [];
      expect(() => (problems = restoreState(k, g, { setDensity: () => false, groups: { collapsible: () => true, get: () => ({}), set: () => {} } })), `value ${i}`).not.toThrow();
      expect(() => stateText(captureState(k)), `value ${i}`).not.toThrow();
      if (problems.some((p) => p.code === 'state-version')) expect(stateText(captureState(k)), `value ${i}`).toBe(before);
      // Paths and ids only: never a raw value from the input in a problem (it could be a name).
      for (const p of problems) expect(['state-version', 'state-column', 'state-group', 'state-field']).toContain(p.code);
      expect(({} as Record<string, unknown>).polluted, `value ${i}`).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
      // The grid still shows a column.
      expect(k.columns.visible().length, `value ${i}`).toBeGreaterThan(0);
    }
  });
});
