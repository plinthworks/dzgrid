import type { SlotContext, SlotPart } from '../part.js';

/** What a ready cell part shows: its label, its glyph ('' for none) and its tone; null: nothing. */
export type Shown = readonly [label: string, glyph: string, tone?: string] | null;

/**
 * A cell part drawing `<span class="{cls}" data-tone?><span class="dzg-glyph" aria-hidden="true">glyph</span><span dir="auto">label</span></span>`
 * (docs/behaviors/badge-boolean.md): the elements made once per pooled cell and rewritten in place,
 * the box taken out of the host for a blank and put back for a value, the glyph first (the start
 * side in both directions), a write only where something changed. `read` throwing is the grid's
 * part rule: that cell empty, the error reported.
 */
export const cellPart = (cls: string, read: (c: SlotContext['cell']) => Shown): SlotPart<'cell'> => ({
  slot: 'cell',
  part: {
    mount(host, c) {
      const el = (name?: string): HTMLSpanElement => {
        const e = c.doc.createElement('span');
        if (name) e.className = name;
        return e;
      };
      const box = el(cls);
      const mark = el('dzg-glyph');
      const text = el();
      mark.setAttribute('aria-hidden', 'true');
      text.dir = 'auto';
      box.append(text);
      const paint = (n: SlotContext['cell']): void => {
        const s = read(n);
        if (!s) return box.remove();
        const [label, glyph, tone] = s;
        if (tone && box.dataset['tone'] !== tone) box.dataset['tone'] = tone;
        if (!glyph) mark.remove();
        else {
          if (mark.textContent !== glyph) mark.textContent = glyph;
          if (box.firstChild !== mark) box.prepend(mark);
        }
        if (text.textContent !== label) text.textContent = label;
        if (box.parentNode !== host) host.append(box);
      };
      paint(c);
      return { update: paint, destroy: () => box.remove() };
    },
  },
});
