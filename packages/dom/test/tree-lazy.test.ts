import { afterEach, describe, expect, it } from 'vitest';
import { dataKey, type RowKey } from '@dzgrid/core';
import { sourceRows, type ChildRequest } from '@dzgrid/core/server';
import { lazyChildren } from '../src/tree-lazy.js';
import { cleanup, click, k, tmake, type T } from './support-tree.js';

/**
 * Lazy children on screen (Phase 4 step 7, docs/behaviors/tree-lazy.md): the loading row, the error
 * row and its Retry (pointer and Enter), the announcements in English, French and Arabic, the focus
 * through the replacement, a server's children.
 */
afterEach(cleanup);

const lk = (id: string): RowKey => `l:${k(id)}` as RowKey;
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
/** S0 has its children; S1 and S2 have children not loaded yet. */
const ROWS: (T & { lazy?: boolean })[] = [
  { id: 'S0', parent: null, name: 'Service 0', n: 0 },
  { id: 'P1', parent: 'S0', name: 'Patient 1', n: 1 },
  { id: 'S1', parent: null, name: 'Service 1', n: 5, lazy: true },
  { id: 'S2', parent: null, name: 'Service 2', n: 7, lazy: true },
];
const kids = (p: string, n = 2): T[] => Array.from({ length: n }, (_, i) => ({ id: `${p}-${i}`, parent: p, name: `Child ${p}.${i}`, n: 10 + i }));

interface Load { row: T; signal: AbortSignal; resolve(v: unknown): void; reject(e: unknown): void }
function lazyGrid(o: Parameters<typeof tmake>[0] & { noLoad?: boolean } = {}) {
  const loads: Load[] = [];
  const lazy = lazyChildren<T>({
    has: (r) => !!(r as { lazy?: boolean }).lazy,
    ...(!o.noLoad && { load: (row: T, { signal }: { signal: unknown }) => new Promise<readonly T[]>((resolve, reject) => loads.push({ row, signal: signal as AbortSignal, resolve: resolve as never, reject })) }),
  });
  const t = tmake({ rows: ROWS, ...o, tree: { lazy, ...o.tree } });
  const lrow = (id: string) => [...t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => t.ctx.rowRenderer.keyOf(r) === lk(id)) ?? null;
  const label = (id: string) => lrow(id)?.querySelector<HTMLElement>('.dzg-cell[data-col="name"] .dzg-label') ?? null;
  return { ...t, loads, lrow, label, retry: (id: string) => lrow(id)?.querySelector<HTMLButtonElement>('.dzg-retry') ?? null };
}
const bytes = (s: string) => [...new TextEncoder().encode(s)];
const fromCodes = (cs: number[]) => String.fromCodePoint(...cs);

describe('a declared parent on screen', () => {
  it('shows a closed toggle (not a leaf), aria-expanded false', () => {
    const t = lazyGrid();
    expect(t.toggle('S1')!.hasAttribute('data-leaf')).toBe(false);
    expect(t.row('S1')!.getAttribute('aria-expanded')).toBe('false');
    expect(t.toggle('P1')).toBeNull();
  });

  it('opened by a click on the toggle: the loading row, busy, level 2, 1 of unknown, « Loading… », no box; said « Loading »', () => {
    const t = lazyGrid({ settings: { selection: { mode: 'multi', checkbox: true } } });
    click(t.toggle('S1')!);
    expect(t.loads.map((l) => l.row.id)).toEqual(['S1']);
    expect(t.loads[0]!.signal).toBeInstanceOf(AbortSignal);
    const r = t.lrow('S1')!;
    expect(r).not.toBeNull();
    expect(r.getAttribute('data-kind')).toBe('loading');
    expect(r.getAttribute('aria-busy')).toBe('true');
    expect([r.getAttribute('aria-level'), r.getAttribute('aria-posinset'), r.getAttribute('aria-setsize')]).toEqual(['2', '1', '-1']);
    expect(r.hasAttribute('aria-expanded')).toBe(false);
    expect(r.hasAttribute('aria-selected')).toBe(false);
    expect(t.label('S1')!.textContent).toBe('Loading…');
    expect(r.querySelector('.dzg-check .dzg-box')?.hasAttribute('hidden')).toBe(true);
    expect(t.row('S1')!.getAttribute('aria-expanded')).toBe('true');
    expect(t.said()).toEqual(['Loading']);
  });

  it('the answer replaces the loading row with the children; said « Service 1 expanded, 2 rows »; aria-busy gone from the pooled row', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.loads[0]!.resolve(kids('S1'));
    await flush();
    expect(t.lrow('S1')).toBeNull();
    expect(t.shown()).toEqual(['S0', 'S1', 'S1-0', 'S1-1', 'S2']);
    expect(t.host.querySelectorAll('.dzg-row[aria-busy]').length).toBe(0);
    expect(t.host.querySelectorAll('.dzg-row[data-kind]').length).toBe(0);
    expect(t.said()).toEqual(['Loading', 'Service 1 expanded, 2 rows']);
    expect(t.cell('S1-0')!.querySelector('.dzg-label')).toBeNull();
  });

  it('a failure: the error text and a Retry button (not a tab stop), no longer busy; said « Loading failed »', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.loads[0]!.reject(new Error('503'));
    await flush();
    const r = t.lrow('S1')!;
    expect(r.hasAttribute('aria-busy')).toBe(false);
    const b = t.retry('S1')!;
    expect(b.type).toBe('button');
    expect(b.tabIndex).toBe(-1);
    expect(b.textContent).toBe('Retry');
    expect(t.label('S1')!.textContent).toBe('The data could not be loaded Retry');
    expect(t.said()).toEqual(['Loading', 'Loading failed']);
  });

  it('Retry by the pointer asks again, the row loading again, said; no row click, no selection, the focus on the row', async () => {
    const t = lazyGrid({ settings: { selection: { mode: 'multi' } } });
    t.expand(['S1'], true, 'user');
    t.loads[0]!.reject(new Error('503'));
    await flush();
    const before = t.events.length;
    click(t.retry('S1')!);
    expect(t.loads.length).toBe(2);
    expect(t.label('S1')!.textContent).toBe('Loading…');
    expect(t.lrow('S1')!.getAttribute('aria-busy')).toBe('true');
    expect(t.said().at(-1)).toBe('Loading');
    expect(t.events.slice(before).filter((e) => e.type === 'rowClicked' || e.type === 'cellClicked' || e.type === 'selectionChanged')).toEqual([]);
    expect(t.where()).toBe(`${lk('S1')}/name`);
  });

  it('Retry by Enter on the error row; Enter elsewhere keeps its meaning', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.loads[0]!.reject(new Error('503'));
    await flush();
    t.g.api.focusCell(lk('S1'), 'n');
    expect(t.press('Enter')).toBe(false);
    expect(t.loads.length).toBe(2);
    expect(t.label('S1')!.textContent).toBe('Loading…');
    // Enter again while loading: nothing more.
    t.press('Enter');
    expect(t.loads.length).toBe(2);
  });

  it('closing the parent while loading aborts the host\'s signal', () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.expand(['S1'], false, 'user');
    expect(t.loads[0]!.signal.aborted).toBe(true);
    expect(t.lrow('S1')).toBeNull();
  });

  it('destroying the grid aborts the loads running', () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.g.destroy();
    expect(t.loads[0]!.signal.aborted).toBe(true);
  });
});

describe('keys and the focus', () => {
  it('→ opens a declared parent (it has children, not known yet); ← on the loading row goes to the parent', () => {
    const t = lazyGrid();
    t.focus('S1');
    t.press('ArrowRight');
    expect(t.loads.length).toBe(1);
    expect(t.row('S1')!.getAttribute('aria-expanded')).toBe('true');
    t.press('ArrowDown');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: lk('S1'), column: 'name' });
    t.press('ArrowLeft');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('S1'), column: 'name' });
    expect(t.where()).toBe('S1/name');
  });

  it('a focus on the loading row moves, in the DOM, to the first child when they arrive', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.g.api.focusCell(lk('S1'), 'name');
    expect(t.lrow('S1')!.contains(document.activeElement)).toBe(true);
    t.loads[0]!.resolve(kids('S1'));
    await flush();
    expect(t.where()).toBe('S1-0/name');
  });

  it('a focus on the loading row stays on it when it fails, then goes to the parent when it closes', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.g.api.focusCell(lk('S1'), 'name');
    t.loads[0]!.reject('x');
    await flush();
    expect(t.lrow('S1')!.contains(document.activeElement)).toBe(true);
    t.expand(['S1'], false, 'user');
    expect(t.where()).toBe('S1/name');
  });
});

describe('words in French and Arabic', () => {
  it('French: « Chargement… », the error, « Réessayer »; said « Chargement », « Service 1 développé, 2 lignes », « Échec du chargement »', async () => {
    const t = lazyGrid({ lang: 'fr' });
    t.expand(['S1'], true, 'user');
    expect(t.label('S1')!.textContent).toBe('Chargement…');
    t.loads[0]!.resolve(kids('S1'));
    await flush();
    t.expand(['S2'], true, 'user');
    t.loads[1]!.reject('x');
    await flush();
    expect(t.label('S2')!.textContent).toBe('Les données n’ont pas pu être chargées Réessayer');
    expect(t.said()).toEqual(['Chargement', 'Service 1 développé, 2 lignes', 'Chargement', 'Échec du chargement']);
  });

  it('Arabic, right to left: the texts and what is said, byte for byte', async () => {
    const t = lazyGrid({ lang: 'ar' });
    t.expand(['S1'], true, 'user');
    const loading = fromCodes([0x62c, 0x627, 0x631, 0x20, 0x627, 0x644, 0x62a, 0x62d, 0x645, 0x64a, 0x644, 0x2026]);
    expect(bytes(t.label('S1')!.textContent!)).toEqual(bytes(loading));
    expect(bytes(t.label('S1')!.textContent!).length).toBe(24);
    t.loads[0]!.reject('x');
    await flush();
    const error = fromCodes([0x62a, 0x639, 0x630, 0x631, 0x20, 0x62a, 0x62d, 0x645, 0x64a, 0x644, 0x20, 0x627, 0x644, 0x628, 0x64a, 0x627, 0x646, 0x627, 0x62a]);
    const retry = fromCodes([0x625, 0x639, 0x627, 0x62f, 0x629, 0x20, 0x627, 0x644, 0x645, 0x62d, 0x627, 0x648, 0x644, 0x629]);
    expect(bytes(t.retry('S1')!.textContent!)).toEqual(bytes(retry));
    expect(bytes(t.label('S1')!.textContent!)).toEqual(bytes(`${error} ${retry}`));
    const said = t.said();
    expect(said.map(bytes)).toEqual([
      bytes(fromCodes([0x62c, 0x627, 0x631, 0x20, 0x627, 0x644, 0x62a, 0x62d, 0x645, 0x64a, 0x644])),
      bytes(fromCodes([0x641, 0x634, 0x644, 0x20, 0x627, 0x644, 0x62a, 0x62d, 0x645, 0x64a, 0x644])),
    ]);
    t.retry('S1')!.click();
    t.loads[1]!.resolve(kids('S1'));
    await flush();
    expect(t.said().at(-1)).toBe('تم توسيع Service 1، صفان (2)');
    expect(t.host.querySelector('.dzg')!.getAttribute('dir')).toBe('rtl');
  });
});

describe('shapes and sources', () => {
  it('nested arrays with lazy: refused (unsupported-combination, tree.lazy), the tree shown without lazy loading', () => {
    type N = T & { kids?: N[] };
    const lazy = lazyChildren<N>({ has: () => true, load: () => [] });
    const t = tmake({ rows: [{ id: 'A', parent: null, name: 'A', n: 0, kids: [{ id: 'A1', parent: null, name: 'A1', n: 1 }] }] as never, tree: { parentId: undefined as never, children: (r: N) => r.kids, lazy } as never });
    const problems = t.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string }[] }).problems);
    expect(problems).toContainEqual(expect.objectContaining({ code: 'unsupported-combination', path: 'tree.lazy' }));
    expect(t.shown()).toEqual(['A']);
  });

  it('no loader and no server children: missing-feature told; opening shows the error row', async () => {
    const t = lazyGrid({ noLoad: true });
    const problems = t.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string }[] }).problems);
    expect(problems).toContainEqual(expect.objectContaining({ code: 'missing-feature', path: 'tree.lazy' }));
    t.expand(['S1'], true, 'user');
    await flush();
    expect(t.retry('S1')).not.toBeNull();
  });

  it('a server tree: no unsupported-combination; the children asked through the source, drawn when they come', async () => {
    const asked: ChildRequest<T>[] = [];
    const answers: ((v: unknown) => void)[] = [];
    const source = sourceRows<T>({
      fetch: () => ({ rows: ROWS.filter((r) => !r.parent), total: 3 }),
      children: (req) => new Promise((ok) => (asked.push(req), answers.push(ok as never))),
    });
    const lazy = lazyChildren<T>({ has: (r) => !!(r as { lazy?: boolean }).lazy });
    const t = tmake({ rows: [], tree: { lazy }, settings: { rows: undefined, source } as never });
    await flush();
    const problems = t.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string }[] }).problems);
    // (Server pages without the pagination feature are told: not this test's.)
    expect(problems.filter((p) => p.code === 'unsupported-combination' || p.path === 'tree.lazy')).toEqual([]);
    expect(t.shown()).toEqual(['S0', 'S1', 'S2']);
    click(t.toggle('S1')!);
    expect(asked.map((r) => r.id)).toEqual(['S1']);
    expect(asked[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(t.host.querySelector('.dzg-row[data-kind="loading"] .dzg-label')!.textContent).toBe('Loading…');
    answers[0]!(kids('S1'));
    await flush();
    expect(t.shown()).toEqual(['S0', 'S1', 'S1-0', 'S1-1', 'S2']);
    expect(t.said()).toEqual(['Loading', 'Service 1 expanded, 2 rows']);
    expect(dataKey('S1-0')).toBe(t.g.kernel.rows.displayed.keyAt(t.g.kernel.rows.displayed.index(2)!));
  });
});
