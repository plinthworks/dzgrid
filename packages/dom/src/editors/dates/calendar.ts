import { CALENDAR_CSS, TIMESELECT_CSS, createCalendar, createTimeSelect, type TimeSelectInstance } from '@tzslot/dom/lazy';
import type { PlainDate, PlainTime } from '@tzslot/core/lazy';
import { base, day, lost, named, styles, T } from '../../dates/shared.js';
import type { CalendarAdapter, CalendarView } from '../dates.js';
/** Temporal there before `open` (the loader waits for it). */
export { ready } from '../../dates/shared.js';

/**
 * The editors' calendar (Phase 5 step 6, step06-plan « Behaviour » 4–6; owner Q14, S6-O5), the only place
 * `@dzgrid/dom/editors` touches tzslot, reached by `import()` at the first open. A day: tzslot's calendar, a day
 * picked written and the dialog closed. An instant: the calendar and tzslot's hour and minute menus for that day in
 * the grid's zone (the hour a clock skips absent, the hour it repeats twice by its offsets, `readingStyle: 'named'`);
 * a day picked moves the focus to the hour menu, each menu change writes the field, Enter on a menu closes.
 */
export function open(a: CalendarAdapter): CalendarView {
  const at = a.kind === 'instant';
  styles(a, at ? [['calendar', CALENDAR_CSS], ['timeselect', TIMESELECT_CSS]] : [['calendar', CALENDAR_CSS]]);
  const { locale, today, messages, min, max } = base(a);
  const zone = a.ctx.timeZone;
  const z = at && typeof a.value === 'number' ? T.Instant.fromEpochMilliseconds(a.value).toZonedDateTimeISO(zone) : null;
  let date: PlainDate | null = z ? z.toPlainDate() : !at && typeof a.value === 'string' ? day(a.value) : null;
  let time: PlainTime | null = z ? z.toPlainTime() : null;
  let off: string | null = z ? z.offset : null;
  const doc = a.host.ownerDocument;
  // The reading chosen kept (`prefer`): a day without it, the compatible one.
  const ms = (): number =>
    T.ZonedDateTime.from({ year: date!.year, month: date!.month, day: date!.day, hour: time?.hour ?? 0, minute: time?.minute ?? 0, second: time?.second ?? 0, timeZone: zone, ...(off && { offset: off }) }, { offset: 'prefer' }).epochMilliseconds;
  const c = doc.createElement('div');
  const h = doc.createElement('div');
  a.host.append(c);
  let ts: TimeSelectInstance | null = null;
  const cal = createCalendar(c, {
    locale, today, messages, max, min: at ? day('1900-01-01') : min, value: date, injectStyles: false,
    ...(at && { isDateDisabled: lost(zone) }),
    onChange(d) {
      if (!d) return;
      date = d;
      if (!at) return a.pick(d.toString()), a.close();
      ts!.update({ date: d });
      a.pick(ms());
      h.querySelector<HTMLElement>('select')?.focus();
    },
  });
  if (at) {
    a.host.append(h);
    ts = createTimeSelect(h, {
      value: time, offset: off, date, timeZone: zone, readingStyle: 'named', hour12: false, locale, messages, injectStyles: false,
      onChange(t, o) {
        if (!t || !date) return;
        time = t;
        off = o;
        a.pick(ms());
      },
    });
    h.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), a.close()));
  }
  const stop = named(a.host);
  return {
    focus: () => c.querySelector<HTMLElement>('button[data-date][tabindex="0"]')?.focus(),
    destroy() {
      stop();
      cal.destroy();
      ts?.destroy();
    },
  };
}
