import { formattersFor, readNumber, type LocaleCtx, type ResolvedColumn } from '@dzgrid/core';
import { canonical } from '@dzgrid/core/internal';

/** The column's name in the texts: its `header`, or its id. */
export const nameOf = (c: { readonly column: ResolvedColumn<unknown> }): string => c.column.def.header ?? c.column.id;

/** A number as a box shows it: the locale's digits and decimal mark, no grouping. */
export const shown = (ctx: LocaleCtx, v: unknown): string => (typeof v === 'number' ? formattersFor(ctx).number({ useGrouping: false })(v) : '');

/** What a number field holds: a number, undefined when empty, null when it does not read. */
export const numberIn = (i: HTMLInputElement, ctx: LocaleCtx): number | null | undefined => (i.value.trim() ? readNumber(i.value, ctx) : undefined);

/**
 * A text field of the filter UI: `type="text"` (never `number`), no autocomplete, no spell
 * check, no placeholder, its own direction; `inputmode="decimal"` for a number.
 */
export function textField(doc: Document, num: boolean): HTMLInputElement {
  const i = doc.createElement('input');
  i.type = 'text';
  i.className = 'dzg-finput';
  i.autocomplete = 'off';
  i.setAttribute('spellcheck', 'false');
  if (num) i.inputMode = 'decimal';
  i.dir = 'auto';
  return i;
}

/**
 * The echo rules of a field that sends what the user types (step 12, the floating box; step 13,
 * the popup): it keeps the form it last sent, canonical, and the locale it last showed. Its own
 * filter coming back leaves the text alone (shown again only in another locale); another one
 * rewrites it, unless an edit of the field's is pending (`dirty`).
 */
export interface Echo {
  /** An edit: true when it differs from the filter in force (to be sent). `ok` false: unreadable, nothing pending. */
  edit(f: unknown, state: unknown, ok?: boolean): boolean;
  /** At a draw: true when the field is to show `state` again. */
  stale(state: unknown, ctx: unknown): boolean;
  /** A new field: nothing sent yet. */
  reset(): void;
}

export function echo(): Echo {
  let sent = '';
  let lc: unknown;
  let dirty = false;
  return {
    edit: (f, state, ok = true) => (dirty = ok && (sent = canonical(f)) !== canonical(state)),
    stale(state, ctx) {
      const k = canonical(state);
      if (!(k === sent ? ((dirty = false), ctx !== lc) : !dirty)) return false;
      sent = k;
      lc = ctx;
      return true;
    },
    reset: () => void (sent = ''),
  };
}
