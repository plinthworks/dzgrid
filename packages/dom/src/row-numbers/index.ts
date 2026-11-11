import { formattersFor, type CellRange, type DisplayedRows, type RowKey } from '@dzgrid/core';
import { isCellKey, isDataKey } from '@dzgrid/core/internal';
import { needTexts } from '@dzgrid/dom/internal';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { RowNumbersMessageKey } from '../part-texts.js';
import type { RangeFeature } from '../range/index.js';
import type { RowRenderer } from '../render/rows.js';
import { setAttr } from '../render/write.js';

/** The texts `rowNumbers()` needs, from `@dzgrid/dom/locales/<lang>-row-numbers`. */
export const ROW_NUMBERS_KEYS = ['rownum.header'] as const satisfies readonly RowNumbersMessageKey[];

/**
 * The strip's layout, injected once per document or shadow root (row-numbers.md 2, 3): no colour (the theme's
 * `row-numbers.css`), logical sides only, zero specificity, in the cascade layer dzgrid.layout.
 */
/** Its layout, written once per document or shadow root; with `injectStyles: false` the page loads it itself. */
export const ROW_NUMBERS_CSS =
  '@layer dzgrid.layout{' +
  ':where(.dzg-lead){display:flex;flex:none;align-items:center;justify-content:flex-end;box-sizing:border-box;padding-inline:.375rem;overflow:hidden;white-space:nowrap;font-variant-numeric:tabular-nums;user-select:none;cursor:pointer}' +
  ':where(.dzg-pins .dzg-lead){cursor:auto}' +
  '}';

/**
 * `rowNumbers()`: 1, 2, 3… at the inline start of every row (docs/behaviors/row-numbers.md; owner decisions 2026-11-03),
 * in display order (a detail panel neither numbered nor counted; a paged grid going on from the pages before), as wide
 * as its largest number. A click on a number takes the row as the block (`range()`), Shift+click the rows between; the
 * corner every cell; without `range()`, the row selection's click; with neither, nothing. Never a column: no sort,
 * filter, edit, export, print, copy or state sees it.
 *
 * ```ts
 * import { rowNumbers } from '@dzgrid/dom/row-numbers';
 * import { FR_ROW_NUMBERS } from '@dzgrid/dom/locales/fr-row-numbers';
 * import '@dzgrid/theme/row-numbers.css';
 * createGrid(host, { messages: { ...FR, text: { ...FR.text, ...FR_ROW_NUMBERS.text } }, features: [range(), rowNumbers()], … });
 * ```
 */
export function rowNumbers(): GridFeature {
  return { id: 'row-numbers', setup };
}

function setup(g: GridContext<unknown>): FeatureHandle {
  needTexts(g, ROW_NUMBERS_KEYS, 'rowNumbers');
  const { kernel: k, el, doc } = g;
  const target = el.root.getRootNode() as Document | ShadowRoot;
  if (g.settings.injectStyles !== false && !target.querySelector?.('style[data-dzgrid-rownum]')) {
    const s = doc.createElement('style');
    s.setAttribute('data-dzgrid-rownum', '');
    if (g.settings.nonce) s.setAttribute('nonce', g.settings.nonce);
    s.textContent = ROW_NUMBERS_CSS;
    ('head' in target ? target.head : target).append(s);
  }
  // Detail panels, an application's or the collapsed columns' lines (`responsive`): not numbered.
  const details = !!g.settings.features?.some((f) => f.id === 'detail' || f.id === 'responsive');
  /** The rows before a page's first (a paged grid's numbers go on, row-numbers.md 4). */
  const offset = (): number => (g.rows.page ? g.rows.page.index * g.rows.page.size : 0);
  /** With detail panels: per shown row, how many rows before it are panels (they are not counted), once per version. */
  let memo: { d: DisplayedRows<unknown>; v: number; before: Int32Array } | null = null;
  const before = (d: DisplayedRows<unknown>): Int32Array | null => {
    if (!details) return null;
    if (memo?.d !== d || memo.v !== d.version) {
      const b = new Int32Array(d.count);
      for (let i = 0, n = 0; i < d.count; i++) (b[i] = n), d.nodeAt(d.index(i)!).kind === 'detail' && n++;
      memo = { d, v: d.version, before: b };
    }
    return memo.before;
  };
  /** As wide as the largest number needs, two digits at least, at the grid's text size (row-numbers.md 6). */
  const width = (): number => Math.round(g.remPx * (0.75 + 0.6 * Math.max(2, String(offset() + g.rows.displayed.count).length)));
  g.lead = width();

  const range = (): ReturnType<RangeFeature['api']> => (g.settings.features?.find((f) => f.id === 'range') as RangeFeature | undefined)?.api(g) ?? null;
  const ids = (): string[] => g.columns.visible().map((c) => c.id);
  /** The row a strip cell stands for: a body row's (a pinned band's has none). */
  const rowOf = (lead: Element): RowKey | null => {
    const r = lead.closest('.dzg-row');
    const key = r ? g.rowRenderer.keyOf(r) : undefined;
    return key !== undefined && g.rows.displayed.indexOf(key) >= 0 ? key : null;
  };
  const focusOn = (row: RowKey, column: string): void => {
    if (k.dispatch({ type: 'focus.set', focus: { kind: 'cell', row, column } }, 'user').ok) g.restoreFocus();
  };
  /** A click on a number or the corner (row-numbers.md 8, 9). */
  const pick = (lead: Element, e: MouseEvent): void => {
    const cols = ids();
    const first = cols[0];
    const last = cols[cols.length - 1];
    if (!first || !last) return;
    const api = range();
    const d = g.rows.displayed;
    if (lead === g.headerRenderer.lead) {
      if (api && d.count) api.set({ anchor: { row: d.keyAt(d.index(0)!), column: first }, focus: { row: d.keyAt(d.index(d.count - 1)!), column: last } });
      return;
    }
    const key = rowOf(lead);
    if (key === null) return;
    if (api) {
      if (!isCellKey(key)) return;
      const f = k.focus;
      const was: CellRange | null = api.get();
      const from = e.shiftKey ? was?.anchor.row ?? (f?.kind === 'cell' && d.indexOf(f.row) >= 0 ? f.row : null) : null;
      if (from === null) api.clear(), focusOn(key, first);
      api.set({ anchor: { row: from ?? key, column: first }, focus: { row: key, column: last } });
      return;
    }
    const mode = g.settings.selection?.mode ?? 'none';
    if (mode === 'none' || !isDataKey(key)) return;
    const toggle = g.mac ? e.metaKey : e.ctrlKey;
    if (mode === 'multi' && e.shiftKey && k.anchor !== null) k.dispatch({ type: 'selection.range', target: key, additive: toggle }, 'user');
    else {
      focusOn(key, first);
      k.dispatch(toggle && mode === 'multi' ? { type: 'selection.toggle', row: key } : { type: 'selection.only', row: key }, 'user');
    }
  };
  /** The strip's cell an event is on, in this grid (not a nested one's). */
  const leadOf = (e: Event): Element | null => {
    const t = (e.target as Element).closest?.('.dzg-lead');
    return t && t.closest('.dzg') === el.root ? t : null;
  };
  // Captured at the root: a press on a number starts no block drag, takes no focus, selects no text; its click is no row click.
  const stop = (e: Event): void => {
    if (leadOf(e)) e.preventDefault(), e.stopPropagation();
  };
  g.scope.on(el.root, 'pointerdown', stop, { capture: true });
  g.scope.on(el.root, 'mousedown', stop, { capture: true });
  g.scope.on(el.root, 'click', (e: MouseEvent) => {
    const l = leadOf(e);
    if (l) stop(e), pick(l, e);
  }, { capture: true });

  const num = (n: number): string => formattersFor(g.ctx).number({ maximumFractionDigits: 0, useGrouping: false })(n);
  const write = (x: HTMLElement, t: string): void => void (x.textContent !== t && (x.textContent = t));
  return {
    afterRows(f) {
      const w = width();
      // Wider or narrower (99 → 100 rows): the next frame lays the columns out again.
      if (w !== g.lead) (g.lead = w), g.schedule();
      const corner = g.headerRenderer.lead;
      if (corner) {
        let sr = corner.firstElementChild as HTMLElement | null;
        if (!sr) (sr = doc.createElement('span')), (sr.className = 'dzg-sr'), corner.append(sr);
        write(sr, g.msg('rownum.header'));
      }
      const d = f.displayed;
      const b = before(d);
      const o = offset() + 1;
      // The block taking whole rows (all its columns): their numbers tinted (row-numbers.md 12).
      const box = range()?.box();
      const whole = box && box.start === 0 && box.end === ids().length - 1 ? box : null;
      const each = (r: RowRenderer<unknown>): void => {
        for (const [key, v] of r.mounted) {
          if (!v.lead) continue;
          // A detail panel has no strip cell (the base's); a pinned row is in no body position: empty.
          const i = d.indexOf(key);
          write(v.lead, i < 0 ? '' : num(o + i - (b ? b[i]! : 0)));
          setAttr(v.lead, 'data-on', whole && i >= whole.top && i <= whole.bottom ? '' : null);
        }
      };
      each(g.rowRenderer);
      for (const r of g.rowRenderer.spawned) each(r);
    },
    destroy() {
      delete g.lead;
      g.schedule();
    },
  };
}
