// Phase 7 step 3–4 (plan §3 step 3: « 1 000 seeded property cases against a hand-written recursive oracle »): random
// rows, grouping columns, a sort, a filter, open groups, footers and an edit, read through the grid's model and through
// a plain recursive grouping written here from row-grouping.md and aggregation.md. Text values are lower-case ASCII
// words (the collation then orders them as `<` does) and amounts whole numbers (exact sums), so the oracle needs no Intl.
import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, createKernel, groupKey, localeCtx, makeQuery, type ValueReader } from '@dzgrid/core';
import { groupShape, type GroupedRows } from '@dzgrid/core/grouping';

type Row = { id: string; g: string | null; k: string | null; h: number | null; v: number | null };

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['ab', 'b', 'ba', 'cab', 'c'];
const TEXT = (id: string): boolean => id === 'g' || id === 'k';

/** Blank last; text by `<`, numbers by value; `dir` -1 reverses all but the blanks. */
const cmp = (a: string | number | null, b: string | number | null, dir: number): number =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : (a < b ? -1 : a > b ? 1 : 0) * dir;

interface Case { rows: Row[]; by: string[]; sort: { column: 'h' | 'v'; dir: 'asc' | 'desc' } | null; desc: Set<string>; min: number | null; footers: 'none' | 'group' | 'grand' | 'both'; opened: string[][]; edit: [string, 'v' | 'g', unknown] | null }

function makeCase(r: () => number): Case {
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)]!;
  const n = Math.floor(r() * 25);
  const rows: Row[] = Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    g: r() < 0.15 ? null : pick(WORDS),
    k: r() < 0.15 ? null : pick(WORDS.slice(0, 3)),
    h: r() < 0.1 ? null : Math.floor(r() * 4),
    v: r() < 0.2 ? null : Math.floor(r() * 200) - 50,
  }));
  const cols = ['g', 'k', 'h'];
  const by: string[] = [];
  for (let l = Math.floor(r() * 4); l > 0; l--) {
    const c = pick(cols.filter((x) => !by.includes(x)));
    if (c) by.push(c);
  }
  const sort = r() < 0.5 ? null : { column: pick(['h', 'v'] as const), dir: pick(['asc', 'desc'] as const) };
  const desc = new Set<string>(sort?.dir === 'desc' ? [sort.column] : []);
  const opened: string[][] = [];
  for (let j = Math.floor(r() * 6); j > 0; j--) {
    // A group path as the oracle keys it: column, letter + value, level by level.
    const p: string[] = [];
    for (let l = 0; l < by.length && (l === 0 || r() < 0.7); l++) {
      const c = by[l]!;
      const v = c === 'h' ? pick([0, 1, 2, 3, null]) : pick([...WORDS, null]);
      p.push(c, v === null ? '' : (c === 'h' ? 'n' : 't') + v);
    }
    if (p.length) opened.push(p);
  }
  const edit = n && r() < 0.3 ? ([`r${Math.floor(r() * n)}`, pick(['v', 'g'] as const), r() < 0.5 ? null : pick([7, 'ba', 3])] as Case['edit']) : null;
  return { rows, by, sort, desc, min: r() < 0.3 ? Math.floor(r() * 100) - 50 : null, footers: pick(['none', 'group', 'grand', 'both'] as const), opened, edit };
}

/** The oracle: filter, stable sort, then group recursively by Map, groups by value, totals by plain sums. */
function oracle(c: Case): { shown: string[]; total: number | null } {
  const value = (row: Row, col: string): unknown => {
    if (c.edit && row.id === c.edit[0] && col === c.edit[1]) {
      // A grouping value edited stays as it was (the order is stale); an amount counts at once.
      if (col === 'v') return c.edit[2] === null || typeof c.edit[2] === 'number' ? c.edit[2] : null;
    }
    return row[col as keyof Row];
  };
  let rows = c.rows.filter((row) => c.min === null || (row.v !== null && row.v >= c.min));
  if (c.sort) {
    const { column, dir } = c.sort;
    rows = rows.map((row, i) => [row, i] as const).sort((a, b) => cmp(a[0][column], b[0][column], dir === 'desc' ? -1 : 1) || a[1] - b[1]).map((x) => x[0]);
  }
  const sum = (rs: Row[]): number | null => {
    const vs = rs.map((row) => value(row, 'v')).filter((v): v is number => typeof v === 'number');
    return vs.length ? vs.reduce((a, b) => a + b, 0) : null;
  };
  const out: string[] = [];
  const level = (rs: Row[], l: number, path: string[]): void => {
    if (l === c.by.length) {
      const z = rs.length + (path.length && (c.footers === 'group' || c.footers === 'both') ? 1 : 0) + (!path.length && (c.footers === 'grand' || c.footers === 'both') && rs.length ? 1 : 0);
      rs.forEach((row, i) => out.push(`${'.'.repeat(l)}${row.id} ${i + 1}/${z}`));
      return;
    }
    const col = c.by[l]!;
    const groups = new Map<string | number | null, Row[]>();
    for (const row of rs) {
      const v = row[col as keyof Row] as string | number | null;
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v)!.push(row);
    }
    const keys = [...groups.keys()].sort((a, b) => cmp(a, b, c.desc.has(col) ? -1 : 1));
    const foot = path.length && (c.footers === 'group' || c.footers === 'both') ? 1 : 0;
    const grand = !path.length && (c.footers === 'grand' || c.footers === 'both') && rs.length ? 1 : 0;
    const z = keys.length + foot + grand;
    keys.forEach((v, i) => {
      const p = [...path, col, v === null ? '' : (TEXT(col) ? 't' : 'n') + v];
      const open = c.opened.some((o) => o.join('\u0000') === p.join('\u0000'));
      const rsg = groups.get(v)!;
      out.push(`${'.'.repeat(l)}[${v ?? ''}] (${rsg.length}) ${i + 1}/${z} ${open ? '-' : '+'} ${sum(rsg)}`);
      if (open) {
        level(rsg, l + 1, p);
        const kids = l + 1 === c.by.length ? rsg.length : new Set(rsg.map((row) => row[c.by[l + 1] as keyof Row])).size;
        if (c.footers === 'group' || c.footers === 'both') out.push(`${'.'.repeat(l + 1)}Σ ${kids + 1}/${kids + 1} ${sum(rsg)}`);
      }
    });
  };
  level(rows, 0, []);
  const grand = (c.footers === 'grand' || c.footers === 'both') && rows.length;
  const tops = c.by.length ? new Set(rows.map((row) => row[c.by[0] as keyof Row])).size : rows.length;
  if (grand) out.push(`Σ ${tops + 1}/${tops + 1} ${sum(rows)}`);
  return { shown: out, total: sum(rows) };
}

function grid(c: Case): { shown: string[]; total: number | null } {
  const columns = createColumnModel<Row>([{ id: 'g' }, { id: 'k' }, { id: 'h', type: 'number' }, { id: 'v', type: 'number', aggFunc: 'sum' }]);
  const shape = groupShape<Row>({ by: c.by, footers: c.footers });
  const model = clientRows<Row>({ rows: c.rows, getRowId: (r) => r.id, columns, ctx: localeCtx({ locale: 'en-US' }), shape });
  const kernel = createKernel<Row>({ rows: model, columns });
  kernel.dispatch({ type: 'query.set', query: makeQuery({ sort: c.sort ? [c.sort] : [], filter: c.min === null ? {} : { v: { type: 'number', op: 'gte', value: c.min } } }) }, 'user');
  kernel.dispatch({ type: 'rows.expand', rows: c.opened.map((p) => groupKey(p)), expanded: true }, 'user');
  if (c.edit) {
    const [id, col, v] = c.edit;
    const reader: ValueReader<Row> = { version: 1, overlay: true, value: (cl, row, rid) => (rid === id && cl.id === col ? v : cl.read(row)) };
    kernel.dispatch({ type: 'edits.reader', reader, columns: [col] }, 'user');
  }
  const d = model.displayed as GroupedRows<Row>;
  const shown = Array.from({ length: d.count }, (_, i) => {
    const at = d.index(i)!;
    const n = d.nodeAt(at);
    const dots = '.'.repeat(d.levelAt(at));
    const place = `${d.posAt(at)}/${d.sizeAt(at)}`;
    if (n.kind === 'group') return `${dots}[${n.label}] (${n.count}) ${place} ${d.expandedAt(at) ? '-' : '+'} ${n.aggs!.v}`;
    if (n.kind === 'footer') return `${dots}Σ ${place} ${n.aggs.v}`;
    return `${dots}${n.kind === 'data' ? n.id : n.kind} ${place}`;
  });
  return { shown, total: shape.totals().v as number | null };
}

describe('grouping against a recursive oracle (1 000 seeded cases)', () => {
  it('shows the same rows, places, counts and sums', () => {
    const r = rng(7);
    for (let i = 0; i < 1000; i++) {
      const c = makeCase(r);
      // A filter on the edited amount would move rows only at « Réappliquer »: the oracle keeps the edit out of the filter.
      if (c.edit?.[1] === 'v' && c.min !== null) c.edit = null;
      const label = `case ${i}: ${JSON.stringify({ ...c, desc: [...c.desc] })}`;
      expect(grid(c), label).toEqual(oracle(c));
    }
  });
});
