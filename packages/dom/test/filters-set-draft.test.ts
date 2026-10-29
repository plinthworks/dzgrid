// The set filter's draft (step 15; docs/behaviors/filter-set.md "The draft"): a pure module, what
// the ticks mean and what they write. Expectations by hand; a seeded run checks the written filter
// against the core's own set filter on a grid.
import { describe, it, expect, afterEach } from 'vitest';
import { draftOf, filterOf, only, settle, tick, tickAll, ticked, type Draft } from '../src/filters/set/draft.js';
import { filters } from '../src/filters.js';
import { cleanup, make } from './support-filters.js';

afterEach(cleanup);

const ALL = ['a', 'b', 'c', 'd'];
const on = (d: Draft) => ALL.filter((v) => ticked(d, v));

describe('reading a filter', () => {
  it('no filter: everything ticked, blanks too (an exclude of nothing)', () => {
    const d = draftOf(null);
    expect(on(d)).toEqual(ALL);
    expect(d.blanks).toBe(true);
    expect(filterOf(d)).toBeNull();
  });

  it('include: the listed values ticked; blanks only with blanks: include', () => {
    expect(on(draftOf({ type: 'set', include: ['b', 'd'] }))).toEqual(['b', 'd']);
    expect(draftOf({ type: 'set', include: ['b'] }).blanks).toBe(false);
    expect(draftOf({ type: 'set', include: ['b'], blanks: 'include' }).blanks).toBe(true);
  });

  it('exclude: every value but the listed ones; blanks unless blanks: exclude', () => {
    expect(on(draftOf({ type: 'set', exclude: ['a'] }))).toEqual(['b', 'c', 'd']);
    expect(draftOf({ type: 'set', exclude: ['a'] }).blanks).toBe(true);
    expect(draftOf({ type: 'set', exclude: ['a'], blanks: 'exclude' }).blanks).toBe(false);
  });

  it('reads its own output back unchanged (round trip)', () => {
    for (const f of [{ type: 'set', include: ['a', 'c'] }, { type: 'set', include: [], blanks: 'include' }, { type: 'set', exclude: ['b'], blanks: 'exclude' }, { type: 'set', include: [] }] as const)
      expect(filterOf(draftOf(f))).toEqual(f);
  });
});

describe('writing a filter', () => {
  it('include, sorted by code unit, blanks written only when not the default', () => {
    const d = draftOf({ type: 'set', include: [] });
    for (const v of ['é', 'b', 'B', 'a']) tick(d, v, true);
    expect(filterOf(d)).toEqual({ type: 'set', include: ['B', 'a', 'b', 'é'] });
    d.blanks = true;
    expect(filterOf(d)).toEqual({ type: 'set', include: ['B', 'a', 'b', 'é'], blanks: 'include' });
  });

  it('exclude, sorted; blanks: exclude only when unticked', () => {
    const d = draftOf(null);
    tick(d, 'c', false);
    tick(d, 'a', false);
    expect(filterOf(d)).toEqual({ type: 'set', exclude: ['a', 'c'] });
    d.blanks = false;
    expect(filterOf(d)).toEqual({ type: 'set', exclude: ['a', 'c'], blanks: 'exclude' });
  });

  it('exclude of nothing with blanks kept is no filter; without blanks it is one', () => {
    const d = draftOf({ type: 'set', exclude: ['a'] });
    tick(d, 'a', true);
    expect(filterOf(d)).toBeNull();
    d.blanks = false;
    expect(filterOf(d)).toEqual({ type: 'set', exclude: [], blanks: 'exclude' });
  });

  it('unticking every value is include: [] (owner Q1), a filter, not none', () => {
    const d = draftOf({ type: 'set', include: ['a'] });
    tick(d, 'a', false);
    expect(filterOf(d)).toEqual({ type: 'set', include: [] });
  });

  it('ticking twice or unticking twice is the same as once', () => {
    const d = draftOf({ type: 'set', include: [] });
    tick(d, 'a', true);
    tick(d, 'a', true);
    tick(d, 'b', false);
    expect(filterOf(d)).toEqual({ type: 'set', include: ['a'] });
  });

  it('does not keep a reference to the list it was given', () => {
    const list = ['a'];
    const d = draftOf({ type: 'set', include: list });
    list.push('b');
    expect(on(d)).toEqual(['a']);
  });
});

describe('the half rule (settle)', () => {
  it('include with more than half ticked becomes exclude of the others', () => {
    const d = draftOf({ type: 'set', include: ['a', 'b'] });
    tick(d, 'c', true);
    settle(d, ALL);
    expect(d.mode).toBe('exclude');
    expect(filterOf(d)).toEqual({ type: 'set', exclude: ['d'], blanks: 'exclude' });
    expect(on(d)).toEqual(['a', 'b', 'c']);
  });

  it('exclude with fewer than half ticked becomes include of the ticked', () => {
    const d = draftOf({ type: 'set', exclude: ['a', 'b'] });
    tick(d, 'c', false);
    settle(d, ALL);
    expect(d.mode).toBe('include');
    expect(filterOf(d)).toEqual({ type: 'set', include: ['d'], blanks: 'include' });
  });

  it('a tie keeps the mode, both ways', () => {
    const i = draftOf({ type: 'set', include: ['a', 'b'] });
    settle(i, ALL);
    expect(i.mode).toBe('include');
    const e = draftOf({ type: 'set', exclude: ['a', 'b'] });
    settle(e, ALL);
    expect(e.mode).toBe('exclude');
  });

  it('exactly half plus one flips; half minus one flips back (odd list)', () => {
    const five = ['a', 'b', 'c', 'd', 'e'];
    const d = draftOf({ type: 'set', include: ['a', 'b'] });
    settle(d, five);
    expect(d.mode).toBe('include');
    tick(d, 'c', true);
    settle(d, five);
    expect(d.mode).toBe('exclude');
    expect(filterOf(d)).toEqual({ type: 'set', exclude: ['d', 'e'], blanks: 'exclude' });
    tick(d, 'c', false);
    settle(d, five);
    expect(d.mode).toBe('include');
    expect(filterOf(d)).toEqual({ type: 'set', include: ['a', 'b'] });
  });

  it('a searched or truncated list (null) never flips, whatever is ticked', () => {
    const d = draftOf({ type: 'set', include: ['a', 'b', 'c', 'd'] });
    settle(d, null);
    expect(d.mode).toBe('include');
    const e = draftOf({ type: 'set', exclude: ['a', 'b', 'c', 'd'] });
    settle(e, null);
    expect(e.mode).toBe('exclude');
  });

  it('an empty list flips nothing', () => {
    const d = draftOf({ type: 'set', include: [] });
    settle(d, []);
    expect(d.mode).toBe('include');
  });

  it('everything ticked on a complete list is no filter (blanks kept)', () => {
    const d = draftOf({ type: 'set', include: [], blanks: 'include' });
    tickAll(d, ALL, true);
    settle(d, ALL);
    expect(filterOf(d)).toBeNull();
  });

  it('a value ticked in exclude mode under a search adds nothing but removes it from the excluded', () => {
    const d = draftOf({ type: 'set', exclude: ['a', 'b'] });
    tick(d, 'a', true);
    settle(d, null);
    expect(filterOf(d)).toEqual({ type: 'set', exclude: ['b'] });
  });
});

describe('include only (only; filter-set.md « Include only »)', () => {
  it('3 of 4 ticked, from everything: include of the 3, no blanks', () => {
    const d = draftOf(null);
    tick(d, 'b', false);
    only(d, ALL, ALL);
    expect(filterOf(d)).toEqual({ type: 'set', include: ['a', 'c', 'd'] });
  });

  it('every value ticked on a complete list: no filter', () => {
    const d = draftOf({ type: 'set', include: ['a', 'b', 'c'] });
    tick(d, 'd', true);
    only(d, ALL, ALL);
    expect(filterOf(d)).toBeNull();
  });

  it('every shown value ticked during a search (no complete list): an include, never null', () => {
    const d = draftOf({ type: 'set', include: [] });
    tickAll(d, ['a', 'b'], true);
    only(d, null, ALL);
    expect(filterOf(d)).toEqual({ type: 'set', include: ['a', 'b'] });
  });

  it('unticking from everything during a search, the whole list known: include of all the others', () => {
    const d = draftOf(null);
    tick(d, 'c', false);
    only(d, null, ALL);
    expect(filterOf(d)).toEqual({ type: 'set', include: ['a', 'b', 'd'] });
  });

  it('a truncated list never complete: include of the values shown less the unticked', () => {
    const d = draftOf(null);
    tick(d, 'a', false);
    only(d, null, ['a', 'b', 'c']);
    expect(filterOf(d)).toEqual({ type: 'set', include: ['b', 'c'] });
  });

  it('unticking every value: include [], and it stays so', () => {
    const d = draftOf(null);
    tickAll(d, ALL, false);
    d.blanks = false;
    only(d, ALL, ALL);
    expect(filterOf(d)).toEqual({ type: 'set', include: [] });
    only(d, ALL, ALL);
    expect(filterOf(d)).toEqual({ type: 'set', include: [] });
  });

  it('an empty list: unticking blanks from everything is include []', () => {
    const d = draftOf(null);
    d.blanks = false;
    only(d, [], []);
    expect(filterOf(d)).toEqual({ type: 'set', include: [] });
  });

  it('never writes blanks, even when blanks were ticked in an include', () => {
    const d = draftOf({ type: 'set', include: ['a'] });
    d.blanks = true;
    only(d, ALL, ALL);
    expect(filterOf(d)).toEqual({ type: 'set', include: ['a'] });
  });

  it('a seeded walk (500 steps): never exclude nor blanks; on a complete list null exactly when all ticked, never null with one unticked', () => {
    let s = 7;
    const next = (n: number) => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s % n);
    const d = draftOf(null);
    for (let k = 0; k < 500; k++) {
      const step = next(3);
      if (step === 0) tick(d, ALL[next(4)]!, next(2) === 0);
      else if (step === 1) tickAll(d, ALL.filter(() => next(2) === 0), next(2) === 0);
      else d.blanks = !d.blanks;
      const whole = next(2) === 0;
      only(d, whole ? ALL : null, ALL);
      const f = filterOf(d);
      expect(f && ('exclude' in f || 'blanks' in f), `step ${k}`).toBeFalsy();
      const every = ALL.every((v) => ticked(d, v));
      // A search that changed nothing keeps « everything » (null); otherwise null needs the complete list.
      if (whole) expect(f === null, `step ${k} ${JSON.stringify(f)}`).toBe(every);
      else if (f === null) expect(every, `step ${k}`).toBe(true);
    }
  });
});

describe('start empty (filter-set.md « Starting empty », step 16b)', () => {
  it('no filter in force: nothing ticked, blanks unticked, and it writes no filter', () => {
    const d = draftOf(null, true);
    expect(on(d)).toEqual([]);
    expect(d.blanks).toBe(false);
    expect(filterOf(d, true)).toBeNull();
  });

  it('a filter in force shows its ticks, as on any column', () => {
    const d = draftOf({ type: 'set', include: ['b'] }, true);
    expect(on(d)).toEqual(['b']);
    const x = draftOf({ type: 'set', exclude: ['b'] }, true);
    expect(on(x)).toEqual(['a', 'c', 'd']);
  });

  it('tick Oran → include [Oran]; untick it → no filter (Q16-1 A), never include []', () => {
    const d = draftOf(null, true);
    tick(d, 'Oran', true);
    expect(filterOf(d, true)).toEqual({ type: 'set', include: ['Oran'] });
    tick(d, 'Oran', false);
    expect(filterOf(d, true)).toBeNull();
  });

  it('a column without start: empty keeps Phase 3 Q1 (nothing ticked keeps no row)', () => {
    const d = draftOf({ type: 'set', include: ['a'] });
    tick(d, 'a', false);
    expect(filterOf(d)).toEqual({ type: 'set', include: [] });
  });

  it('with exclude: false, every value of a complete list ticked is no filter (Q16-2: the owner\'s Q1, « tout coché == pas de filtre du tout »)', () => {
    const d = draftOf(null, true);
    tickAll(d, ['d', 'b', 'a', 'c'], true);
    only(d, ALL, ALL, true);
    expect(filterOf(d, true)).toBeNull();
    // Reopened: no filter on a list that starts empty, nothing ticked.
    expect(on(draftOf(filterOf(d, true), true))).toEqual([]);
    // During a search (no complete list), every value shown ticked is still an include of them.
    const x = draftOf(null, true);
    tickAll(x, ['a', 'b'], true);
    only(x, null, ALL, true);
    expect(filterOf(x, true)).toEqual({ type: 'set', include: ['a', 'b'] });
  });

  it('with exclude: false, blanks ticked are never written; nothing ticked is null', () => {
    const d = draftOf(null, true);
    d.blanks = true;
    only(d, ALL, ALL, true);
    expect(filterOf(d, true)).toBeNull();
  });

  it('exclude allowed: the half rule still writes the shorter list; nothing ticked is null in either mode', () => {
    const d = draftOf(null, true);
    tickAll(d, ['a', 'b', 'c'], true);
    settle(d, ALL);
    expect(filterOf(d, true)).toEqual({ type: 'set', exclude: ['d'], blanks: 'exclude' });
    tickAll(d, ALL, false);
    settle(d, ALL);
    expect(filterOf(d, true)).toBeNull();
    // From an exclude in force: everything unticked on the complete list turns into an include of nothing, null.
    const x = draftOf({ type: 'set', exclude: ['a'], blanks: 'exclude' }, true);
    tickAll(x, ALL, false);
    settle(x, ALL);
    expect(filterOf(x, true)).toBeNull();
  });

  it('a seeded walk (500 steps) with exclude: false: never exclude, blanks nor include []', () => {
    let s = 11;
    const next = (n: number) => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s % n);
    const d = draftOf(null, true);
    for (let k = 0; k < 500; k++) {
      const step = next(3);
      if (step === 0) tick(d, ALL[next(4)]!, next(2) === 0);
      else if (step === 1) tickAll(d, ALL.filter(() => next(2) === 0), next(2) === 0);
      else d.blanks = !d.blanks;
      const whole = next(2) === 0;
      only(d, whole ? ALL : null, ALL, true);
      const f = filterOf(d, true);
      expect(f && ('exclude' in f || 'blanks' in f), `step ${k}`).toBeFalsy();
      expect(f?.include?.length, `step ${k}`).not.toBe(0);
      const shown = ALL.filter((v) => ticked(d, v));
      // On a complete list every value ticked is no filter (the owner's Q1); otherwise exactly what is ticked.
      if (whole && shown.length === ALL.length) expect(f, `step ${k}`).toBeNull();
      else if (f) expect(f.include, `step ${k}`).toEqual(shown);
    }
  });
});

describe('select all (shown)', () => {
  it('ticks and unticks only the values given, in include mode', () => {
    const d = draftOf({ type: 'set', include: ['d'] });
    tickAll(d, ['a', 'b'], true);
    expect(on(d)).toEqual(['a', 'b', 'd']);
    tickAll(d, ['a', 'd'], false);
    expect(on(d)).toEqual(['b']);
    expect(d.blanks).toBe(false);
  });

  it('ticks and unticks only the values given, in exclude mode', () => {
    const d = draftOf(null);
    tickAll(d, ['a', 'b'], false);
    expect(on(d)).toEqual(['c', 'd']);
    tickAll(d, ['a'], true);
    expect(on(d)).toEqual(['a', 'c', 'd']);
    expect(d.blanks).toBe(true);
  });
});

describe('against the core’s set filter (seeded)', () => {
  type Row = { id: string; name: string; n: number; c: string | null };
  const VALUES = ['alpha', 'Beta', 'beta', 'été', 'Ete', 'z', '1', '01'];
  function rng(seed: number) {
    let s = seed >>> 0 || 1;
    const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    return { int: (n: number) => Math.floor(next() * n), pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]! };
  }

  it('the rows the written filter keeps are the ticked values’ rows, and blanks when kept (200 seeds)', () => {
    const rows: Row[] = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, name: `p${i}`, n: i, c: i % 9 === 0 ? null : i % 11 === 0 ? '' : VALUES[i % VALUES.length]! }));
    const t = make({ rows: rows as never, columns: [{ id: 'c', header: 'C', filter: { kind: 'set' } }] as never, features: [filters()] });
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const d = draftOf(r.pick([null, { type: 'set', include: ['Beta'] }, { type: 'set', exclude: ['z', '1'], blanks: 'exclude' }] as const));
      for (let k = r.int(12); k > 0; k--) {
        const step = r.int(4);
        if (step === 0) tick(d, r.pick(VALUES), r.int(2) === 0);
        else if (step === 1) tickAll(d, VALUES.filter(() => r.int(2) === 0), r.int(2) === 0);
        else if (step === 2) d.blanks = !d.blanks;
        else settle(d, r.int(2) ? VALUES : null);
      }
      const f = filterOf(d);
      if (f) {
        expect(!('include' in f && 'exclude' in f), `seed ${seed}`).toBe(true);
        const list = (f.include ?? f.exclude)!;
        expect([...list].sort(), `seed ${seed} sorted`).toEqual(list);
        expect(filterOf(draftOf(f)), `seed ${seed} idempotent`).toEqual(f);
      }
      t.g.kernel.dispatch({ type: 'filter.column', column: 'c', filter: f as never }, 'api');
      const want = rows.filter((x) => (x.c === null || x.c === '' ? d.blanks : ticked(d, x.c))).map((x) => x.id);
      expect(t.ids().sort(), `seed ${seed} ${JSON.stringify(f)}`).toEqual(want.sort());
    }
  });
});
