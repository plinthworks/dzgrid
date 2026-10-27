// The keyboard resize mode (Phase 6 step 6, docs/behaviors/column-resize.md 1–9; owner Q-K3, Q6-1 (no buttons), O10;
// step06-plan §2, §5.1): Alt+R on a column header (by `code`, then by `key`: AZERTY, Arabic, a Mac's Option), never with
// Ctrl, Meta or Shift, never on a group header, a filter cell or a `resizable: false` column (« fixed width »); the arrows
// ±10 px (Shift: 1), mirrored in right to left; min / max said; Home fits; End and the other keys swallowed (no sort, no
// move); Enter keeps; Escape restores the width AND the flexibility; Tab, a press, the focus leaving, a sort, new columns
// keep quietly; events `finished: false` per key, `true` once; the width said once after 300 ms; GridState unchanged by
// Escape. Expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { captureState } from '@dzgrid/core/state';
import { cleanup, colmake, SIX } from './support-columns.js';

afterEach(cleanup);

const resized = (t: ReturnType<typeof colmake>) => t.events.filter((e) => e.type === 'columnResized') as Extract<(typeof t.events)[number], { type: 'columnResized' }>[];
const w = (t: ReturnType<typeof colmake>, id: string) => {
  const L = t.g.kernel.columns.layout;
  for (const s of [L.start, L.center, L.end]) {
    const i = s.columns.findIndex((c) => c.id === id);
    if (i !== -1) return s.widths.sizeAt(i);
  }
  return -1;
};
const on = (t: ReturnType<typeof colmake>, id: string) => t.hcell(id)!.hasAttribute('data-dzg-resizing');
const alt = (t: ReturnType<typeof colmake>, init: KeyboardEventInit = {}) => t.press('r', { altKey: true, code: 'KeyR', ...init }, t.hcell('b')!);

describe('entering (column-resize.md 1–2)', () => {
  it('Alt+R on a focused header: the mode drawn, its hint, one sentence; the focus stays', () => {
    vi.useFakeTimers();
    const t = colmake({ lang: 'fr', columns: SIX() });
    t.focusHeader('b');
    expect(alt(t).defaultPrevented).toBe(true);
    expect(on(t, 'b')).toBe(true);
    expect(t.hcell('b')!.getAttribute('aria-description')).toBe('mode redimensionner');
    expect(t.said()).toEqual(['Redimensionner B : 100 pixels. Flèches pour changer, Entrée pour garder, Échap pour annuler']);
    expect(document.activeElement).toBe(t.hcell('b'));
    expect(resized(t)).toHaveLength(0);
  });

  it('by `code` on AZERTY and Arabic layouts and a Mac\'s Option (®); by `key` when `code` is another', () => {
    for (const init of [{ key: 'r', code: 'KeyR' }, { key: 'ق', code: 'KeyR' }, { key: '®', code: 'KeyR' }, { key: 'R', code: 'KeyO' }]) {
      const t = colmake({ columns: SIX() });
      t.focusHeader('b');
      t.press(init.key, { altKey: true, code: init.code }, t.hcell('b')!);
      expect(on(t, 'b'), init.key).toBe(true);
      cleanup();
    }
  });

  it('never with Ctrl, Meta or Shift held, nor without Alt', () => {
    const t = colmake({ columns: SIX() });
    t.focusHeader('b');
    for (const m of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: false }]) {
      t.press('r', { altKey: true, code: 'KeyR', ...m }, t.hcell('b')!);
      expect(on(t, 'b'), JSON.stringify(m)).toBe(false);
    }
  });

  it('a `resizable: false` column: no mode, « fixed width » said', () => {
    const t = colmake({ columns: SIX({ b: { resizable: false } }) });
    t.focusHeader('b');
    expect(alt(t).defaultPrevented).toBe(true);
    expect(on(t, 'b')).toBe(false);
    expect(t.said()).toEqual(['B: fixed width']);
    expect(t.api().resizeMode('b')).toBe(false);
  });

  it('a body cell: Alt+R is not the mode\'s', () => {
    const t = colmake({ columns: SIX() });
    t.focus('r1', 'b');
    t.press('r', { altKey: true, code: 'KeyR' }, t.cell('r1', 'b')!);
    expect(t.ctx.el.header.querySelector('[data-dzg-resizing]')).toBeNull();
  });

  it('`resizeMode(id)` focuses the header and enters; an unknown or hidden column: false', () => {
    const t = colmake({ columns: SIX({ e: { hidden: true } }) });
    t.focus('r1', 'a');
    expect(t.api().resizeMode('c')).toBe(true);
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'c' });
    expect(document.activeElement).toBe(t.hcell('c'));
    expect(on(t, 'c')).toBe(true);
    expect(t.api().resizeMode('nope')).toBe(false);
    expect(t.api().resizeMode('e')).toBe(false);
  });

  it('Alt+R is in the header\'s aria-keyshortcuts', () => {
    const t = colmake({ columns: SIX() });
    expect(t.hcell('b')!.getAttribute('aria-keyshortcuts')).toMatch(/\bAlt\+R\b/);
  });
});

describe('the keys (column-resize.md 3–7)', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: the arrow toward the end widens by 10, the other narrows; Shift by 1 (mirrored in right to left)`, () => {
      const t = colmake({ lang, columns: SIX() });
      const [wide, narrow] = lang === 'ar' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft'];
      t.focusHeader('b');
      alt(t);
      expect(t.press(wide).defaultPrevented).toBe(true);
      expect(w(t, 'b')).toBe(110);
      t.press(wide);
      t.press(narrow, { shiftKey: true });
      expect(w(t, 'b')).toBe(119);
      t.press(narrow);
      expect(w(t, 'b')).toBe(109);
      t.press(wide, { shiftKey: true });
      expect(w(t, 'b')).toBe(110);
      expect(resized(t).map((e) => [e.width, e.finished])).toEqual([[110, false], [120, false], [119, false], [109, false], [110, false]]);
      expect(t.shown()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });
  }

  it('the width said once, 300 ms after the last key; at a bound « minimum » / « maximum »', () => {
    vi.useFakeTimers();
    const t = colmake({ columns: SIX({ b: { minWidth: 85, maxWidth: 115 } }) });
    t.focusHeader('b');
    alt(t);
    t.said().length = 0;
    const n = () => t.said().length;
    const before = n();
    t.press('ArrowRight');
    vi.advanceTimersByTime(200);
    t.press('ArrowRight', { shiftKey: true });
    vi.advanceTimersByTime(299);
    expect(n()).toBe(before);
    vi.advanceTimersByTime(1);
    expect(t.said().at(-1)).toBe('B: 111 pixels');
    t.press('ArrowRight');
    vi.advanceTimersByTime(300);
    expect(w(t, 'b')).toBe(115);
    expect(t.said().at(-1)).toBe('B: 115 pixels, maximum');
    for (let i = 0; i < 4; i++) t.press('ArrowLeft');
    vi.advanceTimersByTime(300);
    expect(w(t, 'b')).toBe(85);
    expect(t.said().at(-1)).toBe('B: 85 pixels, minimum');
  });

  it('End, ArrowUp / Down, PageUp / Down, letters, Space, Ctrl+Shift+arrows: swallowed (no sort, no move, no focus move)', () => {
    const t = colmake({ columns: SIX() });
    t.focusHeader('b');
    alt(t);
    for (const k of ['End', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'x', ' ']) expect(t.press(k).defaultPrevented, k).toBe(true);
    // With Ctrl, Meta or Alt an arrow is neither a move nor a width.
    t.press('ArrowRight', { ctrlKey: true, shiftKey: true });
    t.press('ArrowRight', { altKey: true });
    expect(t.sorted()).toHaveLength(0);
    expect(t.moved()).toHaveLength(0);
    expect(w(t, 'b')).toBe(100);
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'b' });
    expect(on(t, 'b')).toBe(true);
  });

  it('Enter keeps the width and leaves (no sort): one `finished: true` with the new width', () => {
    const t = colmake({ columns: SIX() });
    t.focusHeader('b');
    alt(t);
    t.press('ArrowRight');
    t.press('ArrowRight');
    t.press('Enter');
    expect(on(t, 'b')).toBe(false);
    expect(t.hcell('b')!.hasAttribute('aria-description')).toBe(false);
    expect(t.sorted()).toHaveLength(0);
    expect(w(t, 'b')).toBe(120);
    expect(resized(t).filter((e) => e.finished).map((e) => e.width)).toEqual([120]);
    // Out of the mode, the arrows move the focus again.
    t.press('ArrowRight');
    expect(t.g.kernel.focus).toEqual({ kind: 'header', column: 'c' });
  });

  it('Enter with no key pressed: nothing dispatched (a flexible column stays flexible)', () => {
    const t = colmake({ columns: SIX({ b: { flex: 1, width: undefined } }) });
    t.focusHeader('b');
    alt(t);
    t.press('Enter');
    expect(resized(t)).toHaveLength(0);
    expect(t.g.kernel.columns.state().find((s) => s.id === 'b')?.width).toBeUndefined();
  });

  it('Escape puts back the width, says « cancelled », one `finished: true` with the old width', () => {
    const t = colmake({ columns: SIX() });
    t.focusHeader('b');
    alt(t);
    t.press('ArrowRight');
    t.press('Escape');
    expect(on(t, 'b')).toBe(false);
    expect(w(t, 'b')).toBe(100);
    expect(t.said().at(-1)).toBe('Resize cancelled');
    expect(resized(t).filter((e) => e.finished).map((e) => e.width)).toEqual([100]);
  });

  it('a flexible column becomes fixed on the first key; Escape makes it flexible again; GridState as before', () => {
    const t = colmake({ columns: SIX({ b: { flex: 1, width: undefined } }) });
    const before = captureState(t.g.kernel);
    const flexW = w(t, 'b');
    t.focusHeader('b');
    alt(t);
    t.press('ArrowRight');
    expect(t.g.kernel.columns.state().find((s) => s.id === 'b')?.width).toBe(flexW + 10);
    t.press('Escape');
    expect(t.g.kernel.columns.state().find((s) => s.id === 'b')?.width).toBeUndefined();
    expect(w(t, 'b')).toBe(flexW);
    expect(captureState(t.g.kernel)).toEqual(before);
  });

  it('after a keyboard resize, GridState has the new width', () => {
    const t = colmake({ columns: SIX() });
    t.focusHeader('b');
    alt(t);
    t.press('ArrowRight');
    t.press('Enter');
    expect(captureState(t.g.kernel).columns?.find((c) => c.id === 'b')?.width).toBe(110);
  });

  // Lead decision (review 2026-10-27, finding 5): Right in left to right, Left in right to left always widens, whatever
  // side the grip is on — the last end-pinned column too (its grip on its start edge reverses the pointer only).
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: the last end-pinned column: ${lang === 'ar' ? 'ArrowLeft' : 'ArrowRight'} widens, the other narrows`, () => {
      const t = colmake({ lang, columns: SIX({ f: { pinned: 'end' } }) });
      expect(t.hcell('f')!.querySelector('.dzg-resize')!.classList.contains('dzg-resize-start')).toBe(true);
      t.focusHeader('f');
      t.press('r', { altKey: true, code: 'KeyR' }, t.hcell('f')!);
      t.press(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight');
      expect(w(t, 'f')).toBe(110);
      t.press(lang === 'ar' ? 'ArrowRight' : 'ArrowLeft', { shiftKey: true });
      expect(w(t, 'f')).toBe(109);
    });
  }

  it('a pinned column (the last one at the end, its grip on the start edge): the keys are not reversed', () => {
    const t = colmake({ columns: SIX({ f: { pinned: 'end' } }) });
    t.focusHeader('f');
    t.press('r', { altKey: true, code: 'KeyR' }, t.hcell('f')!);
    t.press('ArrowRight');
    expect(w(t, 'f')).toBe(110);
  });
});

describe('leaving quietly, keeping the width (O10)', () => {
  const into = (o: Parameters<typeof colmake>[0] = {}) => {
    const t = colmake({ columns: SIX(), ...o });
    t.focusHeader('b');
    alt(t);
    t.press('ArrowRight');
    return t;
  };
  const kept = (t: ReturnType<typeof colmake>) => {
    expect(on(t, 'b')).toBe(false);
    expect(w(t, 'b')).toBe(110);
    expect(resized(t).filter((e) => e.finished).map((e) => e.width)).toEqual([110]);
    expect(t.said()).not.toContain('Resize cancelled');
  };

  it('Tab: kept, the key left to the browser', () => {
    const t = into();
    expect(t.press('Tab').defaultPrevented).toBe(false);
    kept(t);
  });

  it('a press anywhere', () => {
    const t = into();
    t.down(t.cell('r1', 'd')!, { clientX: 350, clientY: 60 });
    kept(t);
  });

  it('the focus going outside the grid', () => {
    const t = into();
    const b = document.body.appendChild(document.createElement('button'));
    b.focus();
    kept(t);
  });

  it('a sort', () => {
    const t = into();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'a', dir: 'asc' }] }, 'api');
    kept(t);
  });

  it('the column hidden', () => {
    const t = into();
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'c', hidden: true }] }, 'api');
    expect(on(t, 'b')).toBe(false);
  });

  it('the grid destroyed while in the mode: no throw, no event after', () => {
    const t = into();
    const n = t.events.length;
    t.g.destroy();
    expect(t.events.length).toBe(n);
  });
});

describe('the budget line (owner Q6-6: the grant 3 500 → 4 200)', () => {
  it('@dzgrid/dom/columns is set from the step-6 measure, at most 4 200', () => {
    const b = JSON.parse(readFileSync(`${process.cwd()}/size-budget.json`, 'utf8')).entries['@dzgrid/dom/columns'].maxGzip as number;
    expect(b).toBeGreaterThan(2900);
    expect(b).toBeLessThanOrEqual(4200);
  });
});
