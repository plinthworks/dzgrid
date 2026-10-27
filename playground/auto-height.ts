// The « Hauteur automatique » page (Phase 6 step 9, docs/behaviors/auto-height.md; owner Q-R1, Q9-1..Q9-4): patients whose
// « Remarques » column wraps (`wrap: true`) and whose rows grow to fit it (`autoHeight()`), short rows staying at the normal
// height; a detail panel under a patient (« Patient 0 » open at first: the panel keeps its height, the patient's row is
// measured). `?lang=ar`: Arabic, right to left; 5 000 patients, `?rows=10000`, `100000` or `1000000`: more (above 10 000 rows shown —
// the open panel counts — the developer warning `auto-height-large` is printed below the grid, once; it still works); `?density=compact|spacious`; `?theme=dark`.
import { createGrid, definePart } from '@dzgrid/dom';
import { detail } from '@dzgrid/dom/detail';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { FR_DETAIL } from '@dzgrid/dom/locales/fr-detail';
import { AR_DETAIL } from '@dzgrid/dom/locales/ar-detail';
import { dataKey, type ColumnDef, type GridEvent } from '@dzgrid/core';
// No `@dzgrid/dom/auto-height` alias in vite.config.ts (editing it restarts the running server): the sources, by path.
import { autoHeight } from '../packages/dom/src/auto-height.js';
import '../packages/theme/dzgrid.css';

const form = document.getElementById('controls') as HTMLFormElement;
const log = document.getElementById('log')!;
const q = new URLSearchParams(location.search);
const ar = q.get('lang') === 'ar';
const locale = ar ? 'ar-DZ' : 'fr-FR';
const total = [10_000, 100_000, 1_000_000].includes(Number(q.get('rows'))) ? Number(q.get('rows')) : 5_000;
const density = (['compact', 'spacious'] as const).find((d) => d === q.get('density')) ?? 'comfortable';
const field = (name: string) => form.elements.namedItem(name) as HTMLSelectElement;
field('lang').value = ar ? 'ar' : 'fr';
field('theme').value = q.get('theme') ?? '';
field('rows').value = String(total);
field('density').value = density;
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
form.addEventListener('change', () => {
  location.search = new URLSearchParams({ lang: field('lang').value, theme: field('theme').value, rows: field('rows').value, density: field('density').value }).toString();
});

const W = ar
  ? {
    title: 'ارتفاع الصفوف التلقائي', back: '→ العروض', lang: 'اللغة', theme: 'المظهر', rows: 'المرضى', density: 'الكثافة',
    steps: 'عمود « ملاحظات » يلتف على عدة أسطر، وكل صف بطول أطول خلية فيه؛ الصفوف القصيرة تبقى بالارتفاع العادي. مرّر للأسفل ثم للأعلى، اقفز إلى المنتصف أو إلى النهاية: الصف في أعلى العرض لا يقفز. ضيّق أو وسّع عمود « ملاحظات » (اسحب حدّه): تطول الصفوف أو تقصر. « المريض 0 » مفتوح: لوحة تفاصيله تحتفظ بارتفاعها.',
    name: 'الاسم', service: 'المصلحة', remarks: 'ملاحظات', age: 'العمر', visits: (n: number) => `${n} زيارات هذه السنة`, last: 'آخر زيارة: فحص عام، النتائج عادية.',
    services: ['طب عام', 'أطفال', 'قلب', 'جلد'],
    sentences: ['المريض يشكو من صداع متكرر منذ أسبوعين.', 'الضغط مستقر تحت العلاج.', 'يُنصح بمراجعة طبيب القلب بعد شهر، مع تحليل دم كامل قبل الموعد.', 'حساسية من البنسلين.', 'المتابعة مستمرة؛ تمت مناقشة النظام الغذائي مع العائلة وتسليم ورقة الإرشادات.'],
    warn: (p: string) => `تنبيه للمطوّر: ${p}`,
  }
  : {
    title: 'Hauteur automatique des lignes', back: '← Démos', lang: 'Langue', theme: 'Thème', rows: 'Patients', density: 'Densité',
    steps: 'La colonne « Remarques » passe à la ligne ; chaque ligne est aussi haute que sa cellule la plus longue, les lignes courtes gardent la hauteur normale. Défilez vers le bas puis vers le haut, sautez au milieu ou à la fin : la ligne en haut de la vue ne saute pas. Rétrécissez ou élargissez « Remarques » (tirez son bord) : les lignes grandissent ou raccourcissent. « Patient 0 » est ouvert : son panneau de détail garde sa hauteur.',
    name: 'Nom', service: 'Service', remarks: 'Remarques', age: 'Âge', visits: (n: number) => `${n} visites cette année`, last: 'Dernière visite : bilan général, résultats normaux.',
    services: ['Médecine générale', 'Pédiatrie', 'Cardiologie', 'Dermatologie'],
    sentences: ['Se plaint de maux de tête répétés depuis deux semaines.', 'Tension stable sous traitement.', 'Revoir le cardiologue dans un mois, avec une prise de sang complète avant le rendez-vous.', 'Allergie à la pénicilline.', 'Suivi en cours ; le régime alimentaire a été discuté avec la famille et la fiche de conseils remise.'],
    warn: (p: string) => `Avertissement au développeur : ${p}`,
  };
document.title = `DzGrid — ${W.title}`;
document.getElementById('title')!.textContent = W.title;
document.getElementById('back')!.textContent = W.back;
document.getElementById('steps')!.textContent = W.steps;
for (const id of ['lang', 'theme', 'rows', 'density'] as const) document.getElementById(`${id}-label`)!.textContent = W[id];

type Patient = { id: number; name: string; service: string; remarks: string; age: number };
/** 0 to 4 sentences, the same for a patient each time (a long note every few rows, some empty). */
const remarksOf = (i: number): string => {
  const n = (i * 7 + (i >> 3)) % 5;
  return Array.from({ length: n }, (_, j) => W.sentences[(i + j * 3) % W.sentences.length]).join(' ');
};
const patients: Patient[] = new Array(total);
for (let i = 0; i < total; i++) patients[i] = { id: i, name: `Patient ${i}`, service: W.services[i % 4]!, remarks: remarksOf(i), age: ((i * 37) % 90) + 1 };

const columns: ColumnDef<Patient, any>[] = [
  { id: 'name', header: W.name, width: 150 },
  { id: 'service', header: W.service, width: 170 },
  { id: 'remarks', header: W.remarks, width: 320, wrap: true },
  { id: 'age', header: W.age, type: 'number', width: 80 },
];
/** A short panel of the patient's visits: its own height (120 px), whatever its master's. */
const visits = definePart('detail', {
  mount(host, c) {
    const p = c.row as Patient;
    const box = document.createElement('div');
    box.className = 'visits';
    box.append(Object.assign(document.createElement('p'), { textContent: W.visits(3 + (p.id % 9)) }), Object.assign(document.createElement('p'), { textContent: W.last }));
    host.append(box);
    return {};
  },
});
const base = ar ? AR : FR;
const said = new Set<string>();
const grid = createGrid<Patient>(document.getElementById('host')!, {
  rows: patients, getRowId: (r) => String(r.id), columns, locale, direction: 'auto', density, label: W.title,
  messages: { ...base, text: { ...base.text, ...(ar ? AR_DETAIL : FR_DETAIL).text } },
  features: [detail<Patient>({ part: visits, height: 120 }), autoHeight()],
  onEvent: (e: GridEvent<Patient>) => {
    if (e.type !== 'problems') return;
    for (const p of e.problems) {
      const line = `${p.code} ${p.path}`;
      if (said.has(line)) continue;
      said.add(line);
      log.textContent += `${W.warn(line)}\n`;
    }
  },
});
grid.kernel.dispatch({ type: 'rows.expand', rows: [dataKey('0')!], expanded: true }, 'host');
(window as unknown as { grid: unknown }).grid = grid;
