import { readNumber, type ColumnFilter } from '@dzgrid/core';
import type { Part, SlotContext } from '../part.js';
import { composing } from '@dzgrid/dom/internal';
import { echo, nameOf, shown, textField } from './field.js';
import { summaryView, type View } from './summary.js';

type FC = SlotContext['floating'];
type Filter = ColumnFilter & { readonly value?: unknown; readonly caseSensitive?: boolean };

/**
 * The box of the floating row (docs/behaviors/filter-ui.md, step 12): `floating.text` edits
 * "contains", `floating.number` "equals" (owner decision O3); any other filter on the column
 * shows the summary. What is typed goes to `set` (the feature holds the pause); an emptied box
 * removes the filter. A number is read in the grid's locale; one that cannot be read is not
 * applied (nor is the filter in force replaced), and is judged when the edit would apply, not per
 * keystroke: `aria-invalid` and one announcement. A text is read once, when typed. The echo rules
 * (`field.ts`): its own filter coming back leaves the text alone; another one, or a locale change,
 * rewrites it, unless an edit of the box's is pending. An edit that ends on the filter in force,
 * or an unreadable one, cancels the column's pending edit; so does the box giving way to the
 * summary, or going.
 */
function box(num: boolean): Part<FC> {
  return {
    mount(host, first) {
      const doc = host.ownerDocument;
      let c = first;
      let input: HTMLInputElement | null = null;
      let sum: View | null = null;
      const e = echo();
      /** 0: the text reads; 1: a number that does not, not said yet; 2: said, marked. */
      let bad = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cancel = (): void => c.set(null, { commit: 'cancel' });

      const edits = (s: Filter | null): boolean => s === null || (num ? s.type === 'number' && s.op === 'equals' : s.type === 'text' && s.op === 'contains');
      const ok = (): void => {
        clearTimeout(timer);
        bad = 0;
        input!.removeAttribute('aria-invalid');
      };
      // An unreadable number, once the edit would apply: marked, said once. Never once gone.
      const judge = (): void => {
        if (input && bad === 1) {
          bad = 2;
          input.setAttribute('aria-invalid', 'true');
          c.announce(c.msg('filter.invalid', { column: nameOf(c) }));
        }
      };
      const typed = (ev: Event): void => {
        if ((ev as InputEvent).isComposing) return;
        ok();
        const v = input!.value;
        const n = num && v.trim() ? readNumber(v, c.ctx) : undefined;
        const f: Filter | null = n != null ? { type: 'number', op: 'equals', value: n } : !num && v ? { type: 'text', op: 'contains', value: v, ...((c.state as Filter | null)?.caseSensitive && { caseSensitive: true }) } : null;
        if (n === null) (bad = 1), (timer = setTimeout(judge, c.debounceMs));
        // Unreadable, or the filter in force typed again: nothing to apply.
        if (e.edit(f, c.state, !bad)) c.set(f as never);
        else cancel();
      };
      const make = (): HTMLInputElement => {
        const i = textField(doc, num);
        i.dataset['dzgOwner'] = 'filter-input';
        i.tabIndex = -1;
        i.addEventListener('input', typed);
        i.addEventListener('compositionend', typed);
        i.addEventListener('keydown', (k) => !composing(k) && (k.key === 'Enter' || k.key === 'Escape') && judge());
        i.addEventListener('blur', judge);
        return i;
      };
      const draw = (): void => {
        const s = c.state as Filter | null;
        if (!edits(s)) {
          if (input) input = null, host.replaceChildren(), cancel();
          (sum ??= summaryView(host)).draw(c);
          return;
        }
        if (!input) sum = null, host.replaceChildren((input = make())), e.reset();
        // Its own filter back: shown again only in another locale. Another one: unless an edit is pending.
        if (e.stale(s, c.ctx, c.dropped)) {
          input.value = s ? (num ? shown(c.ctx, s.value) : (s.value as string)) : '';
          ok();
        }
        input.setAttribute('aria-label', c.msg('filter.inputLabel', { column: nameOf(c) }));
      };
      draw();
      return {
        update(n) {
          c = n;
          draw();
        },
        destroy() {
          input = null;
          cancel();
        },
        focus() {
          if (!input) return !!sum?.focus();
          input.focus();
          input.select();
          return true;
        },
      };
    },
  };
}

export const textPart = box(false);
export const numberPart = box(true);
