// Phase 6 step 11 (docs/phase-6-steps/step11-plan.md §6–§7; docs/behaviors/print.md): printing the grid. Invented patients
// (seed 2026), 1 200 rows × 12 columns, « Dossier » pinned at the start, two header groups (« Patient », « Constantes »).
// « Imprimer » calls `print(grid, { title })`: the browser's preview shows every row the grid shows (sorted, filtered), the
// headers on each page, no row cut; in Arabic, right to left. `?rows=5001`: the first 5 000 and the line saying so.
// `?preflight=1`: Tailwind's unlayered reset (preflight) in the page, with `print.unlayered.css` (the lesson of the app).
import '../packages/theme/dzgrid.css';
import PRINT from '../packages/theme/print.css?inline';
import PRINT_FLAT from '../packages/theme/print.unlayered.css?inline';
import PREFLIGHT from '../node_modules/tailwindcss/preflight.css?inline';
import { createGrid } from '@dzgrid/dom';
import { spans } from '@dzgrid/dom/spans';
import { filters } from '@dzgrid/dom/filters';
// By path, not `@dzgrid/dom/print`: no alias added to vite.config.ts while the playground server runs (a config change reloads it).
import { preparePrint, print } from '../packages/dom/src/print.js';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { AR_FILTERS } from '@dzgrid/dom/locales/ar-filters';
import { FR_PRINT } from '@dzgrid/dom/locales/fr-print';
import { AR_PRINT } from '@dzgrid/dom/locales/ar-print';
import type { ColumnOrGroup } from '@dzgrid/core';
import { seeded } from './demos/seed.js';

interface P { id: string; ref: string; name: string; born: string; ward: string; room: number; pulse: number; temp: number; sys: number; spo2: number; doctor: string; status: string; code: string }
const q = new URLSearchParams(location.search);
const ar = q.get('lang') === 'ar';
const count = q.get('rows') === '5001' ? 5001 : 1200;
const preflight = q.get('preflight') === '1';
document.documentElement.lang = ar ? 'ar' : 'fr';
document.documentElement.dir = ar ? 'rtl' : 'ltr';
// The page's reset first (unlayered, as an app's), then the print sheet: the unlayered twin under a reset that is.
for (const css of preflight ? [PREFLIGHT, PRINT_FLAT] : [PRINT]) document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

const T = ar
  ? { title: 'طباعة الجدول', back: '→ الأمثلة', print: 'طباعة', lang: 'اللغة', rows: 'الصفوف', preflight: 'إعادة ضبط Tailwind (preflight)', list: 'قائمة المرضى',
      steps: ['«طباعة» تفتح معاينة المتصفح: كل الصفوف الظاهرة في الجدول (بعد الفرز والتصفية)، وليس فقط ما يظهر على الشاشة.', 'الترويسة تتكرّر في كل صفحة ولا يُقطع صف بين صفحتين؛ العمود «الملف» المثبّت يأتي أولًا، من اليمين إلى اليسار.', 'مع 5 001 صف: تُطبع أول 5 000 ويُذكر ذلك فوق الجدول.'],
      ref: 'الملف', patient: 'المريض', name: 'الاسم', born: 'تاريخ الميلاد', ward: 'القسم', room: 'الغرفة', vitals: 'العلامات الحيوية', pulse: 'النبض', temp: 'الحرارة', sys: 'الضغط', spo2: 'الأكسجين', doctor: 'الطبيب', status: 'الحالة', code: 'الرمز',
      names: ['أمينة', 'ياسين', 'ليلى', 'كريم', 'سارة', 'مراد', 'نادية', 'رضا'], wards: ['القلب', 'الأطفال', 'الجراحة', 'الطوارئ'], doctors: ['د. بن علي', 'د. حداد', 'د. سعيدي'], statuses: ['مستقر', 'تحت المراقبة', 'خروج'] }
  : { title: 'Imprimer la grille', back: '← Démos', print: 'Imprimer', lang: 'Langue', rows: 'Lignes', preflight: 'Reset Tailwind (preflight)', list: 'Liste des patients',
      steps: ['« Imprimer » ouvre l’aperçu du navigateur : toutes les lignes que montre la grille (triées, filtrées), pas seulement celles à l’écran.', 'Les en-têtes se répètent en haut de chaque page, aucune ligne n’est coupée ; la colonne épinglée « Dossier » vient en premier (à droite en arabe).', 'Avec 5 001 lignes : les 5 000 premières, et une ligne le dit au-dessus du tableau.'],
      ref: 'Dossier', patient: 'Patient', name: 'Nom', born: 'Naissance', ward: 'Service', room: 'Chambre', vitals: 'Constantes', pulse: 'Pouls', temp: 'Temp.', sys: 'Tension', spo2: 'SpO₂', doctor: 'Médecin', status: 'Statut', code: 'Code',
      names: ['Amina', 'Yacine', 'Leïla', 'Karim', 'Sarah', 'Mourad', 'Nadia', 'Rédha'], wards: ['Cardiologie', 'Pédiatrie', 'Chirurgie', 'Urgences'], doctors: ['Dr Benali', 'Dr Haddad', 'Dr Saïdi'], statuses: ['Stable', 'Surveillance', 'Sortie'] };
const $ = (id: string) => document.getElementById(id)!;
document.title = `DzGrid — ${T.title}`;
$('title').textContent = T.title;
$('back').textContent = T.back;
$('print').textContent = T.print;
$('steps').replaceChildren(...T.steps.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
for (const [id, text] of [['lang-label', T.lang], ['rows-label', T.rows], ['preflight-label', T.preflight]] as const) $(id).textContent = text;
($('lang') as HTMLSelectElement).value = ar ? 'ar' : 'fr';
($('rows') as HTMLSelectElement).value = String(count);
($('preflight') as HTMLInputElement).checked = preflight;
for (const id of ['lang', 'rows', 'preflight']) $(id).addEventListener('change', () => {
  const p = new URLSearchParams({ lang: ($('lang') as HTMLSelectElement).value, rows: ($('rows') as HTMLSelectElement).value });
  if (($('preflight') as HTMLInputElement).checked) p.set('preflight', '1');
  location.search = p.toString();
});

const r = seeded(2026);
const pad = (n: number) => String(n).padStart(4, '0');
const rows: P[] = Array.from({ length: count }, (_, i) => ({
  id: `p${i + 1}`, ref: `D${pad(i + 1)}`, name: `${r.pick(T.names)} ${i + 1}`, born: r.day(1940, 2020), ward: r.pick(T.wards), room: r.int(1, 40),
  pulse: r.int(50, 120), temp: r.int(360, 400) / 10, sys: r.int(95, 170), spo2: r.int(88, 100), doctor: r.pick(T.doctors), status: r.pick(T.statuses), code: `C${pad(i + 1)}`,
}));
const columns: ColumnOrGroup<P>[] = [
  { id: 'ref', header: T.ref, width: 100, pinned: 'start' },
  { id: 'patient', header: T.patient, children: [{ id: 'name', header: T.name, width: 150 }, { id: 'born', header: T.born, type: 'day', width: 120 }, { id: 'ward', header: T.ward, width: 120 }, { id: 'room', header: T.room, type: 'number', width: 90 }] },
  { id: 'vitals', header: T.vitals, children: [{ id: 'pulse', header: T.pulse, type: 'number', width: 80 }, { id: 'temp', header: T.temp, type: 'number', width: 80 }, { id: 'sys', header: T.sys, type: 'number', width: 80 }, { id: 'spo2', header: T.spo2, type: 'number', width: 80 }] },
  { id: 'doctor', header: T.doctor, width: 120 },
  { id: 'status', header: T.status, width: 120 },
  { id: 'code', header: T.code, width: 90 },
];
const base = ar ? AR : FR;
const grid = createGrid<P>($('host'), {
  rows, getRowId: (x) => x.id, columns: columns as never, label: T.list, locale: ar ? 'ar-DZ' : 'fr-FR', direction: 'auto',
  messages: { ...base, text: { ...base.text, ...(ar ? AR_FILTERS : FR_FILTERS).text, ...(ar ? AR_PRINT : FR_PRINT).text } },
  features: [spans(), filters({ popup: true })],
  onEvent: (e) => { if (e.type === 'problems') for (const p of e.problems) console.warn('dzgrid', p.code, p.path, p.detail ?? ''); },
});
$('print').addEventListener('click', () => void print(grid, { title: T.list }));
// For the browser checks (scripts/browser-print.mjs).
(window as unknown as { t: unknown }).t = { grid, preparePrint, print };
