// The framework bridges on a real build (showcase themes step 5, docs/theme-in-3-lines.md; scripts/browser.mjs
// `frameworkChecks`, `-- --only themes`). Query: fw, the setup built by scripts/frameworks.mjs (tailwind4,
// tailwind4-noorder, tailwind4-bare, tailwind3, bootstrap, bootstrap-unlayered); raw=1, the Tailwind 4 bridge
// linked as a file beside the build (the documented pitfall); skin=midnight|clinic, a showcase theme linked
// after; dark=class, Tailwind's .dark on the root; bs=dark|light, data-bs-theme on the root; area=dark|light, a
// second grid in #area under that data-bs-theme (nested in the root's); locale. « Nom » carries the app's utility class (px-1) on
// row 0; the documented examples (packages/theme/test/frameworks/examples.json) for the setup's framework: a
// negative amount, a highlighted row (every fifth from the second), a status pill per tone, the city's header.
// window.t.probe(i, expr): the colour `expr` computes to inside grid i, as sRGB bytes; t.bytes(colour).
import { createGrid } from '/packages/dom/src/index.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { badge } from '/packages/dom/src/parts.ts';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
if (q.get('dark') === 'class') document.documentElement.classList.add('dark');
if (q.get('bs')) document.documentElement.dataset['bsTheme'] = q.get('bs')!;

const link = (href: string) =>
  new Promise<void>((done, fail) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onload = () => done();
    l.onerror = () => fail(new Error(href));
    document.head.append(l);
  });
await link(`/node_modules/.cache/dzgrid-frameworks/${q.get('fw') ?? 'tailwind4'}.css`);
if (q.get('raw')) await link('/packages/theme/tailwind.css');
if (q.get('skin')) await link(`/packages/theme/${q.get('skin')}.css`);

type Example = { negative: string; row: string; css?: string; pills: Record<string, string>; header: string };
const fw = q.get('fw') ?? 'tailwind4';
const examples = (await (await fetch('/packages/theme/test/frameworks/examples.json')).json()) as Record<string, Example>;
const ex = examples[fw.startsWith('tailwind4') ? 'tailwind4' : fw.startsWith('bootstrap') ? 'bootstrap' : 'tailwind3']!;
// The application's own CSS line, where the framework has no utility for it (Bootstrap's highlighted row).
if (ex.css) {
  const st = document.createElement('style');
  st.textContent = ex.css;
  document.head.append(st);
}

type Row = { id: number; name: string; city: string; amount: number; status: string };
const cities = ar ? ['الجزائر', 'وهران', 'قسنطينة'] : ['Alger', 'Oran', 'Constantine'];
const rows: Row[] = Array.from({ length: 40 }, (_, i) => ({ id: i, name: ar ? `مريض ${i}` : `Patient ${i}`, city: cities[i % 3]!, amount: ((i * 7919) % 100000) / 100 - 200, status: i % 3 ? 'paid' : 'late' }));
const STATUS = ar ? [{ value: 'paid', label: 'مدفوع' }, { value: 'late', label: 'متأخر' }] : [{ value: 'paid', label: 'Payé' }, { value: 'late', label: 'En retard' }];
const columns = [
  { id: 'name', header: ar ? 'الاسم' : 'Nom', pinned: 'start' as const, width: 160, ui: { cellClass: (c: { row: Row }) => (c.row.id === 0 ? 'px-1' : null) } },
  { id: 'city', header: ar ? 'المدينة' : 'Ville', width: 140, ui: { headerClass: ex.header } },
  { id: 'amount', header: ar ? 'المبلغ' : 'Montant', type: 'number' as const, width: 120, ui: { cellClass: (c: { value: unknown }) => ((c.value as number) < 0 ? ex.negative : null) } },
  { id: 'status', header: ar ? 'الحالة' : 'Statut', type: 'enum' as const, enumOptions: STATUS, width: 140, ui: { cell: 'status' } },
];
const parts = { status: badge({ tones: { paid: 'success', late: 'danger' }, classes: ex.pills }) };
const make = (host: HTMLElement, label: string) =>
  createGrid<Row>(host, { rows, locale, direction: ar ? 'rtl' : 'ltr', getRowId: (r) => r.id, columns, messages: ar ? AR : FR, label, parts,
    selection: { mode: 'multi', checkbox: true, click: true }, rowClass: (c) => (c.row.id % 5 === 1 ? ex.row : null) });

const grids = [make(document.getElementById('host')!, ar ? 'المرضى' : 'Patients')];
if (q.get('area')) {
  const el = document.getElementById('area')!;
  el.dataset['bsTheme'] = q.get('area')!;
  grids.push(make(el, ar ? 'المنطقة' : 'Zone'));
}

const cv = document.createElement('canvas');
cv.width = cv.height = 1;
const pen = cv.getContext('2d', { willReadFrequently: true })!;
/** A computed colour as sRGB bytes [r, g, b, a] (oklch() and alpha compared as numbers). */
const bytes = (c: string): number[] => {
  pen.clearRect(0, 0, 1, 1);
  pen.fillStyle = c;
  pen.fillRect(0, 0, 1, 1);
  return [...pen.getImageData(0, 0, 1, 1).data];
};
const roots = () => document.querySelectorAll<HTMLElement>('#host > .dzg, #area > .dzg');
/** What `expr` computes to as a colour on an element inside grid i (its colour scheme, its variables). */
const probe = (i: number, expr: string): number[] => {
  const s = document.createElement('span');
  s.style.color = expr;
  roots()[i]!.append(s);
  const c = getComputedStyle(s).color;
  s.remove();
  return bytes(c);
};
/** An element inside grid i carrying `cls`: its colour, its background and its --tz-bg, as bytes (what the classes give). */
const classed = (i: number, cls: string) => {
  const s = document.createElement('span');
  s.className = cls;
  s.style.color = '';
  roots()[i]!.append(s);
  const c = getComputedStyle(s);
  const out = { color: bytes(c.color), bg: bytes(c.backgroundColor), tz: bytes(c.getPropertyValue('--tz-bg').trim() ? probeIn(s) : 'transparent') };
  s.remove();
  return out;
};
const probeIn = (el: Element): string => {
  const p = document.createElement('span');
  p.style.color = 'var(--tz-bg)';
  el.append(p);
  const c = getComputedStyle(p).color;
  p.remove();
  return c;
};
(window as any).t = { grids, probe, bytes, classed, ex };
(window as any).ready = true;
