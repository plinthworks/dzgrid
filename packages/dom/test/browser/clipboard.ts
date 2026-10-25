// The clipboard on the browser page (Phase 5 step 11b, scripts/browser-clipboard.mjs, `-- --only clipboard`):
// `@dzgrid/dom/range` with `@dzgrid/dom/edit` (a recording save that answers at once) and `@dzgrid/dom/editors`.
// Query: locale, theme (light|dark), skin (midnight|clinic), shadow=1 (the grid inside an open shadow root, review 1). `window.t`: the grid, the requests, cells, the block,
// what the live regions said, a MutationObserver count of elements a paste could have brought, the source button
// whose own `copy` handler writes `window.t.next` (Firefox and WebKit: no clipboard permission, events only).
import { createGrid } from '/packages/dom/src/index.ts';
import { range } from '/packages/dom/src/range.ts';
import { edit } from '/packages/dom/src/edit.ts';
import { editors } from '/packages/dom/src/editors.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_RANGE } from '/packages/dom/src/locales/fr-range.ts';
import { AR_RANGE } from '/packages/dom/src/locales/ar-range.ts';
import { FR_EDIT } from '/packages/dom/src/locales/fr-edit.ts';
import { AR_EDIT } from '/packages/dom/src/locales/ar-edit.ts';
import { FR_EDITORS } from '/packages/dom/src/locales/fr-editors.ts';
import { AR_EDITORS } from '/packages/dom/src/locales/ar-editors.ts';
import { dataKey } from '@dzgrid/core';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;
let last: Element = document.querySelector('link[rel=stylesheet]')!;
const link = (href: string) => new Promise<void>((done, fail) => {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  l.onload = () => done();
  l.onerror = () => fail(new Error(href));
  last.after(l);
  last = l;
});
if (q.get('skin')) await link(`/packages/theme/${q.get('skin')}.css`);
await link('/packages/theme/range.css');
await link('/packages/theme/edit.css');

type Row = { id: string; name: string; qty: number; price: number; st: string; ref: string };
const rows: Row[] = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, name: `${ar ? 'طلب' : 'Commande'} ${i}`, qty: i, price: i + 0.5, st: i % 2 ? 'out' : 'in', ref: `R${i}` }));
const text = ar ? { ...AR.text, ...AR_RANGE.text, ...AR_EDIT.text, ...AR_EDITORS.text } : { ...FR.text, ...FR_RANGE.text, ...FR_EDIT.text, ...FR_EDITORS.text };
const requests: { origin: string; changes: { key: string; column: string; value: unknown }[] }[] = [];
const editing = edit<Row>({ save: (req) => void requests.push({ origin: req.origin, changes: req.changes.map((c) => ({ key: String(c.key).replace(/^d:\d+:/, ''), column: c.column, value: c.value })) }) });
const blocks = range();
// shadow=1: the grid in an open shadow root, the page's style sheets cloned into it.
const shadow = q.get('shadow') === '1';
const sr = shadow ? document.getElementById('host')!.attachShadow({ mode: 'open' }) : null;
if (sr) for (const l of document.querySelectorAll('link[rel=stylesheet]')) sr.append(l.cloneNode());
const mount = sr ? sr.appendChild(Object.assign(document.createElement('div'), { style: 'block-size: 480px' })) : document.getElementById('host')!;
const scope: ParentNode = sr ?? document;
const grid = createGrid<Row>(mount, {
  rows, getRowId: (r) => r.id, messages: { locale: ar ? 'ar' : 'fr', text }, locale, timeZone: 'Africa/Algiers', label: ar ? 'الطلبات' : 'Commandes',
  columns: [
    { id: 'name', header: ar ? 'الطلب' : 'Commande', width: 180, editable: true },
    { id: 'qty', header: ar ? 'الكمية' : 'Qté', type: 'number', width: 110, editable: true, edit: { min: 0 } },
    { id: 'price', header: ar ? 'المبلغ' : 'Montant', type: 'number', width: 130, editable: true },
    { id: 'st', header: ar ? 'الحالة' : 'Statut', type: 'enum', width: 130, editable: true, enumOptions: [{ value: 'in', label: ar ? 'متوفر' : 'En stock' }, { value: 'out', label: ar ? 'نفد' : 'Rupture' }] },
    { id: 'ref', header: 'Réf', width: 100 },
  ],
  features: [editing, editors(), blocks],
} as never);
const ctx = (grid as unknown as { context: { rowRenderer: { keyOf(e: Element): unknown } } }).context;
const cell = (id: string, col: string) => [...scope.querySelectorAll('.dzg-layer > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === dataKey(id))?.querySelector<HTMLElement>(`[data-col="${col}"]`) ?? null;
const said: string[] = [];
for (const el of scope.querySelectorAll('.dzg-live')) new MutationObserver(() => { if (el.textContent) said.push(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true });
// What a paste could bring into the page: any element of these kinds added anywhere, any `on…` attribute.
const brought: string[] = [];
new MutationObserver((list) => {
  for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) {
    const e = n as Element;
    const bad = e.matches('img, script, iframe, svg, object, link, style, meta, base, video') ? [e] : [...e.querySelectorAll('img, script, iframe, svg, object, link, style, meta, base, video')];
    for (const x of bad) brought.push(x.tagName);
    if ([...e.attributes].some((a) => /^on/i.test(a.name))) brought.push(`on* on ${e.tagName}`);
  }
}).observe(document, { childList: true, subtree: true });
const t = {
  grid, blocks, editing, requests, cell, said, brought, ar,
  block: () => {
    const r = blocks.api(grid)!.get();
    const id = (k: unknown) => String(k).replace(/^d:\d+:/, '');
    return r ? `${id(r.anchor.row)}/${r.anchor.column}:${id(r.focus.row)}/${r.focus.column}` : null;
  },
  value: (id: string, col: string) => cell(id, col)?.textContent ?? null,
  /** Brings a row into view (the grid's own scroll), before a real click on its cell. */
  show: (id: string, col: string) => (grid.api as unknown as { ensureVisible?(k: unknown, c: string): void }).ensureVisible?.(dataKey(id), col),
  changes: () => requests.flatMap((r) => r.changes.map((c) => `${c.key}/${c.column}=${JSON.stringify(c.value)}`)),
  /** What the source button's own `copy` handler writes next (Firefox and WebKit: no clipboard permission). */
  next: { 'text/plain': '', 'text/html': '' } as Record<string, string>,
  /** What a paste into the textarea read as HTML. */
  pastedHtml: '',
};
// On the document, by the focus: Firefox sends `copy` to <body> (spike S7).
document.addEventListener('copy', (e) => {
  if (document.activeElement?.id !== 'src') return;
  for (const [k, v] of Object.entries(t.next)) if (v) e.clipboardData!.setData(k, v);
  e.preventDefault();
});
document.getElementById('ta')!.addEventListener('paste', (e) => void (t.pastedHtml = e.clipboardData!.getData('text/html')));
(window as unknown as { t: typeof t; ready: boolean }).t = t;
(window as unknown as { ready: boolean }).ready = true;
