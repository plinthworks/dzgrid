/**
 * The shape §3.12 sketches, cut down: a host declares cell templates as
 * content of the grid component, the wrapper reads them with contentChildren
 * and turns each into a CellRenderer for the (framework-free) grid.
 */
import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  EnvironmentInjector,
  TemplateRef,
  contentChildren,
  inject,
  input,
  signal,
  type OnDestroy,
} from '@angular/core';
import { Action, Badge } from './cells';
import { createMiniGrid, type CellRenderer, type GridColumn, type MiniGrid } from './grid';
import {
  FreshComponentCell,
  FreshViewCell,
  PooledComponentCell,
  PooledViewCell,
  SignalViewCell,
  TextCell,
  type CellContext,
  type SignalCellContext,
  type Variant,
} from './renderers';
import { COLUMN_WIDTH, KEYS, ROW_HEIGHT, VISIBLE_ROWS, makeRows, stats, templatedColumns, type Row } from './shared';

/** `<ng-template dzgCell="badge" let-value let-row="row">` — a cell template with plain values. */
@Directive({ selector: 'ng-template[dzgCell]' })
export class DzgCell {
  readonly name = input.required<string>({ alias: 'dzgCell' });
  readonly template: TemplateRef<CellContext> = inject(TemplateRef);
  static ngTemplateContextGuard(_d: DzgCell, ctx: unknown): ctx is CellContext {
    return true;
  }
}

/** The same with signals in the context: the template calls `value()`. */
@Directive({ selector: 'ng-template[dzgCellSignal]' })
export class DzgCellSignal {
  readonly name = input.required<string>({ alias: 'dzgCellSignal' });
  readonly template: TemplateRef<SignalCellContext> = inject(TemplateRef);
  static ngTemplateContextGuard(_d: DzgCellSignal, ctx: unknown): ctx is SignalCellContext {
    return true;
  }
}

/** The wrapper. Rendering is started by the harness (`mount`) so it can be timed. */
@Component({
  selector: 's6-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class S6Grid implements OnDestroy {
  readonly variant = input.required<Variant>();
  readonly templated = input.required<number>();
  readonly onAction = input.required<(row: Row) => void>();
  private readonly cells = contentChildren(DzgCell);
  private readonly signalCells = contentChildren(DzgCellSignal);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly appRef = inject(ApplicationRef);
  private readonly env = inject(EnvironmentInjector);
  readonly rows = makeRows();
  grid: MiniGrid | null = null;
  /** The harness in main.ts reaches the wrapper through this (no debug API in a production build). */
  static current: S6Grid | null = null;
  constructor() {
    S6Grid.current = this;
  }

  mount(): MiniGrid {
    const variant = this.variant();
    const kinds = variant === 'text' ? new Map() : templatedColumns(this.templated());
    const tpl = (name: string) => this.cells().find((c) => c.name() === name)!.template;
    const sigTpl = (name: string) => this.signalCells().find((c) => c.name() === name)!.template;
    const onAction = this.onAction();
    const columns: GridColumn<Row>[] = KEYS.map((key, i) => {
      const kind = kinds.get(i) as 'badge' | 'action' | undefined;
      const renderer = (): CellRenderer<Row> => {
        if (!kind) return new TextCell();
        switch (variant) {
          case 'view-fresh': return new FreshViewCell(tpl(kind));
          case 'view-pool': return new PooledViewCell(tpl(kind));
          case 'view-pool-attached': return new PooledViewCell(tpl(kind), this.appRef);
          case 'view-signal': return new SignalViewCell(sigTpl(kind), this.appRef);
          case 'component-fresh': return new FreshComponentCell(kind === 'badge' ? Badge : Action, this.env, onAction);
          case 'component-pool': return new PooledComponentCell(kind === 'badge' ? Badge : Action, this.env, onAction);
          default: return new TextCell();
        }
      };
      return { key, width: COLUMN_WIDTH, renderer };
    });
    this.grid = createMiniGrid<Row>(this.host, {
      rows: this.rows,
      columns,
      value: (row, key) => row[key]!,
      rowHeight: ROW_HEIGHT,
      visibleRows: VISIBLE_ROWS,
    });
    this.grid.scrollTo(0);
    return this.grid;
  }

  ngOnDestroy(): void {
    this.grid?.destroy();
  }
}

const params = new URLSearchParams(location.search);

/** The host application: what a screen using DzGrid would write. */
@Component({
  selector: 's6-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [S6Grid, DzgCell, DzgCellSignal, Badge, Action],
  template: `
    <s6-grid [variant]="variant" [templated]="templated" [onAction]="handle">
      <ng-template dzgCell="badge" let-value let-row="row"><s6-badge [value]="value" [row]="row" /></ng-template>
      <ng-template dzgCell="action" let-value let-row="row"><s6-action [value]="value" [row]="row" [hot]="hot() === row.id" (act)="onAct($event)" /></ng-template>
      <ng-template dzgCellSignal="badge" let-value let-row="row"><s6-badge [value]="value()" [row]="row()" /></ng-template>
      <ng-template dzgCellSignal="action" let-value let-row="row"><s6-action [value]="value()" [row]="row()" [hot]="hot() === row().id" (act)="onAct($event)" /></ng-template>
    </s6-grid>
  `,
})
export class App {
  readonly variant = (params.get('v') ?? 'text') as Variant;
  readonly templated = Number(params.get('t') ?? 3);
  /** For the component variants, which have no template to carry the (act) binding. */
  readonly handle = (row: Row) => this.onAct(row);
  /** Host state a cell template reads: does a click show up in a pooled view? */
  readonly hot = signal('');
  onAct(row: Row): void {
    this.hot.set(row.id);
    stats.actions++;
    stats.lastAction = row.id;
  }
}
