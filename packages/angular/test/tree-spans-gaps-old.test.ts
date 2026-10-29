// The owner's « arbre » screen through `<dz-grid [features]>` (1.1.0 steps 14–15, the architect's check): three
// tables in one tree, each root always open (`tree({ fixedOpen })`); a « Rubrique » column merging consecutive siblings
// of one value (`spans()`); a gap before each table but the first (`rowGaps({ before: roots })`); the fill along the row
// only (`fill(blocks, { along: 'row' })`); the value flash held 3 s then faded 1 s (`motion({ effects: { flash } })`,
// real GSAP, matchMedia stubbed, GSAP's time moved by hand). `[(expanded)]` never closes a fixed root. Expectations by hand.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { gsap } from 'gsap';
import { dataKey, type ClientModel, type ColumnDef, type GridEvent, type RowKey } from '@dzgrid/core';
import type { GridFeature, GridMessages } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { spans } from '@dzgrid/dom/spans';
import { rowGaps, roots } from '@dzgrid/dom/row-gaps';
import { edit } from '@dzgrid/dom/edit';
import { range } from '@dzgrid/dom/range';
import { fill } from '@dzgrid/dom/fill';
import { motion, type Motion } from '@dzgrid/dom/motion-gsap';
import { EN_TREE } from '@dzgrid/dom/locales/en-tree';
import { EN_RANGE } from '@dzgrid/dom/locales/en-range';
import { EN_FILL } from '@dzgrid/dom/locales/en-fill';
import { DZG_ENV, DzGrid, DzgController } from '@dzgrid/angular';
import { fakeEnv } from './support';
import { EMSG } from './support-edit';

type B = { id: string; parent: string | null; label: string; group: string; q1: number | null; q2: number | null; table?: boolean };
/**
 * Actif › A1, A2 (« Cash »), A3 (« Stock »); Passif › P1 (« Cash »); Résultat › R1 (« Sales »). The roots' own
 * « Rubrique » is their name, so a merge only ever joins A1 and A2.
 */
const ROWS: B[] = [
  { id: 't0', parent: null, label: 'Actif', group: 'Actif', q1: null, q2: null, table: true },
  { id: 'a1', parent: 't0', label: 'Line A1', group: 'Cash', q1: 10, q2: 1 },
  { id: 'a2', parent: 't0', label: 'Line A2', group: 'Cash', q1: 20, q2: 2 },
  { id: 'a3', parent: 't0', label: 'Line A3', group: 'Stock', q1: 30, q2: 3 },
  { id: 't1', parent: null, label: 'Passif', group: 'Passif', q1: null, q2: null, table: true },
  { id: 'p1', parent: 't1', label: 'Line P1', group: 'Cash', q1: 40, q2: 4 },
  { id: 't2', parent: null, label: 'Résultat', group: 'Résultat', q1: null, q2: null, table: true },
  { id: 'r1', parent: 't2', label: 'Line R1', group: 'Sales', q1: 50, q2: 5 },
];
const COLS: ColumnDef<B, any>[] = [
  { id: 'label', header: 'Label', width: 200 },
  { id: 'group', header: 'Rubrique', width: 120, merge: true },
  { id: 'q1', header: 'Q1', type: 'number', width: 90, editable: true },
  { id: 'q2', header: 'Q2', type: 'number', width: 90, editable: true },
];
const MSG: GridMessages = { ...EMSG, text: { ...EMSG.text, ...EN_TREE.text, ...EN_RANGE.text, ...EN_FILL.text } };
const SHOWN = ['t0', 'a1', 'a2', 'a3', 't1', 'p1', 't2', 'r1'];
const k = (id: string): RowKey => dataKey(id)!;

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features"
    [expanded]="open()" (expandedChange)="open.set($event)" (gridEvent)="all.push($event)" />`,
})
class Host {
  readonly rows = ROWS;
  readonly cols = COLS;
  readonly id = (r: B) => r.id;
  readonly messages = MSG;
  features: GridFeature[] = [];
  readonly open = signal<ReadonlySet<RowKey> | undefined>(undefined);
  readonly all: GridEvent<B>[] = [];
}

// What the page says about reduced motion; GSAP's time, moved by hand.
let reduce = false;
beforeEach(() => {
  reduce = false;
  window.matchMedia = ((q: string) => ({
    get matches() { return q.includes(': reduce') ? reduce : !reduce; },
    media: q, onchange: null, dispatchEvent: () => false,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
  })) as never;
  // jsdom lays nothing out: an element's offset parent is its parent (as in a browser, the layer).
  vi.spyOn(window.HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
    return this.parentElement;
  });
  gsap.ticker.lagSmoothing(1, 0);
});
afterEach(() => {
  document.body.innerHTML = '';
  gsap.globalTimeline.clear();
  gsap.ticker.lagSmoothing(500, 33);
  vi.restoreAllMocks();
});

/** The owner's setup (the planted faults — no `fixedOpen`, no gap rule, no `along`, no hold, no spans — each fail it). */
function mount(o: { open?: ReadonlySet<RowKey> } = {}) {
  // Frames by hand, as in a browser: a change's events arm the motion before the paint (a synchronous paint would not
  // let them).
  const queue: FrameRequestCallback[] = [];
  const raf = { requestAnimationFrame: (cb: FrameRequestCallback) => queue.push(cb), cancelAnimationFrame: () => {} };
  const frame = () => {
    for (let i = 0; i < 5 && queue.length; i++) for (const cb of queue.splice(0)) cb(performance.now());
  };
  TestBed.configureTestingModule({ providers: [{ provide: DZG_ENV, useValue: { geometry: fakeEnv().provider.useValue.geometry, raf } }] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  const blocks = range();
  const m: Motion = motion({ gsap, effects: { flash: { hold: 3000, fade: 1000 } } });
  const isTable = (r: B) => !!r.table;
  host.features = [
    tree<B>({ parentId: (r) => r.parent, fixedOpen: isTable }),
    spans(),
    rowGaps<B>({ before: roots }),
    edit<B>(),
    blocks,
    fill(blocks, { along: 'row' }),
    m,
  ];
  if (o.open) host.open.set(o.open);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  frame();
  const grid = fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<B>;
  const ctl = fixture.debugElement.children[0]!.injector.get(DzgController) as DzgController<B>;
  const el = fixture.nativeElement as HTMLElement;
  const row = (id: string) => [...el.querySelectorAll<HTMLElement>('.dzg-layer .dzg-row')].find((r) => r.querySelector('[data-col="label"]')?.textContent?.includes(ROWS.find((x) => x.id === id)!.label)) ?? null;
  const cell = (id: string, col: string) => row(id)?.querySelector<HTMLElement>(`.dzg-cell[data-col="${col}"]`) ?? null;
  const shown = () => { const d = ctl.kernel()!.rows.displayed; return Array.from({ length: d.count }, (_, i) => String(d.keyAt(i as never)).replace(/^d:\d+:/, '')); };
    const detect = () => (fixture.detectChanges(), frame());
  return { fixture, host, grid, ctl, el, m, row, cell, shown, frame, detect };
}

describe('the arbre setup through <dz-grid [features]>', () => {
  it('the three roots open at once, no toggle, aria-expanded="true"; their lines shown', () => {
    const t = mount();
    expect(t.shown()).toEqual(SHOWN);
    expect(['t0', 't1', 't2'].map((id) => [t.row(id)!.getAttribute('aria-expanded'), t.cell(id, 'label')!.querySelector('.dzg-toggle')])).toEqual([
      ['true', null],
      ['true', null],
      ['true', null],
    ]);
  });

  it('a gap before the second and third roots, none before the first nor any line', () => {
    const t = mount();
    expect(SHOWN.filter((id) => t.row(id)!.hasAttribute('data-gap'))).toEqual(['t1', 't2']);
    expect(t.row('t1')!.style.getPropertyValue('--dzg-gap')).toBe('16px');
  });

  it('the « Rubrique » label merged over the two « Cash » siblings, not across tables', () => {
    const t = mount();
    const merged = [...t.el.querySelectorAll<HTMLElement>('.dzg-layer .dzg-cell[data-col="group"][aria-rowspan]')];
    expect(merged.map((c) => [c.textContent, c.getAttribute('aria-rowspan')])).toEqual([['Cash', '2']]);
  });

  it('[(expanded)] cannot close a fixed root: a set without them leaves the three open', () => {
    const t = mount();
    t.host.open.set(new Set());
    t.detect();
    expect(t.shown()).toEqual(SHOWN);
    expect(['t0', 't1', 't2'].map((id) => t.row(id)!.getAttribute('aria-expanded'))).toEqual(['true', 'true', 'true']);
    // Given at creation too.
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
    const u = mount({ open: new Set() });
    expect(u.shown()).toEqual(SHOWN);
  });

  it('the fill goes along the row only: down is refused, to the end of the row copies Q1', () => {
    const t = mount();
    t.ctl.focusCell(k('a1'), 'q1');
    t.ctl.range()!.set({ anchor: { row: k('a1'), column: 'q1' }, focus: { row: k('a1'), column: 'q1' } });
    expect(t.ctl.fill()!.fill({ row: k('a3'), column: 'q1' })).toBeNull();
    expect(t.ctl.fill()!.fill({ row: k('a3'), column: 'q2' })).toEqual({ filled: 1, refused: 0, readOnly: 0 });
    const edited = t.host.all.filter((e) => e.type === 'cellEdited') as Extract<GridEvent<B>, { type: 'cellEdited' }>[];
    expect(edited.map((e) => [e.column, e.value, e.origin])).toEqual([['q2', 10, 'fill']]);
  });

  it('the flash: full for 3 s, fading in the 4th, gone at 4 s', async () => {
    const t = mount();
    expect(await t.m.load()).toBe(true);
    (t.ctl.kernel()!.rows as unknown as ClientModel<B>).applyTransaction({ update: [{ ...ROWS[5]!, q1: 41 }] });
    t.detect();
    const c = t.cell('p1', 'q1')!;
    expect(c.textContent).toBe('41');
    const t0 = gsap.globalTimeline.time();
    const level = () => Number(c.style.getPropertyValue('--dzg-flash'));
    expect(c.classList.contains('dzg-flash')).toBe(true);
    gsap.globalTimeline.time(t0 + 2.9);
    expect(level()).toBe(1);
    gsap.globalTimeline.time(t0 + 3.5);
    expect(level()).toBeGreaterThan(0);
    expect(level()).toBeLessThan(1);
    gsap.globalTimeline.time(t0 + 4.01);
    expect(c.classList.contains('dzg-flash')).toBe(false);
  });
});
