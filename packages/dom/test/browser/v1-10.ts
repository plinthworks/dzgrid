// 1.10.0 in real browsers (scripts/browser-1-10.mjs): group rows apart from the column headers (`headerHeight: { columns,
// groups }`), the filter row's own height, columns fitted at load, titles on several lines, the column under the pointer.
// `?lang=ar` right to left, `?dark=1`, `?narrow=1` a 420 px grid. Made-up rows: a tea house's tastings.
import type { ColumnOrGroup, GridEvent, Problem } from '@dzgrid/core';
import { createGrid, type GridMessages } from '../../src/index.js';
import { spans } from '../../src/spans.js';
import { filters } from '../../src/filters-base.js';
import { columns as columnsFeature } from '../../src/columns.js';
import { pinnedRows } from '../../src/pinned-rows.js';
import { wrappedHeaders } from '../../src/wrapped-headers.js';
import { columnHover } from '../../src/column-hover.js';
import { FR } from '../../src/locales/fr.js';
import { AR } from '../../src/locales/ar.js';
import { FR_FILTERS } from '../../src/locales/fr-filters.js';
import { AR_FILTERS } from '../../src/locales/ar-filters.js';
import { FR_COLUMNS } from '../../src/locales/fr-columns.js';
import { AR_COLUMNS } from '../../src/locales/ar-columns.js';
import { FR_PINNED } from '../../src/locales/fr-pinned.js';
import { AR_PINNED } from '../../src/locales/ar-pinned.js';

const q = new URLSearchParams(location.search);
const ar = q.get('lang') === 'ar';
if (q.get('dark')) document.documentElement.dataset['theme'] = 'dark';
if (q.get('narrow')) document.documentElement.style.setProperty('--w', '420px');
document.documentElement.lang = ar ? 'ar' : 'fr';
document.documentElement.dir = ar ? 'rtl' : 'ltr';

type T = { id: string; name: string; origin: string; grams: number; temp: number; minutes: number; note: string; organic: boolean };
const NAMES = ar ? ['أخضر الصباح', 'أسود الجبل', 'أبيض الربيع', 'أولونغ الوادي'] : ['Vert du matin', 'Noir des collines', 'Blanc de printemps', 'Oolong de la vallée'];
const ORIGINS = ar ? ['التلال', 'الوادي', 'الساحل'] : ['Collines', 'Vallée', 'Côte'];
const rows: T[] = Array.from({ length: 120 }, (_, i) => ({
  id: `t${i}`, name: `${NAMES[i % 4]} ${i}`, origin: ORIGINS[i % 3]!, grams: 2 + (i % 5), temp: 70 + ((i * 7) % 25), minutes: 2 + (i % 4),
  note: ar ? 'طعم خفيف ورائحة زهرية' : 'Goût léger, parfum de fleurs', organic: i % 3 === 0,
}));
const t = ar
  ? { tea: 'الشاي', name: 'الاسم', origin: 'المنشأ', measures: 'القياسات', grams: 'غرامات الأوراق لكل كوب', temp: 'درجة حرارة الماء الموصى بها', minutes: 'الدقائق', note: 'ملاحظة', organic: 'عضوي' }
  : { tea: 'Thé', name: 'Nom', origin: 'Origine', measures: 'Mesures', grams: 'Feuilles par tasse en grammes', temp: "Température de l'eau conseillée", minutes: 'Minutes', note: 'Note', organic: 'Bio' };
const columns: ColumnOrGroup<T>[] = [
  { id: 'tea', header: t.tea, children: [{ id: 'name', header: t.name, flex: 1, minWidth: 140 }, { id: 'origin', header: t.origin }] },
  { id: 'measures', header: t.measures, children: [
    { id: 'grams', header: t.grams, type: 'number', headerWrap: true },
    { id: 'temp', header: t.temp, type: 'number', headerWrap: true },
    { id: 'minutes', header: t.minutes, type: 'number' },
  ] },
  { id: 'note', header: t.note, maxWidth: 200 },
  // A yes / no column in the grid's words (1.10.0, badge-boolean.md « Yes / no … without a part »).
  { id: 'organic', header: t.organic, type: 'boolean' },
];
const base = ar ? AR : FR;
const messages: GridMessages = { ...base, text: { ...base.text, ...(ar ? AR_FILTERS : FR_FILTERS).text, ...(ar ? AR_COLUMNS : FR_COLUMNS).text, ...(ar ? AR_PINNED : FR_PINNED).text } };
const told: Problem[] = [];
const cols = columnsFeature({ fitOnLoad: 'content' });
const grid = createGrid<T>(document.getElementById('host')!, {
  rows, getRowId: (r) => r.id, columns, messages, locale: ar ? 'ar' : 'fr-FR', timeZone: 'UTC', direction: ar ? 'rtl' : 'ltr',
  rowHeight: 36, headerHeight: { columns: 48, groups: 28 }, label: ar ? 'التذوق' : 'Dégustations',
  features: [spans(), filters({ floating: true, rowHeight: 44 }), cols, pinnedRows<T>({ top: [{ id: 'ref', name: ar ? 'المرجع' : 'Référence', origin: '—', grams: 3, temp: 80, minutes: 3, note: '—', organic: false }] }), wrappedHeaders(), columnHover()],
  onEvent: (e: GridEvent<T>) => { if (e.type === 'problems') told.push(...e.problems); },
});
Object.assign(window, { grid, cols, told, ready: true });
