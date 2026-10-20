// Every slot as an Angular component (step 22): header with its filter (the step 21 contract),
// overlay, tooltip, floating, filter popup, footer. docs/behaviors/angular-parts.md, parts.md.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ColumnOrGroup, GridEvent, Json } from '@dzgrid/core';
import type { GridFeature, SlotPart } from '@dzgrid/dom';
import { slots } from '@dzgrid/dom/slots';
import { filters } from '@dzgrid/dom/filters';
import { pagination } from '@dzgrid/dom/pagination';
import { DzGrid, DzgController, componentPart, type DzgPartContext } from '@dzgrid/angular';
import { MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const text = (v: string) => ({ type: 'text', op: 'contains', value: v }) as const;
const valueOf = (s: Json | null | undefined): string => ((s as { value?: string } | null)?.value) ?? '';

/** The application's header: its title, its own box driving the column's filter, a menu button. */
@Component({
  selector: 't-head',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="ht">{{ cell().label }}</span>
    @if (cell().filter; as f) {
      <input class="hf" [attr.aria-label]="'Search ' + cell().label" [value]="value(f.state)" (input)="type(f, $event)" />
    }
    <button type="button" class="hm" (click)="cell().emit('menu', cell().label)">⋮</button>`,
})
class Head {
  readonly cell = input.required<DzgPartContext<'header'>>();
  value = valueOf;
  type(f: NonNullable<DzgPartContext<'header'>['filter']>, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    f.set(v ? text(v) : null, { commit: 'now' });
  }
}

@Component({
  selector: 't-overlay',
  template: `<p class="ov">{{ cell().phase }}</p><button type="button" class="ob" (click)="cell().emit('help')">?</button>`,
})
class Overlay {
  readonly cell = input.required<DzgPartContext<'overlay'>>();
}

@Component({ selector: 't-tip', template: `<b class="tip">{{ cell().text }} [{{ cell().value }}]</b>` })
class Tip {
  readonly cell = input.required<DzgPartContext<'tooltip'>>();
}

@Component({
  selector: 't-float',
  template: `<input class="fl" [attr.aria-label]="'Filter ' + cell().column.id" [value]="value(cell().state)" (input)="type($event)" />`,
})
class Float {
  readonly cell = input.required<DzgPartContext<'floating'>>();
  value = valueOf;
  type(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.cell().set(v ? text(v) : null, { commit: 'now' });
  }
}

@Component({
  selector: 't-popup',
  template: `<input class="pop" aria-label="Contains" [value]="value(cell().state)" /><button type="button" class="close" (click)="cell().close()">ok</button>`,
})
class Popup {
  readonly cell = input.required<DzgPartContext<'filter'>>();
  value = valueOf;
}

@Component({
  selector: 't-count',
  template: `<span class="cnt">{{ cell().range?.from }}–{{ cell().range?.to }} / {{ cell().counts.filtered }}</span><button type="button" class="nx" (click)="cell().next()">next</button>`,
})
class Count {
  readonly cell = input.required<DzgPartContext<'footer'>>();
}

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows()" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" [parts]="parts"
    [pagination]="paging" (gridEvent)="all.push($event)" (partAction)="actions.push($event)" />`,
})
class Host {
  readonly rows = signal<R[]>(ROWS);
  columns: ColumnOrGroup<R>[] = [
    { id: 'name', header: 'Name', ui: { header: 'head' } },
    { id: 'n', header: 'N', type: 'number', tooltip: (v: number | null) => (v === null ? null : `Value ${v}`) },
  ];
  readonly id = rowId;
  readonly messages = MESSAGES;
  features: GridFeature[] = [slots()];
  parts: Record<string, SlotPart> = {};
  paging: { pageSize: number } | undefined = undefined;
  readonly all: GridEvent<R>[] = [];
  readonly actions: unknown[] = [];
}

function mount(o: { features?: GridFeature[]; parts?: Record<string, SlotPart>; rows?: R[]; paging?: { pageSize: number } } = {}) {
  const env = fakeEnv();
  TestBed.configureTestingModule({ providers: [env.provider] });
  const fixture = TestBed.createComponent(Host);
  const h = fixture.componentInstance;
  if (o.features) h.features = o.features;
  if (o.parts) h.parts = o.parts;
  if (o.rows) h.rows.set(o.rows);
  if (o.paging) h.paging = o.paging;
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  document.body.append(el);
  const ctrl = fixture.debugElement.children[0]!.injector.get(DzgController);
  return { fixture, el, host: h, ctrl, shown: () => ctrl.kernel()!.rows.displayed.count };
}

describe('a header component driving the column filter (the step 21 contract)', () => {
  it('reads the label and c.filter, and its own box filters the rows', () => {
    const t = mount({ features: [slots(), filters({ floating: false })], parts: { head: componentPart('header', Head) } });
    const cell = t.el.querySelector('.dzg-hcell[data-col="name"]')!;
    expect(cell.querySelector('.ht')!.textContent).toBe('Name');
    const box = cell.querySelector<HTMLInputElement>('.hf')!;
    expect(box.value).toBe('');
    box.value = 'ann';
    box.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(t.host.all.filter((e) => e.type === 'filterChanged').map((e) => (e as { filter: unknown }).filter)).toEqual([{ name: text('ann') }]);
    expect(t.shown()).toBe(100);
  });

  it('is told the filter in force when another writes it (a new c.filter), and echoes it', () => {
    const t = mount({ features: [slots(), filters({ floating: false })], parts: { head: componentPart('header', Head) } });
    t.ctrl.dispatch({ type: 'filter.set', filter: { name: text('bob1') } });
    const box = t.el.querySelector<HTMLInputElement>('.dzg-hcell[data-col="name"] .hf')!;
    expect(box.value).toBe('bob1');
  });

  it('has no c.filter without filters()', () => {
    const t = mount({ parts: { head: componentPart('header', Head) } });
    expect(t.el.querySelector('.dzg-hcell[data-col="name"] .hf')).toBeNull();
    expect(t.el.querySelector('.dzg-hcell[data-col="name"] .ht')!.textContent).toBe('Name');
  });

  it('emit sends partAction with the slot and the column; a click on its button does not sort', () => {
    const t = mount({ parts: { head: componentPart('header', Head) } });
    t.el.querySelector<HTMLButtonElement>('.dzg-hcell[data-col="name"] .hm')!.click();
    expect(t.host.actions).toEqual([{ type: 'partAction', source: 'user', slot: 'header', column: 'name', name: 'menu', detail: 'Name' }]);
    expect(t.host.all.filter((e) => e.type === 'sortChanged')).toEqual([]);
  });
});

describe('the other slots as components', () => {
  it('overlay: shows the phase; emit sends partAction with no column', () => {
    const t = mount({ rows: [], parts: { overlay: componentPart('overlay', Overlay) } });
    const ov = t.el.querySelector('.dzg-overlay')!;
    expect(ov.querySelector('.ov')!.textContent).toBe('empty');
    ov.querySelector<HTMLButtonElement>('.ob')!.click();
    expect(t.host.actions).toEqual([{ type: 'partAction', source: 'user', slot: 'overlay', column: null, name: 'help', detail: undefined }]);
    // Rows arrive: the overlay hides, its component goes.
    t.host.rows.set(ROWS);
    t.fixture.detectChanges();
    expect(t.el.querySelector('t-overlay')).toBeNull();
  });

  it('tooltip: draws the host’s text and the value', () => {
    vi.useFakeTimers();
    const t = mount({ parts: { tooltip: componentPart('tooltip', Tip) } });
    const cell = t.el.querySelector<HTMLElement>('.dzg-row[aria-rowindex="5"] [data-col="n"]')!;
    cell.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    vi.advanceTimersByTime(600);
    expect(t.el.querySelector('.dzg-tooltip .tip')!.textContent).toBe('Value 3 [3]');
  });

  it('floating: its own box filters through c.set', () => {
    const t = mount({ features: [slots(), filters({ floating: true })], parts: { 'floating.text': componentPart('floating', Float) } });
    const box = t.el.querySelector<HTMLInputElement>('.dzg-hextra[data-col="name"] .fl')!;
    box.value = 'ann';
    box.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(t.shown()).toBe(100);
  });

  it('filter popup: mounted when the popup opens, sees the state, closes through c.close()', () => {
    const f = filters({ floating: false });
    const t = mount({ features: [slots(), f], parts: { 'filter.text': componentPart('filter', Popup) } });
    t.ctrl.dispatch({ type: 'filter.set', filter: { name: text('ann') } });
    expect(t.ctrl.openFilter('name')).toBe(true);
    t.fixture.detectChanges();
    const pop = document.querySelector<HTMLInputElement>('.pop')!;
    expect(pop.value).toBe('ann');
    document.querySelector<HTMLButtonElement>('.close')!.click();
    expect(document.querySelector('t-popup')).toBeNull();
  });

  it('footer: a component replaces footer.count and pages through c.next()', () => {
    const t = mount({ features: [slots(), pagination({ footer: ['footer.count'] })], parts: { 'footer.count': componentPart('footer', Count) }, paging: { pageSize: 50 } });
    const cnt = () => t.el.querySelector('.cnt')!.textContent;
    expect(cnt()).toBe('1–50 / 300');
    t.el.querySelector<HTMLButtonElement>('.nx')!.click();
    expect(cnt()).toBe('51–100 / 300');
  });
});
