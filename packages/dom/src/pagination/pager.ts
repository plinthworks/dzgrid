import { formattersFor } from '@dzgrid/core';
import type { Part, SlotContext } from '../part.js';
import { attr, button, el, tx } from './context.js';

type C = SlotContext['footer'];
const canLast = (p: C['page']): boolean => p.canJump && p.pageCount !== null && p.index < p.pageCount - 1;

/**
 * `footer.pager`: first, previous, the page, next, last, and the rows per page (a native select).
 * A button that cannot act is `aria-disabled` (never `disabled`: the focus never falls to the
 * page) and its click does nothing. Last: not drawn by cursor (no jump), never enabled with an
 * unknown total. An update writes texts and states only: the nodes, and the focus, stay.
 */
export const pagerPart: Part<C> = {
  mount(host, c) {
    const doc = host.ownerDocument;
    // Each arrow a character in the DOM (U+00AB, U+2039, U+203A, U+00BB), hidden from the name: no border a host's
    // unlayered reset could erase (Tailwind 3's preflight), and Bidi_Mirrored, so right to left draws them turned.
    const [first, prev, next, last] = (['first', 'prev', 'next', 'last'] as const).map((go, i) => {
      const b = button(doc, 'data-go', go);
      const g = el(doc, 'span', '');
      g.setAttribute('aria-hidden', 'true');
      g.textContent = '\xab\u2039\u203a\xbb'[i]!;
      b.append(g);
      return b;
    }) as [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement, HTMLButtonElement];
    const text = el(doc, 'span', 'dzg-ppage');
    const label = el(doc, 'label', 'dzg-psize');
    const name = el(doc, 'span', '');
    const select = el(doc, 'select', '');
    label.append(name, select);
    host.append(first, prev, text, next, last, label);
    // Each reads the context at the click (next and prev read the page itself).
    first.addEventListener('click', () => c.page.index > 0 && c.go(0));
    prev.addEventListener('click', () => c.prev());
    next.addEventListener('click', () => c.next());
    last.addEventListener('click', () => canLast(c.page) && c.go(c.page.pageCount! - 1));
    select.addEventListener('change', () => c.setSize(Number(select.value)));
    let options = '';
    const update = (n: C): void => {
      c = n;
      const p = n.page;
      const page = p.index + 1;
      for (const [b, key, off] of [[first, 'pager.first', p.index === 0], [prev, 'pager.prev', p.index === 0], [next, 'pager.next', !p.hasNext], [last, 'pager.last', !canLast(p)]] as const) {
        attr(b, 'aria-label', n.msg(key));
        attr(b, 'aria-disabled', String(off));
      }
      if (!p.canJump) last.remove();
      tx(text, p.pageCount === null ? n.msg('pager.pageOpen', { page }) : n.msg('pager.page', { page, count: p.pageCount }));
      tx(name, n.msg('pager.size'));
      // The model's sizes, and the current one when the host's list lacks it, in the grid's digits.
      const sizes = [...new Set([...p.sizes, p.size])].sort((a, b) => a - b);
      const fmt = formattersFor(n.ctx).number();
      const key = sizes.map(fmt).join();
      if (key !== options) {
        options = key;
        select.replaceChildren(...sizes.map((s) => {
          const o = el(doc, 'option', '');
          o.value = String(s);
          o.textContent = fmt(s);
          return o;
        }));
      }
      select.value = String(p.size);
      label.hidden = sizes.length < 2;
    };
    update(c);
    return { update };
  },
};
