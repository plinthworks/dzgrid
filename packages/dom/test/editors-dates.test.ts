// The day and instant editors (Phase 5 step 6, docs/phase-5-steps/step06-plan.md « Behaviour » 1–10; editors.md
// 6–9; owner Q14, S6-O4, S6-O5): the opening text per locale, read back by the codec; the clock change refusals;
// the written-value rule; the calendar button and Alt+Down, a modal dialog loaded on demand (never at setup, never
// by typing), its loading line, its failure and Retry; Escape twice; the pick. A stub kit (`loadCalendar`) makes
// loading deterministic; the real tzslot calendar runs under jsdom (its Temporal polyfill) for the picks.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { dayCodec, instantCodec, type ColumnDef } from '@dzgrid/core';
import type { CalendarAdapter, CalendarKit } from '../src/editors.js';
import { ed, cleanup, k, rowsOf, settle, tick, type R } from './support-editors.js';

afterEach(cleanup);
let reported: unknown[] = [];
beforeEach(() => {
  reported = [];
  (window as unknown as { reportError: unknown }).reportError = (e: unknown) => void reported.push(e);
});
afterEach(() => void delete (window as unknown as { reportError?: unknown }).reportError);

type Row = R & { d: string | null; t: string | null };
/** 2026-10-19 10:00 UTC. */
const NOW = Date.UTC(2026, 9, 19, 10, 0);
const COLS: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'd', header: 'Jour', type: 'day', width: 120, editable: true },
  { id: 't', header: 'Heure', type: 'instant', width: 160, editable: true },
];

interface G {
  readonly lang?: 'en' | 'fr' | 'ar';
  readonly locale?: string;
  readonly zone?: string;
  readonly numerals?: 'latn' | 'locale';
  readonly d?: string | null;
  readonly t?: string | null;
  readonly options?: Record<string, unknown>;
  readonly clock?: number;
  readonly host?: HTMLElement;
  readonly settings?: Record<string, unknown>;
}
function grid(o: G = {}) {
  const rows = rowsOf(20).map((r) => ({ ...r, d: o.d === undefined ? '2026-03-29' : o.d, t: o.t === undefined ? '2026-03-29T10:05:00Z' : o.t })) as Row[];
  const t = ed({
    lang: o.lang ?? 'fr', columns: COLS as never, rows: rows as never, options: o.options as never, ...(o.host && { host: o.host }),
    settings: { locale: o.locale ?? (o.lang === 'ar' ? 'ar-DZ' : o.lang === 'en' ? 'en-US' : 'fr-FR'), timeZone: o.zone ?? 'Europe/Paris', clock: () => o.clock ?? NOW, ...(o.numerals && { numerals: o.numerals }), ...o.settings } as never,
  });
  const open = (id = 'r1', col = 'd', key = 'F2') => {
    t.at(id, col);
    t.key(key);
    return t.field()!;
  };
  const box = () => t.host.querySelector<HTMLElement>('.dzg-datebox');
  const button = () => t.host.querySelector<HTMLButtonElement>('.dzg-datebox button');
  const dialog = () => document.querySelector<HTMLElement>('.dzg-popup[role=dialog]');
  const altDown = () => t.key('ArrowDown', { altKey: true }, t.field()!);
  const saved = () => t.of('cellEdited').map((e) => [e.column, e.value]);
  return { ...t, open, box, button, dialog, altDown, saved };
}

/** A kit of our own: draws one button, hands its adapter out, reports what it was told. */
function stubKit(o: { onOpen?: (a: CalendarAdapter) => void } = {}) {
  const seen: CalendarAdapter[] = [];
  const kit: CalendarKit = {
    open(a) {
      seen.push(a);
      const b = document.createElement('button');
      b.className = 'stub-day';
      b.textContent = 'day';
      a.host.append(b);
      o.onOpen?.(a);
      return { focus: () => b.focus(), destroy: () => b.remove() };
    },
  };
  return { kit, seen };
}
const deferred = <T,>() => {
  let ok!: (v: T) => void;
  let no!: (e: unknown) => void;
  const p = new Promise<T>((a, b) => ((ok = a), (no = b)));
  return { p, ok, no };
};

describe('the opening text (Behaviour 2)', () => {
  it('a day as numbers in the locale’s order, two-digit day and month, four-digit year, its separator — read back by the codec', () => {
    const cases: [string, 'latn' | 'locale' | undefined, string][] = [
      ['fr-FR', undefined, '29/03/2026'],
      ['en-US', undefined, '03/29/2026'],
      ['de-DE', undefined, '29.03.2026'],
      ['ja-JP', undefined, '2026/03/29'],
      ['ar-EG', 'locale', '٢٩/٠٣/٢٠٢٦'],
    ];
    for (const [locale, numerals, want] of cases) {
      const t = grid({ locale, ...(numerals && { numerals }), lang: locale.startsWith('ar') ? 'ar' : 'fr' });
      const f = t.open();
      expect(f.value, locale).toBe(want);
      expect(dayCodec.parse(f.value, t.ctx.ctx), locale).toBe('2026-03-29');
      cleanup();
    }
  });

  it('an instant: that day in the grid’s zone, then HH:mm (24 h); :ss only when not 0; read back by the codec', () => {
    let t = grid();
    let f = t.open('r1', 't');
    expect(f.value).toBe('29/03/2026 12:05');
    expect(instantCodec().parse(f.value, t.ctx.ctx)).toBe(Date.UTC(2026, 2, 29, 10, 5));
    cleanup();
    t = grid({ t: '2026-03-29T10:05:30Z', zone: 'America/Los_Angeles', locale: 'en-US', lang: 'en' });
    f = t.open('r1', 't');
    expect(f.value).toBe('03/29/2026 03:05:30');
    cleanup();
    t = grid({ t: '2026-01-01T23:30:00Z', zone: 'Pacific/Auckland' });
    expect(t.open('r1', 't').value).toBe('02/01/2026 12:30');
  });

  it('isolated left to right, no spell check, no numeric pad, the calendar announced; the example is today, never the label', () => {
    const t = grid({ lang: 'ar' });
    const f = t.open();
    expect(f.getAttribute('dir')).toBe('ltr');
    expect(f.getAttribute('spellcheck')).toBe('false');
    expect(f.hasAttribute('inputmode')).toBe(false);
    // A text box may not carry aria-expanded (axe aria-allowed-attr, found in Chrome): a combobox opening a dialog (ARIA 1.2).
    expect(f.getAttribute('role')).toBe('combobox');
    expect(f.getAttribute('aria-haspopup')).toBe('dialog');
    expect(f.getAttribute('aria-expanded')).toBe('false');
    expect(f.getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowDown');
    expect(f.placeholder).toBe('19/10/2026');
    expect(t.box()!.getAttribute('data-dzg-owner')).toBe('editor');
    expect(f.closest('.dzg-cell')).toBe(t.cell('r1', 'd'));
    t.key('Escape', {}, f);
    expect(t.open('r1', 't').placeholder).toBe('19/10/2026 00:00');
  });

  it('a day not given opens empty; a cleared field keeps null', () => {
    const t = grid({ d: null });
    expect(t.open().value).toBe('');
    t.key('Enter', {}, t.field()!);
    expect(t.saved()).toEqual([]);
  });

  it('a day that does not read: the bubble quotes the example (validation.day {pattern})', () => {
    const t = grid();
    t.open();
    t.type('31/02/2026');
    t.key('Enter', {}, t.field()!);
    expect(t.field()).not.toBeNull();
    expect(t.bubble()!.textContent).toBe('date attendue (19/10/2026)');
    expect(t.saved()).toEqual([]);
  });
});

describe('clock changes and the written-value rule (Behaviour 3)', () => {
  it('typed in the hour a clock skips (Paris 29/03/2026 02:30): refused, the field kept open', () => {
    const t = grid();
    t.open('r1', 't');
    t.type('29/03/2026 02:30');
    t.key('Enter', {}, t.field()!);
    expect(t.field()!.getAttribute('aria-invalid')).toBe('true');
    expect(t.bubble()!.textContent).toBe('cette heure n’existe pas ce jour-là (changement d’heure)');
    expect(t.saved()).toEqual([]);
  });

  it('typed in the hour a clock repeats (25/10/2026 02:30): refused as ambiguous', () => {
    const t = grid();
    t.open('r1', 't');
    t.type('25/10/2026 02:30');
    t.key('Enter', {}, t.field()!);
    expect(t.bubble()!.textContent).toBe('cette heure existe deux fois ce jour-là');
  });

  it('an untouched stored second reading (02:30 +01:00): Enter saves nothing and refuses nothing', () => {
    const t = grid({ t: '2026-10-25T01:30:00Z' });
    const f = t.open('r1', 't');
    expect(f.value).toBe('25/10/2026 02:30');
    t.key('Enter', {}, f);
    expect(t.field()).toBeNull();
    expect(t.bubble()?.hidden ?? true).toBe(true);
    expect(t.saved()).toEqual([]);
    expect(t.of('editingStopped').map((e) => e.kept)).toEqual([true]);
  });

  it('a typed change goes through the codec; the same text typed back is the same value (nothing saved)', () => {
    const t = grid();
    t.open();
    t.type('30/03/2026');
    t.key('Enter', {}, t.field()!);
    expect(t.saved()).toEqual([['d', '2026-03-30']]);
    t.open('r2');
    t.type('29/03/2026');
    t.key('Enter', {}, t.field()!);
    expect(t.saved()).toEqual([['d', '2026-03-30']]);
  });
});

describe('the calendar, loaded on demand (Behaviour 4, 6, 8)', () => {
  it('never imported at setup, nor by opening or typing in the field; prefetched by the button’s pointerenter; imported once', async () => {
    const { kit } = stubKit();
    const load = vi.fn(() => Promise.resolve(kit));
    const t = grid({ options: { loadCalendar: load } });
    const f = t.open();
    t.type('3');
    f.dispatchEvent(new FocusEvent('focus'));
    expect(load).not.toHaveBeenCalled();
    t.button()!.dispatchEvent(new Event('pointerenter'));
    expect(load).toHaveBeenCalledTimes(1);
    t.altDown();
    await settle();
    expect(t.dialog()!.querySelector('.stub-day')).not.toBeNull();
    t.key('Escape', {}, document.activeElement!);
    t.altDown();
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('Alt+Down and the button open a modal dialog named edit.calendar, the field says it is expanded; Tab keeps its step-5 meaning', async () => {
    const { kit } = stubKit();
    const t = grid({ options: { loadCalendar: () => Promise.resolve(kit) } });
    const f = t.open();
    const b = t.button()!;
    expect(b.getAttribute('aria-label')).toBe('Ouvrir le calendrier');
    expect(b.tabIndex).toBe(-1);
    expect(t.altDown().defaultPrevented).toBe(true);
    await settle();
    const d = t.dialog()!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.getAttribute('aria-label')).toBe('Ouvrir le calendrier');
    expect(f.getAttribute('aria-expanded')).toBe('true');
    expect(f.getAttribute('aria-controls')).toBe(d.id);
    expect(document.activeElement!.className).toBe('stub-day');
    t.key('Escape', {}, document.activeElement!);
    expect(t.dialog()).toBeNull();
    b.click();
    await settle();
    expect(t.dialog()).not.toBeNull();
  });

  it('while it loads: the status line, aria-busy, the focus on the dialog’s box; then the view, focused', async () => {
    const { kit } = stubKit();
    const w = deferred<CalendarKit>();
    const t = grid({ options: { loadCalendar: () => w.p } });
    t.open();
    t.altDown();
    const d = t.dialog()!;
    expect(d.querySelector('[aria-busy=true]') ?? (d.getAttribute('aria-busy') === 'true' ? d : null)).not.toBeNull();
    expect(d.querySelector('[role=status]')!.textContent).toBe('Chargement du calendrier');
    expect(d.contains(document.activeElement)).toBe(true);
    // The field still works meanwhile: the dialog's focus is no blur.
    await tick();
    expect(t.field()).not.toBeNull();
    w.ok(kit);
    await settle();
    expect(d.querySelector('[role=status]')).toBeNull();
    expect(d.querySelector('[aria-busy]')).toBeNull();
    expect(document.activeElement!.className).toBe('stub-day');
  });

  it('a failure: the alert and Retry (the base’s grid.retry), reported; Retry imports again, the focus stays in the dialog', async () => {
    const { kit } = stubKit();
    let n = 0;
    const load = vi.fn(() => (++n === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(kit)));
    const t = grid({ options: { loadCalendar: load } });
    t.open();
    t.altDown();
    await settle();
    const d = t.dialog()!;
    expect(d.querySelector('[role=alert]')!.textContent).toBe('Le calendrier n’a pas pu se charger');
    const retry = d.querySelector<HTMLButtonElement>('button.dzg-fretry')!;
    expect(retry.textContent).toBe('Réessayer');
    expect(reported).toHaveLength(1);
    retry.focus();
    retry.click();
    expect(d.contains(document.activeElement)).toBe(true);
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(d.querySelector('[role=alert]')).toBeNull();
    expect(d.querySelector('.stub-day')).not.toBeNull();
  });

  it('a chunk without open, or whose open throws: a failure, its half-built nodes removed', async () => {
    let t = grid({ options: { loadCalendar: () => Promise.resolve({}) } });
    t.open();
    t.altDown();
    await settle();
    expect(t.dialog()!.querySelector('[role=alert]')).not.toBeNull();
    cleanup();
    const bad: CalendarKit = { open(a) { a.host.append(Object.assign(document.createElement('span'), { className: 'half' })); throw new Error('boom'); } };
    t = grid({ options: { loadCalendar: () => Promise.resolve(bad) } });
    t.open();
    t.altDown();
    await settle();
    expect(t.dialog()!.querySelector('.half')).toBeNull();
    expect(t.dialog()!.querySelector('[role=alert]')).not.toBeNull();
    expect(reported.length).toBeGreaterThan(0);
  });

  it('closed before the chunk arrives: nothing mounted; the grid destroyed with the dialog open: the popup gone', async () => {
    const { kit, seen } = stubKit();
    const w = deferred<CalendarKit>();
    const t = grid({ options: { loadCalendar: () => w.p } });
    t.open();
    t.altDown();
    t.key('Escape', {}, document.activeElement!);
    expect(t.dialog()).toBeNull();
    w.ok(kit);
    await settle();
    expect(seen).toHaveLength(0);
    t.altDown();
    await settle();
    expect(t.dialog()).not.toBeNull();
    t.g.destroy();
    expect(document.querySelector('.dzg-popup')).toBeNull();
  });

  it('calendar: false — no button, Alt+Down does nothing, nothing ever imported', () => {
    const load = vi.fn();
    const t = grid({ options: { calendar: false, loadCalendar: load } });
    const f = t.open();
    expect(t.button()).toBeNull();
    expect(f.hasAttribute('aria-haspopup')).toBe(false);
    expect(f.hasAttribute('role')).toBe(false);
    expect(f.hasAttribute('aria-keyshortcuts')).toBe(false);
    t.altDown();
    expect(t.dialog()).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('a pick writes the field and closes the dialog, focus back in the field (caret at the end); Enter: one save', async () => {
    const { kit } = stubKit({ onOpen: (a) => queueMicrotask(() => (a.pick('2026-04-02'), a.close())) });
    const t = grid({ options: { loadCalendar: () => Promise.resolve(kit) } });
    const f = t.open();
    t.altDown();
    await settle();
    expect(t.dialog()).toBeNull();
    expect(f.value).toBe('02/04/2026');
    expect(document.activeElement).toBe(f);
    expect(f.selectionStart).toBe(f.value.length);
    expect(f.getAttribute('aria-expanded')).toBe('false');
    t.key('Enter', {}, f);
    expect(t.saved()).toEqual([['d', '2026-04-02']]);
  });

  it('the kit is told the field’s day when it reads, else the cell’s; today by the clock in the grid’s zone', async () => {
    const { kit, seen } = stubKit();
    const t = grid({ zone: 'Pacific/Auckland', clock: Date.UTC(2026, 9, 19, 12, 0), options: { loadCalendar: () => Promise.resolve(kit) } });
    t.open();
    t.type('05/04/2026');
    t.altDown();
    await settle();
    expect(seen[0]!.value).toBe('2026-04-05');
    expect(seen[0]!.today).toBe('2026-10-20');
    expect(seen[0]!.kind).toBe('day');
    t.key('Escape', {}, document.activeElement!);
    t.type('nonsense');
    t.altDown();
    await settle();
    expect(seen[1]!.value).toBe('2026-03-29');
  });

  it('Escape twice: the calendar first (the field stays, focused), then the edit (nothing saved)', async () => {
    const { kit } = stubKit();
    const t = grid({ options: { loadCalendar: () => Promise.resolve(kit) } });
    const f = t.open();
    t.type('30/03/2026');
    t.altDown();
    await settle();
    t.key('Escape', {}, document.activeElement!);
    expect(t.dialog()).toBeNull();
    expect(t.field()).toBe(f);
    expect(document.activeElement).toBe(f);
    t.key('Escape', {}, f);
    expect(t.field()).toBeNull();
    expect(t.saved()).toEqual([]);
  });

  it('a press outside closes the dialog; the field’s blur rule then keeps what was typed (Q5)', async () => {
    const { kit } = stubKit();
    const t = grid({ options: { loadCalendar: () => Promise.resolve(kit) } });
    t.open();
    t.type('30/03/2026');
    t.altDown();
    await settle();
    const out = document.createElement('button');
    document.body.append(out);
    out.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    out.focus();
    expect(t.dialog()).toBeNull();
    await tick();
    await tick();
    expect(t.field()).toBeNull();
    expect(t.saved()).toEqual([['d', '2026-03-30']]);
  });
});

describe('the real calendar (tzslot under jsdom)', () => {
  const real = async (o: G = {}) => {
    const t = grid(o);
    t.open('r1', o.t !== undefined ? 't' : 'd');
    t.altDown();
    await vi.waitFor(() => expect(t.dialog()!.querySelector('.tz-cal')).not.toBeNull());
    return t;
  };

  it('a day: the focus on the cell’s day; a day pressed writes the field, closes, the field focused; Enter saves that Day', async () => {
    const t = await real();
    expect((document.activeElement as HTMLElement).dataset['date']).toBe('2026-03-29');
    t.dialog()!.querySelector<HTMLButtonElement>('[data-date="2026-03-12"]')!.click();
    expect(t.dialog()).toBeNull();
    expect(t.field()!.value).toBe('12/03/2026');
    expect(document.activeElement).toBe(t.field());
    t.key('Enter', {}, t.field()!);
    expect(t.saved()).toEqual([['d', '2026-03-12']]);
  });

  it('today is the clock’s day in the grid’s zone; bounds and words from tzslot; the named rule on the dialog', async () => {
    const t = await real({ zone: 'Pacific/Auckland', clock: Date.UTC(2026, 9, 19, 12, 0), d: '2026-10-05' });
    expect(t.dialog()!.querySelector<HTMLElement>('.tz-cal__day--today')!.dataset['date']).toBe('2026-10-20');
  });

  it('ar-SA: a Gregorian calendar (March, not a Hijri month)', async () => {
    const t = await real({ lang: 'ar', locale: 'ar-SA' });
    expect(t.dialog()!.textContent).toMatch(/مارس/);
  });

  it('an instant: the hour menu of 25/10/2026 in Paris offers 02 twice (summer, winter); 29/03/2026 none', async () => {
    let t = await real({ t: '2026-10-25T08:00:00Z' });
    const hours = () => [...t.dialog()!.querySelectorAll<HTMLOptionElement>('select[data-part=hour] option')].map((x) => x.value);
    expect(hours().filter((v) => v.startsWith('2|'))).toEqual(['2|+02:00', '2|+01:00']);
    cleanup();
    t = await real({ t: '2026-03-29T08:00:00Z' });
    expect(hours().filter((v) => v.startsWith('2|'))).toEqual([]);
  });

  it('the winter reading picked is kept as picked: 25/10/2026 02:30 +01:00 → 01:30 UTC', async () => {
    const t = await real({ t: '2026-10-25T00:30:00Z' });
    const hour = t.dialog()!.querySelector<HTMLSelectElement>('select[data-part=hour]')!;
    expect(hour.value).toBe('2|+02:00');
    hour.value = '2|+01:00';
    hour.dispatchEvent(new Event('change', { bubbles: true }));
    expect(t.field()!.value).toBe('25/10/2026 02:30');
    hour.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(t.dialog()).toBeNull();
    t.key('Enter', {}, t.field()!);
    expect(t.saved()).toEqual([['t', Date.UTC(2026, 9, 25, 1, 30)]]);
  });

  it('an instant: a day picked moves the focus to the hour menu, the time kept; the field written', async () => {
    const t = await real({ t: '2026-03-29T10:05:00Z' });
    t.dialog()!.querySelector<HTMLButtonElement>('[data-date="2026-03-31"]')!.click();
    expect(t.dialog()).not.toBeNull();
    expect((document.activeElement as HTMLElement).dataset['part']).toBe('hour');
    expect(t.field()!.value).toBe('31/03/2026 12:05');
  });

  it('Samoa’s lost day (Pacific/Apia, 2011-12-30) is disabled', async () => {
    const t = await real({ zone: 'Pacific/Apia', t: '2011-12-29T12:00:00Z' });
    expect(t.dialog()!.querySelector<HTMLButtonElement>('[data-date="2011-12-30"]')!.disabled).toBe(true);
    expect(t.dialog()!.querySelector<HTMLButtonElement>('[data-date="2011-12-29"]')!.disabled).toBe(false);
  });

  it('in a shadow root: tzslot’s sheets in that root, with the grid’s nonce', async () => {
    // The earlier tests' sheets went into the document: this one must not add any there.
    for (const st of document.head.querySelectorAll('style[data-tzslot]')) st.remove();
    const outer = document.body.appendChild(document.createElement('div'));
    const root = outer.attachShadow({ mode: 'open' });
    const host = root.appendChild(document.createElement('div'));
    const t = grid({ host, settings: { nonce: 'n0nce' } });
    t.g.api.focusCell(k('r1'), 'd');
    const cell = t.cell('r1', 'd')!;
    cell.focus();
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true, composed: true }));
    const f = host.querySelector<HTMLInputElement>('.dzg-field')!;
    f.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true, composed: true }));
    await vi.waitFor(() => expect(root.querySelector('style[data-tzslot="calendar"]')).not.toBeNull());
    expect(root.querySelector('style[data-tzslot="calendar"]')!.getAttribute('nonce')).toBe('n0nce');
    expect(document.head.querySelector('style[data-tzslot="calendar"]')).toBeNull();
  });
});
