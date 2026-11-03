import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, NO_OVERLAY, type ColumnDef, type ValueReader } from '@dzgrid/core';
import { rangeStats } from '@dzgrid/core/range';
import { shown } from './support/shown.js';
import { mulberry32 } from './support/rng.js';

/**
 * The block's figures (status-bar.md, Phase 9 SB1) against an oracle written apart: seeded boxes over rows mixing data,
 * details, fillers and loading rows; number columns holding cents (an exact sum in BigInt, scaled by 100), blanks and
 * text; a text column holding digits. `STATS_SEED` replays one seed.
 */
type Row = Record<string, unknown> & { id: string };
const RUNS = Number(process.env['STATS_RUNS'] ?? 200);
const ctx = localeCtx({ locale: 'en-US' });

describe('rangeStats: seeded blocks against an exact oracle', () => {
  const seeds = process.env['STATS_SEED'] ? [Number(process.env['STATS_SEED'])] : Array.from({ length: RUNS }, (_, i) => i + 1);
  for (const seed of seeds)
    it(`seed ${seed}`, () => {
      const rnd = mulberry32(seed);
      const int = (n: number) => Math.floor(rnd() * n);
      const ncols = 1 + int(5);
      // Column kinds: n a number column, t text.
      const kinds = Array.from({ length: ncols }, () => (rnd() < 0.7 ? 'n' : 't'));
      const defs: ColumnDef<Row>[] = kinds.map((k, j) => ({ id: `c${j}`, ...(k === 'n' && { type: 'number' as const }) }));
      const tokens: string[] = [];
      const rows: Record<string, Row> = {};
      const nrows = 1 + int(60);
      for (let i = 0; i < nrows; i++) {
        const id = `r${i}`;
        const roll = rnd();
        if (roll < 0.08) tokens.push(`> r${Math.max(0, i - 1)}`);
        else if (roll < 0.12) tokens.push(`/g${i}`);
        else if (roll < 0.16) tokens.push(`~r${Math.max(0, i - 1)}`);
        else {
          tokens.push(id);
          const r: Row = { id };
          kinds.forEach((k, j) => {
            const v = rnd();
            r[`c${j}`] = v < 0.15 ? null : k === 't' ? String(int(100)) : (int(2_000_001) - 1_000_000) / 100;
          });
          rows[id] = r;
        }
      }
      const top = int(tokens.length);
      const bottom = top + int(tokens.length - top);
      const start = int(ncols);
      const end = start + int(ncols - start);
      const displayed = shown<Row>(tokens, rows);
      const columns = createColumnModel<Row>(defs).visible();
      const got = rangeStats({ top, bottom, start, end }, displayed, columns, { ctx, reader: NO_OVERLAY as ValueReader<Row> });

      // The oracle: by hand from the tokens and the rows.
      let cells = 0, filled = 0, numbers = 0, cents = 0n, partial = false;
      let min: number | null = null, max: number | null = null;
      for (let i = top; i <= bottom; i++) {
        const t = tokens[i]!;
        if (t.startsWith('~')) partial = true;
        if (t.startsWith('> ') || t.startsWith('/') || t.startsWith('~')) continue;
        for (let j = start; j <= end; j++) {
          cells++;
          const v = rows[t]![`c${j}`];
          if (v === null) continue;
          filled++;
          if (kinds[j] !== 'n') continue;
          numbers++;
          cents += BigInt(Math.round((v as number) * 100));
          min = min === null ? (v as number) : Math.min(min, v as number);
          max = max === null ? (v as number) : Math.max(max, v as number);
        }
      }
      expect({ cells: got.cells, filled: got.filled, numbers: got.numbers, min: got.min, max: got.max, partial: got.partial }).toEqual({ cells, filled, numbers, min, max, partial });
      // The sum, to the cent, as a person reads it: the exact one.
      expect(BigInt(Math.round(got.sum * 100))).toBe(cents);
      expect(Math.abs(got.sum - Number(cents) / 100)).toBeLessThan(1e-6);
      expect(got.formats).toEqual(numbers ? [{}] : []);
    });
});
