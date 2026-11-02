// Several conditions in a column's popup (Phase 9 F1; docs/behaviors/filter-combined.md, owner Q-F2 A).
// Expectations written by hand from the sheet.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { filters, FILTER_KEYS } from '../src/filters.js';
import { filters as filtersBase } from '../src/filters-base.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import { cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);

const COLS: ColumnOrGroup<R>[] = [
  { id: 'name', header: 'Name' },
  { id: 'n', header: 'N', type: 'number' },
];
const MORE = ['filter.conditionAdd', 'filter.conditionRemove', 'filter.joinLabel', 'filter.joinAnd', 'filter.joinOr', 'filter.matchCase', 'filter.conditionAdded', 'filter.conditionRemoved', 'filter.summaryConditions'];

function open(o: { options?: Record<string, unknown>; columns?: ColumnOrGroup<R>[]; server?: boolean; settings?: Record<string, unknown>; base?: boolean } = {}) {
  // The options as loose records: the tests also pass bad values (maxConditions 6) the types refuse.
  const feature = (o.base ? filtersBase : filters)({ ...o.options } as never);
  // A partial settings record (messages, locale, direction), as support-filters' own `settings`.
  const t = make({ columns: o.columns ?? COLS, features: [feature], server: o.server, settings: o.settings as never });
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  const q = <E extends Element = HTMLElement>(s: string) => popup()?.querySelector<E>(s) ?? null;
  const qa = <E extends Element = HTMLElement>(s: string) => [...(popup()?.querySelectorAll<E>(s) ?? [])];
  const rows = () => qa('.dzg-fcond');
  const row = (i: number) => rows()[i]!;
  const op = (i: number) => row(i).querySelector<HTMLSelectElement>('select.dzg-fop')!;
  const value = (i: number) => row(i).querySelector<HTMLInputElement>('input.dzg-fval')!;
  const to = (i: number) => row(i).querySelector<HTMLInputElement>('input.dzg-fto')!;
  const add = () => q<HTMLButtonElement>('button.dzg-fadd');
  const remove = (i: number) => row(i).querySelector<HTMLButtonElement>('button.dzg-frm');
  const join = () => q<HTMLElement>('.dzg-fjoin');
  const joins = () => qa<HTMLInputElement>('.dzg-fjoin input[type=radio]');
  const apply = () => q<HTMLButtonElement>('button.dzg-fapply')!;
  const fill = (i: HTMLInputElement, text: string) => {
    i.value = text;
    i.dispatchEvent(new InputEvent('input', { bubbles: true }));
  };
  const choose = (s: HTMLSelectElement, v: string) => {
    s.value = v;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const check = (r: HTMLInputElement) => {
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const hidden = (e: Element | null) => !e || !!e.closest('[hidden]');
  const filter = () => t.g.kernel.query.filter as Record<string, unknown>;
  // A host's filter of any shape, bad ones included (the popup's « Filter active »).
  const set = (column: string, f: unknown) => t.g.kernel.dispatch({ type: 'filter.column', column, filter: f as never }, 'api');
  return { ...t, feature, popup, q, qa, rows, row, op, value, to, add, remove, join, joins, apply, fill, choose, check, hidden, filter, set };
}
const said = (t: { live: { announce(s: string): void } }) => vi.spyOn(t.live, 'announce');

describe('off by default (owner Q-F2 A)', () => {
  it('no option: no add button, no join, no row wrapper — the popup is today’s', () => {
    const t = open();
    t.feature.openFilter('name');
    expect(t.add()).toBeNull();
    expect(t.join()).toBeNull();
    expect(t.rows()).toHaveLength(0);
    expect(t.q('select.dzg-fop')).not.toBeNull();
  });

  it('maxConditions 1 gives the very same popup as no option, node for node', () => {
    const a = open();
    a.feature.openFilter('name');
    const before = a.popup()!.innerHTML;
    cleanup();
    const b = open({ options: { maxConditions: 1 } });
    b.feature.openFilter('name');
    expect(b.popup()!.innerHTML).toBe(before);
  });

  it('the new texts are in every shipped bundle, and not required by filters()', () => {
    for (const k of MORE) {
      expect(FILTER_KEYS as readonly string[], k).not.toContain(k);
      for (const b of [EN_FILTERS, FR_FILTERS, AR_FILTERS]) expect((b.text as Record<string, unknown>)[k], `${b.locale} ${k}`).toBeDefined();
    }
    const text = { ...EN.text, ...EN_FILTERS.text } as Record<string, unknown>;
    for (const k of MORE) delete text[k];
    // Not asked for: a host bundle without them works as before.
    expect(() => open({ settings: { messages: { locale: 'en', text } } })).not.toThrow();
  });

  it('asked for without the texts: filters() throws naming them (as for its other keys)', () => {
    const text = { ...EN.text, ...EN_FILTERS.text } as Record<string, unknown>;
    delete text['filter.joinOr'];
    expect(() => open({ options: { maxConditions: 2 }, settings: { messages: { locale: 'en', text } } })).toThrow(/filters: missing filter\.joinOr/);
    cleanup();
    expect(() => open({ columns: [{ id: 'name', header: 'Name', filter: { matchCase: true } }], settings: { messages: { locale: 'en', text } } })).toThrow(/filter\.joinOr/);
  });
});

describe('adding and removing rows', () => {
  it('« Add condition » adds a row: the join shows (AND chosen), said once, focus on the new operator', () => {
    const t = open({ options: { maxConditions: 3 } });
    t.feature.openFilter('name');
    const s = said(t);
    expect(t.rows()).toHaveLength(1);
    expect(t.add()!.textContent).toBe('Add condition');
    expect(t.hidden(t.join())).toBe(true);
    expect(t.remove(0)).toBeNull();
    t.add()!.click();
    expect(t.rows()).toHaveLength(2);
    expect(t.hidden(t.join())).toBe(false);
    expect(t.join()!.getAttribute('role')).toBe('radiogroup');
    expect(t.join()!.getAttribute('aria-label')).toBe('Join the conditions');
    expect(t.joins().map((r) => r.checked)).toEqual([true, false]);
    expect(t.joins().map((r) => r.closest('label')!.textContent)).toEqual(['All (AND)', 'Any (OR)']);
    // The join sits before the second row.
    expect(t.join()!.compareDocumentPosition(t.row(1)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(t.row(0).compareDocumentPosition(t.join()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.activeElement).toBe(t.op(1));
    expect(s.mock.calls.map((c) => c[0])).toEqual(['Condition 2 added']);
    expect(t.remove(1)!.getAttribute('aria-label')).toBe('Remove condition 2');
    expect(t.remove(1)!.textContent).toBe('Remove condition');
  });

  it('one operator offered: focus on the new row’s value', () => {
    const t = open({ options: { maxConditions: 3 }, columns: [{ id: 'name', header: 'Name', filter: { ops: ['contains'] } }] });
    t.feature.openFilter('name');
    t.add()!.click();
    expect(document.activeElement).toBe(t.value(1));
  });

  it('stops at the cap: the button hidden at 3 rows, back after a removal', () => {
    const t = open({ options: { maxConditions: 3 } });
    t.feature.openFilter('name');
    t.add()!.click();
    t.add()!.click();
    expect(t.rows()).toHaveLength(3);
    expect(t.hidden(t.add())).toBe(true);
    t.remove(2)!.click();
    expect(t.hidden(t.add())).toBe(false);
  });

  it('five is the most: 5 accepted, 6 is the default (1) with one warning', () => {
    const t = open({ options: { maxConditions: 5 } });
    t.feature.openFilter('name');
    for (let i = 0; i < 4; i++) t.add()!.click();
    expect(t.rows()).toHaveLength(5);
    expect(t.hidden(t.add())).toBe(true);
    cleanup();
    const u = open({ options: { maxConditions: 6 } });
    u.feature.openFilter('name');
    expect(u.add()).toBeNull();
    expect(u.problems()).toEqual([{ code: 'invalid-setting', severity: 'warning', path: 'features.filters.maxConditions', detail: '6' }]);
  });

  it('a column’s maxConditions wins over the grid’s; a bad one is ignored (the grid’s applies), told at each opening', () => {
    const t = open({ options: { maxConditions: 4 }, columns: [{ id: 'name', header: 'Name', filter: { maxConditions: 2 } }, { id: 'n', header: 'N', type: 'number', filter: { maxConditions: 0 } }, { id: 'm', header: 'M', type: 'number', filter: { maxConditions: 1 } }] });
    t.feature.openFilter('name');
    t.add()!.click();
    expect(t.hidden(t.add())).toBe(true);
    t.feature.closeFilter();
    t.feature.openFilter('m');
    expect(t.add()).toBeNull();
    t.feature.closeFilter();
    t.feature.openFilter('n');
    for (let i = 0; i < 3; i++) t.add()!.click();
    expect(t.rows()).toHaveLength(4);
    t.feature.closeFilter();
    t.feature.openFilter('n');
    const w = { code: 'invalid-column', severity: 'warning', path: 'columns.n.filter.maxConditions', detail: '0' };
    expect(t.problems()).toEqual([w, w]);
  });

  it('removing: said once, focus on the row before’s value; the filter follows', () => {
    vi.useFakeTimers();
    const t = open({ options: { maxConditions: 3 } });
    t.feature.openFilter('name');
    t.fill(t.value(0), 'ann');
    t.add()!.click();
    t.fill(t.value(1), 'bob1');
    vi.advanceTimersByTime(150);
    expect(t.filter()['name']).toEqual({ type: 'combined', join: 'and', conditions: [{ type: 'text', op: 'contains', value: 'ann' }, { type: 'text', op: 'contains', value: 'bob1' }] });
    const s = said(t);
    t.remove(1)!.click();
    // Said once, before the new count (`announce.filtered`, the filter changed at once).
    expect(s.mock.calls.map((c) => c[0]).filter((x) => x.startsWith('Condition'))).toEqual(['Condition 2 removed']);
    expect(s.mock.calls[0]![0]).toBe('Condition 2 removed');
    expect(document.activeElement).toBe(t.value(0));
    expect(t.rows()).toHaveLength(1);
    expect(t.hidden(t.join())).toBe(true);
    // A removal is a choice: at once, the one row left stored plain.
    expect(t.filter()['name']).toEqual({ type: 'text', op: 'contains', value: 'ann' });
  });

  it('removing a middle row renames the rows after it', () => {
    const t = open({ options: { maxConditions: 3 } });
    t.feature.openFilter('name');
    t.add()!.click();
    t.add()!.click();
    t.remove(1)!.click();
    expect(t.remove(1)!.getAttribute('aria-label')).toBe('Remove condition 2');
  });
});

describe('what is stored', () => {
  it('OR chosen: applied at once as a combined OR; back to AND', () => {
    vi.useFakeTimers();
    const t = open({ options: { maxConditions: 2 } });
    t.feature.openFilter('name');
    t.fill(t.value(0), 'ann');
    t.add()!.click();
    t.fill(t.value(1), 'bob1');
    vi.advanceTimersByTime(150);
    t.check(t.joins()[1]!);
    expect(t.filter()['name']).toEqual({ type: 'combined', join: 'or', conditions: [{ type: 'text', op: 'contains', value: 'ann' }, { type: 'text', op: 'contains', value: 'bob1' }] });
    // ann0, ann3 … and bob1, bob10 … bob19.
    expect(t.ids()).toEqual(['r0', 'r1', 'r3', 'r6', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15', 'r16', 'r17', 'r18', 'r19', 'r21', 'r24', 'r27']);
    t.check(t.joins()[0]!);
    expect((t.filter()['name'] as { join: string }).join).toBe('and');
  });

  it('a row that cannot filter yet is left out (L1 per row); one live row is stored plain', () => {
    vi.useFakeTimers();
    const t = open({ options: { maxConditions: 3 } });
    t.feature.openFilter('n');
    t.choose(t.op(0), 'gt');
    t.fill(t.value(0), '3');
    t.add()!.click();
    t.choose(t.op(1), 'between');
    t.fill(t.value(1), '1');
    vi.advanceTimersByTime(150);
    expect(t.filter()['n']).toEqual({ type: 'number', op: 'gt', value: 3 });
  });

  it('between and not-equal joined by AND, numbers read in the locale', () => {
    vi.useFakeTimers();
    const t = open({ options: { maxConditions: 2 }, settings: { messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } }, locale: 'fr-FR' } });
    t.feature.openFilter('n');
    t.choose(t.op(0), 'between');
    t.fill(t.value(0), '2,5');
    t.fill(t.to(0), '11');
    t.add()!.click();
    t.choose(t.op(1), 'notEqual');
    t.fill(t.value(1), '5');
    vi.advanceTimersByTime(150);
    expect(t.filter()['n']).toEqual({ type: 'combined', join: 'and', conditions: [{ type: 'number', op: 'between', value: 2.5, valueTo: 11 }, { type: 'number', op: 'notEqual', value: 5 }] });
    expect(t.ids()).toEqual(['r3', 'r4', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11']);
  });

  it('a number that does not read in any row keeps the whole draft: marked, said once, focused at Apply', () => {
    const t = open({ options: { maxConditions: 2, apply: 'button' } });
    t.feature.openFilter('n');
    t.fill(t.value(0), '3');
    t.add()!.click();
    t.fill(t.value(1), 'zz');
    const s = said(t);
    t.apply().click();
    expect(t.filter()['n']).toBeUndefined();
    expect(t.value(1).getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(t.value(1));
    expect(s).toHaveBeenCalledTimes(1);
    expect(t.popup()).not.toBeNull();
  });

  it('on a server: nothing asked while typing, one request at Apply carrying the combined', () => {
    vi.useFakeTimers();
    const t = open({ options: { maxConditions: 2 }, server: true });
    t.f.answer(['a', 'b']);
    t.feature.openFilter('name');
    const before = t.f.calls.length;
    t.fill(t.value(0), 'ann');
    t.add()!.click();
    t.fill(t.value(1), 'bob');
    t.check(t.joins()[1]!);
    vi.advanceTimersByTime(1000);
    expect(t.f.calls.length).toBe(before);
    t.apply().click();
    expect(t.f.calls.length).toBe(before + 1);
    expect(t.f.calls.at(-1)!.req.filter).toEqual({ name: { type: 'combined', join: 'or', conditions: [{ type: 'text', op: 'contains', value: 'ann' }, { type: 'text', op: 'contains', value: 'bob' }] } });
  });

  it('Clear empties every row back to one', () => {
    const t = open({ options: { maxConditions: 3 } });
    t.set('name', { type: 'combined', join: 'or', conditions: [{ type: 'text', op: 'equals', value: 'a' }, { type: 'text', op: 'equals', value: 'b' }] });
    t.feature.openFilter('name');
    expect(t.rows()).toHaveLength(2);
    t.q<HTMLButtonElement>('button.dzg-fclr')!.click();
    expect(t.rows()).toHaveLength(1);
    expect(t.value(0).value).toBe('');
    expect(t.filter()['name']).toBeUndefined();
  });
});

describe('what it shows', () => {
  it('a flat combined from the host: its rows, its join, its values', () => {
    const t = open({ options: { maxConditions: 3 } });
    t.set('name', { type: 'combined', join: 'or', conditions: [{ type: 'text', op: 'equals', value: 'a' }, { type: 'text', op: 'startsWith', value: 'b' }] });
    t.feature.openFilter('name');
    expect(t.rows()).toHaveLength(2);
    expect([t.op(0).value, t.value(0).value, t.op(1).value, t.value(1).value]).toEqual(['equals', 'a', 'startsWith', 'b']);
    expect(t.joins().map((r) => r.checked)).toEqual([false, true]);
  });

  it('nested, mixed kinds, or more rows than allowed: « Filter active »', () => {
    const c = (v: string) => ({ type: 'text', op: 'equals', value: v });
    for (const f of [
      { type: 'combined', join: 'and', conditions: [c('a'), { type: 'combined', join: 'or', conditions: [c('b'), c('c')] }] },
      { type: 'combined', join: 'and', conditions: [c('a'), { type: 'set', include: ['x'] }] },
      { type: 'combined', join: 'and', conditions: [c('a'), c('b'), c('c')] },
    ]) {
      const t = open({ options: { maxConditions: 2 } });
      t.set('name', f);
      t.feature.openFilter('name');
      expect(t.q('.dzg-fsum')?.textContent, JSON.stringify(f)).toBe('Filter active');
      expect(t.rows()).toHaveLength(0);
      cleanup();
    }
  });

  it('echo: a filter set elsewhere rewrites rows not being edited', () => {
    const t = open({ options: { maxConditions: 3 } });
    t.feature.openFilter('name');
    t.set('name', { type: 'combined', join: 'or', conditions: [{ type: 'text', op: 'contains', value: 'x' }, { type: 'text', op: 'contains', value: 'y' }] });
    expect(t.rows()).toHaveLength(2);
    expect(t.value(1).value).toBe('y');
    t.set('name', { type: 'text', op: 'contains', value: 'z' });
    expect(t.rows()).toHaveLength(1);
    expect(t.value(0).value).toBe('z');
  });

  it('the shared code: filters-base does the same', () => {
    const t = open({ options: { maxConditions: 2 }, base: true });
    t.feature.openFilter('name');
    t.add()!.click();
    expect(t.rows()).toHaveLength(2);
  });
});

describe('keys', () => {
  it('Shift+Tab on the join is the browser’s (only a first radio group wraps to Apply)', () => {
    const t = open({ options: { maxConditions: 2 } });
    t.feature.openFilter('name');
    t.add()!.click();
    const r = t.joins()[0]!;
    r.focus();
    expect(t.key(r, 'Tab', { shiftKey: true }).defaultPrevented).toBe(false);
  });

  it('Enter in a second row’s value applies and closes', () => {
    const t = open({ options: { maxConditions: 2, apply: 'button' } });
    t.feature.openFilter('name');
    t.fill(t.value(0), 'ann');
    t.add()!.click();
    t.fill(t.value(1), '1');
    t.key(t.value(1), 'Enter');
    expect(t.filter()['name']).toEqual({ type: 'combined', join: 'and', conditions: [{ type: 'text', op: 'contains', value: 'ann' }, { type: 'text', op: 'contains', value: '1' }] });
    expect(t.popup()).toBeNull();
  });

  it('right to left: the popup in the grid’s direction, the rows and the join in reading order', () => {
    const t = open({ options: { maxConditions: 2 }, settings: { messages: { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } }, locale: 'ar-DZ', direction: 'rtl' } });
    t.feature.openFilter('name');
    t.add()!.click();
    expect(t.popup()!.getAttribute('dir')).toBe('rtl');
    const order = [...t.popup()!.querySelectorAll('.dzg-fcond, .dzg-fjoin, .dzg-fadd')].map((e) => e.className.split(' ')[0]);
    expect(order).toEqual(['dzg-fcond', 'dzg-fjoin', 'dzg-fcond', 'dzg-fadd']);
    expect(t.add()!.textContent).toBe(AR_FILTERS.text['filter.conditionAdd']);
  });
});

describe('the floating row', () => {
  const cs = (n: number) => ({ type: 'combined', join: 'or', conditions: Array.from({ length: n }, (_, i) => ({ type: 'text', op: 'equals', value: `v${i}` })) });

  it('a flat combined says how many conditions, still a button opening the popup', () => {
    const t = open({ options: { maxConditions: 2, floating: true } });
    t.set('name', cs(2));
    const sum = t.cell('name').querySelector<HTMLElement>('.dzg-fsum')!;
    expect(sum.textContent).toBe('2 conditions');
    expect(sum.tagName).toBe('BUTTON');
    sum.click();
    expect(t.popup()).not.toBeNull();
  });

  it('Arabic plural forms: 2, 3 and 11 read differently', () => {
    const t = open({ options: { floating: true }, settings: { messages: { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } }, locale: 'ar-DZ' } });
    const read = (n: number) => (t.set('name', cs(n)), t.cell('name').querySelector('.dzg-fsum')!.textContent);
    const [two, three, eleven] = [read(2), read(3), read(11)];
    expect(two).toBe('شرطان');
    expect(three).toBe('3 شروط');
    expect(eleven).toBe('11 شرطًا');
  });

  it('a combined holding a value list, or nested: « Filter active »; a bundle without the text: « Filter active »', () => {
    const t = open({ options: { floating: true } });
    t.set('name', { type: 'combined', join: 'and', conditions: [{ type: 'text', op: 'equals', value: 'a' }, { type: 'set', include: ['x'] }] });
    expect(t.cell('name').querySelector('.dzg-fsum')!.textContent).toBe('Filter active');
    cleanup();
    const text = { ...EN.text, ...EN_FILTERS.text } as Record<string, unknown>;
    delete text['filter.summaryConditions'];
    const u = open({ options: { floating: true }, settings: { messages: { locale: 'en', text } } });
    u.set('name', cs(2));
    expect(u.cell('name').querySelector('.dzg-fsum')!.textContent).toBe('Filter active');
  });
});
