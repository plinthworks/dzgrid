// dzTooltip and dzPopover (1.12.0, docs/behaviors/tooltips-popovers.md): the DOM layer's tooltips and popovers on any
// element of an Angular app, and in a grid's cell component. Expectations written by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ChangeDetectionStrategy, Component, input, signal, type OnDestroy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DzTooltip } from '@dzgrid/angular/tooltip';
import { DzPopover, type PopoverCloseReason } from '@dzgrid/angular/popover';
import { DzGrid, type DzgColumnOrGroup, type DzgPartContext } from '@dzgrid/angular';
import { MESSAGES, ROWS, fakeEnv, rowId, scroller, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const gone = { n: 0 };

@Component({ selector: 't-tip', changeDetection: ChangeDetectionStrategy.OnPush, template: `<em class="tip-c">{{ who() }} · {{ n() }}</em>` })
class TipCard implements OnDestroy {
  readonly who = input('');
  readonly n = input(0);
  ngOnDestroy(): void {
    gone.n++;
  }
}

@Component({
  selector: 't-host',
  imports: [DzTooltip, DzPopover],
  template: `
    <button class="b1" type="button" [dzTooltip]="text()" dzTooltipTone="danger" [dzTooltipDelay]="0" dzTooltipPlacement="left" dzTooltipAnimation="pop">Delete</button>
    <button class="b2" type="button" [dzTooltip]="tpl" [dzTooltipContext]="row()" [dzTooltipDelay]="0">Row</button>
    <ng-template #tpl let-r><strong class="t-in">{{ r.name }}</strong></ng-template>
    <button class="b3" type="button" [dzTooltip]="card" [dzTooltipInputs]="{ who: 'Ann', n: 3 }" [dzTooltipDelay]="0">Card</button>
    <button class="b4" type="button" [dzTooltip]="{ html: html }" [dzTooltipDelay]="0">Html</button>
    <button class="b5" type="button" dzTooltip="Shaped" dzTooltipShape="M0 0 H100 V100 H0 Z" [dzTooltipDelay]="0">Shape</button>
    <button class="p1" type="button" [dzPopover]="form" [dzPopoverContext]="row()" dzPopoverLabel="Edit the row" #p="dzPopover"
      (opened)="log.push('opened')" (closed)="log.push('closed:' + $event)">Edit</button>
    <ng-template #form let-r let-close="close"><label>Name <input class="f-name" [value]="r.name"></label><button class="f-done" type="button" (click)="close()">Done</button></ng-template>
    <button class="p2" type="button" [dzPopover]="card" [dzPopoverInputs]="{ who: 'Bob', n: 7 }" dzPopoverOpenOn="manual">Card</button>
  `,
})
class Host {
  readonly text = signal('Removes the row');
  readonly row = signal({ name: 'Ann' });
  readonly card = TipCard;
  readonly html = '<b>Bold</b><img src="x" onerror="alert(1)"><script>alert(2)</script>';
  readonly log: string[] = [];
}

function mount() {
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const q = <E extends HTMLElement = HTMLElement>(s: string) => document.querySelector<E>(s)!;
  const enter = (s: string) => q(s).dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
  const bubble = () => document.querySelector<HTMLElement>('.dzg-tooltip.dzg-float');
  return { fixture, q, enter, bubble, host: fixture.componentInstance };
}

describe('dzTooltip', () => {
  it('words, with a tone, a placement and a preset; described; the words follow the input', () => {
    vi.useFakeTimers();
    const { q, enter, bubble, host, fixture } = mount();
    q('.b1').getBoundingClientRect = () => ({ left: 400, right: 480, top: 300, bottom: 330, width: 80, height: 30, x: 400, y: 300, toJSON: () => null });
    enter('.b1');
    vi.advanceTimersByTime(0);
    expect(bubble()!.hidden).toBe(false);
    expect(bubble()!.textContent).toBe('Removes the row');
    expect(bubble()!.getAttribute('data-tone')).toBe('danger');
    // left in a left-to-right page: before the line's start.
    expect(bubble()!.getAttribute('data-side')).toBe('inline-start');
    expect(bubble()!.getAttribute('data-animation')).toBe('pop');
    expect(q('.b1').getAttribute('aria-describedby')).toBe(bubble()!.id);
    host.text.set('Deletes it for good');
    fixture.detectChanges();
    expect(bubble()!.textContent).toBe('Deletes it for good');
  });

  it('a template with its context; destroyed when it goes', () => {
    vi.useFakeTimers();
    const { enter, bubble, q } = mount();
    enter('.b2');
    vi.advanceTimersByTime(0);
    expect(bubble()!.querySelector('.t-in')!.textContent).toBe('Ann');
    q('.b2').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(bubble()!.hidden).toBe(true);
    expect(bubble()!.querySelector('.t-in')).toBeNull();
  });

  it('a component with its inputs, created at each show, destroyed at hide', () => {
    vi.useFakeTimers();
    gone.n = 0;
    const { enter, bubble, q } = mount();
    enter('.b3');
    vi.advanceTimersByTime(0);
    expect(bubble()!.querySelector('.tip-c')!.textContent).toBe('Ann · 3');
    q('.b3').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(gone.n).toBe(1);
  });

  it('HTML: through Angular\'s sanitizer (it says what it stripped), then the allowlist — no image, no script', () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { enter, bubble } = mount();
    enter('.b4');
    vi.advanceTimersByTime(0);
    expect(bubble()!.innerHTML).toBe('<b>Bold</b>');
    expect(warn.mock.calls.some((c) => String(c[0]).includes('sanitizing HTML stripped some content'))).toBe(true);
    warn.mockRestore();
  });
});

it('dzTooltipShape: the bubble drawn as the app\'s path', () => {
  vi.useFakeTimers();
  const { enter, bubble } = mount();
  enter('.b5');
  vi.advanceTimersByTime(0);
  expect(bubble()!.hasAttribute('data-shape')).toBe(true);
  expect(bubble()!.querySelector('svg.dzg-tip-shape > path')!.getAttribute('d')).toBe('M0 0 H100 V100 H0 Z');
});

describe('dzPopover', () => {
  it('a click opens it: a dialog named by its label, the template with its context, the focus inside; Done (close()) closes it, the focus back', () => {
    const { q, fixture, host } = mount();
    const t = q('.p1');
    t.focus();
    t.click();
    fixture.detectChanges();
    const dlg = document.querySelector<HTMLElement>('.dzg-popover')!;
    expect(dlg.getAttribute('role')).toBe('dialog');
    expect(dlg.getAttribute('aria-label')).toBe('Edit the row');
    expect(t.getAttribute('aria-expanded')).toBe('true');
    expect(dlg.querySelector<HTMLInputElement>('.f-name')!.value).toBe('Ann');
    expect(document.activeElement).toBe(dlg.querySelector('.f-name'));
    dlg.querySelector<HTMLElement>('.f-done')!.click();
    expect(document.querySelector('.dzg-popover')).toBeNull();
    expect(document.activeElement).toBe(t);
    expect(host.log).toEqual(['opened', 'closed:code']);
  });

  it('isOpen, open() / close() / toggle(); Escape and a press outside; manual ignores clicks', () => {
    const { q, fixture, host } = mount();
    const dir = fixture.debugElement.children.find((d) => (d.nativeElement as HTMLElement).classList.contains('p2'))!.injector.get(DzPopover);
    q('.p2').click();
    expect(dir.isOpen()).toBe(false);
    dir.open();
    expect(dir.isOpen()).toBe(true);
    expect(document.querySelector('.dzg-popover .tip-c')!.textContent).toBe('Bob · 7');
    dir.toggle();
    expect(dir.isOpen()).toBe(false);
    const p1 = fixture.debugElement.children.find((d) => (d.nativeElement as HTMLElement).classList.contains('p1'))!.injector.get(DzPopover);
    p1.open();
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(p1.isOpen()).toBe(false);
    p1.open();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(p1.isOpen()).toBe(false);
    expect(host.log.filter((l) => l.startsWith('closed'))).toEqual(['closed:escape', 'closed:outside'] satisfies `closed:${PopoverCloseReason}`[]);
  });
});

// A cell's action icon (brief item 5): a popover from a grid's cell component, closed when the row is recycled.
@Component({
  selector: 't-act',
  imports: [DzPopover, DzTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="act" [dzTooltip]="'More about ' + cell().text" [dzPopover]="more" [dzPopoverContext]="cell().text">⋯</button>
    <ng-template #more let-name><p class="more">{{ name }}</p></ng-template>`,
})
class ActionCell {
  readonly cell = input.required<DzgPartContext<'cell'>>();
}

@Component({
  selector: 't-grid-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" />`,
})
class GridHost {
  readonly rows = ROWS;
  readonly columns: readonly DzgColumnOrGroup<R>[] = [{ id: 'name', header: 'Name', ui: { cell: ActionCell } }];
  readonly id = rowId;
  readonly messages = MESSAGES;
}

it('in a grid: a cell component\'s icon opens a popover about its row; it closes when the row is recycled to show another', () => {
  const env = fakeEnv();
  TestBed.configureTestingModule({ providers: [env.provider] });
  const fixture = TestBed.createComponent(GridHost);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const raf: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((f) => (raf.push(f), raf.length));
  const icon = document.querySelector<HTMLElement>('.dzg-layer .dzg-row[aria-rowindex="3"] .act')!;
  icon.click();
  fixture.detectChanges();
  expect(document.querySelector('.dzg-popover .more')!.textContent).toBe(ROWS[1]!.name);
  // Scrolled far: the pooled row now shows another row.
  scroller(fixture, env.box)(30 * 40);
  fixture.detectChanges();
  raf.splice(0).forEach((f) => f(0));
  expect(document.querySelector('.dzg-popover')).toBeNull();
  vi.restoreAllMocks();
});

it('review: destroyed while open, the popover closes without emitting on a destroyed output', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { q, fixture } = mount();
  q('.p1').click();
  fixture.detectChanges();
  expect(document.querySelector('.dzg-popover')).not.toBeNull();
  fixture.destroy();
  expect(document.querySelector('.dzg-popover')).toBeNull();
  expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => /destroyed/i.test(m))).toEqual([]);
  warn.mockRestore();
});

@Component({
  selector: 't-wait',
  imports: [DzTooltip, DzPopover],
  template: `
    <button class="w1" type="button" dzTooltip="Saves" [dzTooltipDisabled]="off()" [disabled]="native()">Save</button>
    <button class="w2" type="button" dzTooltip="Details" [dzPopover]="'The form'" dzPopoverOpenOn="manual" #p="dzPopover">More</button>
  `,
})
class Waiting {
  readonly off = signal(false);
  readonly native = signal(false);
}

it('1.12.0 (sheet 18): a show waiting for its delay is dropped by dzTooltipDisabled, by [disabled], by a popover opening from the same trigger', () => {
  vi.useFakeTimers();
  const fixture = TestBed.createComponent(Waiting);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const q = (s: string) => document.querySelector<HTMLElement>(s)!;
  const enter = (s: string) => q(s).dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
  const shown = () => !(document.querySelector<HTMLElement>('.dzg-tooltip.dzg-float')?.hidden ?? true);
  enter('.w1');
  vi.advanceTimersByTime(200);
  fixture.componentInstance.off.set(true);
  fixture.detectChanges();
  vi.advanceTimersByTime(1000);
  expect(shown()).toBe(false);
  fixture.componentInstance.off.set(false);
  fixture.detectChanges();
  enter('.w1');
  vi.advanceTimersByTime(200);
  fixture.componentInstance.native.set(true);
  fixture.detectChanges();
  vi.advanceTimersByTime(1000);
  expect(shown()).toBe(false);
  enter('.w2');
  vi.advanceTimersByTime(200);
  // The popover opened by code (a key the app handles) while the tooltip waits.
  const p = fixture.debugElement.children.find((d) => d.nativeElement === q('.w2'))!.references['p'] as DzPopover;
  p.open();
  fixture.detectChanges();
  vi.advanceTimersByTime(1000);
  expect(document.querySelector('.dzg-popover')).not.toBeNull();
  expect(shown()).toBe(false);
  fixture.destroy();
});
