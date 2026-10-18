import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, enumCodec, localeCtx, makeQuery, type ColumnDef, type ColumnFilter, type SetValue } from '@dzgrid/core';
import { mulberry32 } from './support/rng.js';

/**
 * Seeded rows, languages, zones and filters; the browser's value list against
 * an oracle of its own that scans the rows with Intl directly (docs/behaviors/value-list.md).
 * Shares nothing with the code under test but the public model.
 */
type Row = { id: string } & Record<string, unknown>;
const OPTIONS = [{ value: 'p', label: 'Pomme' }, { value: 'q', label: 'quetsche' }, { value: 'r', label: 'Été' }, { value: 's', label: 'رمان' }];
const DEFS: ColumnDef<Row>[] = [
  { id: 's' },
  { id: 'e', type: 'enum', enumOptions: OPTIONS },
  { id: 'eo', type: 'enum', codec: enumCodec(OPTIONS, { sort: 'option-order' }) },
  { id: 'n', type: 'number' },
  { id: 'd', type: 'day' },
  { id: 'i', type: 'instant' },
  { id: 'h', hidden: true },
];
const TEXTS = ['été', 'Ete', 'ete', 'ÉTÉ', 'zèbre', 'Zebre', 'apple', 'Apple', 'أحمد', 'احمد', 'إحمد', 'بكر', 'item2', 'item10', 'a b', 'ça'];
const ENUMS = ['p', 'q', 'r', 's', 'x', 'w'];
const NUMS = [0, -1, 2.5, 1234.5, 7, 100, -0.25];
const DAYS = ['2026-03-05', '2025-12-31', '2026-01-01', '1999-07-14'];
const INSTANTS = ['2026-03-05T23:30:00Z', '2026-03-04T10:00:00Z', '2026-03-05T00:15:00Z', '2025-12-31T22:00:00Z'];
const LOCALES = [{ locale: 'en-US', numerals: 'latn' }, { locale: 'fr-FR', numerals: 'latn' }, { locale: 'ar-DZ', numerals: 'latn' }, { locale: 'ar-EG', numerals: 'locale' }] as const;
const ZONES = ['UTC', 'Africa/Algiers', 'Asia/Tokyo', 'America/Los_Angeles'];
const WORDS = ['e', 'et', 'ze', 'app', 'احمد', 'item', 'pom', 'ete', 'b', 'a'];

/** The oracle's own folding, enough for the pools above: case, Latin accents, Arabic marks, alef forms (before NFKD splits them into alef and a mark). */
const fold = (s: string) => s.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627').normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '').toLowerCase().normalize('NFC');
const words = (s: string) => fold(s).split(/\s+/).filter(Boolean);

type Col = 's' | 'e' | 'eo' | 'n' | 'd' | 'i' | 'h';
interface Ctx { locale: string; numerals: 'latn' | 'locale'; zone: string }
const tagOf = (c: Ctx) => {
  const base = new Intl.Locale(c.locale).baseName;
  const nu = c.numerals === 'latn' ? 'latn' : new Intl.NumberFormat(base).resolvedOptions().numberingSystem;
  return { tag: `${base}-u-ca-gregory-nu-${nu}`, coll: `${base}-u-ca-gregory-nu-latn` };
};

/** The cell's export text, or null for a blank or unreadable one. */
function exportOf(col: Col, v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  switch (col) {
    case 's': case 'h': return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null;
    case 'e': case 'eo': return typeof v === 'string' ? v : null;
    case 'n': return typeof v === 'number' && Number.isFinite(v) ? (v === 0 ? '0' : String(v)) : null;
    case 'd': return typeof v === 'string' && DAYS.includes(v) ? v : null;
    case 'i': return typeof v === 'string' && INSTANTS.includes(v) ? v : null;
  }
}
function labelOf(col: Col, x: string, c: Ctx): string {
  const { tag } = tagOf(c);
  switch (col) {
    case 's': case 'h': return x;
    case 'e': case 'eo': return OPTIONS.find((o) => o.value === x)?.label ?? x;
    case 'n': return new Intl.NumberFormat(tag, { maximumSignificantDigits: 15 }).format(Number(x));
    case 'd': return new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(Date.parse(`${x}T00:00:00Z`));
    case 'i': return new Intl.DateTimeFormat(tag, { timeZone: c.zone, hourCycle: 'h23', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(Date.parse(x));
  }
}
function compare(col: Col, a: string, b: string, c: Ctx): number {
  const units = a < b ? -1 : a > b ? 1 : 0;
  const coll = new Intl.Collator(tagOf(c).coll, { sensitivity: 'base', numeric: true });
  let k = 0;
  if (col === 's' || col === 'h') k = coll.compare(a, b);
  else if (col === 'e') k = coll.compare(labelOf(col, a, c), labelOf(col, b, c));
  else if (col === 'eo') {
    const r = (x: string) => { const i = OPTIONS.findIndex((o) => o.value === x); return i === -1 ? OPTIONS.length : i; };
    k = r(a) - r(b);
  } else if (col === 'n') k = Number(a) - Number(b);
  else k = Date.parse(col === 'd' ? `${a}T00:00:00Z` : a) - Date.parse(col === 'd' ? `${b}T00:00:00Z` : b);
  return k || units;
}

describe('value lists, seeded, against an oracle', () => {
  it('600 runs: values, labels, counts, blanks, order, cap, ticked values', () => {
    let nonEmpty = 0;
    let ticked = 0;
    let truncated = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const rnd = mulberry32(seed);
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
      const maybe = <T,>(p: number, f: () => T): T | null => (rnd() < p ? f() : null);
      const loc = pick(LOCALES);
      const c: Ctx = { locale: loc.locale, numerals: loc.numerals, zone: pick(ZONES) };
      const cell = (col: Col): unknown => {
        const r = rnd();
        if (r < 0.1) return null;
        if (r < 0.13) return '';
        if (r < 0.16) return col === 'n' ? 'abc' : col === 'd' || col === 'i' ? 'nope' : col === 's' || col === 'h' ? 3 : 5;
        switch (col) {
          case 's': case 'h': return pick(TEXTS);
          case 'e': case 'eo': return pick(ENUMS);
          case 'n': return pick(NUMS);
          case 'd': return pick(DAYS);
          case 'i': return pick(INSTANTS);
        }
      };
      const n = Math.floor(rnd() * 40);
      const rows: Row[] = Array.from({ length: n }, (_, k) => {
        const r: Row = { id: `r${k}` };
        for (const col of ['s', 'e', 'n', 'd', 'i', 'h'] as const) r[col] = cell(col);
        r['eo'] = r['e'];
        return r;
      });
      const target = pick(['s', 'e', 'eo', 'n', 'd', 'i'] as const);
      const pool = (col: Col): readonly unknown[] => (col === 's' || col === 'h' ? TEXTS : col === 'e' || col === 'eo' ? ENUMS : col === 'n' ? NUMS.map((x) => (x === 0 ? '0' : String(x))) : col === 'd' ? DAYS : INSTANTS);
      const subset = (col: Col) => pool(col).filter(() => rnd() < 0.4).map(String);
      // Other columns: set filters (text-like ones), a number range; the own column: a set the list ignores but for its ticks.
      const filter: Record<string, ColumnFilter> = {};
      const tests: ((r: Row) => boolean)[] = [];
      for (const col of ['s', 'e', 'h', 'd'] as const) {
        if (col === target || rnd() > 0.35) continue;
        const include = subset(col);
        const blanks = rnd() < 0.5;
        filter[col] = { type: 'set', include, ...(blanks && { blanks: 'include' as const }) };
        tests.push((r) => { const x = exportOf(col, r[col]); return x === null ? blanks : include.includes(x); });
      }
      if (target !== 'n' && rnd() < 0.3) {
        const v = pick(NUMS);
        filter['n'] = { type: 'number', op: 'gt', value: v };
        tests.push((r) => typeof r['n'] === 'number' && (r['n'] as number) > v);
      }
      let include: string[] | null = null;
      if (rnd() < 0.5) {
        include = [...subset(target), ...(target === 's' || target === 'e' || target === 'eo' ? ['ghost'] : []), ...(rnd() < 0.3 ? [String(pick(pool(target)))] : [])];
        filter[target] = { type: 'set', include };
      }
      // The quick search: words without digits, over the visible text and enum columns (s, e by label and value, eo too).
      const quick = maybe(0.3, () => pick(WORDS.filter((w) => !/[0-9]/.test(w)))) ?? '';
      if (quick) {
        const qw = words(quick);
        tests.push((r) => qw.every((w) => {
          const hay: string[] = [];
          const s = exportOf('s', r['s']);
          if (s !== null) hay.push(fold(s));
          for (const col of ['e', 'eo'] as const) {
            const x = exportOf(col, r[col]);
            if (x !== null) hay.push(fold(labelOf(col, x, c)), x.toLowerCase());
          }
          return hay.some((h) => h.includes(w));
        }));
      }
      const search = maybe(0.4, () => pick(WORDS)) ?? '';
      const max = maybe(0.5, () => 1 + Math.floor(rnd() * 4));

      const m = clientRows<Row>({ rows, getRowId: (r) => r.id, columns: createColumnModel<Row>(DEFS), ctx: localeCtx({ locale: c.locale, numerals: c.numerals, timeZone: c.zone }) });
      m.setQuery(makeQuery({ filter, quick }));
      const got = m.setValues(target, { search, ...(max !== null && { max }) }).result!;

      // The oracle.
      const counts = new Map<string, number>();
      let blanks = 0;
      for (const r of rows) {
        if (!tests.every((t) => t(r))) continue;
        const x = exportOf(target, r[target]);
        if (x === null) blanks++;
        else counts.set(x, (counts.get(x) ?? 0) + 1);
      }
      const sw = words(search);
      const matches = (x: string) => sw.every((w) => fold(labelOf(target, x, c)).includes(w) || fold(x).includes(w));
      const found = [...counts.keys()].filter(matches).sort((a, b) => compare(target, a, b, c));
      const cap = max ?? 2000;
      const extra: SetValue[] = [];
      for (const x of include ?? []) {
        if (counts.has(x) || extra.some((e) => e.value === x) || !matches(x)) continue;
        extra.push({ value: x, label: labelOf(target, x, c), count: 0, selected: true });
      }
      const want = {
        values: [...extra, ...found.slice(0, cap).map((x) => ({ value: x, label: labelOf(target, x, c), count: counts.get(x)! }))],
        blanks,
        truncated: found.length > cap,
      };
      expect(got, `seed ${seed} (${target}, ${c.locale}, ${c.zone}, search "${search}", quick "${quick}")`).toEqual(want);
      if (want.values.length) nonEmpty++;
      if (extra.length) ticked++;
      if (want.truncated) truncated++;
    }
    // The runs cover what they claim to.
    expect(nonEmpty).toBeGreaterThan(300);
    expect(ticked).toBeGreaterThan(50);
    expect(truncated).toBeGreaterThan(50);
  });
});
