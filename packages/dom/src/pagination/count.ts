import type { Part, SlotContext } from '../part.js';
import { el, tx, words } from './context.js';

/** `footer.count`: where the user is, plain text (no live region: the page change is said once, by the feature). */
export const countPart: Part<SlotContext['footer']> = {
  mount(host, c) {
    const s = el(host.ownerDocument, 'span', 'dzg-pcount');
    host.append(s);
    const update = (n: SlotContext['footer']): void => {
      tx(s, words(n.msg, n));
      s.toggleAttribute('data-loading', n.status.phase === 'loading');
    };
    update(c);
    return { update };
  },
};
