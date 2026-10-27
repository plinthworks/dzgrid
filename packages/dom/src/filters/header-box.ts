import type { Part, PartHandle, SlotContext } from '../part.js';
import { numberPart, textPart } from './inputs.js';
import { summaryPart } from './summary.js';

type HC = SlotContext['header'];
type FC = SlotContext['floating'];

/**
 * `header.filterBox` (step 21, with `slots()`): an optional ready header part, the floating row's control
 * for its kind (text: "contains", number: "equals", any other kind: the summary, which may open the
 * popup), driving the same pending edit through the header context's `filter`. A box takes the name's
 * place, the column's name as its placeholder (the header cell keeps it as its name); beside the summary
 * the name shows. The column has no filter button (owner's look, app-feedback 14 and 22). Named per column (`ui: { header: 'header.filterBox' }`). Without a filter
 * (no `filters()`, `filter: false`): the name alone. The kind is read when it mounts.
 */
export const filterBoxPart: Part<HC> = {
  mount(host, c) {
    const doc = host.ownerDocument;
    const name = doc.createElement('span');
    const box = doc.createElement('span');
    box.className = 'dzg-hfbox';
    host.append(name, box);
    let h: PartHandle<FC> | undefined;
    const draw = (n: HC): void => {
      name.textContent = n.label;
      const f = n.filter;
      if (!f) return;
      // The header's context with its filter's: what a floating cell gets (the header's column, fresh).
      const fc = { ...f, ...n } as FC;
      if (h) h.update?.(fc);
      else h = (f.kind === 'text' ? textPart : f.kind === 'number' ? numberPart : summaryPart).mount(box, fc);
      // A box takes the name's place, the name its placeholder (owner's look, app-feedback 22); the summary keeps it.
      const i = box.querySelector('input');
      name.hidden = !!i;
      if (i) i.placeholder = n.label;
    };
    draw(c);
    return { update: draw, destroy: () => h?.destroy?.(), focus: () => !!h?.focus?.() };
  },
};
