// The pagination footer under seeded random walks (step 17; docs/behaviors/pagination-footer.md):
// pager clicks (enabled or not), sizes, a host's page.go, filters and sorts, selection (rows, the
// box, Select all, Clear), refreshes, rows that shrink, answers out of order or failing, a language
// or direction change, parts swapped, the grid destroyed. `WALK_SEED=12` replays one,
// `WALK_SEEDS=200` runs more.
import { describe, it, expect, afterEach } from 'vitest';
import { definePart, type SlotContext } from '../src/part.js';
import { cleanup, pmake, BUNDLES, ROWS, type R } from './support-pagination.js';

afterEach(cleanup);
const SEEDS = Number(process.env['WALK_SEEDS'] ?? 30);
const ONLY = process.env['WALK_SEED'] ? Number(process.env['WALK_SEED']) : 0;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return { int: (n: number) => Math.floor(next() * n), pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]! };
}

type Mode = 'client' | 'offset' | 'offset-open' | 'cursor';
const FILTERS = [null, 'ann', 'bob', 'b1', 'zz'];

function walk(seed: number, mode: Mode, steps = 40) {
  const r = rng(seed);
  const log: string[] = [];
  const fail = (m: string) => `seed ${seed} (${mode}): ${m}\n  ${log.join('\n  ')}`;
  const server = mode !== 'client';
  let db: R[] = ROWS.slice(0, 20 + r.int(25));
  const t = pmake({ mode: mode === 'offset-open' ? 'offset' : mode, rows: db, pageSize: r.pick([5, 10]), pageSizes: [5, 10, 25] });
  const k = t.g.kernel;
  // The server: the rows its filter matches, a slice by offset, and what it knows of the rest.
  const settled = new Set<unknown>();
  const reply = (c: (typeof t.f.calls)[number], ok = true) => {
    if (settled.has(c)) return;
    settled.add(c);
    if (!ok) return c.err(new Error('down'));
    const f = c.req.filter?.['name'] as { value?: string } | undefined;
    const rows = db.filter((x) => !f?.value || x.name.includes(f.value));
    const p = c.req.page!;
    const slice = rows.slice(p.offset, p.offset + p.size).map((x) => ({ ...x }));
    const more = p.offset + p.size < rows.length;
    c.ok({ rows: slice, ...(mode === 'offset' ? { total: rows.length } : { hasNext: more, ...(mode === 'cursor' && more && { nextCursor: `c${p.offset + p.size}` }) }) });
  };
  const pending = () => t.f.calls.filter((c) => !settled.has(c));
  if (server) reply(t.f.calls.at(-1)!);

  // A recorder part for footer.count, swapped in and out.
  let mounts = 0;
  let destroys = 0;
  const countPart = definePart('footer', {
    mount(host, c: SlotContext['footer']) {
      mounts++;
      host.textContent = String(c.page.index);
      return { update: (n) => void (host.textContent = String(n.page.index)), destroy: () => void destroys++ };
    },
  });
  let lastCount: number | null = 0;
  let userPageActs = 0;
  k.subscribe((e) => { if (e.type === 'selectionChanged') lastCount = e.count; });
  const pageSaid = () => t.said().filter((s) => /^Page |^الصفحة /.test(s)).length;
  let lang: 'en' | 'fr' | 'ar' = 'en';
  let swapped = false;

  const check = () => {
    const p = k.rows.page!;
    const st = k.rows.status.phase;
    const off = (b: HTMLElement | null) => b?.getAttribute('aria-disabled') === 'true';
    // aria-disabled mirrors the page; never `disabled`; last absent by cursor.
    expect(off(t.btn('first')), fail('first')).toBe(p.index === 0);
    expect(off(t.btn('prev')), fail('prev')).toBe(p.index === 0);
    expect(off(t.btn('next')), fail('next')).toBe(!p.hasNext);
    if (!p.canJump) expect(t.btn('last'), fail('no last by cursor')).toBeNull();
    else expect(off(t.btn('last')), fail('last')).toBe(!(p.pageCount !== null && p.index < p.pageCount - 1));
    expect(t.footer()!.querySelector('[disabled]'), fail('never disabled')).toBeNull();
    // The count, when the grid's own and in English, says the page and the rows displayed.
    if (!swapped && lang === 'en') {
      const d = k.rows.displayed.count;
      const c = k.rows.counts;
      const from = p.index * p.size + 1;
      const range = `${from} to ${from + d - 1}`;
      const want = st === 'loading' ? 'Loading…' : st === 'error' ? 'The data could not be loaded' : d === 0 ? '0 rows'
        : c.filtered !== null && c.total !== null && c.filtered !== c.total ? `${range} of ${c.filtered} (${c.total} in all)`
        : p.total !== null ? `${range} of ${p.total}` : range;
      expect(t.countText(), fail('count text')).toBe(want);
    }
    // The selection strip follows the last selectionChanged; Select all iff its condition.
    const strip = t.sel()!;
    expect(strip.hidden, fail('strip hidden iff nothing selected')).toBe(lastCount === 0);
    const d = k.rows.displayed;
    let shown = 0;
    for (let i = 0; i < d.count; i++) if (isSel(d.keyAt(d.index(i)!))) shown++;
    const all = k.selectionScope !== null;
    const can = !all && d.count > 0 && shown === d.count && k.rows.counts.filtered !== null && k.rows.counts.filtered > d.count
      && [...k.selection.keys].filter((x) => k.rows.matches?.(x) ?? true).length < k.rows.counts.filtered;
    expect(!t.act('all')!.hidden, fail('Select all shown iff its condition')).toBe(lastCount !== 0 && can);
    // Never more page sentences than the user's own page actions.
    expect(pageSaid(), fail('announce.page at most once per action')).toBeLessThanOrEqual(userPageActs);
  };
  const isSel = (key: unknown) => (k.selection.mode === 'exclude' ? !k.selection.keys.has(key as never) : k.selection.keys.has(key as never));

  for (let step = 0; step < steps; step++) {
    const a = r.int(16);
    if (a <= 3) {
      const go = r.pick(['first', 'prev', 'next', 'last'] as const);
      const b = t.btn(go);
      if (!b) { log.push(`${go}: absent`); continue; }
      const was = b.getAttribute('aria-disabled') === 'true';
      const calls = t.f.calls.length;
      const events = t.pageEvents().length;
      const said = pageSaid();
      log.push(`click ${go}${was ? ' (off)' : ''}`);
      t.click(b);
      expect(document.activeElement, fail('focus stays on the button')).toBe(b);
      expect(t.f.calls.length - calls, fail('at most one request per click')).toBeLessThanOrEqual(was ? 0 : 1);
      if (was) {
        expect(t.pageEvents().length, fail('a disabled click changes nothing')).toBe(events);
        expect(pageSaid(), fail('a disabled click says nothing')).toBe(said);
      } else userPageActs++;
    } else if (a === 4) {
      const s = t.sizeSelect()!;
      const v = r.pick(['5', '10', '25']);
      log.push(`size ${v}`);
      s.focus();
      s.value = v;
      s.dispatchEvent(new Event('change', { bubbles: true }));
      userPageActs++;
      expect(document.activeElement, fail('focus stays on the select')).toBe(s);
    } else if (a === 5) {
      const i = r.int(6);
      log.push(`api page.go ${i}`);
      k.dispatch({ type: 'page.go', index: i }, 'api');
    } else if (a === 6) {
      const v = r.pick(FILTERS);
      log.push(`filter ${v}`);
      k.dispatch({ type: 'filter.column', column: 'name', filter: v === null ? null : { type: 'text', op: 'contains', value: v } }, 'user');
    } else if (a === 7) {
      log.push('sort');
      k.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    } else if (a === 8) {
      const d = k.rows.displayed;
      if (d.count) {
        const key = d.keyAt(d.index(r.int(d.count))!);
        log.push('toggle a row');
        k.dispatch({ type: 'selection.toggle', row: key }, 'user');
      }
    } else if (a === 9) {
      log.push('box');
      t.host.querySelector<HTMLElement>('.dzg-header .dzg-check')!.click();
    } else if (a === 10) {
      const b = r.int(2) ? t.act('all') : t.act('clear');
      if (b && !b.hidden && !t.sel()!.hidden) {
        log.push(`strip ${b.dataset['act']}`);
        t.click(b);
      }
    } else if (a === 11) {
      log.push('refresh');
      k.dispatch({ type: 'rows.refresh' }, 'user');
    } else if (a === 12) {
      // Rows that shrink (the server's, or the host's).
      db = db.slice(0, Math.max(0, db.length - 1 - r.int(8)));
      log.push(`shrink to ${db.length}`);
      if (!server) t.g.update({ rows: db });
    } else if (a === 13 && server) {
      const p = pending();
      if (p.length) {
        const c = r.pick(p);
        const ok = r.int(5) > 0;
        log.push(`answer ${t.f.calls.indexOf(c)}${ok ? '' : ' (fails)'}`);
        reply(c, ok);
      }
    } else if (a === 14) {
      lang = r.pick(['en', 'fr', 'ar'] as const);
      log.push(`lang ${lang}`);
      t.g.update({ messages: BUNDLES[lang], locale: { en: 'en-US', fr: 'fr-FR', ar: 'ar-DZ' }[lang], direction: lang === 'ar' ? 'rtl' : 'ltr' });
    } else if (a === 15) {
      swapped = !swapped;
      log.push(`parts ${swapped ? 'swapped' : 'back'}`);
      t.g.update({ parts: swapped ? { 'footer.count': countPart } : {} });
    }
    // Every request answered in its turn most of the time: the walk settles to check the texts.
    if (server && r.int(3)) for (const c of pending()) reply(c);
    check();
  }
  t.g.destroy();
  expect(t.host.querySelector('.dzg-footer'), fail('nothing left after destroy')).toBeNull();
  expect(mounts, fail('mounts equal destroys')).toBe(destroys);
}

describe('pagination walks', () => {
  const seeds = ONLY ? [ONLY] : Array.from({ length: SEEDS }, (_, i) => i + 1);
  for (const mode of ['client', 'offset', 'offset-open', 'cursor'] as const) {
    it(`${mode}: ${seeds.length} seeded walks keep the footer true to the page`, () => {
      for (const s of seeds) walk(s, mode);
    });
  }
});
