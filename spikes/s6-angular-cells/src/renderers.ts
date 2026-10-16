/**
 * The six ways S6 compares to put something in a recycled cell. Each is a
 * CellRenderer for grid.ts; only the Angular ones know Angular.
 */
import {
  createComponent,
  signal,
  type ApplicationRef,
  type ComponentRef,
  type EmbeddedViewRef,
  type EnvironmentInjector,
  type TemplateRef,
  type Type,
  type WritableSignal,
} from '@angular/core';
import type { CellRenderer } from './grid';
import { stats, type Row } from './shared';
import type { Action, Badge } from './cells';

export type Variant = 'text' | 'view-fresh' | 'view-pool' | 'view-pool-attached' | 'view-signal' | 'component-fresh' | 'component-pool';

/** Context of a `<ng-template dzgCell let-value let-row="row" let-index="index">`. */
export interface CellContext {
  $implicit: string;
  row: Row;
  index: number;
}
/** The same, as signals: the template reads `value()`, `row()`. */
export interface SignalCellContext {
  $implicit: WritableSignal<string>;
  row: WritableSignal<Row>;
  index: WritableSignal<number>;
}

/** (1) Plain DOM: one text node per cell, its data replaced on recycle. */
export class TextCell implements CellRenderer<Row> {
  private text!: Text;
  mount(cell: HTMLElement): void {
    this.text = cell.ownerDocument.createTextNode('');
    cell.append(this.text);
  }
  bind(_row: Row, value: string): void {
    this.text.data = value;
  }
  destroy(): void {}
}

/** (2) A fresh EmbeddedViewRef each time a row enters the cell; the old one destroyed. */
export class FreshViewCell implements CellRenderer<Row> {
  private cell!: HTMLElement;
  private view: EmbeddedViewRef<CellContext> | null = null;
  constructor(private readonly tpl: TemplateRef<CellContext>) {}
  mount(cell: HTMLElement): void {
    this.cell = cell;
  }
  bind(row: Row, value: string, index: number): void {
    this.drop();
    const v = this.tpl.createEmbeddedView({ $implicit: value, row, index });
    stats.viewsCreated++;
    v.detectChanges();
    stats.detectChanges++;
    this.cell.append(...(v.rootNodes as Node[]));
    this.view = v;
  }
  destroy(): void {
    this.drop();
  }
  private drop(): void {
    if (!this.view) return;
    this.cell.textContent = '';
    this.view.destroy();
    stats.viewsDestroyed++;
    this.view = null;
  }
}

/**
 * (3a) One view per cell for the cell's whole life (the pool *is* the cells,
 * per column): the context object is mutated and that one view checked.
 * With `appRef` (3a', 'view-pool-attached') the view is also attached to the
 * application, so a host signal its template reads refreshes it between binds.
 */
export class PooledViewCell implements CellRenderer<Row> {
  private cell!: HTMLElement;
  private view: EmbeddedViewRef<CellContext> | null = null;
  constructor(
    private readonly tpl: TemplateRef<CellContext>,
    private readonly appRef: ApplicationRef | null = null,
  ) {}
  mount(cell: HTMLElement): void {
    this.cell = cell;
  }
  bind(row: Row, value: string, index: number): void {
    if (!this.view) {
      this.view = this.tpl.createEmbeddedView({ $implicit: value, row, index });
      stats.viewsCreated++;
      this.appRef?.attachView(this.view);
      this.view.detectChanges();
      this.cell.append(...(this.view.rootNodes as Node[]));
    } else {
      const ctx = this.view.context;
      ctx.$implicit = value;
      ctx.row = row;
      ctx.index = index;
      this.view.detectChanges();
    }
    stats.detectChanges++;
  }
  destroy(): void {
    if (!this.view) return;
    this.cell.textContent = '';
    this.appRef?.detachView(this.view);
    this.view.destroy();
    stats.viewsDestroyed++;
    this.view = null;
  }
}

/**
 * (3b) Pooled as (3a), but the context holds signals and the views are
 * attached to the ApplicationRef: setting the signals marks only those views,
 * and the zoneless scheduler runs one tick for the whole batch.
 */
export class SignalViewCell implements CellRenderer<Row> {
  private cell!: HTMLElement;
  private view: EmbeddedViewRef<SignalCellContext> | null = null;
  constructor(
    private readonly tpl: TemplateRef<SignalCellContext>,
    private readonly appRef: ApplicationRef,
  ) {}
  mount(cell: HTMLElement): void {
    this.cell = cell;
  }
  bind(row: Row, value: string, index: number): void {
    if (!this.view) {
      this.view = this.tpl.createEmbeddedView({ $implicit: signal(value), row: signal(row), index: signal(index) });
      stats.viewsCreated++;
      this.appRef.attachView(this.view);
      this.cell.append(...(this.view.rootNodes as Node[]));
    } else {
      const ctx = this.view.context;
      ctx.$implicit.set(value);
      ctx.row.set(row);
      ctx.index.set(index);
    }
  }
  destroy(): void {
    if (!this.view) return;
    this.cell.textContent = '';
    this.appRef.detachView(this.view);
    this.view.destroy();
    stats.viewsDestroyed++;
    this.view = null;
  }
}

type CellComponent = Badge | Action;

/** (4a) createComponent each time a row enters the cell, inputs by setInput. */
export class FreshComponentCell implements CellRenderer<Row> {
  private cell!: HTMLElement;
  private ref: ComponentRef<CellComponent> | null = null;
  constructor(
    private readonly type: Type<CellComponent>,
    private readonly env: EnvironmentInjector,
    private readonly onAction: (row: Row) => void,
  ) {}
  mount(cell: HTMLElement): void {
    this.cell = cell;
  }
  bind(row: Row, value: string): void {
    this.drop();
    const ref = createComponent(this.type, { environmentInjector: this.env });
    stats.viewsCreated++;
    ref.setInput('value', value);
    ref.setInput('row', row);
    const inst = ref.instance;
    if ('act' in inst) inst.act.subscribe(this.onAction);
    ref.changeDetectorRef.detectChanges();
    stats.detectChanges++;
    this.cell.append(ref.location.nativeElement as Node);
    this.ref = ref;
  }
  destroy(): void {
    this.drop();
  }
  private drop(): void {
    if (!this.ref) return;
    this.cell.textContent = '';
    this.ref.destroy();
    stats.viewsDestroyed++;
    this.ref = null;
  }
}

/** (4b) One component per cell for its whole life; setInput + detectChanges on recycle. */
export class PooledComponentCell implements CellRenderer<Row> {
  private cell!: HTMLElement;
  private ref: ComponentRef<CellComponent> | null = null;
  constructor(
    private readonly type: Type<CellComponent>,
    private readonly env: EnvironmentInjector,
    private readonly onAction: (row: Row) => void,
  ) {}
  mount(cell: HTMLElement): void {
    this.cell = cell;
  }
  bind(row: Row, value: string): void {
    if (!this.ref) {
      this.ref = createComponent(this.type, { environmentInjector: this.env });
      stats.viewsCreated++;
      const inst = this.ref.instance;
      if ('act' in inst) inst.act.subscribe(this.onAction);
      this.cell.append(this.ref.location.nativeElement as Node);
    }
    this.ref.setInput('value', value);
    this.ref.setInput('row', row);
    this.ref.changeDetectorRef.detectChanges();
    stats.detectChanges++;
  }
  destroy(): void {
    if (!this.ref) return;
    this.cell.textContent = '';
    this.ref.destroy();
    stats.viewsDestroyed++;
    this.ref = null;
  }
}
