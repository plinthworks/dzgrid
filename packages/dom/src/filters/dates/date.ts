import { CALENDAR_CSS, createDateField, FIELD_CSS } from '@tzslot/dom';
import type { DateAdapter, DateField } from '../dates.js';
import { base, day, named, styles } from './shared.js';

/**
 * The `date` kit: tzslot's date field for a day (a day column's on / before / after…, an
 * instant's on this day). Its trigger's name gets the date shown (`named`, T1).
 */
export function adapt(a: DateAdapter): DateField {
  styles(a, [['field', FIELD_CSS], ['calendar', CALENDAR_CSS]]);
  const key = a.kind === 'day' ? 'value' : 'day';
  let cur: string | null = null;
  const w = createDateField(a.host, {
    ...base(a.settings()), container: a.panel, injectStyles: false, buttons: [],
    // `update` never reports (tzslot's contract): no echo to mute.
    onChange(d) {
      cur = d && d.toString();
      a.changed(true);
    },
  });
  const trigger = a.host.querySelector<HTMLElement>('.tz-field__trigger')!;
  const stop = named(a.host, a.panel);
  return {
    write(p) {
      const v = p?.[key];
      cur = typeof v === 'string' ? v : null;
      w.update({ value: cur ? day(cur) : null });
    },
    read: () => (cur ? { [key]: cur } : null),
    update: () => w.update(base(a.settings())),
    closePanel: () => w.isOpen && (w.close(), true),
    focus: () => trigger.focus(),
    destroy() {
      stop();
      w.destroy();
    },
  };
}
