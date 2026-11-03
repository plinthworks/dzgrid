// The status bar (Phase 9 SB2, docs/behaviors/status-bar.md; owner Q-SB1–Q-SB4): the block's figures in a strip under
// the rows, formats per column and language, items and parts, row counts on request, nothing said on its own.
// Written before the code; every expectation by hand. Rows of `rowsOf`: n = i, q = (i × 37) mod 101, s = `s${i mod 7}`.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { definePart, type SlotContext } from '../src/part.js';
import { pagination } from '../src/pagination.js';
import { COLUMNS } from './support-range.js';
import { cleanup, R_, smake, type R } from './support-status.js';

afterEach(cleanup);

/** The block r1/n → r3/q: n 1 2 3, s s1 s2 s3, q 37 74 10. */
const B = R_(['r1', 'n'], ['r3', 'q']);
const withFormat = (n: ColumnDef<R, any>['numberFormat'], q: ColumnDef<R, any>['numberFormat']): ColumnDef<R, any>[] =>
  COLUMNS.map((c) => (c.id === 'n' ? { ...c, numberFormat: n } : c.id === 'q' ? { ...c, numberFormat: q } : c));

describe('the strip', () => {
  it('is the last child of the grid, outside role=grid, a group named after the grid; no block: no figures', () => {
    const t = smake();
    const strip = t.strip()!;
    expect(t.ctx.el.root.lastElementChild).toBe(strip);
    expect(strip.closest('[role=grid]')).toBeNull();
    expect(t.group()!.getAttribute('role')).toBe('group');
    expect(t.group()!.getAttribute('aria-label')).toBe('Status bar, Data grid');
    expect(t.shown()).toEqual([]);
    expect([...t.group()!.querySelectorAll(':scope > [data-part]')].map((h) => (h as HTMLElement).dataset['part'])).toEqual(['status.count', 'status.sum', 'status.avg', 'status.min', 'status.max']);
    // No live region of its own.
    expect(strip.querySelector('[aria-live], [role=status]')).toBeNull();
  });

  it('the grid’s own label names the group', () => {
    const t = smake({ settings: { label: 'Stock' } });
    expect(t.group()!.getAttribute('aria-label')).toBe('Status bar, Stock');
  });
});

describe('the block’s figures', () => {
  it('two number columns and a text one: count of filled cells, sum, mean, min, max', () => {
    const t = smake();
    t.api().set(B);
    expect(t.shown()).toEqual(['Count: 9', 'Sum: 127', 'Average: 21.17', 'Min: 1', 'Max: 74']);
    t.api().clear();
    expect(t.shown()).toEqual([]);
  });

  it('text only: the count alone', () => {
    const t = smake();
    t.api().set(R_(['r1', 's'], ['r3', 's']));
    expect(t.shown()).toEqual(['Count: 3']);
  });

  it('one number in the block: the count alone (figures from two numbers, owner Q-SB1)', () => {
    const t = smake();
    t.api().set(R_(['r1', 'name'], ['r1', 'n']));
    expect(t.shown()).toEqual(['Count: 2']);
    t.api().set(R_(['r1', 'name'], ['r2', 'n']));
    expect(t.shown()).toEqual(['Count: 4', 'Sum: 3', 'Average: 1.5', 'Min: 1', 'Max: 2']);
  });

  it('each figure isolated in a <bdi>, its label beside it', () => {
    const t = smake();
    t.api().set(B);
    const sum = t.host('status.sum')!;
    expect(sum.querySelector('bdi')!.textContent).toBe('127');
    expect(sum.textContent).toBe('Sum: 127');
  });

  it('follows the rows: a new value counted again; the block dropped (a column hidden), the figures go', () => {
    const t = smake();
    t.api().set(B);
    t.g.update({ rows: Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, name: `Name ${i}`, n: i === 2 ? 102 : i, s: `s${i % 7}`, q: (i * 37) % 101 })) });
    expect(t.shown()).toEqual(['Count: 9', 'Sum: 227', 'Average: 37.83', 'Min: 1', 'Max: 102']);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 's', hidden: true }] }, 'user');
    expect(t.shown()).toEqual([]);
  });
});

describe('formats (owner Q-SB4)', () => {
  it('one format everywhere: kept (€ in French), the mean with two more decimals', () => {
    const eur = { style: 'currency', currency: 'EUR' } as const;
    const t = smake({ lang: 'fr', columns: withFormat(eur, eur) });
    t.api().set(B);
    expect(t.shown()).toEqual(['Nombre : 9', 'Somme : 127,00 €', 'Moyenne : 21,1667 €', 'Min : 1,00 €', 'Max : 74,00 €']);
  });

  it('two formats (€ and %): the plain number, two decimals at most (the mean four)', () => {
    const t = smake({ lang: 'fr', columns: withFormat({ style: 'currency', currency: 'EUR' }, { style: 'percent' }) });
    t.api().set(B);
    expect(t.shown()).toEqual(['Nombre : 9', 'Somme : 127', 'Moyenne : 21,1667', 'Min : 1', 'Max : 74']);
  });

  it('a whole-number format: the mean is not rounded to a whole number', () => {
    const t = smake({ columns: withFormat({ maximumFractionDigits: 0 }, { maximumFractionDigits: 0 }) });
    t.api().set(B);
    expect(t.shown()).toEqual(['Count: 9', 'Sum: 127', 'Average: 21.17', 'Min: 1', 'Max: 74']);
  });

  it('Arabic with the locale’s digits: Arabic-Indic, each in its <bdi>, never reversed', () => {
    const t = smake({ lang: 'ar', settings: { locale: 'ar-EG', numerals: 'locale' } });
    t.api().set(B);
    expect(t.shown()).toEqual(['العدد: ٩', 'المجموع: ١٢٧', 'المتوسط: ٢١٫١٧', 'الأدنى: ١', 'الأقصى: ٧٤']);
    expect(t.host('status.max')!.querySelector('bdi')!.textContent).toBe('٧٤');
    expect(t.group()!.getAttribute('aria-label')).toBe('شريط الحالة، جدول البيانات');
  });
});

describe('the keyboard, left to right and right to left', () => {
  for (const lang of ['en', 'ar'] as const)
    it(`${lang}: Shift+arrows grow the block toward the logical end; the figures follow`, () => {
      const t = smake({ lang });
      t.focus('r1', 'name');
      t.cell('r1', 'name')!.focus();
      t.press(lang === 'ar' ? 'ArrowLeft' : 'ArrowRight', { shiftKey: true });
      t.press('ArrowDown', { shiftKey: true });
      expect(t.block()).toBe('r1/name:r2/n');
      expect(t.shown()).toEqual(lang === 'ar' ? ['العدد: 4', 'المجموع: 3', 'المتوسط: 1.5', 'الأدنى: 1', 'الأقصى: 2'] : ['Count: 4', 'Sum: 3', 'Average: 1.5', 'Min: 1', 'Max: 2']);
      // The figures sit at the reading end: the first figure item carries the push.
      expect(t.host('status.count')!.dataset['at']).toBe('end');
      t.press('Escape');
      expect(t.shown()).toEqual([]);
    });

  it('nothing is said on its own: a block made by the keys says no figure', () => {
    vi.useFakeTimers();
    const t = smake();
    t.focus('r1', 'name');
    t.cell('r1', 'name')!.focus();
    t.press('ArrowRight', { shiftKey: true });
    t.press('ArrowDown', { shiftKey: true });
    vi.advanceTimersByTime(2000);
    expect(t.said().filter((s) => /Count|Sum|Average/.test(s))).toEqual([]);
  });
});

describe('items and parts', () => {
  it('row counts on request: all rows, filtered when different, selected when one or more', () => {
    const t = smake({ status: { items: ['status.rows', 'status.filtered', 'status.selected', 'status.count'] }, settings: { selection: { mode: 'multi' } } });
    expect(t.shown()).toEqual(['Rows: 200']);
    t.g.kernel.dispatch({ type: 'filter.column', column: 's', filter: { type: 'text', op: 'equals', value: 's1' } } as never, 'user'); // a filter value of the text kind, typed in the filters entry
    expect(t.shown()).toEqual(['Rows: 200', 'Filtered: 29']);
    t.g.kernel.dispatch({ type: 'selection.toggle', row: t.g.kernel.rows.displayed.keyAt(0 as never) }, 'user'); // display index 0, a branded number
    expect(t.shown()).toEqual(['Rows: 200', 'Filtered: 29', 'Selected: 1']);
    // Row counts at the reading start, the figures pushed to the end.
    expect(t.host('status.rows')!.dataset['at']).toBeUndefined();
    expect(t.host('status.count')!.dataset['at']).toBe('end');
  });

  it('a host part replaces a built-in one; a dotless part is shown; an unknown name skipped and told', () => {
    let last: SlotContext['status'] | null = null;
    const t = smake({
      status: { items: ['status.count', 'status.sum', 'mine', 'nope'] },
      settings: {
        parts: {
          'status.sum': definePart('status', { mount(h, c) { const u = (n: SlotContext['status']) => void (h.textContent = `Σ ${n.figure('sum') ?? '-'}`); u(c); return { update: u }; } }),
          mine: definePart('status', { mount(h, c) { last = c; const u = (n: SlotContext['status']) => void ((last = n), (h.textContent = n.stats ? `cells ${n.format(n.stats.cells)}` : '')); u(c); return { update: u }; } }),
        },
      },
    });
    expect([...t.group()!.querySelectorAll(':scope > [data-part]')].map((h) => (h as HTMLElement).dataset['part'])).toEqual(['status.count', 'status.sum', 'mine']);
    expect(t.problems()).toContainEqual({ code: 'unknown-part', severity: 'error', path: 'statusBar.items[3]', detail: 'nope' });
    t.api().set(B);
    expect(t.shown()).toEqual(['Count: 9', 'Σ 127', 'cells 9']);
    expect(last!.stats).toMatchObject({ cells: 9, filled: 9, numbers: 6, sum: 127, min: 1, max: 74, partial: false });
    expect(last!.stats!.avg).toBeCloseTo(127 / 6, 12);
    expect(last!.format(1234.5, 'n')).toBe('1,234.5');
    expect(last!.busy).toBe(false);
  });

  it('without range(): the block items stay empty, told once', () => {
    const t = smake({ features: (_r, s) => [s] });
    expect(t.problems().filter((p) => p.code === 'missing-feature')).toEqual([{ code: 'missing-feature', severity: 'warning', path: 'features.statusBar', detail: 'range' }]);
    expect(t.shown()).toEqual([]);
  });

  it('a missing text throws at setup, naming it', () => {
    const msgs = smake().ctx.settings.messages;
    const text = { ...msgs.text } as Record<string, unknown>;
    delete text['status.sum'];
    expect(() => smake({ messages: { locale: 'en', text } as never })).toThrow(/statusBar: missing status\.sum/); // a bundle with a key removed on purpose
  });

  it('maxCells not a whole number ≥ 1: 200 000, told', () => {
    const t = smake({ status: { maxCells: -3 } });
    expect(t.problems()).toContainEqual({ code: 'invalid-setting', severity: 'warning', path: 'statusBar.maxCells' });
  });
});

describe('one strip with the pager (owner Q-SB2)', () => {
  for (const order of ['pager first', 'status first'] as const)
    it(`${order}: the pager's parts, then the figures, the pager last; one strip`, () => {
      const t = smake({ settings: { pagination: { pageSize: 20 } }, features: (r, s) => (order === 'pager first' ? [r, pagination(), s] : [r, s, pagination()]) });
      expect(t.ctx.el.root.querySelectorAll('.dzg-footer').length).toBe(1);
      const kids = [...t.strip()!.children].map((c) => (c as HTMLElement).dataset['part'] ?? c.className);
      expect(kids).toEqual(['footer.selected', 'footer.count', 'dzg-status', 'footer.pager']);
      expect(t.strip()!.lastElementChild!.tagName).toBe('NAV');
      t.api().set(B);
      expect(t.shown()).toEqual(['Count: 9', 'Sum: 127', 'Average: 21.17', 'Min: 1', 'Max: 74']);
      t.g.destroy();
      expect(t.host).toBeTruthy();
      expect(document.querySelector('.dzg-footer')).toBeNull();
    });
});

describe('when it counts', () => {
  it('at most once a frame: 50 frames of moves count at most 50 times; a paint with nothing new counts nothing', () => {
    let updates = 0;
    const t = smake({ sync: false, status: { items: ['spy'] }, settings: { parts: { spy: definePart('status', { mount() { updates++; return { update: () => void updates++ }; } }) } } });
    t.tick();
    const before = updates;
    for (let f = 0; f < 50; f++) {
      for (let j = 0; j < 3; j++) t.api().set(R_(['r1', 'n'], [`r${2 + ((f * 3 + j) % 20)}`, 'q']));
      t.tick();
    }
    expect(updates - before).toBeGreaterThan(0);
    expect(updates - before).toBeLessThanOrEqual(50);
    const now = updates;
    t.scroll(64);
    t.tick();
    expect(updates).toBe(now);
  });

  it('a big block (over maxCells) shows « … » while the keys move it, counted 150 ms after the last key', () => {
    vi.useFakeTimers();
    const t = smake({ status: { maxCells: 10 } });
    t.focus('r1', 'name');
    t.cell('r1', 'name')!.focus();
    for (let i = 0; i < 3; i++) t.press('ArrowRight', { shiftKey: true });
    for (let i = 0; i < 3; i++) t.press('ArrowDown', { shiftKey: true });
    expect(t.shown()).toEqual(['Count: …', 'Sum: …', 'Average: …', 'Min: …', 'Max: …']);
    vi.advanceTimersByTime(149);
    expect(t.shown()[0]).toBe('Count: …');
    vi.advanceTimersByTime(1);
    // r1–r4 × name, n, s, q: 16 filled; n 1–4, q 37 74 10 47.
    expect(t.shown()).toEqual(['Count: 16', 'Sum: 178', 'Average: 22.25', 'Min: 1', 'Max: 74']);
  });

  it('a big block moved and brought back to the block last counted: counted again, never stuck on « … »', () => {
    vi.useFakeTimers();
    const t = smake({ status: { maxCells: 10 } });
    t.focus('r1', 'name');
    t.cell('r1', 'name')!.focus();
    for (let i = 0; i < 3; i++) t.press('ArrowRight', { shiftKey: true });
    for (let i = 0; i < 3; i++) t.press('ArrowDown', { shiftKey: true });
    vi.advanceTimersByTime(150);
    expect(t.shown()[0]).toBe('Count: 16');
    t.press('ArrowDown', { shiftKey: true });
    expect(t.shown()[0]).toBe('Count: …');
    t.press('ArrowUp', { shiftKey: true });
    vi.advanceTimersByTime(150);
    expect(t.shown()).toEqual(['Count: 16', 'Sum: 178', 'Average: 22.25', 'Min: 1', 'Max: 74']);
  });

  it('a column format Intl refuses (a currency without its code): the plain number, told once, never a throw', () => {
    const t = smake({ columns: withFormat({ style: 'currency' }, { style: 'currency' }) });
    t.api().set(B);
    // The plain number, as for formats that differ: the mean four decimals.
    expect(t.shown()).toEqual(['Count: 9', 'Sum: 127', 'Average: 21.1667', 'Min: 1', 'Max: 74']);
    t.sapi().announce();
    expect(t.said().at(-1)).toBe('Count: 9, Sum: 127, Average: 21.1667, Min: 1, Max: 74');
    expect(t.problems().filter((p) => p.path === 'statusBar.numberFormat')).toEqual([{ code: 'invalid-setting', severity: 'warning', path: 'statusBar.numberFormat' }]);
  });

  it('a big block dragged: « … » while the button is held, counted at the release', () => {
    const t = smake({ status: { maxCells: 4 } });
    t.down(t.cell('r1', 'name')!, t.at('r1', 'name'));
    t.move(t.at('r3', 'q'));
    expect(t.shown()[0]).toBe('Count: …');
    t.up(t.at('r3', 'q'));
    expect(t.shown()).toEqual(['Count: 12', 'Sum: 127', 'Average: 21.17', 'Min: 1', 'Max: 74']);
  });

  it('the API reads the figures now, whatever their size', () => {
    const t = smake({ status: { maxCells: 2 } });
    expect(t.sapi().stats()).toBeNull();
    t.api().set(B);
    expect(t.sapi().stats()).toMatchObject({ cells: 9, numbers: 6, sum: 127 });
  });
});

describe('read on demand', () => {
  it('announce(): one polite sentence of what the strip shows; without a block, « No totals »', () => {
    const t = smake({ status: { items: ['status.rows', 'status.count', 'status.sum', 'status.avg', 'status.min', 'status.max'] } });
    t.sapi().announce();
    expect(t.said().at(-1)).toBe('Rows: 200');
    const bare = smake({ status: { items: ['status.count'] } });
    bare.sapi().announce();
    expect(bare.said().at(-1)).toBe('No totals');
    t.api().set(B);
    t.sapi().announce();
    expect(t.said().at(-1)).toBe('Rows: 200, Count: 9, Sum: 127, Average: 21.17, Min: 1, Max: 74');
  });
});
