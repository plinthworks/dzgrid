// Trees and detail panels from Angular (Phase 4 step 11, docs/phase-4-steps/step11-plan.md points 3, 5;
// docs/behaviors/angular-parts.md « Trees and master/detail »): the features through [features], a detail
// panel as a component or a template, its context, emit, its lifetime; no Angular part in pinned copies.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChangeDetectionStrategy, Component, input, signal, type OnDestroy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { dataKey, detailKey, type ColumnOrGroup, type GridEvent, type RowKey } from '@dzgrid/core';
import type { GridFeature, SlotPart } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { lazyChildren } from '@dzgrid/dom/tree-lazy';
import { detail } from '@dzgrid/dom/detail';
import { EN_TREE } from '@dzgrid/dom/locales/en-tree';
import { EN_DETAIL } from '@dzgrid/dom/locales/en-detail';
import { DzGrid, DzgPart, componentPart, type DzgPartContext } from '@dzgrid/angular';
import { MESSAGES, fakeEnv, scroller } from './support';
import { PanelProbe, panels } from './tree-support';

beforeEach(() => panels.reset());
afterEach(() => {
  document.body.innerHTML = '';
});

type M = { id: string; name: string; parent?: string | null; lazy?: boolean };
const MASTERS: M[] = Array.from({ length: 100 }, (_, i) => ({ id: `m${i}`, name: `master ${i}` }));
const MSG = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_TREE.text, ...EN_DETAIL.text } };
const k = (id: string): RowKey => dataKey(id)!;
const keys = (...ids: string[]): ReadonlySet<RowKey> => new Set(ids.map(k));

/** Counts the template panels' views. */
const tpl = { made: 0, gone: 0 };
@Component({ selector: 't-tcount', template: '' })
class TemplateCount implements OnDestroy {
  constructor() {
    tpl.made++;
  }
  ngOnDestroy(): void {
    tpl.gone++;
  }
}

/** A cell component, to see that pinned copies get none. */
const cells = { made: 0 };
@Component({ selector: 't-tcell', changeDetection: ChangeDetectionStrategy.OnPush, template: `<b>{{ cell().text }}</b>` })
class TreeCell {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  constructor() {
    cells.made++;
  }
}

@Component({
  selector: 't-host',
  imports: [DzGrid, DzgPart, TemplateCount],
  template: `<dz-grid [rows]="rows()" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [parts]="parts"
      [expanded]="open()" (expandedChange)="open.set($event)" (partAction)="actions.push($event)" (gridEvent)="all.push($event)">
      <ng-template dzgPart="tpl" slot="detail" let-c>
        <t-tcount /><span class="tp">{{ c.master }}|{{ c.key }}|{{ c.height }}|{{ c.depth }}|{{ $any(c.row).name }}</span>
        <button type="button" class="tb" (click)="c.emit('pick', c.master)">pick</button>
      </ng-template>
    </dz-grid>`,
})
class Host {
  readonly rows = signal<M[]>(MASTERS);
  cols: ColumnOrGroup<M>[] = [{ id: 'name', header: 'Name' }];
  readonly id = (r: M) => r.id;
  readonly messages = MSG;
  features: GridFeature[] = [detail<M>({ part: 'panel', height: 80 })];
  parts: Record<string, SlotPart> = { panel: componentPart('detail', PanelProbe) };
  readonly open = signal<ReadonlySet<RowKey> | undefined>(undefined);
  readonly actions: Extract<GridEvent<M>, { type: 'partAction' }>[] = [];
  readonly all: GridEvent<M>[] = [];
}

function mount(setup: (h: Host) => void = () => {}) {
  const env = fakeEnv();
  TestBed.configureTestingModule({ providers: [env.provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  setup(host);
  fixture.detectChanges();
  const grid = fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<M>;
  const el = fixture.nativeElement as HTMLElement;
  const live = () => el.querySelectorAll('t-panel').length;
  const write = (s: ReadonlySet<RowKey>) => (host.open.set(s), fixture.detectChanges());
  return { fixture, host, grid, el, live, write, kernel: grid.controller.kernel()!, scroll: scroller(fixture, env.box) };
}

describe('a detail panel as a component (componentPart, named by detail({ part }))', () => {
  it('mounts one per open master shown, with the whole panel context in `cell`', () => {
    const t = mount((h) => h.open.set(keys('m0', 'm2')));
    expect(t.live()).toBe(2);
    const p = panels.seen.find((x) => x.cell().master === k('m2'))!;
    const c = p.cell();
    expect(c.row).toBe(MASTERS[2]);
    expect(c.key).toBe(detailKey(k('m2')));
    expect(c.height).toBe(80);
    expect(c.depth).toBe(2);
    expect(typeof c.leave).toBe('function');
    expect(typeof c.msg).toBe('function');
    expect(c.dir).toBe('ltr');
    // In the panel's content box, inside the detail row's one cell.
    const box = t.el.querySelector(`t-panel`)!.parentElement!;
    expect(box.classList.contains('dzg-dbody')).toBe(true);
    expect(t.el.querySelector('t-panel .pn')!.textContent).toBe('master 0');
  });

  it('emit sends partAction { slot: detail, column: null } as the user, on (partAction)', () => {
    const t = mount((h) => h.open.set(keys('m1')));
    t.el.querySelector<HTMLButtonElement>('t-panel .pb')!.click();
    expect(t.host.actions).toEqual([{ type: 'partAction', source: 'user', slot: 'detail', column: null, name: 'open', detail: k('m1') }]);
    expect(t.host.all.filter((e) => e.type === 'partAction')).toHaveLength(1);
  });

  it('updates in place: new master data reaches the same instance as a new `cell()`', () => {
    const t = mount((h) => h.open.set(keys('m1')));
    const first = panels.seen[0]!;
    const before = first.cell();
    t.host.rows.set(MASTERS.map((r) => (r.id === 'm1' ? { ...r, name: 'renamed' } : r)));
    t.fixture.detectChanges();
    expect(panels.made).toBe(1);
    expect(first.cell()).not.toBe(before);
    expect((first.cell().row as M).name).toBe('renamed');
    expect(t.el.querySelector('t-panel .pn')!.textContent).toBe('renamed');
  });

  it('is destroyed when its master closes, and mounts = destroys when the grid ends', () => {
    const t = mount((h) => h.open.set(keys('m0', 'm1')));
    expect(panels.made).toBe(2);
    t.write(keys('m1'));
    expect(panels.gone).toBe(1);
    expect(t.live()).toBe(1);
    expect(panels.seen[0]!.cell().master).toBe(k('m0'));
    t.fixture.destroy();
    expect(panels.gone).toBe(panels.made);
  });

  it('scrolling through 100 open masters: made − destroyed = the panels in the page, all gone at the end', () => {
    const t = mount((h) => h.open.set(new Set(MASTERS.map((r) => k(r.id)))));
    for (let top = 0; top <= 100 * 112; top += 150) t.scroll(top);
    t.scroll(0);
    expect(panels.made).toBeGreaterThan(20);
    expect(panels.made - panels.gone).toBe(t.live());
    expect(t.live()).toBeGreaterThan(0);
    t.fixture.destroy();
    expect(panels.gone).toBe(panels.made);
  });
});

describe('a detail panel as a template (<ng-template dzgPart slot="detail">)', () => {
  it('has the context, emits, and its views are destroyed with the panels', () => {
    tpl.made = tpl.gone = 0;
    const t = mount((h) => {
      h.features = [detail<M>({ part: 'tpl', height: 60 })];
      h.open.set(keys('m3'));
    });
    expect(t.el.querySelector('.tp')!.textContent).toBe(`${k('m3')}|${detailKey(k('m3'))}|60|2|master 3`);
    t.el.querySelector<HTMLButtonElement>('.tb')!.click();
    expect(t.host.actions.at(-1)).toMatchObject({ slot: 'detail', column: null, name: 'pick', detail: k('m3') });
    expect(tpl.made).toBe(1);
    t.write(new Set());
    expect(tpl.gone).toBe(1);
    expect(t.el.querySelector('.tp')).toBeNull();
  });
});

describe('trees from Angular', () => {
  const TREE: M[] = [
    { id: 'a', name: 'A', parent: null, lazy: true },
    { id: 'b', name: 'B', parent: null },
    ...Array.from({ length: 60 }, (_, i): M => ({ id: `b${i}`, name: `B.${i}`, parent: 'b' })),
  ];

  it('loads lazy children when the model opens their parent', async () => {
    const t = mount((h) => {
      h.rows.set(TREE);
      h.parts = {};
      h.features = [tree<M>({ parentId: (r) => r.parent, lazy: lazyChildren<M>({ has: (r) => !!r.lazy, load: () => Promise.resolve([{ id: 'a1', name: 'A.1', parent: 'a' }]) }) })];
    });
    const names = () => [...t.el.querySelectorAll('.dzg-layer .dzg-row [data-col="name"]')].map((c) => c.textContent);
    expect(names()).toEqual(['A', 'B']);
    t.write(keys('a'));
    await new Promise((r) => setTimeout(r, 0));
    t.fixture.detectChanges();
    expect(names()).toEqual(['A', 'A.1', 'B']);
  });

  it('pinned parent copies are text only: no Angular part is made for them', () => {
    cells.made = 0;
    const t = mount((h) => {
      h.rows.set(TREE);
      h.cols = [{ id: 'name', header: 'Name', ui: { cell: 'tc' } }];
      h.parts = { tc: componentPart('cell', TreeCell) };
      h.features = [tree<M>({ parentId: (r) => r.parent })];
      h.open.set(keys('b'));
    });
    t.scroll(10 * 32 + 5);
    const copies = [...t.el.querySelectorAll<HTMLElement>('.dzg-sticky > .dzg-row')];
    expect(copies.length).toBe(1);
    expect(copies[0]!.textContent).toContain('B');
    expect(t.el.querySelectorAll('.dzg-sticky t-tcell')).toHaveLength(0);
    // Every component made sits in a real row (pooled rows included): none went to a copy.
    expect(cells.made).toBe(t.el.querySelectorAll('.dzg-layer t-tcell').length);
  });
});
