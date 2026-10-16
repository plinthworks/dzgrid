import { addDays, dayToEpochDay, epochDayToDay, parseDay, readInstant, zoneDayBounds, type Day } from '@dzgrid/core';
import { iso } from '../iso.js';
import type { Suite } from './index.js';

export const values: Record<string, Suite> = {
  'zone-day-bounds': ({ day, zone }) => {
    const b = zoneDayBounds(parseDay(day)!, zone);
    return { from: iso(b.from), to: iso(b.to) };
  },
  'day-arith': (input) => {
    if (input.op === 'toEpochDay') return { epochDay: dayToEpochDay(parseDay(input.day)!) };
    if (input.op === 'fromEpochDay') return { day: epochDayToDay(input.epochDay) };
    if (input.op === 'parse') return { day: parseDay(input.text) };
    if (input.op === 'add') return { day: addDays(parseDay(input.day) as Day, input.days) };
    throw new Error(`unknown op ${input.op}`);
  },
  'instant-parse': ({ text, assumeZone, disambiguation }) => {
    const r = readInstant(text, assumeZone === undefined ? {} : { assumeZone, ...(disambiguation && { disambiguation }) });
    if (!r.ok) return { instant: null, code: r.code };
    return r.warning ? { instant: iso(r.value), warning: r.warning } : { instant: iso(r.value) };
  },
};
