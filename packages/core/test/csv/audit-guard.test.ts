import { describe, it, expect } from 'vitest';
import { toCsv, type CsvOptions } from '@dzgrid/core/csv';
import { mulberry32 } from '../support/rng.js';
import { parseCsv } from '../support/rfc4180.js';
import { EN, FR, ch, grid } from './support.js';

/**
 * Property: after the export and an RFC 4180 read, no field starts (spaces,
 * NBSP and bidi marks stripped) with = + - @, nor with tab/CR/LF, unless it
 * is a typed number or a digits-only csv:'text' field written ="digits".
 */
const MARKS = [0x20, 0xa0, 0x200e, 0x200f, 0x061c];
// Bidi controls a spreadsheet does not show either: embeddings, overrides, isolates.
const BIDI_CONTROLS = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];
const strip = (s: string, set: number[]): string => {
  let i = 0;
  while (i < s.length && set.includes(s.charCodeAt(i))) i++;
  return s.slice(i);
};
// The sheet's rule since the step 10 review: any white space, zero-width characters and every invisible direction control are skipped.
const SKIPPED = /^[\s\u200B\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]*/;
const live = (s: string, _set: number[]): boolean => /^[\t\r\n]/.test(s) || /^[=+\-@]/.test(s.replace(SKIPPED, ''));

function gen(r: () => number, lead: number[]): string {
  const pick = <V>(xs: readonly V[]) => xs[Math.floor(r() * xs.length)]!;
  let s = '';
  const n = Math.floor(r() * 4);
  for (let i = 0; i < n; i++) s += ch(pick(lead));
  s += pick(['=', '+', '-', '@', '=1+1', '-2', '@SUM(A1)', 'x', '0', '', '"=', '\t=', ',=', '\n-']);
  if (r() < 0.5) s += pick(['cmd|\' /C calc\'!A0', ',', '"', 'ok']);
  return s;
}

function run(lead: number[], strictSet: number[], o: CsvOptions, seeds = 400) {
  const bad: string[] = [];
  for (const sep of [',', ';', '\t'] as const) {
    for (let seed = 1; seed <= seeds; seed++) {
      const r = mulberry32(seed * 31 + sep.charCodeAt(0));
      const rows = Array.from({ length: 4 }, () => ({ a: gen(r, lead), id: String(Math.floor(r() * 99)), n: r() < 0.5 ? -r() * 10 : r() }));
      const head = gen(r, lead);
      const g = grid([{ id: 'a', header: head }, { id: 'id', header: 'Id', csv: 'text' as const }, { id: 'n', header: gen(r, lead), type: 'number' as const }], rows, r() < 0.5 ? EN : FR);
      const text = toCsv({ rows: g.model.displayed, columns: g.columns, ctx: g.ctx }, { bom: false, separator: sep, ...o });
      const back = parseCsv(text, sep);
      back.forEach((rec, ri) => rec.forEach((f, ci) => {
        if (ri > 0 && ci === 2) return; // a typed number
        if (ri > 0 && ci === 1 && /^="[0-9]+"$/.test(f)) return;
        if (live(f, strictSet) && bad.length < 6) bad.push(JSON.stringify(f));
      }));
    }
  }
  return bad;
}

describe('formula guard, property', () => {
  it('spaces, NBSP, LRM, RLM, ALM before a trigger: always guarded', () => {
    expect(run(MARKS, MARKS, {})).toEqual([]);
  });
  // KNOWN GAP (bug report): U+202A-202E and U+2066-2069 are not in FORMULA; flip to it() once fixed.
  it('bidi embeddings, overrides and isolates (invisible too) before a trigger: guarded', () => {
    const all = [...MARKS, ...BIDI_CONTROLS];
    expect(run(all, all, {})).toEqual([]);
  });
  it('typed number column with csv:text: a negative number is not written as ="…" and stays a number', () => {
    const g = grid([{ id: 'n', header: 'N', type: 'number' as const, csv: 'text' as const }], [{ n: 123 }, { n: -5 }, { n: 1.5 }]);
    expect(toCsv({ rows: g.model.displayed, columns: g.columns, ctx: EN }, { bom: false })).toBe('N\r\n"=""123"""\r\n-5\r\n1.5\r\n');
  });
  it('the only change the guard makes is one leading quote (round trip)', () => {
    const r = mulberry32(5);
    for (let i = 0; i < 500; i++) {
      const s = gen(r, MARKS);
      if (s === '') continue;
      const g = grid([{ id: 'a', header: 'A' }], [{ a: s }]);
      const f = parseCsv(toCsv({ rows: g.model.displayed, columns: g.columns, ctx: EN }, { bom: false }), ',')[1]![0]!;
      expect(f === s || f === `'${s}`, JSON.stringify(s)).toBe(true);
      expect(f === `'${s}`).toBe(live(s, MARKS));
    }
  });
});
