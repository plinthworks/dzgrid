/**
 * What a host puts in a cell: a badge (computed class + icon + text) and a
 * button with an output. Signal inputs, OnPush, standalone — Angular 21 style.
 */
import { ChangeDetectionStrategy, Component, computed, input, output, type DoCheck } from '@angular/core';
import { ICONS, stats, toneOf, type Row } from './shared';

@Component({
  selector: 's6-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="cls()"><svg viewBox="0 0 12 12" aria-hidden="true"><path [attr.d]="icon()" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>{{ value() }}</span>`,
})
export class Badge implements DoCheck {
  readonly value = input.required<string>();
  readonly row = input<Row | undefined>(undefined);
  private readonly tone = computed(() => toneOf(this.value()));
  protected readonly cls = computed(() => `badge badge--${this.tone()}`);
  protected readonly icon = computed(() => ICONS[this.tone()]);
  ngDoCheck(): void {
    stats.checks++;
  }
}

@Component({
  selector: 's6-action',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="act" [class.hot]="hot()" (click)="act.emit(row())">{{ value() }} #{{ row().id }}</button>`,
})
export class Action implements DoCheck {
  readonly value = input.required<string>();
  readonly row = input.required<Row>();
  readonly hot = input(false);
  readonly act = output<Row>();
  ngDoCheck(): void {
    stats.checks++;
  }
}
