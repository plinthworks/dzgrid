import { describe, it, expect } from 'vitest';
import { createColumnModel, localeCtx, NO_OVERLAY, type ColumnDef, type ValueReader } from '@dzgrid/core';
import { fillTarget, planFill, type FillWay, type RangeBox } from '@dzgrid/core/range';
import { shown } from './support/shown.js';
import { mulberry32 } from './support/rng.js';

/**
 * Fill series (Phase 5 step 10, fill.md 3–6; step10-plan F3–F5) against oracles written apart: numbers as
 * integers scaled by their decimals (exact), days by the host's `Date.UTC` (allowed in a test, never in
 * the core). Seeds replay (`FILL_SEED`).
 */
type Row = Record<string, unknown> & { id: string };
const ctx = localeCtx({ locale: 'en-US' });
const reader = NO_OVERLAY as ValueReader<Row>;
const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);

/** Plans a column fill of `src` (values top to bottom) over `m` rows, down or up; the values planned, nearest first. */
function fillColumn(def: ColumnDef<Row>, src: readonly unknown[], m: number, way: 'down' | 'up', o: { swap?: boolean; mode?: 'copy' } = {}) {
  const n = src.length;
  const rows: Record<string, Row> = {};
  const all = ids(n + m);
  const first = way === 'down' ? 0 : m;
  src.forEach((v, i) => (rows[all[first + i]!] = { id: all[first + i]!, [def.id]: v }));
  const columns = createColumnModel<Row>([def]).visible();
  const s: RangeBox = { top: first, bottom: first + n - 1, start: 0, end: 0 };
  const t: RangeBox = way === 'down' ? { top: n, bottom: n + m - 1, start: 0, end: 0 } : { top: 0, bottom: m - 1, start: 0, end: 0 };
  const cells = planFill(s, t, way, shown<Row>(all, rows), columns, { ctx, reader, ...(o.swap && { swap: true }), ...(o.mode && { mode: o.mode }) });
  const vals = cells.map((c) => (c.input as { value: unknown }).value);
  return way === 'down' ? vals : vals.reverse();
}

const decimals = (x: number) => {
  const m = /^-?\d+(?:\.(\d+))?(?:e([-+]\d+))?$/.exec(String(x))!;
  return Math.max(0, (m[1]?.length ?? 0) - Number(m[2] ?? 0));
};

describe('number series against the scaled-integer oracle', () => {
  it('2 000 seeds: arithmetic sources go on, others repeat; Ctrl swaps; backwards too', () => {
    const seed = Number(process.env['FILL_SEED'] ?? 0);
    for (let s = seed || 1; s <= (seed || 2000); s++) {
      const r = mulberry32(s);
      const d = Math.floor(r() * 4); // decimals 0..3
      const scale = 10 ** d;
      const n = 1 + Math.floor(r() * 4);
      const m = 1 + Math.floor(r() * 6);
      const arithmetic = r() < 0.6;
      const start = Math.floor(r() * 2001) - 1000;
      const step = Math.floor(r() * 41) - 20;
      const scaled = Array.from({ length: n }, (_, i) => (arithmetic ? start + i * step : Math.floor(r() * 2001) - 1000));
      const src = scaled.map((k) => k / scale);
      const way = r() < 0.5 ? 'down' : 'up';
      const swap = r() < 0.3;
      // The oracle: positions p from the first source cell (down: n, n+1, …; up: -1, -2, …).
      const steps = scaled.slice(1).map((k, i) => k - scaled[i]!);
      const constant = n > 1 && steps.every((x) => x === steps[0]);
      const dec = Math.max(...src.map(decimals));
      const series = n === 1 ? swap : constant && !swap;
      // Integers in units of 10^-dec: dividing by 10^(d − dec) is exact, as every value has at most dec decimals.
      const f = 10 ** (d - dec);
      const kStep = n === 1 ? 10 ** dec : steps[0]! / f;
      const kFirst = scaled[0]! / f;
      const want = Array.from({ length: m }, (_, j) => {
        const p = way === 'down' ? n + j : -(j + 1);
        return series ? (kFirst + p * kStep) / 10 ** dec : src[((p % n) + n) % n];
      });
      expect(fillColumn({ id: 'n', type: 'number' }, src, m, way, { swap }), `seed ${s}: ${JSON.stringify({ src, m, way, swap })}`).toEqual(want);
    }
  });

  it('mode copy never makes a series, swap or not', () => {
    expect(fillColumn({ id: 'n', type: 'number' }, [1, 2], 3, 'down', { mode: 'copy' })).toEqual([1, 2, 1]);
    expect(fillColumn({ id: 'n', type: 'number' }, [5], 2, 'down', { mode: 'copy', swap: true })).toEqual([5, 5]);
  });

  it('rounding follows the export text, exponents included (1e-7)', () => {
    expect(fillColumn({ id: 'n', type: 'number' }, [1e-7, 2e-7], 2, 'down')).toEqual([3e-7, 4e-7]);
    expect(fillColumn({ id: 'n', type: 'number' }, [0.1, 0.2], 3, 'down')).toEqual([0.3, 0.4, 0.5]);
    expect(fillColumn({ id: 'n', type: 'number' }, [1.25], 2, 'down', { swap: true })).toEqual([2.25, 3.25]);
    expect(fillColumn({ id: 'n', type: 'number' }, [1, 1.5], 2, 'down')).toEqual([2, 2.5]);
  });

  it('a series leaving the numbers the grid holds plans a value the column refuses (never a silent clamp)', () => {
    const v = fillColumn({ id: 'n', type: 'number' }, [1e308, 1.5e308], 1, 'down');
    expect(v).toHaveLength(1);
    expect(v[0]).toBe(Infinity);
  });
});

describe('day series against Date.UTC', () => {
  const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  it('1 000 seeds: one day steps by one (Ctrl copies); two or more with one step go on; month ends, leap years', () => {
    for (let s = 1; s <= 1000; s++) {
      const r = mulberry32(s);
      const n = 1 + Math.floor(r() * 3);
      const m = 1 + Math.floor(r() * 5);
      const base = Date.UTC(1999 + Math.floor(r() * 32), Math.floor(r() * 12), 1 + Math.floor(r() * 31));
      const step = Math.floor(r() * 61) - 30;
      const arithmetic = r() < 0.7;
      const ms = Array.from({ length: n }, (_, i) => base + (arithmetic ? i * step : Math.floor(r() * 400) - 200) * 86_400_000);
      const src = ms.map(dayOf);
      const way = r() < 0.5 ? 'down' : 'up';
      const swap = r() < 0.3;
      const steps = ms.slice(1).map((x, i) => (x - ms[i]!) / 86_400_000);
      const constant = n > 1 && steps.every((x) => x === steps[0]);
      const series = n === 1 ? !swap : constant && !swap;
      const k = n === 1 ? 1 : steps[0]!;
      const want = Array.from({ length: m }, (_, j) => {
        const p = way === 'down' ? n + j : -(j + 1);
        return series ? dayOf(ms[0]! + p * k * 86_400_000) : src[((p % n) + n) % n];
      });
      expect(fillColumn({ id: 'd', type: 'day' }, src, m, way, { swap }), `seed ${s}: ${JSON.stringify({ src, m, way, swap })}`).toEqual(want);
    }
  });

  it('past the last day the grid writes: a value the column refuses, never a blank', () => {
    const v = fillColumn({ id: 'd', type: 'day' }, ['9999-12-30'], 2, 'down');
    expect(v[0]).toBe('9999-12-31');
    expect(v[1]).not.toBeNull();
    expect(typeof v[1] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v[1])).toBe(false);
  });
});

describe('fillTarget (F1)', () => {
  const src: RangeBox = { top: 3, bottom: 4, start: 2, end: 3 };
  it('every cell outside the source gives the axis it is farther out on (ties: rows), and a box beside the source', () => {
    for (let row = 0; row < 9; row++)
      for (let col = 0; col < 7; col++) {
        const dr = row < src.top ? src.top - row : row > src.bottom ? row - src.bottom : 0;
        const dc = col < src.start ? src.start - col : col > src.end ? col - src.end : 0;
        const got = fillTarget(src, { row, col });
        if (!dr && !dc) {
          expect(got, `${row},${col}`).toBeNull();
          continue;
        }
        const way: FillWay = dr >= dc ? (row > src.bottom ? 'down' : 'up') : col > src.end ? 'end' : 'start';
        const box =
          way === 'down' ? { top: src.bottom + 1, bottom: row, start: src.start, end: src.end }
          : way === 'up' ? { top: row, bottom: src.top - 1, start: src.start, end: src.end }
          : way === 'end' ? { top: src.top, bottom: src.bottom, start: src.end + 1, end: col }
          : { top: src.top, bottom: src.bottom, start: col, end: src.start - 1 };
        expect(got, `${row},${col}`).toEqual({ box, way });
      }
  });
});
