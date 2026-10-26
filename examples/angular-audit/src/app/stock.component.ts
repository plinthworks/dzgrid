/**
 * The « stock » screen (Phase 5 step 9, owner S9-Q4; docs/behaviors/edit-angular.md): invented stock rows edited from
 * Angular, loaded on demand (`?screen=stock`, a dynamic import in main.ts) so the audit screen's first load carries
 * none of it. `edit()` and `editors({ list: listEditor })` in `[features]`; the app's save through `[save]` (a fake
 * server: 120 ± 60 ms, refuses the row « S-0005 »); `(saveFailed)`, `(undoChanged)`; a component
 * editor for the note (`componentPart('editor', …)`, `read()`; step 12: `range()` and `fill(range)` — blocks, the fill
 * handle, Ctrl+D / R, Ctrl+Enter bulk; a template editor would bring Angular's embedded-view
 * code into the first load's shared chunk, against the audit screen's 90 000); the theme's edit.css with this chunk.
 * French, or Arabic right to left with `?lang=ar`.
 */
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, NgZone, ViewEncapsulation, inject, input, signal, viewChild, type AfterViewInit, type DoCheck } from '@angular/core';
import type { ColumnDef } from '@dzgrid/core';
import type { SaveHandler } from '@dzgrid/core/edit';
import type { GridMessages } from '@dzgrid/dom';
import { edit } from '@dzgrid/dom/edit';
import { editors, type CellInput } from '@dzgrid/dom/editors';
import { listEditor } from '@dzgrid/dom/editors-list';
import { range } from '@dzgrid/dom/range';
import { fill } from '@dzgrid/dom/fill';
import { FR } from '@dzgrid/dom/locales/fr';
import { FR_EDIT } from '@dzgrid/dom/locales/fr-edit';
import { FR_EDITORS } from '@dzgrid/dom/locales/fr-editors';
import { FR_RANGE } from '@dzgrid/dom/locales/fr-range';
import { FR_FILL } from '@dzgrid/dom/locales/fr-fill';
import { AR } from '@dzgrid/dom/locales/ar';
import { AR_EDIT } from '@dzgrid/dom/locales/ar-edit';
import { AR_EDITORS } from '@dzgrid/dom/locales/ar-editors';
import { AR_RANGE } from '@dzgrid/dom/locales/ar-range';
import { AR_FILL } from '@dzgrid/dom/locales/ar-fill';
import { DzGrid, DzgController, componentPart, type DzgEditorComponent, type DzgPartContext } from '@dzgrid/angular';
import { AUDIT_LANG } from './lang';
import { AUDIT_PROBE } from './probe';

const STATUSES = ['ok', 'low', 'out', 'recalled'] as const;
const WORDS = {
  fr: {
    title: 'Stock', ref: 'Référence', product: 'Produit', stock: 'Quantité', status: 'État', expiry: 'Péremption', note: 'Note',
    statuses: { ok: 'Disponible', low: 'Bas', out: 'Rupture', recalled: 'Rappelé' }, products: ['Paracétamol', 'Amoxicilline', 'Insuline', 'Ibuprofène', 'Oméprazole'],
    undo: 'Annuler', redo: 'Rétablir', saved: 'Enregistrés', failed: 'Refusés', refused: 'verrouillé par l’inventaire',
  },
  ar: {
    title: 'المخزون', ref: 'المرجع', product: 'المنتج', stock: 'الكمية', status: 'الحالة', expiry: 'انتهاء الصلاحية', note: 'ملاحظة',
    statuses: { ok: 'متوفر', low: 'منخفض', out: 'نفد', recalled: 'مسحوب' }, products: ['باراسيتامول', 'أموكسيسيلين', 'إنسولين', 'إيبوبروفين', 'أوميبرازول'],
    undo: 'تراجع', redo: 'إعادة', saved: 'المحفوظة', failed: 'المرفوضة', refused: 'مقفل بسبب الجرد',
  },
} as const;
const MESSAGES: Record<'fr' | 'ar', GridMessages> = {
  fr: { locale: FR.locale, text: { ...FR.text, ...FR_EDIT.text, ...FR_EDITORS.text, ...FR_RANGE.text, ...FR_FILL.text } as GridMessages['text'] },
  ar: { locale: AR.locale, text: { ...AR.text, ...AR_EDIT.text, ...AR_EDITORS.text, ...AR_RANGE.text, ...AR_FILL.text } as GridMessages['text'] },
};

export type StockRow = { id: string; ref: string; product: string; stock: number; status: (typeof STATUSES)[number]; expiry: string; note: string };

/** 400 invented rows, the same on every load. */
function stockRows(products: readonly string[]): StockRow[] {
  return Array.from({ length: 400 }, (_, i) => ({
    id: `S-${String(i).padStart(4, '0')}`, ref: `S-${String(i).padStart(4, '0')}`, product: `${products[i % products.length]} ${100 + (i % 9) * 50}`,
    stock: (i * 37) % 500, status: STATUSES[i % 4]!, expiry: `2027-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`, note: '',
  }));
}

/** The note's editor: an input of its own; `read()` is what Enter, Tab and a click elsewhere keep. */
@Component({
  selector: 'stock-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input #f class="stock-note" [attr.aria-label]="cell().column.def.header" maxlength="80" [value]="cell().char ?? cell().text" />`,
})
export class NoteEditor implements DzgEditorComponent {
  readonly cell = input.required<DzgPartContext<'editor'>>();
  private readonly f = viewChild.required<ElementRef<HTMLInputElement>>('f');
  focus(): boolean {
    this.f().nativeElement.focus();
    return true;
  }
  read(): CellInput {
    return { text: this.f().nativeElement.value };
  }
}

@Component({
  selector: 'audit-root',
  imports: [DzGrid],
  // The theme's edit marks and fields come with this screen's chunk only (the audit screen loads none of it).
  // Phase 5 step 12: blocks of cells and the fill (their styles with this chunk too).
  styleUrls: ['../../node_modules/@dzgrid/theme/edit.css', '../../node_modules/@dzgrid/theme/range.css', '../../node_modules/@dzgrid/theme/fill.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="audit">
      <h1>{{ w.title }}</h1>
      <div class="bar">
        <button type="button" class="stock-undo" [attr.aria-disabled]="!canUndo()" (click)="undo()">{{ w.undo }}</button>
        <p>{{ w.saved }}&nbsp;: <output class="stock-saved">{{ saved() }}</output> · {{ w.failed }}&nbsp;: <output class="stock-failed">{{ failed() }}</output></p>
      </div>
      <div class="audit-grid">
        <dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [features]="features" [messages]="messages" [locale]="locale" [direction]="dir" [label]="w.title"
          [parts]="parts" [save]="save" (gridReady)="ready($event)" (saveFailed)="refused()" (undoChanged)="canUndo.set($event.canUndo)" />
      </div>
    </main>`,
})
export class StockScreen implements DoCheck, AfterViewInit {
  private readonly probe = inject(AUDIT_PROBE, { optional: true });
  readonly lang = inject(AUDIT_LANG);
  readonly w = WORDS[this.lang];
  readonly dir = this.lang === 'ar' ? ('rtl' as const) : ('ltr' as const);
  readonly locale = this.lang === 'ar' ? 'ar-DZ' : 'fr-FR';
  readonly messages = MESSAGES[this.lang];
  readonly rows = stockRows(this.w.products);
  readonly columns: ColumnDef<StockRow, any>[] = [
    { id: 'ref', header: this.w.ref, width: 120 },
    { id: 'product', header: this.w.product, width: 200 },
    { id: 'stock', header: this.w.stock, type: 'number', width: 120, editable: true, edit: { required: true, min: 0 } },
    { id: 'status', header: this.w.status, type: 'enum', width: 150, editable: true, enumOptions: STATUSES.map((value) => ({ value, label: this.w.statuses[value] })) },
    { id: 'expiry', header: this.w.expiry, type: 'day', width: 150, editable: true },
    { id: 'note', header: this.w.note, width: 220, editable: true, edit: { editor: 'note', maxLength: 80 } },
  ];
  readonly id = (r: StockRow): string => r.id;
  private readonly blocks = range();
  readonly features = [edit<StockRow>(), editors({ list: listEditor }), this.blocks, fill(this.blocks)];
  readonly saved = signal(0);
  readonly failed = signal(0);
  readonly canUndo = signal(false);
  private controller: DzgController<StockRow> | null = null;
  private readonly view = viewChild(DzGrid, { read: DzgController });
  readonly parts = { note: componentPart('editor', NoteEditor) };

  /** A fake server: answers in 120 ± 60 ms; refuses any change to S-0005 with a reason. */
  private seed = 11;
  readonly save: SaveHandler<StockRow> = (req) =>
    new Promise<void>((ok, no) => {
      this.seed = (this.seed * 16807) % 2147483647;
      const late = 60 + (this.seed % 121);
      // « Enregistrés » counts the answered saves (one per change), not the edits (review of step 9, 6).
      setTimeout(() => (req.changes.some((c) => c.row.id === 'S-0005') ? no({ reason: this.w.refused }) : (this.saved.set(this.saved() + req.changes.length), ok())), late);
    });

  constructor() {
    const doc = inject(DOCUMENT);
    doc.documentElement.lang = this.lang;
    doc.documentElement.dir = this.dir;
  }

  ngDoCheck(): void {
    if (this.probe) this.probe.checks++;
  }

  ngAfterViewInit(): void {
    const c = this.view();
    if (this.probe) {
      this.probe.kernel = c ? c.kernel() : undefined;
      this.probe.ready = c ? c.ready() : undefined;
    }
  }

  ready(c: DzgController<StockRow>): void {
    this.controller = c;
    if (this.probe) this.probe.gridReady = true;
  }

  refused(): void {
    this.failed.set(this.failed() + 1);
    if (this.probe) this.probe.inZone = NgZone.isInAngularZone();
  }

  undo(): void {
    this.controller?.edit()?.undo();
  }
}
