// An editor written as a template (Phase 5 step 9 T4, docs/behaviors/edit-angular.md 5; owner S9-Q3):
// `<ng-template dzgPart="stock" slot="editor" let-c>`, named by `edit.editor`; its context; `c.keep`, `c.cancel`,
// `c.refuse`; Enter / Tab / a blur keep through `c.reads` (Q5), nothing without it; Escape; its view made at the open
// and destroyed at the close; `editor.number` replacing the built-in. The context is typed by `slot` (ngc, strict
// templates: `npm run typecheck` compiles this file's template). Written first.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Component, input, type OnDestroy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type GridEvent } from '@dzgrid/core';
import type { GridFeature } from '@dzgrid/dom';
import type { CellInput } from '@dzgrid/dom/editors';
import { edit } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors';
import { DzGrid, DzgPart, type DzgController, type DzgPartContext } from '@dzgrid/angular';
import { fakeEnv, life, scroller } from './support';
import { EMSG, SCOLS, STOCK, cellIn, key, layout, ofType, settle, sid, tick, typeIn, type St } from './support-edit';

beforeEach(() => life.reset());
afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** Counts the views the editor template makes. */
@Component({ selector: 't-life', template: `<i class="lf">{{ c().column.id }}</i>` })
class Life implements OnDestroy {
  readonly c = input.required<DzgPartContext<'editor'>>();
  constructor() {
    life.made++;
  }
  ngOnDestroy(): void {
    life.gone++;
  }
}

@Component({
  selector: 't-host',
  imports: [DzGrid, DzgPart, Life],
  template: `<button type="button" class="outside">out</button>
    <dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features" (gridEvent)="all.push($event)" (gridReady)="ctl = $event">
      <ng-template dzgPart="stock" slot="editor" let-c>
        <input #f class="tpl" [value]="c.char ?? c.text" (focus)="reads && c.reads(textOf(f))" />
        <button type="button" class="keep" (click)="c.keep({ text: f.value })">ok</button>
        <button type="button" class="cancel" (click)="c.cancel()">x</button>
        <button type="button" class="refuse" (click)="c.refuse('app.stock')">!</button>
        <button type="button" class="swap" (click)="c.reads(fixed('second'))">2</button>
        <i class="seen">{{ c.start }}|{{ c.char ?? '' }}|{{ c.dir }}</i><t-life [c]="c" />
      </ng-template>
      @if (number) {
        <ng-template dzgPart="editor.number" slot="editor" let-c><input #n class="num" [value]="c.text" (focus)="c.reads(textOf(n))" /></ng-template>
      }
    </dz-grid>`,
})
class Host {
  readonly rows = STOCK;
  readonly columns = SCOLS;
  readonly id = sid;
  readonly messages = EMSG;
  features: GridFeature[] = [edit<St>(), editors()];
  reads = true;
  number = false;
  readonly all: GridEvent<St>[] = [];
  ctl: DzgController<St> | null = null;
  readonly textOf = (f: HTMLInputElement) => (): CellInput => ({ text: f.value });
  readonly fixed = (text: string) => (): CellInput => ({ text });
}

function mount(o: { down?: boolean; reads?: boolean; number?: boolean } = {}) {
  const env = fakeEnv();
  TestBed.configureTestingModule({ providers: [env.provider] });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  if (o.down) host.features = [edit<St>(), editors({ enterMoves: 'down' })];
  host.reads = o.reads !== false;
  host.number = !!o.number;
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const at = (id: string, col = 'note') => {
    host.ctl!.focusCell(dataKey(id)!, col);
    const c = cellIn(el, id, col)!;
    if (document.activeElement !== c) c.focus();
    return c;
  };
  const ed = () => el.querySelector<HTMLElement>('.dzg-editor');
  const tpl = () => el.querySelector<HTMLInputElement>('input.tpl');
  const saved = () => ofType(host.all, 'cellEdited').map((e) => [e.column, e.value]);
  const focusAt = () => {
    const f = host.ctl!.kernel()!.focus;
    return f?.kind === 'cell' ? `${String(f.row).replace(/^d:\d+:/, '')}/${f.column}` : null;
  };
  return { fixture, host, el, at, ed, tpl, saved, focusAt, scroll: scroller(fixture, env.box) };
}

describe('an editor as a template', () => {
  it('F2 mounts it in the grid’s editor host, the focus in its input; its context: start, char, dir', () => {
    const t = mount();
    const cell = t.at('p2');
    key('F2');
    const h = t.ed()!;
    expect(h.closest('.dzg-cell')).toBe(cell);
    expect(h.getAttribute('data-dzg-owner')).toBe('editor');
    expect(h.contains(t.tpl())).toBe(true);
    expect(document.activeElement).toBe(t.tpl());
    expect(t.tpl()!.value).toBe('n2');
    expect(h.querySelector('.seen')!.textContent).toBe('f2||ltr');
    expect(life.made).toBe(1);
  });

  it('typing a character opens it with start key and that char', () => {
    const t = mount();
    t.at('p2');
    key('7');
    expect(t.ed()!.querySelector('.seen')!.textContent).toBe('key|7|ltr');
    expect(t.tpl()!.value).toBe('7');
  });

  it("c.keep(input): saved, closed, moved as Enter (enterMoves: 'down')", () => {
    const t = mount({ down: true });
    t.at('p2');
    key('F2');
    typeIn(t.tpl()!, 'abc');
    t.ed()!.querySelector<HTMLButtonElement>('.keep')!.click();
    expect(t.saved()).toEqual([['note', 'abc']]);
    expect(t.ed()).toBeNull();
    expect(t.focusAt()).toBe('p3/note');
    expect(life.gone).toBe(1);
  });

  it('c.cancel(): given up, nothing saved, the focus back on the cell', () => {
    const t = mount();
    t.at('p2');
    key('F2');
    t.ed()!.querySelector<HTMLButtonElement>('.cancel')!.click();
    expect(t.ed()).toBeNull();
    expect(t.saved()).toEqual([]);
    expect(t.focusAt()).toBe('p2/note');
  });

  it("c.refuse('app.stock'): still open, the bubble shown", () => {
    layout();
    const t = mount();
    t.at('p2');
    key('F2');
    t.ed()!.querySelector<HTMLButtonElement>('.refuse')!.click();
    expect(t.ed()).not.toBeNull();
    const bubble = t.el.querySelector<HTMLElement>('.dzg-bubble');
    expect(bubble?.hidden).toBe(false);
    expect(t.saved()).toEqual([]);
  });

  it('Enter in its input: what c.reads gives is kept', () => {
    const t = mount();
    t.at('p2');
    key('F2');
    typeIn(t.tpl()!, 'enter');
    key('Enter', {}, t.tpl()!);
    expect(t.saved()).toEqual([['note', 'enter']]);
    expect(t.ed()).toBeNull();
  });

  it('Tab: kept, and the next cell', () => {
    const t = mount();
    t.at('p2');
    key('F2');
    typeIn(t.tpl()!, 'tab');
    key('Tab', {}, t.tpl()!);
    expect(t.saved()).toEqual([['note', 'tab']]);
    expect(t.focusAt()).not.toBe('p2/note');
  });

  it('a click elsewhere (blur): kept through c.reads (Q5)', async () => {
    const t = mount();
    t.at('p2');
    key('F2');
    typeIn(t.tpl()!, 'blur');
    t.el.querySelector<HTMLButtonElement>('.outside')!.focus();
    await tick();
    await settle();
    expect(t.saved()).toEqual([['note', 'blur']]);
    expect(t.ed()).toBeNull();
  });

  it('without c.reads, a blur keeps nothing (documented)', async () => {
    const t = mount({ reads: false });
    t.at('p2');
    key('F2');
    typeIn(t.tpl()!, 'lost');
    t.el.querySelector<HTMLButtonElement>('.outside')!.focus();
    await tick();
    await settle();
    expect(t.saved()).toEqual([]);
    expect(cellIn(t.el, 'p2', 'note')!.textContent).toBe('n2');
  });

  // The analyser's gaps (review of step 9).
  it('c.reads: the latest function given wins', () => {
    const t = mount();
    t.at('p2');
    key('F2');
    typeIn(t.tpl()!, 'first');
    t.ed()!.querySelector<HTMLButtonElement>('.swap')!.click();
    key('Enter', {}, t.tpl()!);
    expect(t.saved()).toEqual([['note', 'second']]);
  });

  it('a reader belongs to its own opening: the next opening without c.reads keeps nothing at a blur', async () => {
    const t = mount();
    t.at('p2');
    key('F2');
    key('Escape', {}, t.tpl()!);
    t.host.reads = false;
    t.at('p3');
    key('F2');
    typeIn(t.tpl()!, 'stale');
    t.el.querySelector<HTMLButtonElement>('.outside')!.focus();
    await tick();
    await settle();
    expect(t.saved()).toEqual([]);
    expect(cellIn(t.el, 'p3', 'note')!.textContent).toBe('n3');
  });

  it('Escape gives it up', () => {
    const t = mount();
    t.at('p2');
    key('F2');
    typeIn(t.tpl()!, 'gone');
    key('Escape', {}, t.tpl()!);
    expect(t.ed()).toBeNull();
    expect(t.saved()).toEqual([]);
  });

  it('200 opens and closes with scrolls: views made = views destroyed, none left', () => {
    const t = mount();
    for (let i = 0; i < 200; i++) {
      const id = `p${i % 6}`;
      t.scroll(0);
      t.at(id);
      key('F2');
      if (i % 2) key('Escape', {}, t.tpl()!);
      else t.ed()!.querySelector<HTMLButtonElement>('.cancel')!.click();
      if (i % 10 === 0) t.scroll(200 + i);
    }
    expect(life.made).toBe(200);
    expect(life.gone).toBe(200);
    expect(t.el.querySelectorAll('t-life').length).toBe(0);
    t.fixture.destroy();
    expect(life.made).toBe(life.gone);
  });

  it('dzgPart="editor.number" replaces the built-in number field', () => {
    const t = mount({ number: true });
    t.at('p2', 'stock');
    key('F2');
    const n = t.el.querySelector<HTMLInputElement>('input.num')!;
    expect(n).not.toBeNull();
    expect(t.el.querySelector('.dzg-field')).toBeNull();
    typeIn(n, '42');
    key('Enter', {}, n);
    expect(t.saved()).toEqual([['stock', 42]]);
  });
});
