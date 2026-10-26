// Phase 6 step 5 (step05-plan §5; docs/behaviors/grid-state.md 17–20): the grid's state kept in the browser's storage and
// carried by the page's address. A server grid (a fake one in the page, counting its requests) with `gridState({ persist })`:
// arrange it, reload — it comes back as you left it, with ONE request. « Copier l'adresse » writes `?grid=1.…` (typed
// filters and the search left out unless ticked, O6); open it in another tab, or in Arabic. Invented data (seed 2026).
import '../packages/theme/dzgrid.css';
import '../packages/theme/columns.css';
import { createGrid } from '@dzgrid/dom';
import { gridState, fromSearchParams, toSearchParams } from '@dzgrid/dom/state';
import { filters } from '@dzgrid/dom/filters';
import { pagination } from '@dzgrid/dom/pagination';
import { columns as moveColumns } from '@dzgrid/dom/columns';
import { columnMenu } from '@dzgrid/dom/column-menu';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { AR_FILTERS } from '@dzgrid/dom/locales/ar-filters';
import { FR_PAGINATION } from '@dzgrid/dom/locales/fr-pagination';
import { AR_PAGINATION } from '@dzgrid/dom/locales/ar-pagination';
import { FR_COLUMNS } from '@dzgrid/dom/locales/fr-columns';
import { AR_COLUMNS } from '@dzgrid/dom/locales/ar-columns';
import { FR_COLUMN_MENU } from '@dzgrid/dom/locales/fr-column-menu';
import { AR_COLUMN_MENU } from '@dzgrid/dom/locales/ar-column-menu';
import { sourceRows, type DataRequest, type DataResponse } from '@dzgrid/core/server';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import { seeded } from './demos/seed.js';

interface Visit { id: string; name: string; age: number; city: string; ward: string; day: string }
const KEY = 'dzgrid-demo-state';
const q = new URLSearchParams(location.search);
const ar = q.get('lang') === 'ar';
document.documentElement.lang = ar ? 'ar' : 'fr';
document.documentElement.dir = ar ? 'rtl' : 'ltr';

const T = ar
  ? { title: 'حالة الجدول: الذاكرة والعنوان', back: '→ الأمثلة', lang: 'اللغة', search: 'بحث', copy: 'نسخ العنوان', with: 'مع المرشحات والبحث', forget: 'نسيان الحالة المحفوظة', open: 'فتح في علامة تبويب جديدة', requests: 'طلبات إلى الخادم', problems: 'مشكلات',
    steps: ['رتّب الجدول: انقل عمودًا، غيّر عرضه، ثبّته أو أخفِه (القائمة ⋮)، رتّب، صفِّ، ابحث، غيّر الصفحة وحجمها والكثافة (⋮ ← الكثافة).', 'أعد تحميل الصفحة: يعود الجدول كما تركته، بطلب واحد إلى الخادم.', '«نسخ العنوان»: عنوان يعيد الأعمدة والترتيب والصفحة؛ المرشحات والبحث لا تُكتب فيه إلا إذا حدّدت الخانة.', 'غيّر اللغة إلى الفرنسية: الأعمدة المثبّتة في البداية تنتقل إلى اليسار، بالترتيب نفسه.'] }
  : { title: 'L’état de la grille : la mémoire et l’adresse', back: '← Démos', lang: 'Langue', search: 'Recherche', copy: 'Copier l’adresse', with: 'avec les filtres et la recherche', forget: 'Oublier l’état enregistré', open: 'Ouvrir dans un nouvel onglet', requests: 'Demandes au serveur', problems: 'Problèmes',
    steps: ['Arrangez la grille : déplacez une colonne, changez sa largeur, épinglez-la ou masquez-la (menu ⋮), triez, filtrez, cherchez, changez de page, de taille de page et de densité (⋮ → Densité).', 'Rechargez la page : la grille revient comme vous l’avez laissée, en une seule demande au serveur.', '« Copier l’adresse » : une adresse qui rouvre les colonnes, le tri et la page ; les filtres et la recherche n’y sont écrits que si la case est cochée.', 'Passez en arabe : les colonnes épinglées au début passent à droite, dans le même ordre.'] };
const $ = (id: string) => document.getElementById(id)!;
document.title = `DzGrid — ${T.title}`;
$('title').textContent = T.title;
$('back').textContent = T.back;
$('steps').replaceChildren(...T.steps.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
for (const [id, text] of [['lang-label', T.lang], ['search-label', T.search], ['copy', T.copy], ['with-label', T.with], ['forget', T.forget], ['open', T.open]] as const) $(id).textContent = text;
($('lang') as HTMLSelectElement).value = ar ? 'ar' : 'fr';

// ---- the fake server: 500 visits, sorted, filtered and searched here, 150 ms late; it counts its requests.
const r = seeded(2026);
const NAMES = ar ? ['محمد', 'فاطمة', 'أمين', 'ليلى', 'يوسف', 'سارة', 'كريم', 'نور'] : ['Amel', 'Bilal', 'Chems', 'Dalia', 'Elias', 'Farah', 'Ghani', 'Hana'];
const CITIES = ['Oran', 'Alger', 'Constantine', 'Tlemcen', 'Béjaïa', 'Annaba'];
const WARDS = ar ? ['الطوارئ', 'الأطفال', 'القلب', 'الجراحة'] : ['Urgences', 'Pédiatrie', 'Cardiologie', 'Chirurgie'];
const all: Visit[] = Array.from({ length: 500 }, (_, i) => ({ id: `v${i + 1}`, name: `${r.pick(NAMES)} ${i + 1}`, age: r.int(1, 95), city: r.pick(CITIES), ward: r.pick(WARDS), day: r.day(2025, 2026) }));
let requests = 0;
const show = () => void ($('requests').textContent = `${T.requests} : ${requests}`, document.body.dataset['requests'] = String(requests));
show();
const fetchPage = (req: DataRequest): Promise<DataResponse<Visit>> => {
  requests++;
  show();
  return new Promise((ok) => setTimeout(() => {
    let rows = all;
    const text = (v: unknown) => String(v).toLocaleLowerCase();
    if (req.quick) rows = rows.filter((x) => Object.values(x).some((v) => text(v).includes(text(req.quick))));
    for (const [col, f] of Object.entries((req.filter ?? {}) as Record<string, { value?: unknown }>)) if (f.value !== undefined) rows = rows.filter((x) => text(x[col as keyof Visit]).includes(text(f.value)));
    for (const s of [...(req.sort ?? [])].reverse()) rows = [...rows].sort((a, b) => (a[s.column as keyof Visit] < b[s.column as keyof Visit] ? -1 : a[s.column as keyof Visit] > b[s.column as keyof Visit] ? 1 : 0) * (s.dir === 'asc' ? 1 : -1));
    const p = req.page ?? { offset: 0, size: rows.length };
    ok({ rows: rows.slice(p.offset, p.offset + p.size), total: rows.length });
  }, Number(q.get('delay') ?? 150)));
};

const W = ar ? { name: 'المريض', age: 'العمر', city: 'المدينة', ward: 'القسم', day: 'الدخول' } : { name: 'Patient', age: 'Âge', city: 'Ville', ward: 'Service', day: 'Admission' };
const columns: ColumnDef<Visit, any>[] = [
  { id: 'name', header: W.name, width: 180 },
  { id: 'age', header: W.age, type: 'number', width: 90 },
  { id: 'city', header: W.city, width: 150 },
  { id: 'ward', header: W.ward, width: 150 },
  { id: 'day', header: W.day, type: 'day', width: 140 },
];
const base = ar ? AR : FR;
const messages = { ...base, text: { ...base.text, ...(ar ? AR_FILTERS : FR_FILTERS).text, ...(ar ? AR_PAGINATION : FR_PAGINATION).text, ...(ar ? AR_COLUMNS : FR_COLUMNS).text, ...(ar ? AR_COLUMN_MENU : FR_COLUMN_MENU).text } };
const state = gridState({ persist: { key: KEY } });
const cols = moveColumns();
const problems: string[] = [];
const grid = createGrid<Visit>($('host'), {
  source: sourceRows<Visit>({ fetch: fetchPage }), operations: 'server', pagination: { pageSize: 25, pageSizes: [10, 25, 50] },
  getRowId: (x) => x.id, columns, messages, locale: ar ? 'ar-DZ' : 'fr-FR', direction: 'auto', label: T.title,
  features: [state, cols, columnMenu({ use: { columns: cols }, density: true }), filters({ popup: true }), pagination()],
  onEvent(e: GridEvent<Visit>) {
    if (e.type === 'problems' || e.type === 'stateRestored') {
      for (const p of e.problems) if (p.code.startsWith('state-')) problems.push(`${p.code} ${p.path}`);
      $('problems').textContent = problems.length ? `${T.problems} : ${problems.join(', ')}` : '';
    }
    if (e.type === 'quickChanged') ($('search') as HTMLInputElement).value = e.text;
  },
});
const api = state.api(grid)!;
// The address wins over the storage: a state read from it, applied (its missing filter and search keep the grid's own).
const read = fromSearchParams(q);
if (read.state) api.setState(read.state);
else if (read.problems.length) {
  problems.push(...read.problems.map((p) => `${p.code} ${p.path}`));
  $('problems').textContent = `${T.problems} : ${problems.join(', ')}`;
}
($('search') as HTMLInputElement).value = grid.kernel.query.quick;

let typing = 0;
$('search').addEventListener('input', (e) => {
  clearTimeout(typing);
  typing = window.setTimeout(() => grid.kernel.dispatch({ type: 'quick.set', text: (e.target as HTMLInputElement).value }, 'user'), 250);
});
$('copy').addEventListener('click', () => {
  const { params } = toSearchParams(api.state(), ($('with') as HTMLInputElement).checked ? { include: ['filter', 'quick'] } : {});
  if (ar) params.set('lang', 'ar');
  const url = `${location.origin}${location.pathname}?${params}`;
  ($('address') as HTMLInputElement).value = url;
  Object.assign($('open'), { href: url, hidden: false });
  void navigator.clipboard?.writeText(url).catch(() => {});
});
$('forget').addEventListener('click', () => {
  localStorage.removeItem(KEY);
  location.search = ar ? '?lang=ar' : '';
});
$('lang').addEventListener('change', (e) => {
  location.search = (e.target as HTMLSelectElement).value === 'ar' ? '?lang=ar' : '';
});
(window as unknown as { demo: unknown }).demo = { grid, api, key: KEY, requests: () => requests, problems };
