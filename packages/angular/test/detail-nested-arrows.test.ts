// 1.13.0, found by the owner's app before publishing: `nestedGrid`'s `arrows: 'rows'` and `inlineScroll: 'master'` for a
// grid an Angular detail component makes itself (`<dz-grid [dzgNested]>`, master-detail.md « In Angular »):
// `dzgNestedArrows="rows"`, `dzgNestedInlineScroll="master"`. Expectations by hand; the clipping and the real scroll are
// looked at in Chrome (scripts/browser-1-12.mjs).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { dataKey, detailKey, type ColumnDef, type GridKernel, type RowKey } from '@dzgrid/core';
import type { Geometry, GridFeature, SlotPart } from '@dzgrid/dom';
import { DETAIL_CSS, detail } from '@dzgrid/dom/detail';
import { EN_DETAIL } from '@dzgrid/dom/locales/en-detail';
import { DZG_ENV, DzGrid, DzgController, componentPart, type DzgPartContext } from '@dzgrid/angular';
import { MESSAGES, fakeEnv } from './support';

afterEach(() => {
  document.body.innerHTML = '';
  TestBed.resetTestingModule();
});

type P = { id: string; name: string; n: number };
type V = { id: string; date: string; n: number };
const MSG = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_DETAIL.text } };
const k = (id: string): RowKey => dataKey(id)!;
const PCOLS: ColumnDef<P, any>[] = [{ id: 'name', header: 'Name', width: 200 }, { id: 'n', header: 'N', type: 'number', width: 300 }, { id: 'more', header: 'More', width: 400 }];
const VCOLS: ColumnDef<V, any>[] = [{ id: 'gap', header: '', width: 24, keyboard: false }, { id: 'date', header: 'Date', width: 176 }, { id: 'n', header: 'N', type: 'number', width: 300 }, { id: 'more', header: 'More', width: 400 }];

/** The inner grids, by master id: their controller and their view's box (jsdom lays nothing out). */
const inner = new Map<string, { ctl: DzgController<V>; box: { scrollInline: number } }>();
let lastBox: { scrollInline: number } | null = null;
const innerEnv = { provide: DZG_ENV, useFactory: () => {
  const box = { block: 200, inline: 560, scrollTop: 0, scrollInline: 0 };
  lastBox = box;
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => void (box.scrollTop = px), writeScrollInline: (px) => void (box.scrollInline = px) };
  return { geometry, sync: true };
} };

const mode = { arrows: 'rows' as 'rows' | undefined, inlineScroll: 'master' as 'master' | undefined, visits: 3 };

@Component({
  selector: 't-visits',
  imports: [DzGrid],
  providers: [innerEnv],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<dz-grid [dzgNested]="cell()" [dzgNestedArrows]="arrows" [dzgNestedInlineScroll]="inlineScroll" headers="none"
    [rows]="rows()" [columns]="cols" [getRowId]="id" [messages]="messages" (gridReady)="ready($event)" />`,
})
class Visits {
  readonly cell = input.required<DzgPartContext<'detail'>>();
  readonly arrows = mode.arrows;
  readonly inlineScroll = mode.inlineScroll;
  readonly rows = computed(() => Array.from({ length: mode.visits }, (_, i): V => ({ id: `${(this.cell().row as P).id}-V${i}`, date: `2026-01-0${i + 1}`, n: i })));
  readonly cols = VCOLS;
  readonly id = (r: V) => r.id;
  readonly messages = MSG;
  ready(c: DzgController<V>): void {
    inner.set((this.cell().row as P).id, { ctl: c, box: lastBox! });
  }
}

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<dz-grid [rows]="rows" [columns]="cols" [getRowId]="id" [messages]="messages" [features]="features" [parts]="parts" />`,
})
class Host {
  readonly rows = Array.from({ length: 10 }, (_, i): P => ({ id: `P${i}`, name: `Patient ${i}`, n: i }));
  readonly cols = PCOLS;
  readonly id = (r: P) => r.id;
  readonly messages = MSG;
  readonly features: GridFeature[] = [detail<P>({ part: 'visits', height: 160 })];
  readonly parts: Record<string, SlotPart> = { visits: componentPart('detail', Visits) };
}

async function mount(o: Partial<typeof mode> = {}) {
  Object.assign(mode, { arrows: 'rows', inlineScroll: 'master', visits: 3 }, o);
  inner.clear();
  TestBed.configureTestingModule({ providers: [fakeEnv({ block: 600, inline: 600 }).provider] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  document.body.append(fixture.nativeElement);
  const grid = fixture.debugElement.query(By.directive(DzGrid)).componentInstance as DzGrid<P>;
  const outer = grid.controller.kernel()! as GridKernel<P>;
  const vp = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.dzg-viewport')!;
  // The outer view's room as a browser would measure it (wider than its 600 px).
  Object.defineProperties(vp, { scrollWidth: { value: 1200 }, clientWidth: { value: 600 } });
  const open = async (id: string) => {
    outer.dispatch({ type: 'rows.expand', rows: [k(id)], expanded: true }, 'api');
    fixture.detectChanges();
    await vi.dynamicImportSettled();
  };
  const active = () => document.activeElement as HTMLElement;
  const press = (key: string, mods: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
    active().dispatchEvent(e);
    return e;
  };
  const sideways = (px: number) => {
    vp.scrollLeft = px;
    vp.dispatchEvent(new Event('scroll'));
  };
  return { fixture, grid, outer, vp, open, active, press, sideways };
}

describe('[dzgNested] dzgNestedArrows="rows": the arrows through an Angular detail grid\'s rows', () => {
  it('Down from the open master: the inner grid\'s first row, same column (its first the keys take otherwise)', async () => {
    const t = await mount();
    await t.open('P1');
    t.grid.controller.focusCell(k('P1'), 'n');
    t.press('ArrowDown');
    expect(inner.get('P1')!.ctl.kernel()!.focus).toEqual({ kind: 'cell', row: k('P1-V0'), column: 'n' });
    expect(t.active().closest('.dzg-dbody')).not.toBeNull();
    t.grid.controller.focusCell(k('P1'), 'name');
    t.press('ArrowDown');
    expect(inner.get('P1')!.ctl.kernel()!.focus).toEqual({ kind: 'cell', row: k('P1-V0'), column: 'date' });
  });

  it('Up from its first row back to the master; Down from its last row to the next master; Up from there to its last row', async () => {
    const t = await mount();
    await t.open('P1');
    t.grid.controller.focusCell(k('P1'), 'n');
    t.press('ArrowDown');
    const e = t.press('ArrowUp');
    expect(e.defaultPrevented).toBe(true);
    expect(t.outer.focus).toEqual({ kind: 'cell', row: k('P1'), column: 'n' });
    expect(t.active().closest('.dzg-dbody')).toBeNull();
    t.press('ArrowDown');
    t.press('ArrowDown');
    t.press('ArrowDown');
    expect(inner.get('P1')!.ctl.kernel()!.focus).toEqual({ kind: 'cell', row: k('P1-V2'), column: 'n' });
    t.press('ArrowDown');
    expect(t.outer.focus).toEqual({ kind: 'cell', row: k('P2'), column: 'n' });
    t.press('ArrowUp');
    expect(inner.get('P1')!.ctl.kernel()!.focus).toEqual({ kind: 'cell', row: k('P1-V2'), column: 'n' });
    expect(t.active().closest('.dzg-dbody')).not.toBeNull();
  });

  it('without it, Down reaches the panel\'s stop, as before', async () => {
    const t = await mount({ arrows: undefined, inlineScroll: undefined });
    await t.open('P1');
    t.grid.controller.focusCell(k('P1'), 'n');
    t.press('ArrowDown');
    expect(t.outer.focus).toEqual({ kind: 'cell', row: detailKey(k('P1')), column: 'n' });
  });
});

describe('[dzgNested] dzgNestedInlineScroll="master": an Angular detail grid follows the master\'s sideways scroll', () => {
  it('no sideways scroll of its own; moved with the master\'s from its opening on; a key in it moves the master', async () => {
    const t = await mount({ arrows: undefined });
    t.sideways(120);
    await t.open('P1');
    const vp = t.vp.querySelector<HTMLElement>('.dzg-dbody .dzg-viewport')!;
    expect(vp.style.overflowX).toBe('hidden');
    expect(inner.get('P1')!.box.scrollInline).toBe(120);
    t.sideways(300);
    expect(inner.get('P1')!.box.scrollInline).toBe(300);
    inner.get('P1')!.ctl.focusCell(k('P1-V0'), 'more');
    const at = inner.get('P1')!.box.scrollInline;
    expect(at).toBeGreaterThan(300);
    expect(t.vp.scrollLeft).toBe(at);
  });

  it('the browser scrolling its view sideways (Tab, find in page) moves the master; the wheel rule reaches it inside its component', async () => {
    const t = await mount({ arrows: undefined });
    await t.open('P1');
    const vp = t.vp.querySelector<HTMLElement>('.dzg-dbody .dzg-viewport')!;
    // Inside the component's host, not a direct child of the panel.
    expect(vp.parentElement!.parentElement!.classList.contains('dzg-dbody')).toBe(false);
    const sel = /:where\(([^)]*)\)\{overscroll-behavior:auto\}/.exec(DETAIL_CSS)![1]!;
    expect(vp.matches(sel)).toBe(true);
    expect(t.vp.matches(sel)).toBe(false);
    // jsdom lays nothing out: the inner view's room as a browser would measure it.
    Object.defineProperties(vp, { scrollWidth: { value: 1200 }, clientWidth: { value: 560 } });
    vp.scrollLeft = 450;
    vp.dispatchEvent(new Event('scroll'));
    expect(t.vp.scrollLeft).toBe(450);
    t.vp.dispatchEvent(new Event('scroll'));
    expect(inner.get('P1')!.box.scrollInline).toBe(450);
  });

  it('let go with its component: the master\'s scroll no longer reaches it', async () => {
    const t = await mount({ arrows: undefined });
    await t.open('P1');
    const box = inner.get('P1')!.box;
    t.outer.dispatch({ type: 'rows.expand', rows: [k('P1')], expanded: false }, 'api');
    t.fixture.detectChanges();
    t.sideways(200);
    expect(box.scrollInline).toBe(0);
  });

  it('without it, the inner grid scrolls by itself, apart', async () => {
    const t = await mount({ arrows: undefined, inlineScroll: undefined });
    t.sideways(120);
    await t.open('P1');
    expect(t.vp.querySelector<HTMLElement>('.dzg-dbody .dzg-viewport')!.style.overflowX).toBe('');
    expect(inner.get('P1')!.box.scrollInline).toBe(0);
  });
});
