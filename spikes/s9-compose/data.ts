/** (Copy of ../s1-virtual-1m/data.ts, so that each spike stands alone.)
 *
 * Reproducible rows: a seeded PRNG (mulberry32), never Math.random.
 * Thirty columns of five kinds (integer, word, amount, calendar day, flag),
 * so the heap holds what a real grid would hold: small integers, shared
 * strings, boxed doubles.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Cell = number | string | boolean;
export type Row = Record<string, Cell>;
export type Kind = 'int' | 'word' | 'amount' | 'day' | 'flag';

export interface ColumnDef { readonly id: string; readonly kind: Kind; readonly width: number }

const WORDS = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliett',
  'kilo', 'lima', 'mike', 'november', 'oscar', 'papa', 'quebec', 'romeo', 'sierra', 'tango',
  'uniform', 'victor', 'whiskey', 'xray', 'yankee', 'zulu', 'Oran', 'Alger', 'Constantine', 'Annaba',
  'Tlemcen', 'Béjaïa',
];
const KINDS: readonly Kind[] = ['int', 'word', 'amount', 'day', 'flag'];

/** 'YYYY-MM-DD' strings for 2015..2025, built arithmetically (no Date). */
function dayPool(): string[] {
  const out: string[] = [];
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  for (let y = 2015; y <= 2025; y++) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const months = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    months.forEach((len, m) => { for (let d = 1; d <= len; d++) out.push(`${y}-${pad(m + 1)}-${pad(d)}`); });
  }
  return out;
}

export function makeColumns(count: number, seed: number, fixedWidth?: number): ColumnDef[] {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  return Array.from({ length: count }, (_, j) => ({
    id: 'c' + j,
    kind: j === 0 ? 'int' : KINDS[j % KINDS.length]!,
    width: fixedWidth ?? 80 + Math.floor(rand() * 13) * 10,   // 80..200 px
  }));
}

/**
 * `literal`: every row built by one object literal, so all rows share one
 * shape (what JSON.parse or a mapping function produces).
 * `keyed`: properties added one by one under computed keys, the worst case.
 */
export function makeRows(count: number, columns: readonly ColumnDef[], seed: number, shape: 'literal' | 'keyed' = 'literal'): Row[] {
  const rand = mulberry32(seed);
  const days = dayPool();
  const ids = columns.map((c) => c.id);
  // The literal is generated once from the column ids (spike only; ids are c0..c29).
  const literal = new Function('v', `return {${ids.map((id, j) => `${id}: v[${j}]`).join(', ')}};`) as (v: Cell[]) => Row;
  const values: Cell[] = new Array(columns.length);
  const rows: Row[] = new Array(count);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < columns.length; j++) {
      const c = columns[j]!;
      switch (c.kind) {
        case 'int': values[j] = j === 0 ? i : Math.floor(rand() * 100_000); break;
        case 'word': values[j] = WORDS[Math.floor(rand() * WORDS.length)]!; break;
        case 'amount': values[j] = Math.round(rand() * 10_000_000) / 100; break;
        case 'day': values[j] = days[Math.floor(rand() * days.length)]!; break;
        case 'flag': values[j] = rand() < 0.5; break;
      }
    }
    if (shape === 'literal') rows[i] = literal(values);
    else { const row: Row = {}; for (let j = 0; j < ids.length; j++) row[ids[j]!] = values[j]!; rows[i] = row; }
  }
  return rows;
}

export function formatCell(v: Cell, kind: Kind): string {
  if (kind === 'amount') return (v as number).toFixed(2);
  if (kind === 'flag') return v ? '✓' : '·';
  return String(v);
}
