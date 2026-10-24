// Home, End, PageUp and PageDown in an open field (Phase 5 step 6, found on the playground in real Chrome on macOS):
// Chrome on a Mac does not move the caret on Home/End in a text field, it scrolls the scroller around it — the
// grid's viewport, so the edited row left the view (End: to the last row) and Enter kept the value out of sight;
// PageUp/PageDown scroll it on every system. In a field the grid takes them: Home and End move the caret (Shift
// extends the selection), PageUp and PageDown do nothing; never the grid's scroll.
import { describe, it, expect, afterEach } from 'vitest';
import { ed, cleanup } from './support-editors.js';

afterEach(cleanup);

describe('Home, End, PageUp, PageDown in a field', () => {
  for (const lang of ['fr', 'ar'] as const) {
    it(`taken by the field: the caret moves, the default (a scroll) is prevented (${lang})`, () => {
      const t = ed({ lang });
      t.at('r3', 'name');
      t.key('F2');
      const f = t.field()!;
      expect(f.value).toBe('Name 3');
      expect(t.key('Home', {}, f).defaultPrevented).toBe(true);
      expect([f.selectionStart, f.selectionEnd]).toEqual([0, 0]);
      expect(t.key('End', {}, f).defaultPrevented).toBe(true);
      expect([f.selectionStart, f.selectionEnd]).toEqual([6, 6]);
      f.setSelectionRange(2, 2);
      t.key('End', { shiftKey: true }, f);
      expect([f.selectionStart, f.selectionEnd]).toEqual([2, 6]);
      f.setSelectionRange(4, 4);
      t.key('Home', { shiftKey: true }, f);
      expect([f.selectionStart, f.selectionEnd]).toEqual([0, 4]);
      f.setSelectionRange(3, 3);
      for (const k of ['PageUp', 'PageDown']) {
        expect(t.key(k, {}, f).defaultPrevented, k).toBe(true);
        expect([f.selectionStart, f.selectionEnd], k).toEqual([3, 3]);
      }
      // Still open, nothing saved, the focus unchanged.
      expect(t.field()).toBe(f);
      expect(t.focusAt()).toBe('r3/name');
      expect(t.of('cellEdited')).toEqual([]);
    });
  }

  it('Ctrl/Cmd+Home or End and Alt are the browser’s (not taken)', () => {
    const t = ed();
    t.at('r3', 'name');
    t.key('F2');
    const f = t.field()!;
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) expect(t.key('Home', init, f).defaultPrevented, JSON.stringify(init)).toBe(false);
  });
});
