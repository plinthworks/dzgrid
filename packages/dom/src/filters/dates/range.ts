import { RELATIVE_RANGES, type RelativeRange } from '@dzgrid/core';
import { CALENDAR_CSS, createDateInput, createDateRange, DATEINPUT_CSS, RANGE_CSS, TIME_CSS, type DateInputInstance, type WallValue } from '@tzslot/dom/lazy';
import { presetRange, type PlainDate, type PlainTime } from '@tzslot/core/lazy';
import type { DateAdapter, DateField, DatePart } from '../dates.js';
import { base, day, lost, named, styles, T } from './shared.js';
/** Temporal there before `adapt` (the loader waits for it). */
export { ready } from './shared.js';

/**
 * The form's layout (no colour; layered, zero specificity, logical sides), owner's second look (app-feedback 23): each
 * end's label on its field's row, the labels one column and the fields the next (a two-column grid, each tzslot field
 * `display: contents`); the form at least 18rem, the shortcuts wrapping in it; no « Période » over DU / AU (the group keeps
 * the name). tzslot's sheet is unlayered (`.tz-dateinput{flex-direction:column}`): its field undone by two classes
 * after the layer, as `FILTERS_CSS` does for its trigger. Its input fills the field's box (owner's third look,
 * app-feedback 30: tzslot gives it 8.5rem, half the box, and the theme's ring then drew a box inside the box).
 */
const PERIOD_CSS =
  '@layer dzgrid.layout{:where(.dzg-fperiod){display:grid;gap:.5rem;min-inline-size:18rem}' +
  ':where(.dzg-fends){display:grid;grid-template-columns:auto 1fr;align-items:center;gap:.5rem}' +
  ':where(.dzg-fpresets){display:flex;flex-wrap:wrap;gap:.5rem}' +
  ':where(.dzg-fdate:has(.dzg-fends)>.dzg-flabel){display:none}}' +
  '.dzg-fends .tz-dateinput{display:contents}.dzg-fends .tz-dateinput__input{flex:1;width:0}';

/**
 * The `range` kit, in the popup itself (feedback pass K, owner Q2: « un popup juste qui s'ouvre en dessous de
 * l'en-tête »): FROM and TO typed fields (tzslot's `createDateInput`), tzslot's inline calendar (`createDateRange`,
 * one month unless `dateCalendar.months`), and the shortcuts as buttons (six, or `dateCalendar.presets`), composed
 * here: no field, no panel of its own, so nothing outside the popup and no Escape but the popup's. A day column's
 * between (both days in, no zone said: no summary, so T6 has nothing to hide) and an instant's between days (the
 * grid's zone); an instant's between two moments (`[at, atTo)`, each end with its hour, no shortcut, a day the zone
 * never had greyed: T7). A shortcut pressed is `{range}`; a period by hand, its days or moments; one end, TO before
 * FROM, or a period that holds nothing, null (L1 keeps the filter in force).
 */
export function adapt(a: DateAdapter): DateField {
  const moments = a.kind === 'instant' && a.op === 'between';
  styles(a, [['range', RANGE_CSS], ['dateinput', DATEINPUT_CSS], ['calendar', CALENDAR_CSS], ...(moments ? [['time', TIME_CSS] as const] : []), ['dzg-period', PERIOD_CSS]]);
  const [from, to] = a.kind === 'day' ? ['value', 'valueTo'] as const : ['day', 'dayTo'] as const;
  const doc = a.host.ownerDocument;
  const div = (cls: string): HTMLDivElement => Object.assign(doc.createElement('div'), { className: cls });
  const box = div('dzg-fperiod');
  const ends = div('dzg-fends');
  const cal = div('dzg-fcal');
  const list = div('dzg-fpresets');
  ends.setAttribute('role', 'group');
  box.append(ends, cal, list);
  a.host.append(box);
  const zone = (): string => a.settings().ctx.timeZone;
  const months = (): number => a.settings().calendar?.months ?? 1;
  /** What the form holds: each end's day and (moments) hour; the shortcut pressed. */
  let s: PlainDate | null = null;
  let e: PlainDate | null = null;
  let st: PlainTime | null = null;
  let et: PlainTime | null = null;
  let range: RelativeRange | null = null;
  // No placeholder (owner's second look, app-feedback 23: the label beside each field says it, and tzslot's pattern
  // was English in a French grid). The name is each end's own label, not the form's.
  const opts = () => ({ ...base(a.settings()), ariaLabel: undefined });
  const at = (d: PlainDate, t: PlainTime | null): string | null => {
    const i = d.toZonedDateTime({ timeZone: zone(), ...(t && { plainTime: t }) }).toInstant().toString({ fractionalSecondDigits: 3 });
    return i.length === 24 ? i : null;
  };
  /** The draft: a shortcut, the days, the moments, or null. */
  const read = (): DatePart | null => {
    if (range) return { range };
    if (!s || !e) return null;
    if (!moments) return T.PlainDate.compare(s, e) > 0 ? null : { [from]: s.toString(), [to]: e.toString() };
    const f = at(s, st);
    const t = at(e, et);
    return f && t && f < t ? { at: f, atTo: t } : null;
  };
  /** The fields, the calendar and the shortcuts drawn from what the form holds (an update reports nothing). */
  const paint = (): void => {
    const o = opts();
    if (range) {
      const r = presetRange(range, { today: o.today });
      s = r.start;
      e = r.end;
    }
    fields.map((f, i) => f.update({ ...o, value: i ? { date: e, time: et } : { date: s, time: st } }));
    ends.setAttribute('aria-label', a.settings().label);
    w.update({ ...o, value: { start: s, end: e }, months: months() });
    for (const b of list.children) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset['range'] === range));
  };
  const fields = [0, 1].map((i) => {
    const h = div('');
    ends.append(h);
    const m = base(a.settings()).messages;
    return createDateInput(h, {
      ...opts(), injectStyles: false, withTime: moments, timeZone: zone(), icon: null, label: i ? m.to : m.from,
      // Typed: after the form's pause; the calendar follows.
      onChange(v: WallValue) {
        range = null;
        if (i) (e = v.date), (et = v.time);
        else (s = v.date), (st = v.time);
        paint();
        a.changed(false);
      },
    });
  }) as [DateInputInstance, DateInputInstance];
  const w = createDateRange(cal, {
    ...opts(), injectStyles: false, months: months(), blockAcrossDisabled: false,
    ...(moments && { isDateDisabled: lost(zone()) }),
    onChange(v) {
      range = null;
      s = v.start;
      e = v.end;
      paint();
      a.changed(true);
    },
  });
  // The shortcuts (owner Q5): none between two moments; the host's list (`dateCalendar.presets`), or the six.
  for (const name of moments ? [] : (a.settings().calendar?.presets ?? RELATIVE_RANGES)) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'dzg-fpreset';
    b.dataset['range'] = name;
    b.addEventListener('click', () => {
      range = name;
      paint();
      a.changed(true);
    });
    list.append(b);
  }
  const texts = (): void => {
    const m = base(a.settings()).messages;
    for (const b of list.children) b.textContent = m.presets[(b as HTMLElement).dataset['range'] as RelativeRange];
  };
  texts();
  // The month title's name says the month it shows (T9).
  const stop = named(cal);
  return {
    write(p) {
      range = p?.range ?? null;
      const f = p?.[moments ? 'at' : from];
      const t = p?.[moments ? 'atTo' : to];
      const z = (v: string) => T.Instant.from(v).toZonedDateTimeISO(zone());
      if (moments) [s, st, e, et] = [f ? z(f).toPlainDate() : null, f ? z(f).toPlainTime() : null, t ? z(t).toPlainDate() : null, t ? z(t).toPlainTime() : null];
      else [s, e] = [f ? day(f) : null, t ? day(t) : null];
      paint();
      if (s) w.goTo({ year: s.year, month: s.month });
    },
    read,
    update() {
      texts();
      paint();
    },
    closePanel: () => false,
    focus: () => fields[0].focus(),
    destroy() {
      stop();
      w.destroy();
      for (const f of fields) f.destroy();
      box.remove();
    },
  };
}
