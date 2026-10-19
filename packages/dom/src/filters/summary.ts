import type { Part, SlotContext } from '../part.js';

type FC = SlotContext['floating'];

/** The column's name in the texts: its `header`, or its id. */
export const nameOf = (c: FC): string => c.column.def.header ?? c.column.id;

export interface View {
  draw(c: FC): void;
  focus(): boolean;
}

/**
 * The summary of a filter the row cannot edit (step 12, owner decision O4): with one in force,
 * the short static text `filter.summaryActive` and a Clear button named `filter.clear {column}`,
 * which removes it at once and puts the focus back on the cell; without one, nothing.
 */
export function summaryView(host: HTMLElement): View {
  const doc = host.ownerDocument;
  let c: FC;
  let text: HTMLElement;
  let clear: HTMLButtonElement | null = null;
  return {
    draw(n) {
      c = n;
      if (n.state === null) {
        host.replaceChildren();
        clear = null;
        return;
      }
      if (!clear) {
        text = doc.createElement('span');
        text.className = 'dzg-fsum';
        clear = doc.createElement('button');
        clear.type = 'button';
        clear.className = 'dzg-fclear';
        clear.tabIndex = -1;
        clear.addEventListener('click', () => {
          if (host.contains(doc.activeElement)) host.focus();
          c.set(null, { commit: 'now' });
        });
        host.replaceChildren(text, clear);
      }
      text.textContent = n.msg('filter.summaryActive');
      clear.setAttribute('aria-label', n.msg('filter.clear', { column: nameOf(n) }));
    },
    focus: () => !!clear && (clear.focus(), true),
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
