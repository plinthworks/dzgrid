// The set filter's list with 2 000 values: windowing and the keyboard (step 15;
// docs/behaviors/filter-set.md "Always windowed", "Keys"; WAI-ARIA listbox pattern).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import { cleanup, type R } from './support-filters.js';
import { grid } from './support-set.js';

afterEach(cleanup);

type Row = R & { city: string | null; st: string };
/** 1 995 `v0000`… plus five words for the type-ahead: 2 000 values, sorted école, Élan, v…, وهران, … */
const WORDS = ['école', 'Élan', 'Zèbre', 'وهران', 'الجزائر'];
const VALUES = [...Array.from({ length: 1995 }, (_, i) => `v${String(i).padStart(4, '0')}`), ...WORDS];
const ROWS: Row[] = VALUES.map((v, i) => ({ id: `r${i}`, name: 'x', n: i, city: v, st: 'a' }));
const COLS: ColumnOrGroup<Row>[] = [{ id: 'city', header: 'City', filter: { kind: 'set' } }];

const big = async (o: { settings?: Record<string, unknown>; server?: boolean } = {}) => {
  const t = grid({ rows: ROWS, columns: COLS, ...o });
  await t.open();
  return t;
};
const active = () => document.activeElement as HTMLElement;
const pos = (e: Element = active()) => Number(e.getAttribute('aria-posinset'));
const name = (e: Element = active()) => e.querySelector('.dzg-fname')!.textContent;

describe('windowing', () => {
  it('draws at most 40 options, each with its place in the whole list', async () => {
    const t = await big();
    const drawn = [...t.list().querySelectorAll('[role=option]')];
    expect(drawn.length).toBeGreaterThan(5);
    expect(drawn.length).toBeLessThanOrEqual(40);
    for (const o of drawn) expect(o.getAttribute('aria-setsize')).toBe('2000');
    expect(drawn.map((o) => pos(o)).sort((a, b) => a - b)[0]).toBe(1);
    expect(t.list().querySelector('[aria-hidden=true]')).not.toBeNull();
  });

  it('a scrolled list draws the rows in view; the posinset follows the index', async () => {
    const t = await big();
    const h = t.options()[0]!.offsetHeight || 28;
    t.list().scrollTop = 1000 * h;
    t.list().dispatchEvent(new Event('scroll'));
    const drawn = t.options();
    expect(drawn.length).toBeLessThanOrEqual(40);
    expect(drawn.some((o) => pos(o) === 1001)).toBe(true);
    expect(name(drawn.find((o) => pos(o) === 1001)!)).toBe(t.labels()[drawn.findIndex((o) => pos(o) === 1001)]);
  });

  it('the focused option is kept while scrolled far away, and still focused', async () => {
    const t = await big();
    t.list().querySelector<HTMLElement>('[tabindex="0"]')!.focus();
    const was = active();
    t.list().scrollTop = 1800 * 28;
    t.list().dispatchEvent(new Event('scroll'));
    expect(was.isConnected).toBe(true);
    expect(active()).toBe(was);
    expect(t.options().length).toBeLessThanOrEqual(41);
    t.press('ArrowDown');
    expect(pos()).toBe(2);
  });
});

describe('keys on the list', () => {
  it('one tab stop: exactly one option with tabindex 0, the first when nothing is ticked differently', async () => {
    const t = await big();
    expect(t.list().querySelectorAll('[role=option][tabindex="0"]')).toHaveLength(1);
    expect(pos(t.list().querySelector('[tabindex="0"]')!)).toBe(1);
  });

  it('starts on the first ticked value', async () => {
    const t = grid({ rows: ROWS, columns: COLS });
    t.set('city', { type: 'set', include: ['v0500'] });
    await t.open();
    expect(name(t.list().querySelector('[tabindex="0"]')!)).toBe('v0500');
  });

  it('Down, Up (no wrap), Home, End, Ctrl+Home, Ctrl+End', async () => {
    const t = await big();
    t.search().focus();
    t.press('ArrowDown');
    expect(pos()).toBe(1);
    t.press('ArrowUp');
    expect(pos()).toBe(1);
    t.press('ArrowDown');
    t.press('ArrowDown');
    expect(pos()).toBe(3);
    t.press('End');
    expect(pos()).toBe(2000);
    expect(active().getAttribute('role')).toBe('option');
    t.press('ArrowDown');
    expect(pos()).toBe(2000);
    t.press('Home');
    expect(pos()).toBe(1);
    t.press('End', { ctrlKey: true });
    expect(pos()).toBe(2000);
    t.press('Home', { ctrlKey: true });
    expect(pos()).toBe(1);
    expect(t.list().querySelectorAll('[role=option][tabindex="0"]')).toHaveLength(1);
  });

  it('PageDown and PageUp move by a view less one row (10 rows in view here)', async () => {
    const t = await big();
    t.search().focus();
    t.press('ArrowDown');
    t.press('PageDown');
    expect(pos()).toBe(10);
    t.press('PageDown');
    expect(pos()).toBe(19);
    t.press('PageUp');
    expect(pos()).toBe(10);
    t.press('PageUp');
    t.press('PageUp');
    expect(pos()).toBe(1);
  });

  it('a full walk with PageDown reaches the last value', async () => {
    const t = await big();
    t.search().focus();
    t.press('ArrowDown');
    for (let i = 0; i < 300 && pos() < 2000; i++) t.press('PageDown');
    expect(pos()).toBe(2000);
    expect(name()).toBe(t.labels().at(-1));
  });

  it('Space and Enter tick and untick; Enter on an option never applies nor closes', async () => {
    const t = await big({ server: true } as never);
    t.f.answer(['a']);
    const before = t.f.calls.length;
    t.search().focus();
    t.press('ArrowDown');
    expect(active().getAttribute('aria-selected')).toBe('true');
    t.press(' ');
    expect(active().getAttribute('aria-selected')).toBe('false');
    t.press('Enter');
    expect(active().getAttribute('aria-selected')).toBe('true');
    t.press('Enter');
    expect(t.popup()).not.toBeNull();
    expect(t.f.calls.length).toBe(before);
  });

  it('a click ticks and focuses', async () => {
    const t = await big();
    const o = t.options()[3]!;
    o.click();
    expect(active()).toBe(o);
    expect(o.getAttribute('aria-selected')).toBe('false');
    expect(o.tabIndex).toBe(0);
  });

  it('type-ahead: letters typed within 500 ms find a label, accents ignored (en, fr)', async () => {
    for (const settings of [{}, { messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } }, locale: 'fr-FR' }]) {
      const t = await big({ settings });
      t.search().focus();
      t.press('ArrowDown');
      vi.useFakeTimers();
      t.press('z');
      expect(name()).toBe('Zèbre');
      // Past the 500 ms pause a new search starts, from the next row on (wrapping).
      vi.advanceTimersByTime(600);
      t.press('E');
      expect(name()).toBe('école');
      vi.advanceTimersByTime(100);
      t.press('l');
      // "el" within the pause: Élan (é = e at base strength).
      expect(name()).toBe('Élan');
      vi.advanceTimersByTime(600);
      t.press('z');
      t.press('q');
      // "zq" finds nothing: the focus stays.
      expect(name()).toBe('Zèbre');
      cleanup();
    }
  });

  it('type-ahead in Arabic', async () => {
    const t = await big({ settings: { messages: { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } }, locale: 'ar-DZ' } });
    t.search().focus();
    t.press('ArrowDown');
    t.press('و');
    expect(name()).toBe('وهران');
  });

  it('in the search: ArrowDown goes to the list; Tab order search, select all, list, Clear, Apply', async () => {
    const t = await big();
    expect(active()).toBe(t.search());
    const order = [...t.popup()!.querySelectorAll<HTMLElement>('input, button, [tabindex]')].filter((e) => e.tabIndex >= 0 && !e.hidden);
    expect(order.map((e) => e.className.split(' ')[0] || e.getAttribute('role'))).toEqual(['dzg-fsearch', 'dzg-fall', 'dzg-fopt', 'dzg-fclr', 'dzg-fapply']);
    t.press('ArrowDown');
    expect(active().getAttribute('role')).toBe('option');
  });

  it('a locale change keeps the focused option (review)', async () => {
    const t = await big();
    t.search().focus();
    t.press('ArrowDown');
    for (let i = 0; i < 4; i++) t.press('PageDown');
    const was = pos();
    expect(was).toBe(37);
    t.g.update({ messages: { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } }, locale: 'fr-FR' } as never);
    expect(active().getAttribute('role')).toBe('option');
    expect(pos()).toBe(was);
  });

  it('the focused option leaves the list (a search): the focus goes to the nearest one left, else to the search', async () => {
    const t = await big();
    t.search().focus();
    t.press('ArrowDown');
    for (let i = 0; i < 5; i++) t.press('ArrowDown');
    expect(name()).toBe('v0003');
    t.type('v1');
    expect(active().getAttribute('role')).toBe('option');
    expect(name()).toMatch(/^v1/);
    t.press('ArrowDown');
    t.type('nothing at all');
    expect(active()).toBe(t.search());
    expect(active()).not.toBe(document.body);
  });
});
