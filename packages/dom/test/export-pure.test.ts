// docs/behaviors/csv-export.md, step 19: the file name (safeFileName, the default name) and the
// time slicing of the build, both pure (export/run/name.ts, export/run/slice.ts).
import { describe, it, expect } from 'vitest';
import { defaultFileName, safeFileName } from '../src/export/run/name.js';
import { batcher, drain } from '../src/export/run/slice.js';

const ch = (cp: number) => String.fromCodePoint(cp);

describe('safeFileName', () => {
  it('keeps a plain name, adds .csv once', () => {
    expect(safeFileName('journal')).toBe('journal.csv');
    expect(safeFileName('journal.csv')).toBe('journal.csv');
    expect(safeFileName('journal.CSV.csv')).toBe('journal.csv');
  });
  it('strips what a file system refuses: \\ / : * ? " < > | and control characters', () => {
    expect(safeFileName('a\\b/c:d*e?f"g<h>i|j')).toBe('abcdefghij.csv');
    expect(safeFileName(`a${ch(0)}b${ch(1)}c${ch(0x1f)}d${ch(0x7f)}e${ch(0x85)}`)).toBe('abcde.csv');
    expect(safeFileName(`a${ch(9)}b${ch(0xa)}${ch(0xd)}c`)).toBe('a b c.csv');
  });
  it('strips direction controls and zero-width characters (a name that would read backwards)', () => {
    for (const cp of [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x061c, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff, 0x2060]) {
      expect(safeFileName(`ab${ch(cp)}c`), cp.toString(16)).toBe('abc.csv');
    }
    // The classic: "invoice‮fdp.csv" shown as "invoicevsc.pdf".
    expect(safeFileName(`invoice${ch(0x202e)}fdp`)).toBe('invoicefdp.csv');
  });
  it('collapses white space, trims dots and spaces at the ends', () => {
    expect(safeFileName('  my   file\t\nname  ')).toBe('my file name.csv');
    expect(safeFileName('..hidden..')).toBe('hidden.csv');
    expect(safeFileName(' . report . ')).toBe('report.csv');
  });
  it('prefixes a Windows reserved name with _', () => {
    for (const n of ['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9', 'CON.csv', 'nul.backup']) expect(safeFileName(n), n).toMatch(/^_/);
    expect(safeFileName('CONSOLE')).toBe('CONSOLE.csv');
    expect(safeFileName('COM10')).toBe('COM10.csv');
  });
  it('keeps Arabic, accents and digits', () => {
    expect(safeFileName('تصدير-2026-10-20-1405')).toBe('تصدير-2026-10-20-1405.csv');
    expect(safeFileName('Été à Alger')).toBe('Été à Alger.csv');
  });
  it('at most 120 code points, .csv included (astral characters count once)', () => {
    expect(safeFileName('a'.repeat(300))).toBe('a'.repeat(116) + '.csv');
    const emoji = ch(0x1f600);
    const out = safeFileName(emoji.repeat(200));
    expect([...out].length).toBe(120);
    expect(out.endsWith('.csv')).toBe(true);
    // Cut, then trimmed again: no dot or space left before .csv.
    expect(safeFileName('a'.repeat(115) + ' b')).toBe('a'.repeat(115) + '.csv');
  });
  it('falls back to export.csv when nothing is left', () => {
    for (const n of ['', '   ', '...', '.csv', '<>|', ch(0x202e), null as unknown as string, undefined as unknown as string, 42 as unknown as string]) {
      expect(safeFileName(n)).toBe(typeof n === 'number' ? '42.csv' : 'export.csv');
    }
  });
});

describe('the default file name', () => {
  // 2026-10-20 23:05:09 UTC.
  const t = Date.UTC(2026, 9, 20, 23, 5, 9);
  it('is the prefix, the day and the minute in the display zone, Latin digits', () => {
    expect(defaultFileName('export', t, 'UTC')).toBe('export-2026-10-20-2305.csv');
    // Algiers is UTC+1: past midnight there, the next day.
    expect(defaultFileName('export', t, 'Africa/Algiers')).toBe('export-2026-10-21-0005.csv');
    expect(defaultFileName('تصدير', t, 'Africa/Algiers')).toBe('تصدير-2026-10-21-0005.csv');
    expect(defaultFileName('export', t, 'America/Los_Angeles')).toBe('export-2026-10-20-1605.csv');
  });
  it('is cleaned like any name', () => {
    expect(defaultFileName('a/b', t, 'UTC')).toBe('ab-2026-10-20-2305.csv');
  });
});

describe('drain: the build in slices', () => {
  function* chunks(n: number, onStep?: () => void): Generator<string, { rows: number }> {
    for (let i = 0; i < n; i++) {
      onStep?.();
      yield `c${i};`;
    }
    return { rows: n };
  }
  it('runs chunks until the slice budget is spent, then yields, and returns the summary', async () => {
    let clock = 0;
    const yields: number[] = [];
    const parts: string[] = [];
    const r = await drain(chunks(10, () => (clock += 5)), { now: () => clock, yield: async () => void yields.push(clock), aborted: () => false }, (s) => parts.push(s));
    expect(r).toEqual({ rows: 10 });
    expect(parts.join('')).toBe('c0;c1;c2;c3;c4;c5;c6;c7;c8;c9;');
    // 5 ms a chunk, 16 ms a slice: four chunks (20 ms) then a yield; none after the last.
    expect(yields).toEqual([20, 40]);
  });
  it('a slow chunk still runs one chunk per slice (no endless loop)', async () => {
    let clock = 0;
    let n = 0;
    await drain(chunks(3, () => (clock += 100)), { now: () => clock, yield: async () => void n++, aborted: () => false }, () => {});
    // The generator says it is done only when asked once more: the last slice yields too.
    expect(n).toBe(3);
  });
  it('stops at the yield where it finds itself aborted: null, no more chunks', async () => {
    let clock = 0;
    let stop = false;
    const parts: string[] = [];
    const r = await drain(chunks(100, () => (clock += 10)), { now: () => clock, yield: async () => void (stop = true), aborted: () => stop }, (s) => parts.push(s));
    expect(r).toBeNull();
    expect(parts).toEqual(['c0;', 'c1;']);
  });
  it('tells each slice how many chunks it has done', async () => {
    let clock = 0;
    const seen: number[] = [];
    await drain(chunks(5, () => (clock += 8)), { now: () => clock, yield: async () => {}, aborted: () => false }, () => {}, (k) => seen.push(k));
    expect(seen).toEqual([2, 4, 5]);
  });
  it('an error in a chunk rejects (the caller fails the export)', async () => {
    function* bad(): Generator<string, number> {
      yield 'a';
      throw new TypeError('boom');
    }
    await expect(drain(bad(), { now: () => 0, yield: async () => {}, aborted: () => false }, () => {})).rejects.toThrow('boom');
  });
});

describe('batcher: the text gathered in Blobs', () => {
  it('makes a Blob every ~max characters, and one Blob of all at the end, UTF-8', async () => {
    const b = batcher(10);
    for (const s of ['abcd', 'efgh', 'ijkl', 'é', 'ش']) b.push(s);
    expect(b.blobs).toBe(1);
    const blob = b.blob('text/csv;charset=utf-8');
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(await blob.text()).toBe('abcdefghijklé' + 'ش');
    expect(blob.size).toBe(12 + 2 + 2);
  });
});
