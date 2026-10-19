import { formattersFor, readNumber, type ColumnFilter } from '@dzgrid/core';
import { canonical } from '@dzgrid/core/internal';
import type { Part, SlotContext } from '../part.js';
import { nameOf, summaryView, type View } from './summary.js';

type FC = SlotContext['floating'];
type Filter = ColumnFilter & { readonly value?: unknown; readonly caseSensitive?: boolean };

/**
 * The box of the floating row (docs/behaviors/filter-ui.md, step 12): `floating.text` edits
 * "contains", `floating.number` "equals" (owner decision O3); any other filter on the column
 * shows the summary. What is typed goes to `set` (the feature holds the pause); an emptied box
 * removes the filter. A number is read in the grid's locale; one that cannot be read is not
 * applied, and is judged when the edit would apply, not per keystroke: `aria-invalid` and one
 * announcement. The box keeps the form it last sent, so its own filter coming back leaves the
 * text alone; another one rewrites it, unless the user typed since.
 */
function box(num: boolean): Part<FC> {
  return {
    mount(host, first) {
      const doc = host.ownerDocument;
      let c = first;
      let input: HTMLInputElement | null = null;
      let sum: View | null = null;
      /** What the box last sent or showed, canonical; typed since then. */
      let sent = '';
      let dirty = false;
      let bad = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const edits = (s: Filter | null): boolean => s === null || (num ? s.type === 'number' && s.op === 'equals' : s.type === 'text' && s.op === 'contains');
      const shown = (s: Filter | null): string =>
        typeof s?.value === 'number' ? formattersFor(c.ctx).number({ useGrouping: false })(s.value) : typeof s?.value === 'string' ? s.value : '';
      const invalid = (v: string): boolean => !!v.trim() && readNumber(v, c.ctx) === null;
      const mark = (on: boolean): void => {
        if (on) input!.setAttribute('aria-invalid', 'true');
        else input!.removeAttribute('aria-invalid');
        bad = on;
      };
      // An unreadable number, once the edit would apply: marked, said once.
      const judge = (): void => {
        clearTimeout(timer);
        if (!num || !input || bad || !invalid(input.value)) return;
        mark(true);
        c.announce(c.msg('filter.invalid', { column: nameOf(c) }));
      };
      const typed = (e: Event): void => {
        if ((e as InputEvent).isComposing) return;
        clearTimeout(timer);
        dirty = true;
        const v = input!.value;
        let f: Filter | null = null;
        if (num) {
          mark(false);
          if (invalid(v)) {
            // The filter in force stays: a valid edit still pending is replaced by it.
            c.set(c.state);
            timer = setTimeout(judge, c.debounceMs);
            return;
          }
          if (v.trim()) f = { type: 'number', op: 'equals', value: readNumber(v, c.ctx)! };
        } else if (v) f = { type: 'text', op: 'contains', value: v, ...((c.state as Filter | null)?.caseSensitive && { caseSensitive: true }) };
        sent = canonical(f);
        c.set(f as never);
      };
      const make = (): HTMLInputElement => {
        const i = doc.createElement('input');
        i.type = 'text';
        i.className = 'dzg-finput';
        i.dataset['dzgOwner'] = 'filter-input';
        i.setAttribute('autocomplete', 'off');
        i.setAttribute('spellcheck', 'false');
        if (num) i.setAttribute('inputmode', 'decimal');
        i.dir = 'auto';
        i.tabIndex = -1;
        i.addEventListener('input', typed);
        i.addEventListener('compositionend', typed);
        i.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === 'Escape') && judge());
        i.addEventListener('blur', judge);
        return i;
      };
      const draw = (): void => {
        const s = c.state as Filter | null;
        if (!edits(s)) {
          if (input) input = null, host.replaceChildren();
          (sum ??= summaryView(host)).draw(c);
          return;
        }
        const k = canonical(s);
        if (!input) {
          sum = null;
          host.replaceChildren((input = make()));
          input.value = shown(s);
          sent = k;
          dirty = bad = false;
        } else if (k === sent) dirty = false;
        else if (!dirty) {
          input.value = shown(s);
          sent = k;
          mark(false);
        }
        input.setAttribute('aria-label', c.msg('filter.inputLabel', { column: nameOf(c) }));
      };
      draw();
      return {
        update(n) {
          c = n;
          draw();
        },
        destroy: () => clearTimeout(timer),
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
