import { CALENDAR_CSS, createDateTimeField, DATETIME_CSS, FIELD_CSS, TIME_CSS } from '@tzslot/dom/lazy';
import type { DateAdapter, DateField } from '../dates.js';
import { base, day, lost, muter, named, styles, T } from './shared.js';
/** Temporal there before `adapt` (the loader waits for it). */
export { ready } from './shared.js';

/**
 * The `moment` kit: tzslot's date-and-time field for an instant's before / after, in the grid's
 * zone, typed or chosen. A skipped time moves later with tzslot's note; a repeated one takes the
 * first reading, a button the second. Stored as UTC with milliseconds; applied after the pause.
 */
let uid = 0;

export function adapt(a: DateAdapter): DateField {
  styles(a, [['field', FIELD_CSS], ['datetime', DATETIME_CSS], ['calendar', CALENDAR_CSS], ['time', TIME_CSS]]);
  const mute = muter();
  let cur: string | null = null;
  const opts = () => {
    const s = a.settings();
    return { ...base(s), min: day('1900-01-01'), timeZone: s.ctx.timeZone, readingStyle: 'named' as const, isDateDisabled: lost(s.ctx.timeZone) };
  };
  const w = createDateTimeField(a.host, {
    ...opts(), container: a.panel, injectStyles: false, buttons: [],
    onChange(i) {
      if (mute.on) return;
      const at = i?.toString({ fractionalSecondDigits: 3 });
      cur = at?.length === 24 ? at : null;
      a.changed(false);
    },
  });
  // tzslot's typed field opens a dialog and says whether it is open: a combobox (ARIA 1.2) that
  // controls the panel's place, not a plain text box, which may not carry aria-expanded (T10).
  const typed = a.host.querySelector('input')!;
  a.panel.id ||= `dzg-fp${++uid}`;
  typed.setAttribute('role', 'combobox');
  typed.setAttribute('aria-controls', a.panel.id);
  const stop = named(a.host, a.panel);
  const write = (): void => mute.run(() => w.update({ value: cur ? T.Instant.from(cur) : null }));
  return {
    write(p) {
      cur = p?.at ?? null;
      write();
    },
    // A text that does not read (tzslot marks it at Enter) is not sent.
    read: () => (a.host.querySelector('[aria-invalid=true]') ? undefined : cur ? { at: cur } : null),
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
