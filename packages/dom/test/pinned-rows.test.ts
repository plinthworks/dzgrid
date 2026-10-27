// @vitest-environment jsdom
// Phase 6 step 8b-1 (docs/phase-6-steps/step08b-plan.md §1–§2.3, §5; docs/behaviors/pinned-rows.md 1–7, 10, 21; Q3): the
// bands in the DOM — two named `rowgroup`s beside the header and the body (never inside them), their rows counted and
// numbered, never selected, the host's classes told `pinned`; the live `set` (one side at a time), duplicates and too
// many rows told; the body's view shortened by the bands (2.4.11), at most half the view, a capped band windowed; the
// bottom band at the grid's foot when the body is short (Q3); paged grids; the texts; destroy.
import { afterEach, describe, it, expect } from 'vitest';
import { dataKey, pinnedKey } from '@dzgrid/core';
import { PINNED_KEYS } from '../src/pinned-rows.js';
import { EN } from '../src/locales/en.js';
import { pm, cleanup, rowsOf, ref, tot, T, B, PINNED, k, type R } from './support-pinned.js';

afterEach(cleanup);
const two = [ref('r1'), ref('r2')];

describe('two named row groups beside the header and the body (pinned-rows.md 5, 6)', () => {
  it('the top band right after the header, the bottom band right after the body; each a rowgroup named by the texts', () => {
    const p = pm({ top: two, bottom: [tot()] });
    const kids = [...p.vp.children];
    expect(kids.indexOf(p.top()!)).toBe(kids.indexOf(p.host.querySelector('.dzg-header')!) + 1);
    expect(kids.indexOf(p.bottom()!)).toBe(kids.indexOf(p.host.querySelector('.dzg-body')!) + 1);
    expect(p.top()!.getAttribute('role')).toBe('rowgroup');
    expect(p.bottom()!.getAttribute('role')).toBe('rowgroup');
    expect(p.top()!.getAttribute('aria-label')).toBe('Rows pinned at the top');
    expect(p.bottom()!.getAttribute('aria-label')).toBe('Rows pinned at the bottom');
    // Never nested in the header's row group (axe: a rowgroup inside a rowgroup).
    expect(p.host.querySelector('.dzg-header .dzg-pins, .dzg-body .dzg-pins')).toBeNull();
  });

  it('their rows are rows of grid cells, the first column a row header, the values formatted as in the body', () => {
    const p = pm({ top: [ref()], bottom: [tot('t', 1234)] });
    const row = p.prow(B('t'))!;
    expect(row.getAttribute('role')).toBe('row');
    expect(p.pcell(B('t'), 'name')!.getAttribute('role')).toBe('rowheader');
    expect(p.pcell(B('t'), 'n')!.getAttribute('role')).toBe('gridcell');
    expect(p.pcell(B('t'), 'n')!.textContent).toBe('1,234');
    expect(p.pcell(T('ref'), 'name')!.textContent).toBe('Reference');
  });

  it('in French and in Arabic, the names in the language', () => {
    for (const lang of ['fr', 'ar'] as const) {
      const p = pm({ top: [ref()], bottom: [tot()], lang });
      expect(p.top()!.getAttribute('aria-label'), lang).toBe(PINNED[lang].text['pinned.top']);
      expect(p.bottom()!.getAttribute('aria-label'), lang).toBe(PINNED[lang].text['pinned.bottom']);
      cleanup();
    }
  });

  it('an empty side: its band hidden, no row in it', () => {
    const p = pm({ bottom: [tot()] });
    expect(p.top()!.hidden).toBe(true);
    expect(p.top()!.querySelector('.dzg-row')).toBeNull();
    expect(p.bottom()!.hidden).toBe(false);
  });
});

describe('counted and numbered (pinned-rows.md 6)', () => {
  it('aria-rowcount: the header rows, the top rows, the body rows, the bottom rows; aria-rowindex runs in that order', () => {
    const p = pm({ top: two, bottom: [tot()], rows: rowsOf(5) });
    expect(p.vp.getAttribute('aria-rowcount')).toBe(String(1 + 2 + 5 + 1));
    expect(p.prow(T('r1'))!.getAttribute('aria-rowindex')).toBe('2');
    expect(p.prow(T('r2'))!.getAttribute('aria-rowindex')).toBe('3');
    expect(p.row('r0')!.getAttribute('aria-rowindex')).toBe('4');
    expect(p.row('r4')!.getAttribute('aria-rowindex')).toBe('8');
    expect(p.prow(B('tot'))!.getAttribute('aria-rowindex')).toBe('9');
  });

  it('a paged grid: the page\'s rows; the bands on every page', () => {
    const p = pm({ top: [ref()], bottom: [tot()], rows: rowsOf(25), settings: { pagination: { pageSize: 10 } } });
    expect(p.vp.getAttribute('aria-rowcount')).toBe(String(1 + 1 + 10 + 1));
    p.g.kernel.dispatch({ type: 'page.go', index: 2 }, 'user');
    expect(p.vp.getAttribute('aria-rowcount')).toBe(String(1 + 1 + 5 + 1));
    expect(p.prow(T('ref'))).not.toBeNull();
    expect(p.prow(B('tot'))!.getAttribute('aria-rowindex')).toBe('8');
  });

  it('never sorted, filtered or counted: a sort and a filter leave the bands as they are', () => {
    const p = pm({ top: two, bottom: [tot()], rows: rowsOf(5) });
    p.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'user');
    p.g.kernel.dispatch({ type: 'filter.set', filter: { name: { type: 'text', op: 'contains', value: 'zzz' } } }, 'user');
    expect(p.g.kernel.rows.displayed.count).toBe(0);
    expect([...p.top()!.querySelectorAll('.dzg-row')].map((r) => p.ctx.rowRenderer.keyOf(r))).toEqual([T('r1'), T('r2')]);
    expect(p.prow(B('tot'))).not.toBeNull();
  });
});

describe('never selected (pinned-rows.md 7)', () => {
  it('with a selection box column: the cell kept (the columns line up), no box in it; no aria-selected on the row', () => {
    const p = pm({ top: [ref()], settings: { selection: { mode: 'multi', checkbox: true } } });
    const row = p.prow(T('ref'))!;
    const check = row.querySelector<HTMLElement>('.dzg-check')!;
    expect(check).not.toBeNull();
    expect((check.firstChild as HTMLElement).hidden).toBe(true);
    expect(row.hasAttribute('aria-selected')).toBe(false);
    expect(p.row('r0')!.getAttribute('aria-selected')).toBe('false');
  });

  it('Space on a pinned cell selects nothing; Ctrl+A ticks the body rows only', () => {
    const p = pm({ top: [ref()], rows: rowsOf(3), settings: { selection: { mode: 'multi' } } });
    p.g.api.focusCell(T('ref'), 'name');
    p.press(' ');
    expect(p.g.kernel.selection.keys.size).toBe(0);
    p.press('a', { ctrlKey: true });
    expect([...p.g.kernel.selection.keys].sort()).toEqual([k('r0'), k('r1'), k('r2')].sort());
  });
});

describe('the host\'s classes and columns (pinned-rows.md 2)', () => {
  it('rowClass is told pinned: top or bottom (absent on a body row)', () => {
    const seen: unknown[] = [];
    const p = pm({ top: [ref()], bottom: [tot()], rows: rowsOf(1), settings: { rowClass: (c) => (seen.push([c.key, (c as { pinned?: string }).pinned]), (c as { pinned?: string }).pinned ? `is-${(c as { pinned?: string }).pinned}` : null) } });
    expect(p.prow(T('ref'))!.classList.contains('is-top')).toBe(true);
    expect(p.prow(B('tot'))!.classList.contains('is-bottom')).toBe(true);
    expect(seen).toContainEqual([k('r0'), undefined]);
  });

  it('a hidden column is hidden in the bands too', () => {
    const p = pm({ top: [ref()] });
    p.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 's', hidden: true }] }, 'user');
    expect(p.pcell(T('ref'), 's')).toBeNull();
    expect(p.pcell(T('ref'), 'q')).not.toBeNull();
  });
});

describe('the data: set, get, problems (pinned-rows.md 1, 4)', () => {
  it('get gives the rows as the app gave them; set replaces the sides given only; [] empties one', () => {
    const p = pm({ top: [ref()], bottom: [tot()] });
    expect(p.api.get()).toEqual({ top: [ref()], bottom: [tot()] });
    const t2 = tot('tot', 5);
    p.api.set({ bottom: [t2] });
    expect(p.api.get().bottom[0]).toBe(t2);
    expect(p.api.get().top).toEqual([ref()]);
    expect(p.pcell(B('tot'), 'n')!.textContent).toBe('5');
    p.api.set({ top: [] });
    expect(p.top()!.hidden).toBe(true);
    expect(p.api.rows('top').count).toBe(0);
    expect(p.api.rows('bottom').count).toBe(1);
    expect(p.events.filter((e) => e.type === 'pinnedChanged').map((e) => e.source)).toEqual(['api', 'api']);
  });

  it('a duplicate id on one side: the later dropped, an error; an unusable id: dropped, an error; the same id on both sides: fine', () => {
    const p = pm({ top: [ref('x'), ref('x'), { ...ref(), id: '' }], bottom: [tot('x')] });
    expect(p.api.rows('top').count).toBe(1);
    expect(p.api.rows('bottom').count).toBe(1);
    const ps = p.events.filter((e) => e.type === 'problems').flatMap((e) => (e as { problems: readonly unknown[] }).problems);
    expect(ps).toContainEqual({ code: 'duplicate-row-id', severity: 'error', path: 'pinnedRows.top[1]' });
    expect(ps).toContainEqual({ code: 'invalid-row-id', severity: 'error', path: 'pinnedRows.top[2]', detail: 'empty string' });
  });

  it('more than five on one side: a warning, all drawn', () => {
    const many = Array.from({ length: 6 }, (_, i) => ref(`m${i}`));
    const p = pm({ bottom: many, block: 1000 });
    const ps = p.events.filter((e) => e.type === 'problems').flatMap((e) => (e as { problems: readonly unknown[] }).problems);
    expect(ps).toContainEqual({ code: 'too-many-pinned-rows', severity: 'warning', path: 'pinnedRows.bottom' });
    expect(p.bottom()!.querySelectorAll('.dzg-row')).toHaveLength(6);
  });

  it('the same id kept across a set keeps its row element; the focus on it stays', () => {
    const p = pm({ bottom: [tot()] });
    p.g.api.focusCell(B('tot'), 'n');
    const el = p.prow(B('tot'));
    p.api.set({ bottom: [tot('tot', 7)] });
    expect(p.prow(B('tot'))).toBe(el);
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: B('tot'), column: 'n' });
  });

  it('a focused pinned row removed: the nearest row of its band; its band emptied: the first body row; no body rows either: the header', () => {
    const p = pm({ top: [ref('a'), ref('b'), ref('c')], rows: rowsOf(3) });
    p.g.api.focusCell(T('c'), 'n');
    p.api.set({ top: [ref('a'), ref('b')] });
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: T('b'), column: 'n' });
    p.api.set({ top: [] });
    expect(p.g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'n' });
    p.api.set({ top: [ref('a')] });
    p.g.api.focusCell(T('a'), 'n');
    p.g.kernel.dispatch({ type: 'filter.set', filter: { name: { type: 'text', op: 'contains', value: 'zzz' } } }, 'user');
    p.api.set({ top: [] });
    expect(p.g.kernel.focus).toEqual({ kind: 'header', column: 'n' });
  });
});

describe('the body\'s view and the half-view cap (pinned-rows.md 4, 10; WCAG 2.4.11)', () => {
  it('the body\'s view is the view less both bands; given back when they empty', () => {
    const p = pm({ top: two, bottom: [tot()], block: 320 });
    expect(p.ctx.viewBlock).toBe(320 - 64 - 32);
    p.api.set({ top: [], bottom: [] });
    expect(p.ctx.viewBlock).toBe(320);
  });

  it('a body row scrolled to is never under a band: the last rows reachable above the bottom band', () => {
    const p = pm({ top: two, bottom: [tot()], block: 320 });
    p.g.api.focusCell(k('r199'), 'name');
    // 200 rows of 32 px in a 224 px view: the end of the scroll is 6 400 − 224.
    expect(p.ctx.scroll.logicalTop).toBe(6400 - 224);
  });

  it('the bands\' heights: whole rows; over half the view, the top band at least half the cap, the bottom the rest', () => {
    const many = Array.from({ length: 12 }, (_, i) => ref(`m${i}`));
    const p = pm({ top: many, bottom: [tot()], block: 320 });
    expect(p.top()!.style.blockSize).toBe('128px');
    expect(p.bottom()!.style.blockSize).toBe('32px');
    expect(p.ctx.viewBlock).toBe(160);
  });

  it('a capped band shows its rows in a window: the focus brings a row into it; the wheel moves it', () => {
    const many = Array.from({ length: 12 }, (_, i) => ref(`m${i}`));
    const p = pm({ top: many, block: 320 });
    // 160 px: rows 0–4 shown.
    expect(p.prow(T('m0'))).not.toBeNull();
    expect(p.prow(T('m9'))).toBeNull();
    p.g.api.focusCell(T('m9'), 'name');
    expect(p.prow(T('m9'))).not.toBeNull();
    expect(p.prow(T('m9'))!.style.insetBlockStart).toBe(`${9 * 32 - (10 * 32 - 160)}px`);
    const wheel = new WheelEvent('wheel', { deltaY: -1000, bubbles: true, cancelable: true });
    p.top()!.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(p.prow(T('m0'))!.style.insetBlockStart).toBe('0px');
    // At its top already: the wheel is left to the page.
    const again = new WheelEvent('wheel', { deltaY: -10, bubbles: true, cancelable: true });
    p.top()!.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(false);
  });

  it('the top band sticks under every header row; the bottom band at the foot of a short body (Q3)', () => {
    const p = pm({ top: [ref()], bottom: [tot()], rows: rowsOf(3), block: 320 });
    expect(p.top()!.style.insetBlockStart).toBe('32px');
    // 320 − 32 − 32 − 3 × 32: the space under the body's last row.
    expect(p.bottom()!.style.marginBlockStart).toBe(`${320 - 64 - 96}px`);
    p.api.set({ bottom: [] });
    const q = pm({ bottom: [tot()], rows: rowsOf(200), block: 320 });
    expect(q.bottom()!.style.marginBlockStart).toBe('0px');
  });

  it('as wide as the body (the pinned columns stick inside it)', () => {
    const p = pm({ top: [ref()] });
    expect(p.top()!.style.inlineSize).toBe(p.host.querySelector<HTMLElement>('.dzg-body')!.style.inlineSize);
  });
});

describe('the texts and the end (pinned-rows.md « Texts »)', () => {
  it('en, fr and ar hold the same keys, PINNED_KEYS; a grid without them is refused at setup', () => {
    for (const lang of ['en', 'fr', 'ar'] as const) expect(Object.keys(PINNED[lang].text).sort(), lang).toEqual([...PINNED_KEYS].sort());
    expect(() => pm({ settings: { messages: { locale: 'en', text: { ...EN.text } } } })).toThrow(/pinned\.top/);
  });

  it('destroy: the bands gone, the view given back, the pinned keys no longer known', () => {
    const p = pm({ top: [ref()], bottom: [tot()], block: 320 });
    p.g.destroy();
    expect(p.top()).toBeNull();
    expect(p.bottom()).toBeNull();
    expect(p.ctx.geometry.read().block).toBe(320);
    expect(p.g.kernel.rowOf(T('ref'))).toBeUndefined();
  });

  it('a pinned row and a body row of the same id are two rows', () => {
    const p = pm({ top: [{ ...ref(), id: 'r0' }], rows: rowsOf(2) });
    expect(p.prow(pinnedKey('top', 'r0')!)).not.toBeNull();
    expect(p.row('r0')).not.toBeNull();
    expect(p.g.kernel.rowOf(dataKey('r0')!)?.data).not.toBe(p.g.kernel.rowOf(T('r0'))?.data);
  });
});

export type { R };
