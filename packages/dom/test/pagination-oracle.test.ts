// The pagination footer against an independent model (step 17, docs/behaviors/pagination-footer.md,
// selection.md): the model knows only the rows, the filter, the page and which ids are selected
// (include / everything-except tied to the filter). It never reads the kernel's counts, page or
// selection: every text, button state, announcement and focus is derived from it alone.
// `ORACLE_SEEDS=200` runs more, `ORACLE_SEED=7` replays one.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, pmake, ROWS, BUNDLES, type R } from './support-pagination.js';

afterEach(cleanup);
const SEEDS = Number(process.env['ORACLE_SEEDS'] ?? 25);
const ONLY = process.env['ORACLE_SEED'] ? Number(process.env['ORACLE_SEED']) : 0;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  return { int: (n: number) => Math.floor(next() * n), pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]! };
}
const FILTERS = [null, 'ann', 'bob', '1', 'zz'] as const;
const rowsWord = (n: number) => (n === 1 ? '1 row' : `${n} rows`);

function walk(seed: number, steps = 45) {
  const r = rng(seed);
  const log: string[] = [];
  const fail = (m: string) => `seed ${seed}: ${m}\n  ${log.join('\n  ')}`;
  // The model.
  let db: R[] = ROWS.slice(0, 8 + r.int(23));
  let filter: string | null = null;
  let size = r.pick([5, 10]);
  let index = 0;
  let mode: 'inc' | 'exc' = 'inc';
  let keys = new Set<string>();
  const t = pmake({ rows: db, pageSize: size, pageSizes: [5, 10, 25] });
  const k = t.g.kernel;
  const matched = () => db.filter((x) => filter === null || x.name.includes(filter));
  const pageCount = () => Math.max(1, Math.ceil(matched().length / size));
  const clamp = () => void (index = Math.min(index, pageCount() - 1));
  const page = () => matched().slice(index * size, index * size + size).map((x) => x.id);
  const selected = (id: string) => (mode === 'inc' ? keys.has(id) : !keys.has(id));
  const count = () => (mode === 'inc' ? db.filter((x) => keys.has(x.id)).length : matched().filter((x) => !keys.has(x.id)).length);
  const range = () => {
    const m = matched().length;
    if (m === 0) return '0 rows';
    const from = index * size + 1;
    const to = from + page().length - 1;
    return filter !== null && m !== db.length ? `${from} to ${to} of ${m} (${db.length} in all)` : `${from} to ${to} of ${m}`;
  };
  const keyOf = (id: string) => t.key(id);

  // The nodes a pager update must keep.
  const nodes = () => [t.btn('first'), t.btn('prev'), t.btn('next'), t.btn('last'), t.sizeSelect(), t.footer()!.querySelector('.dzg-ppage'), t.countEl(), t.act('all'), t.act('clear')];
  const kept = nodes();

  const check = () => {
    const off = (b: HTMLElement | null) => b!.getAttribute('aria-disabled') === 'true';
    const pc = pageCount();
    expect(t.pageText(), fail('page text')).toBe(`Page ${index + 1} of ${pc}`);
    expect(t.ids(), fail('rows shown')).toEqual(page());
    expect(t.countText(), fail('count text')).toBe(range());
    expect(off(t.btn('first')), fail('first')).toBe(index === 0);
    expect(off(t.btn('prev')), fail('prev')).toBe(index === 0);
    expect(off(t.btn('next')), fail('next')).toBe(index >= pc - 1);
    expect(off(t.btn('last')), fail('last')).toBe(index >= pc - 1);
    expect(t.sizeSelect()!.value, fail('size select')).toBe(String(size));
    const n = count();
    const p = page();
    const shown = p.filter(selected).length;
    expect(t.sel()!.hidden, fail('strip hidden iff nothing selected')).toBe(n === 0);
    if (n > 0) expect(t.selText(), fail('strip text')).toBe(`${rowsWord(n)} selected${n > shown ? ' (some not shown)' : ''}`);
    // Not an all-pages selection, the page all ticked, more rows match than it shows, and not every
    // matching row already ticked (review R2).
    const can = mode === 'inc' && p.length > 0 && shown === p.length && matched().length > p.length && matched().filter((x) => selected(x.id)).length < matched().length;
    expect(!t.act('all')!.hidden && n > 0, fail('Select all offered')).toBe(can);
    if (can) expect(t.act('all')!.textContent, fail('Select all text')).toBe(`Select all ${matched().length} rows`);
    expect(nodes(), fail('the same nodes')).toEqual(kept);
  };

  for (let step = 0; step < steps; step++) {
    const a = r.int(12);
    const said = t.said().length;
    if (a <= 3) {
      const go = r.pick(['first', 'prev', 'next', 'last'] as const);
      const b = t.btn(go)!;
      const was = b.getAttribute('aria-disabled') === 'true';
      log.push(`click ${go}${was ? ' (off)' : ''}`);
      t.click(b);
      const pc = pageCount();
      const to = go === 'first' ? 0 : go === 'prev' ? index - 1 : go === 'next' ? index + 1 : pc - 1;
      const moves = to >= 0 && to < pc && to !== index;
      expect(was, fail('disabled iff it cannot move')).toBe(!moves);
      if (moves) index = to;
      expect(document.activeElement, fail('focus stays')).toBe(b);
      expect(t.said().slice(said), fail('said once, the new page')).toEqual(moves ? [`Page ${index + 1} of ${pc}. ${range()}`] : []);
    } else if (a === 4) {
      const v = r.pick([5, 10, 25]);
      log.push(`size ${v}`);
      const s = t.sizeSelect()!;
      s.focus();
      s.value = String(v);
      s.dispatchEvent(new Event('change', { bubbles: true }));
      if (v !== size) {
        // The page keeps its first row.
        const first = index * size;
        size = v;
        index = Math.floor(first / size);
        clamp();
        expect(t.said().slice(said), fail('size said')).toEqual([`Page ${index + 1} of ${pageCount()}. ${range()}`]);
      }
      expect(document.activeElement, fail('focus stays on the select')).toBe(s);
    } else if (a === 5) {
      const v = r.pick(FILTERS);
      log.push(`filter ${v}`);
      k.dispatch({ type: 'filter.column', column: 'name', filter: v === null ? null : { type: 'text', op: 'contains', value: v } }, 'user');
      if (v !== filter) {
        const before = new Set(matched().map((x) => x.id));
        filter = v;
        const after = new Set(matched().map((x) => x.id));
        const same = before.size === after.size && [...before].every((x) => after.has(x));
        if (mode === 'exc' && !same) (mode = 'inc'), (keys = new Set());
        index = 0;
      }
      expect(t.said().slice(said).filter((x) => x.startsWith('Page')), fail('a filter says no page')).toEqual([]);
    } else if (a === 6 || a === 7) {
      const p = page();
      if (!p.length) continue;
      const id = r.pick(p);
      log.push(`toggle ${id}`);
      k.dispatch({ type: 'selection.toggle', row: keyOf(id) }, 'user');
      if (keys.has(id)) keys.delete(id);
      else keys.add(id);
    } else if (a === 8) {
      const p = page();
      if (!p.length) continue;
      log.push('box');
      t.host.querySelector<HTMLElement>('.dzg-header .dzg-check')!.click();
      if (p.every(selected)) for (const id of p) mode === 'inc' ? keys.delete(id) : keys.add(id);
      else if (mode === 'inc') for (const id of p) keys.add(id);
      // An all-pages selection: that page ticked again, the other pages' exclusions kept (owner Q4).
      else for (const id of p) keys.delete(id);
    } else if (a === 9) {
      const all = t.act('all')!;
      if (all.hidden || t.sel()!.hidden) continue;
      log.push('Select all');
      t.click(all);
      mode = 'exc';
      keys = new Set();
      expect(document.activeElement, fail('focus to Clear')).toBe(t.act('clear'));
    } else if (a === 10) {
      const c = t.act('clear')!;
      if (t.sel()!.hidden) continue;
      log.push('Clear');
      t.click(c);
      mode = 'inc';
      keys = new Set();
      expect(t.footer()!.contains(document.activeElement), fail('focus leaves the footer')).toBe(false);
      expect(t.host.querySelector('[role=grid]')!.contains(document.activeElement), fail('focus to the grid')).toBe(true);
    } else if (a === 11) {
      // Rows removed by the host (selected ones among them, sometimes).
      const drop = new Set(db.filter(() => r.int(4) === 0).map((x) => x.id));
      log.push(`remove ${[...drop].join(',')}`);
      db = db.filter((x) => !drop.has(x.id));
      t.g.update({ rows: db });
      if (mode === 'inc') for (const id of drop) keys.delete(id);
      clamp();
    }
    if (r.int(10) === 0) {
      // A language round trip: texts change, nodes stay.
      log.push('lang ar and back');
      t.g.update({ messages: BUNDLES.ar, locale: 'ar-DZ', direction: 'rtl' });
      expect(t.pageText(), fail('Arabic page text')).toMatch(/^الصفحة /);
      t.g.update({ messages: BUNDLES.en, locale: 'en-US', direction: 'ltr' });
    }
    check();
  }
}

describe('the footer against an independent model', () => {
  const seeds = ONLY ? [ONLY] : Array.from({ length: SEEDS }, (_, i) => i + 1);
  it(`client pages: ${seeds.length} seeded walks (texts, states, selection strip, announcements, focus, nodes)`, () => {
    for (const s of seeds) walk(s);
  }, 120_000);
});

// announce.page on a server, answers out of order and failing: the model says a page sentence
// exactly when the newest request, asked since the user's own page change, answers; never for a
// stale answer, never on a failure, never twice.
function serverWalk(seed: number, steps = 50) {
  const r = rng(seed);
  const log: string[] = [];
  const fail = (m: string) => `seed ${seed}: ${m}\n  ${log.join('\n  ')}`;
  const total = 6 + r.int(40);
  const size = 5;
  const t = pmake({ mode: 'offset', pageSize: size });
  const pc = Math.ceil(total / size);
  const done = new Set<unknown>();
  const reply = (c: (typeof t.f.calls)[number], ok: boolean) => {
    done.add(c);
    if (!ok) return c.err(new Error('down'));
    const o = c.req.page!.offset;
    const n = Math.max(0, Math.min(size, total - o));
    c.ok({ rows: Array.from({ length: n }, (_, i) => ({ id: `r${o + i}`, name: `x${o + i}`, n: o + i })), total });
  };
  reply(t.f.calls[0]!, true);
  let index = 0;
  let waiting = false;
  let phase: 'idle' | 'loading' | 'error' = 'idle';
  const pageSaid = () => t.said().filter((s) => s.startsWith('Page'));
  const range = () => `${index * size + 1} to ${Math.min(total, index * size + size)} of ${total}`;
  for (let step = 0; step < steps; step++) {
    const before = pageSaid().length;
    const a = r.int(6);
    let expectSaid: string[] = [];
    if (a <= 2) {
      const go = r.pick(['first', 'prev', 'next', 'last'] as const);
      const to = go === 'first' ? 0 : go === 'prev' ? index - 1 : go === 'next' ? index + 1 : pc - 1;
      const moves = to >= 0 && to < pc && to !== index;
      const calls = t.f.calls.length;
      log.push(`click ${go}${moves ? '' : ' (off)'}`);
      t.click(t.btn(go));
      expect(t.f.calls.length - calls, fail('one request iff it moves')).toBe(moves ? 1 : 0);
      if (moves) (index = to), (waiting = true), (phase = 'loading');
    } else if (a === 3) {
      log.push('refresh');
      t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
      phase = 'loading';
    } else {
      const open = t.f.calls.filter((c) => !done.has(c));
      if (!open.length) continue;
      const c = r.pick(open);
      const ok = r.int(4) > 0;
      const newest = c === t.f.calls.at(-1);
      log.push(`answer ${t.f.calls.indexOf(c)}${newest ? ' (newest)' : ''}${ok ? '' : ' fails'}`);
      reply(c, ok);
      if (newest) {
        phase = ok ? 'idle' : 'error';
        if (ok && waiting) expectSaid = [`Page ${index + 1} of ${pc}. ${range()}`];
        waiting = false;
      }
    }
    expect(pageSaid().slice(before), fail('page sentences')).toEqual(expectSaid);
    expect(t.pageText(), fail('page text')).toBe(`Page ${index + 1} of ${pc}`);
    expect(t.countText(), fail('count text')).toBe(phase === 'loading' ? 'Loading…' : phase === 'error' ? 'The data could not be loaded' : range());
  }
}

describe('announce.page on a server against a model', () => {
  const seeds = ONLY ? [ONLY] : Array.from({ length: SEEDS }, (_, i) => i + 1);
  it(`offset with a total: ${seeds.length} seeded walks, answers out of order and failing`, () => {
    for (const s of seeds) serverWalk(s);
  }, 120_000);
});
