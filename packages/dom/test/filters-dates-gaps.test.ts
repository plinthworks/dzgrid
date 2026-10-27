// Coverage gaps of step 14 part B (review): the model mapping per operator driven through the real
// tzslot widgets' onChange with random values in random zones, checked against an oracle built on
// DzGrid's core (Intl), not on Temporal; the echo round trip; the shortcuts; the loading lifecycle;
// the midnight timer. tzslot's creators are wrapped (not replaced): the real widget is built, its
// options and updates recorded.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { ColumnOrGroup } from '@dzgrid/core';
import { addDays, zoneDayBounds, RELATIVE_RANGES, type Day } from '@dzgrid/core';
import { Temporal } from '@tzslot/core/lazy';
import { filters } from '../src/filters.js';
import { styles } from '../src/filters/dates/shared.js';
import { cleanup, make, type R } from './support-filters.js';

type Rec = { kind: string; opts: Record<string, any>; updates: Record<string, any>[]; destroyed: boolean };
const rec: Rec[] = [];
// The kits import tzslot's lazy entry (feedback pass L, T3); the period is the popup's own form since pass K:
// tzslot's calendar (`createDateRange`) and two typed ends (`createDateInput`), no `createRangeField`.
vi.mock('@tzslot/dom/lazy', async (orig) => {
  const m = (await orig()) as Record<string, any>;
  const wrap = (kind: string) => (host: HTMLElement, opts: Record<string, any>) => {
    const r: Rec = { kind, opts, updates: [], destroyed: false };
    rec.push(r);
    const w = m[kind](host, opts);
    const update = w.update.bind(w);
    const destroy = w.destroy.bind(w);
    w.update = (o: Record<string, any>) => (r.updates.push(o), update(o));
    w.destroy = () => ((r.destroyed = true), destroy());
    return w;
  };
  return { ...m, createDateField: wrap('createDateField'), createDateRange: wrap('createDateRange'), createDateInput: wrap('createDateInput'), createDateTimeField: wrap('createDateTimeField') };
});

afterEach(cleanup);
let reported: unknown[] = [];
beforeEach(() => {
  rec.length = 0;
  reported = [];
  (window as unknown as { reportError: unknown }).reportError = (e: unknown) => void reported.push(e);
});
afterEach(() => void delete (window as unknown as { reportError?: unknown }).reportError);

type Row = R & { t: string };
const ROWS: Row[] = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, name: `p${i}`, n: i, d: `2026-10-0${i}`, t: `2026-10-0${i}T10:30:00Z` }));
const COLS: ColumnOrGroup<Row>[] = [
  { id: 'name', header: 'Name' },
  { id: 'd', header: 'D', type: 'day' },
  { id: 't', header: 'T', type: 'instant' },
];
const NOW = Date.UTC(2026, 9, 19, 10, 0);
type Kit = 'date' | 'range' | 'moment';
const realKit = (kit: Kit) => import(`../src/filters/dates/${kit}.ts`);
const flush = () => new Promise((r) => setTimeout(r, 0));

function grid(o: { settings?: Record<string, unknown>; loadDates?: (k: Kit) => Promise<unknown>; server?: boolean; columns?: unknown } = {}) {
  const feature = filters({ ...(o.loadDates && { loadDates: o.loadDates as never }) });
  const t = make({ columns: (o.columns ?? COLS) as never, rows: ROWS, features: [feature], server: o.server, settings: { clock: () => NOW, ...o.settings } as never });
  const popup = () => t.host.querySelector<HTMLElement>('.dzg-popup');
  const q = <E extends Element = HTMLElement>(s: string) => popup()?.querySelector<E>(s) ?? null;
  const op = () => q<HTMLSelectElement>('select.dzg-fop')!;
  const widget = () => q<HTMLElement>('.dzg-fdate .tz-field, .dzg-fdate .dzg-fperiod');
  const choose = (v: string) => {
    op().value = v;
    op().dispatchEvent(new Event('change', { bubbles: true }));
  };
  const ready = () => vi.waitFor(() => expect(widget()).not.toBeNull());
  const filter = () => t.g.kernel.query.filter as Record<string, unknown>;
  const set = (column: string, f: unknown) => t.g.kernel.dispatch({ type: 'filter.column', column, filter: f as never }, 'api');
  const apply = () => q<HTMLButtonElement>('.dzg-fapply')!.click();
  /** The live widget's record (the last not destroyed): a field, or the period form's calendar. */
  const live = () => rec.filter((r) => !r.destroyed).at(-1)!;
  /** The period form's typed ends, FROM and TO. */
  const ends = () => rec.filter((r) => !r.destroyed && r.kind === 'createDateInput').slice(-2) as [Rec, Rec];
  const pressed = () => q<HTMLElement>('.dzg-fpreset[aria-pressed=true]')?.dataset['range'] ?? null;
  const preset = (name: string) => q<HTMLButtonElement>(`.dzg-fpreset[data-range="${name}"]`)!;
  return { ...t, feature, popup, q, op, widget, choose, ready, filter, set, apply, live, ends, pressed, preset };
}

function deferred<T>() {
  let ok!: (v: T) => void;
  let no!: (e: unknown) => void;
  const p = new Promise<T>((a, b) => ((ok = a), (no = b)));
  return { p, ok, no };
}

/** A seeded generator (mulberry32): a failure names its seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[int(0, xs.length - 1)]!;
  return { next, int, pick };
}

const ZONES = ['Europe/Paris', 'Pacific/Apia', 'Australia/Lord_Howe', 'America/Sao_Paulo', 'Asia/Kathmandu', 'UTC', 'Pacific/Chatham'];
/** Days worth hitting: clock changes, Apia's lost day and its neighbours, São Paulo's day without midnight. */
const HOT: Day[] = ['2026-03-29', '2026-10-25', '2011-12-29', '2011-12-30', '2011-12-31', '2018-11-04', '2018-02-17', '2026-04-05', '2026-10-04', '2000-02-29', '1999-12-31'] as Day[];
const randDay = (r: ReturnType<typeof rng>): Day =>
  r.next() < 0.4 ? r.pick(HOT) : (`${r.int(1950, 2040)}-${String(r.int(1, 12)).padStart(2, '0')}-${String(r.int(1, 28)).padStart(2, '0')}` as Day);
/** A whole minute, 1950–2040, half the time inside a hot day. */
const randAt = (r: ReturnType<typeof rng>, zone: string): number => {
  if (r.next() < 0.5) {
    const b = zoneDayBounds(r.pick(HOT), zone);
    return Math.floor((b.from + r.int(-120, 1560) * 60_000) / 60_000) * 60_000;
  }
  return Math.floor(r.int(Date.UTC(1950, 0, 1) / 60_000, Date.UTC(2040, 0, 1) / 60_000)) * 60_000;
};
const iso = (ms: number) => new Date(ms).toISOString();
const inst = (ms: number) => Temporal.Instant.fromEpochMilliseconds(ms);
const plain = (d: string) => Temporal.PlainDate.from(d);
/** The wall clock of an instant in a zone, as a typed end holds it. */
const wall = (ms: number, zone: string) => {
  const z = inst(ms).toZonedDateTimeISO(zone);
  return { date: z.toPlainDate(), time: z.toPlainTime() };
};
/** The day of an instant in a zone, by Intl (the oracle does not ask Temporal). */
const dayIn = (ms: number, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

describe('the model per operator: random values through the real widgets’ onChange, against the core’s oracle', () => {
  const SEEDS = 120;
  it(`${SEEDS} seeds, every operator of both kinds, seven zones`, async () => {
    const DAY_OPS = ['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte', 'between'];
    const INSTANT_OPS = ['onDay', 'betweenDays', 'before', 'after', 'between'];
    let checked = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = rng(seed);
      const zone = r.pick(ZONES);
      const t = grid({ settings: { timeZone: zone } });
      for (let k = 0; k < 4; k++) {
        const col = r.pick(['d', 't'] as const);
        const op = r.pick(col === 'd' ? DAY_OPS : INSTANT_OPS);
        t.set(col, null);
        t.feature.openFilter(col);
        t.choose(op);
        await t.ready();
        const w = t.live();
        const what = `seed ${seed} ${zone} ${col} ${op}`;
        let want: unknown;
        if (w.kind === 'createDateField') {
          const d = randDay(r);
          w.opts.onChange(plain(d));
          want = col === 'd' ? { type: 'day', op, value: d } : { type: 'instant', op, day: d };
        } else if (w.kind === 'createDateTimeField') {
          const at = randAt(r, zone);
          w.opts.onChange(inst(at));
          want = { type: 'instant', op, at: iso(at) };
        } else if (op === 'between' && col === 't') {
          // Two moments typed in the ends, each a wall clock in the grid's zone. A wall clock that does not name its
          // moment alone (the second reading of a repeated hour) reads as the first: the typed end has no reading menu
          // (tzslot's input layout), told in filter-date-picker.md; the oracle takes the moment the wall clock names.
          let a = randAt(r, zone);
          let b = r.next() < 0.15 ? a : randAt(r, zone);
          const back = (ms: number) => { const v = wall(ms, zone); return v.date.toZonedDateTime({ timeZone: zone, plainTime: v.time }).epochMilliseconds; };
          a = back(a);
          b = back(b);
          const [from, to] = t.ends();
          from.opts.onChange(wall(a, zone));
          to.opts.onChange(wall(b, zone));
          want = a < b ? { type: 'instant', op, at: iso(a), atTo: iso(b) } : undefined;
        } else {
          // A period of days: the calendar's two days, both in (no instant carries them since pass K).
          let a = randDay(r);
          let b = r.next() < 0.3 ? a : (addDays(a, r.int(0, 40)) as Day);
          if (a > b) [a, b] = [b, a];
          w.opts.onChange({ start: plain(a), end: plain(b) }, { pressed: plain(b) });
          want = col === 'd' ? { type: 'day', op, value: a, valueTo: b } : { type: 'instant', op, day: a, dayTo: b };
        }
        t.apply();
        expect(t.filter()[col], what).toEqual(want);
        checked++;
      }
      cleanup();
    }
    expect(checked).toBe(SEEDS * 4);
  }, 120_000);
});

describe('the echo round trip: a host filter shown, nothing sent, Apply keeps it', () => {
  it('random editable states of every operator, in random zones', async () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(1000 + seed);
      const zone = r.pick(ZONES);
      const t = grid({ settings: { timeZone: zone } });
      const col = r.pick(['d', 't'] as const);
      const a = randDay(r);
      const b = addDays(a, r.int(0, 20))!;
      const at = randAt(r, zone);
      const atTo = at + r.int(1, 5000) * 60_000;
      const f = r.pick<object>(
        col === 'd'
          ? [{ type: 'day', op: r.pick(['equals', 'notEqual', 'lt', 'lte', 'gt', 'gte']), value: a }, { type: 'day', op: 'between', value: a, valueTo: b }, { type: 'day', op: 'relative', range: r.pick([...RELATIVE_RANGES]) }]
          : [{ type: 'instant', op: 'onDay', day: a }, { type: 'instant', op: 'betweenDays', day: a, dayTo: b }, { type: 'instant', op: r.pick(['before', 'after']), at: iso(at) }, { type: 'instant', op: 'between', at: iso(at), atTo: iso(atTo) }, { type: 'instant', op: 'relative', range: r.pick([...RELATIVE_RANGES]) }],
      ) as Record<string, string>;
      t.set(col, f);
      const what = `seed ${seed} ${zone} ${JSON.stringify(f)}`;
      const spy = vi.spyOn(t.g.kernel, 'dispatch');
      t.feature.openFilter(col);
      await t.ready();
      await flush();
      expect(spy.mock.calls.filter(([c]) => (c as { type: string }).type === 'filter.column'), what).toEqual([]);
      expect(t.q('.dzg-fsum'), what).toBeNull();
      expect(t.op().value, what).toBe(f['op'] === 'relative' ? (col === 'd' ? 'between' : 'betweenDays') : f['op']);
      // What the widget was handed.
      const w = t.live();
      const lastV = w.updates.filter((u) => 'value' in u).at(-1)?.value;
      if (f['op'] === 'relative') expect(t.pressed(), what).toBe(f['range']);
      else if (w.kind === 'createDateField') expect(String(lastV), what).toBe(f['value'] ?? f['day']);
      else if (w.kind === 'createDateTimeField') expect(lastV?.epochMilliseconds, what).toBe(Date.parse(f['at']!));
      // The period form's calendar: the ends' days (in the grid's zone for two moments).
      else if (f['op'] === 'between' && col === 't') expect([String(lastV.start), String(lastV.end)], what).toEqual([dayIn(Date.parse(f['at']!), zone), dayIn(Date.parse(f['atTo']!), zone)]);
      else expect([String(lastV.start), String(lastV.end)], what).toEqual([f['value'] ?? f['day'], f['valueTo'] ?? f['dayTo']]);
      t.apply();
      expect(t.filter()[col], what).toEqual(f);
      cleanup();
    }
  }, 120_000);

  // BUG (minor): range.ts value() carries a day by its start instant; Apia's 2011-12-30 has none of
  // its own (it starts where the 31st does), so read() turns it into the 31st and Apply rewrites a
  // host's filter the user never touched (a filterChanged, and on a server a request).
  it('BUG: Apia: a host period starting on the lost day survives Apply unchanged', async () => {
    const t = grid({ settings: { timeZone: 'Pacific/Apia', clock: () => Date.UTC(2011, 11, 20) } });
    const f = { type: 'instant', op: 'betweenDays', day: '2011-12-30', dayTo: '2011-12-31' };
    t.set('t', f);
    t.feature.openFilter('t');
    await t.ready();
    t.apply();
    expect(t.filter()['t']).toEqual(f);
  });

  it('uneditable states: the summary, no widget, nothing loaded', () => {
    const loads: Kit[] = [];
    const t = grid({ loadDates: (k) => (loads.push(k), realKit(k)), columns: [...COLS, { id: 'd2', header: 'D2', type: 'day', filter: { ops: ['equals'] } }] });
    for (const [c, f] of [
      ['d', { type: 'day', op: 'between', value: '2026-10-01', valueTo: '0000-12-31' }],
      ['d', { type: 'day', op: 'betweenDays', value: '2026-10-01' }],
      ['d2', { type: 'day', op: 'relative', range: 'today' }],
      ['t', { type: 'instant', op: 'between', at: '2026-10-01T10:00:00.000Z', atTo: '2026-10-01T10:00:01.000Z' }],
      ['t', { type: 'instant', op: 'after', day: '2026-10-01', at: '2026-10-01T10:00:00.000Z' }],
      ['t', { type: 'instant', op: 'relative', range: 'nextWeek' }],
      ['t', { type: 'instant', op: 'lt', at: '2026-10-01T10:00:00.000Z' }],
    ] as const) {
      t.g.kernel.dispatch({ type: 'filter.set', filter: { [c]: f } as never }, 'api');
      t.feature.openFilter(c);
      expect(t.q('.dzg-fsum'), JSON.stringify(f)).not.toBeNull();
      expect(t.q('.dzg-fdate'), JSON.stringify(f)).toBeNull();
      t.feature.closeFilter();
    }
    // Whatever was built behind the summary is gone.
    expect(rec.every((r) => r.destroyed)).toBe(true);
    expect(document.querySelectorAll('.tz-field, .tz-field__panel')).toHaveLength(0);
  });

  // BUG: the form writes a state it cannot show (body.write before edits()), so dates.write mounts
  // the operator's widget into the detached box: tzslot is imported (up to all three kits) and
  // widgets are built off-screen for a popup that shows only the summary; offline, the failure is
  // reported (window.reportError) although no field is ever shown.
  it('BUG: a summary popup imports no kit and, offline, reports nothing', async () => {
    const loads: Kit[] = [];
    const t = grid({ loadDates: (k) => (loads.push(k), Promise.reject(new Error('offline'))) });
    t.set('d', { type: 'day', op: 'relative', range: 'thisWeek' });
    t.feature.openFilter('d');
    expect(t.q('.dzg-fsum')).not.toBeNull();
    await flush();
    expect({ loads, reported: reported.length }).toEqual({ loads: [], reported: 0 });
  });
});

describe('the six shortcuts', () => {
  for (const [col, op] of [['d', 'between'], ['t', 'betweenDays']] as const) {
    it(`${col} ${op}: each shortcut is {op: relative}; a period by hand afterwards is absolute; a host shortcut is pressed, not sent`, async () => {
      const t = grid({ settings: { timeZone: 'Europe/Paris' } });
      t.feature.openFilter(col);
      t.choose(op);
      await t.ready();
      const type = col === 'd' ? 'day' : 'instant';
      for (const range of RELATIVE_RANGES) {
        t.preset(range).click();
        expect(t.filter()[col], range).toEqual({ type, op: 'relative', range });
        expect(t.pressed(), range).toBe(range);
      }
      t.live().opts.onChange({ start: plain('2026-10-01'), end: plain('2026-10-03') }, { pressed: plain('2026-10-03') });
      expect(t.filter()[col]).toEqual(col === 'd' ? { type, op, value: '2026-10-01', valueTo: '2026-10-03' } : { type, op, day: '2026-10-01', dayTo: '2026-10-03' });
      expect(t.pressed()).toBeNull();
      t.feature.closeFilter();
      t.set(col, { type, op: 'relative', range: 'lastMonth' });
      const spy = vi.spyOn(t.g.kernel, 'dispatch');
      t.feature.openFilter(col);
      await t.ready();
      // Pressed, and the calendar handed the shortcut's days against today (2026-10-19): September.
      expect(t.pressed()).toBe('lastMonth');
      const v = t.live().updates.filter((u) => 'value' in u).at(-1)!['value'];
      expect([String(v.start), String(v.end)]).toEqual(['2026-09-01', '2026-09-30']);
      await flush();
      expect(spy.mock.calls.filter(([c]) => (c as { type: string }).type === 'filter.column')).toEqual([]);
      t.apply();
      expect(t.filter()[col]).toEqual({ type, op: 'relative', range: 'lastMonth' });
    });
  }

  it('a host shortcut over an absolute period, the popup open: the same form shows it pressed, with its days', async () => {
    for (const [col, f] of [['d', { type: 'day', op: 'between', value: '2026-10-01', valueTo: '2026-10-03' }], ['t', { type: 'instant', op: 'betweenDays', day: '2026-10-01', dayTo: '2026-10-03' }]] as const) {
      const t = grid({ settings: { timeZone: 'Europe/Paris' } });
      t.set(col, f);
      t.feature.openFilter(col);
      await t.ready();
      const w = t.live();
      expect(w.updates.at(-1)!['value'].start).not.toBeNull();
      t.set(col, { type: f.type, op: 'relative', range: 'last7Days' });
      expect(t.live(), col).toBe(w);
      expect(t.pressed(), col).toBe('last7Days');
      const v = w.updates.filter((u) => 'value' in u).at(-1)!['value'];
      expect([String(v.start), String(v.end)], col).toEqual(['2026-10-13', '2026-10-19']);
      cleanup();
    }
  });

  it('instant between moments offers no shortcut; its ends carry their hours', async () => {
    const t = grid({ settings: { timeZone: 'Europe/Paris' } });
    t.feature.openFilter('t');
    t.choose('between');
    await t.ready();
    expect(t.q('.dzg-fpreset')).toBeNull();
    expect(t.ends().map((e) => e.opts['withTime'])).toEqual([true, true]);
  });
});

describe('loading lifecycle', () => {
  const tz = () => [...document.querySelectorAll('.tz-field')];
  it('closed, reopened while loading: one widget, inside the open popup, built once', async () => {
    const kit = deferred<unknown>();
    const loads: Kit[] = [];
    const t = grid({ loadDates: (k) => (loads.push(k), kit.p) });
    t.feature.openFilter('d');
    t.feature.closeFilter();
    t.feature.openFilter('d');
    expect(loads).toEqual(['date']);
    kit.ok(await realKit('date'));
    await t.ready();
    expect(tz()).toHaveLength(1);
    expect(t.popup()!.contains(tz()[0]!)).toBe(true);
    expect(rec.filter((r) => !r.destroyed)).toHaveLength(1);
    expect(rec).toHaveLength(1);
  });

  it('two columns waiting on one kit: only the open popup gets a widget', async () => {
    const kit = deferred<unknown>();
    const t = grid({ loadDates: () => kit.p });
    t.feature.openFilter('d');
    t.feature.openFilter('t');
    kit.ok(await realKit('date'));
    await t.ready();
    expect(tz()).toHaveLength(1);
    expect(t.popup()!.contains(tz()[0]!)).toBe(true);
    expect(rec).toHaveLength(1);
    expect(t.q('.dzg-fzone')).not.toBeNull();
  });

  it('an operator changed while its kit loads: the late kit is not mounted for the new operator', async () => {
    const range = deferred<unknown>();
    const t = grid({ loadDates: (k) => (k === 'range' ? range.p : realKit(k)) });
    t.feature.openFilter('d');
    await t.ready();
    t.choose('between');
    expect(t.widget()).toBeNull();
    t.choose('lt');
    await t.ready();
    range.ok(await realKit('range'));
    await flush();
    expect(rec.filter((r) => !r.destroyed).map((r) => r.kind)).toEqual(['createDateField']);
  });

  it('a failure, the popup closed and opened again: loads again by itself; a failure for a closed popup reports nothing', async () => {
    let n = 0;
    const gate = deferred<unknown>();
    const t = grid({ loadDates: (k) => (++n === 1 ? Promise.reject(new Error('offline')) : n === 2 ? gate.p : realKit(k)) });
    t.feature.openFilter('d');
    await vi.waitFor(() => expect(t.q('.dzg-ffail')).not.toBeNull());
    expect(reported).toHaveLength(1);
    t.feature.closeFilter();
    t.feature.openFilter('d');
    expect(n).toBe(2);
    expect(t.q('.dzg-fload')).not.toBeNull();
    t.feature.closeFilter();
    gate.no(new Error('offline again'));
    await flush();
    expect(reported).toHaveLength(1);
    t.feature.openFilter('d');
    await t.ready();
  });

  it('the grid destroyed while loading: no widget, no report, no dispatch, no throw', async () => {
    const kit = deferred<unknown>();
    const t = grid({ loadDates: () => kit.p });
    t.feature.openFilter('d');
    const spy = vi.spyOn(t.g.kernel, 'dispatch');
    t.g.destroy();
    kit.ok(await realKit('date'));
    await flush();
    expect(tz()).toHaveLength(0);
    expect(rec).toHaveLength(0);
    expect(reported).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('the grid destroyed while a kit fails: nothing reported', async () => {
    const kit = deferred<unknown>();
    const t = grid({ loadDates: () => kit.p });
    t.feature.openFilter('d');
    t.g.destroy();
    kit.no(new Error('offline'));
    await flush();
    expect(reported).toEqual([]);
  });

  it('no leak after 15 openings with the panel open: widgets destroyed, observers disconnected, one sheet per id', async () => {
    document.head.querySelectorAll('style').forEach((s) => s.remove());
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const t = grid({ settings: { timeZone: 'Europe/Paris' } });
    for (let i = 0; i < 15; i++) {
      const [c, op] = (['d:equals', 'd:between', 't:before', 't:between', 't:onDay'] as const)[i % 5]!.split(':') as [string, string];
      t.feature.openFilter(c);
      t.choose(op);
      await t.ready();
      (t.q<HTMLElement>('.dzg-fdate .tz-field__trigger:is(button)') ?? t.q<HTMLElement>('.dzg-fdate .tz-field__icon-button'))?.click();
      t.feature.closeFilter();
    }
    expect(document.querySelectorAll('.tz-field, .tz-field__panel')).toHaveLength(0);
    expect(rec.every((r) => r.destroyed)).toBe(true);
    // DzGrid's own observers (named()): those watching the widget's host or panel.
    const ours = observe.mock.calls.flatMap(([target], i) => ((target as Element).matches?.('.dzg-fwidget, .dzg-fpanel, .dzg-fcal') ? [observe.mock.contexts[i]] : [])).filter((c, i, a) => a.indexOf(c) === i);
    expect(ours.length).toBeGreaterThanOrEqual(15);
    for (const mo of ours) expect(disconnect.mock.contexts, 'an observer never disconnected').toContain(mo);
    const ids = [...document.head.querySelectorAll<HTMLStyleElement>('style[data-tzslot]')].map((s) => s.dataset['tzslot']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('styles(): once per shadow root, none in the head for a widget inside one, the nonce on each', () => {
    document.head.querySelectorAll('style').forEach((s) => s.remove());
    const outer = document.createElement('div');
    document.body.append(outer);
    const root = outer.attachShadow({ mode: 'open' });
    const host = document.createElement('div');
    root.append(host);
    const a = { host, grid: host, inject: true, nonce: 'n1' } as never;
    styles(a, [['field', '.a{}'], ['calendar', '.b{}']]);
    styles(a, [['field', '.a{}']]);
    expect([...root.querySelectorAll<HTMLStyleElement>('style')].map((s) => `${s.dataset['tzslot']}:${s.nonce || s.getAttribute('nonce')}`).sort()).toEqual(['calendar:n1', 'field:n1']);
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    // The document's own: once in the head.
    const h2 = document.createElement('div');
    document.body.append(h2);
    styles({ host: h2, grid: h2, inject: true } as never, [['field', '.a{}']]);
    styles({ host: h2, grid: h2, inject: true } as never, [['field', '.a{}']]);
    expect(document.head.querySelectorAll('style[data-tzslot="field"]')).toHaveLength(1);
    expect(document.head.querySelector('style')!.hasAttribute('nonce')).toBe(false);
  });
});

describe('the midnight timer', () => {
  const fake = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  it('re-armed after each midnight: three days, three ticks, the rows follow', () => {
    fake();
    let now = Date.UTC(2026, 9, 1, 12);
    const t = grid({ settings: { timeZone: 'UTC', clock: () => now } });
    t.set('d', { type: 'day', op: 'relative', range: 'today' });
    expect(t.ids()).toEqual(['r1']);
    const tick = vi.spyOn(t.g.kernel, 'tick');
    for (let i = 1; i <= 3; i++) {
      now = Date.UTC(2026, 9, 1 + i, 0, 0, 0, 60);
      vi.advanceTimersByTime(12 * 3_600_000 + 60);
      expect(tick).toHaveBeenCalledTimes(i);
      expect(t.ids()).toEqual([`r${1 + i}`]);
      now = Date.UTC(2026, 9, 1 + i, 12);
      vi.advanceTimersByTime(12 * 3_600_000 - 60);
    }
  });

  it('a day of 23 h (Paris, 2026-03-29): the tick at the real midnight, not 24 h later', () => {
    fake();
    let now = Date.UTC(2026, 2, 28, 23, 0); // 00:00 Paris on the 29th
    const t = grid({ settings: { timeZone: 'Europe/Paris', clock: () => now } });
    t.set('d', { type: 'day', op: 'relative', range: 'today' });
    const tick = vi.spyOn(t.g.kernel, 'tick');
    now += 23 * 3_600_000 - 1000;
    vi.advanceTimersByTime(23 * 3_600_000 - 1000);
    expect(tick).not.toHaveBeenCalled();
    now += 1100;
    vi.advanceTimersByTime(1100);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('cleared on destroy: no timer left, no tick, visibilitychange ignored', () => {
    fake();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    const before = vi.getTimerCount();
    const t = grid({ settings: { timeZone: 'Europe/Paris' } });
    t.set('d', { type: 'day', op: 'relative', range: 'today' });
    expect(vi.getTimerCount()).toBeGreaterThan(before);
    const tick = vi.spyOn(t.g.kernel, 'tick');
    t.g.destroy();
    expect(vi.getTimerCount()).toBe(before);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(2 * 86_400_000);
    expect(tick).not.toHaveBeenCalled();
  });

  it('the page hidden ticks nothing; visible again ticks once, and leaves one timer', () => {
    fake();
    const t = grid({ settings: { timeZone: 'Europe/Paris' } });
    t.set('d', { type: 'day', op: 'relative', range: 'today' });
    const n = vi.getTimerCount();
    const tick = vi.spyOn(t.g.kernel, 'tick');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(tick).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(tick).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(n);
  });

  it('a clock that jumps a day ahead (sleep): the next paint re-arms for the new midnight, the rows show the new day', () => {
    fake();
    let now = Date.UTC(2026, 9, 3, 12);
    const t = grid({ settings: { timeZone: 'UTC', clock: () => now } });
    t.set('d', { type: 'day', op: 'relative', range: 'today' });
    const tick = vi.spyOn(t.g.kernel, 'tick');
    now = Date.UTC(2026, 9, 5, 12);
    // The stale timer fires (late, on wake): one tick, the rows on the 5th, armed for the 6th.
    vi.advanceTimersByTime(12 * 3_600_000 + 60);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(t.ids()).toEqual(['r5']);
    now = Date.UTC(2026, 9, 6, 0, 0, 1);
    vi.advanceTimersByTime(12 * 3_600_000 + 100);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(t.ids()).toEqual(['r6']);
  });

  it('a zone change re-arms for the new zone’s midnight', () => {
    fake();
    let now = Date.UTC(2026, 9, 3, 12);
    const t = grid({ settings: { timeZone: 'UTC', clock: () => now } });
    t.set('d', { type: 'day', op: 'relative', range: 'today' });
    t.g.update({ timeZone: 'Asia/Tokyo' } as never);
    const tick = vi.spyOn(t.g.kernel, 'tick');
    // Tokyo's midnight is 15:00 UTC.
    now = Date.UTC(2026, 9, 3, 15, 0, 0, 60);
    vi.advanceTimersByTime(3 * 3_600_000 + 60);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('the shortcut removed: the timer goes; a combined filter that loses its shortcut too', () => {
    fake();
    const t = grid();
    const base = vi.getTimerCount();
    t.set('d', { type: 'combined', join: 'or', conditions: [{ type: 'day', op: 'blank' }, { type: 'day', op: 'relative', range: 'today' }] });
    expect(vi.getTimerCount()).toBe(base + 1);
    t.set('d', { type: 'combined', join: 'or', conditions: [{ type: 'day', op: 'blank' }, { type: 'day', op: 'equals', value: '2026-10-01' }] });
    expect(vi.getTimerCount()).toBe(base);
    t.set('t', { type: 'instant', op: 'relative', range: 'today' });
    t.set('d', { type: 'day', op: 'relative', range: 'today' });
    expect(vi.getTimerCount()).toBe(base + 1);
  });

  it('on a server, the page visible again on the same day sends nothing', () => {
    fake();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    const t = grid({ server: true });
    t.f.answer([]);
    t.set('t', { type: 'instant', op: 'relative', range: 'yesterday' });
    t.f.answer([]);
    const calls = t.f.calls.length;
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(t.f.calls.length).toBe(calls);
  });

  for (const [label, from, to] of [['rows change', Date.UTC(2026, 9, 3, 23, 59), Date.UTC(2026, 9, 4, 0, 0, 1)], ['no row either day', Date.UTC(2026, 9, 19, 23, 59), Date.UTC(2026, 9, 20, 0, 0, 1)]] as const) {
    // BUG: kernel.tick() changes no filter state, so menu.paint's draw() hands the part an equal
    // context and the form never runs texts(): dates.ts's key() (which holds today) is not compared,
    // field.update() never runs, and an open popup keeps showing yesterday's period for the shortcut
    // while the rows have moved on.
    it(`BUG: the open popup’s shortcut follows midnight (${label}): the widget is given the new today and the shortcut again`, async () => {
      fake();
      let now: number = from;
      const t = grid({ settings: { timeZone: 'UTC', clock: () => now } });
      t.set('d', { type: 'day', op: 'relative', range: 'today' });
      t.feature.openFilter('d');
      await t.ready();
      const tick = vi.spyOn(t.g.kernel, 'tick');
      now = to;
      vi.advanceTimersByTime(2 * 60_000);
      expect(tick).toHaveBeenCalledTimes(1);
      const ups = t.live().updates;
      const i = ups.findLastIndex((u) => 'today' in u);
      expect(i, 'no update with today').toBeGreaterThanOrEqual(0);
      const day = new Date(to).toISOString().slice(0, 10);
      expect(String(ups[i]!['today'])).toBe(day);
      // The shortcut's days again, against the new today.
      expect(String(ups[i]!['value'].start)).toBe(day);
    });
  }
});
