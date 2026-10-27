import { problem, uniformRowLayout, type DisplayIndex, type RowKey } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import { sparseRowLayout, type DetailRows } from '@dzgrid/core/detail';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import { extrasOf } from './layout.js';

/** Above this many rows shown with a wrapped column, a developer warning (owner Q-R1): it still works. */
const LARGE = 10_000;

/**
 * A wrapped cell's lines (injected by the feature, not the theme: a grid without it carries none): lines of their own
 * height, one line centred in a row of the normal height as any cell, more lines below it. Unlayered, over the theme's
 * one-line `line-height` (layered or not); `--dzg-wrap-line` sets it. Pinned rows keep one line (Q9-1).
 */
export const WRAP_CSS = ':is(.dzg-body,.dzg-sticky) .dzg-cell[data-wrap]{line-height:var(--dzg-wrap-line,1.25rem);padding-block:calc((var(--dzg-row-height,2rem) - var(--dzg-line,1px) - var(--dzg-wrap-line,1.25rem))/2)}';

/**
 * `autoHeight()`: rows as tall as their tallest wrapped cell (`ColumnDef.wrap`, docs/behaviors/auto-height.md; Phase 6
 * step 9, owner Q-R1, Q9-1..Q9-4). After each paint, before the browser shows it (`GridContext.again`), the mounted rows
 * not measured yet at these widths are measured — every probe written, one layout read, every probe removed — and the
 * rows laid out again in the same frame, the row at the top of the view held where it was (S3). A fixed `rowHeight`
 * wins (nothing measured). With `@dzgrid/dom/detail`, both layouts composed (`layoutFor`).
 *
 * ```ts
 * import { autoHeight } from '@dzgrid/dom/auto-height';
 * createGrid(host, { rows, getRowId, columns: [{ id: 'note', header: 'Remarques', wrap: true }], features: [autoHeight()] });
 * ```
 */
export function autoHeight(): GridFeature {
  return { id: 'auto-height', setup };
}

function setup(g: GridContext<unknown>): FeatureHandle {
  const { columns, rowRenderer } = g;
  // Once per document or shadow root; a host with a strict CSP passes its nonce.
  const root = g.el.root.getRootNode() as Document | ShadowRoot;
  if (!root.querySelector('style[data-dzgrid-wrap]')) {
    const style = g.doc.createElement('style');
    style.setAttribute('data-dzgrid-wrap', '');
    if (g.settings.nonce) style.setAttribute('nonce', g.settings.nonce);
    style.textContent = WRAP_CSS;
    ('head' in root ? root.head : root).append(style);
  }
  /** Rows measured (their height, never under the row height) and the text they were measured with (a hash). */
  const heights = new Map<RowKey, number>();
  const texts = new Map<RowKey, number>();
  /** What every measure depends on but the text: the row height, the direction, the language, the wrapped columns' widths. */
  let sig = '';
  let told = false;
  let inner = g.layoutFor;
  // The layout: the inner feature's (detail panels) with the measured rows taller than `h` merged in. Always the outer one:
  // a feature set up after this one, or taken away, sets or clears the inner one.
  const mine: NonNullable<typeof inner> = (d, h, was) => {
    const L = inner?.(d, h, was);
    // Rows gone from the grid forget their height (a row added again is measured anew).
    for (const k of heights.keys()) if (!g.rows.row(k)) heights.delete(k), texts.delete(k);
    const at = L && (d as DetailRows<unknown>).details;
    const x = extrasOf(d, heights, h, at ? { at, heights: Array.from(at, (i) => L.heightOf(i as DisplayIndex)) } : undefined);
    return x.at.length > (at ? at.length : 0) ? sparseRowLayout(d, h, x) : (L ?? uniformRowLayout(d, h));
  };
  Object.defineProperty(g, 'layoutFor', {
    configurable: true,
    get: () => mine,
    set: (f) => void ((inner = f), delete g.laid),
  });
  // Fonts that arrive after a measure (Q9-4): everything measured again, once.
  const fonts = (g.doc as Document & { fonts?: EventTarget }).fonts;
  const late = (): void => void ((sig = ''), g.schedule());
  fonts?.addEventListener('loadingdone', late);

  g.again = () => {
    const L = columns.layout;
    const h = g.rowHeight();
    let s = '';
    let id = '';
    // A fixed row height wins (choice 1): nothing wraps into a taller row.
    if (typeof g.settings.rowHeight !== 'number') for (const x of [L.start, L.center, L.end]) x.columns.forEach((c, i) => c.def.wrap && ((id ||= c.id), (s += ` ${c.id} ${x.widths.sizeAt(i)}`)));
    if (s) s += ` ${h} ${g.dir} ${g.ctx.locale}`;
    let again = false;
    if (s !== sig) {
      sig = s;
      // Heights measured under other widths are forgotten, never guessed from them.
      if (heights.size) heights.clear(), texts.clear(), delete g.laid, (again = true);
    }
    if (!s) return again;
    if (!told && g.rows.displayed.count > LARGE) {
      told = true;
      emit(g.kernel, { type: 'problems', source: 'host', problems: [problem('auto-height-large', 'warning', `columns.${id}.wrap`)] });
    }
    // Writes: a hidden copy of each wrapped cell of the rows to measure, in its own segment (same font, direction,
    // padding), as wide as the cell, free to grow. Not a row with an open editor (its field is not its text), not a
    // detail panel, not a cell spanning rows.
    const probes: [RowKey, HTMLElement][] = [];
    const hashes = new Map<RowKey, number>();
    for (const [key, v] of rowRenderer.mounted) {
      if (v.slot || v.data === undefined || g.editor?.key === key) continue;
      const cells = [...v.cells.values()].map((c) => c.el).filter((e) => e.hasAttribute('data-wrap') && !e.hasAttribute('aria-rowspan'));
      let x = 0;
      for (const e of cells) for (const ch of e.textContent!) x = (x * 31 + ch.charCodeAt(0)) | 0;
      if (!cells.length || texts.get(key) === x) continue;
      hashes.set(key, x);
      for (const e of cells) {
        const p = e.cloneNode(true) as HTMLElement;
        Object.assign(p.style, { position: 'absolute', visibility: 'hidden', blockSize: 'auto', insetBlockEnd: 'auto' });
        e.after(p);
        probes.push([key, p]);
      }
    }
    // One read, after every write; then every probe removed.
    const read = probes.map(([key, p]) => [key, Math.ceil(p.getBoundingClientRect().height)] as const);
    for (const [, p] of probes) p.remove();
    const tall = new Map<RowKey, number>();
    for (const [key, v] of read) tall.set(key, Math.max(tall.get(key) ?? h, v));
    for (const [key, v] of tall) {
      if ((heights.get(key) ?? h) !== v) delete g.laid, (again = true);
      heights.set(key, v);
      texts.set(key, hashes.get(key)!);
    }
    return again;
  };

  return {
    destroy() {
      fonts?.removeEventListener('loadingdone', late);
      delete (g as { layoutFor?: unknown }).layoutFor;
      g.layoutFor = inner;
      delete g.again;
    },
  };
}
