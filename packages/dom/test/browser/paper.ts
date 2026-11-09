// The grid on paper (Phase 11 L5, docs/behaviors/print.md 10–14; scripts/browser-print.mjs « paper »). Query: `kind` —
// `flat` (made-up patients, 12 columns, « Dossier » D0001 pinned at the start, « Code » C0001 last; `rows`, 1 200 by
// default), `wide` (the same and 4 columns of long notes with spaces, landscape by `@page`; `solid=1`: 16 unbroken ones in portrait, wider than the page in words alone — the limit of print.md 12), `grouped` (made-up teams of 1 to 9 people,
// footers and the grand total, every group open), `pivot` (sales by region and town — V001…V150, one token —, months M01…M04 as bands, two sums, `@page` landscape);
// `locale` (fr-FR, ar-DZ), `theme` (dark: the page dark too), `menu=1` (`printOnMenu`: the browser's own print builds
// the table). `window.t` gives the grid and the print entry.
import { createGrid } from '/packages/dom/src/index.ts';
import { grouping } from '/packages/dom/src/grouping.ts';
import { pivot } from '/packages/dom/src/pivot.ts';
import { spans } from '/packages/dom/src/spans.ts';
import * as P0 from '/packages/dom/src/print.ts';
import * as M from '/packages/dom/src/print-menu.ts';
const P = { ...P0, ...M };
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_GROUP } from '/packages/dom/src/locales/fr-group.ts';
import { AR_GROUP } from '/packages/dom/src/locales/ar-group.ts';
import { FR_PIVOT } from '/packages/dom/src/locales/fr-pivot.ts';
import { AR_PIVOT } from '/packages/dom/src/locales/ar-pivot.ts';
import { FR_PRINT } from '/packages/dom/src/locales/fr-print.ts';
import { AR_PRINT } from '/packages/dom/src/locales/ar-print.ts';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
const kind = q.get('kind') ?? 'flat';
const count = Number(q.get('rows') ?? 1200);
/** Landscape by `@page`, as print.md 12 tells an application whose words outgrow portrait. */
const landscape = () => document.head.append(Object.assign(document.createElement('style'), { textContent: '@page { size: A4 landscape; }' }));
const solid = q.get('solid') === '1';
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;
const pad = (n: number, k = 4) => String(n).padStart(k, '0');
const base = ar ? AR : FR;
const messages = { ...base, text: { ...base.text, ...(ar ? AR_GROUP : FR_GROUP).text, ...(ar ? AR_PIVOT : FR_PIVOT).text, ...(ar ? AR_PRINT : FR_PRINT).text } };
const title = ar ? 'قائمة المرضى' : 'Liste des patients';
document.getElementById('title')!.textContent = title;

// The kinds' literals are wider than ColumnDef's unions: a test page, not API.
let columns: any[];
let rows: any[];
let features: any[] = [];
if (kind === 'grouped') {
  // 300 teams of 1 to 9 people: group rows and totals rows land everywhere on the pages.
  rows = [];
  for (let t = 1; t <= 300; t++) for (let k = 0; k < 1 + ((t * 7) % 9); k++) rows.push({ id: `r${rows.length + 1}`, ref: `R${pad(rows.length + 1, 5)}`, team: `${ar ? 'فريق' : 'Équipe'} ${pad(t, 3)}`, hours: 1 + ((rows.length * 13) % 40) });
  columns = [{ id: 'team', header: ar ? 'الفريق' : 'Équipe', width: 200 }, { id: 'ref', header: ar ? 'الرقم' : 'Numéro', width: 120 }, { id: 'hours', header: ar ? 'الساعات' : 'Heures', type: 'number', width: 110, aggFunc: 'sum' }];
  features = [grouping({ by: ['team'], footers: 'both', expanded: 'all' })];
} else if (kind === 'pivot') {
  // 150 towns in 5 regions, 4 months × 2 sums, the month bands above the value headers. Its headers are single words
  // (« somme(Montant) »): printed in landscape.
  landscape();
  rows = [];
  for (let i = 0; i < 150 * 4; i++) { const town = Math.floor(i / 4); rows.push({ id: `s${i}`, region: `${ar ? 'منطقة' : 'Région'} ${1 + (town % 5)}`, town: `V${pad(town + 1, 3)}`, month: `M${pad(1 + (i % 4), 2)}`, amount: 100 + ((i * 37) % 900), qty: 1 + (i % 5) }); }
  columns = [{ id: 'region', header: ar ? 'المنطقة' : 'Région', width: 130 }, { id: 'town', header: ar ? 'المدينة' : 'Ville', width: 140 }, { id: 'month', header: ar ? 'الشهر' : 'Mois', width: 100 }, { id: 'amount', header: ar ? 'المبلغ' : 'Montant', type: 'number', width: 120 }, { id: 'qty', header: ar ? 'الكمية' : 'Quantité', type: 'number', width: 110 }];
  const p = pivot({ columns: ['month'], values: { amount: 'sum', qty: 'sum' } });
  features = [spans(), grouping({ by: ['region', 'town'], pivot: p, expanded: 'all' })];
} else {
  if (kind === 'wide' && !solid) landscape();
  const wards = ar ? ['القلب', 'الأطفال', 'الجراحة'] : ['Cardiologie', 'Pédiatrie', 'Chirurgie'];
  rows = Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, ref: `D${pad(i + 1)}`, name: `${ar ? 'مريض' : 'Patient'} ${i + 1}`, born: `19${50 + (i % 50)}-0${1 + (i % 9)}-1${i % 10}`, ward: wards[i % 3], room: 1 + (i % 40), pulse: 50 + (i % 70), temp: 36 + (i % 40) / 10, sys: 95 + (i % 75), spo2: 88 + (i % 12), doctor: `${ar ? 'د.' : 'Dr'} ${1 + (i % 7)}`, status: ar ? 'مستقر' : 'Stable', code: `C${pad(i + 1)}`,
    ...Object.fromEntries(Array.from({ length: solid ? 16 : 4 }, (_, k) => [`n${k}`, solid ? `Observation${k}-sans-espace-ni-coupure-${pad(i + 1)}` : `${ar ? 'ملاحظة حرة رقم' : 'Note libre numéro'} ${k} ${ar ? 'عن حالة المريض في هذا اليوم' : 'sur l’état du patient ce jour-là'} ${pad(i + 1)}`])) }));
  columns = [
    { id: 'ref', header: ar ? 'الملف' : 'Dossier', width: 100, pinned: 'start' },
    { id: 'name', header: ar ? 'الاسم' : 'Nom', width: 150 }, { id: 'born', header: ar ? 'الميلاد' : 'Naissance', type: 'day', width: 120 },
    { id: 'ward', header: ar ? 'القسم' : 'Service', width: 120 }, { id: 'room', header: ar ? 'الغرفة' : 'Chambre', type: 'number', width: 90 },
    { id: 'pulse', header: ar ? 'النبض' : 'Pouls', type: 'number', width: 80 }, { id: 'temp', header: ar ? 'الحرارة' : 'Temp.', type: 'number', width: 80 },
    { id: 'sys', header: ar ? 'الضغط' : 'Tension', type: 'number', width: 80 }, { id: 'spo2', header: 'SpO₂', type: 'number', width: 80 },
    { id: 'doctor', header: ar ? 'الطبيب' : 'Médecin', width: 120 }, { id: 'status', header: ar ? 'الحالة' : 'Statut', width: 120 },
    ...(kind === 'wide' ? Array.from({ length: solid ? 16 : 4 }, (_, k) => ({ id: `n${k}`, header: `${ar ? 'ملاحظة' : 'Note'} ${k}`, width: 200 })) : []),
    { id: 'code', header: ar ? 'الرمز' : 'Code', width: 90 },
  ];
}
const grid = createGrid<any>(document.getElementById('host')!, { rows, getRowId: (r) => r.id, columns, messages, locale, features, label: title });
if (q.get('menu') === '1') (P as any).printOnMenu(grid, { title }); // read by name: the page's check fails, not its build, before it exists
(window as any).t = { grid, title, hooked: q.get('menu') === '1' && typeof (P as any).printOnMenu === 'function', ...P }; // a test page: the checks reach it through `window`
(window as any).ready = true; // as above
