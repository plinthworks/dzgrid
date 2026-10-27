// `@dzgrid/dom/state` (Phase 6 step 5, step05-plan §1, §3, §4 « Dom »; docs/behaviors/grid-state.md 4–6, 16–20, density.md 5;
// owner Q-S2, O6, O7, E5-1, E5-3): the `gridState()` feature (`state()`, `setState()`, the `stateChanged` / `stateRestored`
// events), the browser storage helper (at creation: before the first request; later: `persistLocal`) and the address helper.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { ColumnDef, GridEvent, Problem } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import { stateText, type GridState } from '@dzgrid/core/state';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { fromSearchParams, gridState, persistLocal, toSearchParams, type GridStateFeature } from '../src/state.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; name: string; age: number; city: string };
const ROWS: R[] = [
  { id: 'a', name: 'محمد', age: 40, city: 'Oran' },
  { id: 'b', name: 'Élodie', age: 25, city: 'Alger' },
  { id: 'c', name: 'Chems', age: 33, city: 'Oran' },
];
const COLS: ColumnDef<R, any>[] = [{ id: 'name', width: 100 }, { id: 'age', type: 'number' }, { id: 'city' }];
const KEY = 'dzg-test-state';

let grids: GridInstance<R, any>[] = [];
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

function make(more: Record<string, unknown> = {}, feature: GridStateFeature | null = gridState()) {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, { getRowId: (r: R) => r.id, columns: COLS, messages: EN, onEvent: (e: GridEvent<R>) => events.push(e), ...(feature && { features: [feature] }), ...more } as never, { geometry, sync: true }) as GridInstance<R, any>;
  grids.push(g);
  const of = <K extends GridEvent<R>['type']>(type: K) => events.filter((e): e is Extract<GridEvent<R>, { type: K }> => e.type === type);
  return { g, events, of, api: () => feature!.api(g)!, problems: () => of('problems').flatMap((e) => e.problems) };
}

/** A server that counts its requests and answers at once. */
function server() {
  const reqs: DataRequest[] = [];
  const data: DataSource<R> = { fetch: (req) => (reqs.push(req), { rows: ROWS, total: 300 }) };
  return { reqs, source: sourceRows(data) };
}

/** An independent decoder (not the helper's own): base64url → UTF-8 → JSON. */
const decode = (p: URLSearchParams, name = 'grid'): any => {
  const v = p.get(name)!;
  expect(v.startsWith('1.')).toBe(true);
  return JSON.parse(Buffer.from(v.slice(2), 'base64url').toString('utf8'));
};

describe('the feature: state() and setState()', () => {
  it('state() is the core capture with the grid\'s density; api() null without the feature', () => {
    const t = make({ rows: ROWS, density: 'compact' });
    const s = t.api().state();
    expect(s.v).toBe(1);
    expect(s.columns.map((c) => c.id)).toEqual(['name', 'age', 'city']);
    expect(s.density).toBe('compact');
    expect(gridState().api(make({ rows: ROWS }, null).g)).toBeNull();
  });

  it('setState applies, returns what it skipped, says one `stateRestored`, moves no focus and announces nothing (G 6, 16)', () => {
    vi.useFakeTimers();
    const t = make({ rows: ROWS });
    t.g.api.focusCell(t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(1)!), 'age');
    const focus = t.g.kernel.focus;
    const active = document.activeElement;
    const problems = t.api().setState({ v: 1, columns: [{ id: 'gone', pinned: null, order: 0 }, { id: 'city', pinned: 'start', order: 1 }], sort: [{ column: 'age', dir: 'desc' }], density: 'spacious' });
    expect(problems).toEqual([{ code: 'state-column', severity: 'warning', path: 'columns.0', detail: 'gone' }]);
    expect(t.of('stateRestored')).toEqual([{ type: 'stateRestored', source: 'host', problems }]);
    expect(t.g.kernel.query.sort).toEqual([{ column: 'age', dir: 'desc' }]);
    expect(t.g.kernel.columns.layout.start.columns.map((c) => c.id)).toEqual(['city']);
    expect(t.g.kernel.focus).toEqual(focus);
    expect(document.activeElement).toBe(active);
    vi.advanceTimersByTime(1000);
    expect(document.querySelector('.dzg-live')!.textContent).toBe('');
    expect(t.of('stateChanged')).toEqual([]);
  });

  it('a bad version: nothing applied, one `state-version`, the event still says it', () => {
    const t = make({ rows: ROWS });
    const before = stateText(t.api().state());
    expect(t.api().setState({ v: 2, quick: 'x' })).toEqual([{ code: 'state-version', severity: 'error', path: 'v' }]);
    expect(stateText(t.api().state())).toBe(before);
    expect(t.of('stateRestored').length).toBe(1);
  });

  it('density restored before the rows are measured: the row height is the density\'s; a wrong density is `state-field`', () => {
    const t = make({ rows: ROWS });
    const ctx = (t.g as any).context;
    expect(ctx.rowHeight()).toBe(32);
    t.api().setState({ v: 1, density: 'spacious' });
    expect(ctx.settings.density).toBe('spacious');
    expect(ctx.rowHeight()).toBe(40);
    expect(t.g.kernel.rows.displayed.count).toBe(3);
    expect(document.querySelector('.dzg')!.getAttribute('data-density')).toBe('spacious');
    expect(t.api().setState({ v: 1, density: 'huge' })).toEqual([{ code: 'state-field', severity: 'warning', path: 'density' }]);
    expect(t.api().setState({ v: 1, density: 'constructor' })).toEqual([{ code: 'state-field', severity: 'warning', path: 'density' }]);
    expect(ctx.settings.density).toBe('spacious');
  });

  it('a server grid: one request for a restore (E5-1)', () => {
    const s = server();
    const t = make({ source: s.source, pagination: { pageSize: 50 } });
    const n = s.reqs.length;
    t.api().setState({ v: 1, sort: [{ column: 'name', dir: 'asc' }], filter: { city: { type: 'text', op: 'contains', value: 'Or' } }, quick: 'x', page: 2, pageSize: 25 });
    expect(s.reqs.length - n).toBe(1);
    expect(s.reqs.at(-1)!.page).toMatchObject({ index: 2, size: 25 });
  });
});

describe('stateChanged: debounced, once per gesture (G 5)', () => {
  beforeEach(() => void vi.useFakeTimers());

  it('a drag of 20 moves: one event 300 ms after the last, carrying the state', () => {
    const t = make({ rows: ROWS });
    for (let i = 1; i <= 20; i++) t.g.kernel.dispatch({ type: 'column.resize', column: 'name', width: 100 + i * 5, finished: i === 20 }, 'user');
    vi.advanceTimersByTime(299);
    expect(t.of('stateChanged')).toEqual([]);
    vi.advanceTimersByTime(1);
    const ev = t.of('stateChanged');
    expect(ev.length).toBe(1);
    expect(ev[0]!.source).toBe('user');
    expect(ev[0]!.state.columns.find((c) => c.id === 'name')!.width).toBe(200);
    expect(stateText(ev[0]!.state)).toBe(stateText(t.api().state()));
  });

  it('none for the host\'s changes; none for a gesture that comes back to the same state', () => {
    const t = make({ rows: ROWS });
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'age', dir: 'asc' }] }, 'host');
    t.g.update({ density: 'compact' });
    vi.advanceTimersByTime(1000);
    expect(t.of('stateChanged')).toEqual([]);
    // Compared with the last state told (step05-plan §3): on a fresh grid, a gesture back to where it started tells nothing.
    const u = make({ rows: ROWS });
    u.g.kernel.dispatch({ type: 'column.resize', column: 'name', width: 180, finished: false }, 'user');
    u.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'name', width: null }] }, 'user');
    vi.advanceTimersByTime(1000);
    expect(u.of('stateChanged')).toEqual([]);
    t.g.kernel.dispatch({ type: 'column.resize', column: 'name', width: 180, finished: false }, 'user');
    vi.advanceTimersByTime(1000);
    // The user's gesture is told, with the host's changes made before it in the state it carries.
    expect(t.of('stateChanged').map((e) => [e.state.density, e.state.sort])).toEqual([['compact', [{ column: 'age', dir: 'asc' }]]]);
  });

  it('sort, filter, search, page, hidden column: each gesture its event; `debounce` sets the pause', () => {
    const f = gridState({ debounce: 50 });
    const t = make({ rows: ROWS, pagination: { pageSize: 1 } }, f);
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'age', multi: false }, 'user');
    vi.advanceTimersByTime(50);
    t.g.kernel.dispatch({ type: 'quick.set', text: 'o' }, 'user');
    vi.advanceTimersByTime(50);
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    vi.advanceTimersByTime(50);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'city', hidden: true }] }, 'user');
    vi.advanceTimersByTime(50);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'city', filter: { type: 'text', op: 'contains', value: 'O' } }, 'api');
    vi.advanceTimersByTime(50);
    expect(t.of('stateChanged').length).toBe(5);
    expect(t.of('stateChanged').at(-1)!.source).toBe('api');
  });

  it('the density a user picked (the menu\'s `densityChanged`): one event with the density; the application\'s update() none', () => {
    const t = make({ rows: ROWS });
    const ctx = (t.g as any).context;
    ctx.settings = { ...ctx.settings, density: 'spacious' };
    emit(t.g.kernel, { type: 'densityChanged', source: 'user', density: 'spacious' });
    vi.advanceTimersByTime(300);
    expect(t.of('stateChanged').map((e) => e.state.density)).toEqual(['spacious']);
    t.g.update({ density: 'compact' });
    vi.advanceTimersByTime(300);
    expect(t.of('stateChanged').length).toBe(1);
  });

  it('none on setState, nor for what follows from it; destroy() leaves no timer', () => {
    const t = make({ rows: ROWS });
    t.api().setState({ v: 1, sort: [{ column: 'city', dir: 'asc' }], density: 'compact' });
    vi.advanceTimersByTime(1000);
    expect(t.of('stateChanged')).toEqual([]);
    t.g.kernel.dispatch({ type: 'quick.set', text: 'z' }, 'user');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    t.g.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the browser storage (G 17)', () => {
  it('at creation, on a server grid: ONE request, carrying the saved sort, filter, search and page', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, columns: [{ id: 'city', pinned: 'start', order: 0 }], sort: [{ column: 'name', dir: 'desc' }], filter: { city: { type: 'text', op: 'contains', value: 'Or' } }, quick: 'ab', page: 3, pageSize: 25, density: 'spacious' }));
    const s = server();
    const t = make({ source: s.source, pagination: { pageSize: 50 } }, gridState({ persist: { key: KEY } }));
    expect(s.reqs.length).toBe(1);
    expect(s.reqs[0]!.sort).toEqual([{ column: 'name', dir: 'desc' }]);
    expect(s.reqs[0]!.quick).toBe('ab');
    expect(Object.keys(s.reqs[0]!.filter ?? {})).toEqual(['city']);
    expect(s.reqs[0]!.page).toMatchObject({ index: 3, size: 25 });
    expect((t.g as any).context.settings.density).toBe('spacious');
    expect(t.g.kernel.columns.layout.start.columns.map((c) => c.id)).toEqual(['city']);
  });

  it('at creation, nothing saved: the grid as defined, one request', () => {
    const s = server();
    const t = make({ source: s.source }, gridState({ persist: { key: KEY } }));
    expect(s.reqs.length).toBe(1);
    expect(t.problems().filter((p) => p.code.startsWith('state-'))).toEqual([]);
  });

  it('saves after each gesture (the parts named by `include`), and never a cookie nor the history', () => {
    vi.useFakeTimers();
    const cookie = vi.spyOn(document, 'cookie', 'set');
    const push = vi.spyOn(history, 'pushState');
    const replace = vi.spyOn(history, 'replaceState');
    const t = make({ rows: ROWS }, gridState({ persist: { key: KEY, include: ['columns', 'sort'] } }));
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'age', dir: 'asc' }] }, 'user');
    t.g.kernel.dispatch({ type: 'quick.set', text: 'secret' }, 'user');
    vi.advanceTimersByTime(300);
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.sort).toEqual([{ column: 'age', dir: 'asc' }]);
    expect(saved.quick).toBeUndefined();
    expect(Object.keys(saved).sort()).toEqual(['columns', 'sort', 'v']);
    expect(cookie).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ['blocked (the getter throws)', () => vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('SecurityError'); })],
    ['bad JSON', () => localStorage.setItem(KEY, '{"v":1,')],
    ['not an object', () => localStorage.setItem(KEY, '42')],
  ])('storage %s: one `state-storage` warning (no content), the grid as defined', (_, arrange) => {
    arrange();
    const s = server();
    const t = make({ source: s.source }, gridState({ persist: { key: KEY } }));
    expect(s.reqs.length).toBe(1);
    expect(t.problems().filter((p) => p.code.startsWith('state-'))).toEqual([{ code: 'state-storage', severity: 'warning', path: 'storage' }]);
    expect(t.g.kernel.query.key).toBe(t.g.kernel.query.key);
    expect(t.g.kernel.query.sort).toEqual([]);
  });

  it('full storage (quota on save): one `state-storage` warning, however many saves fail', () => {
    vi.useFakeTimers();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    const t = make({ rows: ROWS }, gridState({ persist: { key: KEY } }));
    for (const text of ['a', 'b', 'c']) {
      t.g.kernel.dispatch({ type: 'quick.set', text }, 'user');
      vi.advanceTimersByTime(300);
    }
    expect(t.problems()).toEqual([{ code: 'state-storage', severity: 'warning', path: 'storage' }]);
  });

  it('persistLocal(grid, key) later: restores now (one more request on a server), saves until stop()', () => {
    vi.useFakeTimers();
    localStorage.setItem(KEY, JSON.stringify({ v: 1, sort: [{ column: 'city', dir: 'asc' }] }));
    const s = server();
    const t = make({ source: s.source });
    expect(s.reqs.length).toBe(1);
    const stop = persistLocal(t.g, KEY);
    expect(s.reqs.length).toBe(2);
    expect(s.reqs[1]!.sort).toEqual([{ column: 'city', dir: 'asc' }]);
    t.g.kernel.dispatch({ type: 'quick.set', text: 'q' }, 'user');
    vi.advanceTimersByTime(300);
    expect(JSON.parse(localStorage.getItem(KEY)!).quick).toBe('q');
    stop();
    t.g.kernel.dispatch({ type: 'quick.set', text: 'r' }, 'user');
    vi.advanceTimersByTime(300);
    expect(JSON.parse(localStorage.getItem(KEY)!).quick).toBe('q');
  });

  it('persistLocal on a grid without the feature: `missing-feature`, no throw, a stop() that does nothing', () => {
    const t = make({ rows: ROWS }, null);
    let stop!: () => void;
    expect(() => (stop = persistLocal(t.g, KEY))).not.toThrow();
    expect(t.problems()).toEqual([{ code: 'missing-feature', severity: 'error', path: 'features', detail: 'state' }]);
    expect(() => stop()).not.toThrow();
  });
});

describe('the address (G 18–20, O6, O7, E5-3)', () => {
  const STATE = (more: Partial<GridState> = {}): GridState => ({
    v: 1, columns: [{ id: 'name', width: 120, pinned: 'start', order: 0 }, { id: 'age', hidden: true, pinned: null, order: 1 }], sort: [{ column: 'name', dir: 'asc' }],
    filter: { name: { type: 'text', op: 'contains', value: 'Fatima Benali' } }, quick: 'dossier 4521', page: 2, pageSize: 50, density: 'compact', ...more,
  });

  it('one `grid` parameter, `1.` then base64url; without `include`, no typed filter and no search in it (O6)', () => {
    const { params, problems } = toSearchParams(STATE());
    expect(problems).toEqual([]);
    expect([...params.keys()]).toEqual(['grid']);
    expect(params.get('grid')).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    const j = decode(params);
    expect(j.filter).toBeUndefined();
    expect(j.quick).toBeUndefined();
    expect(j).toMatchObject({ v: 1, sort: [{ column: 'name', dir: 'asc' }], page: 2, pageSize: 50, density: 'compact' });
    expect(j.columns).toHaveLength(2);
    expect(params.toString()).not.toContain('Fatima');
    expect(params.toString()).not.toMatch(/4521/);
  });

  it('`include` opts in, one part or both; garbage or [] includes nothing (plan risk 5)', () => {
    const q = decode(toSearchParams(STATE(), { include: ['quick'] }).params);
    expect(q.quick).toBe('dossier 4521');
    expect(q.filter).toBeUndefined();
    const both = decode(toSearchParams(STATE(), { include: ['filter', 'quick'] }).params);
    expect(both.filter).toEqual(STATE().filter);
    for (const include of [[], 'filter', { filter: true }, null] as never[]) {
      const j = decode(toSearchParams(STATE(), { include }).params);
      expect(j.filter, String(include)).toBeUndefined();
      expect(j.quick, String(include)).toBeUndefined();
    }
  });

  it('same state, same text; keys written in any order give one text; another name', () => {
    const a = toSearchParams(STATE()).params.get('grid');
    const b = toSearchParams(JSON.parse(JSON.stringify(STATE()))).params.get('grid');
    const reordered = Object.fromEntries(Object.entries(STATE()).reverse()) as unknown as GridState;
    expect(b).toBe(a);
    expect(toSearchParams(reordered).params.get('grid')).toBe(a);
    expect(toSearchParams(STATE(), { name: 'g2' }).params.get('g2')).toBe(a);
  });

  it('read back: the state, without filter or search unless they were written; Unicode round trip', () => {
    const p = toSearchParams(STATE({ quick: 'محمد é ü 🙂' }), { include: ['quick'] }).params;
    const r = fromSearchParams(new URLSearchParams(p.toString()), { include: ['quick'] });
    expect(r.problems).toEqual([]);
    expect(r.state!.quick).toBe('محمد é ü 🙂');
    expect(r.state!.filter).toBeUndefined();
    expect(r.state!.columns).toEqual(STATE().columns);
  });

  it('a parameter edited or cut: null and `state-version`; no parameter: null, nothing said', () => {
    const v = toSearchParams(STATE()).params.get('grid')!;
    const bad = [v.slice(0, -7), `2${v.slice(1)}`, v.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')).replace('1.', '1.!'), '1.', 'grid', `1.${Buffer.from('{"v":1').toString('base64url')}`, `1.${Buffer.from('[1]').toString('base64url')}`];
    for (const x of bad) {
      const r = fromSearchParams(new URLSearchParams({ grid: x }));
      expect(r.state, x).toBeNull();
      expect(r.problems, x).toEqual([{ code: 'state-version', severity: 'error', path: 'grid' }]);
    }
    expect(fromSearchParams(new URLSearchParams('a=1'))).toEqual({ state: null, problems: [] });
  });

  it('over 4 KB: the minimum (columns and sort) is written, and the developer told (E5-3); over 4 KB read: refused', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: `colonne numéro ${i}`, width: 100 + i, pinned: null, order: i }));
    const { params, problems } = toSearchParams(STATE({ columns: many, groups: Object.fromEntries(many.map((c) => [c.id, true])) }));
    expect(problems).toEqual([{ code: 'state-field', severity: 'warning', path: 'grid', detail: 'too-large' }]);
    const j = decode(params);
    expect(Object.keys(j).sort()).toEqual(['columns', 'sort', 'v']);
    const huge = `1.${Buffer.from(JSON.stringify({ v: 1, quick: 'x'.repeat(5000) })).toString('base64url')}`;
    expect(fromSearchParams(new URLSearchParams({ grid: huge })).problems).toEqual([{ code: 'state-version', severity: 'error', path: 'grid' }]);
  });

  it('restoring a state read from the address keeps the grid\'s own filters and search (G 19)', () => {
    const t = make({ rows: ROWS });
    t.g.kernel.dispatch({ type: 'quick.set', text: 'Or' }, 'user');
    const { state } = fromSearchParams(toSearchParams(STATE({ columns: [{ id: 'city', pinned: null, order: 0 }] })).params);
    const problems: Problem[] = t.api().setState(state);
    expect(problems).toEqual([]);
    expect(t.g.kernel.query.quick).toBe('Or');
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
  });
});

// The combined review of steps 5–6 (2026-10-27): findings 2, 3, 4 and 7.
describe('review fixes', () => {
  it('2: columns and sort still over 4 KB: the sort alone, and the developer told again', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ id: `une colonne au nom très long, numéro ${i}`, width: 100 + i, pinned: null, order: i }));
    const { params, problems } = toSearchParams({ v: 1, columns: many, sort: [{ column: 'name', dir: 'asc' }], filter: {}, quick: '' });
    expect(problems).toEqual([
      { code: 'state-field', severity: 'warning', path: 'grid', detail: 'too-large' },
      { code: 'state-field', severity: 'warning', path: 'grid', detail: 'sort-only' },
    ]);
    expect(decode(params)).toEqual({ v: 1, sort: [{ column: 'name', dir: 'asc' }] });
    expect(params.get('grid')!.length).toBeLessThan(4096 * 1.4);
  });

  it('3: a density that is not a string (["compact"]) is refused, the density kept', () => {
    const t = make({ rows: ROWS, density: 'comfortable' });
    expect(t.api().setState({ v: 1, density: ['compact'] })).toEqual([{ code: 'state-field', severity: 'warning', path: 'density' }]);
    expect((t.g as any).context.settings.density).toBe('comfortable');
  });

  it('4: a hand-edited address with a filter and a search: both left out unless the application opted in (O6)', () => {
    const edited = `1.${Buffer.from(JSON.stringify({ v: 1, sort: [], filter: { name: { type: 'text', op: 'contains', value: 'Fatima' } }, quick: 'dossier' })).toString('base64url')}`;
    const p = new URLSearchParams({ grid: edited });
    const r = fromSearchParams(p);
    expect(r.problems).toEqual([]);
    expect(r.state).toEqual({ v: 1, sort: [] });
    expect(fromSearchParams(p, { include: ['filter'] }).state).toEqual({ v: 1, sort: [], filter: { name: { type: 'text', op: 'contains', value: 'Fatima' } } });
    expect(fromSearchParams(p, { include: ['filter', 'quick'] }).state).toMatchObject({ quick: 'dossier' });
    // Garbage `include` opts in nothing.
    expect(fromSearchParams(p, { include: 'quick' as never }).state).toEqual({ v: 1, sort: [] });
  });

  it('7: the model\'s hold is never nested by its callers (setState, persistLocal): one request each', () => {
    const s = server();
    const t = make({ source: s.source });
    const rows = (t.g as any).context.rows;
    const own = rows.hold.bind(rows);
    let depth = 0;
    let max = 0;
    let calls = 0;
    rows.hold = (fn: () => void) => own(() => {
      calls++;
      max = Math.max(max, ++depth);
      try {
        fn();
      } finally {
        depth--;
      }
    });
    const n = s.reqs.length;
    t.api().setState({ v: 1, sort: [{ column: 'name', dir: 'desc' }], quick: 'a', page: 1 });
    localStorage.setItem(KEY, JSON.stringify({ v: 1, sort: [{ column: 'age', dir: 'asc' }], quick: 'b' }));
    const stop = persistLocal(t.g, KEY);
    stop();
    expect([calls, max, s.reqs.length - n]).toEqual([2, 1, 2]);
  });
});

