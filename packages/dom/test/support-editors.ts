// Shared fixtures for `@dzgrid/dom/editors` (Phase 5 step 5, docs/phase-5-steps/step05-plan.md): a grid with
// `edit()` and `editors()`, the texts of one language, helpers to focus a cell, press keys, read the field.
import { vi } from 'vitest';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import type { SaveHandler } from '@dzgrid/core/edit';
import type { GridFeature } from '../src/features.js';
import type { GridSettings } from '../src/settings.js';
import { edit, type EditApi, type EditFeature } from '../src/edit.js';
import { editors, type EditorsOptions } from '../src/editors.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { FR_EDIT } from '../src/locales/fr-edit.js';
import { AR_EDIT } from '../src/locales/ar-edit.js';
import { EN_EDITORS } from '../src/locales/en-editors.js';
import { FR_EDITORS } from '../src/locales/fr-editors.js';
import { AR_EDITORS } from '../src/locales/ar-editors.js';
import { BASE, emake, join, k, rowsOf, type R } from './support-edit.js';

export { cleanup, k, rowsOf, join, BASE, type R } from './support-edit.js';

export const EDIT = { en: EN_EDIT, fr: FR_EDIT, ar: AR_EDIT } as const;
export const EDITORS = { en: EN_EDITORS, fr: FR_EDITORS, ar: AR_EDITORS } as const;

/** name: text, editable (the row header); n « Stock »: number ≥ 0; s « Shelf »: read-only; q « Price »: number. */
export const ECOLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'n', header: 'Stock', type: 'number', width: 80, editable: true, edit: { min: 0 } },
  { id: 's', header: 'Shelf', width: 80 },
  { id: 'q', header: 'Price', type: 'number', width: 80, editable: true },
];

export interface EdMake {
  readonly lang?: 'en' | 'fr' | 'ar';
  readonly options?: EditorsOptions;
  readonly columns?: ColumnDef<R, any>[];
  readonly rows?: R[];
  readonly save?: SaveHandler<R>;
  /** The feature list from the two features (default `[edit, editors]`). */
  readonly features?: (e: EditFeature<R>, x: GridFeature) => GridFeature[];
  readonly settings?: Partial<GridSettings<R>>;
  readonly block?: number;
  readonly host?: HTMLElement;
  readonly raf?: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>;
}

export function ed(o: EdMake = {}) {
  const lang = o.lang ?? 'en';
  const e = edit<R>(o.save ? { save: o.save } : {});
  const x = editors(o.options);
  const m = emake({
    columns: o.columns ?? ECOLS, rows: o.rows ?? rowsOf(200), ...(o.block && { block: o.block }), ...(o.host && { host: o.host }), ...(o.raf && { raf: o.raf }),
    settings: { features: o.features ? o.features(e, x) : [e, x], messages: join(BASE[lang], EDIT[lang], EDITORS[lang]), ...(lang === 'ar' && { direction: 'rtl' }), ...o.settings },
  });
  const api = e.api(m.g)! as EditApi<R>;
  const alert = api ? vi.spyOn(api, 'alert') : vi.fn();
  /** Focuses a mounted cell as the user would (the DOM focus on it, the kernel's focus with it). */
  const at = (id: string, col = 'n') => {
    m.g.api.focusCell(k(id), col);
    const c = m.cell(id, col)!;
    if (document.activeElement !== c) c.focus();
    return c;
  };
  const field = () => m.host.querySelector<HTMLInputElement>('.dzg-field');
  /** A key on what has the focus; returns the event (its `defaultPrevented`). */
  const key = (k: string, init: KeyboardEventInit & { modifierAltGraph?: boolean } = {}, on: Element = document.activeElement!) => {
    const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    on.dispatchEvent(ev);
    return ev;
  };
  /** The field's text, as typing would leave it. */
  const type = (text: string) => {
    const f = field()!;
    f.value = text;
    f.setSelectionRange(text.length, text.length);
    f.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const of = <K extends GridEvent<R>['type']>(t: K) => m.events.filter((e): e is Extract<GridEvent<R>, { type: K }> => e.type === t);
  const value = (id: string, col = 'n') => m.cell(id, col)!.textContent;
  const focusAt = () => {
    const f = m.g.kernel.focus;
    return f?.kind === 'cell' ? `${String(f.row).replace(/^d:\d+:/, '')}/${f.column}` : null;
  };
  const bubble = () => m.host.querySelector<HTMLElement>('.dzg-bubble');
  return { ...m, e, x, api, alert, at, field, key, type, of, value, focusAt, bubble, lang };
}

/** A layout for jsdom (no layout of its own): every element a cell's size, inside a 1000 × 700 view; the bubble 200 × 30. */
export function layout(): void {
  const rect = (top: number, bottom: number, left: number, right: number) => ({ top, bottom, left, right, x: left, y: top, width: right - left, height: bottom - top, toJSON() {} }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('dzg-viewport')) return rect(0, 700, 0, 1000);
    if (this.classList.contains('dzg-bubble')) return rect(0, 30, 0, 200);
    return rect(100, 132, 300, 380);
  });
}

export const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
/** One task later (the blur is decided then). */
export const tick = () => new Promise<void>((r) => setTimeout(r, 0));
export { emake };
