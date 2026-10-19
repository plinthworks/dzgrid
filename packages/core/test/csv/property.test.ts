import { describe, it, expect } from 'vitest';
import { csvChunks, toCsv } from '@dzgrid/core/csv';
import { mulberry32 } from '../support/rng.js';
import { parseCsv } from '../support/rfc4180.js';
import { ALM, BOM, EN, LRM, NBSP, RLM, ch, grid } from './support.js';

/**
 * Round trip (RFC 4180): what the file holds, read back by an independent
 * reader, is the grid's text after the documented changes only — the BOM, the
 * guard's leading `'`, and `="…"` for a digits-only identifier — whatever the
 * characters, for each separator; row and column counts kept, empty and
 * single-column rows included; chunks joined equal the whole.
 */

const PIECES = ['"', ',', ';', '\t', '\r', '\n', '\r\n', ' ', NBSP, 'مرحبا', RLM, LRM, ALM, ch(0x1f600), '=', '+', '-', '@', 'a', 'ID', '0', '7', 'x y', '""'];

/** The guard, as the behaviour sheet states it. */
const guarded = (s: string): boolean => {
  if (s[0] === '\t' || s[0] === '\r' || s[0] === '\n') return true;
  let i = 0;
  while (i < s.length && [' ', NBSP, LRM, RLM, ALM].includes(s[i]!)) i++;
  return '=+-@'.includes(s[i] ?? '_');
};

function expected(s: string | null, idCol: boolean, sanitize: boolean): string {
  if (s === null || s === '') return '';
  if (idCol && /^[0-9]+$/.test(s)) return `="${s}"`;
  return sanitize && guarded(s) ? `'${s}` : s;
}

describe('the CSV round trip', () => {
  for (const sep of [',', ';', '\t'] as const) {
    for (const sanitize of [true, false]) {
      it(`reads back what was written, separator ${JSON.stringify(sep)}, guard ${sanitize ? 'on' : 'off'} (300 seeded grids)`, () => {
        for (let seed = 1; seed <= 300; seed++) {
          const r = mulberry32(seed * 7919 + sep.charCodeAt(0) + (sanitize ? 1 : 0));
          const pick = <V>(xs: readonly V[]): V => xs[Math.floor(r() * xs.length)]!;
          const nCols = 1 + Math.floor(r() * 4);
          const nRows = Math.floor(r() * 7);
          const cell = (): string | null => {
            const p = r();
            if (p < 0.1) return null;
            if (p < 0.2) return '';
            if (p < 0.27) return String(Math.floor(r() * 1000)).padStart(1 + Math.floor(r() * 4), '0');
            return Array.from({ length: 1 + Math.floor(r() * 5) }, () => pick(PIECES)).join('');
          };
          const ids = Array.from({ length: nCols }, (_, c) => `c${c}`);
          const headers = ids.map(() => (r() < 0.3 ? (cell() ?? 'h') : `H${Math.floor(r() * 9)}`));
          const idCol = Math.floor(r() * nCols);
          const defs = ids.map((id, c) => ({ id, header: headers[c]!, ...(c === idCol && { csv: 'text' as const }) }));
          const data = Array.from({ length: nRows }, () => Object.fromEntries(ids.map((id) => [id, cell()])));
          const header = r() < 0.8;
          const g = grid(defs, data, EN);
          const input = { rows: g.model.displayed, columns: g.columns, ctx: EN };
          const opts = { separator: sep, sanitizeFormulas: sanitize, header };
          const text = toCsv(input, opts);
          const where = `seed ${seed}`;
          expect(text.startsWith(BOM), where).toBe(true);
          const back = parseCsv(text.slice(1), sep);
          const want = [
            ...(header ? [headers.map((h) => (sanitize && guarded(h) ? `'${h}` : h))] : []),
            ...data.map((row) => ids.map((id, c) => expected(row[id] as string | null, c === idCol, sanitize))),
          ];
          expect(back, where).toEqual(want);
          expect(back.length, where).toBe(nRows + (header ? 1 : 0));
          for (const line of back) expect(line.length, where).toBe(nCols);
          // Chunked, any size: the same text.
          const chunkRows = 1 + Math.floor(r() * 4);
          expect([...csvChunks(input, { ...opts, chunkRows })].join(''), where).toBe(text);
        }
      });
    }
  }

  it('the parser itself refuses what is not RFC 4180', () => {
    expect(() => parseCsv('a,b', ',')).toThrow();
    expect(() => parseCsv('"a', ',')).toThrow();
    expect(() => parseCsv('a"b\r\n', ',')).toThrow();
    expect(() => parseCsv('a\nb\r\n', ',')).toThrow();
    expect(parseCsv('"a,""b"""\r\n\r\n', ',')).toEqual([['a,"b"'], ['']]);
  });
});
