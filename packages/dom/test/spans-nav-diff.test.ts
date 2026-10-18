// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { dataKey, type Intent, type RowKey } from '@dzgrid/core';
import { buildSpanMap, navigate } from '@dzgrid/core/spans';
import { moveFocus, type Goal, type MoveShape, type SpanLookup } from '../src/keys/move.js';

/**
 * The span engine's moves (`@dzgrid/core/spans` navigate) against the grid's
 * own (`moveFocus`), without spans: from any body cell, every move, edge and
 * page key must land on the same cell with the same goal, so that commit 3
 * can hand body moves to the engine without changing a grid that has no span.
 */

const k = (i: number): RowKey => dataKey(`r${i}`)!;
function rowsOf(n: number): MoveShape['rows'] {
  return {
    count: n,
    index: (i: number) => (Number.isInteger(i) && i >= 0 && i < n ? (i as never) : null),
    keyAt: (i) => k(i as unknown as number),
    indexOf: (key) => {
      for (let i = 0; i < n; i++) if (k(i) === key) return i as never;
      return -1 as never;
    },
  };
}

const INTENTS: Intent[] = [
  { kind: 'move', axis: 'row', delta: 1 }, { kind: 'move', axis: 'row', delta: -1 },
  { kind: 'move', axis: 'col', delta: 1 }, { kind: 'move', axis: 'col', delta: -1 },
  ...(['row', 'col', 'both'] as const).flatMap((axis) => (['first', 'last'] as const).map((to) => ({ kind: 'edge', axis, to }) as Intent)),
  { kind: 'page', delta: 1 }, { kind: 'page', delta: -1 },
];

describe('navigate without a map moves as moveFocus does', () => {
  for (const [nRows, nCols, page] of [[1, 1, 1], [3, 4, 2], [7, 2, 3], [12, 5, 5], [2, 9, 10]] as const) {
    it(`${nRows} rows x ${nCols} columns, page ${page}`, () => {
      const cols = Array.from({ length: nCols }, (_, i) => `c${i}`);
      const shape: MoveShape = { rows: rowsOf(nRows), cols, page, bands: 0, extras: 0, checkBox: false };
      for (let r = 0; r < nRows; r++) {
        for (let c = 0; c < nCols; c++) {
          for (const intent of INTENTS) {
            const want = moveFocus(null, shape, { kind: 'cell', row: k(r), column: cols[c]! }, null, intent)!;
            const got = navigate(null, { rows: nRows, cols: nCols, page }, { row: r, col: c }, null, intent)!;
            const as: { to: unknown; goal: Goal } =
              got.to.row < 0
                ? { to: { kind: 'header', column: cols[got.to.col] }, goal: { rowKey: null, colIndex: got.to.col } }
                : { to: { kind: 'cell', row: k(got.to.row), column: cols[got.to.col] }, goal: { rowKey: k(got.goal.row), colIndex: got.goal.col } };
            expect(as, `${r},${c} ${JSON.stringify(intent)}`).toEqual(want);
          }
        }
      }
    });
  }

  it('a span map is what moveFocus takes as its lookup', () => {
    const map: SpanLookup = buildSpanMap({ rows: { version: 1, count: 0 } as never, columns: { layout: { start: { columns: [] }, center: { columns: [] }, end: { columns: [] } }, get: () => undefined }, ctx: { locale: 'en-US' } as never });
    expect(map.ownerAt(0, 0)).toBeNull();
  });
});
