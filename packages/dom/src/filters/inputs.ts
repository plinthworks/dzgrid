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
 * applied (nor is the filter in force replaced), and is judged when the edit would apply, not per
 * keystroke: `aria-invalid` and one announcement. A text is read once, when typed. The box keeps
 * the form it last sent, so its own filter coming back leaves the text alone; another one, or a
 * locale change, rewrites it, unless an edit of the box's is pending. An edit that ends on the
 * filter in force, or an unreadable one, cancels the column's pending edit; so does the box
 * giving way to the summary, or going.
 */
function box(num: boolean): Part<FC> {
  return {
    mount(host, first) {
      const doc = host.ownerDocument;
      let c = first;
      let input: HTMLInputElement | null = null;
      let sum: View | null = null;
      /** What the box last sent or showed, canonical; the locale it showed it in. */
      let sent = '';
      let lc: unknown;
      /** An edit of the box's is pending. */
      let dirty = false;
      /** 0: the text reads; 1: a number that does not, not said yet; 2: said, marked. */
      let bad = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cancel = (): void => c.set(null, { commit: 'cancel' });

      const edits = (s: Filter | null): boolean => s === null || (num ? s.type === 'number' && s.op === 'equals' : s.type === 'text' && s.op === 'contains');
      const shown = (s: Filter | null): string => (s ? (num ? formattersFor(c.ctx).number({ useGrouping: false })(s.value as number) : (s.value as string)) : '');
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
      const typed = (e: Event): void => {
        if ((e as InputEvent).isComposing) return;
        ok();
        const v = input!.value;
        const n = num && v.trim() ? readNumber(v, c.ctx) : undefined;
        const f: Filter | null = n != null ? { type: 'number', op: 'equals', value: n } : !num && v ? { type: 'text', op: 'contains', value: v, ...((c.state as Filter | null)?.caseSensitive && { caseSensitive: true }) } : null;
        if (n === null) (bad = 1), (timer = setTimeout(judge, c.debounceMs));
        // Unreadable, or the filter in force typed again: nothing to apply.
        if ((dirty = !bad && (sent = canonical(f)) !== canonical(c.state))) c.set(f as never);
        else cancel();
      };
      const make = (): HTMLInputElement => {
        const i = doc.createElement('input');
        i.type = 'text';
        i.className = 'dzg-finput';
        i.dataset['dzgOwner'] = 'filter-input';
        i.autocomplete = 'off';
        i.setAttribute('spellcheck', 'false');
        if (num) i.inputMode = 'decimal';
        i.dir = 'auto';
        i.tabIndex = -1;
        i.addEventListener('input', typed);
        i.addEventListener('compositionend', typed);
        i.addEventListener('keydown', (e) => !e.isComposing && (e.key === 'Enter' || e.key === 'Escape') && judge());
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
        const k = canonical(s);
        if (!input) sum = null, host.replaceChildren((input = make())), (sent = '');
        // Its own filter back: shown again only in another locale. Another one: unless an edit is pending.
        if (k === sent ? ((dirty = false), c.ctx !== lc) : !dirty) {
          input.value = shown(s);
          sent = k;
          lc = c.ctx;
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
