// Strict templates over step 12's members (step12-plan §6 A10): this host is compiled by `ngc` with `strictTemplates`
// (`npm run typecheck`, packages/angular/tsconfig.spec.json), so a member typed `any` or too wide would let a wrong
// binding through: here every new binding is written the right way and its `$event` read by its real fields; the
// wrong ways must fail to compile (scripts/test/angular-strict.test.ts runs `ngc` on them). In vitest the host renders.
import { describe, it, expect, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { GridState } from '@dzgrid/core/state';
import type { GridFeature } from '@dzgrid/dom';
import { gridState } from '@dzgrid/dom/state';
import { DzGrid, DzgPart, uiData, type DzgPartContext } from '@dzgrid/angular';
import { MESSAGES, ROWS, fakeEnv, rowId, type R } from './support';

afterEach(() => {
  document.body.innerHTML = '';
});

@Component({
  selector: 't-strict',
  imports: [DzGrid, DzgPart],
  template: `<dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [features]="features"
      [state]="s" (stateChanged)="s = $event.state" [pinnedRows]="{ bottom: totals }" (densityChanged)="d = $event.density"
      (selectionChanged)="n = $event.count; mode = $event.selection.mode">
      <ng-template dzgPart="tone" let-c><span class="tone" [attr.data-tone]="tone(c)">{{ c.text }}</span></ng-template>
      <ng-template dzgPart="mi" slot="menuItem" let-c><b>{{ c.label }}</b>{{ c.checked ? '✓' : '' }}{{ c.column.id }}</ng-template>
    </dz-grid>`,
})
class StrictHost {
  readonly rows = ROWS;
  readonly columns = [{ id: 'name', ui: { cell: 'tone', data: { tone: 'blue' } } }, { id: 'n', type: 'number' as const }];
  readonly id = rowId;
  readonly messages = MESSAGES;
  readonly features: GridFeature[] = [gridState()];
  readonly totals: R[] = [];
  s: GridState | null = null;
  d: 'compact' | 'comfortable' | 'spacious' = 'comfortable';
  n: number | null = 0;
  mode: 'include' | 'exclude' = 'include';
  tone(c: DzgPartContext<'cell'>): string {
    return uiData<{ tone: string }>(c)?.tone ?? '';
  }
}

describe('strict templates over the new members', () => {
  it('the host compiles under strictTemplates (typecheck) and renders: uiData reaches the cell template', () => {
    TestBed.configureTestingModule({ providers: [fakeEnv().provider] });
    const fixture = TestBed.createComponent(StrictHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    expect(document.querySelector('.tone')!.getAttribute('data-tone')).toBe('blue');
  });
});
