/**
 * The fixture's `?page=tree` and `?page=detail` pages (Phase 4 step 11): a tree with an Angular cell and the
 * `[(expanded)]` model; masters whose panels are an Angular component holding a nested `<dz-grid [dzgNested]>`.
 * French, or Arabic right to left (`?lang=ar`). `window.fx` drives them for run.mjs.
 */
import { ChangeDetectionStrategy, Component, computed, input, signal, type OnDestroy } from '@angular/core';
import { dataKey, type ColumnOrGroup, type RowKey } from '@dzgrid/core';
import type { GridFeature, GridMessages, SlotPart } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { detail } from '@dzgrid/dom/detail';
import { FR } from '@dzgrid/dom/locales/fr';
import { FR_TREE } from '@dzgrid/dom/locales/fr-tree';
import { FR_DETAIL } from '@dzgrid/dom/locales/fr-detail';
import { AR } from '@dzgrid/dom/locales/ar';
import { AR_TREE } from '@dzgrid/dom/locales/ar-tree';
import { AR_DETAIL } from '@dzgrid/dom/locales/ar-detail';
import { DzGrid, componentPart, type DzgPartContext } from '@dzgrid/angular';
import { AR_MODE } from './app';

export const treeStats = { made: 0, gone: 0, panels: 0, panelsGone: 0, actions: [] as unknown[] };

const W = AR_MODE
  ? { service: 'مصلحة', patient: 'مريض', visit: 'زيارة', name: 'الاسم', n: 'العدد', visits: 'زيارات', date: 'التاريخ', open: 'فتح' }
  : { service: 'Service', patient: 'Patient', visit: 'Visite', name: 'Nom', n: 'Nombre', visits: 'Visites', date: 'Date', open: 'Ouvrir' };
const MSG: GridMessages = AR_MODE
  ? { locale: 'ar', text: { ...AR.text, ...AR_TREE.text, ...AR_DETAIL.text } }
  : { locale: 'fr', text: { ...FR.text, ...FR_TREE.text, ...FR_DETAIL.text } };
const LOCALE = AR_MODE ? 'ar-DZ' : 'fr-FR';

type Node = { id: string; parent: string | null; name: string; n: number };
/** 50 services × 20 patients × 5 visits: 5 050 rows. */
const TREE: Node[] = [];
for (let s = 0; s < 50; s++) {
  TREE.push({ id: `s${s}`, parent: null, name: `${W.service} ${s}`, n: s });
  for (let p = 0; p < 20; p++) {
    TREE.push({ id: `s${s}.${p}`, parent: `s${s}`, name: `${W.patient} ${s}.${p}`, n: p });
    for (let v = 0; v < 5; v++) TREE.push({ id: `s${s}.${p}.${v}`, parent: `s${s}.${p}`, name: `${W.visit} ${s}.${p}.${v}`, n: v });
  }
}

@Component({
  selector: 'fx-tcell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="fx-tn">{{ cell().text }}</span>`,
})
class TreeName implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  constructor() { treeStats.made++; }
  ngOnDestroy(): void { treeStats.gone++; }
}

@Component({
  selector: 'dzg-fixture',
  imports: [DzGrid],
  template: `
    <main>
    <h1>DzGrid · Angular · {{ title }}</h1>
    <p class="fx-open">{{ open().size }}</p>
    @if (shown()) {
      <div class="host">
        <dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [locale]="locale" [features]="features" [parts]="parts"
          [label]="title" [(expanded)]="open" />
      </div>
    }
    </main>`,
})
export class TreeApp {
  readonly title = AR_MODE ? 'شجرة' : 'Arbre';
  readonly rows = TREE;
  readonly columns: ColumnOrGroup<Node>[] = [
    { id: 'name', header: W.name, ui: { cell: 'tname' }, width: 260 },
    { id: 'n', header: W.n, type: 'number', width: 110 },
  ];
  readonly id = (r: Node): string => r.id;
  readonly messages = MSG;
  readonly locale = LOCALE;
  readonly features: GridFeature[] = [tree<Node>({ parentId: (r) => r.parent })];
  readonly parts: Record<string, SlotPart> = { tname: componentPart('cell', TreeName) };
  readonly open = signal<ReadonlySet<RowKey>>(new Set([dataKey('s0')!, dataKey('s0.0')!]));
  readonly shown = signal(true);
}

type Master = { id: string; name: string; n: number };
type Visit = { id: string; date: string; n: number };
const MASTERS: Master[] = Array.from({ length: 2000 }, (_, i) => ({ id: `m${i}`, name: `${W.patient} ${i}`, n: (i * 37) % 1000 }));

/** A panel: the master's visits in a grid of its own; its button emits `open` with the master's key. */
@Component({
  selector: 'fx-visits',
  imports: [DzGrid],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="fx-vb" (click)="cell().emit('open', cell().master)">{{ words.open }}</button>
    <div class="fx-vh"><dz-grid [dzgNested]="cell()" [rows]="rows()" [columns]="columns" [getRowId]="id" [messages]="messages" [locale]="locale" [label]="label()" /></div>`,
  styles: `:host { display: block; } .fx-vh { block-size: 180px; } .fx-vh .dzg { block-size: 100%; }`,
})
class Visits implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'detail'>>();
  readonly words = W;
  readonly rows = computed(() => Array.from({ length: 12 }, (_, i): Visit => ({ id: `${(this.cell().row as Master).id}.v${i}`, date: `2026-0${1 + (i % 9)}-1${i % 10}`, n: i })));
  readonly label = computed(() => `${W.visits} ${(this.cell().row as Master).name}`);
  readonly columns: ColumnOrGroup<Visit>[] = [{ id: 'date', header: W.date, type: 'day', width: 160 }, { id: 'n', header: W.n, type: 'number', width: 100 }];
  readonly id = (r: Visit): string => r.id;
  readonly messages = MSG;
  readonly locale = LOCALE;
  constructor() { treeStats.panels++; }
  ngOnDestroy(): void { treeStats.panelsGone++; }
}

@Component({
  selector: 'dzg-fixture',
  imports: [DzGrid],
  template: `
    <main>
    <h1>DzGrid · Angular · {{ title }}</h1>
    <p class="fx-open">{{ open().size }}</p>
    @if (shown()) {
      <div class="host">
        <dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [locale]="locale" [features]="features" [parts]="parts"
          [label]="title" [(expanded)]="open" (partAction)="act($event.detail)" />
      </div>
    }
    </main>`,
})
export class DetailApp {
  readonly title = AR_MODE ? 'تفاصيل' : 'Détails';
  readonly rows = MASTERS;
  readonly columns: ColumnOrGroup<Master>[] = [
    { id: 'name', header: W.name, width: 220 },
    { id: 'n', header: W.n, type: 'number', width: 120 },
  ];
  readonly id = (r: Master): string => r.id;
  readonly messages = MSG;
  readonly locale = LOCALE;
  readonly features: GridFeature[] = [detail<Master>({ part: 'visits', height: 240 })];
  readonly parts: Record<string, SlotPart> = { visits: componentPart('detail', Visits) };
  readonly open = signal<ReadonlySet<RowKey>>(new Set([dataKey('m0')!]));
  readonly shown = signal(true);
  act(d: unknown): void {
    treeStats.actions.push(d);
  }
}
