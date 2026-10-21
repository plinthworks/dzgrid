import { afterEach, describe, expect, it } from 'vitest';
import { makeQuery, type RowKey } from '@dzgrid/core';
import { sourceRows } from '@dzgrid/core/server';
import { lazyChildren } from '../src/tree-lazy.js';
import { pagination } from '../src/pagination.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { BUNDLES, cleanup, click, k, tmake, type T } from './support-tree.js';

/**
 * Lazy children on screen: what the step-7 DOM tests leave out (coverage review of 1b23ee0).
 * Each test names the mutant it kills (see the review report), or is an `it.fails` repro.
 */
afterEach(cleanup);

const lk = (id: string): RowKey => `l:${k(id)}` as RowKey;
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
type L = T & { lazy?: boolean };
const ROWS: L[] = [
  { id: 'S0', parent: null, name: 'Service 0', n: 0 },
  { id: 'P1', parent: 'S0', name: 'Patient 1', n: 1 },
  { id: 'S1', parent: null, name: 'Service 1', n: 5, lazy: true },
  { id: 'S2', parent: null, name: 'Service 2', n: 7, lazy: true },
];
const kids = (p: string, n = 2, lazy = false): L[] => Array.from({ length: n }, (_, i) => ({ id: `${p}-${i}`, parent: p, name: `Child ${p}.${i}`, n: 10 + i, ...(lazy && { lazy: true }) }));

interface Load { row: T; signal: AbortSignal; resolve(v: unknown): void; reject(e: unknown): void }
function lazyGrid(o: Parameters<typeof tmake>[0] = {}) {
  const loads: Load[] = [];
  const lazy = lazyChildren<T>({
    has: (r) => !!(r as L).lazy,
    load: (row, { signal }) => new Promise<readonly T[]>((resolve, reject) => loads.push({ row, signal: signal as AbortSignal, resolve: resolve as never, reject })),
  });
  const t = tmake({ rows: ROWS, ...o, tree: { lazy, ...o.tree } });
  const lrow = (id: string) => [...t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => t.ctx.rowRenderer.keyOf(r) === lk(id)) ?? null;
  return { ...t, loads, lrow, retry: (id: string) => lrow(id)?.querySelector<HTMLButtonElement>('.dzg-retry') ?? null };
}

describe('Retry by the keyboard', () => {
  it('Shift+Enter on the error row does not retry (M12)', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.loads[0]!.reject('x');
    await flush();
    t.g.api.focusCell(lk('S1'), 'name');
    t.press('Enter', { shiftKey: true });
    t.press('Enter', { ctrlKey: true });
    expect(t.loads.length).toBe(1);
    expect(t.retry('S1')).not.toBeNull();
  });

  it('Enter on a row still loading is not taken: nothing said, the grid reads it (M13)', () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.g.api.focusCell(lk('S1'), 'name');
    const said = t.said().length;
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    t.active().dispatchEvent(ev);
    expect(t.said().slice(said)).toEqual([]);
    expect(t.loads.length).toBe(1);
  });

  it('two error rows: Retry on the second asks for the second only; the first keeps its button', async () => {
    const t = lazyGrid();
    t.expand(['S1', 'S2'], true, 'user');
    t.loads[0]!.reject('x');
    t.loads[1]!.reject('y');
    await flush();
    click(t.retry('S2')!);
    expect(t.loads.map((l) => l.row.id)).toEqual(['S1', 'S2', 'S2']);
    expect(t.retry('S1')).not.toBeNull();
    expect(t.retry('S2')).toBeNull();
  });

  it('a retry that fails again: the focus stays on the error row; said once per attempt', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.g.api.focusCell(lk('S1'), 'n');
    t.loads[0]!.reject('x');
    await flush();
    t.press('Enter');
    t.loads[1]!.reject('x');
    await flush();
    expect(t.where()).toBe(`${lk('S1')}/n`);
    expect(t.said()).toEqual(['Loading', 'Loading failed', 'Loading', 'Loading failed']);
    t.press('Enter');
    t.loads[2]!.resolve(kids('S1'));
    await flush();
    expect(t.where()).toBe('S1-0/n');
  });
});

describe('the focus on the loading row when it goes', () => {
  it('an empty answer: the focus goes to the parent, now a leaf', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.g.api.focusCell(lk('S1'), 'name');
    t.loads[0]!.resolve([]);
    await flush();
    expect(t.where()).toBe('S1/name');
    expect(t.row('S1')!.hasAttribute('aria-expanded')).toBe(false);
  });

  it('children all filtered out: the focus goes to the parent', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.g.api.focusCell(lk('S1'), 'name');
    t.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { n: { type: 'number', op: 'lt', value: 9 } } }) }, 'user');
    t.loads[0]!.resolve(kids('S1'));
    await flush();
    expect(t.where()).toBe('S1/name');
  });

  it('an ancestor closed over a nested loading row: the focus goes to the ancestor, the load aborted', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.loads[0]!.resolve(kids('S1', 2, true));
    await flush();
    t.expand(['S1-0'], true, 'user');
    t.g.api.focusCell(lk('S1-0'), 'name');
    t.expand(['S1'], false, 'user');
    expect(t.where()).toBe('S1/name');
    expect(t.loads[1]!.signal.aborted).toBe(true);
  });
});

describe('pooled rows', () => {
  it('scrolling through loading, error and data rows: each element drawn for what it shows now (M17)', async () => {
    const rows: L[] = Array.from({ length: 60 }, (_, i) => ({ id: `R${i}`, parent: null, name: `Root ${i}`, n: i, lazy: true }));
    const t = lazyGrid({ rows, block: 200 });
    for (let i = 0; i < 60; i += 2) t.expand([`R${i}`], true, 'user');
    for (let i = 0; i < t.loads.length; i += 3) t.loads[i]!.reject('x');
    await flush();
    // Retry the first error row: its pooled element turns back into a loading row in place.
    click(t.retry('R0')!);
    const bad = (): string[] => {
      const out: string[] = [];
      const d = t.g.kernel.rows.displayed;
      for (const r of t.host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')) {
        const key = t.ctx.rowRenderer.keyOf(r);
        const i = key ? d.indexOf(key) : -1;
        if (i < 0) continue;
        const node = d.nodeAt(i as never) as { kind: string; failed?: boolean };
        const busy = r.getAttribute('aria-busy') === 'true';
        const button = !!r.querySelector('.dzg-retry');
        const label = r.querySelector('.dzg-cell[data-col="name"] .dzg-label')?.textContent ?? null;
        if (node.kind === 'loading') {
          const want = node.failed ? 'The data could not be loaded Retry' : 'Loading…';
          if (busy === !!node.failed || button !== !!node.failed || label !== want || r.getAttribute('data-kind') !== 'loading') out.push(`${key}: ${busy} ${button} ${label}`);
        } else if (busy || button || label !== null || r.hasAttribute('data-kind')) out.push(`${key}: data drawn as ${busy} ${button} ${label}`);
      }
      return out;
    };
    expect(bad()).toEqual([]);
    for (const top of [300, 900, 1500, 600, 0, 2000, 40]) {
      t.scroll(top);
      expect(bad()).toEqual([]);
    }
    for (let i = 1; i < t.loads.length; i += 3) t.loads[i]!.resolve(kids(t.loads[i]!.row.id, 1));
    await flush();
    for (const top of [0, 500, 1200]) {
      t.scroll(top);
      expect(bad()).toEqual([]);
    }
  });
});

describe('the end, and what is said', () => {
  it('destroyed mid-load: the answer after it throws nothing and says nothing', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    const n = t.said().length;
    t.g.destroy();
    t.loads[0]!.resolve(kids('S1'));
    await flush();
    expect(t.said().slice(n)).toEqual([]);
  });

  // Was a debatable bug (lead decision, tree-lazy.md): an answer of no child makes a leaf (no
  // aria-expanded), yet the grid said « Service 1 expanded, 0 rows ». It says the row's name and the
  // base « No rows » now, joined by the base's own « {header}, {priority} » (no new key).
  it('an empty answer does not say « expanded, 0 rows » for a row that became a leaf: its name, « No rows »', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.loads[0]!.resolve([]);
    await flush();
    expect(t.said().some((s) => /expanded, 0 rows/.test(s))).toBe(false);
    expect(t.said()).toEqual(['Loading', 'Service 1, No rows']);
  });

  it('an empty answer in French and Arabic: the base words, the locale\'s comma', async () => {
    const fr = lazyGrid({ lang: 'fr' });
    fr.expand(['S1'], true, 'user');
    fr.loads[0]!.resolve([]);
    await flush();
    expect(fr.said().at(-1)).toBe('Service 1, Aucune ligne');
    const ar = lazyGrid({ lang: 'ar' });
    ar.expand(['S1'], true, 'user');
    ar.loads[0]!.resolve([]);
    await flush();
    expect(ar.said().at(-1)).toBe(`Service 1${String.fromCodePoint(0x60c)} ${String.fromCodePoint(0x644, 0x627, 0x20, 0x62a, 0x648, 0x62c, 0x62f, 0x20, 0x635, 0x641, 0x648, 0x641)}`);
  });

  // Was a debatable bug (lead decision, tree-lazy.md: only the user's actions are said): openings by
  // the API are not said (tree-view.md), but their load's answer was: « Service 1 expanded, 2 rows »
  // with no « Loading » before it.
  it('a parent opened by the API: its answer is not said either, nor its failure', async () => {
    const t = lazyGrid();
    t.expand(['S1', 'S2'], true, 'api');
    t.loads[0]!.resolve(kids('S1'));
    t.loads[1]!.reject('x');
    await flush();
    expect(t.said()).toEqual([]);
  });

  it('a refresh: the open parents load again, and nothing is said of it', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    expect(t.loads.length).toBe(2);
    t.loads[0]!.resolve(kids('S1'));
    t.loads[1]!.resolve(kids('S1'));
    await flush();
    expect(t.said()).toEqual(['Loading']);
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'user');
    t.loads[2]!.reject('x');
    await flush();
    expect(t.said()).toEqual(['Loading']);
  });

  it('opened by the user, closed and opened again by the API: the second answer is not said', async () => {
    const t = lazyGrid();
    t.expand(['S1'], true, 'user');
    t.expand(['S1'], false, 'api');
    t.expand(['S1'], true, 'api');
    t.loads[1]!.resolve(kids('S1'));
    await flush();
    expect(t.said()).toEqual(['Loading']);
  });
});

describe('the pagination footer over a server tree', () => {
  // Was a bug: the range counted the children and the loading rows (« 11 to 26 » for page 2 of 10
  // roots), and a loading row (never selectable) kept « Select all » hidden on a page all ticked.
  it('the range counts the roots of the page; Select all offered with a loading row shown', async () => {
    const roots: L[] = Array.from({ length: 30 }, (_, i) => ({ id: `R${i}`, parent: null, name: `Root ${i}`, n: i, lazy: true }));
    const answers: ((v: unknown) => void)[] = [];
    const source = sourceRows<T>({
      fetch: (req) => ({ rows: roots.slice(req.page!.offset, req.page!.offset + req.page!.size), total: 30 }),
      children: () => new Promise((ok) => void answers.push(ok as never)),
    }, { paging: 'offset' });
    const lazy = lazyChildren<T>({ has: (r) => !!(r as L).lazy });
    const messages = { locale: BUNDLES.en.locale, text: { ...BUNDLES.en.text, ...EN_PAGINATION.text } };
    const t = tmake({ rows: [], tree: { lazy }, features: [pagination()], settings: { rows: undefined, source, operations: 'server', pagination: { pageSize: 10 }, messages, selection: { mode: 'multi', checkbox: true } } as never });
    await flush();
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'user');
    await flush();
    t.expand(['R10', 'R11'], true, 'user');
    answers[0]!(kids('R10', 2));
    await flush();
    const footer = () => t.host.querySelector<HTMLElement>('.dzg-footer')!;
    expect(t.shown().length).toBe(13);
    expect(footer().querySelector('.dzg-pcount')!.textContent).toBe('11 to 20 of 30');
    // Every data row of the page ticked by hand (a server's Select all is the query's).
    for (const id of t.shown()) if (id && !id.startsWith('l:')) t.g.kernel.dispatch({ type: 'selection.toggle', row: k(id) }, 'user');
    expect(t.g.kernel.selection.keys.size).toBe(12);
    const all = footer().querySelector<HTMLButtonElement>('.dzg-psel button[data-act="all"]')!;
    expect(all.hidden).toBe(false);
  });
});
