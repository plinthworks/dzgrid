// Row grouping on the browser page (Phase 7 steps 5–6, scripts/browser-grouping.mjs): made-up shops in four regions,
// their fruit, a quantity (sum), a price (mean), a day (earliest); grouped by region then fruit, group footers and the
// grand total, the « Regrouper par » band and the column menu. Query: locale, theme, `rows` (2 000 by default),
// `big=1` (20 000 rows, two regions of 10 000, grouped by region only: the exit criterion's group), `pin=1` (« Boutique »
// pinned at the start, « Prix » at the end). `preparePrint` for step 7's PDF (print.md « Grouped rows »).
import { createGrid } from '/packages/dom/src/index.ts';
import { grouping } from '/packages/dom/src/grouping.ts';
import { groupZone } from '/packages/dom/src/group-zone.ts';
import { columns } from '/packages/dom/src/columns.ts';
import { columnMenu } from '/packages/dom/src/column-menu.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_GROUP } from '/packages/dom/src/locales/fr-group.ts';
import { AR_GROUP } from '/packages/dom/src/locales/ar-group.ts';
import { FR_COLUMNS } from '/packages/dom/src/locales/fr-columns.ts';
import { AR_COLUMNS } from '/packages/dom/src/locales/ar-columns.ts';
import { FR_COLUMN_MENU } from '/packages/dom/src/locales/fr-column-menu.ts';
import { AR_COLUMN_MENU } from '/packages/dom/src/locales/ar-column-menu.ts';
import { preparePrint } from '/packages/dom/src/print.ts';
import { FR_PRINT } from '/packages/dom/src/locales/fr-print.ts';
import { AR_PRINT } from '/packages/dom/src/locales/ar-print.ts';
import { dataKey, groupKey } from '@dzgrid/core';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
const big = q.get('big') === '1';
const total = big ? 20_000 : Number(q.get('rows') ?? 2_000);
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

type Row = { id: string; shop: string; region: string; fruit: string; qty: number | null; price: number; day: string };
const regions = ar ? ['شمال', 'جنوب', 'شرق', 'غرب'] : ['Nord', 'Sud', 'Est', 'Ouest'];
const fruit = ar ? ['تفاح', 'إجاص', 'تين', 'تمر'] : ['pomme', 'poire', 'figue', 'datte'];
const rows: Row[] = Array.from({ length: total }, (_, i) => ({
  id: `b${i}`, shop: `${ar ? 'متجر' : 'Boutique'} ${i}`, region: regions[big ? i % 2 : i % 4]!, fruit: fruit[Math.floor(i / 4) % 4]!,
  qty: i % 13 === 0 ? null : (i * 37) % 100, price: ((i * 13) % 50) / 4 + 1, day: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
}));
const base = ar ? AR : FR;
const messages = { ...base, text: { ...base.text, ...(ar ? AR_GROUP : FR_GROUP).text, ...(ar ? AR_COLUMNS : FR_COLUMNS).text, ...(ar ? AR_COLUMN_MENU : FR_COLUMN_MENU).text, ...(ar ? AR_PRINT : FR_PRINT).text } };
const pin = q.get('pin') === '1';
const g = grouping(big ? { by: ['region'] } : { by: ['region', 'fruit'], footers: 'both' });
const moves = columns();
const grid = createGrid<Row>(document.getElementById('host')!, {
  rows, getRowId: (r) => r.id, messages, locale,
  columns: [
    { id: 'shop', header: ar ? 'المتجر' : 'Boutique', width: 220, ...(pin && { pinned: 'start' as const }) },
    { id: 'region', header: ar ? 'المنطقة' : 'Région', width: 130 },
    { id: 'fruit', header: ar ? 'الفاكهة' : 'Fruit', width: 130 },
    { id: 'qty', header: ar ? 'الكمية' : 'Quantité', type: 'number', width: 120, aggFunc: 'sum' },
    { id: 'price', header: ar ? 'السعر' : 'Prix', type: 'number', width: 110, aggFunc: 'avg', numberFormat: { maximumFractionDigits: 2 }, ...(pin && { pinned: 'end' as const }) },
    { id: 'day', header: ar ? 'اليوم' : 'Jour', type: 'day', width: 140, aggFunc: 'min' },
  ] as never, // `numberFormat` beside a spread pin: the literal's union is wider than ColumnDef's; a page, not API
  features: [moves, g, groupZone({ use: { grouping: g, columns: moves } }), columnMenu({ use: { grouping: g, columns: moves } })],
  selection: { mode: 'multi', checkbox: true, click: true },
});
// The checks reach the page through `window` (untyped on purpose: a test page).
(window as any).t = { grid, preparePrint, api: () => g.api(grid), key: (id: string) => dataKey(id)!, groupKey, regions, fruit, scrollTo: (l: number) => (grid as any).scroll.scrollTo(l) }; // the grid's scroller is internal: reached for the checks
(window as any).ready = true; // as above
