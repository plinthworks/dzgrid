// Blocks of cells on the browser page (docs/behaviors/range-selection.md, fill.md; Phase 5 step 11a, scripts/browser-range.mjs, `-- --only range`): `@dzgrid/dom/range`
// with `@dzgrid/theme/range.css`. Query: locale, theme (light|dark), skin (midnight|clinic), rows (default 400; 1000000 for
// scaled scrolling), tree=1 (parents with children, two pinned parents); fill=1 (step 12: edit() and fill(), the columns
// editable, « Qté » pinned at the start too — two start-pinned columns).
import { createGrid } from '/packages/dom/src/index.ts';
import { range } from '/packages/dom/src/range.ts';
import { tree } from '/packages/dom/src/tree.ts';
import { edit } from '/packages/dom/src/edit.ts';
import { fill } from '/packages/dom/src/fill.ts';
import { FR_EDIT } from '/packages/dom/src/locales/fr-edit.ts';
import { AR_EDIT } from '/packages/dom/src/locales/ar-edit.ts';
import { FR_FILL } from '/packages/dom/src/locales/fr-fill.ts';
import { AR_FILL } from '/packages/dom/src/locales/ar-fill.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_RANGE } from '/packages/dom/src/locales/fr-range.ts';
import { AR_RANGE } from '/packages/dom/src/locales/ar-range.ts';
import { FR_TREE } from '/packages/dom/src/locales/fr-tree.ts';
import { AR_TREE } from '/packages/dom/src/locales/ar-tree.ts';
import { dataKey } from '@dzgrid/core';
import { rangeBox } from '@dzgrid/core/range';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;
let last: Element = document.querySelector('link[rel=stylesheet]')!;
const link = (href: string) => new Promise<void>((done, fail) => {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.onload = () => done();
  l.onerror = () => fail(new Error(href));
  last.after(l);
  last = l;
});
if (q.get('skin')) await link(`/packages/theme/${q.get('skin')}.css`);
await link('/packages/theme/range.css');
const withFill = q.get('fill') === '1';
if (withFill) await link('/packages/theme/fill.css');

type Row = { id: string; parent: string | null; name: string; qty: number; amount: number; c3: string; c4: string; c5: string; c6: string };
const n = Number(q.get('rows') ?? 400);
const asTree = q.get('tree') === '1';
const rows: Row[] = Array.from({ length: n }, (_, i) => ({
  id: `r${i}`, parent: asTree && i % 20 !== 0 ? `r${i - (i % 20)}` : null, name: `${ar ? 'طلب' : 'Commande'} ${i}`, qty: (i * 37) % 101, amount: ((i * 53) % 900) / 10, c3: `a${i % 9}`, c4: `b${i % 5}`, c5: `c${i % 3}`, c6: `d${i % 7}`,
}));
const text = ar ? { ...AR.text, ...AR_RANGE.text, ...AR_TREE.text, ...AR_EDIT.text, ...AR_FILL.text } : { ...FR.text, ...FR_RANGE.text, ...FR_TREE.text, ...FR_EDIT.text, ...FR_FILL.text };
const blocks = range();
const grid = createGrid<Row>(document.getElementById('host')!, {
  rows, getRowId: (r) => r.id, messages: { locale: ar ? 'ar' : 'fr', text }, locale, label: ar ? 'الطلبات' : 'Commandes',
  columns: [
    { id: 'name', header: ar ? 'الطلب' : 'Commande', width: 180, pinned: 'start', editable: withFill },
    { id: 'qty', header: ar ? 'الكمية' : 'Qté', type: 'number', width: 110, ...(withFill && { pinned: 'start', editable: true }) },
    { id: 'amount', header: ar ? 'المبلغ' : 'Montant', type: 'number', width: 130 },
    { id: 'c3', header: 'C3', width: 140 }, { id: 'c4', header: 'C4', width: 140 }, { id: 'c5', header: 'C5', width: 140 }, { id: 'c6', header: 'C6', width: 140 },
  ],
  features: [...(asTree ? [tree<Row>({ parentId: (r) => r.parent, sticky: 2 })] : []), ...(withFill ? [edit()] : []), blocks, ...(withFill ? [fill(blocks)] : [])],
} as never);
if (asTree) grid.kernel.dispatch({ type: 'rows.expandAll', expanded: true } as never, 'api');
const key = (id: string) => dataKey(id);
const ctx = (grid as unknown as { context: { rowRenderer: { keyOf(e: Element): unknown; mounted: Map<unknown, { cells: Map<string, { el: HTMLElement }> }> }; columns: { visible(): { id: string }[] } } }).context;
const cell = (id: string, col: string) => [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === key(id))?.querySelector<HTMLElement>(`[data-col="${col}"]`) ?? null;
/** Every mounted cell against the box (the oracle, by rangeBox): the wrong ones. */
const disagree = () => {
  const r = blocks.api(grid)!.get();
  const d = grid.kernel.rows.displayed;
  const cols = ctx.columns.visible().map((c) => c.id);
  const b = r && rangeBox(r, d, cols);
  const bad: string[] = [];
  for (const [k, v] of ctx.rowRenderer.mounted) {
    const i = d.indexOf(k as never);
    for (const [c, cv] of v.cells) {
      const ci = cols.indexOf(c);
      const on = !!b && i >= b.top && i <= b.bottom && ci >= b.start && ci <= b.end;
      if (cv.el.classList.contains('dzg-cell--range') !== on || (cv.el.getAttribute('aria-selected') === 'true') !== on) bad.push(`${String(k)}/${c}`);
    }
  }
  return bad;
};
const said: string[] = [];
const live = [...document.querySelectorAll('.dzg-live')].find((x) => x.getAttribute('aria-live') !== 'assertive')!;
new MutationObserver(() => { if (live.textContent) said.push(live.textContent); }).observe(live, { childList: true, characterData: true, subtree: true });
(window as unknown as { t: unknown }).t = { grid, api: blocks.api(grid), key, cell, disagree, said, block: () => { const r = blocks.api(grid)!.get(); return r ? `${String(r.anchor.row).replace(/^d:\d+:/, '')}/${r.anchor.column}:${String(r.focus.row).replace(/^d:\d+:/, '')}/${r.focus.column}` : null; } };
(window as unknown as { ready: boolean }).ready = true;
