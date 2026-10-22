// A random walk on a host with a tree and [(expanded)] (coverage review of phase 4 step 11).
// Host writes (unknown keys, leaves, empty sets), user and API toggles, transactions and setRows with
// rows arriving late, all interleaved; after each step the model and the grid are checked against an
// oracle written from step11-plan.md point 1 and the review's pending keys (docs/behaviors/angular-parts.md):
// keys of rows not held yet open when their rows arrive, unless the user closed an ancestor since the
// host's write. Filters are kept to their own walk below.
import { describe, it, expect, afterEach } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { dataKey, type ClientModel, type ColumnOrGroup, type GridEvent, type GridKernel, type RowKey } from '@dzgrid/core';
import type { GridFeature } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { EN_TREE } from '@dzgrid/dom/locales/en-tree';
import { DzGrid } from '@dzgrid/angular';
import { MESSAGES, fakeEnv } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  TestBed.resetTestingModule();
});

type N = { id: string; parent: string | null; name: string };
const P = 12;
/** Parent i: p{i}, children c{i}-0 (itself a parent of g{i}) and c{i}-1. */
const sub = (i: number): N[] => [
  { id: `p${i}`, parent: null, name: `parent ${i}` },
  { id: `c${i}-0`, parent: `p${i}`, name: `child ${i}.0` },
  { id: `c${i}-1`, parent: `p${i}`, name: `child ${i}.1` },
  { id: `g${i}`, parent: `c${i}-0`, name: `grand ${i}` },
];
const rowsOf = (held: ReadonlySet<number>): N[] => [...held].sort((a, b) => a - b).flatMap(sub);
const MSG = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_TREE.text } };
const COLS: ColumnOrGroup<N>[] = [{ id: 'name', header: 'Name' }];
const k = (id: string): RowKey => dataKey(id)!;
const name = (x: RowKey): string => String(x).replace(/^d:\d+:/, '');
const ids = (s: Iterable<RowKey> | undefined): string[] => [...(s ?? [])].map(name).sort();
/** Keys that can open with these parents held: p{i} and c{i}-0. */
const openable = (held: ReadonlySet<number>, id: string): boolean => {
  const m = /^(?:p|c)(\d+)(?:-0)?$/.exec(id);
  return !!m && held.has(+m[1]!) && (id.startsWith('p') || id.endsWith('-0'));
};

@Component({
  selector: 't-walk',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows()" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features"
    [expanded]="open()" (expandedChange)="changed($event)" (rowExpanded)="fired.push($event)" />`,
})
class Walk {
  readonly rows = signal<N[]>([]);
  readonly cols = COLS;
  readonly id = (r: N) => r.id;
  readonly messages = MSG;
  readonly features: GridFeature[] = [tree<N>({ parentId: (r) => r.parent })];
  readonly open = signal<ReadonlySet<RowKey> | undefined>(undefined);
  readonly changes: ReadonlySet<RowKey>[] = [];
  readonly fired: Extract<GridEvent<N>, { type: 'rowExpanded' }>[] = [];
  changed(s: ReadonlySet<RowKey> | undefined): void {
    this.changes.push(s!);
    this.open.set(s);
  }
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mount(held: ReadonlySet<number>, open?: ReadonlySet<RowKey>) {
  TestBed.configureTestingModule({ providers: [fakeEnv({ block: 4000 }).provider] });
  const fixture = TestBed.createComponent(Walk);
  const host = fixture.componentInstance;
  host.rows.set(rowsOf(held));
  if (open) host.open.set(open);
  fixture.detectChanges();
  const grid = fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<N>;
  return { fixture, host, grid, kernel: grid.controller.kernel()! as GridKernel<N, ClientModel<N>> };
}

/** Runs `steps` random steps; returns the first divergence as a readable trail, or null. */
function walk(seed: number, steps: number): string | null {
  const r = rng(seed);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)]!;
  let held = new Set<number>([0, 1, 2, 3, 4, 5]);
  const t = mount(held);
  // The oracle: what the grid holds open (outside any filter layer) and what the model says.
  let O = new Set<string>();
  let M: Set<string> | null = null;
  /** Keys the user or API closed since the host last wrote. */
  let closedByUser = new Set<string>();
  /** Keys the host named whose rows the grid did not hold (pending), and rows closed since its write. */
  let pend = new Set<string>();
  let shut = new Set<string>();
  const heldRow = (x: string): boolean => {
    const m = /^[pcg](\d+)/.exec(x);
    return !!m && held.has(+m[1]!);
  };
  /** p{i} for c{i}-*, c{i}-0 and p{i} for g{i}. */
  const above = (x: string): string[] => {
    const i = /\d+/.exec(x)?.[0];
    return x.startsWith('c') ? [`p${i}`] : x.startsWith('g') ? [`c${i}-0`, `p${i}`] : [];
  };
  const trail: string[] = [];
  const settle = () => t.fixture.detectChanges();
  const openNow = () => new Set(ids(t.kernel.expansion));
  const sameSet = (a: Iterable<string>, b: Iterable<string>) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const allIds = () => Array.from({ length: P }, (_, i) => sub(i).map((n) => n.id)).flat();
  const dataChange = () => {
    // Rows gone leave; pending keys whose rows arrived open (not under a row closed since), then the model follows.
    O = new Set([...O].filter((x) => openable(held, x)));
    for (const x of [...pend]) {
      if (!heldRow(x)) continue;
      pend.delete(x);
      if (openable(held, x) && !above(x).some((a) => shut.has(a))) O.add(x);
    }
    if (M && !sameSet(M, O)) M = new Set(O);
  };
  let mPrev: Set<string> | null = null;
  for (let s = 0; s < steps; s++) {
    const changesBefore = t.host.changes.length;
    const firedBefore = t.host.fired.length;
    const op = r();
    let label: string;
    let hostWrite = false;
    let expectFired: { source: string; n: number } | null = null;
    if (op < 0.25) {
      // A host write: some held keys, sometimes unknown, late (p10/p11) or leaf keys, sometimes empty.
      const n = r() < 0.15 ? 0 : 1 + Math.floor(r() * 4);
      const pool = [...allIds(), 'zz', 'p10', 'p11'];
      const S = new Set<string>();
      for (let i = 0; i < n; i++) S.add(pick(pool));
      label = `host {${[...S].sort()}}`;
      t.host.open.set(new Set([...S].map(k)));
      settle();
      M = new Set(S);
      O = new Set([...S].filter((x) => openable(held, x)));
      closedByUser = new Set();
      pend = new Set([...S].filter((x) => !heldRow(x)));
      shut = new Set();
      hostWrite = true;
    } else if (op < 0.45 || op < 0.55) {
      // A user (or API) toggle on a row the grid holds.
      const src = op < 0.45 ? 'user' : 'api';
      const cand = [...held].flatMap((i) => [`p${i}`, `c${i}-0`, `c${i}-1`]);
      if (!cand.length) continue;
      const x = pick(cand);
      const to = r() < 0.5;
      label = `${src} ${to ? 'open' : 'close'} ${x}`;
      if (src === 'user') t.kernel.dispatch({ type: 'rows.expand', rows: [k(x)], expanded: to }, 'user');
      else t.grid.controller.dispatch({ type: 'rows.expand', rows: [k(x)], expanded: to });
      settle();
      const real = openable(held, x) && O.has(x) !== to;
      if (real) {
        to ? O.add(x) : O.delete(x);
        if (!to) closedByUser.add(x), shut.add(x);
        else closedByUser.delete(x);
        M = new Set(O);
      }
      expectFired = { source: src, n: real ? 1 : 0 };
    } else if (op < 0.65) {
      // API expandAll / collapse all.
      const to = r() < 0.5;
      label = `api expandAll ${to}`;
      t.grid.controller.dispatch({ type: 'rows.expandAll', expanded: to });
      settle();
      const all = allIds().filter((x) => openable(held, x));
      const before = new Set(O);
      O = to ? new Set(all) : new Set();
      if (!to) for (const x of before) closedByUser.add(x), shut.add(x);
      else closedByUser = new Set();
      if (!sameSet(before, O)) M = new Set(O);
    } else if (op < 0.82) {
      // A transaction: a parent's subtree added (maybe a late one) or removed.
      const i = Math.floor(r() * P);
      if (held.has(i)) {
        label = `tx remove p${i}`;
        t.kernel.rows.applyTransaction!({ remove: sub(i).map((n) => n.id) });
        held = new Set([...held].filter((x) => x !== i));
      } else {
        label = `tx add p${i}`;
        t.kernel.rows.applyTransaction!({ add: sub(i) });
        held = new Set([...held, i]);
      }
      settle();
      dataChange();
    } else {
      // setRows through [rows]: a new random set of parents (rows arriving late, or leaving).
      const next = new Set<number>();
      for (let i = 0; i < P; i++) if (r() < 0.55) next.add(i);
      label = `setRows [${[...next].sort((a, b) => a - b)}]`;
      held = next;
      t.host.rows.set(rowsOf(held));
      settle();
      dataChange();
    }
    trail.push(label);
    const mBefore = mPrev;
    mPrev = M ? new Set(M) : null;
    const where = () => `seed ${seed}, step ${s}: ${trail.slice(-8).join(' ; ')}`;
    const grid = openNow();
    if (!sameSet(grid, O)) return `${where()}\n  grid open ${[...grid].sort()} but expected ${[...O].sort()}`;
    if (M && !sameSet(ids(t.host.open()), M)) return `${where()}\n  model ${ids(t.host.open())} but expected ${[...M].sort()}`;
    if (hostWrite && t.host.changes.length !== changesBefore) return `${where()}\n  the host's own write echoed back`;
    // Nothing told when the model did not change (a data change or a toggle that changed nothing).
    if (!hostWrite && mBefore && M && sameSet(mBefore, M) && t.host.changes.length !== changesBefore) return `${where()}\n  expandedChange with an unchanged set`;
    if (!hostWrite && M && (!mBefore || !sameSet(mBefore, M)) && t.host.changes.length !== changesBefore + 1) return `${where()}\n  ${t.host.changes.length - changesBefore} expandedChange for one change`;
    const fired = t.host.fired.slice(firedBefore);
    if (fired.some((e) => !e.rows.length)) return `${where()}\n  rowExpanded with no rows`;
    if (expectFired && (fired.length !== expectFired.n || fired.some((e) => e.source !== expectFired!.source)))
      return `${where()}\n  rowExpanded ${JSON.stringify(fired.map((e) => [e.source, e.expanded, ids(e.rows)]))}, expected ${expectFired.n} from ${expectFired.source}`;
    for (const x of closedByUser) if (grid.has(x)) return `${where()}\n  ${x} reopened after the user closed it`;
    // Each model value given to the host is a copy, never the grid's live set.
    if (t.host.changes.slice(changesBefore).some((c) => c === t.kernel.expansion)) return `${where()}\n  the live set was handed out`;
  }
  t.fixture.destroy();
  return null;
}

describe('[(expanded)] random walk (no filter)', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
    it(`seed ${seed}: the model and the grid agree after every step`, () => {
      expect(walk(seed, 80)).toBeNull();
    });
  }
});

describe('[(expanded)] under a tree filter', () => {
  it('a host write made under a filter survives a data change made under the same filter', () => {
    const t = mount(new Set([0, 1, 2, 3]), new Set([k('p1')]));
    t.kernel.dispatch({ type: 'quick.set', text: 'child' }, 'api');
    t.fixture.detectChanges();
    t.host.open.set(new Set([k('p2')]));
    t.fixture.detectChanges();
    // Rows arrive while the search is on (an HTTP refresh, a push).
    t.kernel.rows.applyTransaction!({ add: sub(7) });
    t.fixture.detectChanges();
    // The model must still be the host's set: the grid's pre-filter set must not be written over it.
    expect(ids(t.host.open())).toEqual(['p2']);
    expect(t.host.changes).toEqual([]);
    t.kernel.dispatch({ type: 'quick.set', text: '' }, 'api');
    t.fixture.detectChanges();
    expect(ids(t.kernel.expansion)).toEqual(['p2']);
  });
});

describe('[(expanded)] keys of rows that arrive late, in more than one batch', () => {
  it('a key whose row arrives in a second batch still opens (the first batch must not drop it from the model)', () => {
    const t = mount(new Set(), new Set([k('p2'), k('p9')]));
    // First batch: p2 only (a page of an HTTP stream, or rows pushed one by one).
    t.kernel.rows.applyTransaction!({ add: sub(2) });
    t.fixture.detectChanges();
    expect(ids(t.kernel.expansion)).toEqual(['p2']);
    // A pending key is not told back until it applies.
    expect(t.host.changes.map(ids)).toEqual([['p2']]);
    // Second batch: p9.
    t.kernel.rows.applyTransaction!({ add: sub(9) });
    t.fixture.detectChanges();
    expect(ids(t.kernel.expansion)).toEqual(['p2', 'p9']);
    expect(ids(t.host.open())).toEqual(['p2', 'p9']);
    expect(t.host.changes.map(ids)).toEqual([['p2'], ['p2', 'p9']]);
  });

  it('pending keys stay pending until the host writes a new set: then the new set alone', () => {
    const t = mount(new Set(), new Set([k('p2'), k('p9')]));
    t.host.open.set(new Set([k('p3')]));
    t.fixture.detectChanges();
    t.kernel.rows.applyTransaction!({ add: [...sub(2), ...sub(3), ...sub(9)] });
    t.fixture.detectChanges();
    expect(ids(t.kernel.expansion)).toEqual(['p3']);
  });

  it('a row the user closes, then removed and added again, stays closed (it was not pending)', () => {
    const t = mount(new Set([1]), new Set([k('p1')]));
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('p1')], expanded: false }, 'user');
    t.kernel.rows.applyTransaction!({ remove: sub(1).map((n) => n.id) });
    t.kernel.rows.applyTransaction!({ add: sub(1) });
    t.fixture.detectChanges();
    expect(ids(t.kernel.expansion)).toEqual([]);
    expect(ids(t.host.open())).toEqual([]);
  });

  it('the single-batch case (what the step tested) opens both', () => {
    const t = mount(new Set(), new Set([k('p2'), k('p9')]));
    t.host.rows.set(rowsOf(new Set([2, 9])));
    t.fixture.detectChanges();
    expect(ids(t.kernel.expansion)).toEqual(['p2', 'p9']);
    expect(t.host.changes).toEqual([]);
  });
});

/** Filters on and off between host writes and user toggles (no data change while a filter is on: the test above). */
function filterWalk(seed: number, steps: number, hostUnderFilter = true): string | null {
  const r = rng(seed);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)]!;
  const held = new Set<number>([0, 1, 2, 3, 4, 5, 6, 7]);
  const t = mount(held, new Set());
  let M = new Set<string>();
  let filtered = false;
  const trail: string[] = [];
  const settle = () => t.fixture.detectChanges();
  const same = (a: Iterable<string>, b: Iterable<string>) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const cand = [...held].flatMap((i) => [`p${i}`, `c${i}-0`]);
  for (let s = 0; s < steps; s++) {
    const changesBefore = t.host.changes.length;
    const op = r();
    let hostWrite = false;
    if (op < 0.3 && (hostUnderFilter || !filtered)) {
      const S = new Set<string>();
      const n = Math.floor(r() * 4);
      for (let i = 0; i < n; i++) S.add(pick(cand));
      trail.push(`host {${[...S].sort()}}`);
      t.host.open.set(new Set([...S].map(k)));
      settle();
      M = S;
      hostWrite = true;
    } else if (op < 0.6) {
      const x = pick(cand);
      const to = r() < 0.5;
      trail.push(`user ${to ? 'open' : 'close'} ${x}`);
      t.kernel.dispatch({ type: 'rows.expand', rows: [k(x)], expanded: to }, 'user');
      settle();
      // Outside a filter the model follows; under one the toggle belongs to the filter's layer.
      if (!filtered) (to ? M.add(x) : M.delete(x));
    } else {
      filtered = !filtered;
      const text = filtered ? pick(['child 1', 'grand', 'parent 3', 'child']) : '';
      trail.push(`search '${text}'`);
      t.kernel.dispatch({ type: 'quick.set', text }, 'api');
      settle();
    }
    const where = () => `seed ${seed}, step ${s}: ${trail.slice(-8).join(' ; ')}`;
    if (!same(ids(t.host.open()), M)) return `${where()}\n  model ${ids(t.host.open())}, expected ${[...M].sort()}`;
    if (hostWrite && t.host.changes.length !== changesBefore) return `${where()}\n  echo`;
    if (!filtered && !same(ids(t.kernel.expansion), M)) return `${where()}\n  grid ${ids(t.kernel.expansion)}, expected ${[...M].sort()}`;
  }
  return null;
}

describe('[(expanded)] random walk with a filter turned on and off', () => {
  for (const seed of [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]) {
    it(`seed ${seed}, host writes only outside the filter`, () => {
      expect(filterWalk(seed, 60, false)).toBeNull();
    });
  }
  for (const seed of [21, 22, 23, 24, 25, 26, 27, 28, 29, 30]) {
    it(`seed ${seed}, host writes under the filter too`, () => {
      expect(filterWalk(seed, 60)).toBeNull();
    });
  }

  it('a host write under a filter is not reverted by a user toggle under the same filter', () => {
    const t = mount(new Set([0, 1, 2, 3, 4, 5, 6, 7]), new Set([k('p2')]));
    t.kernel.dispatch({ type: 'quick.set', text: 'grand' }, 'api');
    t.fixture.detectChanges();
    t.host.open.set(new Set([k('p5')]));
    t.fixture.detectChanges();
    t.kernel.dispatch({ type: 'rows.expand', rows: [k('c7-0')], expanded: false }, 'user');
    t.fixture.detectChanges();
    // Got: the model goes back to {p2} (the set before the filter), told to the host as a change.
    expect(ids(t.host.open())).toEqual(['p5']);
    t.kernel.dispatch({ type: 'quick.set', text: '' }, 'api');
    t.fixture.detectChanges();
    expect(ids(t.kernel.expansion)).toEqual(['p5']);
  });
});
