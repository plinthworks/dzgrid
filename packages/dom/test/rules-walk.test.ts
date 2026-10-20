// A seeded walk over a paged grid with a selection rule (step 21, docs/behaviors/selection-rules.md):
// boxes, Shift, Space, Ctrl+A, the header box, pages, Clear, a new context, on four models (the
// browser's pages, a server's pages by offset and by cursor, a fetched set paged in the browser).
// `WALK_SEEDS=200` runs more.
import { describe, it, expect, afterEach } from 'vitest';
import { isSelected, type RowNode, type SelectionState } from '@dzgrid/core';
import { cleanup, held, idOf, k as keyOf, rmake, ROWS, type R } from './support-rules.js';
import { mulberry32 } from '../../core/test/support/rng.js';

afterEach(cleanup);
const SEEDS = Number(process.env['WALK_SEEDS'] ?? 25);

/** Mutual exclusions by the last digit and at most `max` rows; the context moves `max`. */
const PAIRS: readonly (readonly [number, number])[] = [[0, 1], [2, 5], [3, 4], [6, 9], [7, 8]];
const digit = (id: string) => Number(id.slice(1)) % 10;
const allowed = (id: string, held_: readonly string[], max: number): boolean =>
  held_.length < max && !held_.some((o) => PAIRS.some(([a, b]) => (a === digit(id) && b === digit(o)) || (b === digit(id) && a === digit(o))));
const rule = (row: RowNode<R>, s: SelectionState, c: unknown) => allowed(row.data.id, [...s.keys].map(idOf), (c as { max: number }).max);

type Mode = 'paged' | 'offset' | 'cursor' | 'fetched';

function walk(mode: Mode, seed: number) {
  const rnd = mulberry32(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const log: string[] = [];
  const fail = (m: string) => `seed ${seed} (${mode}): ${m}\n  ${log.join('\n  ')}`;
  const db = ROWS.slice(0, 20 + int(10));
  let max = 3 + int(4);
  const t = rmake({ mode, rows: db, pageSize: 5 + int(2) * 5, rule, settings: { context: { max } } });
  const k = t.g.kernel;
  const settled = new Set<unknown>();
  const answer = () => {
    for (const c of t.f.calls) {
      if (settled.has(c)) continue;
      settled.add(c);
      const p = c.req.page;
      if (!p) { c.ok({ rows: db.map((x) => ({ ...x })) }); continue; }
      const more = p.offset + p.size < db.length;
      c.ok({ rows: db.slice(p.offset, p.offset + p.size).map((x) => ({ ...x })), ...(mode === 'offset' ? { total: db.length } : { hasNext: more, ...(more && { nextCursor: `c${p.offset + p.size}` }) }) });
    }
  };
  answer();
  const shown = (): string[] => { const d = k.rows.displayed; return Array.from({ length: d.count }, (_, i) => idOf(d.keyAt(d.index(i)!))); };
  const check = () => {
    const s = k.selection;
    expect(s.mode, fail('never everything-except')).toBe('include');
    const ids = held(s);
    expect(ids.length, fail('at most six')).toBeLessThanOrEqual(6);
    for (const a of ids) for (const b of ids) expect(a === b || !PAIRS.some(([x, y]) => x === digit(a) && y === digit(b)), fail(`pair ${a} ${b}`)).toBe(true);
    for (const id of shown()) {
      const on = isSelected(s, keyOf(id));
      const row = t.rowEl(id);
      if (!row) continue;
      expect(row.getAttribute('aria-selected'), fail(`aria-selected ${id}`)).toBe(on ? 'true' : 'false');
      expect(row.hasAttribute('aria-disabled'), fail('no aria-disabled')).toBe(false);
      const refused = !on && !allowed(id, ids, max);
      expect(t.check(id)!.hasAttribute('data-dzg-refused'), fail(`refused look ${id}`)).toBe(refused);
    }
    const rows = shown();
    const on = rows.filter((id) => ids.includes(id)).length;
    const rest = rows.filter((id) => !ids.includes(id)).every((id) => !allowed(id, ids, max));
    expect(t.headerBox()!.getAttribute('aria-checked'), fail('box')).toBe(on === 0 ? 'false' : on === rows.length || rest ? 'true' : 'mixed');
    const all = t.host.querySelector<HTMLElement>('.dzg-footer button[data-act="all"]');
    expect(all === null || all.hidden, fail('no Select all N under a rule')).toBe(true);
    // A refused row named in the last refusal is not selected.
    const last = t.refusals().at(-1);
    if (last && last.type === 'selectionRefused') for (const key of last.rows) if (!ids.includes(idOf(key))) expect(isSelected(s, key)).toBe(false);
  };
  check();
  for (let step = 0; step < 30; step++) {
    const rows = shown();
    const id = rows[int(rows.length)];
    const r = int(9);
    if (r === 0 && id) { log.push(`box ${id}`); t.clickBox(id); }
    else if (r === 1 && id) { log.push(`shift box ${id}`); t.clickBox(id, { shiftKey: true }); }
    else if (r === 2 && id) { log.push(`space ${id}`); t.focusRow(id); t.press(' '); }
    else if (r === 3 && id) { log.push('ctrl+a'); t.focusRow(id); t.press('a', { ctrlKey: true }); }
    else if (r === 4) { log.push('header box'); t.headerBox()!.click(); }
    else if (r === 5) { log.push('next'); k.dispatch({ type: 'page.go', index: (k.rows.page?.index ?? 0) + 1 }, 'user'); answer(); }
    else if (r === 6) { log.push('prev'); k.dispatch({ type: 'page.go', index: Math.max(0, (k.rows.page?.index ?? 0) - 1) }, 'user'); answer(); }
    else if (r === 7) { log.push('clear'); k.dispatch({ type: 'selection.clear' }, 'user'); }
    else { max = 3 + int(4); log.push(`context max ${max}`); t.g.update({ context: { max } }); }
    check();
  }
}

describe('a paged grid with a selection rule, walked', () => {
  for (const mode of ['paged', 'offset', 'cursor', 'fetched'] as const) {
    it(`${mode}: ${SEEDS} seeded walks of 30 steps`, () => {
      for (let seed = 1; seed <= SEEDS; seed++) {
        walk(mode, seed * 31 + mode.length);
        cleanup();
      }
    });
  }
});
