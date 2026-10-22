// The « Maître/détail » page (Phase 4 step 10, docs/behaviors/master-detail.md, docs/a11y-protocol.md §17):
// 10 000 patients (`?rows=1000000`: a million), each opening a 240 px panel with the grid of their visits
// (`nestedGrid`, 4 columns, its own sort, keys and scroll, remembered for the last 20 patients); « Patient 0 »
// open at first. `?content=free`: a panel of free text whose height is measured (`height: 'auto'`), with a
// button that adds a note (the panel grows, the rows above do not move). `?locale=ar-DZ`: Arabic, right to left.
import { createGrid } from '@dzgrid/dom';
import { definePart } from '@dzgrid/dom';
import { detail, nestedGrid } from '@dzgrid/dom/detail';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { FR_DETAIL } from '@dzgrid/dom/locales/fr-detail';
import { AR_DETAIL } from '@dzgrid/dom/locales/ar-detail';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
import '../packages/theme/dzgrid.css';

const form = document.getElementById('controls') as HTMLFormElement;
const status = document.getElementById('status')!;
const q = new URLSearchParams(location.search);
const locale = q.get('locale') === 'ar-DZ' ? 'ar-DZ' : 'fr-FR';
const ar = locale === 'ar-DZ';
const total = Number(q.get('rows')) >= 1_000_000 ? 1_000_000 : 10_000;
const free = q.get('content') === 'free';
const field = (name: string) => form.elements.namedItem(name) as HTMLSelectElement;
field('locale').value = locale;
field('theme').value = q.get('theme') ?? '';
field('rows').value = String(total);
field('content').value = free ? 'free' : 'grid';
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
form.addEventListener('change', () => {
  const next = new URLSearchParams({ locale: field('locale').value, theme: field('theme').value, rows: field('rows').value, content: field('content').value });
  location.search = next.toString();
});

// The names stay Latin in both languages (the listening protocol names « Patient 0 »).
const W = ar
  ? { title: 'رئيسي/تفاصيل', name: 'الاسم', city: 'المدينة', age: 'العمر', visits: 'الزيارات', date: 'التاريخ', service: 'المصلحة', reason: 'السبب', fee: 'المبلغ', of: (n: string) => `زيارات ${n}`, cities: ['الجزائر', 'وهران', 'قسنطينة', 'عنابة', 'البليدة', 'سطيف'], services: ['طب عام', 'أطفال', 'قلب', 'جلد'], reasons: ['فحص', 'متابعة', 'تحليل', 'تلقيح'], note: (n: number, p: string) => `ملاحظة ${n} عن ${p}: المتابعة مستمرة، والموعد القادم بعد شهر.`, add: 'إضافة ملاحظة', none: 'طي الكل', shown: (n: number) => `${n} صف معروض` }
  : { title: 'Maître/détail', name: 'Nom', city: 'Ville', age: 'Âge', visits: 'Visites', date: 'Date', service: 'Service', reason: 'Motif', fee: 'Montant', of: (n: string) => `Visites de ${n}`, cities: ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Sétif'], services: ['Médecine générale', 'Pédiatrie', 'Cardiologie', 'Dermatologie'], reasons: ['Consultation', 'Suivi', 'Analyse', 'Vaccin'], note: (n: number, p: string) => `Note ${n} sur ${p} : le suivi continue, prochain rendez-vous dans un mois.`, add: 'Ajouter une note', none: 'Tout replier', shown: (n: number) => `${n} lignes affichées` };
document.getElementById('title')!.textContent = W.title;
document.getElementById('none')!.textContent = W.none;

type Patient = { id: number; name: string; city: string; age: number; visits: number };
type Visit = { id: string; date: string; service: string; reason: string; fee: number };
const patients: Patient[] = new Array(total);
for (let i = 0; i < total; i++) patients[i] = { id: i, name: `Patient ${i}`, city: W.cities[i % 6]!, age: ((i * 37) % 90) + 1, visits: 3 + (i % 40) };
const visitsOf = (p: Patient): Visit[] => Array.from({ length: p.visits }, (_, v) => ({
  id: `${p.id}-${v}`, date: `2026-${String((v % 12) + 1).padStart(2, '0')}-${String(((p.id + v * 3) % 28) + 1).padStart(2, '0')}`,
  service: W.services[(p.id + v) % 4]!, reason: W.reasons[(p.id * 3 + v) % 4]!, fee: 1000 + ((p.id * 13 + v * 7) % 40) * 250,
}));

const base = ar ? AR : FR;
const messages = { ...base, text: { ...base.text, ...(ar ? AR_DETAIL : FR_DETAIL).text } };
const columns: ColumnDef<Patient, any>[] = [
  // As wide as the visits' grid and the panel's padding: a panel is never wider than its grid's columns.
  { id: 'name', header: W.name, width: 240 },
  { id: 'city', header: W.city, width: 200 },
  { id: 'age', header: W.age, type: 'number', width: 90 },
  { id: 'visits', header: W.visits, type: 'number', width: 110 },
];
const visitColumns: ColumnDef<Visit, any>[] = [
  { id: 'date', header: W.date, type: 'day', width: 140 },
  { id: 'service', header: W.service, width: 190 },
  { id: 'reason', header: W.reason, width: 150 },
  { id: 'fee', header: W.fee, type: 'number', width: 120 },
];

/** The panel's grid of visits: its own grid, remembered for the last 20 patients. */
const visits = nestedGrid<Visit>({
  settings: (c) => ({ rows: visitsOf(c.row as Patient), getRowId: (r) => r.id, columns: visitColumns, messages, locale, direction: 'auto', label: W.of((c.row as Patient).name) }),
});

/** Free content: notes of the patient's own length, and a button adding one (the panel grows, measured). */
const notes = definePart('detail', {
  mount(host, c) {
    const p = c.row as Patient;
    const box = document.createElement('div');
    box.className = 'free';
    for (let n = 1; n <= 1 + (p.id % 4); n++) box.append(Object.assign(document.createElement('p'), { textContent: W.note(n, p.name) }));
    const add = Object.assign(document.createElement('button'), { type: 'button', textContent: W.add });
    add.addEventListener('click', () => add.before(Object.assign(document.createElement('p'), { textContent: W.note(box.querySelectorAll('p').length + 1, p.name) })));
    box.append(add);
    host.append(box);
    return { focus: () => (add.focus(), true) };
  },
});

const grid = createGrid<Patient>(document.getElementById('host')!, {
  rows: patients, getRowId: (r) => String(r.id), columns, messages, locale, direction: 'auto',
  label: W.title,
  features: [detail<Patient>(free ? { part: notes, height: 'auto' } : { part: visits })],
  onEvent: (e: GridEvent<Patient>) => {
    if (e.type === 'problems') for (const p of e.problems) console.warn('dzgrid', p.code, p.path, p.detail ?? '');
    if (e.type === 'modelUpdated' || e.type === 'rowExpanded') status.textContent = W.shown(grid.kernel.rows.displayed.count);
  },
});
grid.kernel.dispatch({ type: 'rows.expand', rows: [dataKey('0')!], expanded: true }, 'host');
status.textContent = W.shown(grid.kernel.rows.displayed.count);
document.getElementById('none')!.addEventListener('click', () => grid.kernel.dispatch({ type: 'rows.expandAll', expanded: false }, 'user'));
(window as unknown as { grid: unknown }).grid = grid;
