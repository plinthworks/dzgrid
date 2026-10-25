// No NG0100 from the editing outputs (Phase 5 step 9 T6, docs/behaviors/edit-angular.md 3; the rule of Phase 4 step 11): plain fields of the host
// bound from `(undoChanged)`, `(orderStale)`, `(cellEdited)` and shown in its template, in dev mode (each
// `fixture.detectChanges()` checks again for changes): a commit from `(gridReady)`, a commit in an effect, and the
// inputs changed in one check (`[rows]` that put the order back, `[context]`, `[columns]`, `[save]`). Written first.
import { describe, it, expect, afterEach } from 'vitest';
import { Component, effect, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { dataKey, type GridEvent } from '@dzgrid/core';
import type { SaveHandler } from '@dzgrid/core/edit';
import { edit, type EditFeature } from '@dzgrid/dom/edit';
import { editors } from '@dzgrid/dom/editors';
import { DzGrid, type DzgController } from '@dzgrid/angular';
import { fakeEnv } from './support';
import { EMSG, SCOLS, STOCK, sid, type St } from './support-edit';

afterEach(() => {
  document.body.innerHTML = '';
});

const COLS = SCOLS.map((c) => (c.id === 'stock' ? { ...c, sortable: true } : c));

@Component({
  selector: 't-host',
  imports: [DzGrid],
  template: `<p class="st">{{ canUndo }}|{{ stale }}|{{ edits }}</p>
    <dz-grid [rows]="rows()" [columns]="columns()" [getRowId]="id" [messages]="messages" [features]="features" [save]="save()" [context]="context()"
      (gridReady)="ready($event)" (undoChanged)="canUndo = $event.canUndo" (orderStale)="stale = $event.stale" (cellEdited)="edits = edits + 1" />`,
})
class Host {
  readonly rows = signal<St[]>(STOCK);
  readonly columns = signal(COLS);
  readonly id = sid;
  readonly messages = EMSG;
  readonly editing: EditFeature<St> = edit<St>();
  readonly features = [this.editing, editors()];
  readonly save = signal<SaveHandler<St> | undefined>(undefined);
  readonly context = signal<unknown>({ n: 0 });
  /** Plain fields: only a check shows them; a change during a check would be NG0100. */
  canUndo = false;
  stale = false;
  edits = 0;
  ctl: DzgController<St> | null = null;
  static atReady = false;
  readonly ask = signal(0);
  constructor() {
    // A commit inside an effect (the app's own reaction to a signal).
    effect(() => {
      const n = this.ask();
      if (n && this.ctl) this.editing.api({ kernel: this.ctl.kernel()! })!.commit([{ key: dataKey(`p${n}`)!, column: 'stock', input: { text: String(100000 + n) } }]);
    });
  }
  ready(c: DzgController<St>): void {
    this.ctl = c;
    if (Host.atReady) {
      c.dispatch({ type: 'sort.set', sort: [{ column: 'stock', dir: 'asc' }] });
      this.editing.api({ kernel: c.kernel()! })!.commit([{ key: dataKey('p1')!, column: 'stock', input: { text: '99999' } }]);
    }
  }
}

function mount() {
  TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const shown = () => (fixture.nativeElement as HTMLElement).querySelector('.st')!.textContent;
  return { fixture, host: fixture.componentInstance, shown };
}

afterEach(() => {
  Host.atReady = false;
});

describe('no NG0100 from the editing outputs', () => {
  it('a commit from (gridReady), sorted on the edited column: shown at the next check, no NG0100', () => {
    Host.atReady = true;
    const t = mount();
    expect(() => t.fixture.detectChanges()).not.toThrow();
    expect(t.shown()).toBe('true|true|1');
  });

  it('a commit inside an effect', () => {
    const t = mount();
    t.host.ctl!.dispatch({ type: 'sort.set', sort: [{ column: 'stock', dir: 'asc' }] });
    t.host.ask.set(3);
    expect(() => t.fixture.detectChanges()).not.toThrow();
    expect(() => t.fixture.detectChanges()).not.toThrow();
    expect(t.shown()).toBe('true|true|1');
  });

  it('[rows], [context], [columns] and [save] changed in one check while the order is stale: no NG0100', () => {
    const t = mount();
    t.host.ctl!.dispatch({ type: 'sort.set', sort: [{ column: 'stock', dir: 'asc' }] });
    t.host.editing.api({ kernel: t.host.ctl!.kernel()! })!.commit([{ key: dataKey('p1')!, column: 'stock', input: { text: '99999' } }]);
    expect(() => t.fixture.detectChanges()).not.toThrow();
    expect(t.shown()).toBe('true|true|1');
    // A host update that moves rows puts the order back (S2-O1): orderStale false told while the inputs are applied.
    t.host.rows.set([...STOCK].reverse());
    t.host.context.set({ n: 1 });
    t.host.columns.set(COLS.map((c) => (c.id === 'note' ? { ...c, editable: false } : c)));
    t.host.save.set(() => undefined);
    expect(() => t.fixture.detectChanges()).not.toThrow();
    expect(() => t.fixture.detectChanges()).not.toThrow();
    expect(t.shown()).toBe('true|false|1');
  });
});
