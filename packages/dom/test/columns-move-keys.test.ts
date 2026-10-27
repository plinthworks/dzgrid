// Moving a column with the keys (Phase 6 step 2, column-move.md 14–18, owner Q-K2 and « Step 1 follow-ups » Mac, O2, O4;
// step02-plan §3): Ctrl+Shift+arrows one place (mirrored in right to left), Ctrl+Shift+Home / End to the segment's edge,
// Cmd on a Mac instead of Ctrl (and never both), Alt never; the edge and a locked column said at once, not repeated within
// the pause; the place said once after a 300 ms pause; the focus kept on the moved header; only on a column header (a body
// cell keeps the block's keys); `api.move` as the keys.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, colmake, join, SIX, R_ } from './support-columns.js';
import { EN } from '../src/locales/en.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';

afterEach(cleanup);

describe('the table, both directions', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: the arrow toward the logical end moves one place there, the other back; Home / End to the edges`, () => {
      vi.useFakeTimers();
      const t = colmake({ lang, columns: SIX() });
      const [toEnd, toStart] = lang === 'ar' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft'];
      t.focusHeader('b');
      expect(t.key(toEnd, { ctrlKey: true }).defaultPrevented).toBe(true);
      expect(t.shown()).toEqual(['a', 'c', 'b', 'd', 'e', 'f']);
      t.key(toStart, { ctrlKey: true });
      t.key(toStart, { ctrlKey: true });
      expect(t.shown()).toEqual(['b', 'a', 'c', 'd', 'e', 'f']);
      t.key('End', { ctrlKey: true });
      expect(t.shown()).toEqual(['a', 'c', 'd', 'e', 'f', 'b']);
      t.key('Home', { ctrlKey: true });
      expect(t.shown()).toEqual(['b', 'a', 'c', 'd', 'e', 'f']);
      // One patch and one columnsChanged (user) per key.
      expect(t.moved()).toHaveLength(5);
      expect(t.moved().every((e) => e.source === 'user')).toBe(true);
      // The focus stayed on the moved header, in the DOM and the kernel.
      expect(document.activeElement).toBe(t.hcell('b'));
      expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'b' });
      expect(t.sorted()).toHaveLength(0);
    });
  }

  it('the place said once, 300 ms after the last key (the last place); the edge at once, not repeated within the pause', () => {
    vi.useFakeTimers();
    const t = colmake({ lang: 'fr', columns: SIX() });
    t.focusHeader('b');
    t.key('ArrowRight', { ctrlKey: true });
    vi.advanceTimersByTime(200);
    t.key('ArrowRight', { ctrlKey: true });
    vi.advanceTimersByTime(200);
    t.key('ArrowRight', { ctrlKey: true });
    expect(t.said()).toEqual([]);
    vi.advanceTimersByTime(299);
    expect(t.said()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(t.said()).toEqual(['B\u202F: colonne 5 sur 6']);
    t.key('End', { ctrlKey: true });
    vi.advanceTimersByTime(300);
    t.key('ArrowRight', { ctrlKey: true });
    t.key('ArrowRight', { ctrlKey: true });
    expect(t.said().slice(1)).toEqual(['B\u202F: colonne 6 sur 6', 'B\u202F: déjà au bord']);
    vi.advanceTimersByTime(400);
    t.key('ArrowRight', { ctrlKey: true });
    expect(t.said().at(-1)).toBe('B\u202F: déjà au bord');
    expect(t.said()).toHaveLength(4);
  });

  it('a locked column: nothing moves, « cannot be moved »; its neighbour jumps over it (M12)', () => {
    vi.useFakeTimers();
    const t = colmake({ columns: SIX({ c: { movable: false } }) });
    t.focusHeader('c');
    expect(t.key('ArrowRight', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(t.said()).toEqual(['C: cannot be moved']);
    expect(t.moved()).toHaveLength(0);
    t.focusHeader('b');
    t.key('ArrowRight', { ctrlKey: true });
    expect(t.shown()).toEqual(['a', 'd', 'c', 'b', 'e', 'f']);
    expect(t.shown().indexOf('c')).toBe(2);
    vi.advanceTimersByTime(300);
    expect(t.said().at(-1)).toBe('B: column 4 of 6');
  });

  it('never across a pinned edge (O2): the last centre column says « already at the edge »', () => {
    const t = colmake({ columns: SIX({ a: { pinned: 'start' }, f: { pinned: 'end' } }) });
    t.focusHeader('e');
    t.key('ArrowRight', { ctrlKey: true });
    t.key('End', { ctrlKey: true });
    t.focusHeader('b');
    t.key('ArrowLeft', { ctrlKey: true });
    t.focusHeader('a');
    t.key('ArrowRight', { ctrlKey: true });
    expect(t.moved()).toHaveLength(0);
    expect(t.said()).toEqual(['E: already at the edge', 'B: already at the edge', 'A: already at the edge']);
  });

  it('restoreFocus asked after a move (the header brought into view, WCAG 2.4.11)', () => {
    const t = colmake({ columns: SIX() });
    const r = vi.spyOn(t.ctx, 'restoreFocus');
    t.focusHeader('b');
    t.key('ArrowRight', { ctrlKey: true });
    expect(r).toHaveBeenCalled();
  });
});

describe('which keys, on which platform (owner « Step 1 follow-ups »: Cmd on a Mac)', () => {
  it('not a Mac: Ctrl+Shift yes; Cmd+Shift, Ctrl+Cmd+Shift, Alt+Ctrl+Shift, Ctrl alone no', () => {
    const t = colmake({ columns: SIX(), mac: false });
    t.focusHeader('b');
    expect(t.key('ArrowRight', { metaKey: true }).defaultPrevented).toBe(false);
    t.key('ArrowRight', { ctrlKey: true, metaKey: true });
    t.key('ArrowRight', { ctrlKey: true, altKey: true });
    expect(t.moved()).toHaveLength(0);
    // Ctrl alone is the grid's own key (to the last header), not a move.
    t.press('ArrowRight', { ctrlKey: true }, t.hcell('b')!);
    expect(t.moved()).toHaveLength(0);
    t.focusHeader('b');
    t.key('ArrowRight', { ctrlKey: true });
    expect(t.moved()).toHaveLength(1);
  });

  it('a Mac: Cmd+Shift yes; Ctrl+Shift no (macOS takes it for Spaces)', () => {
    const t = colmake({ columns: SIX(), mac: true });
    t.focusHeader('b');
    t.key('ArrowRight', { ctrlKey: true });
    t.key('ArrowRight', { ctrlKey: true, metaKey: true });
    t.key('ArrowRight', { metaKey: true, altKey: true });
    expect(t.moved()).toHaveLength(0);
    t.key('ArrowRight', { metaKey: true });
    expect(t.shown()).toEqual(['a', 'c', 'b', 'd', 'e', 'f']);
  });
});

describe('who has the key (M18)', () => {
  it('a body cell: the block\'s Ctrl+Shift+arrows, no column moves', () => {
    const t = colmake({ columns: SIX(), withRange: true });
    t.focus('r1', 'b');
    t.key('ArrowRight', { ctrlKey: true });
    expect(t.moved()).toHaveLength(0);
    expect(t.block()).toBe('r1/b:r1/f');
  });

  it('a control inside the header (a popup, a part\'s field): not the grid\'s', () => {
    const t = colmake({ columns: SIX() });
    t.focusHeader('b');
    const input = document.createElement('input');
    t.hcell('b')!.append(input);
    input.focus();
    t.key('ArrowRight', { ctrlKey: true }, input);
    expect(t.moved()).toHaveLength(0);
  });

  it('a header row that is not the column headers (a group row, the floating filters): not taken (O4)', () => {
    const t = colmake({ columns: SIX() });
    t.focusHeader('b');
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'b', level: -1 } }, 'api');
    t.key('ArrowRight', { ctrlKey: true }, t.hcell('b')!);
    expect(t.moved()).toHaveLength(0);
  });
});

describe('api.move (the menu\'s way, step 3)', () => {
  it('one step, the edges, locked, unknown; said at once unless say: false; source user', () => {
    const t = colmake({ columns: SIX({ e: { movable: false } }) });
    const a = t.api();
    expect(a.move('a', 1)).toBe('moved');
    expect(t.said()).toEqual(['A: column 2 of 6']);
    expect(a.move('a', 'start', { say: false })).toBe('moved');
    expect(t.said()).toHaveLength(1);
    expect(a.move('a', 'start')).toBe('edge');
    expect(a.move('e', 1)).toBe('locked');
    expect(a.move('zz', 1)).toBe('unknown');
    expect(t.said()).toEqual(['A: column 2 of 6', 'A: already at the edge', 'E: cannot be moved']);
    expect(t.moved().map((e) => e.source)).toEqual(['user', 'user']);
    expect(a.dropTargets).toBeDefined();
  });

  it('null before setup and after destroy', () => {
    const t = colmake({ columns: SIX() });
    const f = t.f;
    expect(f.api(t.g)).not.toBeNull();
    t.g.destroy();
    expect(f.api(t.g)).toBeNull();
    expect(R_).toBeDefined();
  });

  it('a missing text: setup throws, naming it', () => {
    expect(() => colmake({ columns: SIX(), messages: join(EN, EN_RANGE) })).toThrow(new TypeError('columns: missing move.placed, move.edge, move.locked, move.cancelled, size.mode, size.modeHint, size.width, size.min, size.max, size.cancelled, size.autoAll, size.locked'));
    // A bundle from before step 6 (moves only): the resize mode's texts named (CHANGELOG « Unreleased »).
    const { 'size.mode': _m, ...old } = EN_COLUMNS.text;
    expect(() => colmake({ columns: SIX(), messages: join(EN, EN_RANGE, { locale: 'en', text: old }) })).toThrow(new TypeError('columns: missing size.mode'));
  });
});
