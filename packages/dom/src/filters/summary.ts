import type { Part, SlotContext } from '../part.js';
import { nameOf } from './field.js';

type FC = SlotContext['floating'];

export interface View {
  draw(c: FC): void;
  focus(): boolean;
}

/**
 * The summary of a filter the row cannot edit (step 12, owner decision O4): with one in force,
 * the short static text `filter.summaryActive` and a Clear button named `filter.clear {column}`,
 * which removes it at once and puts the focus back on the cell; without one, nothing. When the
 * column has a popup (step 13), the text is a button opening it (`aria-haspopup="dialog"`,
 * `aria-expanded` set by the popup), out of the Tab order like every control of the row.
 */
export function summaryView(host: HTMLElement): View {
  const doc = host.ownerDocument;
  let c: FC;
  let text: HTMLElement;
  let clear: HTMLButtonElement | null = null;
  let opens = false;
  const button = (): HTMLButtonElement => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    return b;
  };
  return {
    draw(n) {
      c = n;
      if (n.state === null) {
        host.replaceChildren();
        clear = null;
        return;
      }
      if (!clear || opens !== n.canOpen) {
        opens = n.canOpen;
        text = opens ? button() : doc.createElement('span');
        text.className = 'dzg-fsum';
        if (opens) {
          text.setAttribute('aria-haspopup', 'dialog');
          text.setAttribute('aria-expanded', 'false');
          text.addEventListener('click', () => c.openFilter());
        }
        clear = button();
        clear.className = 'dzg-fclear';
        clear.addEventListener('click', () => {
          if (host.contains(doc.activeElement)) host.focus();
          c.set(null, { commit: 'now' });
        });
        host.replaceChildren(text, clear);
      }
      text.textContent = n.msg('filter.summaryActive');
      clear.setAttribute('aria-label', n.msg('filter.clear', { column: nameOf(n) }));
    },
    focus: () => !!clear && ((opens ? text : clear).focus(), true),
  };
}

/** The bare `floating` part: the summary, for the kinds without a `floating.<kind>` part. */
export const summaryPart: Part<FC> = {
  mount(host, c) {
    const v = summaryView(host);
    v.draw(c);
    return { update: v.draw, focus: v.focus };
  },
};
