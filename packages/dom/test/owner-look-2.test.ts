// The owner's second look at the integrated screen (docs/phase-6-steps/app-feedback.md 23–28), light theme: the period
// form (FROM and TO each on the label's row, no placeholder, no « Période » heading over them), the period matching the
// app's rows (`updatedAt` ISO instants, a range picked in the form, `apply: 'button'`), the pager's square buttons, the
// set filter's count line, the selection box that keeps its square.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { filters } from '../src/filters.js';
import { pagination } from '../src/pagination.js';
import { FR } from '../src/locales/fr.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import { FR_PAGINATION } from '../src/locales/fr-pagination.js';
import { SET_CSS } from '../src/filters/set/styles.js';
import { PopupHost } from '../src/popup.js';
import { Scope } from '../src/render/scope.js';
import { cleanup, make, type R } from './support-filters.js';

afterEach(cleanup);
beforeEach(() => void ((window as unknown as { reportError: unknown }).reportError = () => {}));

type Row = R & { updatedAt: string };
/** Instants as the app's API writes them: an offset, microseconds (PostgreSQL), or a `Z`. */
const AT: readonly string[] = [
  '2026-10-04T21:59:59.999999Z', // 23:59:59.999 in Paris on 4 October: out of 5–6 October
  '2026-10-04T22:00:00.000000Z', // midnight in Paris on 5 October: in
  '2026-10-05T09:15:42.123456+02:00', // in
  '2026-10-06T21:59:59.999Z', // 23:59:59.999 in Paris on 6 October: in (the end day kept whole)
  '2026-10-06T22:00:00Z', // midnight in Paris on 7 October: out
  '2026-10-27T14:03:11.5+01:00', // out
];
const ROWS: Row[] = AT.map((updatedAt, i) => ({ id: `r${i}`, name: `p${i}`, n: i, updatedAt }));
const COLS: ColumnOrGroup<Row>[] = [
  { id: 'name', header: 'Nom' },
  { id: 'updatedAt', header: 'Mis à jour', type: 'instant', instantFormat: { date: true, time: false }, filter: { kind: 'instant', ops: ['betweenDays'] } } as never,
];
const FR_MSG = { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text, ...FR_PAGINATION.text } };
/** 2026-10-27 10:00 UTC. */
const NOW = Date.UTC(2026, 9, 27, 10, 0);

/** The app's setup: French, Paris, `apply: 'button'`, no zone line, one month, no shortcuts. */
function grid(zone = 'Europe/Paris', paged = false) {
  const feature = filters({ apply: 'button', dateZone: false, dateCalendar: { months: 1, presets: [] } });
  const features = paged ? [feature, pagination()] : [feature];
  const rows = paged ? Array.from({ length: 20 }, (_, i) => ROWS.map((r) => ({ ...r, id: `${r.id}-${i}` }))).flat() : ROWS;
  const t = make({ columns: COLS as never, rows, features, settings: { clock: () => NOW, locale: 'fr-FR', timeZone: zone, messages: FR_MSG, ...(paged && { pagination: { pageSize: 20 } }) } as never });
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  const q = <E extends Element = HTMLElement>(s: string) => popup()?.querySelector<E>(s) ?? null;
  const qa = <E extends Element = HTMLElement>(s: string) => [...(popup()?.querySelectorAll<E>(s) ?? [])];
  const inputs = () => qa<HTMLInputElement>('.dzg-fends .tz-dateinput__input');
  const day = (iso: string) => q<HTMLButtonElement>(`.dzg-fcal [data-date="${iso}"]:not([class*=outside])`)!;
  const type = (i: HTMLInputElement, text: string) => {
    i.focus();
    i.value = text;
    i.dispatchEvent(new InputEvent('input', { bubbles: true }));
    i.dispatchEvent(new FocusEvent('blur'));
  };
  const open = async () => {
    expect(feature.openFilter('updatedAt')).toBe(true);
    await vi.waitFor(() => expect(q('.dzg-fperiod')).not.toBeNull());
  };
  const apply = () => q<HTMLButtonElement>('.dzg-fapply')!.click();
  return { ...t, feature, popup, q, qa, inputs, day, type, open, apply };
}

describe('the period matches the app’s rows (app-feedback 28)', () => {
  it('two days picked in the calendar, then Appliquer: the rows of those whole days in Paris', async () => {
    const t = grid();
    await t.open();
    t.day('2026-10-05').click();
    t.day('2026-10-06').click();
    t.apply();
    expect(t.g.kernel.query.filter['updatedAt']).toEqual({ type: 'instant', op: 'betweenDays', day: '2026-10-05', dayTo: '2026-10-06' });
    expect(t.ids()).toEqual(['r1', 'r2', 'r3']);
  });

  it('FROM and TO typed (jj/mm/aaaa), then Entrée: the same rows', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const t = grid();
    await t.open();
    const [from, to] = t.inputs();
    t.type(from!, '05/10/2026');
    t.type(to!, '06/10/2026');
    vi.advanceTimersByTime(500);
    t.apply();
    expect(t.ids()).toEqual(['r1', 'r2', 'r3']);
  });

  it('one day (FROM = TO): that day only', async () => {
    const t = grid();
    await t.open();
    t.day('2026-10-27').click();
    t.day('2026-10-27').click();
    t.apply();
    expect(t.ids()).toEqual(['r5']);
  });

  it('in another zone the days are that zone’s (Los Angeles: 4 October 15:00 to 6 October 15:00 UTC is 5–6 October)', async () => {
    const t = grid('America/Los_Angeles');
    await t.open();
    t.day('2026-10-05').click();
    t.day('2026-10-06').click();
    t.apply();
    // 5 Oct 00:00 PDT = 07:00Z; 7 Oct 00:00 PDT = 7 Oct 07:00Z. r1 (4 Oct 22:00Z) is 4 Oct 15:00 there: out.
    expect(t.ids()).toEqual(['r2', 'r3', 'r4']);
  });

  it('paged as the app (20 a page), on page 4: Appliquer shows the matching rows, not an empty page', async () => {
    const t = grid('Europe/Paris', true);
    t.g.kernel.dispatch({ type: 'page.go', index: 3 }, 'user');
    await t.open();
    t.day('2026-10-05').click();
    t.day('2026-10-06').click();
    t.apply();
    expect(t.ids()).toHaveLength(20);
    expect(t.ids().every((id) => /^r[123]-/.test(id))).toBe(true);
    expect(t.host.querySelector<HTMLElement>('.dzg-overlay')!.hidden).toBe(true);
  });
});

describe('the period form (app-feedback 23)', () => {
  it('no placeholder in FROM or TO (no English dd/mm/yyyy in a French grid)', async () => {
    const t = grid();
    await t.open();
    expect(t.inputs().map((i) => i.placeholder)).toEqual(['', '']);
  });

  it('each label on its input’s row: the ends a two-column grid (labels, then fields), tzslot’s column undone outside the layer', async () => {
    const t = grid();
    await t.open();
    const css = document.querySelector('style[data-tzslot="dzg-period"]')!.textContent!;
    expect(css).toContain(':where(.dzg-fends){display:grid;grid-template-columns:auto 1fr;align-items:center;');
    // tzslot's sheet is unlayered (`.tz-dateinput{flex-direction:column}`): two classes, after the layer.
    expect(css.slice(css.lastIndexOf('}}'))).toContain('.dzg-fends .tz-dateinput{display:contents}');
    // Each end's label still names its field.
    expect(t.inputs().map((i) => i.getAttribute('aria-label'))).toEqual(['Du', 'Au']);
  });

  it('no « Période » heading over DU / AU: the form’s label steps aside, the group keeps the name', async () => {
    const t = grid();
    await t.open();
    const css = document.querySelector('style[data-tzslot="dzg-period"]')!.textContent!;
    expect(css).toContain(':where(.dzg-fdate:has(.dzg-fends)>.dzg-flabel){display:none}');
    expect(t.q('.dzg-fends')!.getAttribute('role')).toBe('group');
    expect(t.q('.dzg-fends')!.getAttribute('aria-label')).toBe('Période');
  });

  it('a little wider: the period form at least 18rem', async () => {
    const t = grid();
    await t.open();
    expect(document.querySelector('style[data-tzslot="dzg-period"]')!.textContent).toContain(':where(.dzg-fperiod){display:grid;gap:.5rem;min-inline-size:18rem}');
  });
});

describe('a popup keeps a margin from the window’s edge (app-feedback 23)', () => {
  const place = (dir: 'ltr' | 'rtl', left: number) => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    // The popup keeps inside the window less its scrollbars (the root's client box); none here.
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800);
    const root = document.createElement('div');
    const anchor = document.createElement('button');
    document.body.append(root, anchor);
    const box = (el: Element, r: { left: number; width: number }) =>
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ ...r, top: 100, height: 30, right: r.left + r.width, bottom: 130, x: r.left, y: 100, toJSON: () => ({}) } as DOMRect);
    box(anchor, { left, width: 150 });
    const p = new PopupHost(document, root, new Scope(), () => dir).open(anchor, document.createElement('div'), { placement: 'block-end' });
    box(p.el, { left: 0, width: 300 });
    p.reposition();
    const at = p.el.style.getPropertyValue('inset-inline-start');
    p.close();
    return at;
  };
  it('left to right: an anchor at the end puts the popup 8 px from the right edge', () => {
    expect(place('ltr', 850)).toBe('692px');
  });
  it('right to left: 8 px from the left edge', () => {
    expect(place('rtl', 0)).toBe('692px');
  });
  it('room enough: under its anchor, as before', () => {
    expect(place('ltr', 100)).toBe('100px');
  });
});

describe('the set filter’s count line has room (app-feedback 26)', () => {
  it('the form a grid with a gap between the search, the count and select all; the count line without a margin of its own', () => {
    expect(SET_CSS).toContain(':where(.dzg-fset){display:grid;gap:.5rem}');
    expect(SET_CSS).toContain(':where(.dzg-fstatus){margin:0;');
  });
});
