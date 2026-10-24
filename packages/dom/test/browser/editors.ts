// The editors on the browser page (Phase 5 step 5, scripts/browser.mjs `editorsChecks`, `-- --only editors`): a
// stock list with `@dzgrid/dom/edit`, `@dzgrid/dom/editors` and `@dzgrid/theme/edit.css`; the medicine column
// pinned at the start. Query: locale, dir, theme (light|dark), skin (midnight|clinic), rows, numerals (locale).
import { createGrid } from '/packages/dom/src/index.ts';
import { edit } from '/packages/dom/src/edit.ts';
import { editors } from '/packages/dom/src/editors.ts';
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

type Row = { id: string; name: string; stock: number; price: number; shelf: string; note: string };
const names = lang === 'ar' ? ['باراسيتامول', 'أموكسيسيلين', 'إيبوبروفين', 'أوميبرازول'] : ['Paracétamol', 'Amoxicilline', 'Ibuprofène', 'Oméprazole'];
const n = Number(q.get('rows') ?? 200);
const rows: Row[] = Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `${names[i % 4]} ${i}`, stock: (i * 37) % 120 + 1, price: ((i * 53) % 900) / 10 + 1, shelf: `A${(i % 12) + 1}`, note: '' }));
const base = { fr: [FR, FR_EDIT, FR_EDITORS], ar: [AR, AR_EDIT, AR_EDITORS], en: [EN, EN_EDIT, EN_EDITORS] }[lang];
const messages = { locale: base[0].locale, text: { ...base[0].text, ...base[1].text, ...base[2].text } };
const label = { fr: ['Médicament', 'Stock', 'Prix', 'Rayon', 'Note'], ar: ['الدواء', 'المخزون', 'السعر', 'الرف', 'ملاحظة'], en: ['Medicine', 'Stock', 'Price', 'Shelf', 'Note'] }[lang];

const editing = edit<Row>();
const events: { type: string; [k: string]: unknown }[] = [];
const grid = createGrid<Row>(document.getElementById('host')!, {
  rows, getRowId: (r) => r.id, messages, locale, label: label[1], ...(q.get('numerals') === 'locale' && { numerals: 'locale' }),
  columns: [
    { id: 'name', header: label[0], width: 200, pinned: 'start' },
    { id: 'stock', header: label[1], type: 'number', width: 110, editable: true, edit: { min: 0 } },
    { id: 'price', header: label[2], type: 'number', width: 110, editable: true },
    { id: 'shelf', header: label[3], width: 100, editable: true },
    { id: 'note', header: label[4], width: 400, editable: true },
  ],
  features: [editing, editors()],
  onEvent: (e) => events.push(e as never),
} as never);
const api = editing.api(grid)!;
(window as unknown as { t: unknown }).t = { grid, api, events, key: (id: string) => dataKey(id), ready: true };
(window as unknown as { ready: boolean }).ready = true;
