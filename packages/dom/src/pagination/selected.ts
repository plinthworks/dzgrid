import type { Part, SlotContext } from '../part.js';
import { button, el, tx } from './context.js';

/**
 * `footer.selected`: what is selected ("12 rows selected", "(some not shown)", every matching row),
 * "Select all N rows" once the page is all ticked and more rows match, and "Clear selection".
 * Hidden while nothing is selected. After Select all the focus goes to Clear; after Clear, to
 * the grid (the context's `clearSelection`).
 */
export const selectedPart: Part<SlotContext['footer']> = {
  mount(host, c) {
    const doc = host.ownerDocument;
    const wrap = el(doc, 'span', 'dzg-psel');
    const text = el(doc, 'span', 'dzg-pseltext');
    const all = button(doc, 'data-act', 'all');
    const clear = button(doc, 'data-act', 'clear');
    wrap.append(text, all, clear);
    host.append(wrap);
    all.addEventListener('click', () => {
      if (!c.selection.canSelectAll) return;
      c.selectAll();
      clear.focus();
    });
    clear.addEventListener('click', () => c.clearSelection());
    const update = (n: SlotContext['footer']): void => {
      c = n;
      const s = n.selection;
      wrap.hidden = s.mode === 'none' || s.count === 0;
      const said = s.count === null ? n.msg('announce.selectedAll') : n.msg('announce.selected', { n: s.count });
      tx(text, s.count !== null && s.count > s.shown ? n.msg('selected.hidden', { selected: said }) : said);
      all.hidden = !s.canSelectAll;
      tx(all, n.msg('selected.selectAll', { n: n.counts.filtered ?? 0 }));
      tx(clear, n.msg('selected.clear'));
    };
    update(c);
    return { update };
  },
};
