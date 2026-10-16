import { assignKeys, parseDay, readInstant, zoneDayBounds, epochDayToDay, dayToEpochDay } from '../packages/core/src/index.js';

/** Each case returns a value so the work cannot be optimised away. */
export const CASES: Record<string, () => unknown> = {
  'zoneDayBounds x 10 000 (Paris, cached formatter)': () => {
    let acc = 0;
    const start = dayToEpochDay(parseDay('2000-01-01')!);
    for (let i = 0; i < 10_000; i++) acc += zoneDayBounds(epochDayToDay(start + i)!, 'Europe/Paris').from;
    return acc;
  },
  'assignKeys 100 000 ids': () => assignKeys(Array.from({ length: 100_000 }, (_, i) => `row-${i}`)).keys.length,
  'parseDay x 100 000': () => {
    let n = 0;
    for (let i = 0; i < 100_000; i++) if (parseDay(`20${String(i % 100).padStart(2, '0')}-0${1 + (i % 9)}-1${i % 10}`)) n++;
    return n;
  },
  'readInstant ISO x 100 000': () => {
    let n = 0;
    for (let i = 0; i < 100_000; i++) if (readInstant(`2026-03-05T10:${String(i % 60).padStart(2, '0')}:00.${String(i % 1000).padStart(3, '0')}Z`).ok) n++;
    return n;
  },
};
