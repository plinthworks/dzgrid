// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { dataKey, type FocusPos, type Intent, type RowKey } from '@dzgrid/core';
import { moveFocus, type Goal, type MoveShape, type SpanLookup } from '../src/keys/move.js';

/**
 * The keys' moves, pulled out of the router (step 9b, commit 1): a pure
 * function. With no span map it moves exactly as the router did; these
 * expectations are written from the router's rules (keyboard.md).
 */
const k = (s: string): RowKey => dataKey(s)!;
const rowsOf = (n: number): MoveShape['rows'] => {
  const keys = Array.from({ length: n }, (_, i) => k(`r${i}`));
  return {
    count: n,
    index: (i: number) => (Number.isInteger(i) && i >= 0 && i < n ? (i as never) : null),
    keyAt: (i) => keys[i as unknown as number]!,
    indexOf: (key) => keys.indexOf(key) as never,
  };
};
const shape = (o: Partial<MoveShape> = {}): MoveShape => ({ rows: rowsOf(10), cols: ['a', 'b', 'c', 'd'], page: 3, bands: 0, extras: 0, checkBox: false, ...o });
const cell = (r: number, column: string): FocusPos => ({ kind: 'cell', row: k(`r${r}`), column });
const head = (column: string, level?: number): FocusPos => (level === undefined ? { kind: 'header', column } : { kind: 'header', column, level });

const down: Intent = { kind: 'move', axis: 'row', delta: 1 };
const up: Intent = { kind: 'move', axis: 'row', delta: -1 };
const right: Intent = { kind: 'move', axis: 'col', delta: 1 };
const left: Intent = { kind: 'move', axis: 'col', delta: -1 };
const home: Intent = { kind: 'edge', axis: 'col', to: 'first' };
const end: Intent = { kind: 'edge', axis: 'col', to: 'last' };
const top: Intent = { kind: 'edge', axis: 'row', to: 'first' };
const bottom: Intent = { kind: 'edge', axis: 'row', to: 'last' };
const first: Intent = { kind: 'edge', axis: 'both', to: 'first' };
const last: Intent = { kind: 'edge', axis: 'both', to: 'last' };
const pageDown: Intent = { kind: 'page', delta: 1 };
const pageUp: Intent = { kind: 'page', delta: -1 };

const to = (from: FocusPos, intent: Intent, s: MoveShape = shape(), goal: Goal | null = null, map: SpanLookup | null = null) => moveFocus(map, s, from, goal, intent)?.to ?? null;

describe('moveFocus without spans: arrows in the body', () => {
  it('moves one row down and up, in the same column', () => {
    expect(to(cell(2, 'b'), down)).toEqual(cell(3, 'b'));
    expect(to(cell(2, 'b'), up)).toEqual(cell(1, 'b'));
  });

  it('stays on the last row going down', () => {
    expect(to(cell(9, 'c'), down)).toEqual(cell(9, 'c'));
  });

  it('goes up from the first row to the column header, or to the last header row a feature added', () => {
    expect(to(cell(0, 'b'), up)).toEqual(head('b'));
    expect(to(cell(0, 'b'), up, shape({ extras: 2 }))).toEqual(head('b', 2));
    // Group rows above do not change where Up from the body lands.
    expect(to(cell(0, 'b'), up, shape({ bands: 2 }))).toEqual(head('b'));
  });

  it('moves one column across, and stops at both ends', () => {
    expect(to(cell(2, 'b'), right)).toEqual(cell(2, 'c'));
    expect(to(cell(2, 'b'), left)).toEqual(cell(2, 'a'));
    expect(to(cell(2, 'd'), right)).toEqual(cell(2, 'd'));
    expect(to(cell(2, 'a'), left)).toEqual(cell(2, 'a'));
  });

  it('starts from the first column when the focused one is not visible', () => {
    expect(to(cell(2, 'gone'), right)).toEqual(cell(2, 'b'));
    expect(to(cell(2, 'gone'), down)).toEqual(cell(3, 'a'));
  });

  it('treats a row no longer displayed as above the first row', () => {
    const stale: FocusPos = { kind: 'cell', row: k('gone'), column: 'c' };
    expect(to(stale, down)).toEqual(cell(0, 'c'));
    expect(to(stale, up)).toEqual(head('c'));
    expect(to(stale, up, shape({ extras: 1 }))).toEqual(head('c'));
    expect(to(stale, right)).toEqual(cell(0, 'd'));
  });
});

describe('moveFocus without spans: arrows in the header', () => {
  it('goes down from the column headers into the body, through the rows a feature added', () => {
    expect(to(head('b'), down)).toEqual(cell(0, 'b'));
    const s = shape({ extras: 2 });
    expect(to(head('b'), down, s)).toEqual(head('b', 1));
    expect(to(head('b', 1), down, s)).toEqual(head('b', 2));
    expect(to(head('b', 2), down, s)).toEqual(cell(0, 'b'));
  });

  it('goes up a header row, the column headers written without a level', () => {
    const s = shape({ extras: 2 });
    expect(to(head('b', 2), up, s)).toEqual(head('b', 1));
    expect(to(head('b', 1), up, s)).toEqual(head('b'));
    expect(moveFocus(null, s, head('b', 1), null, up)?.to).not.toHaveProperty('level');
  });

  it('stops at the top header row: nothing above the column headers without group rows', () => {
    expect(moveFocus(null, shape(), head('b'), null, up)).toBeNull();
    expect(moveFocus(null, shape({ extras: 2 }), head('b'), null, up)).toBeNull();
  });

  it('climbs the group rows above the column headers, then stops; and comes back down', () => {
    const s = shape({ bands: 2 });
    expect(to(head('b'), up, s)).toEqual(head('b', -1));
    expect(to(head('b', -1), up, s)).toEqual(head('b', -2));
    expect(moveFocus(null, s, head('b', -2), null, up)).toBeNull();
    expect(to(head('b', -2), down, s)).toEqual(head('b', -1));
    expect(to(head('b', -1), down, s)).toEqual(head('b'));
  });

  it('moves across a header row, keeping its level, and stops at both ends', () => {
    expect(to(head('b'), right)).toEqual(head('c'));
    expect(to(head('b', 1), right, shape({ extras: 1 }))).toEqual(head('c', 1));
    expect(to(head('b', -1), left, shape({ bands: 1 }))).toEqual(head('a', -1));
    expect(to(head('d'), right)).toEqual(head('d'));
    expect(to(head('a'), left)).toEqual(head('a'));
  });

  it('goes back from the first column header to the select-all box, only from the column headers', () => {
    const s = shape({ checkBox: true, extras: 1, bands: 1 });
    const m = moveFocus(null, s, head('a'), null, left);
    expect(m).toEqual({ to: 'checkBox', goal: null });
    expect(to(head('a', 1), left, s)).toEqual(head('a', 1));
    expect(to(head('a', -1), left, s)).toEqual(head('a', -1));
    expect(to(head('b'), left, s)).toEqual(head('a'));
    expect(to(head('a'), left, shape({ checkBox: false }))).toEqual(head('a'));
    expect(to(cell(0, 'a'), left, s)).toEqual(cell(0, 'a'));
  });
});

describe('moveFocus without spans: Home, End and the edges', () => {
  it('Home and End go to the first and last column of the row', () => {
    expect(to(cell(4, 'c'), home)).toEqual(cell(4, 'a'));
    expect(to(cell(4, 'b'), end)).toEqual(cell(4, 'd'));
    expect(to(head('c', 1), home, shape({ extras: 1 }))).toEqual(head('a', 1));
    expect(to(head('b'), end)).toEqual(head('d'));
  });

  it('Ctrl+Home and Ctrl+End go to the first and the last cell of the grid', () => {
    expect(to(cell(4, 'c'), first)).toEqual(cell(0, 'a'));
    expect(to(cell(4, 'b'), last)).toEqual(cell(9, 'd'));
    expect(to(head('c'), last)).toEqual(cell(9, 'd'));
    expect(to(head('c'), first)).toEqual(cell(0, 'a'));
  });

  it('Ctrl+Up and Ctrl+Down go to the first and the last row, in the same column', () => {
    expect(to(cell(4, 'c'), top)).toEqual(cell(0, 'c'));
    expect(to(cell(4, 'c'), bottom)).toEqual(cell(9, 'c'));
    expect(to(head('b'), bottom)).toEqual(cell(9, 'b'));
  });

  it('a row no longer displayed counts as the first row for Home and End', () => {
    const stale: FocusPos = { kind: 'cell', row: k('gone'), column: 'c' };
    expect(to(stale, home)).toEqual(cell(0, 'a'));
  });
});

describe('moveFocus without spans: pages', () => {
  it('moves a page of rows, clamped to the rows there are', () => {
    expect(to(cell(2, 'b'), pageDown)).toEqual(cell(5, 'b'));
    expect(to(cell(2, 'b'), pageUp)).toEqual(cell(0, 'b'));
    expect(to(cell(8, 'b'), pageDown)).toEqual(cell(9, 'b'));
    expect(to(cell(5, 'b'), pageUp, shape({ page: 1 }))).toEqual(cell(4, 'b'));
  });

  it('from a header, goes to the last row of the first page, whatever the direction', () => {
    expect(to(head('c'), pageDown)).toEqual(cell(2, 'c'));
    expect(to(head('c'), pageUp)).toEqual(cell(2, 'c'));
    expect(to(head('c'), pageDown, shape({ page: 20 }))).toEqual(cell(9, 'c'));
  });
});

describe('moveFocus without spans: no rows', () => {
  const none = shape({ rows: rowsOf(0) });
  it('a move toward the body stays in the header row it comes from', () => {
    expect(to(head('b'), down, none)).toEqual(head('b'));
    expect(to(head('b', 1), down, shape({ rows: rowsOf(0), extras: 1 }))).toEqual(head('b', 1));
    expect(to(head('b'), pageDown, none)).toEqual(head('b'));
    expect(to(head('b'), last, none)).toEqual(head('d'));
    expect(to(head('b', 1), first, shape({ rows: rowsOf(0), extras: 1 }))).toEqual(head('a', 1));
  });

  it('a cell focus left over goes to the column headers', () => {
    expect(to(cell(0, 'c'), down, none)).toEqual(head('c'));
    expect(to(cell(0, 'c'), right, none)).toEqual(head('d'));
  });
});

describe('moveFocus: what it does not move', () => {
  it('answers null for the intents that are commands, and when there are no columns', () => {
    for (const i of [{ kind: 'toggleSelect' }, { kind: 'selectAll' }, { kind: 'sort', multi: false }, { kind: 'enter' }, { kind: 'leave' }] as Intent[]) {
      expect(moveFocus(null, shape(), cell(1, 'a'), null, i)).toBeNull();
    }
    expect(moveFocus(null, shape({ cols: [] }), cell(1, 'a'), null, down)).toBeNull();
  });
});

describe('moveFocus: the goal', () => {
  it('hands back where the move lands as the next goal: the row key and the column index', () => {
    expect(moveFocus(null, shape(), cell(2, 'b'), null, down)!.goal).toEqual({ rowKey: k('r3'), colIndex: 1 });
    expect(moveFocus(null, shape(), cell(0, 'c'), null, up)!.goal).toEqual({ rowKey: null, colIndex: 2 });
    expect(moveFocus(null, shape(), cell(2, 'd'), null, end)!.goal).toEqual({ rowKey: k('r2'), colIndex: 3 });
  });

  it('without spans, a goal naming the focused cell changes nothing, and any other goal is ignored', () => {
    const from = cell(2, 'b');
    const all = [down, up, right, left, home, end, top, bottom, first, last, pageDown, pageUp];
    for (const i of all) {
      const plain = to(from, i);
      expect(to(from, i, shape(), { rowKey: k('r2'), colIndex: 1 })).toEqual(plain);
      expect(to(from, i, shape(), { rowKey: k('r7'), colIndex: 3 })).toEqual(plain);
      expect(to(from, i, shape(), { rowKey: k('r2'), colIndex: 3 })).toEqual(plain);
      expect(to(from, i, shape(), { rowKey: k('r5'), colIndex: 1 })).toEqual(plain);
      expect(to(from, i, shape(), { rowKey: k('gone'), colIndex: 1 })).toEqual(plain);
      expect(to(from, i, shape(), { rowKey: null, colIndex: 3 })).toEqual(plain);
    }
    // A header ignores a goal.
    expect(to(head('b'), down, shape(), { rowKey: k('r5'), colIndex: 3 })).toEqual(cell(0, 'b'));
  });

  it('with a map, a goal inside the cell focused keeps its row across and its column up and down', () => {
    // r2/b covers rows 2 to 4 and columns b and c: the user came in at r4, column c.
    const map: SpanLookup = { ownerAt: (r, c) => (r >= 2 && r <= 4 && c >= 1 && c <= 2 ? { row: 2, col: 1, rows: 3, cols: 2 } : null) };
    const goal: Goal = { rowKey: k('r4'), colIndex: 2 };
    expect(to(cell(2, 'b'), left, shape(), goal, map)).toEqual(cell(4, 'a'));
    expect(to(cell(2, 'b'), home, shape(), goal, map)).toEqual(cell(4, 'a'));
    expect(to(cell(2, 'b'), up, shape(), goal, map)).toEqual(cell(1, 'c'));
    expect(to(cell(2, 'b'), pageUp, shape(), goal, map)).toEqual(cell(0, 'c'));
    expect(to(cell(2, 'b'), top, shape(), goal, map)).toEqual(cell(0, 'c'));
    // A goal the focused cell does not own is dropped.
    expect(to(cell(2, 'b'), left, shape(), { rowKey: k('r6'), colIndex: 2 }, map)).toEqual(cell(2, 'a'));
    expect(to(cell(2, 'b'), up, shape(), { rowKey: k('r3'), colIndex: 3 }, map)).toEqual(cell(1, 'b'));
  });
});
