// 1.13.0, the owner's app's last patches as options, in real browsers (scripts/browser-1-12.mjs (14); owner 2026-11-16,
// « A »): a master grid wider than its host whose panels are grids following its columns (`nestedGrid({ arrows: 'rows',
// inlineScroll: 'master' })`, `headers: 'none'`, an empty first column the keys skip under the master's chevron column),
// `focusVisible: 'keyboard'` on the master. `?lang=ar`, `?dark=1`, `?css=unlayered`, `?preflight=1`. Made-up rows: a
// bakery's ovens and their batches.
import type { ColumnDef, Problem } from '@dzgrid/core';
import { createGrid, type GridMessages } from '/packages/dom/src/index.ts';
import { detail, nestedGrid } from '/packages/dom/src/detail.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_DETAIL } from '/packages/dom/src/locales/fr-detail.ts';
import { AR_DETAIL } from '/packages/dom/src/locales/ar-detail.ts';

const q = new URLSearchParams(location.search);
const ar = q.get('lang') === 'ar';
if (q.get('dark')) document.documentElement.dataset['theme'] = 'dark';
document.documentElement.lang = ar ? 'ar' : 'fr';
document.documentElement.dir = ar ? 'rtl' : 'ltr';

type O = { id: string; oven: string; temp: number; batch: string; note: string; at: string };
type B = { id: string; oven: string; temp: number; batch: string; note: string; at: string };
const t = ar
  ? { oven: 'الفرن', temp: 'الحرارة', batch: 'الدفعة', note: 'ملاحظة', at: 'الوقت' }
  : { oven: 'Four', temp: 'Température', batch: 'Fournée', note: 'Note', at: 'Heure' };
const ovens: O[] = Array.from({ length: 12 }, (_, i) => ({ id: `o${i}`, oven: ar ? `فرن ${i + 1}` : `Four ${i + 1}`, temp: 180 + i * 5, batch: ar ? `دفعة ${i}` : `Fournée ${i}`, note: ar ? 'جاهز' : 'Prêt', at: `0${i % 10}:00` }));
const batches = (o: O): B[] => Array.from({ length: 3 }, (_, j) => ({ id: `${o.id}-b${j}`, oven: o.oven, temp: o.temp - j, batch: ar ? `دفعة ${o.id}-${j}` : `Fournée ${o.id}-${j}`, note: ar ? `فحص ${j}` : `Contrôle ${j}`, at: `1${j}:30` }));
// The same ids and widths on both sides (the « follow » recipe): the master's chevron column, the panel's empty one.
const W = { open: 40, oven: 160, temp: 200, batch: 260, note: 320, at: 200 };
const cols = <R,>(inner: boolean): ColumnDef<R, any>[] => [
  { id: 'open', header: ar ? 'تفاصيل' : 'Détails', width: W.open, sortable: false, value: () => '', ...(inner && { keyboard: false as const }) },
  { id: 'oven', header: t.oven, width: W.oven },
  { id: 'temp', header: t.temp, type: 'number', width: W.temp },
  { id: 'batch', header: t.batch, width: W.batch },
  { id: 'note', header: t.note, width: W.note },
  { id: 'at', header: t.at, width: W.at },
];
const base = ar ? AR : FR;
const messages: GridMessages = { ...base, text: { ...base.text, ...(ar ? AR_DETAIL : FR_DETAIL).text } };
const told: Problem[] = [];
const onEvent = (e: { readonly type: string; readonly problems?: readonly Problem[] }) => { if (e.problems) told.push(...e.problems); };
const grid = createGrid<O>(document.getElementById('host')!, {
  rows: ovens, getRowId: (r) => r.id, columns: cols<O>(false), messages, locale: ar ? 'ar-DZ' : 'fr-FR', timeZone: 'UTC',
  label: ar ? 'الأفران' : 'Fours', focusVisible: 'keyboard', onEvent,
  features: [detail<O>({
    column: 'open', height: 160,
    part: nestedGrid<B>({
      arrows: 'rows', inlineScroll: 'master',
      settings: (c) => ({ rows: batches(c.row as O), getRowId: (r) => r.id, columns: cols<B>(true), messages, locale: ar ? 'ar-DZ' : 'fr-FR', timeZone: 'UTC', headers: 'none', label: ar ? 'الدفعات' : 'Fournées', onEvent }),
    }),
  })],
});
Object.assign(window, { grid, told, ready: true });
