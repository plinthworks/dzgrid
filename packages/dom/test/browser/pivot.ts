// The pivot with its bar on the browser page (Phase 11 L4a, scripts/browser-a11y.mjs): made-up sales of a bookshop —
// region, town, month, amount, quantity; rows by region then town, columns by month, two sums; the « Lignes │ Colonnes
// │ Valeurs » bar, the column menu, the columns panel docked at the end (`dock=0`: no dock). Query: locale (fr-FR,
// ar-DZ), theme. `window.t` gives the grid and the pivot's api.
import { createGrid } from '/packages/dom/src/index.ts';
import { grouping } from '/packages/dom/src/grouping.ts';
import { pivot } from '/packages/dom/src/pivot.ts';
import { pivotBar } from '/packages/dom/src/pivot-bar.ts';
import { groups } from '/packages/dom/src/groups.ts';
import { spans } from '/packages/dom/src/spans.ts';
import { columns } from '/packages/dom/src/columns.ts';
import { columnMenu } from '/packages/dom/src/column-menu.ts';
import { columnsChooser } from '/packages/dom/src/columns-panel.ts';
import { dock } from '/packages/dom/src/dock.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_GROUP } from '/packages/dom/src/locales/fr-group.ts';
import { AR_GROUP } from '/packages/dom/src/locales/ar-group.ts';
import { FR_PIVOT } from '/packages/dom/src/locales/fr-pivot.ts';
import { AR_PIVOT } from '/packages/dom/src/locales/ar-pivot.ts';
import { FR_PIVOT_BAR } from '/packages/dom/src/locales/fr-pivot-bar.ts';
import { AR_PIVOT_BAR } from '/packages/dom/src/locales/ar-pivot-bar.ts';
import { FR_COLUMNS } from '/packages/dom/src/locales/fr-columns.ts';
import { AR_COLUMNS } from '/packages/dom/src/locales/ar-columns.ts';
import { FR_COLUMN_MENU } from '/packages/dom/src/locales/fr-column-menu.ts';
import { AR_COLUMN_MENU } from '/packages/dom/src/locales/ar-column-menu.ts';
import { FR_DOCK } from '/packages/dom/src/locales/fr-dock.ts';
import { AR_DOCK } from '/packages/dom/src/locales/ar-dock.ts';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

type Sale = { id: string; region: string; town: string; month: string; amount: number; qty: number };
const towns: Record<string, string[]> = ar
  ? { 'الشمال': ['مدينة النخيل', 'ميناء الريح'], 'الجنوب': ['واحة القمر', 'رمال الذهب'], 'الشرق': ['تل الزيتون'] }
  : { Nord: ['Port-Brise', 'Val-Clair'], Sud: ['Oasis-Lune', 'Sable-d’Or'], Est: ['Mont-Olive'] };
const all = Object.entries(towns).flatMap(([r, ts]) => ts.map((t) => [r, t] as const));
const sales: Sale[] = Array.from({ length: 600 }, (_, i) => {
  const [region, town] = all[i % all.length]!;
  return { id: `s${i}`, region, town, month: String(1 + ((i * 7) % 6)).padStart(2, '0'), amount: 100 + ((i * 37) % 900), qty: 1 + (i % 5) };
});
const base = ar ? AR : FR;
const pick = <T extends { text: object }>(fr: T, a: T) => (ar ? a : fr).text;
const messages = { ...base, text: { ...base.text, ...pick(FR_GROUP, AR_GROUP), ...pick(FR_PIVOT, AR_PIVOT), ...pick(FR_PIVOT_BAR, AR_PIVOT_BAR), ...pick(FR_COLUMNS, AR_COLUMNS), ...pick(FR_COLUMN_MENU, AR_COLUMN_MENU), ...pick(FR_DOCK, AR_DOCK) } };
const p = pivot({ columns: ['month'], values: { amount: 'sum', qty: 'sum' } });
const g = grouping({ by: ['region', 'town'], pivot: p });
const moves = columns();
const chooser = columnsChooser();
const withDock = q.get('dock') !== '0';
const grid = createGrid<Sale>(document.getElementById('host')!, {
  rows: sales, getRowId: (s) => s.id, messages, locale,
  columns: [
    { id: 'region', header: ar ? 'المنطقة' : 'Région', width: 130 },
    { id: 'town', header: ar ? 'المدينة' : 'Ville', width: 140 },
    { id: 'month', header: ar ? 'الشهر' : 'Mois', width: 100 },
    { id: 'amount', header: ar ? 'المبلغ' : 'Montant', type: 'number', width: 120 },
    { id: 'qty', header: ar ? 'الكمية' : 'Quantité', type: 'number', width: 110 },
  ] as never, // a test page's literal: its unions are wider than ColumnDef's
  features: [spans(), groups(), moves, g, pivotBar({ use: { grouping: g, pivot: p, columns: moves } }), chooser, columnMenu({ use: { grouping: g, pivot: p, columns: moves, chooser } }), ...(withDock ? [dock({ open: { columns: 'end' } })] : [])],
  label: ar ? 'مبيعات المكتبة' : 'Ventes de la librairie',
});
(window as unknown as { t: unknown }).t = { grid, pivot: () => p.api(grid) };
(window as unknown as { ready: boolean }).ready = true;
