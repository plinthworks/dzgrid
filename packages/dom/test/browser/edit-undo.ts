// Undo, trees and details on the browser page (Phase 5 step 8, scripts/browser.mjs `editUndoChecks`, `editTreeChecks`,
// `editDetailChecks`). `mode=flat` (default): 200 stock rows, « Médicament » pinned at the start, wide columns (the
// view scrolls sideways), `edit()`, `editors()`, `motion()`. `mode=tree`: services › wards › beds (three levels, three
// sticky parents), « Nom » the tree column, Stock and Prix editable, `structure: ['code']` (« Code » read-only).
// `mode=detail`: orders whose panel is a grid of its lines, each grid its own `edit()` and `editors()`. Every save is
// held for the checks (`t.saves`: `ok()`, `no(err)`; the lines' in `t.inner`). Query: locale, theme, skin, mode, mac
// (`mac=0`: the page says it is not a Mac, so Ctrl is the command key).
import { createGrid } from '/packages/dom/src/index.ts';
import { edit } from '/packages/dom/src/edit.ts';
import { editors } from '/packages/dom/src/editors.ts';
import { motion } from '/packages/dom/src/motion-gsap.ts';
import { tree } from '/packages/dom/src/tree.ts';
import { detail, nestedGrid } from '/packages/dom/src/detail.ts';
import { gsap } from 'gsap';
import { dataKey } from '@dzgrid/core';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const lang = locale.slice(0, 2) as 'fr' | 'ar';
const mode = q.get('mode') ?? 'flat';
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

const files = [lang, `${lang}-edit`, `${lang}-editors`, `${lang}-tree`, `${lang}-detail`];
const bundles = await Promise.all(files.map((f) => import(`/packages/dom/src/locales/${f}.ts`)));
const pick = (m: Record<string, { text?: object; locale?: string }>) => Object.values(m)[0]!;
const messages = { locale: pick(bundles[0]).locale, text: Object.assign({}, ...bundles.map((b) => pick(b).text)) };
const L = { fr: ['Médicament', 'Stock', 'Prix', 'Code', 'Nom', 'Article', 'Unités', 'Commande'], ar: ['الدواء', 'المخزون', 'السعر', 'الرمز', 'الاسم', 'الصنف', 'الوحدات', 'الطلب'] }[lang];

type Saves = { req: unknown; ok(): void; no(e: unknown): void }[];
const held = (into: Saves) => (req: unknown) => new Promise<void>((ok, no) => void into.push({ req, ok: () => ok(), no }));
const saves: Saves = [];
const inner: Saves = [];
const editing = edit<any>({ save: held(saves) as never });
const moving = motion({ gsap });
type Row = { id: string; parent?: string | null; name: string; code: string; stock: number; price: number; [k: string]: unknown };
const wide = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, header: `C${i}`, width: 140, value: (r: Row) => `${r.id}·${i}` }));
let grid: ReturnType<typeof createGrid<Row>>;
const host = document.getElementById('host')!;
if (mode === 'tree') {
  const rows: Row[] = [];
  for (let s = 0; s < 4; s++) {
    rows.push({ id: `s${s}`, parent: null, name: `Service ${s}`, code: `S${s}`, stock: s, price: 10 });
    for (let w = 0; w < 4; w++) {
      rows.push({ id: `s${s}w${w}`, parent: `s${s}`, name: `Ward ${s}.${w}`, code: `W${w}`, stock: w, price: 20 });
      for (let b = 0; b < 8; b++) rows.push({ id: `s${s}w${w}b${b}`, parent: `s${s}w${w}`, name: `Bed ${s}.${w}.${b}`, code: `B${b}`, stock: b, price: 30 + b });
    }
  }
  grid = createGrid<Row>(host, {
    rows, getRowId: (r) => r.id, messages, locale, label: L[4],
    columns: [
      { id: 'name', header: L[4], width: 240, editable: true },
      { id: 'code', header: L[3], width: 90, editable: true },
      { id: 'stock', header: L[1], type: 'number', width: 110, editable: true, edit: { min: 0 } },
      { id: 'price', header: L[2], type: 'number', width: 110, editable: true },
    ],
    features: [tree<Row>({ parentId: (r) => r.parent ?? null, sticky: 3, structure: ['code'] }), editing, editors(), moving],
  } as never);
  grid.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
} else if (mode === 'detail') {
  const lines = nestedGrid<Row>({
    settings: (c) => ({
      rows: Array.from({ length: 6 }, (_, i) => ({ id: `${(c.row as Row).id}-l${i}`, name: `${L[5]} ${i}`, code: '', stock: i + 1, price: 5 })), getRowId: (r: Row) => r.id, messages, locale,
      label: `${L[7]} ${(c.row as Row).name}`,
      columns: [{ id: 'name', header: L[5], width: 200, editable: true }, { id: 'stock', header: L[6], type: 'number', width: 110, editable: true }],
      features: [edit<Row>({ save: held(inner) as never }), editors()],
    }),
  });
  grid = createGrid<Row>(host, {
    rows: Array.from({ length: 60 }, (_, i) => ({ id: `o${i}`, name: `${L[7]} ${i}`, code: '', stock: i, price: 1 })), getRowId: (r) => r.id, messages, locale, label: L[7],
    columns: [{ id: 'name', header: L[7], width: 260, editable: true }, { id: 'stock', header: L[1], type: 'number', width: 120, editable: true }],
    features: [editing, editors(), detail<Row>({ part: lines, height: 230 })],
  } as never);
} else {
  const names = lang === 'ar' ? ['باراسيتامول', 'أموكسيسيلين', 'إيبوبروفين'] : ['Paracétamol', 'Amoxicilline', 'Ibuprofène'];
  grid = createGrid<Row>(host, {
    rows: Array.from({ length: 200 }, (_, i) => ({ id: `m${i}`, name: `${names[i % 3]} ${i}`, code: '', stock: ((i * 37) % 120) + 1, price: ((i * 53) % 900) / 10 + 1 })), getRowId: (r) => r.id, messages, locale, label: L[1],
    columns: [
      { id: 'name', header: L[0], width: 200, pinned: 'start' },
      { id: 'stock', header: L[1], type: 'number', width: 120, editable: true, edit: { min: 0 } },
      ...wide.slice(0, 3),
      { id: 'price', header: L[2], type: 'number', width: 120, editable: true },
      ...wide.slice(3),
    ],
    features: [editing, editors(), moving],
  } as never);
}
await moving.load();
const api = editing.api(grid)!;
const ctx = (grid as never as { context: { rowRenderer: { cell(k: unknown, c: string): HTMLElement | null }; mac: boolean } }).context;
if (q.get('mac') === '0') (ctx as { mac: boolean }).mac = false;
const key = (id: string) => dataKey(id);
const cell = (id: string, col = 'stock') => ctx.rowRenderer.cell(key(id), col);
(window as unknown as { t: unknown }).t = { grid, api, saves, inner, key, cell, ctx };
(window as unknown as { ready: boolean }).ready = true;
