import { RELATIVE_RANGES, type RelativeRange } from '@dzgrid/core';
import { CALENDAR_CSS, createRangeField, DATEINPUT_CSS, DATETIME_CSS, FIELD_CSS, RANGE_CSS, RANGEFIELD_CSS, TIME_CSS, TIMESELECT_CSS, type RangeFieldValue } from '@tzslot/dom';
import type { Instant } from '@tzslot/core';
import type { DateAdapter, DateField, DatePart } from '../dates.js';
import { base, day, lost, muter, named, styles, T } from './shared.js';

const NONE: RangeFieldValue = { start: null, end: null };

/**
 * The `range` kit: tzslot's period field. A day column's between (both days in, drawn on UTC
 * midnights only as carriers, the zone hidden from its summary: T6) and an instant's between days
 * (the grid's zone), each with the six shortcuts (owner Q5); an instant's between two moments
 * (`[at, atTo)`, no shortcuts). The host may ask for fewer months or shortcuts (`dateCalendar`).
 * A shortcut pressed is `{range}`; a period by hand, its days or moments; one end, or a period that
 * holds nothing, null (L1 keeps the filter in force).
 */
export function adapt(a: DateAdapter): DateField {
  styles(a, [['field', FIELD_CSS], ['range', RANGE_CSS], ['rangefield', RANGEFIELD_CSS], ['dateinput', DATEINPUT_CSS], ['datetime', DATETIME_CSS], ['timeselect', TIMESELECT_CSS], ['time', TIME_CSS], ['calendar', CALENDAR_CSS]]);
  const days = a.kind === 'day';
  const moments = !days && a.op === 'between';
  const [from, to] = days ? ['value', 'valueTo'] as const : ['day', 'dayTo'] as const;
  const zone = (): string => (days ? 'UTC' : a.settings().ctx.timeZone);
  const mute = muter();
  let cur: DatePart | null = null;
  const opts = () => {
    const s = a.settings();
    const b = base(s);
    const presets = moments ? [] : [...(s.calendar?.presets ?? RELATIVE_RANGES)];
    return {
      ...b, timeZone: zone(), title: s.label, showTime: moments,
      // The host's calendar (`filters({ dateCalendar })`, checked there), or two months and the six
      // shortcuts; none between two moments. An empty list hides the shortcut column.
      months: s.calendar?.months ?? 2, presets, showPresets: presets.length > 0,
      clearable: false, confirm: false, readingStyle: 'named' as const, blockAcrossDisabled: false,
      ...(days && { messages: { ...b.messages, periodSummary: ({ length }: { length: string }) => length } }),
      ...(moments && { min: day('1900-01-01'), isDateDisabled: lost(s.ctx.timeZone) }),
    };
  };
  const start = (d: string): Instant => day(d).toZonedDateTime({ timeZone: zone() }).toInstant();
  const dayOf = (i: Instant, back = 0): string => i.toZonedDateTimeISO(zone()).toPlainDate().subtract({ days: back }).toString();
  const iso = (i: Instant): string | null => {
    const s = i.toString({ fractionalSecondDigits: 3 });
    return s.length === 24 ? s : null;
  };
  const read = (v: RangeFieldValue, preset: string | null): DatePart | null => {
    if (RELATIVE_RANGES.has(preset as RelativeRange)) return { range: preset as RelativeRange };
    if (!v.start || !v.end || T.Instant.compare(v.start, v.end) >= 0) return null;
    if (!moments) return { [from]: dayOf(v.start), [to]: dayOf(v.end, 1) };
    const at = iso(v.start);
    const atTo = iso(v.end);
    return at && atTo ? { at, atTo } : null;
  };
  const value = (p: DatePart | null): RangeFieldValue => {
    const f = p?.[moments ? 'at' : from];
    const t = p?.[moments ? 'atTo' : to];
    const end = (d: string): Instant => start(day(d).add({ days: 1 }).toString());
    return moments
      ? { start: f ? T.Instant.from(f) : null, end: t ? T.Instant.from(t) : null }
      : { start: f ? start(f) : null, end: t ? end(t) : null };
  };
  const w = createRangeField(a.host, {
    ...opts(), container: a.panel, injectStyles: false,
    onChange(v, how) {
      if (mute.on) return;
      cur = read(v, how.preset);
      a.changed(true);
    },
  });
  const stop = named(a.host, a.panel);
  const write = (): void =>
    mute.run(() => {
      // A shortcut handed back is resolved again against today (tzslot's `preset`), after the
      // value is emptied: the name it last applied would be an echo, not news.
      w.update({ value: cur?.range ? NONE : value(cur) });
      if (cur?.range) w.update({ preset: cur.range });
    });
  return {
    write(p) {
      cur = p;
      write();
    },
    // The host's own days or moments, once the widget can hold them: a round trip through the
    // widget's instants would rewrite a period it was never asked to change (Apia's lost
    // 2011-12-30 starts where the 31st does).
    read: () => cur && (cur.range ? { range: cur.range } : read(value(cur), null) && (moments ? { at: cur.at!, atTo: cur.atTo! } : { [from]: cur[from]!, [to]: cur[to]! })),
    update() {
      mute.run(() => w.update(opts()));
      write();
    },
    closePanel: () => w.isOpen && (w.close(), true),
    focus: () => a.host.querySelector<HTMLElement>('.tz-field__trigger')?.focus(),
    destroy() {
      stop();
      w.destroy();
    },
  };
}
