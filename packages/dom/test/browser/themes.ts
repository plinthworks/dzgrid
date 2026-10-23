// The showcase themes on the browser page (docs/behaviors/theming.md, themes-plan §7 steps 2–4;
// scripts/browser.mjs `themeChecks`, `-- --only themes`). Query: locale, dir, theme (light|dark);
// skin=midnight|clinic, the showcase theme imported (every grid of the page); area=midnight|clinic, a
// second grid in #area under data-dzg-skin (its file loaded before the page's, so the page keeps its
// own); contrast=more, contrast.css and data-contrast="more" on the root; shadow=1, a third grid in a
// shadow root, the theme (and Midnight) adopted there, Midnight on a wrapper inside. Each grid: a badge
// column over every tone, a selection box, the filters' popup; « Nom » carries the app's classes on row 0.
import { createGrid, LAYOUT_CSS } from '/packages/dom/src/index.ts';
import { filters } from '/packages/dom/src/filters.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_FILTERS } from '/packages/dom/src/locales/fr-filters.ts';
import { AR_FILTERS } from '/packages/dom/src/locales/ar-filters.ts';
import { partsSetup } from './parts.ts';
import { dataKey } from '@dzgrid/core';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
// `pagelang`: the page's language when it differs from the grid's (an Arabic grid in a French page, R4).
document.documentElement.lang = q.get('pagelang') ?? locale;
document.documentElement.dir = q.get('dir') ?? (ar ? 'rtl' : 'ltr');
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

/** A stylesheet after the theme's link (before the app's <style>), loaded before the grids are made. */
const anchor = document.querySelector('link[rel=stylesheet]')!;
let last: Element = anchor;
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
const area = q.get('area');
const skin = q.get('skin');
if (area) await link(`/packages/theme/${area}.css`);
if (skin) await link(`/packages/theme/${skin}.css`);
if (q.get('contrast') === 'more') {
  await link('/packages/theme/contrast.css');
  document.documentElement.dataset['contrast'] = 'more';
}

const lang = ar ? 'ar' : 'fr';
const cellParts = await partsSetup(lang);
const base = ar ? AR : FR;
const messages = { ...base, text: { ...base.text, ...(ar ? AR_FILTERS : FR_FILTERS).text, ...cellParts.texts } };
type Row = { id: number; name: string; city: string; amount: number };
const cities = ar ? ['الجزائر', 'وهران', 'قسنطينة'] : ['Alger', 'Oran', 'Constantine'];
const rows: Row[] = Array.from({ length: 60 }, (_, i) => ({ id: i, name: ar ? `مريض ${i}` : `Patient ${i}`, city: cities[i % 3]!, amount: ((i * 7919) % 100000) / 100 }));
const columns = [
  { id: 'name', header: ar ? 'الاسم' : 'Nom', pinned: 'start' as const, width: 150, ui: { cellClass: (c: { row: Row }) => (c.row.id === 0 ? 'app-hot app-late' : null) } },
  { id: 'city', header: ar ? 'المدينة' : 'Ville', width: 130 },
  { id: 'amount', header: ar ? 'المبلغ' : 'Montant', type: 'number' as const, width: 120 },
  ...cellParts.columns,
];
const make = (host: HTMLElement, label: string, more: object = {}) =>
  createGrid<Row>(host, {
    ...more, rows, locale, direction: ar ? 'rtl' : 'ltr', getRowId: (r) => r.id, columns: columns as never, messages, locale, label, parts: cellParts.parts as never,
    features: [filters({ popup: true }) as never], selection: { mode: 'multi', checkbox: true, click: true },
  });

const grids = [make(document.getElementById('host')!, ar ? 'المرضى' : 'Patients')];
if (area) {
  const el = document.getElementById('area')!;
  el.dataset['dzgSkin'] = area;
  grids.push(make(el, ar ? 'المنطقة' : 'Zone'));
}
if (q.get('shadow')) {
  const root = document.getElementById('shadow')!.attachShadow({ mode: 'open' });
  const sheets = await Promise.all(['/packages/theme/dzgrid.css', '/packages/theme/midnight.css', ...(q.get('contrast') === 'more' ? ['/packages/theme/contrast.css'] : [])].map(async (u) => {
    const s = new CSSStyleSheet();
    // Constructed sheets take @layer, not @charset (a statement only a file may carry).
    s.replaceSync((await (await fetch(u)).text()).replace(/^@charset[^;]*;/, ''));
    return s;
  }));
  root.adoptedStyleSheets = sheets;
  const wrap = document.createElement('div');
  wrap.dataset['dzgSkin'] = 'midnight';
  wrap.style.blockSize = '100%';
  root.append(wrap);
  const inner = document.createElement('div');
  inner.style.blockSize = '100%';
  wrap.append(inner);
  grids.push(make(inner, 'Shadow'));
  (inner.firstElementChild as HTMLElement).style.blockSize = '100%';
}

// `shadowbase=order|adopt|naive` (R2, docs/behaviors/theming.md): a fourth grid in a shadow root where an
// app's Tailwind-4-like stack lives (`base` resets padding and borders). order: the app's order line in a
// <style> put there before the grid mounts; adopt: injectStyles false, the sheets adopted in order (the
// line, the base, LAYOUT_CSS, the theme); naive: neither (the grid's injected <style> declares dzgrid first).
const shadowBase = q.get('shadowbase');
if (shadowBase) {
  const root = document.getElementById('shadow2')!.attachShadow({ mode: 'open' });
  const sheet = (t: string) => { const s = new CSSStyleSheet(); s.replaceSync(t); return s; };
  const order = '@layer theme, base, dzgrid, components, utilities;';
  const reset = '@layer base { *, ::before, ::after { padding: 0; border: 0 solid; } }';
  const theme = (await (await fetch('/packages/theme/dzgrid.css')).text()).replace(/^@charset[^;]*;/, '');
  if (shadowBase === 'order') {
    const st = document.createElement('style');
    st.textContent = order;
    root.append(st);
    root.adoptedStyleSheets = [sheet(reset), sheet(theme)];
  } else if (shadowBase === 'adopt') root.adoptedStyleSheets = [sheet(order), sheet(reset), sheet(LAYOUT_CSS), sheet(theme)];
  else root.adoptedStyleSheets = [sheet(reset), sheet(theme)];
  const inner = document.createElement('div');
  inner.style.blockSize = '100%';
  root.append(inner);
  grids.push(make(inner, 'Base', shadowBase === 'adopt' ? { injectStyles: false } : {}));
}

(window as any).t = { grids, key: (id: number) => dataKey(id)! };
(window as any).ready = true;
