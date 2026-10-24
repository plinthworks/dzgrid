// The saves end to end on the browser page (Phase 5 step 7, scripts/browser.mjs `editSavesChecks`, `-- --only
// edit-saves`): 200 stock rows with `edit()`, `editors()` and, unless `motion=0`, `motion()`; a save the checks hold
// and answer (`t.saves`: `ok()`, `no(err)`); `paged=1`: a server's pages (20 rows), answered at once (`t.fetches`).
// Query: locale, theme (light|dark), skin (midnight|clinic), motion (0|1), paged (0|1).
import { createGrid } from '/packages/dom/src/index.ts';
import { edit } from '/packages/dom/src/edit.ts';
import { editors } from '/packages/dom/src/editors.ts';
import { motion } from '/packages/dom/src/motion-gsap.ts';
import { sourceRows } from '/packages/core/src/server.ts';
import { gsap } from 'gsap';
import { dataKey } from '@dzgrid/core';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const lang = locale.slice(0, 2) as 'fr' | 'ar' | 'en';
document.documentElement.lang = locale;
document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
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
if (q.get('skin')) await link(`/packages/theme/${q.get('skin')}.css`);
await link('/packages/theme/edit.css');

const [base, ed, eds] = await Promise.all([import(`/packages/dom/src/locales/${lang}.ts`), import(`/packages/dom/src/locales/${lang}-edit.ts`), import(`/packages/dom/src/locales/${lang}-editors.ts`)]);
const pick = (m: Record<string, { text?: object; locale?: string }>) => Object.values(m)[0]!;
const messages = { locale: pick(base).locale, text: { ...pick(base).text, ...pick(ed).text, ...pick(eds).text } };
type Row = { id: string; name: string; stock: number; price: number };
const names = lang === 'ar' ? ['باراسيتامول', 'أموكسيسيلين', 'إيبوبروفين'] : ['Paracétamol', 'Amoxicilline', 'Ibuprofène'];
let rows: Row[] = Array.from({ length: 200 }, (_, i) => ({ id: `m${i}`, name: `${names[i % 3]} ${i}`, stock: (i * 37) % 120 + 1, price: ((i * 53) % 900) / 10 + 1 }));
const label = { fr: ['Médicament', 'Stock', 'Prix'], ar: ['الدواء', 'المخزون', 'السعر'], en: ['Medicine', 'Stock', 'Price'] }[lang];

const saves: { req: unknown; ok(): void; no(e: unknown): void }[] = [];
const editing = edit<Row>({ save: (req) => new Promise<void>((ok, no) => saves.push({ req, ok: () => ok(), no })) });
const paged = q.get('paged') === '1';
const fetches: unknown[] = [];
const hooks: string[] = [];
const moving = motion({ gsap, onCell: (_el, c, reason) => void hooks.push(`${String(c.key)}:${c.column}:${reason}`) });
const grid = createGrid<Row>(document.getElementById('host')!, {
  ...(paged
    ? { source: sourceRows<Row>({ fetch: (req) => (fetches.push(req), Promise.resolve({ rows: rows.slice(req.page!.offset, req.page!.offset + req.page!.size).map((r) => ({ ...r })), total: rows.length })) }), operations: 'server', pagination: { pageSize: 20 } }
    : { rows }),
  getRowId: (r: Row) => r.id, messages, locale, label: label[1],
  columns: [
    { id: 'name', header: label[0], width: 220 },
    { id: 'stock', header: label[1], type: 'number', width: 120, editable: true, edit: { min: 0 }, sortable: true },
    { id: 'price', header: label[2], type: 'number', width: 120, editable: true },
  ],
  features: [editing, editors(), ...(q.get('motion') === '0' ? [] : [moving])],
} as never);
const api = editing.api(grid)!;
if (q.get('motion') !== '0') await moving.load();
const key = (id: string) => dataKey(id);
const cell = (id: string, col = 'stock') => [...document.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => (grid as never as { context: { rowRenderer: { keyOf(r: Element): unknown } } }).context.rowRenderer.keyOf(r) === key(id))?.querySelector<HTMLElement>(`[data-col="${col}"]`) ?? null;
(window as unknown as { t: unknown }).t = {
  grid, api, saves, fetches, hooks, key, cell,
  remove: (id: string) => ((rows = rows.filter((r) => r.id !== id)), paged ? grid.kernel.dispatch({ type: 'rows.refresh' }, 'api') : grid.kernel.rows.applyTransaction({ remove: [id] })),
};
(window as unknown as { ready: boolean }).ready = true;
