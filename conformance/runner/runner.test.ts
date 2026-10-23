import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInstant } from '@dzgrid/core';
import { iso } from './iso.js';
import { SUITES } from './suites/index.js';

const CASES = fileURLToPath(new URL('../cases', import.meta.url));
const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../schema/case.schema.json', import.meta.url)), 'utf8'));

interface Case {
  id: string;
  suite: string;
  description: string;
  input: any;
  expected: any;
}

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

  it('has one problems case per problem code, named after it', async () => {
    const { PROBLEM_CODES } = await import('@dzgrid/core');
    const files = readdirSync(join(CASES, 'problems')).map((f) => f.replace(/\.json$/, '')).sort();
    expect(files).toEqual([...PROBLEM_CODES].sort());
  });

  it('has no empty suite, and every case has the shape the schema requires', () => {
    for (const suite of suites) {
      const files = readdirSync(join(CASES, suite));
      expect(files.length, suite).toBeGreaterThan(0);
      for (const file of files) {
        const c = JSON.parse(readFileSync(join(CASES, suite, file), 'utf8'));
        expect(Object.keys(c).filter((k) => !(k in schema.properties)), file).toEqual([]);
        for (const k of schema.required) expect(c, `${file} lacks ${k}`).toHaveProperty(k);
        expect(c.id).toMatch(new RegExp(schema.properties.id.pattern));
      }
    }
  });

  for (const suite of suites) {
    describe(suite, () => {
      for (const file of readdirSync(join(CASES, suite))) {
        const c: Case = JSON.parse(readFileSync(join(CASES, suite, file), 'utf8'));
        it(`${c.id}: ${c.description}`, async () => {
          expect(c.suite).toBe(suite);
          expect(`${c.id}.json`).toBe(file);
          // A suite may answer later (the edit saves settle in microtasks).
          const got = (await SUITES[suite]!(c.input)) as Record<string, unknown>;
          // A format case states either the text or the parts it cares about; so does a save or undo script.
          const partial = suite === 'format' || suite === 'transaction' || suite === 'edit-saves' || suite === 'undo';
          const compared = partial ? Object.fromEntries(Object.keys(c.expected).map((k) => [k, got[k]])) : got;
          expect(compared).toEqual(c.expected);
        });
      }
    });
  }
});
