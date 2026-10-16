import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, assignKeys, dayToEpochDay, parseDay, parseInstant, zoneDayBounds, type Day } from '@dzgrid/core';

const CASES = fileURLToPath(new URL('../cases', import.meta.url));

interface Case {
  id: string;
  suite: string;
  description: string;
  input: any;
  expected: any;
}

/** ISO for an instant, written without Date: through the core's own reading in reverse. */
const iso = (ms: number): string => {
  const day = Math.floor(ms / 86_400_000);
  const rest = ms - day * 86_400_000;
  const d = addDays(parseDay('1970-01-01')!, day);
  const h = Math.floor(rest / 3_600_000);
  const m = Math.floor((rest % 3_600_000) / 60_000);
  const s = Math.floor((rest % 60_000) / 1000);
  return `${d}T${[h, m, s].map((n) => String(n).padStart(2, '0')).join(':')}Z`;
};

const SUITES: Record<string, (input: any) => unknown> = {
  'zone-day-bounds': ({ day, zone }) => {
    const b = zoneDayBounds(parseDay(day)!, zone);
    return { from: iso(b.from), to: iso(b.to) };
  },
  'day-arith': (input) => {
    if (input.op === 'toEpochDay') return { epochDay: dayToEpochDay(parseDay(input.day)!) };
    if (input.op === 'parse') return { day: parseDay(input.text) };
    if (input.op === 'add') return { day: addDays(parseDay(input.day) as Day, input.days) };
    throw new Error(`unknown op ${input.op}`);
  },
  'row-key': ({ ids }) => {
    const r = assignKeys(ids);
    return { accepted: r.keys.map((k) => k !== null), problems: r.problems.map((p) => [p.code, p.path]) };
  },
};

const suites = readdirSync(CASES);

describe('conformance', () => {
  it('knows every suite on disk', () => {
    expect(suites.filter((s) => !SUITES[s])).toEqual([]);
  });

  it('reads instants back the way the cases write them', () => {
    expect(iso(parseInstant('2011-12-30T10:00:00Z')!)).toBe('2011-12-30T10:00:00Z');
  });

  for (const suite of suites) {
    describe(suite, () => {
      for (const file of readdirSync(join(CASES, suite))) {
        const c: Case = JSON.parse(readFileSync(join(CASES, suite, file), 'utf8'));
        it(`${c.id}: ${c.description}`, () => {
          expect(c.suite).toBe(suite);
          expect(`${c.id}.json`).toBe(file);
          expect(SUITES[suite]!(c.input)).toEqual(c.expected);
        });
      }
    });
  }
});
