// Detail rows on the browser page (Phase 4 step 9, scripts/browser.mjs `detailChecks`): 1 000 000 rows and
// 2 000 open details of 240 px, masters spread from row 0 to row 999 999 (spike S12's numbers), so the last
// row shown is the detail of row 999 999. A test feature stands for `@dzgrid/dom/detail` (step 10): the
// core's detail shape and its sparse layout; the detail cells are empty. Query: locale, dir, theme.
import { createGrid } from '/packages/dom/src/index.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { dataKey, detailKey } from '@dzgrid/core';
import { detailShape, sparseRowLayout } from '@dzgrid/core/detail';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
document.documentElement.lang = locale;
document.documentElement.dir = q.get('dir') ?? (ar ? 'rtl' : 'ltr');
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

type Row = { id: number; name: string; n: number };
const N = 1_000_000;
const rows: Row[] = new Array(N);
for (let i = 0; i < N; i++) rows[i] = { id: i, name: `${ar ? 'مريض' : 'Patient'} ${i}`, n: (i * 7919) % 1000 };
const masters = Array.from({ length: 2000 }, (_, j) => Math.round((j * (N - 1)) / 1999));
const key = (i: number) => dataKey(String(i))!;
const feature = {
  id: 'detail',
  shape: () => detailShape<Row>({ height: 240 }),
  setup(g: any) {
    g.layoutFor = (d: any, h: number) => sparseRowLayout(d, h, { at: d.details, heights: d.heights });
    return { destroy() {} };
  },
};
const grid = createGrid<Row>(document.getElementById('host')!, {
  rows, getRowId: (r) => String(r.id), messages: ar ? AR : FR, locale,
  columns: [
    { id: 'name', header: ar ? 'الاسم' : 'Nom', width: 200 },
    { id: 'n', header: 'N', type: 'number', width: 100 },
    ...Array.from({ length: 6 }, (_, k) => ({ id: `c${k}`, header: `C${k}`, width: 120, value: (r: Row) => (r.n * (k + 3)) % 97 })),
  ],
  features: [feature as never],
});
grid.kernel.dispatch({ type: 'rows.expand', rows: masters.map(key), expanded: true }, 'host');
const ctx = (grid as any).context;
(window as any).t = {
  grid, ctx, masters, key, x: (i: number) => detailKey(key(i)),
  scrollTo: (l: number) => (grid as any).scroll.scrollTo(l), logicalTop: () => ctx.scroll.logicalTop,
};
(window as any).ready = true;
