import { describe, it, expect } from 'vitest';
import { createColumnModel, type ColumnDef } from '@dzgrid/core';
import { PASTE_MAX, planPaste, type RangeBox } from '@dzgrid/core/range';
import { shown, tokenOf } from './support/shown.js';
import { mulberry32 } from './support/rng.js';

/**
 * The paste plan (Phase 5 step 10, clipboard.md 14–21; step10-plan P0–P7) against an oracle written apart:
 * the whole target drawn as a grid of the data rows from the target's top and the visible columns, the
 * source laid on it by the sheet's shape rule, every source cell that falls off counted. Rows mix data,
 * muted ancestors, details, fillers and loading rows. `PASTE_SEED` replays one seed.
 */
type Row = Record<string, unknown> & { id: string };

function oracle(tokens: string[], ncols: number, at: RangeBox, src: string[][], max: number) {
  const isData = (t: string) => !t.startsWith('> ') && !t.startsWith('/') && !t.startsWith('~');
  const idOf = (t: string) => (t.startsWith('(') ? t.slice(1, -1) : t);
  const h = src.length;
  const w = Math.max(0, ...src.map((r) => r.length));
  if (h === 0 || w === 0) return { cells: [] as string[][], outside: 0, tooBig: false, box: null as RangeBox | null };
  // The data rows inside the target, and every data row from its top down (with their display index).
  const inside = tokens.slice(at.top, at.bottom + 1).filter(isData).length;
  const below: number[] = [];
  tokens.forEach((t, i) => i >= at.top && isData(t) && below.push(i));
  const cols = at.end - at.start + 1;
  const tile = inside > 0 && inside % h === 0 && cols % w === 0;
  const H = tile ? inside : h;
  const W = tile ? cols : w;
  const cells: string[][] = [];
  let outside = 0;
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      if (r >= below.length || at.start + c >= ncols) {
        outside++;
        continue;
      }
      cells.push([idOf(tokens[below[r]!]!), `c${at.start + c}`, src[r % h]![c % w] ?? '']);
    }
  if (cells.length > max) return { cells: [], outside: 0, tooBig: true, box: null };
  if (!cells.length) return { cells, outside, tooBig: false, box: null };
  const rowsUsed = Math.min(H, below.length);
  const colsUsed = Math.min(W, ncols - at.start);
  return { cells, outside, tooBig: false, box: { top: below[0]!, bottom: below[rowsUsed - 1]!, start: at.start, end: at.start + colsUsed - 1 } };
}

describe('the paste plan against its oracle', () => {
  it('1 000 seeds: shapes, outside counts, non-data rows never named, the cap', () => {
    const one = process.env['PASTE_SEED'];
    for (let s = one ? Number(one) : 1; s <= (one ? Number(one) : 1000); s++) {
      const r = mulberry32(s);
      const ncols = 1 + Math.floor(r() * 6);
      const defs: ColumnDef<Row>[] = Array.from({ length: ncols }, (_, i) => ({ id: `c${i}` }));
      const columns = createColumnModel<Row>(defs).visible();
      const tokens: string[] = [];
      const nrows = 1 + Math.floor(r() * 10);
      for (let i = 0; i < nrows; i++) {
        const k = r();
        const id = `r${i}`;
        tokens.push(k < 0.55 ? id : k < 0.65 ? `(${id})` : k < 0.8 ? `> r${Math.max(0, i - 1)}` : k < 0.9 ? `/g${i}` : `~r${i}`);
      }
      // A detail's key names its master: keep each one once.
      const seen = new Set<string>();
      const uniq = tokens.map((t, i) => (seen.has(t) ? `/x${i}` : (seen.add(t), t)));
      const top = Math.floor(r() * nrows);
      const bottom = top + Math.floor(r() * (nrows - top));
      const start = Math.floor(r() * ncols);
      const end = start + Math.floor(r() * (ncols - start));
      const at = { top, bottom, start, end };
      const h = Math.floor(r() * 7);
      const src = Array.from({ length: h }, () => Array.from({ length: Math.floor(r() * 7) }, () => (r() < 0.1 ? '' : `v${Math.floor(r() * 100)}`)));
      const max = r() < 0.2 ? Math.floor(r() * 20) : 100_000;
      const plan = planPaste(src.map((row) => row.map((text) => ({ text }))), at, shown<Row>(uniq), columns, { max });
      const want = oracle(uniq, ncols, at, src, max);
      const d = shown<Row>(uniq);
      const got = {
        cells: plan.cells.map((c) => {
          const i = d.indexOf(c.key);
          expect(i, `seed ${s}: a planned row is shown`).toBeGreaterThanOrEqual(0);
          expect(d.nodeAt(i as never).kind, `seed ${s}: never a non-data row`).toBe('data');
          return [tokenOf(d.nodeAt(i as never)), c.column, (c.input as { text: string }).text];
        }),
        outside: plan.outside,
        tooBig: plan.tooBig,
        box: plan.box,
      };
      expect(got, `seed ${s}: ${JSON.stringify({ uniq, at, src, max })}`).toEqual(want);
      // Each cell once, in row then column order.
      const keys = got.cells.map((c) => `${c[0]}|${c[1]}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('the default cap (owner QB4)', () => {
  it('is 100 000 cells: 100 000 planned, 100 001 refused, with no max given', () => {
    expect(PASTE_MAX).toBe(100_000);
    const tokens = Array.from({ length: 100_001 }, (_, i) => `r${i}`);
    const d = shown<Row>(tokens);
    const columns = createColumnModel<Row>([{ id: 'c0' }]).visible();
    const at = (n: number) => ({ top: 0, bottom: n - 1, start: 0, end: 0 });
    const ok = planPaste([[{ text: 'x' }]], at(100_000), d, columns);
    expect([ok.cells.length, ok.tooBig]).toEqual([100_000, false]);
    const no = planPaste([[{ text: 'x' }]], at(100_001), d, columns);
    expect([no.cells.length, no.tooBig, no.box]).toEqual([0, true, null]);
  });
});
