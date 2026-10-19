// A random walk over the set filter's popup (step 15; docs/behaviors/filter-set.md): opening,
// ticking, select all, searching, moving with the keys, scrolling, Apply, Enter, Escape, a filter
// set by the host, in the browser and on a server. Invariants checked after every step. Seeded:
// a failure prints its seed and the steps that led there (`SET_WALK_SEED=12` replays one).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { draftOf, filterOf } from '../src/filters/set/draft.js';
import { cleanup } from './support-filters.js';
import { grid, settle, type Row } from './support-set.js';

afterEach(cleanup);
const SEEDS = Number(process.env['SET_WALK_SEEDS'] ?? 40);
const ONLY = process.env['SET_WALK_SEED'] ? Number(process.env['SET_WALK_SEED']) : 0;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return { int: (n: number) => Math.floor(next() * n), pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]! };
}

const VALUES = ['Oran', 'Alger', 'Blida', 'Annaba', 'Sétif', 'Béjaïa', 'Tizi', 'Mila', 'Jijel', 'Batna', 'Médéa', 'Chlef'];
const ROWS: Row[] = Array.from({ length: 80 }, (_, i) => ({ id: `r${i}`, name: `p${i}`, n: i, city: i % 13 === 0 ? null : VALUES[(i * 7) % VALUES.length]!, st: 'a' }));
const COLS: ColumnOrGroup<Row>[] = [{ id: 'city', header: 'City', filter: { kind: 'set' } }, { id: 'n', header: 'N', type: 'number' }];
const SEARCHES = ['', 'a', 'o', 'ba', 'zz', 'é'];
type SetF = { type: 'set'; include?: string[]; exclude?: string[]; blanks?: 'include' | 'exclude' };

/** The rows a stored filter keeps, by hand. */
const oracle = (f: SetF | undefined, n: number | null) =>
  ROWS.filter((r) => {
    if (n !== null && r.n !== n) return false;
    if (!f) return true;
    if (r.city === null) return f.include ? f.blanks === 'include' : f.blanks !== 'exclude';
    return f.include ? f.include.includes(r.city) : !f.exclude!.includes(r.city);
  }).map((r) => r.id).sort();

async function walk(seed: number, server: boolean, steps = 40) {
  const r = rng(seed);
  const log: string[] = [];
  const fail = (m: string) => `seed ${seed}${server ? ' (server)' : ''}: ${m}\n  ${log.join('\n  ')}`;
  const t = grid({ rows: ROWS, columns: COLS, server, values: server ? ((req: { search: string }) => ({ values: VALUES.filter((v) => v.toLowerCase().includes(req.search.toLowerCase())).map((v) => ({ value: v, count: 1 })), blanks: 2 })) : undefined });
  if (server) t.f.answer(ROWS.map((x) => x.id), { total: ROWS.length });
  let open = false;
  let searched = false;
  /** The rows request count when the popup opened, and the applies since. */
  let asked = t.f.calls.length;
  let applies = 0;
  let host: number | null = null;
  /** The draft could become exclude only by a tick on a complete list, unless it started so. */
  let startExclude = true;
  let completeTick = false;
  vi.useFakeTimers();
  for (let i = 0; i < steps; i++) {
    const step = open ? r.int(11) : r.int(3);
    if (!open) {
      if (step === 2) {
        const f = r.pick([null, { type: 'set', include: ['Oran'] }, { type: 'set', exclude: ['Alger', 'Mila'], blanks: 'exclude' }, { type: 'set', include: [] }]);
        log.push(`host ${JSON.stringify(f)}`);
        t.set('city', f);
        if (server) t.f.answer(ROWS.map((x) => x.id), { total: ROWS.length });
        continue;
      }
      log.push('open');
      expect(t.feature.openFilter('city'), fail('open')).toBe(true);
      await settle();
      if (server) await settle();
      open = true;
      searched = false;
      const at = t.filter()['city'] as SetF | undefined;
      startExclude = !at || !!at.exclude;
      completeTick = false;
      asked = t.f.calls.length;
      applies = 0;
    } else if (step === 0) {
      const o = t.options();
      if (!o.length) continue;
      const x = r.pick(o);
      log.push(`click ${x.querySelector('.dzg-fname')!.textContent}`);
      x.click();
      if (!searched) completeTick = true;
    } else if (step === 1) {
      log.push('select all');
      t.clickAll();
      if (!searched) completeTick = true;
    } else if (step === 2) {
      const s = r.pick(SEARCHES);
      log.push(`search "${s}"`);
      t.type(s);
      searched = s.trim() !== '';
      if (server) vi.advanceTimersByTime(300), await settle();
    } else if (step === 3 || step === 4) {
      const k = r.pick(['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp', ' ', 'Enter', 'b', 'o']);
      const at = t.list()?.querySelector<HTMLElement>('[role=option][tabindex="0"]');
      if (!at) continue;
      at.focus();
      log.push(`key ${k}`);
      t.press(k);
      if (!searched && (k === ' ' || k === 'Enter')) completeTick = true;
    } else if (step === 5) {
      log.push('scroll');
      t.list().scrollTop = r.int(12) * 28;
      t.list().dispatchEvent(new Event('scroll'));
    } else if (step === 6) {
      log.push('wait');
      vi.advanceTimersByTime(r.pick([50, 200, 600]));
    } else if (step === 7 || step === 8) {
      const how = r.pick(['apply', 'enter', 'escape']);
      log.push(how);
      if (how === 'apply') t.apply();
      else if (how === 'enter') t.search().focus(), t.press('Enter');
      else t.press('Escape');
      if (how !== 'escape') applies++;
      open = false;
      // At most one rows request per Apply on a server; none for Escape.
      if (server) expect(t.f.calls.length - asked, fail('one request per Apply at most')).toBeLessThanOrEqual(applies);
      if (server && t.f.calls.length > asked) t.f.answer(ROWS.map((x) => x.id), { total: ROWS.length });
      vi.advanceTimersByTime(1000);
      // After close nothing is pending.
      const n = t.f.calls.length;
      vi.advanceTimersByTime(1000);
      expect(t.f.calls.length, fail('nothing pending after close')).toBe(n);
    } else if (step === 9) {
      host = r.pick([null, 3, 5]);
      log.push(`number filter ${host}`);
      t.set('n', host === null ? null : { type: 'number', op: 'equals', value: host });
      if (server) t.f.answer(ROWS.map((x) => x.id), { total: ROWS.length });
      // The host's own request is not the popup's.
      asked = t.f.calls.length;
    } else {
      log.push('nothing');
    }

    // Invariants.
    const f = t.filter()['city'] as SetF | undefined;
    if (f) {
      expect(!(f.include && f.exclude), fail('never both lists')).toBe(true);
      const list = (f.include ?? f.exclude)!;
      expect([...list].sort(), fail('sorted')).toEqual(list);
      expect(filterOf(draftOf(f as never)), fail('idempotent')).toEqual(f);
    }
    if (!server) expect(t.ids().sort(), fail('rows = oracle')).toEqual(oracle(f, host));
    if (open && t.popup()) {
      const drawn = t.list() ? [...t.list().querySelectorAll<HTMLElement>('[role=option]')] : [];
      expect(drawn.length, fail('≤ 41 drawn')).toBeLessThanOrEqual(41);
      if (drawn.length) {
        expect(drawn.filter((o) => o.tabIndex === 0), fail('one tabbable option')).toHaveLength(1);
        const size = Number(drawn[0]!.getAttribute('aria-setsize'));
        for (const o of drawn) {
          const p = Number(o.getAttribute('aria-posinset'));
          expect(p >= 1 && p <= size, fail('posinset in range')).toBe(true);
        }
        const ps = drawn.map((o) => o.getAttribute('aria-posinset'));
        expect(new Set(ps).size, fail('posinset unique')).toBe(ps.length);
      }
      expect(document.activeElement, fail('focus never on the body')).not.toBe(document.body);
      // On a server nothing is asked before Apply or Enter.
      if (server) expect(t.f.calls.length, fail('no request before Apply')).toBe(asked);
      if (f?.exclude && !startExclude) expect(completeTick, fail('no exclude from a searched list')).toBe(true);
    }
  }
  if (open) t.press('Escape');
  vi.useRealTimers();
}

describe('the set filter, random walk', () => {
  const seeds = ONLY ? [ONLY] : Array.from({ length: SEEDS }, (_, i) => i + 1);
  it(`in the browser, ${seeds.length} seeds`, async () => {
    for (const s of seeds) {
      await walk(s, false);
      cleanup();
    }
  });
  it(`on a server, ${seeds.length} seeds`, async () => {
    for (const s of seeds) {
      await walk(s, true);
      cleanup();
    }
  });
});
