// Templates as parts, the registry's order and part-shadowed (step 22, docs/behaviors/angular-parts.md).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Component, input, signal, type OnDestroy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GridEvent, Problem } from '@dzgrid/core';
import { definePart, type GridFeature, type SlotPart } from '@dzgrid/dom';
import { slots } from '@dzgrid/dom/slots';
import { DzGrid, DzgPart, provideDzGrid, type DzgPartContext } from '@dzgrid/angular';
import { COLUMNS, MESSAGES, ROWS, fakeEnv, life, rowId, type R } from './support';

// Reset before each test: the setup's afterEach destroys the last test's fixture after this file's hooks.
beforeEach(() => life.reset());
afterEach(() => {
  document.body.innerHTML = '';
});

/** Counts the views a template creates. */
@Component({ selector: 't-count', template: `<i class="cnt">{{ c().text }}</i>` })
class Count implements OnDestroy {
  readonly c = input.required<DzgPartContext<'cell'>>();
  constructor() {
    life.made++;
  }
  ngOnDestroy(): void {
    life.gone++;
  }
}

@Component({
  selector: 't-host',
  imports: [DzGrid, DzgPart, Count],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" (gridEvent)="all.push($event)">
    @if (withTemplate()) {
      <ng-template dzgPart="status" let-c>
        <button type="button" class="tpl" (click)="c.emit('pick', c.key)">{{ c.text }}</button><t-count [c]="c" />
      </ng-template>
    }
    <ng-template dzgPart="hd" slot="header" let-h><span class="hd">{{ h.label }}:{{ h.sortIndex ?? '-' }}</span></ng-template>
    <ng-template dzgPart="alias" let-c="cell"><b class="alias">{{ c.value }}</b></ng-template>
  </dz-grid>`,
})
class Host {
  readonly rows = ROWS;
  readonly columns = [
    { id: 'name', header: 'Name', ui: { header: 'hd' } },
    { id: 'n', header: 'N', type: 'number' as const, ui: { cell: 'alias' } },
    { id: 's', header: 'Status', ui: { cell: 'status' } },
  ];
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly withTemplate = signal(true);
  features: GridFeature[] = [slots()];
  readonly all: GridEvent<R>[] = [];
}

const text = (label: string): SlotPart => definePart('cell', { mount: (h, c) => (h.append(`${label}:${c.text}`), {}) }) as SlotPart;

function mount(o: { providers?: unknown[]; features?: GridFeature[] } = {}) {
  const env = fakeEnv();
  TestBed.configureTestingModule({ providers: [env.provider, ...((o.providers ?? []) as never[])] });
  const fixture = TestBed.createComponent(Host);
  if (o.features) fixture.componentInstance.features = o.features;
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const cellOf = (row: number, col = 's') => el.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${row + 2}"] [data-col="${col}"]`)!;
  const shadowed = () => fixture.componentInstance.all.flatMap((e) => (e.type === 'problems' ? e.problems : [])).filter((p: Problem) => p.code === 'part-shadowed');
  return { fixture, el, host: fixture.componentInstance, cellOf, shadowed };
}

describe('a template as a part', () => {
  it('draws the cell with its context, as `let-c` and as `let-c="cell"`', () => {
    const t = mount();
    expect(t.cellOf(3).querySelector('.tpl')!.textContent).toBe('odd');
    expect(t.cellOf(3).querySelector('.cnt')!.textContent).toBe('odd');
    expect(t.cellOf(7, 'n').querySelector('.alias')!.textContent).toBe('7');
  });

  it('narrows the context by its slot: a header template reads the label and the sort', () => {
    const t = mount();
    const hd = t.el.querySelector('.dzg-hcell[data-col="name"] .hd')!;
    expect(hd.textContent).toBe('Name:-');
    // The grid keeps the header's own click-to-sort; the template is told the sort.
    (t.el.querySelector('.dzg-hcell[data-col="name"]') as HTMLElement).click();
    expect(t.el.querySelector('.dzg-hcell[data-col="name"] .hd')!.textContent).toBe('Name:0');
  });

  it('is created once per pooled cell and rebound in place: the same nodes, a new context', () => {
    const t = mount();
    const button = t.cellOf(3).querySelector('.tpl')!;
    const made = life.made;
    t.fixture.componentInstance.all.length = 0;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(t.host.all.filter((e) => e.type === 'cellAction')).toEqual([{ type: 'cellAction', source: 'user', column: 's', key: 'd:2:r3', name: 'pick', detail: 'd:2:r3' }]);
    expect(life.made).toBe(made);
  });

  it('is destroyed with the grid: views made equal views destroyed', () => {
    const t = mount();
    expect(life.made).toBeGreaterThan(0);
    t.fixture.destroy();
    expect(life.gone).toBe(life.made);
    expect(t.el.querySelector('.tpl')).toBeNull();
  });

  it('removed from the content, its cells go back to the next part of that name', () => {
    const t = mount({ providers: [provideDzGrid({ parts: { status: text('provider') } })] });
    expect(t.cellOf(3).textContent).toContain('odd');
    t.host.withTemplate.set(false);
    t.fixture.detectChanges();
    expect(t.cellOf(3).textContent).toBe('provider:odd');
    expect(life.gone).toBe(life.made);
  });
});

describe('the registry’s order and part-shadowed', () => {
  const feature = (): GridFeature => ({ id: 'fake', parts: { status: text('feature'), only: text('feature') }, setup: () => ({ destroy() {} }) });

  it('features < provideDzGrid < [parts] < templates, each shadowed name told once, the hidden layer named', () => {
    const t = mount({ providers: [provideDzGrid({ parts: { status: text('provider'), hd2: text('provider') } })], features: [slots(), feature()] });
    // The template wins.
    expect(t.cellOf(3).querySelector('.tpl')).not.toBeNull();
    expect(t.shadowed()).toEqual([{ code: 'part-shadowed', severity: 'warning', path: 'parts.status', detail: 'provider' }]);
    // Repainting, or a new registry with the same names, tells nothing again.
    t.host.withTemplate.set(false);
    t.fixture.detectChanges();
    expect(t.cellOf(3).textContent).toBe('provider:odd');
    t.host.withTemplate.set(true);
    t.fixture.detectChanges();
    expect(t.shadowed()).toHaveLength(1);
  });

  it('a provider’s part hiding a feature’s is told with detail feature', () => {
    const t = mount({ providers: [provideDzGrid({ parts: { only: text('provider') } })], features: [slots(), feature()] });
    // The template's `status` hides the feature's too.
    expect([...t.shadowed()].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { code: 'part-shadowed', severity: 'warning', path: 'parts.only', detail: 'feature' },
      { code: 'part-shadowed', severity: 'warning', path: 'parts.status', detail: 'feature' },
    ]);
  });

  it('nothing is told when no name is taken twice', () => {
    const t = mount();
    expect(t.shadowed()).toEqual([]);
  });
});
