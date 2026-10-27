// Feedback pass K (owner Q2, docs/phase-6-steps/decisions.md « Feedback pass »; app-feedback.md 2): the period form is
// in the column's filter popup itself, under the header: FROM and TO typed fields and tzslot's inline calendar
// (`createDateRange`, one month by default), composed by DzGrid. No second panel, nothing outside the popup.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { filters } from '../src/filters.js';
import { FR } from '../src/locales/fr.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);
beforeEach(() => void ((window as unknown as { reportError: unknown }).reportError = () => {}));

type Row = R & { t: string };
const pad = (n: number) => String(n).padStart(2, '0');
const ROWS: Row[] = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, name: `p${i}`, n: i, d: `2026-10-${pad(1 + (i % 30))}`, t: `2026-10-${pad(1 + (i % 30))}T${pad(i % 24)}:30:00Z` }));
const COLS: ColumnOrGroup<Row>[] = [{ id: 'name', header: 'Name' }, { id: 'd', header: 'D', type: 'day' }, { id: 't', header: 'T', type: 'instant' }];
/** 2026-10-19 10:00 UTC. */
const NOW = Date.UTC(2026, 9, 19, 10, 0);
const FR_MSG = { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text } };

function grid(o: { settings?: Record<string, unknown>; dateCalendar?: unknown; columns?: ColumnOrGroup<Row>[] } = {}) {
  const feature = filters({ ...(o.dateCalendar !== undefined && { dateCalendar: o.dateCalendar as never }) });
  const t = make({ columns: (o.columns ?? COLS) as never, rows: ROWS, features: [feature], settings: { clock: () => NOW, ...o.settings } as never });
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  const q = <E extends Element = HTMLElement>(s: string) => popup()?.querySelector<E>(s) ?? null;
  const qa = <E extends Element = HTMLElement>(s: string) => [...(popup()?.querySelectorAll<E>(s) ?? [])];
  const op = () => q<HTMLSelectElement>('select.dzg-fop')!;
  const choose = (v: string) => {
    op().value = v;
    op().dispatchEvent(new Event('change', { bubbles: true }));
  };
  const period = () => q('.dzg-fperiod');
  const inputs = () => qa<HTMLInputElement>('.dzg-fends .tz-dateinput__input');
  const day = (iso: string) => q<HTMLButtonElement>(`.dzg-fcal [data-date="${iso}"]:not([class*=outside])`)!;
  const preset = (name: string) => qa<HTMLButtonElement>('.dzg-fpreset').find((b) => b.textContent === name)!;
  const type = (i: HTMLInputElement, text: string) => {
    i.focus();
    i.value = text;
    i.dispatchEvent(new InputEvent('input', { bubbles: true }));
    i.dispatchEvent(new FocusEvent('blur'));
  };
  const filter = () => t.g.kernel.query.filter as Record<string, unknown>;
  const set = (column: string, f: unknown) => t.g.kernel.dispatch({ type: 'filter.column', column, filter: f as never }, 'api');
  /** Opens the column's popup on `op` and waits for the period form. */
  const open = async (col: string, o2: string) => {
    expect(feature.openFilter(col)).toBe(true);
    choose(o2);
    await vi.waitFor(() => expect(period()).not.toBeNull());
  };
  return { ...t, feature, popup, q, qa, op, choose, period, inputs, day, preset, type, filter, set, open };
}

describe('the period form in the popup', () => {
  it('day between: FROM and TO and one month of calendar, in the popup; no field, no panel anywhere', async () => {
    const t = grid();
    await t.open('d', 'between');
    expect(t.inputs()).toHaveLength(2);
    expect(t.qa('.dzg-fends .tz-dateinput__label').map((l) => l.textContent)).toEqual(['From', 'To']);
    expect(t.q('.dzg-fends')!.getAttribute('role')).toBe('group');
    expect(t.q('.dzg-fends')!.getAttribute('aria-label')).toBe('Period');
    expect(t.qa('.dzg-fcal .tz-range__month')).toHaveLength(1);
    expect(document.querySelectorAll('.tz-field__panel, .tz-field, .tz-rangefield')).toHaveLength(0);
    // Everything inside the popup.
    expect(document.querySelectorAll('.tz-range, .tz-dateinput').length).toBe(t.qa('.tz-range, .tz-dateinput').length);
  });

  it('two clicks in the calendar: FROM then TO, both days in, the fields written', async () => {
    const t = grid();
    await t.open('d', 'between');
    t.day('2026-10-05').click();
    expect(t.filter()['d']).toBeUndefined();
    expect(t.inputs()[0]!.value).not.toBe('');
    t.day('2026-10-07').click();
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'between', value: '2026-10-05', valueTo: '2026-10-07' });
    expect(t.ids()).toEqual(['r4', 'r5', 'r6', 'r34', 'r35', 'r36']);
    expect(t.inputs()[1]!.value).not.toBe('');
  });

  it('typed FROM and TO (French): the period, after the pause; the calendar shows it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const t = grid({ settings: { locale: 'fr-FR', messages: FR_MSG } });
    await t.open('d', 'between');
    expect(t.qa('.dzg-fends .tz-dateinput__label').map((l) => l.textContent)).toEqual(['Du', 'Au']);
    const [from, to] = t.inputs();
    t.type(from!, '03/10/2026');
    t.type(to!, '04/10/2026');
    vi.advanceTimersByTime(200);
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'between', value: '2026-10-03', valueTo: '2026-10-04' });
    expect(t.day('2026-10-03').getAttribute('aria-selected')).toBe('true');
    expect(t.day('2026-10-04').getAttribute('aria-selected')).toBe('true');
  });

  it('TO before FROM: nothing stored (the filter in force kept)', async () => {
    const t = grid({ settings: { locale: 'fr-FR', messages: FR_MSG } });
    t.set('d', { type: 'day', op: 'between', value: '2026-10-01', valueTo: '2026-10-02' });
    await t.open('d', 'between');
    const [from, to] = t.inputs();
    t.type(from!, '10/10/2026');
    t.type(to!, '05/10/2026');
    t.q<HTMLButtonElement>('.dzg-fapply')!.click();
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'between', value: '2026-10-01', valueTo: '2026-10-02' });
  });

  it('the six shortcuts as buttons; one pressed stores it, shows its days and is pressed', async () => {
    const t = grid();
    await t.open('d', 'between');
    expect(t.qa('.dzg-fpreset')).toHaveLength(6);
    t.preset('Last 7 days').click();
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'relative', range: 'last7Days' });
    expect(t.preset('Last 7 days').getAttribute('aria-pressed')).toBe('true');
    expect(t.day('2026-10-13').getAttribute('aria-selected')).toBe('true');
    expect(t.day('2026-10-19').getAttribute('aria-selected')).toBe('true');
    // A period by hand afterwards: absolute, the shortcut no longer pressed.
    t.day('2026-10-01').click();
    t.day('2026-10-02').click();
    expect(t.filter()['d']).toEqual({ type: 'day', op: 'between', value: '2026-10-01', valueTo: '2026-10-02' });
    expect(t.preset('Last 7 days').getAttribute('aria-pressed')).toBe('false');
  });

  it('dateCalendar: presets [] shows none; months 2 shows two', async () => {
    const t = grid({ dateCalendar: { presets: [], months: 2 } });
    await t.open('d', 'between');
    expect(t.qa('.dzg-fpreset')).toHaveLength(0);
    expect(t.qa('.dzg-fcal .tz-range__month')).toHaveLength(2);
  });

  it('a day column says no zone anywhere in the form (T6: no summary)', async () => {
    const t = grid({ settings: { timeZone: 'Pacific/Auckland' } });
    await t.open('d', 'between');
    t.day('2026-10-05').click();
    t.day('2026-10-07').click();
    expect(t.q('.dzg-fpop')!.textContent).not.toMatch(/UTC|Auckland/);
  });

  it('instant between days: day and dayTo in the grid\'s zone', async () => {
    const t = grid({ settings: { timeZone: 'Europe/Paris' } });
    await t.open('t', 'betweenDays');
    t.day('2026-10-05').click();
    t.day('2026-10-06').click();
    expect(t.filter()['t']).toEqual({ type: 'instant', op: 'betweenDays', day: '2026-10-05', dayTo: '2026-10-06' });
  });

  it('instant between two moments: FROM and TO with their hours, no shortcuts; [at, atTo) in the grid\'s zone', async () => {
    const t = grid({ settings: { timeZone: 'Europe/Paris' } });
    await t.open('t', 'between');
    expect(t.qa('.dzg-fpreset')).toHaveLength(0);
    expect(t.qa('.dzg-fends .tz-dateinput__time:not([hidden])')).toHaveLength(2);
    t.day('2026-10-05').click();
    t.day('2026-10-06').click();
    // Midnight in Paris (UTC+2 in October) to the next midnight.
    expect(t.filter()['t']).toEqual({ type: 'instant', op: 'between', at: '2026-10-04T22:00:00.000Z', atTo: '2026-10-05T22:00:00.000Z' });
  });

  it('a day Samoa never had is greyed for moments (T7 kept), not for days', async () => {
    const t = grid({ settings: { timeZone: 'Pacific/Apia' } });
    t.set('t', { type: 'instant', op: 'between', at: '2011-12-29T10:00:00.000Z', atTo: '2011-12-31T11:00:00.000Z' });
    await t.open('t', 'between');
    await vi.waitFor(() => expect(t.day('2011-12-30')).not.toBeNull());
    expect(t.day('2011-12-30').disabled).toBe(true);
    expect(t.day('2011-12-31').disabled).toBe(false);
  });

  it('the focus (the kit loaded): FROM first; then TO, the calendar, Apply in the tab order', async () => {
    const t = grid();
    await t.open('d', 'between');
    t.feature.closeFilter();
    t.set('d', { type: 'day', op: 'between', value: '2026-10-01', valueTo: '2026-10-02' });
    t.feature.openFilter('d');
    await vi.waitFor(() => expect(t.period()).not.toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(t.inputs()[0]));
    const order = t.qa('input, button, select').filter((e) => !e.closest('[hidden]') && (e as HTMLElement).tabIndex >= 0);
    const at = (e: Element) => order.indexOf(e as HTMLElement);
    expect(at(t.inputs()[0]!)).toBeLessThan(at(t.inputs()[1]!));
    expect(at(t.inputs()[1]!)).toBeLessThan(at(t.q('.dzg-fcal button')!));
    expect(at(t.q('.dzg-fcal button')!)).toBeLessThan(at(t.q('.dzg-fapply')!));
  });

  it('Escape closes the popup at once (no panel to close first)', async () => {
    const t = grid();
    await t.open('d', 'between');
    t.inputs()[0]!.focus();
    t.inputs()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(t.popup()).toBeNull();
  });

  it('the stored period written back on reopening; closed: nothing of tzslot left', async () => {
    const t = grid();
    t.set('d', { type: 'day', op: 'relative', range: 'thisMonth' });
    t.feature.openFilter('d');
    await vi.waitFor(() => expect(t.period()).not.toBeNull());
    expect(t.op().value).toBe('between');
    expect(t.preset('This month').getAttribute('aria-pressed')).toBe('true');
    expect(t.day('2026-10-01').getAttribute('aria-selected')).toBe('true');
    t.feature.closeFilter();
    expect(document.querySelectorAll('.tz-range, .tz-dateinput')).toHaveLength(0);
  });
});
