/**
 * The Angular fixture (step 22): <dz-grid> with an Angular cell (component and template), a header
 * with its own filter box, the overlay, a floating filter cell and a footer part, all Angular;
 * the search field and the export button through the directives. French, or Arabic right to left
 * (`?lang=ar`). `window.fx` drives it for packages/angular/browser/run.mjs.
 */
import { ChangeDetectionStrategy, Component, input, signal, type OnDestroy } from '@angular/core';
import type { ColumnOrGroup, Json } from '@dzgrid/core';
import type { GridFeature, GridMessages, SlotPart } from '@dzgrid/dom';
import { slots } from '@dzgrid/dom/slots';
import { filters } from '@dzgrid/dom/filters';
import { pagination } from '@dzgrid/dom/pagination';
import { quickSearch } from '@dzgrid/dom/search';
import { csvExport } from '@dzgrid/dom/export';
import { FR } from '@dzgrid/dom/locales/fr';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { FR_PAGINATION } from '@dzgrid/dom/locales/fr-pagination';
import { FR_EXPORT } from '@dzgrid/dom/locales/fr-export';
import { AR } from '@dzgrid/dom/locales/ar';
import { AR_FILTERS } from '@dzgrid/dom/locales/ar-filters';
import { AR_PAGINATION } from '@dzgrid/dom/locales/ar-pagination';
import { AR_EXPORT } from '@dzgrid/dom/locales/ar-export';
import { DzGrid, DzgController, DzgExport, DzgPart, DzgSearch, componentPart, type DzgPartContext } from '@dzgrid/angular';

export const stats = { made: 0, gone: 0, actions: 0, lastAction: '' };
const born = (): void => void stats.made++;
const died = (): void => void stats.gone++;

export const AR_MODE = new URLSearchParams(location.search).get('lang') === 'ar';
const WORDS = AR_MODE
  ? { name: 'الاسم', status: 'الحالة', n: 'العدد', flag: 'علامة', city: 'المدينة', search: 'بحث', filter: 'تصفية', open: 'فتح', empty: 'لا توجد صفوف', export: 'تصدير', toggle: 'إفراغ / ملء', on: 'نعم', off: 'لا' }
  : { name: 'Nom', status: 'État', n: 'Nombre', flag: 'Marque', city: 'Ville', search: 'Recherche', filter: 'Filtrer', open: 'Ouvrir', empty: 'Aucune ligne', export: 'Exporter', toggle: 'Vider / remplir', on: 'oui', off: 'non' };

type Row = { id: string; name: string; status: string; n: number; flag: boolean; city: string };
const CITIES = AR_MODE ? ['الجزائر', 'وهران', 'قسنطينة', 'عنابة'] : ['Alger', 'Oran', 'Constantine', 'Annaba'];
const ROWS: Row[] = Array.from({ length: 100_000 }, (_, i) => ({ id: `r${i}`, name: `${AR_MODE ? 'مريض' : 'Patient'} ${i}`, status: ['ok', 'late', 'hold'][i % 3]!, n: (i * 37) % 1000, flag: i % 4 === 0, city: CITIES[i % 4]! }));
const text = (v: string) => ({ type: 'text', op: 'contains', value: v }) as const;
const valueOf = (s: Json | null | undefined): string => ((s as { value?: string } | null)?.value) ?? '';

@Component({
  selector: 'fx-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="fx-st" (click)="cell().emit('open', cell().text)">{{ cell().text }}</button>`,
})
class StatusCell implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'cell'>>();
  constructor() { born(); }
  ngOnDestroy(): void { died(); }
}

/** Counts the template's views. */
@Component({ selector: 'fx-count', template: `` })
class ViewCount implements OnDestroy {
  constructor() { born(); }
  ngOnDestroy(): void { died(); }
}

@Component({
  selector: 'fx-head',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span>{{ cell().label }}</span>
    @if (cell().filter; as f) {
      <input class="fx-hf" [attr.aria-label]="words.filter + ' ' + cell().label" [value]="value(f.state)" (input)="type(f, $event)" />
    }`,
})
class Head implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'header'>>();
  readonly words = WORDS;
  readonly value = valueOf;
  constructor() { born(); }
  type(f: NonNullable<DzgPartContext<'header'>['filter']>, e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    f.set(v ? text(v) : null);
  }
  ngOnDestroy(): void { died(); }
}

@Component({
  selector: 'fx-float',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input class="fx-fl" [attr.aria-label]="words.filter + ' ' + (cell().column.def.header ?? cell().column.id)" [value]="value(cell().state)" (input)="type($event)" />`,
})
class Float implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'floating'>>();
  readonly words = WORDS;
  readonly value = valueOf;
  constructor() { born(); }
  type(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.cell().set(v ? text(v) : null);
  }
  ngOnDestroy(): void { died(); }
}

@Component({ selector: 'fx-overlay', template: `<p class="fx-ov">{{ words.empty }} ({{ cell().phase }})</p>` })
class Overlay implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'overlay'>>();
  readonly words = WORDS;
  constructor() { born(); }
  ngOnDestroy(): void { died(); }
}

@Component({
  selector: 'fx-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="fx-ft">{{ cell().range?.from }}–{{ cell().range?.to }} / {{ cell().counts.filtered }}</span>`,
})
class Footer implements OnDestroy {
  readonly cell = input.required<DzgPartContext<'footer'>>();
  constructor() { born(); }
  ngOnDestroy(): void { died(); }
}

const PARTS: Record<string, SlotPart> = {
  status: componentPart('cell', StatusCell),
  head: componentPart('header', Head),
  'floating.text': componentPart('floating', Float),
  overlay: componentPart('overlay', Overlay),
  'footer.count': componentPart('footer', Footer),
};

@Component({
  selector: 'dzg-fixture',
  imports: [DzGrid, DzgPart, DzgSearch, DzgExport, ViewCount],
  template: `
    <main>
    <h1>DzGrid · Angular</h1>
    <div class="bar">
      <input type="search" [attr.aria-label]="words.search" [dzgSearch]="search" />
      <button type="button" class="fx-export" [dzgExport]="exporter">{{ words.export }}</button>
      <button type="button" class="fx-toggle" (click)="toggle()">{{ words.toggle }}</button>
    </div>
    @if (shown()) {
      <div class="host">
        <dz-grid [rows]="rows()" [columns]="columns" [getRowId]="id" [messages]="messages" [locale]="locale" [features]="features"
          [parts]="parts()" [pagination]="paging" [selection]="selection" (cellAction)="act($event.detail)" (gridReady)="ready($event)">
          <ng-template dzgPart="flag" let-c><span class="fx-flag">{{ c.value ? words.on : words.off }}</span><fx-count /></ng-template>
        </dz-grid>
      </div>
    }
    </main>`,
})
export class App {
  readonly words = WORDS;
  readonly rows = signal<Row[]>(ROWS);
  readonly shown = signal(true);
  readonly parts = signal<Record<string, SlotPart>>(PARTS);
  readonly columns: ColumnOrGroup<Row>[] = [
    { id: 'name', header: WORDS.name, ui: { header: 'head' }, width: 200 },
    { id: 'status', header: WORDS.status, ui: { cell: 'status' }, width: 120 },
    { id: 'n', header: WORDS.n, type: 'number', width: 110 },
    { id: 'flag', header: WORDS.flag, type: 'boolean', ui: { cell: 'flag' }, width: 100 },
    { id: 'city', header: WORDS.city, width: 160 },
  ];
  readonly id = (r: Row): string => r.id;
  readonly messages: GridMessages = AR_MODE
    ? { locale: 'ar', text: { ...AR.text, ...AR_FILTERS.text, ...AR_PAGINATION.text, ...AR_EXPORT.text } }
    : { locale: 'fr', text: { ...FR.text, ...FR_FILTERS.text, ...FR_PAGINATION.text, ...FR_EXPORT.text } };
  readonly locale = AR_MODE ? 'ar-DZ' : 'fr-FR';
  readonly search = quickSearch();
  readonly exporter = csvExport({ canExport: true });
  readonly features: GridFeature[] = [slots(), filters({ floating: true }), pagination({ footer: ['footer.count', 'footer.pager'] }), this.search, this.exporter];
  readonly paging = { pageSize: 5000 };
  readonly selection = { mode: 'multi' as const };
  controller: DzgController<Row> | null = null;

  ready(c: DzgController<Row>): void {
    this.controller = c;
  }
  act(detail: unknown): void {
    stats.actions++;
    stats.lastAction = String(detail);
  }
  toggle(): void {
    this.rows.set(this.rows().length ? [] : ROWS);
  }
}
