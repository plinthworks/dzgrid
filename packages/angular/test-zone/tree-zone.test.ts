// Trees and detail panels under zone.js (Phase 4 step 11, docs/phase-4-steps/step11-plan.md): scrolling a
// tree costs no zone turn; a user's toggle comes back in the zone; a grid in a panel is made outside it.
import { describe, it, expect, afterEach } from 'vitest';
import { ChangeDetectionStrategy, Component, NgZone, input, provideZoneChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type ColumnOrGroup, type RowKey } from '@dzgrid/core';
import type { GridFeature } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { detail } from '@dzgrid/dom/detail';
import { EN_TREE } from '@dzgrid/dom/locales/en-tree';
import { EN_DETAIL } from '@dzgrid/dom/locales/en-detail';
import { DzGrid, componentPart, type DzgPartContext } from '@dzgrid/angular';
import { MESSAGES, fakeEnv } from '../test/support';

// The host's counter is a signal: an output can fire during the first check (the model written at creation).

afterEach(() => {
  document.body.innerHTML = '';
});

type N = { id: string; parent: string | null; name: string };
const ROWS: N[] = Array.from({ length: 40 }, (_, i) => [
  { id: `p${i}`, parent: null, name: `parent ${i}` },
  ...Array.from({ length: 10 }, (_, j) => ({ id: `c${i}-${j}`, parent: `p${i}`, name: `child ${i}.${j}` })),
]).flat();
const COLS: ColumnOrGroup<N>[] = [{ id: 'name', header: 'Name', ui: { cell: 'nm' } }, { id: 'id', header: 'Id' }];
const MSG = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_TREE.text, ...EN_DETAIL.text } };
const where = { innerMadeInZone: [] as boolean[], partInZone: [] as boolean[] };

@Component({ selector: 't-nm', changeDetection: ChangeDetectionStrategy.OnPush, template: `<i>{{ cell().text }}</i>` })
class NameCell {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  constructor() {
    where.partInZone.push(NgZone.isInAngularZone());
  }
}

/** A feature that only records where the grid it is set up on was made. */
const probe: GridFeature = { id: 'probe', setup: () => (where.innerMadeInZone.push(NgZone.isInAngularZone()), { destroy() {} }) };

@Component({
  selector: 't-inner',
  imports: [DzGrid],
  template: `<dz-grid [dzgNested]="cell()" [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" />`,
})
class Inner {
  readonly cell = input.required<DzgPartContext<'detail'>>();
  readonly rows = ROWS.slice(0, 5);
  readonly cols = COLS.slice(1);
  readonly id = (r: N) => r.id;
  readonly messages = MSG;
  readonly features = [probe];
}

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<p class="n">{{ count() }}</p><dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [parts]="parts"
    [expanded]="open()" (expandedChange)="open.set($event)" (rowExpanded)="seen()" />`,
})
class Host {
  readonly rows = ROWS;
  readonly cols = COLS;
  readonly id = (r: N) => r.id;
  readonly messages = MSG;
  features: GridFeature[] = [tree<N>({ parentId: (r) => r.parent })];
  readonly parts = { nm: componentPart('cell', NameCell), inner: componentPart('detail', Inner) };
  readonly open = signal<ReadonlySet<RowKey> | undefined>(new Set(ROWS.filter((r) => !r.parent).map((r) => dataKey(r.id)!)));
  readonly count = signal(0);
  inZone: boolean[] = [];
  seen(): void {
    this.inZone.push(NgZone.isInAngularZone());
    this.count.update((n) => n + 1);
  }
}

async function mount(setup: (h: Host) => void = () => {}) {
  const env = fakeEnv();
  TestBed.configureTestingModule({ providers: [provideZoneChangeDetection(), env.provider] });
  const fixture = TestBed.createComponent(Host);
  setup(fixture.componentInstance);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  const zone = TestBed.inject(NgZone);
  let turns = 0;
  zone.onUnstable.subscribe(() => turns++);
  const el = fixture.nativeElement as HTMLElement;
  const viewport = el.querySelector<HTMLElement>('.dzg-viewport')!;
  const scroll = (top: number) => {
    env.box.scrollTop = top;
    viewport.dispatchEvent(new Event('scroll'));
  };
  return { fixture, el, scroll, turns: () => turns };
}

describe('trees under zone.js', () => {
  it('scrolling an open tree adds no zone turn, parts mounted outside the zone', async () => {
    where.partInZone = [];
    const t = await mount();
    const before = t.turns();
    for (let i = 1; i <= 40; i++) t.scroll(i * 9 * 32);
    expect(where.partInZone.length).toBeGreaterThan(0);
    expect(where.partInZone.every((z) => !z)).toBe(true);
    expect(t.turns() - before).toBe(0);
  });

  it('a user toggle comes back in the zone: the output, the model and the host’s view', async () => {
    const t = await mount((h) => h.open.set(new Set()));
    const toggle = t.el.querySelector<HTMLElement>('.dzg-row[aria-rowindex="2"] .dzg-toggle')!;
    const before = t.turns();
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await t.fixture.whenStable();
    expect(t.fixture.componentInstance.inZone).toEqual([true]);
    expect([...t.fixture.componentInstance.open()!]).toEqual([dataKey('p0')]);
    expect(t.el.querySelector('.n')!.textContent).toBe('1');
    // Bounded: the event's turn (and the model's), never one per row painted.
    expect(t.turns() - before).toBeGreaterThan(0);
    expect(t.turns() - before).toBeLessThanOrEqual(3);
  });

  it('a grid in a detail panel is made outside the zone, like the outer one', async () => {
    where.innerMadeInZone = [];
    const t = await mount((h) => {
      h.features = [detail<N>({ part: 'inner', height: 200 })];
      h.open.set(new Set([dataKey('p0')!]));
    });
    expect(t.el.querySelectorAll('.dzg')).toHaveLength(2);
    expect(where.innerMadeInZone).toEqual([false]);
    const before = t.turns();
    for (let i = 1; i <= 20; i++) t.scroll(i * 64);
    expect(t.turns() - before).toBe(0);
  });
});
