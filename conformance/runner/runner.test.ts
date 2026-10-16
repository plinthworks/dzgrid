import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, assignKeys, dayToEpochDay, epochDayToDay, parseDay, parseInstant, readInstant, zoneDayBounds, type Day } from '@dzgrid/core';

const CASES = fileURLToPath(new URL('../cases', import.meta.url));

interface Case {
  id: string;
  suite: string;
  description: string;
  input: any;
  expected: any;
}

/**
 * ISO for an instant, written without Date. Milliseconds appear whenever they
 * are not zero, so a bound off by half a second cannot pass as `…:00Z`.
 */
const iso = (ms: number): string => {
  if (!Number.isInteger(ms)) throw new Error(`not a whole millisecond: ${ms}`);
  const day = Math.floor(ms / 86_400_000);
  const rest = ms - day * 86_400_000;
  const d = addDays(parseDay('1970-01-01')!, day);
  if (d === null) throw new Error(`outside the years 0000–9999: ${ms}`);
  const h = Math.floor(rest / 3_600_000);
  const m = Math.floor((rest % 3_600_000) / 60_000);
  const s = Math.floor((rest % 60_000) / 1000);
  const frac = rest % 1000;
  return `${d}T${[h, m, s].map((n) => String(n).padStart(2, '0')).join(':')}${frac ? `.${String(frac).padStart(3, '0')}` : ''}Z`;
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
    if (input.op === 'fromEpochDay') return { day: epochDayToDay(input.epochDay) };
    throw new Error(`unknown op ${input.op}`);
  },
  'instant-parse': ({ text, assumeZone, disambiguation }) => {
    const r = readInstant(text, assumeZone === undefined ? {} : { assumeZone, ...(disambiguation && { disambiguation }) });
    if (!r.ok) return { instant: null, code: r.code };
    return r.warning ? { instant: iso(r.value), warning: r.warning } : { instant: iso(r.value) };
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
    for (const t of ['2011-12-30T10:00:00Z', '1969-12-31T23:59:59Z', '1969-12-31T23:59:59.999Z', '2026-03-05T10:00:00.500Z', '0001-01-01T00:00:00Z']) {
      expect(iso(parseInstant(t)!)).toBe(t);
    }
  });

  it('has no empty suite, and every case has the shape the schema requires', () => {
    const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../schema/case.schema.json', import.meta.url)), 'utf8'));
    for (const suite of suites) {
      const files = readdirSync(join(CASES, suite));
      expect(files.length, suite).toBeGreaterThan(0);
      for (const file of files) {
        const c = JSON.parse(readFileSync(join(CASES, suite, file), 'utf8'));
        expect(Object.keys(c).filter((k) => !(k in schema.properties)), file).toEqual([]);
        for (const k of schema.required) expect(c, `${file} lacks ${k}`).toHaveProperty(k);
        expect(c.id).toMatch(new RegExp(schema.properties.id.pattern));
        expect(c.expected, file).not.toBeUndefined();
      }
    }
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
