// Phase 6 steps 8b-1 and 8b-2 (docs/phase-6-steps/step08b-plan.md; docs/behaviors/pinned-rows.md): rows pinned to the top and the
// bottom, editable. A pharmacy's stock (invented products, seed 2026): the top row « Objectif » (the target stock and
// price, editable), the bottom row « Total » (sums of the stock and its value, recomputed after each saved change; its
// « Note » cell editable, its numbers read-only through `editable(row, ctx, { pinned })`). The save is simulated (0.4 s)
// and refuses a stock above 5 000. Sorting, filtering never move the two rows; the keys go through them (↑ ↓ from the
// header, PageUp / PageDown, Ctrl+Home / End to the body). Blocks, copy / paste, Delete, Ctrl+D / R and the fill handle work
// inside one band, by the keys and the mouse, never across its edge (8b-2). `?lang=ar`, `?theme=dark`, `?many=1` (12
// reference rows: the band takes at most half the view and scrolls inside, by the wheel and the keys).
import '../packages/theme/dzgrid.css';
import '../packages/theme/edit.css';
import '../packages/theme/pinned-rows.css';
import '../packages/theme/range.css';
import '../packages/theme/fill.css';
import { createGrid } from '@dzgrid/dom';
import { edit } from '@dzgrid/dom/edit';
// By path, not `@dzgrid/dom/…`: no alias added to vite.config.ts while the playground server runs (a config change reloads it).
import { editors } from '../packages/dom/src/editors.js';
import { range } from '@dzgrid/dom/range';
import { fill } from '@dzgrid/dom/fill';
import { pinnedRows } from '../packages/dom/src/pinned-rows.js';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { FR_EDIT } from '@dzgrid/dom/locales/fr-edit';
import { AR_EDIT } from '@dzgrid/dom/locales/ar-edit';
import { FR_EDITORS } from '@dzgrid/dom/locales/fr-editors';
import { AR_EDITORS } from '@dzgrid/dom/locales/ar-editors';
import { FR_PINNED } from '@dzgrid/dom/locales/fr-pinned';
import { FR_RANGE } from '@dzgrid/dom/locales/fr-range';
import { AR_RANGE } from '@dzgrid/dom/locales/ar-range';
import { FR_FILL } from '@dzgrid/dom/locales/fr-fill';
import { AR_FILL } from '@dzgrid/dom/locales/ar-fill';
import { AR_PINNED } from '@dzgrid/dom/locales/ar-pinned';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { seeded } from './demos/seed.js';

interface Item { id: string; name: string; stock: number; price: number | null; note: string }
const q = new URLSearchParams(location.search);
const ar = q.get('lang') === 'ar';
const dark = q.get('theme') === 'dark';
const many = q.get('many') === '1';
document.documentElement.lang = ar ? 'ar' : 'fr';
document.documentElement.dir = ar ? 'rtl' : 'ltr';
document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';

const T = ar
  ? { title: 'صفوف مثبّتة: هدف في الأعلى ومجموع في الأسفل', back: '→ الأمثلة', lang: 'اللغة', theme: 'المظهر', many: '12 صفًا مرجعيًا (نصف العرض على الأكثر)',
      name: 'المنتج', stock: 'المخزون', price: 'سعر الوحدة', value: 'القيمة', note: 'ملاحظة', target: 'الهدف', total: 'المجموع', ref: 'مرجع', saved: 'حُفظ', refused: 'رُفض',
      steps: ['الصف «الهدف» في الأعلى والصف «المجموع» في الأسفل يبقيان ظاهرين أثناء التمرير، ولا يتغيّران بالترتيب أو التصفية.', 'من الترويسة ↓ يصل إلى الهدف ثم إلى الجدول؛ من آخر صف ↓ يصل إلى المجموع. PageDown وCtrl+Home تبقى في الجدول.', 'عدّل الهدف (F2 أو اكتب مباشرة). أرقام المجموع للقراءة فقط وتُحسب بعد كل حفظ؛ خلية «ملاحظة» فيه قابلة للتعديل. Ctrl+Z يلغي.', 'الحفظ محاكى (0.4 ث) ويرفض مخزونًا فوق 5000.', 'مع 12 صفًا مرجعيًا: Shift+الأسهم أو السحب بالفأرة يحدّد كتلة داخل الشريط فقط؛ Ctrl+C / Ctrl+V، Delete، Ctrl+D ومقبض النسخ تبقى فيه.'] }
  : { title: 'Lignes épinglées : un objectif en haut, un total en bas', back: '← Démos', lang: 'Langue', theme: 'Thème', many: '12 lignes de référence (la moitié de la vue au plus)',
      name: 'Produit', stock: 'Stock', price: 'Prix unitaire', value: 'Valeur', note: 'Note', target: 'Objectif', total: 'Total', ref: 'Référence', saved: 'enregistré', refused: 'refusé',
      steps: ['La ligne « Objectif » en haut et la ligne « Total » en bas restent visibles quand la grille défile ; un tri ou un filtre ne les déplace jamais.', 'Depuis l’en-tête, ↓ va sur l’objectif puis dans la grille ; depuis la dernière ligne, ↓ va sur le total. PageDown, Ctrl+Home / Fin restent dans la grille.', 'Modifiez l’objectif (F2 ou tapez directement). Les nombres du total sont en lecture seule et recalculés après chaque enregistrement ; sa cellule « Note » se modifie. Ctrl+Z annule.', 'L’enregistrement est simulé (0,4 s) et refuse un stock au-dessus de 5 000.', 'Avec 12 lignes de référence : Maj+flèches ou un glisser à la souris font un bloc dans le bandeau seulement ; Ctrl+C / Ctrl+V, Suppr, Ctrl+D et la poignée de recopie y restent.'] };
const $ = (id: string) => document.getElementById(id)!;
document.title = `DzGrid — ${T.title}`;
$('title').textContent = T.title;
$('back').textContent = T.back;
$('steps').replaceChildren(...T.steps.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
for (const [id, text] of [['lang-label', T.lang], ['theme-label', T.theme], ['many-label', T.many]] as const) $(id).textContent = text;
($('lang') as HTMLSelectElement).value = ar ? 'ar' : 'fr';
($('theme') as HTMLSelectElement).value = dark ? 'dark' : 'light';
($('many') as HTMLInputElement).checked = many;
for (const id of ['lang', 'theme', 'many']) $(id).addEventListener('change', () => {
  const p = new URLSearchParams({ lang: ($('lang') as HTMLSelectElement).value, theme: ($('theme') as HTMLSelectElement).value });
  if (($('many') as HTMLInputElement).checked) p.set('many', '1');
  location.search = p.toString();
});

// ---- the data: 300 invented products.
const r = seeded(2026);
const FORMS = ar ? ['أقراص', 'شراب', 'مرهم', 'حقن', 'قطرات'] : ['comprimés', 'sirop', 'pommade', 'injectable', 'gouttes'];
const NAMES = ar ? ['باراسيتامول', 'أموكسيسيلين', 'إيبوبروفين', 'ميتفورمين', 'أوميبرازول', 'سالبوتامول'] : ['Paracétamol', 'Amoxicilline', 'Ibuprofène', 'Metformine', 'Oméprazole', 'Salbutamol'];
const rows: Item[] = Array.from({ length: 300 }, (_, i) => ({ id: `p${i + 1}`, name: `${r.pick(NAMES)} ${r.pick(FORMS)} ${i + 1}`, stock: r.int(0, 800), price: r.int(50, 2500), note: '' }));
const byId = new Map(rows.map((x) => [x.id, x]));
const target: Item = { id: 'target', name: T.target, stock: 500, price: 900, note: '' };
const refs = (): Item[] => (many ? Array.from({ length: 12 }, (_, i) => ({ ...target, id: `ref${i + 1}`, name: `${T.ref} ${i + 1}`, stock: 100 * (i + 1) })) : [target]);
let note = '';
const totals = (): Item => ({ id: 'total', name: T.total, stock: rows.reduce((a, x) => a + x.stock, 0), price: null, note });

const money = { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 } as const;
const columns: ColumnDef<Item, any>[] = [
  { id: 'name', header: T.name, width: 280, pinned: 'start', editable: (_r: Item, _c: unknown, i: { pinned?: string }) => !i.pinned },
  { id: 'stock', header: T.stock, type: 'number', width: 120, edit: { min: 0 }, editable: (_r: Item, _c: unknown, i: { pinned?: string }) => i.pinned !== 'bottom' },
  { id: 'price', header: T.price, type: 'number', width: 150, numberFormat: money, edit: { min: 0 }, editable: (_r: Item, _c: unknown, i: { pinned?: string }) => i.pinned !== 'bottom' },
  { id: 'value', header: T.value, type: 'number', width: 170, numberFormat: money, value: (x: Item) => (x.id === 'total' ? rows.reduce((a, y) => a + y.stock * (y.price ?? 0), 0) : x.stock * (x.price ?? 0)) },
  { id: 'note', header: T.note, width: 260, editable: true },
];

const log: string[] = [];
const say = (line: string) => { log.unshift(line); log.length = Math.min(log.length, 5); $('log').textContent = log.join('\n'); };
const pins = pinnedRows<Item>({ top: refs(), bottom: [totals()] });
const blocks = range();
/** The simulated save: 0.4 s; a stock above 5 000 refused. A body change recomputes the total; a pinned one keeps its row. */
const save = (req: SaveRequest<Item>) => new Promise<void>((ok, fail) => setTimeout(() => {
  const bad = req.changes.find((c) => c.column === 'stock' && (c.value as number) > 5000);
  if (bad) return fail({ reason: ar ? 'أكثر من 5000' : 'plus de 5 000' });
  const changed = new Set<Item>();
  for (const c of req.changes) {
    // A body row: the page's own copy written, the grid given a new object (as a refetch would); a pinned row: its object.
    const row = c.pinned ? (c.row as Item) : byId.get((c.row as Item).id)!;
    Object.assign(row, { [c.column]: c.value });
    if (!c.pinned) changed.add(row);
    if (c.pinned === 'bottom' && c.column === 'note') note = String(c.value ?? '');
    say(`${c.pinned ?? (ar ? 'الجدول' : 'grille')} · ${row.name} · ${c.column} = ${String(c.value)} · ${T.saved}`);
  }
  if (changed.size) grid.kernel.rows.applyTransaction({ update: [...changed].map((x) => ({ ...x })) });
  // The total recomputed from the page's rows (its « Note » kept).
  pins.api(grid)!.set({ bottom: [totals()] });
  ok();
}, 400));
const base = ar ? AR : FR;
const grid = createGrid<Item>($('host'), {
  rows, getRowId: (x) => x.id, columns, locale: ar ? 'ar-DZ' : 'fr-FR', direction: 'auto', label: T.title,
  messages: { ...base, text: { ...base.text, ...(ar ? AR_EDIT : FR_EDIT).text, ...(ar ? AR_EDITORS : FR_EDITORS).text, ...(ar ? AR_PINNED : FR_PINNED).text, ...(ar ? AR_RANGE : FR_RANGE).text, ...(ar ? AR_FILL : FR_FILL).text } },
  rowClass: (c) => (c.pinned === 'bottom' ? 'pin-total' : null),
  features: [pins, edit<Item>({ save }), editors(), blocks, fill(blocks)],
  onEvent: (e: GridEvent<Item>) => { if (e.type === 'saveFailed') say(`${String(e.key)} · ${e.column} · ${T.refused}: ${e.reason ?? ''}`); },
});
// For the browser checks (scripts/browser-pinned-rows.mjs).
Object.assign(window, { __pinned: { grid, pins, rows, blocks } });
