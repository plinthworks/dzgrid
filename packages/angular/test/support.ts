// Shared fixtures for the Angular wrapper's tests (step 22, docs/behaviors/angular-parts.md).
import { ChangeDetectionStrategy, Component, inject, input, type OnDestroy } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import type { ColumnOrGroup, GridEvent } from '@dzgrid/core';
import type { Geometry, GridMessages, ViewportBox } from '@dzgrid/dom';
import { EN } from '@dzgrid/dom/locales/en';
import { EN_FILTERS } from '@dzgrid/dom/locales/en-filters';
import { EN_PAGINATION } from '@dzgrid/dom/locales/en-pagination';
import { DZG_ENV, DzgController, type DzgPartContext } from '@dzgrid/angular';

export type R = { id: string; name: string; n: number; s: string };
export const ROWS: R[] = Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, name: i % 3 ? `bob${i}` : `ann${i}`, n: i, s: i % 2 ? 'odd' : 'even' }));
export const COLUMNS: ColumnOrGroup<R>[] = [
  { id: 'name', header: 'Name' },
  { id: 'n', header: 'N', type: 'number' },
  { id: 's', header: 'Status', ui: { cell: 'status' } },
];
export const MESSAGES: GridMessages = { locale: 'en', text: { ...EN.text, ...EN_FILTERS.text, ...EN_PAGINATION.text } };
export const rowId = (r: R): string => r.id;

/** A fake geometry (jsdom has no layout) and synchronous paints, given to `<dz-grid>` through DZG_ENV. */
export function fakeEnv(o: { block?: number; inline?: number } = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: o.block ?? 320, inline: o.inline ?? 900, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  return { box, provider: { provide: DZG_ENV, useValue: { geometry, sync: true } } };
}

/** Scrolls the grid inside a fixture to `top` px and lets it paint (sync). */
export function scroller(fixture: ComponentFixture<unknown>, box: { scrollTop: number }) {
  return (top: number): void => {
    box.scrollTop = top;
    (fixture.nativeElement as HTMLElement).querySelector('.dzg-viewport')!.dispatchEvent(new Event('scroll'));
  };
}

/** What every counted part component did: constructions, destructions, the contexts it saw. */
export const life = { made: 0, gone: 0, seen: [] as unknown[], reset() { this.made = 0; this.gone = 0; this.seen = []; } };

/** A cell component: its text in a button whose click emits `open` with the row's name. */
@Component({
  selector: 't-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="st" (click)="cell().emit('open', cell().text)">{{ cell().text }}</button>`,
})
export class StatusCell implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  readonly controller = inject(DzgController);
  constructor() {
    life.made++;
    life.seen.push(this);
  }
  ngOnDestroy(): void {
    life.gone++;
  }
}

export const events = <T>(list: GridEvent<T>[], type: GridEvent<T>['type']) => list.filter((e) => e.type === type);
