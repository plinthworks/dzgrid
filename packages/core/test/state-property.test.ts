// Phase 6 step 5 (step05-plan §4.1, grid-state.md 4, 14): random states over random columns, 1 000 seeds. A captured state,
// restored on a fresh grid and captured again, is the same TEXT, with nothing skipped; built for a right-to-left reader (Arabic,
// the start on the right) it is the same state, and back. Columns with `movable: false`, `hideable: false`, `sortable: false`,
// a pinned or hidden definition are among the generated ones.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, localeCtx, type ColumnDef, type LocaleCtx } from '@dzgrid/core';
import { captureState, restoreState, stateText, type GridState } from '@dzgrid/core/state';
import { mulberry32 } from './support/rng.js';

type Row = Record<string, unknown> & { id: string };
const SEEDS = Number(process.env.STATE_SEEDS ?? 1000);
const LTR = localeCtx({ locale: 'fr-FR' });
const RTL = localeCtx({ locale: 'ar-DZ' });
const WORDS = ['nom', 'âge', 'ville', 'محمد', 'المدينة', 'date de naissance', 'رقم الملف', 'x'];

function world(seed: number) {
  const r = mulberry32(seed);
  const pick = <V>(xs: readonly V[]): V => xs[Math.floor(r() * xs.length)]!;
  const n = 1 + Math.floor(r() * 30);
  const defs: ColumnDef<Row>[] = Array.from({ length: n }, (_, i) => ({
    id: `${pick(WORDS)} ${i}`,
    ...(r() < 0.3 && { width: 60 + Math.floor(r() * 200) }),
    ...(r() < 0.1 && { movable: false }),
    ...(r() < 0.1 && { hideable: false as const }),
    ...(r() < 0.1 && { sortable: false }),
    ...(r() < 0.1 && { pinned: pick(['start', 'end'] as const) }),
  })).map((d) => (r() < 0.1 && d.hideable !== false ? { ...d, hidden: true } : d));
  const rows: Row[] = Array.from({ length: Math.floor(r() * 12) }, (_, i) => ({ id: `r${i}`, ...Object.fromEntries(defs.map((d) => [d.id, pick(WORDS)])) }));
  const pageSize = r() < 0.5 ? 1 + Math.floor(r() * 5) : undefined;
  const ids = defs.map((d) => d.id);
  const order = [...ids].sort(() => r() - 0.5);
  // A raw state, as an application or a user's browser might hold one: any order, any subset.
  const raw = {
    v: 1,
    columns: order.filter(() => r() < 0.9).map((id, i) => ({
      id,
      ...(r() < 0.4 && { width: 40 + Math.floor(r() * 400) }),
      ...(r() < 0.3 && { hidden: true }),
      pinned: r() < 0.7 ? null : pick(['start', 'end'] as const),
      order: i,
    })),
    sort: Array.from({ length: Math.floor(r() * 4) }, () => ({ column: pick(ids), dir: pick(['asc', 'desc'] as const) })),
    filter: r() < 0.5 ? { [pick(ids)]: { type: 'text', op: 'contains', value: pick(WORDS) } } : {},
    quick: r() < 0.5 ? pick(WORDS) : '',
    page: Math.floor(r() * 4),
    pageSize: 1 + Math.floor(r() * 6),
    density: pick(['compact', 'comfortable', 'spacious'] as const),
  };
  return { defs, rows, pageSize, raw };
}

function grid(w: ReturnType<typeof world>, ctx: LocaleCtx) {
  const columns = createColumnModel<Row>(w.defs);
  const k = createKernel<Row>({ rows: clientRows<Row>({ rows: w.rows, getRowId: (x) => x.id, columns, ctx, ...(w.pageSize && { page: { pageSize: w.pageSize } }) }), columns });
  let density: string | undefined;
  const env = { density: () => density as never, setDensity: (d: unknown) => void (density = d as string) };
  return { k, env, capture: () => captureState(k, env), restore: (s: unknown) => restoreState(k, s, env) };
}

/** The columns as a reader sees them, logically: each side's ids in order (start, centre, end). */
const sides = (g: ReturnType<typeof grid>) => (['start', 'center', 'end'] as const).map((s) => g.k.columns.layout[s].columns.map((c) => c.id));

describe('GridState round trip, 1 000 seeds (G 4, 14)', () => {
  it('capture → restore on a fresh grid → capture: the same text, nothing skipped; the same in right to left, and back', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const w = world(seed);
      const g0 = grid(w, LTR);
      g0.restore(w.raw);
      const s0: GridState = g0.capture();
      const text = stateText(s0);
      // The text is JSON of the state, and the state is what the grid shows.
      expect(JSON.parse(text), `seed ${seed}`).toEqual(s0);
      expect(s0.columns.some((c) => !c.hidden), `seed ${seed}: never every column hidden`).toBe(true);
      for (const c of s0.columns) if (w.defs.find((d) => d.id === c.id)!.hideable === false) expect(c.hidden, `seed ${seed}`).toBeUndefined();

      const ltr = grid(w, LTR);
      const rtl = grid(w, RTL);
      expect(ltr.restore(s0), `seed ${seed}`).toEqual([]);
      expect(rtl.restore(JSON.parse(text)), `seed ${seed}`).toEqual([]);
      expect(stateText(ltr.capture()), `seed ${seed}`).toBe(text);
      expect(stateText(rtl.capture()), `seed ${seed}`).toBe(text);
      // Same logical sides (the start, on the right in Arabic), same order, same query.
      expect(sides(rtl), `seed ${seed}`).toEqual(sides(g0));
      expect(rtl.k.query.key, `seed ${seed}`).toBe(g0.k.query.key);
      expect(rtl.k.rows.page, `seed ${seed}`).toEqual(g0.k.rows.page);

      // And back: captured in right to left, restored in left to right.
      const back = grid(w, LTR);
      expect(back.restore(rtl.capture()), `seed ${seed}`).toEqual([]);
      expect(stateText(back.capture()), `seed ${seed}`).toBe(text);
      // A second capture of one grid: the same text (deterministic).
      expect(stateText(back.capture()), `seed ${seed}`).toBe(text);
    }
  });
});
