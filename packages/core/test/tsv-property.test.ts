import { describe, it, expect } from 'vitest';
import { decodeTsv, encodeTsv } from '@dzgrid/core/range';
import { mulberry32 } from './support/rng.js';

/**
 * The clipboard's TSV (Phase 5 step 10, clipboard.md 10–11; step10-plan T1–T3; spike S7's property test,
 * ported): random grids round trip, random text never fails. `TSV_SEED` replays one seed.
 */
const ch = (n: number) => String.fromCharCode(n);
// Tabs, CR, LF, CRLF, quotes, Arabic, Arabic-Indic digits, the RLM and LRM marks, an emoji (a surrogate
// pair), a formula start, spaces, a comma and a semicolon, and the empty string.
const ALPHABET = ['a', 'Z', '1', ' ', '\t', '\n', '\r', '\r\n', '"', '""', "'", '=', '-', 'é', 'محمد', '٣', ch(0x200f), ch(0x200e), '😀', ',', ';', ''];

const randomGrid = (r: () => number): string[][] => {
  const h = 1 + Math.floor(r() * 5);
  const w = 1 + Math.floor(r() * 5);
  return Array.from({ length: h }, () => Array.from({ length: w }, () => {
    let c = '';
    const len = Math.floor(r() * 5);
    for (let k = 0; k < len; k++) c += ALPHABET[Math.floor(r() * ALPHABET.length)];
    return c;
  }));
};

describe('TSV round trip', () => {
  it('20 000 random rectangular grids: decode(encode(m)) is m', () => {
    const one = process.env['TSV_SEED'];
    for (let s = one ? Number(one) : 1; s <= (one ? Number(one) : 20_000); s++) {
      const m = randomGrid(mulberry32(s));
      const text = encodeTsv(m);
      expect(decodeTsv(text, { pad: true }), `seed ${s}: ${JSON.stringify(text)}`).toEqual(m);
      expect(decodeTsv(text), `seed ${s}`).toEqual(m);
    }
  });

  it('ragged grids come back padded with empty cells', () => {
    for (let s = 1; s <= 2000; s++) {
      const r = mulberry32(s);
      const m = randomGrid(r).map((row) => row.slice(0, 1 + Math.floor(r() * row.length)));
      const w = Math.max(...m.map((row) => row.length));
      const padded = m.map((row) => [...row, ...Array<string>(w - row.length).fill('')]);
      expect(decodeTsv(encodeTsv(m), { pad: true }), `seed ${s}`).toEqual(padded);
    }
  });

  it('every encoded row ends with CRLF, the last too; only TAB, CR, LF and quotes are quoted', () => {
    for (let s = 1; s <= 2000; s++) {
      const m = randomGrid(mulberry32(s));
      const text = encodeTsv(m);
      expect(text.endsWith('\r\n'), `seed ${s}`).toBe(true);
      for (const row of m) for (const c of row) if (!/[\t\r\n"]/.test(c)) expect(text.includes(c)).toBe(true);
    }
  });
});

describe('TSV decoding of any text', () => {
  it('20 000 random strings: never throws, gives at least one row of strings, rows never empty', () => {
    for (let s = 1; s <= 20_000; s++) {
      const r = mulberry32(s);
      let text = '';
      const len = Math.floor(r() * 30);
      for (let k = 0; k < len; k++) text += ALPHABET[Math.floor(r() * ALPHABET.length)];
      const rows = decodeTsv(text, { pad: r() < 0.5 });
      expect(rows.length, `seed ${s}`).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.length).toBeGreaterThan(0);
        for (const c of row) expect(typeof c).toBe('string');
      }
    }
  });

  it('a large paste decodes without a deep stack (100 000 rows, padded)', () => {
    const text = 'a\tb\r\n'.repeat(100_000) + 'c\r\n';
    const rows = decodeTsv(text, { pad: true });
    expect(rows).toHaveLength(100_001);
    expect(rows[100_000]).toEqual(['c', '']);
  });
});
