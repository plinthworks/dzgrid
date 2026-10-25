/**
 * The fixture's `?page=edit` (Phase 5 step 9, step09-plan §3; edit-angular.md): a stock list edited from Angular —
 * `edit()` and `editors()` in `[features]`, the app's save through `[save]`, the four outputs, a template editor
 * (`dzgPart="note" slot="editor"`, `c.reads`) and a component editor (`componentPart('editor', …)`, `read()`).
 * French light Clinic, or Arabic right to left dark Midnight (`?lang=ar`); `?enter=down`. `window.fx` drives it.
 */
import { ChangeDetectionStrategy, Component, ElementRef, input, signal, viewChild, type OnDestroy } from '@angular/core';
import type { ColumnDef } from '@dzgrid/core';
import type { SaveHandler } from '@dzgrid/core/edit';
import type { GridFeature, GridMessages, SlotPart } from '@dzgrid/dom';
import { edit } from '@dzgrid/dom/edit';
import { editors, type CellInput } from '@dzgrid/dom/editors';
import { FR } from '@dzgrid/dom/locales/fr';
import { FR_EDIT } from '@dzgrid/dom/locales/fr-edit';
import { FR_EDITORS } from '@dzgrid/dom/locales/fr-editors';
import { AR } from '@dzgrid/dom/locales/ar';
import { AR_EDIT } from '@dzgrid/dom/locales/ar-edit';
import { AR_EDITORS } from '@dzgrid/dom/locales/ar-editors';
import { DzGrid, DzgPart, componentPart, type DzgController, type DzgEditorComponent, type DzgPartContext } from '@dzgrid/angular';
import { AR_MODE } from './app';

export const editStats = { made: 0, gone: 0, saves: 0, failed: [] as string[], edited: 0, undo: [] as boolean[], stale: [] as boolean[], held: [] as (() => void)[] };
const ENTER_DOWN = new URLSearchParams(location.search).get('enter') === 'down';

const W = AR_MODE
  ? { title: 'المخزون', name: 'الصنف', stock: 'المخزون', note: 'ملاحظة', shelf: 'الرف', item: 'صنف' }
  : { title: 'Stock', name: 'Article', stock: 'Stock', note: 'Note', shelf: 'Rayon', item: 'Article' };
const MSG: GridMessages = AR_MODE
  ? { locale: 'ar', text: { ...AR.text, ...AR_EDIT.text, ...AR_EDITORS.text } }
  : { locale: 'fr', text: { ...FR.text, ...FR_EDIT.text, ...FR_EDITORS.text } };

type Item = { id: string; name: string; stock: number; note: string; shelf: string };
const ITEMS: Item[] = Array.from({ length: 2000 }, (_, i) => ({ id: `s${i}`, name: `${W.item} ${i}`, stock: (i * 7) % 300, note: `n${i}`, shelf: `R${i % 40}` }));

/** The shelf editor, a component: an input of its own, `read()` its upper-cased text. */
@Component({
  selector: 'fx-shelf-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input #f class="fx-shelf" [attr.aria-label]="cell().column.def.header" [value]="cell().char ?? cell().text" />`,
})
class ShelfEditor implements DzgEditorComponent, OnDestroy {
  readonly cell = input.required<DzgPartContext<'editor'>>();
  private readonly f = viewChild.required<ElementRef<HTMLInputElement>>('f');
  constructor() {
    editStats.made++;
  }
  focus(): boolean {
    const el = this.f().nativeElement;
    el.focus();
    el.select();
    return true;
  }
  read(): CellInput {
    return { text: this.f().nativeElement.value.toUpperCase() };
  }
  ngOnDestroy(): void {
    editStats.gone++;
  }
}

/** Counts the note template's views. */
@Component({ selector: 'fx-note-life', template: `` })
class NoteLife implements OnDestroy {
  constructor() {
    editStats.made++;
  }
  ngOnDestroy(): void {
    editStats.gone++;
  }
}

@Component({
  selector: 'dzg-fixture',
  imports: [DzGrid, DzgPart, NoteLife],
  template: `
    <main>
    <h1>DzGrid · Angular · {{ title }}</h1>
    <p class="fx-log"><span class="fx-undo">{{ canUndo() }}</span> <span class="fx-edited">{{ edited() }}</span> <span class="fx-failed">{{ failed() }}</span></p>
    @if (shown()) {
      <div class="host">
        <dz-grid [rows]="rows" [columns]="columns" [getRowId]="id" [messages]="messages" [locale]="locale" [features]="features" [parts]="parts"
          [label]="title" [save]="save" (gridReady)="ctl = $event" (cellEdited)="edited.set(edited() + 1)" (saveFailed)="fail($event.reason)"
          (undoChanged)="canUndo.set($event.canUndo)" (orderStale)="stale($event.stale)">
          <ng-template dzgPart="note" slot="editor" let-c>
            <input #f class="fx-note" [attr.aria-label]="c.column.def.header" [value]="c.char ?? c.text" (focus)="c.reads(textOf(f))" /><fx-note-life />
          </ng-template>
        </dz-grid>
      </div>
    }
    </main>`,
})
export class EditApp {
  readonly title = W.title;
  readonly rows = ITEMS;
  readonly columns: ColumnDef<Item, any>[] = [
    { id: 'name', header: W.name, width: 160, editable: true },
    { id: 'stock', header: W.stock, type: 'number', width: 110, editable: true, edit: { min: 0 } },
    { id: 'note', header: W.note, width: 180, editable: true, edit: { editor: 'note', maxLength: 40 } },
    { id: 'shelf', header: W.shelf, width: 120, editable: true, edit: { editor: 'shelf' } },
  ];
  readonly id = (r: Item): string => r.id;
  readonly messages = MSG;
  readonly locale = AR_MODE ? 'ar-DZ' : 'fr-FR';
  readonly features: GridFeature[] = [edit<Item>(), editors(ENTER_DOWN ? { enterMoves: 'down' } : {})];
  readonly parts: Record<string, SlotPart> = { shelf: componentPart('editor', ShelfEditor) };
  readonly shown = signal(true);
  readonly canUndo = signal(false);
  readonly edited = signal(0);
  readonly failed = signal(0);
  ctl: DzgController<Item> | null = null;
  readonly textOf = (f: HTMLInputElement) => (): CellInput => ({ text: f.value });
  /** The app's save: held until `fx.answer()` when `hold`, else 120 ms; the row s5 is refused by the « server ». */
  hold = false;
  readonly save: SaveHandler<Item> = (req) => {
    editStats.saves++;
    const refused = req.changes.some((c) => String(c.key).endsWith('s5'));
    return new Promise<void>((ok, no) => {
      const answer = () => (refused ? no({ reason: AR_MODE ? 'مقفل' : 'verrouillé' }) : ok());
      if (this.hold) editStats.held.push(answer);
      else setTimeout(answer, 120);
    });
  };
  fail(reason: string | null): void {
    editStats.failed.push(reason ?? '');
    this.failed.set(this.failed() + 1);
  }
  stale(s: boolean): void {
    editStats.stale.push(s);
  }
}
