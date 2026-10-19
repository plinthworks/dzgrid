// Audit of step 15 (the set filter): independent oracles the step's own tests do not use.
// - the draft against a model of ticks kept by hand (never `ticked()`), applied by the core;
// - the popup against a model of what the user ticked (the walk compares rows with the filter, not with the clicks);
// - the windowed list against geometry invariants, browser-like scroll clamping, row heights;
// - type-ahead against a folded prefix oracle (en, fr, ar), and repros for NFD, harakat, alef forms;
// - server answers out of order, failures, the IME order of Safari;
// - the Q2 gate and the values handle's lifecycle.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { draftOf, filterOf, settle, tick, tickAll, type SetFilter } from '../src/filters/set/draft.js';
import { listView, type Row as LRow } from '../src/filters/set/list.js';
import { filters } from '../src/filters.js';
import { definePart } from '../src/part.js';
import { cleanup, make } from './support-filters.js';
import { grid, settle as flush, T, type Row } from './support-set.js';

afterEach(cleanup);

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return { int: (n: number) => Math.floor(next() * n), pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]! };
}

// ---------------------------------------------------------------------------------------------
describe('draft: independent oracle (a Map of ticks kept by hand)', () => {
  type DRow = { id: string; name: string; n: number; c: string | null };
  const POOL = ['alpha', 'Beta', 'beta', 'été', 'Ete', 'été', 'z', '1', '01', 'وهران', 'أ', 'ا', ' x', 'x '];

  it('rows kept = oracle; canonical; idempotent; never both lists; both start modes (300 seeds)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const vals = POOL.filter(() => r.int(3) > 0);
      const rows: DRow[] = Array.from({ length: 2 + r.int(30) }, (_, i) => ({ id: `r${i}`, name: 'x', n: i, c: r.int(6) === 0 || !vals.length ? null : r.pick(vals) }));
      const t = make({ rows: rows as never, columns: [{ id: 'c', header: 'C', filter: { kind: 'set' } }] as never, features: [filters()] });
      // The start: a random stored filter over the pool (values absent from the rows included).
      const startList = [...new Set(POOL.filter(() => r.int(3) === 0))].sort();
      const start: SetFilter | null = r.pick([null, { type: 'set', include: startList, ...(r.int(2) ? { blanks: 'include' as const } : {}) }, { type: 'set', exclude: startList, ...(r.int(2) ? { blanks: 'exclude' as const } : {}) }]);
      // The oracle: each pool value's tick and the blanks', from the stored filter's meaning.
      const on = new Map<string, boolean>();
      for (const v of POOL) on.set(v, start === null ? true : start.include ? start.include.includes(v) : !start.exclude!.includes(v));
      let blanks = start === null ? true : start.include ? start.blanks === 'include' : start.blanks !== 'exclude';
      const d = draftOf(start);
      const log: string[] = [JSON.stringify(start)];
      for (let k = r.int(14); k > 0; k--) {
        const step = r.int(5);
        if (step === 0) {
          const v = r.pick(POOL);
          const want = r.int(2) === 0;
          tick(d, v, want), on.set(v, want), log.push(`tick ${v} ${want}`);
        } else if (step === 1) {
          // Select all (shown): a search's subset, or everything (blanks too).
          const shown = r.int(2) ? vals : vals.filter(() => r.int(2) === 0);
          const want = r.int(2) === 0;
          tickAll(d, shown, want);
          for (const v of shown) on.set(v, want);
          if (shown === vals) (d.blanks = want), (blanks = want);
          log.push(`all ${want} ${shown.join('|')}`);
        } else if (step === 2) {
          (d.blanks = !d.blanks), (blanks = !blanks), log.push('blanks');
        } else if (step === 3) {
          // The half rule over the complete list: the values with rows (plus nothing else).
          settle(d, vals), log.push('settle complete');
        } else settle(d, null), log.push('settle null');
      }
      const f = filterOf(d);
      const msg = `seed ${seed}: ${log.join(' ; ')} => ${JSON.stringify(f)}`;
      if (f) {
        expect(!(f.include && f.exclude), msg).toBe(true);
        const list = (f.include ?? f.exclude)!;
        expect([...new Set(list)].sort(), msg + ' sorted, unique').toEqual(list);
        expect(filterOf(draftOf(f)), msg + ' idempotent').toEqual(f);
        // blanks written only when not the mode's default.
        if (f.include) expect(f.blanks === undefined || f.blanks === 'include', msg).toBe(true);
        else expect(f.blanks === undefined || f.blanks === 'exclude', msg).toBe(true);
      } else expect(blanks && vals.every((v) => on.get(v)), msg + ' null only when everything is ticked').toBe(true);
      t.g.kernel.dispatch({ type: 'filter.column', column: 'c', filter: f as never }, 'api');
      const want = rows.filter((x) => (x.c === null ? blanks : on.get(x.c)!)).map((x) => x.id).sort();
      expect(t.ids().sort(), msg).toEqual(want);
      cleanup();
    }
  });

  it('the half rule is minimal: after settle on a complete list the written list never holds more than half of it', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const all = POOL.filter(() => r.int(2) === 0);
      const d = draftOf(r.pick([null, { type: 'set', include: [] }]));
      for (const v of all) if (r.int(2)) tick(d, v, r.int(2) === 0);
      settle(d, all);
      const inAll = [...d.vals].filter((v) => all.includes(v)).length;
      expect(inAll * 2 <= all.length, `seed ${seed}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('popup: the applied filter equals what the user ticked (UI oracle, browser, 40 seeds)', () => {
  const VALUES = ['Oran', 'Alger', 'Blida', 'Annaba', 'Sétif', 'Béjaïa', 'Tizi'];
  const ROWS: Row[] = Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, name: 'x', n: i, city: i % 11 === 0 ? null : VALUES[(i * 3) % VALUES.length]!, st: 'a' }));
  const COLS: ColumnOrGroup<Row>[] = [{ id: 'city', header: 'City', filter: { kind: 'set' } }];
  const SEARCHES = ['', '', 'a', 'b', 'é', 'zz'];

  it('click, select all (shown), search, keys: the rows shown = the user’s ticks', async () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const t = grid({ rows: ROWS, columns: COLS });
      vi.useFakeTimers();
      await t.open();
      const on = new Map(VALUES.map((v) => [v, true]));
      let blanks = true;
      const log: string[] = [];
      for (let k = 0; k < 25; k++) {
        const step = r.int(4);
        if (step === 0) {
          const o = t.options();
          if (!o.length) continue;
          const x = r.pick(o);
          const label = x.querySelector('.dzg-fname')!.textContent!;
          log.push(`click ${label}`);
          x.click();
          if (VALUES.includes(label)) on.set(label, !on.get(label));
          else blanks = !blanks;
        } else if (step === 1) {
          const shown = t.labels();
          const want = !t.all().checked;
          log.push(`all -> ${want} (${shown.join('|')})`);
          t.clickAll();
          for (const l of shown) if (VALUES.includes(l!)) on.set(l!, want);
          if (!t.search().value.trim()) blanks = want;
        } else if (step === 2) {
          const s = r.pick(SEARCHES);
          log.push(`search "${s}"`);
          t.type(s);
        } else {
          const o = t.list()?.querySelector<HTMLElement>('[role=option][tabindex="0"]');
          if (!o) continue;
          o.focus();
          const label = o.querySelector('.dzg-fname')!.textContent!;
          log.push(`space ${label}`);
          t.press(' ');
          if (VALUES.includes(label)) on.set(label, !on.get(label));
          else blanks = !blanks;
        }
        // aria-selected agrees with the oracle for every drawn option.
        for (const o of t.options()) {
          const l = o.querySelector('.dzg-fname')!.textContent!;
          const want = VALUES.includes(l) ? on.get(l) : blanks;
          expect(o.getAttribute('aria-selected'), `seed ${seed} ${l}: ${log.join(' ; ')}`).toBe(String(want));
        }
      }
      t.apply();
      const want = ROWS.filter((x) => (x.city === null ? blanks : on.get(x.city))).map((x) => x.id).sort();
      expect(t.ids().sort(), `seed ${seed}: ${log.join(' ; ')} => ${JSON.stringify(t.filter()['city'])}`).toEqual(want);
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('windowed list: invariants under random sizes, heights, scrolls and focus moves', () => {
  /** A list with a browser-like viewport: `clientHeight` V, a clamped `scrollTop`, options H tall. */
  function harness(V: number, H: number) {
    const ticks = new Set<string | null>();
    const fallback = document.createElement('input');
    document.body.append(fallback);
    let emptied = 0;
    const lv = listView(document, {
      ticked: (r) => ticks.has(r.v),
      toggle: (r) => void (ticks.has(r.v) ? ticks.delete(r.v) : ticks.add(r.v)),
      empty: () => (emptied++, fallback.focus()),
    });
    const list = lv.el;
    document.body.append(list);
    const space = list.firstElementChild as HTMLElement;
    let raw = 0;
    const max = () => Math.max(0, (parseFloat(space.style.blockSize) || 0) - V);
    Object.defineProperty(list, 'clientHeight', { configurable: true, get: () => V });
    Object.defineProperty(list, 'scrollTop', { configurable: true, get: () => (raw = Math.max(0, Math.min(raw, max()))), set: (v: number) => void (raw = v) });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: this.classList.contains('dzg-fopt') ? H : 0, width: 0, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
    });
    return { lv, list, ticks, fallback, emptied: () => emptied };
  }
  const rowsOf = (n: number, blanks: boolean, tag: string): LRow[] => [
    ...(blanks ? [{ v: null, label: '(Blanks)', count: '', name: '(Blanks)' }] : []),
    ...Array.from({ length: n }, (_, i) => ({ v: `${tag}${i}`, label: `${tag}${i}`, count: '1', name: `${tag}${i}` })),
  ];
  const opts = (list: HTMLElement) => [...list.querySelectorAll<HTMLElement>('[role=option]')];
  const pos = (o: Element) => Number(o.getAttribute('aria-posinset'));

  function check(h: ReturnType<typeof harness>, rows: readonly LRow[], H: number, V: number, msg: string) {
    const all = opts(h.list);
    const n = rows.length;
    const ps = all.map(pos);
    expect(new Set(ps).size, msg + ' posinset unique').toBe(ps.length);
    const labels = all.map((o) => o.querySelector('.dzg-fname')!.textContent);
    expect(new Set(labels).size, msg + ' no duplicate rows drawn').toBe(labels.length);
    for (const o of all) {
      const p = pos(o);
      expect(p >= 1 && p <= n, msg + ` posinset ${p} in 1..${n}`).toBe(true);
      expect(o.getAttribute('aria-setsize'), msg).toBe(String(n));
      expect(o.querySelector('.dzg-fname')!.textContent, msg + ' label at its index').toBe(rows[p - 1]!.label);
      expect(o.style.insetBlockStart, msg + ' placed at its index').toBe((p - 1) * H + 'px');
    }
    if (!n) return expect(all, msg).toHaveLength(0);
    // Every row in view is drawn.
    const top = h.list.scrollTop;
    const first = Math.floor(top / H);
    const last = Math.min(n - 1, Math.floor((top + V - 1) / H));
    for (let i = first; i <= last; i++) expect(ps, msg + ` row ${i + 1} in view drawn (scrollTop ${top})`).toContain(i + 1);
    // Bounded, and contiguous but for the active row.
    expect(all.length, msg + ' bounded').toBeLessThanOrEqual(Math.floor(V / H) + 2 * 6 + 2);
    const tabbable = all.filter((o) => o.tabIndex === 0);
    expect(tabbable, msg + ' one tab stop').toHaveLength(1);
    const gaps = (a: number[]) => a.sort((x, y) => x - y).some((x, i) => i > 0 && x - a[i - 1]! !== 1);
    const tp = pos(tabbable[0]!);
    expect(!gaps([...ps]) || !gaps(ps.filter((p) => p !== tp)), msg + ` contiguous window ${ps.join(',')} scrollTop ${h.list.scrollTop}`).toBe(true);
    // DOM order follows posinset (a screen reader's browse mode reads the DOM).
    expect(ps, msg + ' DOM in posinset order').toEqual([...ps].sort((a, b) => a - b));
    if (h.list.contains(document.activeElement)) expect(document.activeElement, msg + ' focused = the tab stop').toBe(tabbable[0]);
  }

  it('random walk: 60 seeds, lengths 0..2 001, heights 20..40, views 100..400', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed);
      const H = 20 + r.int(21);
      const V = 100 + r.int(301);
      const h = harness(V, H);
      const log: string[] = [`H ${H} V ${V}`];
      let rows: LRow[] = [];
      let gen = 0;
      let inside = false;
      const fresh = () => rowsOf(r.pick([0, 1, 2, 7, 40, 500, 2000, 2001]), r.int(2) === 0, r.pick(['a', 'b']));
      for (let k = 0; k < 30; k++) {
        const step = r.int(7);
        if (step === 0 || k === 0) {
          rows = fresh();
          const home = r.int(2) === 0;
          log.push(`set ${rows.length} home=${home}`);
          h.lv.set(rows, home);
          gen++;
        } else if (step === 1) {
          // A narrowed list keeping the same values (a search): a subset in the same order.
          const keep = rows.filter(() => r.int(3) > 0);
          log.push(`narrow ${rows.length} -> ${keep.length}`);
          rows = keep;
          h.lv.set(rows);
        } else if (step === 2) {
          const y = r.int(Math.max(1, rows.length * H + 200));
          log.push(`scroll ${y}`);
          h.list.scrollTop = y;
          h.list.dispatchEvent(new Event('scroll'));
        } else if (step === 3) {
          log.push('focus');
          h.lv.focus();
        } else if (step === 4) {
          const k2 = r.pick(['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp']);
          const at = h.list.querySelector<HTMLElement>('[tabindex="0"]');
          if (!at) continue;
          at.focus();
          log.push(`key ${k2}`);
          at.dispatchEvent(new KeyboardEvent('keydown', { key: k2, bubbles: true, cancelable: true }));
        } else if (step === 5) {
          const o = opts(h.list);
          if (!o.length) continue;
          const x = r.pick(o);
          log.push(`click ${pos(x)}`);
          x.click();
          expect(document.activeElement, `seed ${seed} click focuses`).toBe(x);
        } else {
          // Reordered (a locale change): same values, reversed.
          rows = [...rows].reverse();
          log.push('reverse');
          h.lv.set(rows);
        }
        check(h, rows, H, V, `seed ${seed}: ${log.join(' ; ')} :`);
        if (inside) expect(document.activeElement, `seed ${seed}: focus never dropped to the body: ${log.join(' ; ')}`).not.toBe(document.body);
        inside = h.list.contains(document.activeElement) || document.activeElement === h.fallback;
      }
      void gen;
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('type-ahead against a prefix oracle (diacritics, NFD, Arabic letter forms)', () => {
  /** `locale`: the UI each case stands for; the fold does not depend on it (that is the point of the en / fr cases). */
  function lv(labels: string[], locale: string) {
    void locale;
    const lv = listView(document, { ticked: () => false, toggle() {}, empty() {} });
    document.body.append(lv.el);
    lv.set(labels.map((l, i) => ({ v: String(i), label: l, count: '', name: l })), true);
    lv.focus();
    const press = (k: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const at = () => Number(document.activeElement!.getAttribute('aria-posinset')) - 1;
    return { press, at };
  }

  it('French: a decomposed label (NFD) is found by two letters, as its composed twin', () => {
    vi.useFakeTimers();
    const { press, at } = lv(['abc', 'eau', 'école'], 'fr');
    press('e');
    expect(at()).toBe(1);
    press('c');
    expect(at()).toBe(2);
  });

  it('Arabic: alef with hamza (أ, إ, آ) is found by a bare alef (ا), and a bare alef by a hamza form', () => {
    vi.useFakeTimers();
    const a = lv(['باب', 'أحمد', 'وهران'], 'ar');
    a.press('ا');
    expect(a.at()).toBe(1);
    cleanup();
    vi.useFakeTimers();
    const b = lv(['باب', 'إسلام', 'وهران'], 'ar');
    b.press('ا');
    b.press('س');
    expect(b.at()).toBe(1);
  });

  it('Arabic with harakat: "مح" finds a label written with a vowel mark (محمد with damma)', () => {
    vi.useFakeTimers();
    const { press, at } = lv(['باب', 'مَحمد', 'وهران'], 'ar');
    press('م');
    expect(at()).toBe(1);
    press('ح');
    expect(at()).toBe(1);
    press('م');
    expect(at()).toBe(1);
    // A second label without the mark: typing "مح" from the top must find the first one.
    cleanup();
    vi.useFakeTimers();
    const b = lv(['باب', 'مَحمد', 'محسن'], 'ar');
    b.press('م');
    b.press('ح');
    expect(b.at()).toBe(1);
  });

  it('Arabic labels under a French UI (Algeria): a bare alef (ا) finds أحمد / إسلام', () => {
    vi.useFakeTimers();
    const { press, at } = lv(['باب', 'أحمد', 'وهران'], 'fr');
    press('ا');
    expect(at()).toBe(1);
    cleanup();
    vi.useFakeTimers();
    const b = lv(['باب', 'إسلام', 'وهران'], 'en');
    b.press('ا');
    b.press('س');
    expect(b.at()).toBe(1);
  });

  it('English: a decomposed label and tatweel are found as their plain twins; a key that folds to nothing moves nowhere', () => {
    vi.useFakeTimers();
    const a = lv(['abc', 'cafe', 'Caf\u00e9s'.normalize('NFD')], 'en');
    for (const k of 'cafe') a.press(k);
    expect(a.at()).toBe(1);
    a.press('s');
    expect(a.at()).toBe(2);
    cleanup();
    vi.useFakeTimers();
    const b = lv(['باب', 'مـحمد', 'وهران'], 'en');
    b.press('م');
    b.press('ح');
    expect(b.at()).toBe(1);
    // A lone vowel mark folds to nothing: the focus stays.
    vi.advanceTimersByTime(600);
    b.press('\u064E');
    expect(b.at()).toBe(1);
  });

  it('Arabic UI: a bare alef (ا) finds آمال (alef with madda)', () => {
    vi.useFakeTimers();
    const { press, at } = lv(['باب', 'آمال', 'وهران'], 'ar');
    press('ا');
    expect(at()).toBe(1);
  });

  /** The oracle's key, written from the rule (docs/behaviors/filter-set.md "Keys"), not from the core's fold: no case, accents, Arabic short vowels or tatweel, one alef, ى as ي. */
  const key = (s: string) =>
    s.normalize('NFKD').replace(/[\u0300-\u036F\u064B-\u065F\u0670\u0640]/g, '').replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627').replace(/\u0649/g, '\u064A').toLowerCase();

  it('random labels and words (en, fr, ar): the row found is the oracle’s (80 seeds)', () => {
    const POOL = ['e\u0301cole', 'مُحمد', 'مـحسن', 'école', 'Ecole', 'été', 'Élan', 'élan', 'Zèbre', 'zoo', 'ça', 'Ça va', 'naïve', 'Noël', 'أحمد', 'احمد', 'إسلام', 'آمال', 'وهران', 'الجزائر', 'باتنة', 'بجاية', 'Oran', 'oued'];
    const KEYS = ['e', 'é', 'E', 'c', 'ç', 'z', 'n', 'o', 'a', 'l', 'ا', 'أ', 'ب', 'و', 'ل', 'ح', 'س', 'م'];
    for (let seed = 1; seed <= 80; seed++) {
      const r = rng(seed);
      const locale = r.pick(['en', 'fr', 'ar']);
      const labels = POOL.filter(() => r.int(2) === 0);
      if (labels.length < 2) continue;
      vi.useFakeTimers();
      const { press, at } = lv(labels, locale);
      let buf = '';
      const log: string[] = [locale, labels.join('|')];
      for (let k = 0; k < 8; k++) {
        if (r.int(3) === 0) vi.advanceTimersByTime(600), (buf = '');
        const ch = r.pick(KEYS);
        const before = at();
        const same = !!buf && [...buf].every((c) => c === ch);
        buf += ch;
        const q = same ? ch : buf;
        log.push(`${ch}`);
        press(ch);
        const n = labels.length;
        const from = buf.length === 1 || same ? before + 1 : before;
        let want = before;
        for (let j = 0; j < n; j++) {
          const i = (from + j) % n;
          const Q = key(q);
          if (Q && key(labels[i]!).startsWith(Q)) {
            want = i;
            break;
          }
        }
        expect(at(), `seed ${seed}: ${log.join(' ')} (q "${q}")`).toBe(want);
      }
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('server list: out-of-order answers, failures, the IME order of Safari', () => {
  function values() {
    const calls: { req: { search: string; signal: AbortSignal }; ok(v: unknown): void; no(e: unknown): void }[] = [];
    const fn = (req: { search: string; signal: AbortSignal }) => new Promise((ok, no) => calls.push({ req, ok, no }));
    return { fn, calls };
  }
  const tick = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  const TOWNS = ['Oran', 'Alger', 'Blida', 'Annaba', 'Sétif'];
  const answerFor = (s: string) => ({ values: TOWNS.filter((x) => x.toLowerCase().includes(s.toLowerCase())).map((v) => ({ value: v, count: 2 })), blanks: 1 });

  it('random searches answered in random order, some failing: the list shows the newest search’s answer (40 seeds)', async () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const v = values();
      const t = grid({ server: true, values: v.fn as never });
      t.f.answer(['a']);
      vi.useFakeTimers();
      await t.open();
      const log: string[] = [];
      let newest = 0;
      const pending = new Set<number>([0]);
      let failedNewest = false;
      for (let k = 0; k < 15; k++) {
        const step = r.int(3);
        if (step === 0) {
          const s = r.pick(['', 'o', 'a', 'bl', 'zz']);
          log.push(`type "${s}"`);
          t.type(s);
          vi.advanceTimersByTime(r.pick([100, 300, 600]));
          if (v.calls.length - 1 > newest) {
            newest = v.calls.length - 1;
            pending.add(newest);
            failedNewest = false;
          }
        } else if (pending.size) {
          const i = r.pick([...pending]);
          pending.delete(i);
          const c = v.calls[i]!;
          if (r.int(4) === 0) {
            log.push(`fail #${i}`);
            c.no(new Error('down'));
            if (i === newest) failedNewest = true;
          } else {
            log.push(`answer #${i} "${c.req.search}"`);
            c.ok(answerFor(c.req.search));
          }
          await tick();
        }
        // The list never shows an answer older than the newest one in (no stale overwrite).
        const msg = `seed ${seed}: ${log.join(' ; ')}`;
        const answered = [...Array(newest + 1).keys()].filter((i) => !pending.has(i));
        if (!pending.has(newest) && !failedNewest) {
          const want = answerFor(v.calls[newest]!.req.search).values.map((x) => x.value);
          expect(t.labels().filter((l) => TOWNS.includes(l!)), msg).toEqual(want);
        }
        void answered;
        if (failedNewest && !pending.has(newest)) expect(t.q('.dzg-flistw [role=alert]'), msg + ' alert').not.toBeNull();
        // Every request but the newest is aborted.
        for (let i = 0; i < newest; i++) if (pending.has(i)) expect(v.calls[i]!.req.signal.aborted, msg + ` #${i} aborted`).toBe(true);
      }
      t.press('Escape');
      for (const i of pending) expect(v.calls[i]!.req.signal.aborted, `seed ${seed} closed: #${i} in flight aborted`).toBe(true);
      cleanup();
    }
  });

  it('a host filter written out of canonical order: Apply with no tick sends no rows request (server)', async () => {
    const v = values();
    const t = grid({ server: true, values: v.fn as never });
    t.f.answer(['a']);
    t.set('city', { type: 'set', include: ['Oran', 'Alger'] });
    t.f.answer(['a']);
    vi.useFakeTimers();
    await t.open();
    v.calls[0]!.ok(answerFor(''));
    await tick();
    const n = t.f.calls.length;
    t.apply();
    expect(t.f.calls.length).toBe(n);
  });

  it('client rows: an empty text is a blank (no "" option), counted with the blanks', async () => {
    const rows: Row[] = [null, '', 'Oran', '', 'Alger'].map((c, i) => ({ id: `r${i}`, name: 'x', n: i, city: c, st: 'a' }));
    const t = grid({ rows, columns: [{ id: 'city', header: 'City', filter: { kind: 'set' } }] });
    await t.open();
    expect(t.labels()).not.toContain('');
    t.option('(Blanks)' in {} ? '' : t.labels()[0]!).click();
    t.apply();
    // Unticking the blanks row drops both the null and the empty texts.
    expect(t.ids().sort()).toEqual(['r2', 'r4']);
  });

  it('Safari’s order (compositionend, then an input not composing) asks once', async () => {
    const v = values();
    const t = grid({ server: true, values: v.fn as never });
    t.f.answer(['a']);
    vi.useFakeTimers();
    await t.open();
    v.calls[0]!.ok(answerFor(''));
    await tick();
    const s = t.search();
    s.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    s.value = 'و';
    s.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    s.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    s.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: false }));
    vi.advanceTimersByTime(1000);
    expect(v.calls).toHaveLength(2);
  });

  it('browser rows: a composing input does not search; compositionend does, at once', async () => {
    const t = grid();
    await t.open();
    const s = t.search();
    s.value = 'Or';
    s.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    expect(t.labels()).toContain('Alger');
    s.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    expect(t.labels()).toEqual(['Oran']);
  });

  it('select all while the search box and the list disagree (typed, not yet asked): acts on what is shown, and leaves the blanks alone', async () => {
    const v = values();
    const t = grid({ server: true, values: v.fn as never });
    t.f.answer(['a']);
    vi.useFakeTimers();
    await t.open();
    v.calls[0]!.ok(answerFor(''));
    await tick();
    t.type('bl');
    vi.advanceTimersByTime(300);
    v.calls[1]!.ok(answerFor('bl'));
    await tick();
    expect(t.labels()).toEqual(['Blida']);
    // The search cleared, the pause not over: the list still shows "bl"'s answer.
    t.type('');
    expect(t.labels()).toEqual(['Blida']);
    // The box says "Select all" (no search) but only Blida is shown: unticking must not drop blanks it never showed.
    t.clickAll();
    t.apply();
    expect(t.filter()['city']).toEqual({ type: 'set', exclude: ['Blida'] });
  });
});

// ---------------------------------------------------------------------------------------------
describe('review findings (R1, R3)', () => {
  const ENUM: ColumnOrGroup<Row>[] = [{ id: 'st', header: 'Status', type: 'enum', enumOptions: [{ value: 'a', label: 'Active' }, { value: 'c', label: 'Closed' }], filter: { kind: 'set' } }];

  it('R1 enum fallback (no list from the server): untick all from everything ticked writes include: []', async () => {
    const t = grid({ server: true, columns: ENUM });
    t.f.answer(['a']);
    await t.open('st');
    t.clickAll();
    t.apply();
    expect(t.filter()['st']).toEqual({ type: 'set', include: [] });
  });

  it('R1 enum fallback: ticking every option back after an include writes nothing (the half rule on the options)', async () => {
    const t = grid({ server: true, columns: ENUM });
    t.f.answer(['a']);
    t.set('st', { type: 'set', include: ['a'] });
    t.f.answer(['a']);
    await t.open('st');
    t.option('Closed').click();
    t.option(t.labels()[0]!).click();
    t.apply();
    expect(t.filter()['st']).toBeUndefined();
  });

  it('R1 enum fallback with a search typed: the list is not complete (no mode change)', async () => {
    const t = grid({ server: true, columns: ENUM });
    t.f.answer(['a']);
    await t.open('st');
    t.type('clo');
    t.clickAll();
    t.apply();
    expect(t.filter()['st']).toEqual({ type: 'set', exclude: ['c'] });
  });

  it('R3 ArrowDown inside an input method stays in the search box', async () => {
    const t = grid();
    await t.open();
    const s = t.search();
    s.focus();
    const e = new KeyboardEvent('keydown', { key: 'ArrowDown', isComposing: true, bubbles: true, cancelable: true });
    s.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(s);
    s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(t.list().contains(document.activeElement)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Q2 gate and the values handle’s lifecycle', () => {
  function spyHandles(t: ReturnType<typeof grid>) {
    const open = new Map<number, string>();
    let n = 0;
    const real = t.g.kernel.values.bind(t.g.kernel);
    vi.spyOn(t.g.kernel, 'values').mockImplementation((col, o) => {
      const h = real(col, o);
      const id = n++;
      open.set(id, col);
      const close = h.close.bind(h);
      return Object.assign(Object.create(Object.getPrototypeOf(h)), h, {
        search: h.search.bind(h), refresh: h.refresh.bind(h), subscribe: h.subscribe.bind(h),
        get result() { return h.result; }, get status() { return h.status; }, get available() { return h.available; },
        close: () => (open.delete(id), close()),
      });
    });
    return open;
  }

  it('an enum column with a filter object but no kind: no popup; with a host part: the host part', () => {
    const cols: ColumnOrGroup<Row>[] = [{ id: 'st', header: 'S', type: 'enum', enumOptions: [{ value: 'a' }, { value: 'c' }], filter: { floating: true } as never }];
    expect(grid({ columns: cols }).feature.openFilter('st')).toBe(false);
    cleanup();
    let mounted = 0;
    const part = definePart('filter', { mount: () => (mounted++, {}) });
    const t = grid({ columns: cols, settings: { parts: { 'filter.set': part } } });
    expect(t.feature.openFilter('st')).toBe(true);
    expect(mounted).toBe(1);
  });

  it('kind changed from set to none while the popup is open: the popup closes or loses the list, and its handle is closed', async () => {
    const t = grid();
    const open = spyHandles(t);
    await t.open();
    expect(open.size).toBe(1);
    t.g.update({ columns: [{ id: 'city', header: 'City' }, { id: 'n', header: 'N', type: 'number' }] } as never);
    await flush();
    expect(t.list()).toBeNull();
    expect(open.size).toBe(0);
  });

  it('the grid destroyed with the popup open: no handle left open', async () => {
    const t = grid();
    const open = spyHandles(t);
    await t.open();
    expect(open.size).toBe(1);
    t.g.destroy();
    expect(open.size).toBe(0);
  });

  it('open and close 20 times, locale changes between: one handle at a time, none at the end', async () => {
    const t = grid();
    const open = spyHandles(t);
    for (let i = 0; i < 20; i++) {
      await t.open();
      expect(open.size).toBe(1);
      if (i % 3 === 0) t.g.update({ locale: i % 2 ? 'fr-FR' : 'en-US' } as never);
      expect(open.size).toBe(1);
      if (i % 2) t.feature.closeFilter();
      else t.press('Escape');
      expect(open.size).toBe(0);
    }
  });

  it('closed while the chunk loads, the chunk then arrives: no handle is opened', async () => {
    let done!: (m: unknown) => void;
    const kit = await import('../src/filters/set/index.js');
    const t = grid({ loadSet: () => new Promise((ok) => (done = ok)) });
    const open = spyHandles(t);
    await t.open();
    t.feature.closeFilter();
    done(kit);
    await flush();
    expect(open.size).toBe(0);
    expect(t.g.kernel.values).not.toHaveBeenCalled();
  });

  it('a chunk whose body throws after opening its values handle: the handle is closed, the failure shown', async () => {
    const reported: unknown[] = [];
    vi.stubGlobal('reportError', (e: unknown) => void reported.push(e));
    const t = grid({ loadSet: () => Promise.resolve({ css: '', body: (get: () => { values(): unknown }) => (get().values(), (() => { throw new Error('boom'); })()) }) });
    const open = spyHandles(t);
    await t.open();
    expect(t.g.kernel.values).toHaveBeenCalledTimes(1);
    expect(open.size).toBe(0);
    expect(t.popup()!.textContent).toContain(T['filter.set.failed'] as string);
    expect(reported).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('switching popups from one set column to another closes the first handle', async () => {
    const cols: ColumnOrGroup<Row>[] = [{ id: 'city', header: 'City', filter: { kind: 'set' } }, { id: 'name', header: 'Name', filter: { kind: 'set' } }];
    const t = grid({ columns: cols });
    const open = spyHandles(t);
    await t.open('city');
    await t.open('name');
    expect([...open.values()]).toEqual(['name']);
  });
});
