// `@dzgrid/dom/range`, what is read (docs/behaviors/range-selection.md 5, 12, 13; a11y §20 items 125–128, 136;
// step11a-plan.md « Paint and a11y »): aria-selected="true" on the block's mounted data cells only, never "false";
// none for one cell; aria-multiselectable while range() is set up, whatever the row selection (the base seam); the
// size said once after a 400 ms pause, never while the keys follow; the Arabic plural forms; « cleared » at once.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { CellRange } from '@dzgrid/core';
import { definePart } from '../src/part.js';
import { detail } from '../src/detail.js';
import { EN } from '../src/locales/en.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { cells, cleanup, ids, join, k, rmake, rowsOf, type R } from './support-range.js';

afterEach(cleanup);

const R_ = (a: [string, string], f: [string, string]): CellRange => ({ anchor: { row: k(a[0]), column: a[1] }, focus: { row: k(f[0]), column: f[1] } });

describe('range a11y: aria-selected', () => {
  it('"true" on the mounted cells of the block, absent on every other cell (never "false"); none for one cell', () => {
    const t = rmake({ settings: { selection: { mode: 'multi', checkbox: true } } });
    t.focus('r1', 'n');
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowRight', { shiftKey: true });
    expect(t.selectedCells()).toEqual(cells(ids(1, 2), ['n', 's']).map((c) => `${c}=true`));
    // The rows keep their own row selection state (true / false on the row, never on a cell).
    expect(t.rowEl('r1')!.getAttribute('aria-selected')).toBe('false');
    t.press('ArrowLeft', { shiftKey: true });
    t.press('ArrowUp', { shiftKey: true });
    expect(t.selectedCells()).toEqual([]);
  });

  it('aria-multiselectable="true" with range() whatever the selection mode; without it, multi only', () => {
    for (const mode of ['none', 'single', 'multi'] as const) {
      const t = rmake({ settings: { selection: { mode } } });
      expect(t.vp.getAttribute('aria-multiselectable'), mode).toBe('true');
      t.g.update({ density: 'compact' });
      expect(t.vp.getAttribute('aria-multiselectable'), `${mode}, after a paint`).toBe('true');
      const bare = rmake({ settings: { selection: { mode } }, features: () => [] });
      expect(bare.vp.getAttribute('aria-multiselectable'), `${mode} bare`).toBe(mode === 'multi' ? 'true' : null);
    }
  });
});

describe('range a11y: the sentences', () => {
  it('the size is said once, 400 ms after the last key; nothing while the keys follow each other', () => {
    vi.useFakeTimers();
    const t = rmake();
    t.focus('r1', 'n');
    t.press('ArrowDown', { shiftKey: true });
    vi.advanceTimersByTime(300);
    t.press('ArrowDown', { shiftKey: true });
    vi.advanceTimersByTime(300);
    t.press('ArrowRight', { shiftKey: true });
    vi.advanceTimersByTime(399);
    expect(t.said()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(t.said()).toEqual(['3 rows, 2 columns selected']);
    vi.advanceTimersByTime(5000);
    expect(t.said()).toHaveLength(1);
  });

  it('after a release, Ctrl+A and Shift+Space too; back to one cell says nothing', () => {
    vi.useFakeTimers();
    const t = rmake({ rows: rowsOf(12) });
    t.drag(['r1', 'name'], ['r2', 'n']);
    vi.advanceTimersByTime(400);
    t.focus('r1');
    t.press('a', { ctrlKey: true, code: 'KeyA' });
    vi.advanceTimersByTime(400);
    t.press(' ', { shiftKey: true });
    vi.advanceTimersByTime(400);
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowUp', { shiftKey: true });
    vi.advanceTimersByTime(400);
    expect(t.said().filter((s) => s.endsWith('selected'))).toEqual(['2 rows, 2 columns selected', '12 rows, 4 columns selected', '1 row, 4 columns selected']);
  });

  it('French and Arabic: the plural forms of each language (2 rows → the dual in Arabic)', () => {
    vi.useFakeTimers();
    const fr = rmake({ lang: 'fr' });
    fr.focus('r1');
    fr.press('ArrowDown', { shiftKey: true });
    vi.advanceTimersByTime(400);
    const ar = rmake({ lang: 'ar' });
    ar.focus('r1');
    ar.press('ArrowDown', { shiftKey: true });
    ar.press('ArrowLeft', { shiftKey: true });
    vi.advanceTimersByTime(400);
    ar.press('ArrowDown', { shiftKey: true });
    vi.advanceTimersByTime(400);
    expect(fr.said()).toEqual(['2 lignes, 1 colonne sélectionnées']);
    expect(ar.said()).toEqual(['صفان، عمودان محددة', '3 صفوف، عمودان محددة']);
  });

  it('« cleared » is said at once (no pause) and a pending size is not said after it', () => {
    vi.useFakeTimers();
    const t = rmake();
    t.focus('r1');
    t.press('ArrowDown', { shiftKey: true });
    t.press('Escape');
    expect(t.said()).toEqual(['Selection cleared']);
    vi.advanceTimersByTime(1000);
    expect(t.said()).toEqual(['Selection cleared']);
  });

  it('the API never speaks', () => {
    vi.useFakeTimers();
    const t = rmake();
    t.api().set(R_(['r1', 'n'], ['r3', 'q']));
    vi.advanceTimersByTime(1000);
    t.api().clear();
    vi.advanceTimersByTime(1000);
    expect(t.said()).toEqual([]);
  });
});

describe('range a11y: review of step 11a', () => {
  it('nothing is said while the button is held; the size after the release', () => {
    vi.useFakeTimers();
    const t = rmake();
    t.down(t.cell('r1')!, t.at('r1'));
    t.move(t.at('r3'));
    vi.advanceTimersByTime(1000);
    expect(t.said()).toEqual([]);
    t.up(t.at('r3'));
    vi.advanceTimersByTime(400);
    expect(t.said()).toEqual(['3 rows, 1 column selected']);
  });

  it('the size counts data rows only (a detail inside)', () => {
    vi.useFakeTimers();
    const part = definePart('detail', { mount: (host) => ((host.textContent = 'panel'), {}) });
    const t = rmake({ messages: join(EN, EN_RANGE, EN_DETAIL), features: (r) => [detail<R>({ part, height: 64 }), r] });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('r1')], expanded: true }, 'api');
    t.focus('r1', 'n');
    t.press('ArrowDown', { shiftKey: true });
    t.press('ArrowDown', { shiftKey: true });
    vi.advanceTimersByTime(400);
    expect(t.said()).toEqual(['2 rows, 1 column selected']);
  });
});
