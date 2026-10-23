// The edit marks on the browser page (Phase 5 step 4, scripts/browser.mjs `editMarksChecks`, `-- --only
// edit-marks`): a stock list of 200 rows with `@dzgrid/dom/edit` and `@dzgrid/theme/edit.css`, a save the checks
// hold and answer (`t.saves`: `ok()`, `no(err)`). Query: locale, dir, theme (light|dark), skin (midnight|clinic).
import { createGrid } from '/packages/dom/src/index.ts';
import { edit } from '/packages/dom/src/edit.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { EN } from '/packages/dom/src/locales/en.ts';
import { FR_EDIT } from '/packages/dom/src/locales/fr-edit.ts';
import { AR_EDIT } from '/packages/dom/src/locales/ar-edit.ts';
import { EN_EDIT } from '/packages/dom/src/locales/en-edit.ts';
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

type Row = { id: string; name: string; stock: number; price: number; shelf: string };
const names = lang === 'ar' ? ['باراسيتامول', 'أموكسيسيلين', 'إيبوبروفين', 'أوميبرازول'] : ['Paracétamol', 'Amoxicilline', 'Ibuprofène', 'Oméprazole'];
const rows: Row[] = Array.from({ length: 200 }, (_, i) => ({ id: `m${i}`, name: `${names[i % 4]} ${i}`, stock: (i * 37) % 120 + 1, price: ((i * 53) % 900) / 10 + 1, shelf: `A${(i % 12) + 1}` }));
const base = { fr: [FR, FR_EDIT], ar: [AR, AR_EDIT], en: [EN, EN_EDIT] }[lang];
const messages = { locale: base[0].locale, text: { ...base[0].text, ...base[1].text } };
const label = { fr: ['Médicament', 'Stock', 'Prix', 'Rayon'], ar: ['الدواء', 'المخزون', 'السعر', 'الرف'], en: ['Medicine', 'Stock', 'Price', 'Shelf'] }[lang];

const saves: { req: unknown; ok(): void; no(e: unknown): void }[] = [];
const editing = edit<Row>({ save: (req) => new Promise<void>((ok, no) => saves.push({ req, ok: () => ok(), no })) });
const grid = createGrid<Row>(document.getElementById('host')!, {
  rows, getRowId: (r) => r.id, messages, locale, label: label[1],
  columns: [
    { id: 'name', header: label[0], width: 220 },
    { id: 'stock', header: label[1], type: 'number', width: 120, editable: true, edit: { min: 0 } },
    { id: 'price', header: label[2], type: 'number', width: 120, editable: true },
    { id: 'shelf', header: label[3], width: 100, editable: true },
  ],
  features: [editing],
} as never);
const api = editing.api(grid)!;
(window as unknown as { t: unknown }).t = { grid, api, saves, key: (id: string) => dataKey(id), ready: true };
(window as unknown as { ready: boolean }).ready = true;
