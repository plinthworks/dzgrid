// The editors on the browser page (Phase 5 step 5, scripts/browser.mjs `editorsChecks`, `-- --only editors`): a
// stock list with `@dzgrid/dom/edit`, `@dzgrid/dom/editors` and `@dzgrid/theme/edit.css`; the medicine column
// pinned at the start. Query: locale, dir, theme (light|dark), skin (midnight|clinic), rows, numerals (locale);
// kinds=1 (step 6) adds a day (Péremption), an instant (Reçu, Europe/Paris or zone=), a list (Statut) and a yes/no
// (En stock) after the note; calfail=1 makes the calendar's chunk fail once.
import { createGrid } from '/packages/dom/src/index.ts';
import { edit } from '/packages/dom/src/edit.ts';
import { editors } from '/packages/dom/src/editors.ts';
import { listEditor } from '/packages/dom/src/editors-list.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { EN } from '/packages/dom/src/locales/en.ts';
import { FR_EDIT } from '/packages/dom/src/locales/fr-edit.ts';
import { AR_EDIT } from '/packages/dom/src/locales/ar-edit.ts';
import { EN_EDIT } from '/packages/dom/src/locales/en-edit.ts';
import { FR_EDITORS } from '/packages/dom/src/locales/fr-editors.ts';
import { AR_EDITORS } from '/packages/dom/src/locales/ar-editors.ts';
import { EN_EDITORS } from '/packages/dom/src/locales/en-editors.ts';
import { dataKey } from '@dzgrid/core';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const lang = locale.slice(0, 2) as 'fr' | 'ar' | 'en';
document.documentElement.lang = locale;
document.documentElement.dir = q.get('dir') ?? (lang === 'ar' ? 'rtl' : 'ltr');
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

let last: Element = document.querySelector('link[rel=stylesheet]')!;
const link = (href: string) =>
  new Promise<void>((done, fail) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onload = () => done();
    l.onerror = () => fail(new Error(href));
    last.after(l);
    last = l;
  });
const skin = q.get('skin');
if (skin) await link(`/packages/theme/${skin}.css`);
await link('/packages/theme/edit.css');

type Row = { id: string; name: string; stock: number; price: number; shelf: string; note: string; exp: string; recv: string; status: string; ok: boolean };
const names = lang === 'ar' ? ['باراسيتامول', 'أموكسيسيلين', 'إيبوبروفين', 'أوميبرازول'] : ['Paracétamol', 'Amoxicilline', 'Ibuprofène', 'Oméprazole'];
const n = Number(q.get('rows') ?? 200);
const rows: Row[] = Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `${names[i % 4]} ${i}`, stock: (i * 37) % 120 + 1, price: ((i * 53) % 900) / 10 + 1, shelf: `A${(i % 12) + 1}`, note: '', exp: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`, recv: i % 2 ? '2026-10-25T00:30:00Z' : '2026-03-29T10:05:00Z', status: ['ok', 'low', 'out', 'back'][i % 4]!, ok: i % 3 === 0 }));
const base = { fr: [FR, FR_EDIT, FR_EDITORS], ar: [AR, AR_EDIT, AR_EDITORS], en: [EN, EN_EDIT, EN_EDITORS] }[lang];
const messages = { locale: base[0].locale, text: { ...base[0].text, ...base[1].text, ...base[2].text } };
const label = { fr: ['Médicament', 'Stock', 'Prix', 'Rayon', 'Note', 'Péremption', 'Reçu', 'Statut', 'En stock'], ar: ['الدواء', 'المخزون', 'السعر', 'الرف', 'ملاحظة', 'الصلاحية', 'الاستلام', 'الحالة', 'متوفر'], en: ['Medicine', 'Stock', 'Price', 'Shelf', 'Note', 'Expiry', 'Received', 'Status', 'In stock'] }[lang];
const ST = { fr: ['Disponible', 'Bas', 'Épuisé', 'Commandé'], ar: ['متوفر', 'منخفض', 'نفد', 'مطلوب'], en: ['Available', 'Low', 'Out', 'Ordered'] }[lang];
const kinds = q.get('kinds') === '1';
let failed = q.get('calfail') !== '1';
const loadCalendar = () => (failed ? import('/packages/dom/src/editors/dates/calendar.ts') : ((failed = true), Promise.reject(new Error('offline (calfail=1)'))));

const editing = edit<Row>();
const events: { type: string; [k: string]: unknown }[] = [];
const grid = createGrid<Row>(document.getElementById('host')!, {
  rows, getRowId: (r) => r.id, messages, locale, label: label[1], ...(q.get('numerals') === 'locale' && { numerals: 'locale' }),
  columns: [
    { id: 'name', header: label[0], width: 200, pinned: 'start' },
    { id: 'stock', header: label[1], type: 'number', width: 110, editable: true, edit: { min: 0 } },
    { id: 'price', header: label[2], type: 'number', width: 110, editable: true },
    { id: 'shelf', header: label[3], width: 100, editable: true },
    { id: 'note', header: label[4], width: kinds ? 160 : 400, editable: true },
    ...(kinds ? [
      { id: 'exp', header: label[5], type: 'day', width: 140, editable: true },
      { id: 'recv', header: label[6], type: 'instant', width: 180, editable: true },
      { id: 'status', header: label[7], type: 'enum', width: 150, editable: true, enumOptions: ['ok', 'low', 'out', 'back'].map((value, i) => ({ value, label: ST[i] })) },
      { id: 'ok', header: label[8], type: 'boolean', width: 90, editable: true },
    ] : []),
  ],
  ...(q.get('zone') ? { timeZone: q.get('zone') } : kinds ? { timeZone: 'Europe/Paris' } : {}),
  // The real `import()` by default (the lazy checks watch its requests); calfail=1: a loader failing once.
  features: [editing, editors({ list: listEditor, ...(q.get('calfail') === '1' && { loadCalendar: loadCalendar as never }) })],
  onEvent: (e) => events.push(e as never),
} as never);
const api = editing.api(grid)!;
(window as unknown as { t: unknown }).t = { grid, api, events, key: (id: string) => dataKey(id), ready: true };
(window as unknown as { ready: boolean }).ready = true;
