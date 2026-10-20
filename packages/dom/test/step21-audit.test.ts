// Audit of step 21 (selection rules, the context, header parts driving the filter).
// 1. The header filter under random interleavings: an application's header box, the floating
//    box, a set "now" (as the popup applies), opening the popup (it applies the column's pending
//    edit first), clear-all, and time. One pending edit per column, the last write wins; the header
//    context's filter is always the one in force (never a stale object), and kept while nothing moved.
// 2. Bugs found (were `it.fails` repros, fixed in the step 21 corrections).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnOrGroup, Json } from '@dzgrid/core';
import { canonical } from '@dzgrid/core/internal';
import { definePart, type SlotContext } from '../src/part.js';
import { slots } from '../src/slots.js';
import { filters } from '../src/filters.js';
import { cleanup, make, type R } from './support-filters.js';
import { cleanup as rcleanup, held, rmake, ROWS } from './support-rules.js';
import { mulberry32 } from '../../core/test/support/rng.js';

afterEach(cleanup);
afterEach(rcleanup);

type HC = SlotContext['header'];
const text = (v: string): Json => ({ type: 'text', op: 'contains', value: v });
const valueOf = (s: unknown): string => ((s as { value?: string } | null)?.value) ?? '';

/** An application's header: the title and its own search box (echoes the state while not focused). */
function appHeader() {
  const seen = { updates: 0, ctx: new Map<string, HC>() };
  const part = definePart('header', {
    mount(host, c) {
      seen.ctx.set(c.column.id, c);
      let cur = c;
      const input = document.createElement('input');
      input.className = 'app-box';
      input.value = valueOf(c.filter?.state);
      input.addEventListener('input', () => cur.filter?.set(input.value ? text(input.value) : null));
      host.append(input);
      return {
        update(n) {
          seen.updates++;
          seen.ctx.set(n.column.id, n);
          cur = n;
          if (document.activeElement !== input) input.value = valueOf(n.filter?.state);
        },
        focus: () => (input.focus(), true),
      };
    },
  });
  return { seen, part };
}

const COLS: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name' }, { id: 'id', header: 'Id' }];
const VALUES = ['', 'a', 'an', 'b', 'bo', 'r1', 'zz'];

function walk(seed: number, steps = 40) {
  const rnd = mulberry32(seed);
  const int = (n: number) => Math.floor(rnd() * n);
  const pick = <X>(xs: readonly X[]): X => xs[int(xs.length)]!;
  const log: string[] = [];
  const fail = (m: string) => `seed ${seed}: ${m}\n  ${log.join('\n  ')}`;
  vi.useFakeTimers();
  const h = appHeader();
  const f = filters({ floating: true });
  const t = make({ columns: COLS, features: [slots(), f], settings: { parts: { header: h.part } } });
  const hcell = (c: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[data-col="${c}"]:not(.dzg-hextra)`)!;
  const appBox = (c: string) => hcell(c).querySelector<HTMLInputElement>('input.app-box')!;

  // The oracle: what is in force, and the one pending edit per column (who wrote it, when it applies).
  let now = 0;
  const applied = new Map<string, string>();
  const pending = new Map<string, { v: string; who: 'app' | 'float'; at: number }>();
  const settle = () => {
    for (const [c, p] of [...pending].sort((a, b) => a[1].at - b[1].at)) if (p.at <= now) { pending.delete(c); p.v ? applied.set(c, p.v) : applied.delete(c); }
  };
  const flushO = (c: string) => { const p = pending.get(c); if (p) { pending.delete(c); p.v ? applied.set(c, p.v) : applied.delete(c); } };

  const appText = new Map<string, string>();
  const lastSeen = new Map<string, string>([['name', ''], ['id', '']]);
  const check = (what: string) => {
    for (const c of ['name', 'id']) {
      const inForce = t.g.kernel.query.filter[c] ?? null;
      expect(valueOf(inForce), fail(`${what}: ${c} in force`)).toBe(applied.get(c) ?? '');
      // The header context's filter: the state in force itself, never an older object.
      const ctx = h.seen.ctx.get(c)!;
      expect(ctx.filter!.state, fail(`${what}: ${c} header state`)).toBe(inForce);
      // The app box shows what it typed until the state in force changes (it is then updated).
      const v = applied.get(c) ?? '';
      if (v !== lastSeen.get(c)) { lastSeen.set(c, v); appText.set(c, v); }
      expect(appBox(c).value, fail(`${what}: ${c} app box echo`)).toBe(appText.get(c) ?? '');
    }
  };

  for (let step = 0; step < steps; step++) {
    const c = pick(['name', 'id']);
    const v = pick(VALUES);
    const r = int(7);
    let what: string;
    if (r === 0) {
      what = `app ${c} "${v}"`;
      const i = appBox(c);
      i.value = v;
      i.dispatchEvent(new InputEvent('input', { bubbles: true }));
      appText.set(c, v);
      pending.set(c, { v, who: 'app', at: now + 150 });
    } else if (r === 1) {
      what = `floating ${c} "${v}"`;
      t.type(c, v);
      // The floating box sends only what differs from the filter in force; else it drops its own edit.
      if (v === (applied.get(c) ?? '')) { if (pending.get(c)?.who === 'float') pending.delete(c); }
      else {
        // The app's pending edit replaced: its box shows the filter in force again.
        if (pending.get(c)?.who === 'app') appText.set(c, applied.get(c) ?? '');
        pending.set(c, { v, who: 'float', at: now + 150 });
      }
    } else if (r === 2) {
      what = `now ${c} "${v}"`;
      h.seen.ctx.get(c)!.filter!.set(v ? text(v) : null, { commit: 'now' });
      pending.delete(c);
      v ? applied.set(c, v) : applied.delete(c);
    } else if (r === 3) {
      what = `open popup ${c}, Escape`;
      // The focus leaving a header cell (back on its button after an earlier popup) applies its edit.
      const was = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.dzg-header [data-col]')?.dataset['col'];
      f.openFilter(c);
      if (was) flushO(was);
      flushO(c);
      const pop = document.querySelector<HTMLElement>('.dzg-fpop');
      (document.activeElement as HTMLElement | null)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      void pop;
    } else if (r === 4) {
      what = 'clear all';
      t.g.kernel.dispatch({ type: 'query.set', query: { sort: [], filter: {}, quick: '' } as never }, 'user');
      // The clear overrides every pending edit (last write wins): dropped, the app's box shows the state in force.
      for (const [col, p] of pending) if (p.who === 'app') appText.set(col, '');
      pending.clear();
      applied.clear();
    } else if (r === 5) {
      const ms = pick([0, 50, 100, 149, 150, 200]);
      what = `wait ${ms}`;
      vi.advanceTimersByTime(ms);
      now += ms;
      settle();
    } else {
      what = 'refresh';
      const before = h.seen.updates;
      const objs = ['name', 'id'].map((x) => h.seen.ctx.get(x)!.filter);
      t.g.api.refresh();
      expect(h.seen.updates, fail('an unrelated paint updates no header part')).toBe(before);
      expect(['name', 'id'].map((x) => h.seen.ctx.get(x)!.filter), fail('the same filter objects')).toEqual(objs);
    }
    log.push(what);
    check(what);
  }
  vi.advanceTimersByTime(1000);
  now += 1000;
  settle();
  check('end');
  void canonical;
}

describe('the header filter under random interleavings (step 21)', () => {
  it('40 seeded walks of 40 steps: last write wins, the header context never stale', () => {
    for (let seed = 1; seed <= 40; seed++) {
      walk(seed * 613);
      cleanup();
    }
  });
});

describe('step 21 review bugs (were it.fails)', () => {
  const BOX: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name', ui: { header: 'header.filterBox' } }, { id: 'n', header: 'N', type: 'number' }];
  const hbox = (host: HTMLElement) => host.querySelector<HTMLInputElement>('.dzg-hcell[data-col="name"]:not(.dzg-hextra) .dzg-hfbox input')!;

  it('header.filterBox: a box whose edit lost to the other box shows the filter in force once applied', () => {
    vi.useFakeTimers();
    const t = make({ columns: BOX, features: [slots(), filters({ floating: true })] });
    t.type('name', 'an');
    const h = hbox(t.host);
    h.value = 'bo';
    h.dispatchEvent(new InputEvent('input', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(t.g.kernel.query.filter['name']).toEqual(text('bo'));
    expect(h.value).toBe('bo');
    // The floating box keeps "an" (its echo still thinks its edit is pending), and goes on
    // ignoring later filters until its own comes back.
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'q' } }, 'host');
    expect(t.input('name')!.value).toBe('q');
  });

  it('header.filterBox: a renamed column renames its box (the cached filter carries the old column)', () => {
    const t = make({ columns: BOX, features: [slots(), filters()] });
    expect(hbox(t.host).getAttribute('aria-label')).toBe('Filter Name');
    t.g.update({ columns: [{ ...BOX[0]!, header: 'Nom' }, BOX[1]!] as never });
    expect(t.host.querySelector('.dzg-hcell[data-col="name"] .dzg-hlabel')!.textContent).toBe('Nom');
    expect(hbox(t.host).getAttribute('aria-label')).toBe('Filter Nom');
  });

  it('clear-all drops a pending edit: the filters stay cleared after the pause', () => {
    vi.useFakeTimers();
    const t = make({ columns: BOX, features: [slots(), filters({ floating: true })] });
    t.type('name', 'an');
    t.g.kernel.dispatch({ type: 'query.set', query: { sort: [], filter: {}, quick: '' } as never }, 'user');
    vi.advanceTimersByTime(500);
    expect(t.g.kernel.query.filter).toEqual({});
  });

  it('rules: a row the host changes so the rule now allows it loses its refused look, and the box selects it', () => {
    const rows = ROWS.slice(0, 2);
    const t = rmake({ rows: [rows[0]!, { ...rows[1]!, name: 'bad' }], rule: (row) => row.data.name !== 'bad' });
    t.clickBox('r0');
    expect(t.check('r1')!.hasAttribute('data-dzg-refused')).toBe(true);
    expect(t.headerBox()!.getAttribute('aria-checked')).toBe('true');
    t.g.update({ rows } as never);
    expect(t.check('r1')!.hasAttribute('data-dzg-refused')).toBe(false);
    expect(t.headerBox()!.getAttribute('aria-checked')).toBe('mixed');
    t.headerBox()!.click();
    expect(held(t.g.kernel.selection)).toEqual(['r0', 'r1']);
  });
});

describe('a pending edit another write overrides is dropped (last write wins)', () => {
  const BOX: ColumnOrGroup<R>[] = [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }];

  it('a host\'s filter.set drops every pending edit, its boxes show the filters set', () => {
    vi.useFakeTimers();
    const t = make({ columns: BOX, features: [slots(), filters({ floating: true })] });
    t.type('name', 'an');
    t.type('n', '4');
    t.g.kernel.dispatch({ type: 'filter.set', filter: { name: text('q') as never } }, 'host');
    vi.advanceTimersByTime(500);
    expect(t.g.kernel.query.filter).toEqual({ name: text('q') });
    expect([t.input('name')!.value, t.input('n')!.value]).toEqual(['q', '']);
  });

  it('clear all drops the pending edit and empties its box; an edit typed after the clear applies', () => {
    vi.useFakeTimers();
    const t = make({ columns: BOX, features: [slots(), filters({ floating: true })] });
    t.type('name', 'an');
    t.g.kernel.dispatch({ type: 'query.set', query: { sort: [], filter: {}, quick: '' } as never }, 'user');
    expect(t.input('name')!.value).toBe('');
    vi.advanceTimersByTime(500);
    expect(t.g.kernel.query.filter).toEqual({});
    t.type('name', 'bo');
    vi.advanceTimersByTime(500);
    expect(t.g.kernel.query.filter['name']).toEqual(text('bo'));
  });

  it('a filter on another column leaves the pending edit alone', () => {
    vi.useFakeTimers();
    const t = make({ columns: BOX, features: [slots(), filters({ floating: true })] });
    t.type('name', 'an');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'equals', value: 3 } }, 'host');
    vi.advanceTimersByTime(500);
    expect(t.g.kernel.query.filter['name']).toEqual(text('an'));
    expect(t.input('name')!.value).toBe('an');
  });

  it('a header part learns its pending edit was dropped: a new filter object, `dropped` counted, nothing else moves it', () => {
    vi.useFakeTimers();
    const h = appHeader();
    const t = make({ columns: BOX, features: [slots(), filters({ floating: true })], settings: { parts: { header: h.part } } });
    const first = h.seen.ctx.get('name')!.filter!;
    expect(first.dropped).toBe(0);
    first.set(text('a'));
    t.g.api.refresh();
    expect(h.seen.ctx.get('name')!.filter).toBe(first);
    const updates = h.seen.updates;
    t.type('name', 'b');
    const now = h.seen.ctx.get('name')!.filter!;
    expect(now).not.toBe(first);
    expect(now.dropped).toBe(1);
    expect(h.seen.updates).toBe(updates + 1);
    vi.advanceTimersByTime(500);
    expect(t.g.kernel.query.filter['name']).toEqual(text('b'));
  });
});

describe('keys in a header cell whose part takes no focus', () => {
  /** A header holding an input, its part offering no focus(). */
  const deaf = definePart('header', {
    mount(host, c) {
      const i = document.createElement('input');
      i.className = 'app-box';
      host.append(document.createTextNode(c.label), i);
      return {};
    },
  });

  it('F2 leaves its controls out of the Tab order (one tab stop), the focus on the cell', () => {
    const t = make({ columns: COLS, features: [slots(), filters({ floating: false })], settings: { parts: { header: deaf } } });
    const cell = t.host.querySelector<HTMLElement>('.dzg-hcell[data-col="name"]:not(.dzg-hextra)')!;
    const box = cell.querySelector<HTMLInputElement>('input.app-box')!;
    expect(box.tabIndex).toBe(-1);
    cell.focus();
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(cell);
    expect(box.tabIndex).toBe(-1);
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(box.tabIndex).toBe(-1);
  });
});
