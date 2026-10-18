import { describe, it, expect } from 'vitest';
import { clientRows, createColumnModel, enumCodec, localeCtx, makeQuery, type ColumnDef, type ColumnFilter, type SetValue, type ValueList } from '@dzgrid/core';
import { mulberry32 } from './support/rng.js';

/**
 * docs/behaviors/value-list.md, in the browser, over time: one handle kept open
 * while seeded steps change the other filters, the column's own filter
 * (include, exclude, combined, blanks), the quick search, the list's search,
 * the rows, the language and zone, the visible columns. After every step the
 * list is checked against an oracle built from Intl and a plain fold (no code
 * of the model), and the handle's notifications are counted.
 */
type Row = { id: string } & Record<string, unknown>;
const OPTIONS = [{ value: 'p', label: 'Pomme' }, { value: 'q', label: 'quetsche' }, { value: 'r', label: 'Été' }, { value: 's', label: 'رمان' }];
const defs = (hideE: boolean): ColumnDef<Row>[] => [
  { id: 's' },
  { id: 'e', type: 'enum', enumOptions: OPTIONS, ...(hideE && { hidden: true }) },
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
const WORDS = ['e', 'et', 'ze', 'app', 'احمد', 'item', 'pom', 'ete', 'b', 'a', 'ghost', '  ete  ', 'ee', 'ez', 'ea', 'leap', '234', '١٢', '1 2'];

const digits = (s: string) => [...s].map((ch) => { const c = ch.codePointAt(0)!; return c >= 0x660 && c <= 0x669 ? String(c - 0x660) : c >= 0x6f0 && c <= 0x6f9 ? String(c - 0x6f0) : ch; }).join('');
const fold = (s: string) => digits(s).replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627').normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '').toLowerCase().normalize('NFC');
const words = (s: string) => fold(s).split(/\s+/).filter(Boolean);

type Col = 's' | 'e' | 'eo' | 'n' | 'd' | 'i' | 'h';
interface Ctx { locale: string; numerals: 'latn' | 'locale'; zone: string }
const tagOf = (c: Ctx) => {
  const base = new Intl.Locale(c.locale).baseName;
  const nu = c.numerals === 'latn' ? 'latn' : new Intl.NumberFormat(base).resolvedOptions().numberingSystem;
  return { tag: `${base}-u-ca-gregory-nu-${nu}`, coll: `${base}-u-ca-gregory-nu-latn` };
};
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
    case 'n': { const v = Number(x); return Number.isFinite(v) && x.trim() !== '' ? new Intl.NumberFormat(tag, { maximumSignificantDigits: 15 }).format(v) : x; }
    case 'd': return DAYS.includes(x) ? new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(Date.parse(`${x}T00:00:00Z`)) : x;
    case 'i': return INSTANTS.includes(x) ? new Intl.DateTimeFormat(tag, { timeZone: c.zone, hourCycle: 'h23', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(Date.parse(x)) : x;
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
const pool = (col: Col): readonly string[] => (col === 's' || col === 'h' ? TEXTS : col === 'e' || col === 'eo' ? ENUMS : col === 'n' ? NUMS.map((x) => (x === 0 ? '0' : String(x))) : col === 'd' ? DAYS : INSTANTS);

interface World {
  rows: Row[];
  c: Ctx;
  hideE: boolean;
  /** Other columns' filters with their tests; the target's own filter (ignored but for its top-level include). */
  others: Record<string, { f: ColumnFilter; test: (r: Row) => boolean }>;
  own: ColumnFilter | null;
  quick: string;
  search: string;
  max: number | null;
}

function oracle(target: Col, w: World): ValueList {
  const tests = Object.values(w.others).map((o) => o.test);
  if (w.quick.trim()) {
    const qw = words(w.quick);
    tests.push((r) => qw.every((x) => {
      const hay: string[] = [];
      const s = exportOf('s', r['s']);
      if (s !== null) hay.push(fold(s));
      for (const col of (w.hideE ? ['eo'] : ['e', 'eo']) as Col[]) {
        const v = exportOf(col, r[col]);
        if (v !== null) hay.push(fold(labelOf(col, v, w.c)), v.toLowerCase());
      }
      return hay.some((h) => h.includes(x));
    }));
  }
  const counts = new Map<string, number>();
  let blanks = 0;
  for (const r of w.rows) {
    if (!tests.every((t) => t(r))) continue;
    const x = exportOf(target, r[target]);
    if (x === null) blanks++;
    else counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  const sw = words(w.search);
  const matches = (x: string) => sw.every((y) => fold(labelOf(target, x, w.c)).includes(y) || fold(x).includes(y));
  const found = [...counts.keys()].filter(matches).sort((a, b) => compare(target, a, b, w.c));
  const cap = w.max ?? 2000;
  const ticked = w.own?.type === 'set' && Array.isArray(w.own.include) ? w.own.include : [];
  const extra: SetValue[] = [];
  for (const x of ticked) {
    if (counts.has(x) || extra.some((e) => e.value === x) || !matches(x)) continue;
    extra.push({ value: x, label: labelOf(target, x, w.c), count: 0, selected: true });
  }
  return {
    values: [...extra, ...found.filter((x, i) => i < cap || ticked.includes(x)).map((x) => ({ value: x, label: labelOf(target, x, w.c), count: counts.get(x)! }))],
    blanks,
    truncated: found.length > cap,
  };
}

function scenario(seed: number, steps: number) {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const subset = (col: Col) => pool(col).filter(() => rnd() < 0.4);
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
  let next = 0;
  const newRow = (): Row => {
    const r: Row = { id: `r${next++}` };
    for (const col of ['s', 'e', 'n', 'd', 'i', 'h'] as const) r[col] = cell(col);
    r['eo'] = r['e'];
    return r;
  };
  const loc = pick(LOCALES);
  const target = pick(['s', 'e', 'eo', 'n', 'd', 'i'] as const);
  const w: World = { rows: Array.from({ length: Math.floor(rnd() * 30) }, newRow), c: { locale: loc.locale, numerals: loc.numerals, zone: pick(ZONES) }, hideE: false, others: {}, own: null, quick: '', search: '', max: rnd() < 0.5 ? 1 + Math.floor(rnd() * 4) : null };
  const filterModel = () => ({ ...Object.fromEntries(Object.entries(w.others).map(([k, v]) => [k, v.f])), ...(w.own && { [target]: w.own }) });
  const ownFilter = (): ColumnFilter | null => {
    const r = rnd();
    const ghosts = target === 's' || target === 'e' || target === 'eo' ? ['ghost'] : target === 'n' ? ['99'] : [];
    const inc = () => [...subset(target), ...(rnd() < 0.5 ? ghosts : []), ...(rnd() < 0.3 ? [pick(pool(target))] : [])];
    if (r < 0.2) return null;
    if (r < 0.55) return { type: 'set', include: inc(), ...(rnd() < 0.3 && { blanks: 'include' as const }) };
    if (r < 0.7) return { type: 'set', exclude: inc() };
    if (r < 0.85) return { type: 'combined', join: pick(['and', 'or'] as const), conditions: [{ type: 'set', include: inc() }, { type: 'set', include: inc() }] };
    return { type: 'set', include: [], blanks: 'include' };
  };

  const m = clientRows<Row>({ rows: w.rows, getRowId: (r) => r.id, columns: createColumnModel<Row>(defs(false)), ctx: localeCtx({ locale: w.c.locale, numerals: w.c.numerals, timeZone: w.c.zone }) });
  let h = m.setValues(target, w.max === null ? {} : { max: w.max });
  let calls = 0;
  h.subscribe(() => calls++);
  const log: string[] = [];
  const out: { seed: number; step: number; what: string; got: ValueList | null; want: ValueList; calls: number; changed: boolean; sameContent: boolean }[] = [];
  let prev = h.result;
  let prevWant = oracle(target, w);
  out.push({ seed, step: 0, what: 'open', got: h.result, want: prevWant, calls: 0, changed: true, sameContent: false });
  for (let step = 1; step <= steps; step++) {
    calls = 0;
    const r = rnd();
    let what: string;
    if (r < 0.15) {
      const col = pick((['s', 'e', 'h', 'd'] as const).filter((x) => x !== target));
      if (w.others[col] && rnd() < 0.4) delete w.others[col];
      else {
        const include = subset(col);
        const blanks = rnd() < 0.5;
        w.others[col] = { f: { type: 'set', include, ...(blanks && { blanks: 'include' as const }) }, test: (row) => { const x = exportOf(col, row[col]); return x === null ? blanks : include.includes(x); } };
      }
      what = `other ${col}`;
      m.setQuery(makeQuery({ filter: filterModel(), quick: w.quick }));
    } else if (r < 0.2 && target !== 'n') {
      if (w.others['n']) delete w.others['n'];
      else {
        const v = pick(NUMS);
        w.others['n'] = { f: { type: 'number', op: 'gt', value: v }, test: (row) => typeof row['n'] === 'number' && (row['n'] as number) > v };
      }
      what = 'other n';
      m.setQuery(makeQuery({ filter: filterModel(), quick: w.quick }));
    } else if (r < 0.4) {
      w.own = ownFilter();
      what = `own ${JSON.stringify(w.own)}`;
      m.setQuery(makeQuery({ filter: filterModel(), quick: w.quick }));
    } else if (r < 0.5) {
      w.quick = rnd() < 0.3 ? '' : pick(WORDS.filter((x) => !/[0-9]/.test(digits(x))));
      what = `quick ${w.quick}`;
      m.setQuery(makeQuery({ filter: filterModel(), quick: w.quick }));
    } else if (r < 0.62) {
      const t = rnd() < 0.2 ? '' : pick(WORDS);
      w.search = t.trim();
      what = `search ${JSON.stringify(t)}`;
      h.search(t);
    } else if (r < 0.75) {
      const k = rnd();
      if (k < 0.4 || w.rows.length === 0) {
        const add = [newRow()];
        w.rows = [...w.rows, ...add];
        m.applyTransaction({ add });
        what = 'add';
      } else if (k < 0.7) {
        const victim = pick(w.rows);
        const repl = { ...newRow(), id: victim.id };
        next--;
        w.rows = w.rows.map((x) => (x.id === victim.id ? repl : x));
        m.applyTransaction({ update: [repl] });
        what = `update ${victim.id}`;
      } else {
        const victim = pick(w.rows);
        w.rows = w.rows.filter((x) => x.id !== victim.id);
        m.applyTransaction({ remove: [victim.id] });
        what = `remove ${victim.id}`;
      }
    } else if (r < 0.8) {
      w.rows = Array.from({ length: Math.floor(rnd() * 30) }, newRow);
      m.setRows(w.rows);
      what = 'setRows';
    } else if (r < 0.88) {
      const l = pick(LOCALES);
      w.c = { locale: l.locale, numerals: l.numerals, zone: pick(ZONES) };
      what = `ctx ${JSON.stringify(w.c)}`;
      m.setContext(localeCtx({ locale: w.c.locale, numerals: w.c.numerals, timeZone: w.c.zone }));
    } else if (r < 0.94) {
      w.hideE = !w.hideE;
      what = `hideE ${w.hideE}`;
      m.setColumns(createColumnModel<Row>(defs(w.hideE)));
    } else if (r < 0.97) {
      what = 'sort';
      m.setQuery(makeQuery({ filter: filterModel(), quick: w.quick, sort: [{ column: pick(['s', 'n', 'd']), dir: pick(['asc', 'desc'] as const) }] }));
    } else {
      // Reopened: the old handle is closed and tells nothing more.
      const old = h;
      let oldCalls = 0;
      old.subscribe(() => oldCalls++);
      h = m.setValues(target, { search: w.search, ...(w.max !== null && { max: w.max }) });
      h.subscribe(() => calls++);
      m.setQuery(makeQuery({ filter: filterModel(), quick: w.quick === '' ? ' ' : '' }));
      w.quick = w.quick === '' ? ' ' : '';
      what = 'reopen';
      expect(oldCalls, `seed ${seed} step ${step}: a closed handle told`).toBe(0);
      prev = null;
    }
    log.push(what);
    const want = oracle(target, w);
    const changed = h.result !== prev;
    out.push({ seed, step, what, got: h.result, want, calls, changed, sameContent: JSON.stringify(want) === JSON.stringify(prevWant) });
    prev = h.result;
    prevWant = want;
  }
  return { out, target, log };
}

describe('value lists over time, against an oracle (browser)', () => {
  it('400 seeded scenarios of 25 steps: the list is the oracle\'s after every step; one notification per new result, none otherwise', () => {
    let ticks = 0;
    let steps = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const { out, target, log } = scenario(seed, 25);
      for (const s of out) {
        const where = `seed ${seed} (${target}) step ${s.step}: ${s.what}\n${log.slice(0, s.step).join('\n')}`;
        expect(s.got, where).toEqual(s.want);
        if (s.step > 0 && s.what !== 'reopen') expect(s.calls, `${where}: notifications`).toBe(s.changed ? 1 : 0);
        if (s.want.values.some((v) => v.selected)) ticks++;
        steps++;
      }
    }
    expect(ticks).toBeGreaterThan(500);
    expect(steps).toBe(400 * 26);
  });

  it('a step that leaves the content the same tells nothing', async () => {
    const spurious: string[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      const { out, target } = scenario(seed, 25);
      for (const s of out) if (s.step > 0 && s.what !== 'reopen' && s.sameContent && s.calls > 0) spurious.push(`seed ${seed} (${target}) step ${s.step}: ${s.what}`);
    }
    // value-list.md: the handle tells only when the result changed in content.
    expect(spurious).toEqual([]);
    // eslint-disable-next-line no-console
    if (process.env["DZ_SPURIOUS"]) (await import("node:fs")).writeFileSync(process.env["DZ_SPURIOUS"], JSON.stringify([spurious.length, spurious], null, 1));
  });
});
