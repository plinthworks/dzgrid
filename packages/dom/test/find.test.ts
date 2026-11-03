// Find in the grid (Phase 9, docs/behaviors/find.md; owner answers, decisions.md « Find in grid — owner answers
// (2026-11-03) »): Ctrl/Cmd+F opens the grid's bar only inside the grid and only with the feature; the displayed text of
// the visible columns, case and accents ignored; every hit marked, the current one more; « 3 / 12 », ↑ ↓, Enter /
// Shift+Enter, Escape; the current hit scrolled to and focused as the grid's cell; kept up to date; a closed tree node's
// rows searched and opened; a server's loaded page only; said politely after the pause. Expectations written by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { RowKey } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import { find, type FindFeature } from '../src/find.js';
import { tree } from '../src/tree.js';
import { EN } from '../src/locales/en.js';
import { EN_FIND } from '../src/locales/en-find.js';
import { FR } from '../src/locales/fr.js';
import { FR_FIND } from '../src/locales/fr-find.js';
import { AR } from '../src/locales/ar.js';
import { AR_FIND } from '../src/locales/ar-find.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { cleanup, idOf, join, k, rmake, WIDE, type R, type RMake } from './support-range.js';

afterEach(() => cleanup());

const MSG = { en: join(EN, EN_FIND), fr: join(FR, FR_FIND), ar: join(AR, AR_FIND) } as const;
/** 30 rows: « Name 0 » … « Name 29 », `s` « s0 » … « s6 ». */
const rows30 = (): R[] => Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: `Name ${i}`, n: i, s: `s${i % 7}`, q: i }));

function fmake(o: Omit<RMake, 'features'> & { find?: Parameters<typeof find>[0]; withFind?: boolean; tree?: boolean } = {}) {
  const f: FindFeature = find(o.find);
  const t = rmake({
    rows: o.rows ?? rows30(), ...o,
    messages: o.messages ?? (o.tree ? join(EN, EN_FIND, EN_TREE) : MSG[o.lang ?? 'en']),
    features: () => [...(o.tree ? [tree<R>({ parentId: (x) => x.parent ?? null })] : []), ...(o.withFind === false ? [] : [f])],
  });
  const bar = () => t.ctx.el.root.querySelector<HTMLElement>(':scope > .dzg-find');
  const input = () => bar()?.querySelector<HTMLInputElement>('input') ?? null;
  const count = () => bar()?.querySelector<HTMLElement>('.dzg-find-count')?.textContent ?? null;
  const btn = (n: 'prev' | 'next' | 'close') => bar()!.querySelector<HTMLButtonElement>(`button[data-find="${n}"]`)!;
  /** Every mounted cell carrying a find mark, `row/col` (`*` for the current hit), sorted. */
  const marks = () => [...t.ctx.el.layer.querySelectorAll<HTMLElement>('.dzg-cell[data-dzg-find]')].map((c) => `${idOf(t.ctx.rowRenderer.keyOf(c.closest('.dzg-row')!))}/${c.dataset['col']}${c.dataset['dzgFind'] === 'current' ? '*' : ''}`).sort();
  /** Types into the field as a user does (an input event per change); `wait`: the pause after it. */
  const type = (s: string, wait = 200) => {
    const i = input()!;
    i.value = s;
    i.dispatchEvent(new InputEvent('input', { bubbles: true }));
    if (wait) vi.advanceTimersByTime(wait);
  };
  const focusOf = () => {
    const f = t.g.kernel.focus;
    return f?.kind === 'cell' ? `${idOf(f.row)}/${f.column}` : null;
  };
  const ctrlF = (at: Element, mods: KeyboardEventInit = { ctrlKey: true }) => t.press('f', mods, at);
  const api = () => f.api(t.g)!;
  return { ...t, f, bar, input, count, btn, marks, type, focusOf, ctrlF, api };
}

describe('the key (find.md 1–3)', () => {
  it('without the feature, Ctrl+F on a cell is the browser\'s (not prevented, no bar)', () => {
    const t = fmake({ withFind: false });
    t.focus('r1');
    t.cell('r1')!.focus();
    expect(t.ctrlF(t.cell('r1')!).defaultPrevented).toBe(false);
    expect(t.bar()).toBeNull();
  });

  it('with it, Ctrl+F on a cell opens the bar above the headers, outside role=grid, the field focused and labelled', () => {
    const t = fmake();
    t.focus('r1');
    t.cell('r1')!.focus();
    expect(t.ctrlF(t.cell('r1')!).defaultPrevented).toBe(true);
    const bar = t.bar()!;
    expect(bar.hidden).toBe(false);
    expect(bar.nextElementSibling).toBe(t.vp);
    expect(bar.closest('[role=grid]')).toBeNull();
    expect(bar.getAttribute('role')).toBe('search');
    expect(document.activeElement).toBe(t.input());
    expect(t.input()!.getAttribute('aria-label')).toBe('Find in the grid');
    expect((['prev', 'next', 'close'] as const).map((n) => t.btn(n).getAttribute('aria-label'))).toEqual(['Previous result', 'Next result', 'Close find']);
  });

  it('outside the grid the browser keeps it; Alt or Shift with it too; on a Mac ⌘F, not Ctrl+F', () => {
    const t = fmake();
    const out = document.body.appendChild(document.createElement('input'));
    out.focus();
    expect(t.ctrlF(out).defaultPrevented).toBe(false);
    t.focus('r1');
    t.cell('r1')!.focus();
    expect(t.ctrlF(t.cell('r1')!, { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(t.ctrlF(t.cell('r1')!, { ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(t.bar()?.hidden ?? true).toBe(true);
    cleanup();
    const m = fmake({ mac: true });
    m.focus('r1');
    m.cell('r1')!.focus();
    expect(m.ctrlF(m.cell('r1')!).defaultPrevented).toBe(false);
    expect(m.ctrlF(m.cell('r1')!, { metaKey: true }).defaultPrevented).toBe(true);
  });

  it('a header focused opens it too; pressed again in the field, its text selected', () => {
    vi.useFakeTimers();
    const t = fmake();
    const h = t.ctx.el.header.querySelector<HTMLElement>('.dzg-hcell[data-col="s"]')!;
    t.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 's' } }, 'api');
    h.focus();
    expect(t.ctrlF(h).defaultPrevented).toBe(true);
    t.type('name');
    t.input()!.setSelectionRange(4, 4);
    expect(t.ctrlF(t.input()!).defaultPrevented).toBe(true);
    expect([t.input()!.selectionStart, t.input()!.selectionEnd]).toEqual([0, 4]);
  });

  it('missing texts: the setup names them', () => {
    expect(() => fmake({ messages: join(EN) })).toThrow(/find\.label.*find\.page/);
  });
});

describe('searching (find.md 4–5, 7–8, 10)', () => {
  it('« name 2 » after the pause: Name 2 and Name 20–29, 11 hits, case ignored; nothing before the pause; no row hidden', () => {
    vi.useFakeTimers();
    const t = fmake();
    t.api().open();
    t.type('name 2', 100);
    expect(t.count()).toBe('');
    expect(t.marks()).toEqual([]);
    vi.advanceTimersByTime(60);
    expect(t.count()).toBe('1 / 11');
    expect(t.g.kernel.rows.displayed.count).toBe(30);
    expect(t.api().state().count).toBe(11);
    // The view shows r0–r9 (320 px of 32 px rows): Name 2 is the current hit, nothing else of the 11 is mounted besides r20–… out of view.
    expect(t.marks().filter((m) => m.startsWith('r2/'))).toEqual(['r2/name*']);
  });

  it('accents and case folded both ways; only the visible columns; spaces inside kept', () => {
    vi.useFakeTimers();
    const rows: R[] = [{ id: 'a', name: 'Été', n: 1, s: 'x', q: 1 }, { id: 'b', name: 'ete', n: 2, s: 'ÉTÉ', q: 2 }, { id: 'c', name: 'e te', n: 3, s: 'y', q: 3 }];
    const t = fmake({ rows });
    t.api().open('ete');
    expect(t.marks()).toEqual(['a/name*', 'b/name', 'b/s']);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 's', hidden: true }] }, 'api');
    expect(t.marks()).toEqual(['a/name*', 'b/name']);
    t.api().open('e te');
    expect(t.marks()).toEqual(['c/name*']);
    t.api().open('ÉTÉ');
    expect(t.marks()).toEqual(['a/name*', 'b/name']);
    // A cell holding the text twice is one hit.
    t.api().open('e');
    expect(t.api().state().count).toBe(3);
  });

  it('the displayed text: a number column by its format', () => {
    const rows: R[] = [{ id: 'a', name: 'x', n: 1234.5, s: 'x', q: 1 }];
    const t = fmake({ rows, columns: [{ id: 'name' }, { id: 'n', type: 'number', numberFormat: { minimumFractionDigits: 2 } }] as never, settings: { locale: 'fr-FR' } }); // two columns, a format by hand
    t.api().open('234,50');
    expect(t.marks()).toEqual(['a/n*']);
  });

  it('nothing found: « No results »; an empty field: no count, no mark', () => {
    vi.useFakeTimers();
    const t = fmake();
    t.api().open();
    t.type('zzz');
    expect(t.count()).toBe('No results');
    t.type('');
    expect(t.count()).toBe('');
    expect(t.api().state()).toMatchObject({ count: 0, index: -1, current: null });
  });

  it('the first hit is the first at or after the grid\'s focused cell', () => {
    const t = fmake();
    t.focus('r21');
    t.api().open('name 2');
    expect(t.focusOf()).toBe('r21/name');
    expect(t.count()).toBe('3 / 11');
  });
});

describe('walking (find.md 9)', () => {
  it('Enter and ↓ next, Shift+Enter and ↑ previous, wrapping; the hit is the grid\'s focused cell, the typing focus stays', () => {
    const t = fmake();
    t.api().open('name 2');
    expect(t.focusOf()).toBe('r2/name');
    t.press('Enter', {}, t.input()!);
    expect([t.focusOf(), t.count()]).toEqual(['r20/name', '2 / 11']);
    expect(document.activeElement).toBe(t.input());
    t.btn('next').click();
    expect(t.focusOf()).toBe('r21/name');
    t.press('Enter', { shiftKey: true }, t.input()!);
    t.btn('prev').click();
    t.btn('prev').click();
    expect([t.focusOf(), t.count()]).toEqual(['r29/name', '11 / 11']);
    t.press('Enter', {}, t.input()!);
    expect(t.count()).toBe('1 / 11');
  });

  it('marks: every mounted hit, the current one apart', () => {
    const t = fmake({ block: 2000 });
    t.api().open('name 2');
    t.api().next();
    expect(t.marks()).toEqual(['r2/name', 'r20/name*', ...Array.from({ length: 9 }, (_, i) => `r2${i + 1}/name`)].sort());
  });

  it('the current hit scrolled into view, rows and columns', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ id: `r${i}`, name: '', n: i, s: '', q: 0 }));
    const t = fmake({ rows, columns: WIDE });
    t.api().open('r180.9');
    expect(t.focusOf()).toBe('r180/c9');
    expect(t.box.scrollTop).toBeGreaterThan(150 * t.h());
    expect(t.box.scrollInline).toBeGreaterThan(0);
    expect(t.cell('r180', 'c9')?.dataset['dzgFind']).toBe('current');
  });

  it('said politely after the pause: « 1 of 11 », walking « 2 of 11 »; « No results »; in French « 1 sur 11 »', () => {
    vi.useFakeTimers();
    const t = fmake();
    t.api().open();
    t.type('name 2');
    t.press('Enter', {}, t.input()!);
    t.type('zzz');
    expect(t.said()).toEqual(['1 of 11', '2 of 11', 'No results']);
    cleanup();
    vi.useFakeTimers();
    const f = fmake({ lang: 'fr' });
    f.api().open();
    f.type('name 2');
    expect(f.said()).toEqual(['1 sur 11']);
    expect(f.count()).toBe('1 / 11');
  });

  it('Enter while the pause runs: the text applied at once (its first hit), no extra step', () => {
    vi.useFakeTimers();
    const t = fmake();
    t.api().open();
    t.type('name 2', 0);
    t.press('Enter', {}, t.input()!);
    expect(t.focusOf()).toBe('r2/name');
    vi.advanceTimersByTime(500);
    expect(t.focusOf()).toBe('r2/name');
  });
});

describe('closing (find.md 12)', () => {
  it('Escape: the bar hidden, every mark gone, the focus back on the grid\'s cell (the last hit)', () => {
    const t = fmake();
    t.focus('r0');
    t.cell('r0')!.focus();
    t.ctrlF(t.cell('r0')!);
    t.api().open('name 2');
    t.api().next();
    const e = t.press('Escape', {}, t.input()!);
    expect(e.defaultPrevented).toBe(true);
    expect(t.bar()!.hidden).toBe(true);
    expect(t.marks()).toEqual([]);
    expect(document.activeElement).toBe(t.cell('r20'));
    expect(t.api().state()).toMatchObject({ open: false, count: 0 });
  });

  it('closed: a row put aside while marked and shown again later carries no mark', () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, name: `Name ${i}`, n: i, s: '', q: 0 }));
    const t = fmake({ rows });
    t.api().open('name');
    t.scroll(200 * t.h());
    t.api().close();
    t.scroll(0);
    t.scroll(100 * t.h());
    expect(t.host.querySelectorAll('[data-dzg-find]').length).toBe(0);
  });

  it('the × button closes too; opened again, the last text is kept and selected', () => {
    const t = fmake();
    t.api().open('name 2');
    t.btn('close').click();
    expect(t.bar()!.hidden).toBe(true);
    t.focus('r0');
    t.cell('r0')!.focus();
    t.ctrlF(t.cell('r0')!);
    expect(t.input()!.value).toBe('name 2');
    expect([t.input()!.selectionStart, t.input()!.selectionEnd]).toEqual([0, 6]);
    expect(t.count()).toBe('1 / 11');
  });

  it('destroyed with the grid: the bar removed', () => {
    const t = fmake();
    t.api().open('x');
    t.g.destroy();
    expect(t.bar()).toBeNull();
    expect(t.f.api(t.g)).toBeNull();
  });
});

describe('kept up to date (find.md 11)', () => {
  it('new data, a sort, the quick search, a column moved: found again, the current hit kept when it still is one', () => {
    const t = fmake();
    t.api().open('name 2');
    t.api().next();
    t.api().next();
    expect(t.focusOf()).toBe('r21/name');
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'api');
    expect([t.focusOf(), t.count()]).toEqual(['r21/name', '9 / 11']);
    t.g.kernel.dispatch({ type: 'quick.set', text: 'name 2' }, 'api');
    expect(t.count()).toBe('9 / 11');
    // r3's S now « NAME 2! »: one more hit, after r20 in the descending order; the current one the same cell.
    t.g.update({ rows: rows30().map((r) => (r.id === 'r3' ? { ...r, s: 'NAME 2!' } : r)) });
    expect([t.api().state().count, t.count()]).toEqual([12, '9 / 12']);
    t.g.kernel.dispatch({ type: 'quick.set', text: '' }, 'api');
    expect(t.api().state().count).toBe(12);
    expect(t.api().state().current).toEqual({ row: k('r21'), column: 'name' });
  });

  it('the current hit gone: the hit now at its place', () => {
    const t = fmake();
    t.api().open('name 2');
    t.api().next();
    t.g.update({ rows: rows30().filter((r) => r.id !== 'r20') });
    expect([t.api().state().count, t.count()]).toEqual([10, '2 / 10']);
  });
});

describe('a tree (find.md 6)', () => {
  const rows: R[] = [
    { id: 'A', name: 'Alpha', n: 0, s: '', q: 0, parent: null },
    { id: 'A1', name: 'Bravo one', n: 1, s: '', q: 0, parent: 'A' },
    { id: 'A11', name: 'Bravo deep', n: 2, s: '', q: 0, parent: 'A1' },
    { id: 'B', name: 'Bravo', n: 3, s: '', q: 0, parent: null },
  ];
  it('closed nodes searched in their order; going to a hit inside opens its ancestors, as the api, nothing said for it', () => {
    const t = fmake({ rows, tree: true });
    expect(t.g.kernel.rows.displayed.count).toBe(2);
    t.api().open('bravo');
    expect(t.count()).toBe('1 / 3');
    expect(t.focusOf()).toBe('A1/name');
    expect(t.g.kernel.rows.displayed.count).toBe(3);
    t.api().next();
    expect(t.focusOf()).toBe('A11/name');
    expect(t.g.kernel.rows.displayed.count).toBe(4);
    t.api().next();
    expect(t.focusOf()).toBe('B/name');
    const opened = t.events.filter((e) => e.type === 'rowExpanded') as { source: string; rows: readonly RowKey[] }[];
    expect(opened.map((e) => [e.source, e.rows.map(idOf)])).toEqual([['api', ['A']], ['api', ['A1']]]);
    expect(t.said().filter((s) => /expanded/i.test(s))).toEqual([]);
  });
});

describe('a server (find.md 8)', () => {
  it('the loaded page only, and the bar says so', async () => {
    const source: DataSource<R> = { fetch: async () => ({ rows: rows30().slice(0, 10), total: 30 }) };
    const t = fmake({ rows: undefined, settings: { source: sourceRows(source), operations: 'server', pagination: { pageSize: 10 } } as never }); // a server's settings, typed by the grid
    await vi.waitFor(() => expect(t.g.kernel.rows.displayed.count).toBe(10));
    t.api().open('name 2');
    expect(t.api().state().count).toBe(1);
    expect(t.bar()!.querySelector('.dzg-find-note')!.textContent).toBe('Loaded page only');
  });

  it('in the browser, no such note', () => {
    const t = fmake();
    t.api().open('x');
    expect(t.bar()!.querySelector<HTMLElement>('.dzg-find-note')?.hidden ?? true).toBe(true);
  });
});

describe('right to left (find.md 14)', () => {
  it('the bar in the grid\'s direction, its texts in Arabic', () => {
    const t = fmake({ lang: 'ar' });
    t.api().open('name 2');
    expect(t.bar()!.closest('[dir]')!.getAttribute('dir')).toBe('rtl');
    expect(t.input()!.getAttribute('aria-label')).toBe('البحث في الجدول');
    expect(t.input()!.getAttribute('dir')).toBe('auto');
  });
});
