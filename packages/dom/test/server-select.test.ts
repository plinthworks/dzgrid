import { describe, it, expect, afterEach } from 'vitest';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { sourceRows, type DataRequest, type DataSource } from '@dzgrid/core/server';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import { UPDATE_POLICY } from '../src/update.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';

/** Step 7 in the grid: the header box and Ctrl+A on a server, the announcements, keepOnFilter. */
type R = { id: string; name: string };
let grids: GridInstance<R, any>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const k = (id: string) => dataKey(id)!;

function fake() {
  const calls: { req: DataRequest; ok(v: unknown): void; err(e: unknown): void }[] = [];
  const source: DataSource<R> = {
    fetch: (req) => ({ then(ok: (v: never) => void, err: (e: unknown) => void) { calls.push({ req, ok: ok as never, err }); } }) as never,
  };
  const rows = (ids: string[]) => ids.map((id) => ({ id, name: id }));
  return { source, calls, answer: (ids: string[], more: object = { total: ids.length }) => calls[calls.length - 1]!.ok({ rows: rows(ids), ...more }) };
}

function make(more: object = {}) {
  const box: ViewportBox = { block: 400, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: () => {}, writeScrollInline: () => {} };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const f = fake();
  const columns: ColumnDef<R, any>[] = [{ id: 'name' }];
  const g = createGrid<R>(host, {
    source: sourceRows(f.source), operations: 'server', pagination: { pageSize: 2 }, getRowId: (r: R) => r.id, columns, messages: EN,
    selection: { mode: 'multi', checkbox: true }, onEvent: (e: GridEvent<R>) => events.push(e), ...more,
  } as never, { geometry, sync: true }) as GridInstance<R, any>;
  grids.push(g);
  const headBox = () => host.querySelector<HTMLElement>('.dzg-header [role=checkbox]')!;
  const rowEl = (id: string) => host.querySelector<HTMLElement>(`.dzg-layer > .dzg-row[aria-rowindex="${g.kernel.rows.displayed.indexOf(k(id)) + 2}"]`)!;
  const click = (el: HTMLElement, init: MouseEventInit = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  const tickRow = (id: string) => click(rowEl(id).querySelector<HTMLElement>('.dzg-check')!);
  const live = () => host.querySelector('.dzg-live')!.textContent;
  const checked = () => headBox().getAttribute('aria-checked');
  return { g, host, events, f, headBox, rowEl, click, tickRow, live, checked };
}

describe('the header box on server pages: it speaks for the whole query', () => {
  it('unticked, then ticked by a click (everything-except), then mixed once a row is unticked', () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    expect(t.checked()).toBe('false');
    t.click(t.headBox());
    expect(t.g.kernel.selection).toEqual({ mode: 'exclude', keys: new Set() });
    expect(t.events.filter((e) => e.type === 'selectionChanged').at(-1)).toMatchObject({ source: 'user', count: 6, query: { key: t.g.kernel.query.key } });
    expect(t.checked()).toBe('true');
    t.tickRow('a');
    expect(t.checked()).toBe('mixed');
  });

  it('mixed for rows ticked on another page', () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.tickRow('a');
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    t.f.answer(['c', 'd'], { total: 6 });
    expect(t.checked()).toBe('mixed');
    // A mixed box selects the whole query.
    t.click(t.headBox());
    expect(t.g.kernel.selection.mode).toBe('exclude');
  });

  it('a ticked box clears everything, the keys of other pages too', () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 4 });
    t.tickRow('a');
    t.tickRow('b');
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    t.f.answer(['c', 'd'], { total: 4 });
    t.tickRow('c');
    t.tickRow('d');
    expect(t.checked()).toBe('true');
    expect(t.g.kernel.selection.mode).toBe('include');
    t.click(t.headBox());
    expect(t.g.kernel.selection).toEqual({ mode: 'include', keys: new Set() });
    expect(t.checked()).toBe('false');
  });

  it('Space on the box does what its click does', () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.headBox().focus();
    t.headBox().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(t.g.kernel.selection.mode).toBe('exclude');
  });

  it('Ctrl+A on a server selects the query', () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.api.focusCell(k('a'), 'name');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(t.g.kernel.selection).toEqual({ mode: 'exclude', keys: new Set() });
  });
});

describe('what is said', () => {
  it('a selection the user makes: the count', async () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.tickRow('a');
    await tick();
    expect(t.live()).toBe('1 row selected');
    t.click(t.headBox());
    await tick();
    expect(t.live()).toBe('6 rows selected');
  });

  it('all with an unknown total: all matching rows', async () => {
    const t = make();
    t.f.answer(['a', 'b'], { hasNext: true });
    t.click(t.headBox());
    await tick();
    expect(t.live()).toBe(EN.text['announce.selectedAll']);
  });

  it('a count the data moves is not said', async () => {
    const t = make();
    t.f.answer(['a', 'b'], { hasNext: true });
    t.click(t.headBox());
    await tick();
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    t.f.answer(['a', 'b'], { total: 6 });
    expect(t.events.filter((e) => e.type === 'selectionChanged').at(-1)).toMatchObject({ source: 'data', count: 6 });
    await tick();
    expect(t.live()).toBe(EN.text['announce.selectedAll']);
  });

  it('"all" cleared by a filter change is said, though the user did not touch the selection', async () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.click(t.headBox());
    await tick();
    t.g.kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    await tick();
    expect(t.live()).toBe(EN.text['announce.selectionCleared']);
  });

  it('rows a fetched set drops are said with what is left', async () => {
    const t = make({ operations: { page: 'client' } });
    t.f.answer(['a', 'b', 'c']);
    t.tickRow('a');
    t.tickRow('b');
    await tick();
    expect(t.live()).toBe('2 rows selected');
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    t.f.answer(['a', 'c']);
    await tick();
    expect(t.live()).toBe('1 row still selected');
  });

  it('the same sentence twice in a row is said once', async () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.tickRow('a');
    await tick();
    t.host.querySelector('.dzg-live')!.textContent = '';
    // Another row alone: still one row selected, nothing new to say.
    t.g.kernel.dispatch({ type: 'selection.only', row: k('b') }, 'user');
    await tick();
    expect(t.live()).toBe('');
  });

  it('every bundle has the new sentences, Arabic with its plural forms', () => {
    for (const m of [EN, FR, AR]) {
      for (const key of ['announce.selectedAll', 'announce.selectionCleared', 'announce.selectionReduced'] as const) expect(m.text[key], `${m.locale} ${key}`).toBeDefined();
    }
    expect(Object.keys(AR.text['announce.selectionReduced'] as object).sort()).toEqual(['few', 'many', 'one', 'other', 'two', 'zero']);
  });
});

describe('selection.keepOnFilter (owner decision)', () => {
  it('is live and kept by default', () => {
    expect(UPDATE_POLICY.selection).toBe('live');
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.tickRow('a');
    t.g.kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    expect([...t.g.kernel.selection.keys]).toEqual([k('a')]);
  });

  it('false: a filter change clears the ticked rows, and it is said', async () => {
    const t = make({ selection: { mode: 'multi', checkbox: true, keepOnFilter: false } });
    t.f.answer(['a', 'b'], { total: 6 });
    t.tickRow('a');
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'name', dir: 'desc' }] }, 'user');
    expect(t.g.kernel.selection.keys.size).toBe(1);
    t.g.kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    expect(t.g.kernel.selection.keys.size).toBe(0);
    await tick();
    expect(t.live()).toBe(EN.text['announce.selectionCleared']);
  });

  it('changed live through update', () => {
    const t = make();
    t.f.answer(['a', 'b'], { total: 6 });
    t.g.update({ selection: { mode: 'multi', checkbox: true, keepOnFilter: false } } as never);
    t.tickRow('a');
    t.g.kernel.dispatch({ type: 'quick.set', text: 'x' }, 'user');
    expect(t.g.kernel.selection.keys.size).toBe(0);
    t.g.update({ selection: { mode: 'multi', checkbox: true } } as never);
    t.f.answer(['a', 'b'], { total: 6 });
    t.tickRow('a');
    t.g.kernel.dispatch({ type: 'quick.set', text: 'y' }, 'user');
    expect([...t.g.kernel.selection.keys]).toEqual([k('a')]);
  });
});
