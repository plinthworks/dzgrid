import type { GridContext } from '../context.js';
import { cellValue } from '../render/rows.js';

/**
 * Auto-size's measure (Phase 6 step 6, docs/behaviors/column-resize.md 11–12; owner Q6-2, Q6-3, Q6-4): what each column
 * needs, as the browser draws it. Each probe is a copy of a real cell beside it — the header, every mounted body cell
 * (its badge, its tree indentation and chevron) — or, for another of the first 200 displayed rows, a plain cell with the
 * column's formatted text (a text already met is not measured again); each takes its parent's font and direction, at
 * `max-content`, unseen. Every probe is written, then every width read (one layout), then every probe removed: never a
 * layout read per cell. A row not mounted is measured as its text alone (a lower bound for a part). The widths are whole
 * pixels, rounded up (a clipped Arabic letter is a visible defect); min and max are the layout's.
 */
export function fits(g: GridContext<unknown>, ids: readonly string[]): Map<string, number> {
  const { el, columns: m, rows } = g;
  const d = rows.displayed;
  const all: [string, HTMLElement][] = [];
  const put = (id: string, x: HTMLElement, at: Element | null | undefined) => {
    if (!at) return;
    x.style.cssText += ';position:absolute;visibility:hidden;inline-size:max-content';
    at.append(x);
    all.push([id, x]);
  };
  // A body row's segment: the cells' font and direction for a text alone.
  const seg = el.body.querySelector('.dzg-seg');
  for (const id of ids) {
    const col = m.get(id)!;
    const h = g.headerRenderer.cell(id);
    put(id, h?.cloneNode(true) as HTMLElement, h?.parentElement);
    const seen = new Set<string>();
    for (const c of el.body.querySelectorAll<HTMLElement>('.dzg-cell')) if (c.dataset['col'] === id) seen.add(c.textContent!), put(id, c.cloneNode(true) as HTMLElement, c.parentElement);
    for (let i = 0; i < Math.min(200, d.count); i++) {
      const n = d.nodeAt(d.index(i)!);
      const t = n.kind === 'data' ? cellValue(col, n.data, g.ctx, g.edit?.read, n.key).text : '';
      if (seen.has(t)) continue;
      seen.add(t);
      const x = g.doc.createElement('div');
      x.className = 'dzg-cell';
      x.textContent = t;
      put(id, x, seg);
    }
  }
  const w = all.map(([, x]) => x.getBoundingClientRect().width);
  const r = new Map<string, number>();
  all.forEach(([id, x], i) => (x.remove(), r.set(id, Math.max(r.get(id) ?? 0, Math.ceil(w[i]!)))));
  return r;
}
