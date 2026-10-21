/**
 * The fixture's `?a=1` page (step 25, phase-3-plan §4): `<dz-grid>` on dataset A (100 000 × 30, two
 * pinned columns, French, Algiers), nothing else — the Angular lines of scripts/perf-browser.mjs:
 * its first render, and 1 000 create/destroy cycles. The rows are in memory before the clock starts.
 */
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { ColumnOrGroup } from '@dzgrid/core';
import { FR } from '@dzgrid/dom/locales/fr';
import { DzGrid } from '@dzgrid/angular';
import { datasetA, type RowA } from 'dzgrid-perf-dataset';

const TYPES: Record<string, 'number' | 'day' | 'instant' | 'boolean'> = { n: 'number', d: 'day', i: 'instant', b: 'boolean' };
const IDS = ['id', 't0', 't1', 't2', 't3', 't4', 'a0', 'a1', 'a2', 'a3', 'a4', 'n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'd0', 'd1', 'd2', 'd3', 'i0', 'i1', 'e0', 'e1', 'e2', 'b0', 'b1'];

@Component({
  selector: 'dzg-fixture',
  imports: [DzGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
    <h1>DzGrid · Angular · A</h1>
    @if (shown()) {
      <div class="host"><dz-grid [rows]="rows()" [columns]="columns" [getRowId]="id" [messages]="messages" locale="fr-FR" timeZone="Africa/Algiers" /></div>
    }
    </main>`,
})
export class AppA {
  readonly all: readonly RowA[] = datasetA(100_000);
  readonly small: readonly RowA[] = this.all.slice(0, 200);
  readonly rows = signal<readonly RowA[]>(this.all);
  readonly shown = signal(false);
  readonly columns: ColumnOrGroup<RowA>[] = IDS.map((id, k) => ({
    id, width: 110, ...(id !== 'id' && TYPES[id[0]!] ? { type: TYPES[id[0]!] } : {}), ...(k < 2 ? { pinned: 'start' as const } : {}),
  }));
  readonly id = (r: RowA): string => r.id;
  readonly messages = FR;
}
