// Shared fixtures for the Angular editing tests (Phase 5 step 9, docs/phase-5-steps/step09-plan.md §2,
// docs/behaviors/edit-angular.md): a stock grid with `edit()` and `editors()` given in `[features]`, the English
// texts, keys and a field to type in.
import { vi } from 'vitest';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import type { GridMessages } from '@dzgrid/dom';
import { EN_EDIT } from '@dzgrid/dom/locales/en-edit';
import { EN_EDITORS } from '@dzgrid/dom/locales/en-editors';
import { MESSAGES } from './support';

export type St = { id: string; name: string; stock: number; note: string };
export const STOCK: St[] = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, name: `item ${i}`, stock: i * 10, note: `n${i}` }));
/** name: read-only; stock: number ≥ 0, editable; note: the template editor `stock` (`edit.editor`). */
export const SCOLS: ColumnDef<St, any>[] = [
  { id: 'name', header: 'Name', width: 120 },
  { id: 'stock', header: 'Stock', type: 'number', width: 100, editable: true, edit: { min: 0 } },
  { id: 'note', header: 'Note', width: 140, editable: true, edit: { editor: 'stock', maxLength: 20 } },
];
export const EMSG: GridMessages = { ...MESSAGES, text: { ...MESSAGES.text, ...EN_EDIT.text, ...EN_EDITORS.text } };
export const sid = (r: St): string => r.id;

/** The cell of row `id`, column `col`, under `el`. */
export function cellIn(el: Element, id: string, col: string): HTMLElement | null {
  const n = Number(id.slice(1));
  return el.querySelector<HTMLElement>(`.dzg-layer .dzg-row[aria-rowindex="${n + 2}"] .dzg-cell[data-col="${col}"]`);
}

/** A key on `on` (default: what has the focus); returns the event. */
export function key(k: string, init: KeyboardEventInit = {}, on: Element = document.activeElement!): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  on.dispatchEvent(ev);
  return ev;
}

/** Types `text` into an input as a user would leave it. */
export function typeIn(f: HTMLInputElement, text: string): void {
  f.value = text;
  f.setSelectionRange(text.length, text.length);
  f.dispatchEvent(new Event('input', { bubbles: true }));
}

export const ofType = <K extends GridEvent<St>['type']>(all: readonly GridEvent<St>[], t: K) => all.filter((e): e is Extract<GridEvent<St>, { type: K }> => e.type === t);
export const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** A layout for jsdom (no layout of its own; as the DOM tests' `layout()`): the cells in a 1000 × 700 view, the bubble 200 × 30. */
export function layout(): void {
  const rect = (top: number, bottom: number, left: number, right: number) => ({ top, bottom, left, right, x: left, y: top, width: right - left, height: bottom - top, toJSON() {} }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('dzg-viewport')) return rect(0, 700, 0, 1000);
    if (this.classList.contains('dzg-bubble')) return rect(0, 30, 0, 200);
    return rect(100, 132, 300, 380);
  });
}
