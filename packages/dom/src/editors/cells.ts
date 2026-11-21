import type { ResolvedColumn } from '@dzgrid/core';
import { intlTag } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { Part, SlotContext } from '../part.js';
import type { EditorsOptions } from './index.js';

/** The editor kinds: the built-in ones, or the application's part. */
export type Kind = 'text' | 'number' | 'day' | 'instant' | 'boolean' | 'list' | 'textarea' | Part<SlotContext['editor']>;
export const BUILT = ['text', 'number', 'day', 'instant', 'boolean', 'list', 'textarea'];

/** The options of a list column, or null (none given). */
export const optionsOf = (col: ResolvedColumn<unknown>): unknown => col.def.edit?.options ?? (col.type === 'enum' ? col.def.enumOptions : null) ?? null;
/** A list searched on the server (1.15.0, editors.md 23), when its entry is given; else options, or null. */
export const listOf = (o: EditorsOptions, col: ResolvedColumn<unknown>): unknown => (o.search && col.def.edit?.search) || optionsOf(col);
/** The editor of a column (editors.md 1, step06-plan « Choice of editor »), or null: none. */
export function kindOf(g: GridContext<unknown>, o: EditorsOptions, col: ResolvedColumn<unknown> | undefined): Kind | null {
  if (!col) return null;
  const e = col.def.edit?.editor;
  const reg = g.parts();
  const part = (n: string) => (reg[n]?.slot === 'editor' ? (reg[n]!.part as Part<SlotContext['editor']>) : null);
  if (e != null && !BUILT.includes(e)) return part(e);
  const t = e ?? part(`editor.${col.type}`) ?? (listOf(o, col) ? 'list' : col.type);
  return typeof t !== 'string' ? t : t === 'list' ? (listOf(o, col) ? t : 'text') : BUILT.includes(t) ? (t as Kind) : null;
}
/** A number as typed: the shortest text that reads back the same, the locale's decimal sign, the grid's digits, no groups. */
const numText = (g: GridContext<unknown>, v: number): string => {
  const nf = new Intl.NumberFormat(intlTag(g.ctx));
  const dot = nf.formatToParts(0.5).find((p) => p.type === 'decimal')?.value ?? '.';
  return String(v).replace(/[\d.]/g, (c) => (c === '.' ? dot : nf.format(+c)));
};
/** A value as the column shows it (an enum's label, a yes/no's word); a string as it is. */
export function shownOf(g: GridContext<unknown>, col: ResolvedColumn<unknown>, v: unknown): string {
  if (v == null) return '';
  try {
    const x = col.codec.coerce(v, g.ctx);
    return x === null ? String(v) : col.codec.format(x as never, g.ctx);
  } catch {
    return String(v);
  }
}
/** A value as it opens in a text field: numbers as typed, the rest as shown. */
export const textOf = (g: GridContext<unknown>, col: ResolvedColumn<unknown>, v: unknown): string =>
  typeof v === 'number' && col.type === 'number' ? numText(g, v) : typeof v === 'string' && col.type === 'text' ? v : shownOf(g, col, v);

/** A text, number or date field: the step-5 `<input>` (a `<textarea>` for long text). */
export function fieldOf(g: GridContext<unknown>, col: ResolvedColumn<unknown>, kd: Kind, name: string): HTMLInputElement {
  const f = g.doc.createElement(kd === 'textarea' ? 'textarea' : 'input') as HTMLInputElement;
  const a = (n: string, v: string): void => f.setAttribute(n, v);
  f.className = 'dzg-field';
  a('autocomplete', 'off');
  a('enterkeyhint', 'done');
  // The column's and the row's headers (the header cells carry no id: a name, not aria-labelledby).
  a('aria-label', name);
  // The cap (S5-O5, review R3): a whole number ≥ 1 (at most 2^31 − 1); 0 or Infinity: none; anything else 1 000.
  const max = col.def.edit?.maxLength ?? 1000;
  if (max !== 0 && max !== Infinity) f.maxLength = Number.isInteger(max) && max > 0 ? Math.min(max, 2 ** 31 - 1) : 1000;
  if (kd === 'text' || kd === 'textarea') a('dir', 'auto');
  else a('dir', 'ltr'), a('spellcheck', 'false'), kd === 'number' && a('inputmode', 'decimal');
  return f;
}

/**
 * Home, End, PageUp, PageDown in a field: Chrome on a Mac scrolls the grid on Home/End instead of moving the caret
 * (the edited row left the view), PageUp/PageDown scroll it everywhere. Taken here: Home and End move the caret
 * (Shift extends the selection), the pages nothing; the grid never scrolls under an open field.
 */
export function caretOf(f: HTMLElement, e: KeyboardEvent, plain: boolean): boolean {
  if (!plain || e.target !== f || !(f instanceof HTMLInputElement) || !/^(Home|End|Page(Up|Down))$/.test(e.key)) return false;
  const end = f.value.length;
  // Shift keeps the selection's anchor (the end it started from, review R3).
  const a = f.selectionDirection === 'backward' ? f.selectionEnd! : f.selectionStart!;
  if (e.key === 'Home') f.setSelectionRange(0, e.shiftKey ? a : 0, 'backward');
  else if (e.key === 'End') f.setSelectionRange(e.shiftKey ? a : end, end, 'forward');
  return true;
}
