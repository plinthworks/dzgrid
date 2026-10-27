// Phase 6 step 8b-1 (step08b-plan.md §2.3, §3; pinned-rows.md 4, 8, 9; O8): the pure part of the pinned rows — the bands'
// heights under the half-view cap, and the focus moves across the header, the top band, the body and the bottom band.
// Expectations by hand from the plan's table; LTR only here (Left / Right never cross a band: the grid mirrors them).
import { describe, it, expect } from 'vitest';
import type { FocusPos, Intent, RowKey } from '@dzgrid/core';
import { bandHeights, crossBand, type CrossShape } from '../src/pinned-rows/band.js';

const K = (s: string) => s as RowKey;
const body = (n: number) => {
  const keys = Array.from({ length: n }, (_, i) => K(`b${i}`));
  return { count: n, index: (i: number) => (i >= 0 && i < n ? i : null) as never, keyAt: (i: number) => keys[i as number]!, indexOf: (k: RowKey) => keys.indexOf(k) as never };
};
const shape = (o: Partial<CrossShape> & { n?: number } = {}): CrossShape => ({ top: [K('t0'), K('t1')], bottom: [K('z0'), K('z1')], body: body(o.n ?? 30), level: 0, page: 10, ...o });
const cell = (row: string, column = 'c'): FocusPos => ({ kind: 'cell', row: K(row), column });
const head = (level = 0, column = 'c'): FocusPos => (level ? { kind: 'header', column, level } : { kind: 'header', column });
const down: Intent = { kind: 'move', axis: 'row', delta: 1 };
const up: Intent = { kind: 'move', axis: 'row', delta: -1 };
const pgDown: Intent = { kind: 'page', delta: 1 };
const pgUp: Intent = { kind: 'page', delta: -1 };

describe('crossBand: Down and Up through the bands (pinned-rows.md 8)', () => {
  it('the last header row Down: the first top row, column kept; a header row above it: not ours', () => {
    expect(crossBand(shape(), head(), down)).toEqual(cell('t0'));
    expect(crossBand(shape({ level: 1 }), head(1), down)).toEqual(cell('t0'));
    expect(crossBand(shape({ level: 1 }), head(0), down)).toBeUndefined();
    expect(crossBand(shape(), head(), up)).toBeUndefined();
  });

  it('no top band: not ours (the body\'s first row); no top band and no body rows: the first bottom row', () => {
    expect(crossBand(shape({ top: [] }), head(), down)).toBeUndefined();
    expect(crossBand(shape({ top: [], n: 0 }), head(), down)).toEqual(cell('z0'));
    expect(crossBand(shape({ top: [], bottom: [], n: 0 }), head(), down)).toBeUndefined();
  });

  it('inside the top band; its first row Up: the last header row; its last row Down: the first body row', () => {
    expect(crossBand(shape(), cell('t0'), down)).toEqual(cell('t1'));
    expect(crossBand(shape(), cell('t1'), up)).toEqual(cell('t0'));
    expect(crossBand(shape(), cell('t0'), up)).toEqual(head());
    expect(crossBand(shape({ level: 1 }), cell('t0'), up)).toEqual(head(1));
    expect(crossBand(shape(), cell('t1'), down)).toEqual(cell('b0'));
  });

  it('the top band\'s last row Down with no body rows: the first bottom row; with none either: it stays', () => {
    expect(crossBand(shape({ n: 0 }), cell('t1'), down)).toEqual(cell('z0'));
    expect(crossBand(shape({ n: 0, bottom: [] }), cell('t1'), down)).toEqual(cell('t1'));
  });

  it('the body\'s first row Up: the last top row; its last row Down: the first bottom row; elsewhere not ours', () => {
    expect(crossBand(shape(), cell('b0'), up)).toEqual(cell('t1'));
    expect(crossBand(shape(), cell('b29'), down)).toEqual(cell('z0'));
    expect(crossBand(shape(), cell('b5'), down)).toBeUndefined();
    expect(crossBand(shape(), cell('b5'), up)).toBeUndefined();
    expect(crossBand(shape({ top: [] }), cell('b0'), up)).toBeUndefined();
    expect(crossBand(shape({ bottom: [] }), cell('b29'), down)).toBeUndefined();
  });

  it('inside the bottom band; its first row Up: the last body row (none: the last top row, none: the header); its last row Down stays', () => {
    expect(crossBand(shape(), cell('z0'), down)).toEqual(cell('z1'));
    expect(crossBand(shape(), cell('z1'), up)).toEqual(cell('z0'));
    expect(crossBand(shape(), cell('z0'), up)).toEqual(cell('b29'));
    expect(crossBand(shape({ n: 0 }), cell('z0'), up)).toEqual(cell('t1'));
    expect(crossBand(shape({ n: 0, top: [] }), cell('z0'), up)).toEqual(head());
    expect(crossBand(shape({ n: 0, top: [], level: 2 }), cell('z0'), up)).toEqual(head(2));
    expect(crossBand(shape(), cell('z1'), down)).toEqual(cell('z1'));
  });

  it('inside a band only (`inside`, the editors\' Enter): the band\'s edges stop the move', () => {
    expect(crossBand(shape(), cell('t1'), down, true)).toEqual(cell('t1'));
    expect(crossBand(shape(), cell('t0'), up, true)).toEqual(cell('t0'));
    expect(crossBand(shape(), cell('t0'), down, true)).toEqual(cell('t1'));
    expect(crossBand(shape(), cell('z0'), up, true)).toEqual(cell('z0'));
  });
});

describe('crossBand: the column keys stay in the row (the grid moves them over the band)', () => {
  it('Left, Right, Home, End on a pinned row: not decided here', () => {
    for (const i of [{ kind: 'move', axis: 'col', delta: 1 }, { kind: 'move', axis: 'col', delta: -1 }, { kind: 'edge', axis: 'col', to: 'first' }, { kind: 'edge', axis: 'col', to: 'last' }] as Intent[]) {
      expect(crossBand(shape(), cell('t0'), i), JSON.stringify(i)).toBeUndefined();
      expect(crossBand(shape(), cell('z1'), i), JSON.stringify(i)).toBeUndefined();
    }
  });
});

describe('crossBand: pages and the body\'s edges (pinned-rows.md 9, O8)', () => {
  it('a top row PageDown: into the body by a page (row page − 1, as from the header); PageUp stays', () => {
    expect(crossBand(shape(), cell('t0'), pgDown)).toEqual(cell('b9'));
    expect(crossBand(shape({ n: 4 }), cell('t1'), pgDown)).toEqual(cell('b3'));
    expect(crossBand(shape(), cell('t1'), pgUp)).toEqual(cell('t1'));
  });

  it('a bottom row PageUp: into the body by a page from its end (count − page); PageDown stays', () => {
    expect(crossBand(shape(), cell('z1'), pgUp)).toEqual(cell('b20'));
    expect(crossBand(shape({ n: 4 }), cell('z0'), pgUp)).toEqual(cell('b0'));
    expect(crossBand(shape(), cell('z0'), pgDown)).toEqual(cell('z0'));
  });

  it('no body rows: a page key stays', () => {
    expect(crossBand(shape({ n: 0 }), cell('t0'), pgDown)).toEqual(cell('t0'));
    expect(crossBand(shape({ n: 0 }), cell('z0'), pgUp)).toEqual(cell('z0'));
  });

  it('Ctrl+Up / Ctrl+Down from a pinned row: the first / last body row, column kept; Ctrl+Home / End: with the first / last column', () => {
    const cols = ['a', 'c', 'e'];
    expect(crossBand(shape({ cols }), cell('z0'), { kind: 'edge', axis: 'row', to: 'first' })).toEqual(cell('b0'));
    expect(crossBand(shape({ cols }), cell('t0'), { kind: 'edge', axis: 'row', to: 'last' })).toEqual(cell('b29'));
    expect(crossBand(shape({ cols }), cell('t0'), { kind: 'edge', axis: 'both', to: 'last' })).toEqual(cell('b29', 'e'));
    expect(crossBand(shape({ cols }), cell('z1'), { kind: 'edge', axis: 'both', to: 'first' })).toEqual(cell('b0', 'a'));
    expect(crossBand(shape({ n: 0, cols }), cell('z1'), { kind: 'edge', axis: 'both', to: 'first' })).toEqual(cell('z1'));
  });

  it('the body keeps its own page and edge keys', () => {
    expect(crossBand(shape(), cell('b0'), pgDown)).toBeUndefined();
    expect(crossBand(shape(), cell('b29'), { kind: 'edge', axis: 'row', to: 'last' })).toBeUndefined();
  });
});

describe('bandHeights: at most half the view, whole rows, at least one row each (pinned-rows.md 4, O8)', () => {
  it('both fit in half the view: their own heights', () => {
    expect(bandHeights(64, 32, 320, 32)).toEqual([64, 32]);
    expect(bandHeights(0, 0, 320, 32)).toEqual([0, 0]);
    expect(bandHeights(160, 0, 320, 32)).toEqual([160, 0]);
  });

  it('over the cap: the top band first (at least half the cap), the bottom band the rest, whole rows', () => {
    expect(bandHeights(384, 32, 320, 32)).toEqual([128, 32]);
    expect(bandHeights(384, 0, 320, 32)).toEqual([160, 0]);
    expect(bandHeights(32, 384, 320, 32)).toEqual([32, 128]);
    expect(bandHeights(384, 384, 320, 32)).toEqual([64, 96]);
  });

  it('a tiny view: one row each, never hidden', () => {
    expect(bandHeights(96, 96, 40, 32)).toEqual([32, 32]);
    expect(bandHeights(96, 0, 0, 32)).toEqual([32, 0]);
  });
});
