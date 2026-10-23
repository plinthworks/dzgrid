// A random walk over `@dzgrid/dom/edit` (Phase 5 step 4, step04-plan « Tests first » 4): commits, answers
// (saved or refused), undo, sort, filter, scroll, host updates and time, on browser rows and on a server's
// page; after each step every mounted cell's marks and text equal an oracle written from the sheets
// (edit-save.md 6–14, edit-validation.md 2–2b): 0 stale mark, 0 stale value.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { idOfDataKey, type ColumnDef, type RowKey } from '@dzgrid/core';
import { sourceRows, type DataSource } from '@dzgrid/core/server';
import type { SaveRequest } from '@dzgrid/core/edit';
import { edit } from '../src/edit.js';
import { EN } from '../src/locales/en.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { cleanup, emake, join, k, type R } from './support-edit.js';

afterEach(cleanup);

const COLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120 },
  { id: 'n', header: 'N', type: 'number', width: 80, editable: true },
  { id: 'q', header: 'Q', type: 'number', width: 80, editable: true },
];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

interface O { savedUntil: number; hold: { until: number; v: unknown; ab: string } | null; lockUntil: number; ab: string; gen: number | null; start: number }

async function walk(seed: number, server: boolean): Promise<string[]> {
  const r = rng(seed);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)]!;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const held: { ok(): void; no(e: unknown): void; done: boolean }[] = [];
  const save = (_req: SaveRequest<R>) => new Promise<void>((ok, no) => held.push({ ok: () => ok(), no, done: false }));
  const f = edit<R>({ save });
  let data: R[] = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, name: `Name ${i}`, n: i, s: '', q: (i * 37) % 101 }));
  const source: DataSource<R> = { fetch: () => ({ then(ok: (v: never) => void) { ok({ rows: data, total: data.length } as never); } }) as never };
  const m = emake({ columns: COLS, block: 200, rows: server ? undefined : data, settings: { features: [f], messages: join(EN, EN_EDIT), ...(server && { source: sourceRows(source), operations: 'server' as const, rows: undefined }) } });
  const api = f.api(m.g)!;
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  await settle();
  // The oracle, per cell, from the events as the sheets read them.
  let now = 0;
  const o = new Map<string, O>();
  const of = (key: RowKey, c: string): O => {
    const id = `${key}\n${c}`;
    if (!o.has(id)) o.set(id, { savedUntil: 0, hold: null, lockUntil: 0, ab: 'b', gen: null, start: 0 });
    return o.get(id)!;
  };
  m.g.kernel.subscribe((e) => {
    if (e.type === 'editStates') for (const { key, column } of e.cells) {
      const x = of(key, column);
      const s = api.state(key, column);
      if (s?.status !== 'failed') x.hold = null;
      x.savedUntil = s?.status === 'saved' ? now + 1500 : 0;
      if (s?.status !== 'saving') x.gen = null;
      else if (x.gen !== s.generation) (x.gen = s.generation), (x.start = now);
    }
    if (e.type === 'saveFailed' && api.state(e.key, e.column)?.status === 'failed') {
      const x = of(e.key, e.column);
      const blink = now >= x.lockUntil;
      if (blink) (x.ab = x.ab === 'a' ? 'b' : 'a'), (x.lockUntil = now + 1000);
      x.hold = { until: now + 500, v: e.value, ab: blink ? x.ab : '' };
    }
  });
  const errors: string[] = [];
  const check = (step: string) => {
    m.ctx.rowRenderer.forEach((key, v) => {
      const row = m.g.kernel.rows.row(key)?.data as R | undefined;
      for (const [c, cv] of v.cells) {
        if (!row) continue;
        const x = o.get(`${key}\n${c}`);
        const s = api.state(key, c);
        const hold = x?.hold && now < x.hold.until ? x.hold : null;
        let want = '';
        if (hold) want = hold.ab ? `blink-${hold.ab} refused` : 'refused';
        else if (s?.status === 'saving') want = now - x!.start >= 5000 ? 'saving still' : 'saving';
        else if (s?.status === 'failed') want = 'failed';
        else if (s?.status === 'pending') want = 'pending';
        else if (s?.status === 'saved' && now < x!.savedUntil) want = 'saved';
        const got = [...cv.el.classList].filter((t) => t.startsWith('dzg-cell--')).map((t) => t.slice(10)).sort().join(' ');
        if (got !== want) errors.push(`${seed} ${step}: ${key} ${c} marks "${got}" want "${want}"`);
        const col = m.g.kernel.columns.get(c)!;
        const value = hold ? hold.v : m.g.kernel.reader.value(col as never, row as never, idOfDataKey(key) ?? '');
        const text = value === null || value === undefined ? '' : col.codec.format(col.codec.coerce(value, m.ctx.ctx) as never, m.ctx.ctx);
        if (cv.el.textContent !== text) errors.push(`${seed} ${step}: ${key} ${c} text "${cv.el.textContent}" want "${text}"`);
      }
    });
  };
  for (let step = 0; step < 40 && errors.length < 3; step++) {
    const op = r();
    let what = '';
    if (op < 0.3) {
      const id = `r${Math.floor(r() * 20)}`;
      const c = pick(['n', 'q']);
      what = `commit ${id} ${c}`;
      api.commit([{ key: k(id), column: c, input: { text: String(Math.floor(r() * 200)) } }]);
    } else if (op < 0.5) {
      const open = held.filter((h) => !h.done);
      if (open.length) {
        const h = pick(open);
        h.done = true;
        what = 'answer';
        if (r() < 0.5) h.ok();
        else h.no(r() < 0.5 ? { reason: 'no' } : new Error('x'));
      }
    } else if (op < 0.58) (what = 'undo'), api.undo();
    else if (op < 0.66) (what = 'sort'), m.g.kernel.dispatch({ type: 'sort.toggle', column: pick(['n', 'q']), multi: false }, 'user');
    else if (op < 0.72) (what = 'filter'), m.g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: r() < 0.5 ? null : { type: 'number', op: 'gt', value: Math.floor(r() * 60) } }, 'user');
    else if (op < 0.8) (what = 'scroll'), m.scroll(Math.floor(r() * 30) * 32);
    else if (op < 0.86 && !server) {
      const i = Math.floor(r() * 20);
      what = `update r${i}`;
      data = data.map((x) => (x.id === `r${i}` ? { ...x, n: x.n + 1000 } : x));
      m.g.kernel.rows.applyTransaction({ update: [data[i]!] });
    } else {
      const ms = pick([100, 300, 499, 500, 1000, 1500, 5000]);
      what = `time ${ms}`;
      now += ms;
      vi.advanceTimersByTime(ms);
    }
    await settle();
    check(`${step} ${what}`);
  }
  m.g.destroy();
  return errors;
}

describe('the edit walk', () => {
  it('300 seeds on browser rows: 0 stale mark, 0 stale value', async () => {
    const errors: string[] = [];
    for (let seed = 1; seed <= 300 && errors.length < 5; seed++) errors.push(...(await walk(seed, false)));
    expect(errors).toEqual([]);
  }, 60_000);

  it('100 seeds on a server’s page: 0 stale mark, 0 stale value', async () => {
    const errors: string[] = [];
    for (let seed = 1; seed <= 100 && errors.length < 5; seed++) errors.push(...(await walk(seed * 7919, true)));
    expect(errors).toEqual([]);
  }, 60_000);
});
