// @vitest-environment node
// moveFocus over a whole row (a detail, Phase 4 step 9, D8) and pages by distance (D7): `MoveShape.whole`
// and `MoveShape.rowAt`. Without them, every move is the one before (uniform rows). Written before the code.
import { describe, it, expect } from 'vitest';
import { dataKey, intentFor, type FocusPos, type Intent, type RowKey } from '@dzgrid/core';
import { moveFocus, type Goal, type Move, type MoveShape } from '../src/keys/move.js';

const k = (s: string): RowKey => dataKey(s)!;
const KEYS = Array.from({ length: 30 }, (_, i) => k(`r${i}`));
const rows: MoveShape['rows'] = {
  count: KEYS.length,
  index: (i: number) => (Number.isInteger(i) && i >= 0 && i < KEYS.length ? (i as never) : null),
  keyAt: (i) => KEYS[i as unknown as number]!,
  indexOf: (key) => KEYS.indexOf(key) as never,
};
const COLS = ['a', 'b', 'c', 'd'];
const base: MoveShape = { rows, cols: COLS, page: 5, bands: 0, extras: 0, checkBox: false };
const at = (r: number, c = 'b'): FocusPos => ({ kind: 'cell', row: KEYS[r]!, column: c });
const key = (key: string, mods: KeyboardEventInit = {}): Intent => intentFor({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods } as KeyboardEvent, { dir: 'ltr', owner: 'cell', mac: false })!;

describe('MoveShape.whole: a row that is one stop', () => {
  const s: MoveShape = { ...base, whole: (i) => i === 3 };

  it('Left, Right, Home, End on it move nowhere', () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) expect(moveFocus(null, s, at(3), null, key(k))).toBeNull();
  });

  it('Up, Down, the pages and Ctrl+Home/End move as from any row, the column kept', () => {
    expect(moveFocus(null, s, at(3), null, key('ArrowDown'))!.to).toEqual(at(4));
    expect(moveFocus(null, s, at(3), null, key('ArrowUp'))!.to).toEqual(at(2));
    expect(moveFocus(null, s, at(3), null, key('PageDown'))!.to).toEqual(at(8));
    expect(moveFocus(null, s, at(3), null, key('ArrowDown', { ctrlKey: true }))!.to).toEqual(at(29));
    // Ctrl+Home and Ctrl+End: the first and the last cell, as from any row.
    expect(moveFocus(null, s, at(3), null, key('Home', { ctrlKey: true }))!.to).toEqual(at(0, 'a'));
    expect(moveFocus(null, s, at(3), null, key('End', { ctrlKey: true }))!.to).toEqual(at(29, 'd'));
  });

  it('the goal column goes across it', () => {
    let goal: Goal | null = null;
    let from = at(2, 'd');
    for (const step of ['ArrowDown', 'ArrowDown']) {
      const m: Move = moveFocus(null, s, from, goal, key(step))!;
      goal = m.goal;
      from = m.to as FocusPos;
    }
    expect(from).toEqual(at(4, 'd'));
  });

  it('a row beside it still moves along its columns', () => {
    expect(moveFocus(null, s, at(2), null, key('ArrowRight'))!.to).toEqual(at(2, 'c'));
    expect(moveFocus(null, s, at(4), null, key('End'))!.to).toEqual(at(4, 'd'));
  });
});

describe('MoveShape.rowAt: pages by distance', () => {
  it('a page key asks rowAt from the focused row (−1 from the header) and goes where it says, clamped', () => {
    const asked: [number, number][] = [];
    const s: MoveShape = { ...base, rowAt: (r, n) => (asked.push([r, n]), r + n * 2) };
    expect(moveFocus(null, s, at(10), null, key('PageDown'))!.to).toEqual(at(12));
    expect(moveFocus(null, s, at(10), null, key('PageUp'))!.to).toEqual(at(8));
    expect(moveFocus(null, s, at(29), null, key('PageDown'))!.to).toEqual(at(29));
    expect(moveFocus(null, s, { kind: 'header', column: 'b' }, null, key('PageDown'))!.to).toEqual(at(1));
    expect(asked).toEqual([[10, 1], [10, -1], [29, 1], [-1, 1]]);
  });

  it('without it a page is `page` rows, from the header too (row page − 1)', () => {
    expect(moveFocus(null, base, at(10), null, key('PageDown'))!.to).toEqual(at(15));
    expect(moveFocus(null, base, at(10), null, key('PageUp'))!.to).toEqual(at(5));
    expect(moveFocus(null, base, { kind: 'header', column: 'b' }, null, key('PageDown'))!.to).toEqual(at(4));
    // A header's PageUp (refused by intentFor, asked directly) goes as it went.
    expect(moveFocus(null, base, { kind: 'header', column: 'b' }, null, { kind: 'page', delta: -1 })!.to).toEqual(at(4));
  });
});
