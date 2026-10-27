// Date filters on tzslot 2.2.0 (step 14 part B; docs/behaviors/filter-date-picker.md,
// filter-relative.md, filter-day.md, filter-instant.md). The real widgets run under jsdom (the
// Temporal polyfill); `loadDates` stubs make loading, failure and Retry deterministic.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { filters, FILTER_KEYS } from '../src/filters.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { AR_FILTERS } from '../src/locales/ar-filters.js';
import { cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);
/** What the grid reported (a kit that failed): never swallowed, collected here. */
let reported: unknown[] = [];
beforeEach(() => {
  reported = [];
  (window as unknown as { reportError: unknown }).reportError = (e: unknown) => void reported.push(e);
});
afterEach(() => void delete (window as unknown as { reportError?: unknown }).reportError);

type Row = R & { t: string };
const pad = (n: number) => String(n).padStart(2, '0');
/** 60 rows: days through October 2026 (twice), instants at a different hour each. */
const ROWS: Row[] = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, name: `p${i}`, n: i, d: `2026-10-${pad(1 + (i % 30))}`, t: `2026-10-${pad(1 + (i % 30))}T${pad(i % 24)}:30:00Z` }));
const COLS: ColumnOrGroup<Row>[] = [
  { id: 'name', header: 'Name' },
  { id: 'd', header: 'D', type: 'day' },
  { id: 't', header: 'T', type: 'instant' },
];
/** 2026-10-19 10:00 UTC. */
const NOW = Date.UTC(2026, 9, 19, 10, 0);
const FR_MSG = { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } };
const AR_MSG = { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text } };
const NEW_KEYS = ['filter.op.onDay', 'filter.op.notOnDay', 'filter.op.betweenDays', 'filter.op.before', 'filter.op.after', 'filter.op.onOrBefore', 'filter.op.onOrAfter', 'filter.date', 'filter.dateTime', 'filter.period', 'filter.zone', 'filter.loadingDates', 'filter.loadFailed'];

type Kit = 'date' | 'range' | 'moment';
interface Open {
  readonly server?: boolean;
  readonly settings?: Record<string, unknown>;
  readonly loadDates?: (kit: Kit) => Promise<unknown>;
  readonly dateMessages?: Record<string, object>;
  readonly dateCalendar?: unknown;
  readonly columns?: ColumnOrGroup<Row>[];
  readonly shadow?: boolean;
}

function grid(o: Open = {}) {
  const feature = filters({ ...(o.loadDates && { loadDates: o.loadDates as never }), ...(o.dateMessages && { dateMessages: o.dateMessages }), ...(o.dateCalendar !== undefined && { dateCalendar: o.dateCalendar as never }) });
  const t = make({ columns: (o.columns ?? COLS) as never, rows: ROWS, features: [feature], server: o.server, shadow: o.shadow, settings: { clock: () => NOW, ...o.settings } as never });
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  const q = <E extends Element = HTMLElement>(s: string) => popup()?.querySelector<E>(s) ?? null;
  const op = () => q<HTMLSelectElement>('select.dzg-fop')!;
  const box = () => q<HTMLElement>('.dzg-fdate');
  const widget = () => q<HTMLElement>('.dzg-fdate .tz-field');
  const trigger = () => q<HTMLElement>('.dzg-fdate .tz-field__trigger');
  const panel = () => document.querySelector<HTMLElement>('.tz-field__panel');
  const choose = (v: string) => {
    op().value = v;
    op().dispatchEvent(new Event('change', { bubbles: true }));
  };
  const ready = () => vi.waitFor(() => expect(widget()).not.toBeNull());
  /** Opens tzslot's panel by its trigger, as a click. */
  const openPanel = () => {
    const b = q<HTMLElement>('.dzg-fdate .tz-field__trigger:is(button)') ?? q<HTMLElement>('.dzg-fdate .tz-field__icon-button')!;
    b.click();
    expect(panel()).not.toBeNull();
  };
  /** A day of the open panel's calendar (outside days are another month's). */
  const day = (iso: string) => {
    const d = panel()!.querySelector<HTMLElement>(`[data-date="${iso}"]:not([class*=outside])`);
    expect(d, iso).not.toBeNull();
    return d!;
  };
  const filter = () => t.g.kernel.query.filter as Record<string, unknown>;
  const set = (column: string, f: unknown) => t.g.kernel.dispatch({ type: 'filter.column', column, filter: f as never }, 'api');
  return { ...t, feature, popup, q, op, box, widget, trigger, panel, choose, ready, openPanel, day, filter, set };
}

/** A promise settled from outside. */
function deferred<T>() {
  let ok!: (v: T) => void;
  let no!: (e: unknown) => void;
  const p = new Promise<T>((a, b) => ((ok = a), (no = b)));
  return { p, ok, no };
}
const realKit = (kit: Kit) => import(`../src/filters/dates/${kit}.ts`);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the texts', () => {
  it('FILTER_KEYS holds the 13 date keys, and every shipped filter bundle has them', () => {
    for (const k of NEW_KEYS) expect(FILTER_KEYS, k).toContain(k);
    for (const b of [EN_FILTERS, FR_FILTERS, AR_FILTERS]) for (const k of NEW_KEYS) expect((b.text as Record<string, unknown>)[k], `${b.locale} ${k}`).toBeTypeOf('string');
  });

  it('a bundle without a date key: filters() throws a TypeError naming it', () => {
    const text = { ...EN.text, ...EN_FILTERS.text } as Record<string, unknown>;
    delete text['filter.loadFailed'];
    expect(() => make({ features: [filters()], settings: { messages: { locale: 'en', text } } as never })).toThrow(/filters: missing filter\.loadFailed/);
  });
});

describe('opening and loading', () => {
  it('day and instant columns get the header button (their popup parts exist)', () => {
    const t = grid();
    for (const c of ['d', 't']) expect(t.host.querySelector(`.dzg-hcell[data-col="${c}"] > .dzg-fbtn`), c).not.toBeNull();
  });

  it('opens at once while the kit loads: a status line, aria-busy, the focus on the operator; then the field, no focus moved', async () => {
    const kit = deferred<unknown>();
    const loads: Kit[] = [];
    const t = grid({ loadDates: (k) => (loads.push(k), kit.p) });
    expect(t.feature.openFilter('d')).toBe(true);
    expect(t.op().value).toBe('equals');
    expect(document.activeElement).toBe(t.op());
    expect(loads).toEqual(['date']);
    expect(t.box()!.getAttribute('aria-busy')).toBe('true');
    const status = t.q('.dzg-fdate [role=status]')!;
    expect(status.textContent).toBe(EN_FILTERS.text['filter.loadingDates']);
    expect(t.q('.dzg-fapply')).not.toBeNull();
    expect(t.q('.dzg-fclr')).not.toBeNull();
    kit.ok(await realKit('date'));
    await t.ready();
    expect(t.box()!.hasAttribute('aria-busy')).toBe(false);
    expect(t.q('.dzg-fdate [role=status]')).toBeNull();
    expect(document.activeElement).toBe(t.op());
  });

  it('a kit already loaded draws the field at once, and the focus goes to it', async () => {
    const t = grid();
    t.feature.openFilter('d');
    await t.ready();
    t.feature.closeFilter();
    t.feature.openFilter('d');
    expect(t.widget()).not.toBeNull();
    expect(t.widget()!.contains(document.activeElement)).toBe(true);
  });

  it('prefetches the date kit on pointerover of a date column’s button and focusin on its header, once; never for a text column', async () => {
    const loads: Kit[] = [];
    const t = grid({ loadDates: (k) => (loads.push(k), realKit(k)) });
    const btn = (c: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"] > .dzg-fbtn`)!;
    btn('name').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    t.host.querySelector<HTMLElement>('.dzg-hcell[data-col="name"]')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(loads).toEqual([]);
    // The focus on a date column's header fetches it; the pointer over its button then finds it asked for.
    t.host.querySelector<HTMLElement>('.dzg-hcell[data-col="t"]')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(loads).toEqual(['date']);
    btn('d').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    btn('t').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    await flush();
    expect(loads).toEqual(['date']);
    // The pointer over a date header elsewhere than its button fetches nothing more, nor does a text column's.
    cleanup();
    const u = grid({ loadDates: (k) => (loads.push(k), realKit(k)) });
    loads.length = 0;
    u.host.querySelector<HTMLElement>('.dzg-hcell[data-col="d"] .dzg-hlabel')!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(loads).toEqual([]);
    u.host.querySelector<HTMLElement>('.dzg-hcell[data-col="d"] > .dzg-fbtn')!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    expect(loads).toEqual(['date']);
  });

  it('blank and not blank need no kit: nothing loads, the filter applies (offline)', () => {
    const loads: Kit[] = [];
    const t = grid({ loadDates: (k) => (loads.push(k), Promise.reject(new Error('offline'))) });
    t.set('d', { type: 'day', op: 'blank' });
    t.feature.openFilter('d');
    expect(loads).toEqual([]);
    expect(t.box()!.hidden).toBe(true);
    t.choose('notBlank');
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'notBlank' });
    expect(loads).toEqual([]);
  });

  it('a kit that fails: an alert, Retry, the error reported; the filter in force stays; Clear and Escape work', async () => {
    {
      let n = 0;
      const t = grid({ loadDates: (k) => (n++ < 2 ? Promise.reject(new Error('offline')) : realKit(k)) });
      t.set('d', { type: 'day', op: 'equals', value: '2026-10-05' });
      t.feature.openFilter('d');
      await vi.waitFor(() => expect(t.q('.dzg-fdate [role=alert]')).not.toBeNull());
      expect(t.q('.dzg-fdate [role=alert]')!.textContent).toBe(EN_FILTERS.text['filter.loadFailed']);
      expect(reported).toHaveLength(1);
      expect(t.box()!.hasAttribute('aria-busy')).toBe(false);
      expect(t.filter()['d']).toEqual({ type: 'day', op: 'equals', value: '2026-10-05' });
      // Apply with nothing loaded keeps the filter in force (L1).
      t.q<HTMLButtonElement>('.dzg-fapply')!.click();
      expect(t.popup()).toBeNull();
      expect(t.filter()['d']).toEqual({ type: 'day', op: 'equals', value: '2026-10-05' });
      // Retry imports again.
      t.feature.openFilter('d');
      await vi.waitFor(() => expect(t.q('.dzg-fretry')).not.toBeNull());
      const retry = t.q<HTMLButtonElement>('.dzg-fretry')!;
      expect(retry.textContent).toBe(EN.text['grid.retry']);
      retry.click();
      await t.ready();
      expect(t.q('.dzg-fdate [role=alert]')).toBeNull();
      // The focus waited on the field's box, and goes to the field when it comes.
      expect(t.widget()!.contains(document.activeElement)).toBe(true);
      expect(n).toBe(3);
      t.key(document.activeElement as HTMLElement, 'Escape');
      expect(t.popup()).toBeNull();
    }
  });

  it('Clear works while the kit has failed', async () => {
    const t = grid({ loadDates: () => Promise.reject(new Error('offline')) });
    t.set('d', { type: 'day', op: 'equals', value: '2026-10-05' });
    t.feature.openFilter('d');
    await vi.waitFor(() => expect(t.q('.dzg-ffail')).not.toBeNull());
    t.q<HTMLButtonElement>('.dzg-fclr')!.click();
    expect(t.filter()['d']).toBeUndefined();
  });

  it('a kit whose module has no adapt function is a failure, reported', async () => {
    {
      const t = grid({ loadDates: () => Promise.resolve({ adapt: 42 }) });
      t.feature.openFilter('d');
      await vi.waitFor(() => expect(t.q('.dzg-ffail')).not.toBeNull());
      expect(reported.length).toBe(1);
      expect(String(reported[0])).toMatch(/adapt/);
    }
  });

  it('closed before the kit arrives: nothing is mounted, no panel, no error', async () => {
    const kit = deferred<unknown>();
    const t = grid({ loadDates: () => kit.p });
    t.feature.openFilter('d');
    t.feature.closeFilter();
    kit.ok(await realKit('date'));
    await flush();
    expect(document.querySelector('.tz-field')).toBeNull();
    expect(document.querySelector('.tz-field__panel')).toBeNull();
  });
});

describe('each operator to the model (real tzslot)', () => {
  it('day equals: a day picked in the calendar is stored as that Day, at once in the browser', async () => {
    const t = grid();
    t.feature.openFilter('d');
    await t.ready();
    t.openPanel();
    t.day('2026-10-05').click();
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'equals', value: '2026-10-05' });
    expect(t.ids()).toEqual(['r4', 'r34']);
    // The panel closed, the popup stays.
    expect(t.panel()).toBeNull();
    expect(t.popup()).not.toBeNull();
  });

  it('day: before / on or before / after / on or after / not on keep the day; their labels are the date ones', async () => {
    const t = grid();
    t.set('d', { type: 'day', op: 'equals', value: '2026-10-05' });
    t.feature.openFilter('d');
    await t.ready();
    const labels = [...t.op().options].map((o) => `${o.value}=${o.textContent}`);
    expect(labels).toEqual([
      'equals=On', 'notEqual=Not on', 'lt=Before', 'lte=On or before', 'gt=After', 'gte=On or after', 'between=Between', 'blank=Blank', 'notBlank=Not blank',
    ]);
    for (const op of ['lt', 'lte', 'gt', 'gte', 'notEqual']) {
      t.choose(op);
      expect(t.filter()['d']).toEqual({ type: 'day', op, value: '2026-10-05' });
    }
    expect(t.q('.dzg-flabel')!.textContent).toBe('Date');
  });

  it('the same widget stays across an operator of the same kit, a paint and a locale-neutral update', async () => {
    const t = grid();
    t.set('d', { type: 'day', op: 'equals', value: '2026-10-05' });
    t.feature.openFilter('d');
    await t.ready();
    const w = t.widget();
    t.choose('lt');
    t.g.update({ density: 'compact' } as never);
    t.set('n', null);
    expect(t.widget()).toBe(w);
    t.choose('between');
    await vi.waitFor(() => expect(t.widget()).not.toBe(w));
  });

  it('day between: two days in the period field, both in; the shortcuts are offered', async () => {
    const t = grid();
    t.feature.openFilter('d');
    await t.ready();
    t.choose('between');
    await vi.waitFor(() => expect(t.q('.dzg-fdate .tz-field')).not.toBeNull());
    expect(t.q('.dzg-flabel')!.textContent).toBe('Period');
    t.openPanel();
    expect(t.panel()!.querySelectorAll('.tz-rangefield__preset')).toHaveLength(6);
    t.day('2026-10-05').click();
    // One end: inactive, nothing stored (L1).
    expect(t.filter()['d']).toBeUndefined();
    t.day('2026-10-07').click();
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'between', value: '2026-10-05', valueTo: '2026-10-07' });
    expect(t.ids()).toEqual(['r4', 'r5', 'r6', 'r34', 'r35', 'r36']);
  });

  it('day relative: a shortcut pressed stores the shortcut, pressed again shows it pressed; two days by hand store between', async () => {
    const t = grid();
    t.feature.openFilter('d');
    await t.ready();
    t.choose('between');
    await vi.waitFor(() => expect(t.widget()).not.toBeNull());
    t.openPanel();
    const preset = (name: string) => [...t.panel()!.querySelectorAll<HTMLButtonElement>('.tz-rangefield__preset')].find((b) => b.textContent === name)!;
    preset('Last 7 days').click();
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'relative', range: 'last7Days' });
    // 2026-10-13 .. 2026-10-19 in the grid's zone (UTC).
    expect(t.ids().length).toBe(14);
    t.feature.closeFilter();
    t.feature.openFilter('d');
    expect(t.op().value).toBe('between');
    t.openPanel();
    expect(preset('Last 7 days').getAttribute('aria-pressed')).toBe('true');
    t.day('2026-10-01').click();
    t.day('2026-10-02').click();
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'between', value: '2026-10-01', valueTo: '2026-10-02' });
  });

  it('a stored shortcut written into the field is not reported back (the echo is muted)', async () => {
    const t = grid();
    t.feature.openFilter('d');
    await t.ready();
    t.feature.closeFilter();
    t.set('d', { type: 'day', op: 'relative', range: 'thisMonth' });
    const spy = vi.spyOn(t.g.kernel, 'dispatch');
    t.feature.openFilter('d');
    await vi.waitFor(() => expect(t.widget()).not.toBeNull());
    await flush();
    expect(spy.mock.calls.filter(([c]) => (c as { type: string }).type === 'filter.column')).toEqual([]);
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'relative', range: 'thisMonth' });
  });

  it('instant on this day: the day picked, read in the grid’s zone; the zone written above the field', async () => {
    const t = grid({ settings: { timeZone: 'Europe/Paris' } });
    t.feature.openFilter('t');
    await t.ready();
    expect(t.op().value).toBe('onDay');
    const zone = t.q('.dzg-fzone')!;
    expect(zone.textContent).toContain(EN_FILTERS.text['filter.zone']);
    expect(zone.querySelector('bdi')!.textContent).toBe('Europe/Paris');
    t.openPanel();
    t.day('2026-10-05').click();
    expect(t.filter()['t']).toEqual({ type: 'instant', op: 'onDay', day: '2026-10-05' });
    // Paris 2026-10-05 = [04 22:00Z, 05 22:00Z): r4 at 04:30Z and r34 at 10:30Z.
    expect(t.ids()).toEqual(['r4', 'r34']);
  });

  it('instant between days: two days in the grid’s zone', async () => {
    const t = grid({ settings: { timeZone: 'Africa/Algiers' } });
    t.feature.openFilter('t');
    await t.ready();
    t.choose('betweenDays');
    await vi.waitFor(() => expect(t.widget()).not.toBeNull());
    t.openPanel();
    expect(t.panel()!.querySelectorAll('.tz-rangefield__preset')).toHaveLength(6);
    t.day('2026-10-05').click();
    t.day('2026-10-06').click();
    expect(t.filter()['t']).toEqual({ type: 'instant', op: 'betweenDays', day: '2026-10-05', dayTo: '2026-10-06' });
  });

  it('instant between moments: [at, atTo) in UTC with milliseconds, no shortcuts', async () => {
    const t = grid({ settings: { timeZone: 'Europe/Paris' } });
    t.feature.openFilter('t');
    await t.ready();
    t.choose('between');
    await vi.waitFor(() => expect(t.widget()).not.toBeNull());
    t.openPanel();
    expect(t.panel()!.querySelectorAll('.tz-rangefield__preset:not([hidden])').length === 0 || t.panel()!.querySelector<HTMLElement>('.tz-rangefield__presets')!.hidden).toBe(true);
    t.day('2026-10-05').click();
    t.day('2026-10-09').click();
    expect(t.filter()['t']).toEqual({ type: 'instant', op: 'between', at: '2026-10-04T22:00:00.000Z', atTo: '2026-10-08T22:00:00.000Z' });
  });

  it('instant between moments: a period that holds nothing (the same moment twice) stores nothing', async () => {
    const t = grid({ settings: { timeZone: 'Europe/Paris' } });
    t.feature.openFilter('t');
    await t.ready();
    t.choose('between');
    await vi.waitFor(() => expect(t.widget()).not.toBeNull());
    t.openPanel();
    t.day('2026-10-05').click();
    t.day('2026-10-05').click();
    expect(t.filter()['t']).toBeUndefined();
  });

  it('instant before / after: a typed moment in the grid’s zone, applied after the pause in the browser', async () => {
    const t = grid({ settings: { timeZone: 'Europe/Paris', locale: 'fr-FR', messages: FR_MSG } });
    t.set('t', { type: 'instant', op: 'before', at: '2026-01-10T09:00:00.000Z' });
    t.feature.openFilter('t');
    await t.ready();
    expect(t.op().value).toBe('before');
    const typed = t.q<HTMLInputElement>('.dzg-fdate input')!;
    expect(typed.value).toBe('10/01/2026 10:00');
    typed.focus();
    typed.value = '12/01/2026 08:15';
    typed.dispatchEvent(new InputEvent('input', { bubbles: true }));
    typed.blur();
    // Not yet: the typed field applies after the pause.
    expect(t.filter()['t']).toEqual({ type: 'instant', op: 'before', at: '2026-01-10T09:00:00.000Z' });
    await vi.waitFor(() => expect(t.filter()['t']).toEqual({ type: 'instant', op: 'before', at: '2026-01-12T07:15:00.000Z' }));
    t.choose('after');
    expect(t.filter()['t']).toEqual({ type: 'instant', op: 'after', at: '2026-01-12T07:15:00.000Z' });
  });
});

describe('clock changes (Paris, tzslot’s behaviour)', () => {
  it('a skipped time moves to the first moment that exists, with its note', async () => {
    const t = grid({ settings: { timeZone: 'Europe/Paris', locale: 'fr-FR', messages: FR_MSG }, server: true });
    t.f.answer([]);
    t.set('t', { type: 'instant', op: 'before', at: '2026-01-10T09:00:00.000Z' });
    t.f.answer([]);
    t.feature.openFilter('t');
    await t.ready();
    const typed = t.q<HTMLInputElement>('.dzg-fdate input')!;
    typed.focus();
    typed.value = '29/03/2026 02:30';
    typed.dispatchEvent(new InputEvent('input', { bubbles: true }));
    t.key(typed, 'Enter');
    // Enter in the typed moment applies: one request, the moment moved to 03:30 local (01:30Z).
    expect(t.popup()).toBeNull();
    expect(t.filter()['t']).toEqual({ type: 'instant', op: 'before', at: '2026-03-29T01:30:00.000Z' });
  });

  it('a repeated time takes the first reading; the second is a button', async () => {
    const t = grid({ settings: { timeZone: 'Europe/Paris', locale: 'fr-FR', messages: FR_MSG }, server: true });
    t.f.answer([]);
    t.set('t', { type: 'instant', op: 'after', at: '2026-01-10T09:00:00.000Z' });
    t.f.answer([]);
    t.feature.openFilter('t');
    await t.ready();
    const typed = t.q<HTMLInputElement>('.dzg-fdate input')!;
    typed.focus();
    typed.value = '25/10/2026 02:30';
    typed.dispatchEvent(new InputEvent('input', { bubbles: true }));
    const readings = [...t.panel()!.querySelectorAll<HTMLButtonElement>('.tz-datetime__reading')];
    expect(readings.map((b) => `${b.textContent}:${b.getAttribute('aria-pressed')}`)).toEqual(['été:true', 'hiver:false']);
    readings[1]!.click();
    t.q<HTMLButtonElement>('.dzg-fapply')!.click();
    expect(t.filter()['t']).toEqual({ type: 'instant', op: 'after', at: '2026-10-25T01:30:00.000Z' });
  });
});

describe('a day the zone never had (Apia, 2011-12-30: T7)', () => {
  it('the moment field refuses it: tzslot 2.2.0 would read its times as repeated, on the 29th or the 31st', async () => {
    const t = grid({ settings: { timeZone: 'Pacific/Apia', locale: 'fr-FR', messages: FR_MSG, clock: () => Date.UTC(2011, 11, 20) } });
    t.set('t', { type: 'instant', op: 'before', at: '2011-12-28T10:00:00.000Z' });
    t.feature.openFilter('t');
    await t.ready();
    const typed = t.q<HTMLInputElement>('.dzg-fdate input')!;
    typed.focus();
    typed.value = '30/12/2011 12:00';
    typed.dispatchEvent(new InputEvent('input', { bubbles: true }));
    // Typing opened the calendar: its day is greyed there.
    const lost = t.panel()!.querySelector<HTMLButtonElement>('[data-date="2011-12-30"]');
    expect(lost === null || lost.disabled || lost.getAttribute('aria-disabled') === 'true').toBe(true);
    typed.blur();
    await new Promise((r) => setTimeout(r, 300));
    expect(t.filter()['t']).toEqual({ type: 'instant', op: 'before', at: '2011-12-28T10:00:00.000Z' });
  });
});

/** A kit that records what each widget is given, around the real adapters. */
function spyKit() {
  const seen: { kit: Kit; settings: Record<string, unknown> }[] = [];
  const load = async (kit: Kit) => {
    const m = (await realKit(kit)) as { adapt(a: { settings(): Record<string, unknown> }): unknown };
    return { adapt: (a: { settings(): Record<string, unknown> }) => ((seen.push({ kit, settings: a.settings() })), m.adapt(a)) };
  };
  return { seen, load };
}

describe('the grid’s zone, today and the locale', () => {
  it('today is the clock’s day in the grid’s zone, never the machine’s (2026-10-19 23:30 UTC is the 20th in Paris)', async () => {
    const k = spyKit();
    const t = grid({ loadDates: k.load, settings: { timeZone: 'Europe/Paris', clock: () => Date.UTC(2026, 9, 19, 23, 30) } });
    t.feature.openFilter('t');
    await t.ready();
    expect(k.seen[0]!.settings).toMatchObject({ ctx: { timeZone: 'Europe/Paris' }, today: '2026-10-20' });
    t.feature.closeFilter();
    t.feature.openFilter('d');
    await t.ready();
    expect(k.seen[1]!.settings).toMatchObject({ ctx: { timeZone: 'Europe/Paris' }, today: '2026-10-20' });
  });

  it('the locale tag forces Gregorian and the grid’s digits: ar-SA latn, ar-EG locale digits, fr-FR', async () => {
    for (const [locale, numerals, shown] of [['ar-SA', 'latn', /29.*03.*2026/], ['ar-EG', 'locale', /\u0662\u0669.*\u0662\u0660\u0662\u0666/], ['fr-FR', 'latn', /^29 mars 2026$/]] as const) {
      const t = grid({ settings: { locale, numerals, messages: locale === 'fr-FR' ? FR_MSG : AR_MSG } });
      t.set('d', { type: 'day', op: 'equals', value: '2026-03-29' });
      t.feature.openFilter('d');
      await t.ready();
      expect(t.trigger()!.querySelector('.tz-field__text')!.textContent, locale).toMatch(shown);
      cleanup();
    }
  });

  it('Arabic: tzslot’s Arabic words, the panel right to left inside the popup', async () => {
    const t = grid({ settings: { locale: 'ar-DZ', messages: AR_MSG, direction: 'rtl' } });
    t.feature.openFilter('d');
    await t.ready();
    expect(t.popup()!.getAttribute('dir')).toBe('rtl');
    t.openPanel();
    expect(t.popup()!.contains(t.panel())).toBe(true);
    expect(t.panel()!.getAttribute('aria-label')).toBe(AR_FILTERS.text['filter.date']);
    t.feature.closeFilter();
    t.feature.openFilter('d');
    t.choose('between');
    await vi.waitFor(() => expect(t.widget()).not.toBeNull());
    t.openPanel();
    expect([...t.panel()!.querySelectorAll('.tz-rangefield__preset')].map((b) => b.textContent)).toContain('آخر 7 أيام');
  });

  it('dateMessages gives tzslot’s words for another language', async () => {
    const k = spyKit();
    const words = { chooseDate: 'Elegir fecha' };
    const t = grid({ loadDates: k.load, dateMessages: { es: words }, settings: { locale: 'es-ES' } });
    t.feature.openFilter('d');
    await t.ready();
    expect(t.trigger()!.textContent).toContain('Elegir fecha');
  });

  it('a zone change while open: the zone line and the field follow', async () => {
    const t = grid({ settings: { timeZone: 'Europe/Paris' } });
    t.set('t', { type: 'instant', op: 'onDay', day: '2026-10-05' });
    t.feature.openFilter('t');
    await t.ready();
    t.g.update({ timeZone: 'America/Sao_Paulo' } as never);
    expect(t.q('.dzg-fzone bdi')!.textContent).toBe('America/Sao_Paulo');
    expect(t.filter()['t']).toEqual({ type: 'instant', op: 'onDay', day: '2026-10-05' });
  });

  it('São Paulo 2018-11-04 (no midnight): between days reads the days the user picked', async () => {
    const t = grid({ settings: { timeZone: 'America/Sao_Paulo', clock: () => Date.UTC(2018, 10, 10, 12) } });
    t.feature.openFilter('t');
    await t.ready();
    t.choose('betweenDays');
    await vi.waitFor(() => expect(t.widget()).not.toBeNull());
    t.openPanel();
    t.day('2018-11-04').click();
    t.day('2018-11-04').click();
    expect(t.filter()['t']).toEqual({ type: 'instant', op: 'betweenDays', day: '2018-11-04', dayTo: '2018-11-04' });
  });
});

describe('drafts, echo and L1', () => {
  it('on a server: nothing is sent while picking; Apply sends one request', async () => {
    const t = grid({ server: true });
    t.f.answer([]);
    t.feature.openFilter('d');
    await t.ready();
    const calls = t.f.calls.length;
    t.openPanel();
    t.day('2026-10-05').click();
    t.choose('lt');
    expect(t.f.calls.length).toBe(calls);
    t.q<HTMLButtonElement>('.dzg-fapply')!.click();
    expect(t.f.calls.length).toBe(calls + 1);
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'lt', value: '2026-10-05' });
  });

  it('a host filter rewrites a field not being edited, never a draft being edited (server)', async () => {
    const t = grid({ server: true });
    t.f.answer([]);
    t.feature.openFilter('d');
    await t.ready();
    t.set('d', { type: 'day', op: 'equals', value: '2026-10-08' });
    expect(t.trigger()!.textContent).toContain('Oct 8, 2026');
    t.openPanel();
    t.day('2026-10-05').click();
    t.set('d', { type: 'day', op: 'equals', value: '2026-10-09' });
    expect(t.trigger()!.textContent).toContain('Oct 5, 2026');
  });

  it('half a period keeps the filter in force (L1); Apply keeps it too', async () => {
    const t = grid();
    t.set('d', { type: 'day', op: 'equals', value: '2026-10-05' });
    t.feature.openFilter('d');
    await t.ready();
    t.choose('between');
    await vi.waitFor(() => expect(t.widget()).not.toBeNull());
    t.openPanel();
    t.day('2026-10-07').click();
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'equals', value: '2026-10-05' });
    t.q<HTMLButtonElement>('.dzg-fapply')!.click();
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'equals', value: '2026-10-05' });
  });

  it('a filter the fields cannot show: the summary and Clear', () => {
    const t = grid();
    for (const [c, f] of [
      ['d', { type: 'day', op: 'relative', range: 'thisWeek' }],
      ['d', { type: 'day', op: 'equals', value: '0000-01-01' }],
      ['t', { type: 'instant', op: 'before', at: '2026-01-10T09:00:30.000Z' }],
      ['t', { type: 'instant', op: 'after', at: '1850-01-10T09:00:00.000Z' }],
      ['t', { type: 'instant', op: 'before', day: '2026-01-10' }],
    ] as const) {
      t.g.kernel.dispatch({ type: 'filter.set', filter: { [c]: f } as never }, 'api');
      t.feature.openFilter(c);
      expect(t.q('.dzg-fsum'), JSON.stringify(f)).not.toBeNull();
      expect(t.q('.dzg-fdate'), JSON.stringify(f)).toBeNull();
      t.feature.closeFilter();
    }
  });

  it('an operator not in the column’s filter.ops shows the summary', () => {
    const t = grid({ columns: [{ id: 'd', header: 'D', type: 'day', filter: { ops: ['equals', 'between'] } }] as never });
    t.set('d', { type: 'day', op: 'lt', value: '2026-10-05' });
    t.feature.openFilter('d');
    expect(t.q('.dzg-fsum')).not.toBeNull();
    t.feature.closeFilter();
    t.set('d', null);
    t.feature.openFilter('d');
    expect([...t.op().options].map((o) => o.value)).toEqual(['equals', 'between']);
  });
});

describe('keys, focus and the panel', () => {
  it('Escape closes the open panel first (the popup stays, focus back on the trigger), then the popup', async () => {
    const t = grid();
    t.feature.openFilter('d');
    await t.ready();
    t.openPanel();
    expect(t.panel()!.contains(document.activeElement)).toBe(true);
    const e = t.key(document.activeElement as HTMLElement, 'Escape');
    expect(e.defaultPrevented).toBe(true);
    expect(t.panel()).toBeNull();
    expect(t.popup()).not.toBeNull();
    expect(t.widget()!.contains(document.activeElement)).toBe(true);
    t.key(document.activeElement as HTMLElement, 'Escape');
    expect(t.popup()).toBeNull();
  });

  it('Enter inside the panel is the panel’s: the popup stays', async () => {
    const t = grid();
    t.feature.openFilter('d');
    await t.ready();
    t.choose('between');
    await vi.waitFor(() => expect(t.widget()).not.toBeNull());
    t.openPanel();
    const input = t.panel()!.querySelector<HTMLInputElement>('input')!;
    t.key(input, 'Enter');
    expect(t.popup()).not.toBeNull();
  });

  it('the panel opens inside the popup element; closing the popup leaves no panel', async () => {
    const t = grid();
    t.feature.openFilter('d');
    await t.ready();
    t.openPanel();
    expect(t.popup()!.contains(t.panel())).toBe(true);
    expect(t.q('.dzg-fpanel')!.contains(t.panel())).toBe(true);
    t.feature.closeFilter();
    expect(document.querySelector('.tz-field__panel')).toBeNull();
    expect(document.querySelector('.tz-field')).toBeNull();
  });

  it('the date trigger is never the popup’s first or last control, for every operator', async () => {
    const t = grid();
    const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    for (const [c, ops] of [['d', ['equals', 'between', 'lt', 'blank']], ['t', ['onDay', 'betweenDays', 'between', 'before', 'after']]] as const) {
      t.feature.openFilter(c);
      for (const op of ops) {
        t.choose(op);
        await vi.waitFor(() => expect(op === 'blank' || !!t.widget()).toBe(true));
        const items = [...t.popup()!.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => !e.closest('[hidden]'));
        expect(items[0], `${c} ${op}`).toBe(t.op());
        expect(items.at(-1), `${c} ${op}`).toBe(t.q('.dzg-fapply'));
      }
      t.feature.closeFilter();
    }
  });

  it('the trigger’s name carries the date shown (T1 workaround)', async () => {
    const t = grid();
    t.set('d', { type: 'day', op: 'equals', value: '2026-10-05' });
    t.feature.openFilter('d');
    await t.ready();
    await vi.waitFor(() => expect(t.trigger()!.getAttribute('aria-label')).toBe('Date, Oct 5, 2026'));
    t.openPanel();
    t.day('2026-10-06').click();
    await vi.waitFor(() => expect(t.trigger()!.getAttribute('aria-label')).toBe('Date, Oct 6, 2026'));
  });
});

describe('styles under a strict CSP', () => {
  // The head outlives a test: start from none.
  beforeEach(() => document.head.querySelectorAll('style').forEach((s) => s.remove()));
  it('tzslot’s sheets injected by DzGrid, each with the grid’s nonce: none left without it after every panel opened', async () => {
    const t = grid({ settings: { nonce: 'n0nce', timeZone: 'Europe/Paris' } });
    for (const [c, op] of [['d', 'equals'], ['d', 'between'], ['t', 'before'], ['t', 'between']] as const) {
      t.feature.openFilter(c);
      t.choose(op);
      await vi.waitFor(() => expect(t.widget()).not.toBeNull());
      const b = t.q<HTMLElement>('.dzg-fdate .tz-field__trigger:is(button)') ?? t.q<HTMLElement>('.dzg-fdate .tz-field__icon-button')!;
      b.click();
      t.feature.closeFilter();
    }
    const sheets = [...document.head.querySelectorAll<HTMLStyleElement>('style[data-tzslot]')];
    expect(sheets.map((s) => s.dataset['tzslot']).sort()).toEqual(['calendar', 'dateinput', 'datetime', 'field', 'range', 'rangefield', 'time', 'timeselect']);
    for (const s of sheets) expect(s.getAttribute('nonce'), s.dataset['tzslot']).toBe('n0nce');
    expect(document.head.querySelectorAll('style[data-tzslot="field"]')).toHaveLength(1);
  });

  it('injectStyles false: DzGrid injects none of tzslot’s sheets', async () => {
    const t = grid({ settings: { injectStyles: false } });
    t.feature.openFilter('d');
    await t.ready();
    t.openPanel();
    expect(document.head.querySelectorAll('style[data-tzslot][nonce]')).toHaveLength(0);
    expect(document.head.querySelector('style[data-dzgrid-filters]')).toBeNull();
    // tzslot 2.2.0 still injects its panel's sheet itself (spike S13 finding 7, request T2).
    expect([...document.head.querySelectorAll<HTMLElement>('style[data-tzslot]')].map((s) => s.dataset['tzslot'])).toEqual(['field']);
  });
});

describe('midnight (the filters feature calls kernel.tick())', () => {
  it('a shortcut in force: at midnight in the grid’s zone the rows move to the new day, once; none at 23:59:59', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let now = Date.UTC(2026, 9, 19, 21, 59, 59);
    const t = grid({ settings: { timeZone: 'Europe/Paris', clock: () => now } });
    t.set('d', { type: 'day', op: 'relative', range: 'today' });
    // 23:59:59 in Paris on the 19th: today is the 19th (r18, r48).
    expect(t.ids()).toEqual(['r18', 'r48']);
    const tick = vi.spyOn(t.g.kernel, 'tick');
    now += 500;
    vi.advanceTimersByTime(500);
    expect(tick).not.toHaveBeenCalled();
    now = Date.UTC(2026, 9, 19, 22, 0, 0, 60);
    vi.advanceTimersByTime(600);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(t.ids()).toEqual(['r19', 'r49']);
  });

  it('no shortcut in force: no timer, and the page becoming visible ticks nothing; with one, it ticks at once', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    const t = grid({ settings: { timeZone: 'Europe/Paris' } });
    const before = vi.getTimerCount();
    t.set('d', { type: 'day', op: 'equals', value: '2026-10-05' });
    expect(vi.getTimerCount()).toBe(before);
    const tick = vi.spyOn(t.g.kernel, 'tick');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(tick).not.toHaveBeenCalled();
    t.set('d', { type: 'day', op: 'relative', range: 'today' });
    expect(vi.getTimerCount()).toBe(before + 1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(tick).toHaveBeenCalledTimes(1);
    t.set('d', null);
    expect(vi.getTimerCount()).toBe(before);
  });

  it('a shortcut inside a combined filter arms the timer too', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const t = grid();
    const before = vi.getTimerCount();
    t.set('d', { type: 'combined', join: 'or', conditions: [{ type: 'day', op: 'blank' }, { type: 'day', op: 'relative', range: 'today' }] });
    expect(vi.getTimerCount()).toBe(before + 1);
  });

  it('on a server: one request at midnight, none before', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let now = Date.UTC(2026, 9, 19, 23, 0);
    const t = grid({ server: true, settings: { clock: () => now } });
    t.f.answer([]);
    t.set('t', { type: 'instant', op: 'relative', range: 'yesterday' });
    t.f.answer([]);
    const calls = t.f.calls.length;
    vi.advanceTimersByTime(30 * 60_000);
    expect(t.f.calls.length).toBe(calls);
    now = Date.UTC(2026, 9, 20, 0, 0, 0, 60);
    vi.advanceTimersByTime(31 * 60_000);
    expect(t.f.calls.length).toBe(calls + 1);
  });
});

describe('the review of step 14 part B', () => {
  beforeEach(() => document.head.querySelectorAll('style').forEach((s) => s.remove()));
  const shadowSheets = (t: ReturnType<typeof grid>) => {
    const root = t.host.getRootNode() as ShadowRoot;
    expect(root.nodeType).toBe(11);
    return [...root.querySelectorAll<HTMLStyleElement>('style[data-tzslot]')];
  };

  it('a grid in a shadow root: tzslot’s sheets go there, with the nonce, once — after a load, a second open, a prefetch', async () => {
    for (const prefetch of [false, true]) {
      const t = grid({ shadow: true, settings: { nonce: 'n0nce' } });
      if (prefetch) {
        t.host.querySelector<HTMLElement>('.dzg-hcell[data-col="d"]')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        await flush();
      }
      for (let i = 0; i < 2; i++) {
        t.feature.openFilter('d');
        await t.ready();
        (t.q<HTMLElement>('.dzg-fdate .tz-field__trigger:is(button)') ?? t.q<HTMLElement>('.dzg-fdate .tz-field__icon-button')!).click();
        expect(t.popup()!.querySelector('.tz-field__panel'), `${prefetch} ${i}`).not.toBeNull();
        t.feature.closeFilter();
      }
      const sheets = shadowSheets(t);
      expect(sheets.map((s) => s.dataset['tzslot']).sort(), `prefetch ${prefetch}`).toEqual(['calendar', 'field']);
      for (const s of sheets) expect(s.getAttribute('nonce'), s.dataset['tzslot']).toBe('n0nce');
      expect(document.head.querySelectorAll('style[data-tzslot]'), `prefetch ${prefetch}`).toHaveLength(0);
      cleanup();
    }
  });

  it('ar-EG with the locale’s digits: a period panel’s day cells keep their own name, no Latin digit appended', async () => {
    const t = grid({ settings: { locale: 'ar-EG', numerals: 'locale', messages: AR_MSG } });
    t.feature.openFilter('d');
    t.choose('between');
    await vi.waitFor(() => expect(t.widget()).not.toBeNull());
    t.openPanel();
    const cells = [...t.panel()!.querySelectorAll<HTMLElement>('button[data-date]')];
    expect(cells.length).toBeGreaterThan(27);
    await flush();
    for (const c of cells) expect(c.getAttribute('aria-label'), c.dataset['date']).not.toMatch(/, [0-9]+$/);
    // The trigger and the month title still carry what they show.
    const title = t.panel()!.querySelector<HTMLElement>('button[aria-label][class*=title]');
    if (title) expect(title.getAttribute('aria-label')).toContain(title.textContent!.trim());
  });

  const broken = () => ({ adapt: () => { throw new Error('adapt broke'); } });

  it('a kit whose adapt throws after a lazy load: reported, an alert and Retry, no half-built widget', async () => {
    const t = grid({ loadDates: () => Promise.resolve(broken()) });
    const unhandled: unknown[] = [];
    const on = (e: unknown) => void unhandled.push(e);
    process.on('unhandledRejection', on);
    try {
      t.feature.openFilter('d');
      await vi.waitFor(() => expect(t.q('.dzg-fdate [role=alert]')).not.toBeNull());
      await flush();
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', on);
    }
    expect(reported.map(String)).toEqual(['Error: adapt broke']);
    expect(t.q('.dzg-fretry')).not.toBeNull();
    expect(t.q('.dzg-fwidget, .dzg-fpanel')).toBeNull();
    expect(t.box()!.hasAttribute('aria-busy')).toBe(false);
    // Retry tries again (the kit is kept, adapt throws again): reported again, still a failure.
    t.q<HTMLButtonElement>('.dzg-fretry')!.click();
    expect(reported).toHaveLength(2);
    expect(t.q('.dzg-fretry')).not.toBeNull();
  });

  it('a kit already loaded whose adapt throws: openFilter does not throw; reported, an alert and Retry', async () => {
    let n = 0;
    const real = await realKit('date');
    const t = grid({ loadDates: () => Promise.resolve({ adapt: (a: never) => (n++ ? broken().adapt() : real.adapt(a)) }) });
    t.feature.openFilter('d');
    await t.ready();
    t.feature.closeFilter();
    expect(() => t.feature.openFilter('d')).not.toThrow();
    expect(reported.map(String)).toEqual(['Error: adapt broke']);
    expect(t.q('.dzg-fdate [role=alert]')!.textContent).toBe(EN_FILTERS.text['filter.loadFailed']);
    expect(t.q('.dzg-fretry')).not.toBeNull();
    expect(t.q('.dzg-fwidget, .dzg-fpanel')).toBeNull();
  });
});

describe('filters({ dateCalendar }): the period widget’s months and shortcuts', () => {
  const ALL = ['Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'This month', 'Last month'];
  /** Opens the period field of a column (`between` on a day, `betweenDays` or `between` on an instant) and its panel. */
  const period = async (o: Open, column = 'd', op = 'between') => {
    const t = grid(o);
    t.feature.openFilter(column);
    await t.ready();
    t.choose(op);
    await vi.waitFor(() => expect(t.q('.dzg-fdate .tz-rangefield, .dzg-fdate .tz-field')).not.toBeNull());
    await vi.waitFor(() => expect(t.q('.dzg-flabel')!.textContent).toBe('Period'));
    t.openPanel();
    const months = () => t.panel()!.querySelectorAll('.tz-range__month').length;
    const column_ = () => t.panel()!.querySelector<HTMLElement>('.tz-rangefield__presets');
    const shown = () => (column_() && !column_()!.hidden ? [...column_()!.querySelectorAll('.tz-rangefield__preset')].map((b) => b.textContent) : []);
    return { t, months, shown };
  };
  const warnings = (t: ReturnType<typeof grid>) => t.problems().filter((p) => p.path.startsWith('features.filters.dateCalendar'));

  it('absent: two months and the six shortcuts, as before; nothing said', async () => {
    const { t, months, shown } = await period({});
    expect(months()).toBe(2);
    expect(shown()).toEqual(ALL);
    expect(warnings(t)).toEqual([]);
  });

  it('months: 1 reaches the widget: one month drawn', async () => {
    const { t, months, shown } = await period({ dateCalendar: { months: 1 } });
    expect(months()).toBe(1);
    expect(shown()).toEqual(ALL);
    expect(warnings(t)).toEqual([]);
  });

  it('presets: [] hides the column of shortcuts (a day column and an instant’s days)', async () => {
    for (const [col, op] of [['d', 'between'], ['t', 'betweenDays']] as const) {
      const { months, shown } = await period({ dateCalendar: { presets: [] } }, col, op);
      expect(shown(), col).toEqual([]);
      expect(months()).toBe(2);
      cleanup();
    }
  });

  it('a subset of presets is offered in the host’s order', async () => {
    const { t, shown } = await period({ dateCalendar: { presets: ['thisMonth', 'today', 'last7Days'] } });
    expect(shown()).toEqual(['This month', 'Today', 'Last 7 days']);
    expect(warnings(t)).toEqual([]);
  });

  it('an instant between two moments keeps no shortcuts, whatever the host asks', async () => {
    const { shown } = await period({ dateCalendar: { presets: ['today'] }, settings: { timeZone: 'Europe/Paris' } }, 't', 'between');
    expect(shown()).toEqual([]);
  });

  it('an unknown preset name: a warning naming it, the others kept; never a throw', async () => {
    const { t, shown } = await period({ dateCalendar: { presets: ['today', 'nextWeek', 'yesterday'] } });
    expect(shown()).toEqual(['Today', 'Yesterday']);
    expect(warnings(t)).toEqual([{ code: 'invalid-setting', severity: 'warning', path: 'features.filters.dateCalendar.presets', detail: 'nextWeek' }]);
  });

  it('presets that are not a list: a warning, the six shortcuts kept', async () => {
    const { t, shown } = await period({ dateCalendar: { presets: 'today' } });
    expect(shown()).toEqual(ALL);
    expect(warnings(t)).toEqual([{ code: 'invalid-setting', severity: 'warning', path: 'features.filters.dateCalendar.presets', detail: 'today' }]);
  });

  it('a stored shortcut the host does not offer: kept in force, the period field opens empty, no error', async () => {
    const t = grid({ dateCalendar: { presets: ['today'] } });
    t.set('d', { type: 'day', op: 'relative', range: 'lastMonth' });
    t.feature.openFilter('d');
    await vi.waitFor(() => expect(t.widget()).not.toBeNull());
    await flush();
    expect(t.op().value).toBe('between');
    expect(reported).toEqual([]);
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'relative', range: 'lastMonth' });
    // tzslot names only the shortcuts it was given: the field shows no period.
    expect(t.trigger()!.textContent).toBe('Start date – End date');
  });

  it('months that is not a positive integer: a warning, ignored (two months)', async () => {
    for (const bad of [0, -1, 1.5, '1', Number.NaN]) {
      const { t, months } = await period({ dateCalendar: { months: bad } });
      expect(months(), String(bad)).toBe(2);
      expect(warnings(t), String(bad)).toEqual([{ code: 'invalid-setting', severity: 'warning', path: 'features.filters.dateCalendar.months', detail: String(bad) }]);
      cleanup();
    }
  });
});
