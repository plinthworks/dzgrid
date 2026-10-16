// Test data and messages for the S4 / S10 pages. Strings come from the "host", as in the real grid (§3.9).
import type { Column, Messages, Row } from './grid.js';

const CITIES = { fr: ['Oran', 'Alger', 'Constantine', 'Annaba', 'Tlemcen', 'Béjaïa'], ar: ['وهران', 'الجزائر', 'قسنطينة', 'عنابة', 'تلمسان', 'بجاية'] };
const SERVICES = { fr: ['Cardiologie', 'Pédiatrie', 'Urgences', 'Radiologie'], ar: ['أمراض القلب', 'طب الأطفال', 'الاستعجالات', 'الأشعة'] };

export type Lang = 'fr' | 'ar';

export function columns(lang: Lang, extra = 0): Column[] {
  const fr = lang === 'fr';
  const base: Column[] = [
    { id: 'name', header: fr ? 'Nom' : 'الاسم', width: 160, rowHeader: true },
    { id: 'city', header: fr ? 'Ville' : 'المدينة', width: 130 },
    { id: 'age', header: fr ? 'Âge' : 'العمر', width: 80, numeric: true },
    { id: 'service', header: fr ? 'Service' : 'المصلحة', width: 140 },
    { id: 'day', header: fr ? 'Date' : 'التاريخ', width: 120 },
    { id: 'note', header: fr ? 'Note' : 'ملاحظة', width: 200, editable: true },
  ];
  for (let i = 0; i < extra; i++) base.push({ id: 'x' + i, header: (fr ? 'Mesure ' : 'قياس ') + (i + 1), width: 100, numeric: true });
  return base;
}

function row(i: number, lang: Lang, extra: number, parent: string | null = null, label?: string): Row {
  const r: Row = {
    id: 'r' + i, parent,
    name: label ?? (lang === 'fr' ? `Patient ${i}` : `مريض ${i}`),
    city: CITIES[lang][(i * 7) % 6], age: String(1 + ((i * 37) % 97)), service: SERVICES[lang][(i * 3) % 4],
    day: `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, note: '',
  };
  for (let x = 0; x < extra; x++) r['x' + x] = String((i * (x + 3)) % 1000);
  return r;
}

export function flatRows(n: number, lang: Lang, extra = 0): Row[] {
  return Array.from({ length: n }, (_, i) => row(i, lang, extra));
}

/** 100 parents x 99 children = 10 000 rows when all expanded. */
export function treeRows(lang: Lang): Row[] {
  const out: Row[] = [];
  let i = 0;
  for (let p = 0; p < 100; p++) {
    const pid = i;
    out.push(row(i++, lang, 0, null, lang === 'fr' ? `Service ${p}` : `مصلحة ${p}`));
    for (let c = 0; c < 99; c++) out.push(row(i++, lang, 0, 'r' + pid));
  }
  return out;
}

const nf = (lang: Lang) => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ', { numberingSystem: 'latn' });
function plural(lang: Lang, n: number, forms: { other: string; [k: string]: string }) {
  const cat = new Intl.PluralRules(lang === 'fr' ? 'fr' : 'ar').select(n);
  return (forms[cat] ?? forms.other ?? '').replace('{n}', nf(lang).format(n));
}
const ROWS = {
  fr: { one: '{n} ligne', many: '{n} de lignes', other: '{n} lignes' },
  ar: { zero: 'لا صفوف', one: 'صف واحد', two: 'صفان', few: '{n} صفوف', many: '{n} صفًا', other: '{n} صف' },
};

export function messages(lang: Lang): Messages {
  if (lang === 'fr') return {
    gridLabel: 'Patients',
    sorted: (c, d, n) => `Trié par ${c}, ordre ${d === 'ascending' ? 'croissant' : 'décroissant'}. ${plural('fr', n, ROWS.fr)}.`,
    unsorted: (n) => `Tri retiré. ${plural('fr', n, ROWS.fr)}.`,
    filtered: (n) => `Filtre appliqué : ${plural('fr', n, ROWS.fr)}.`,
    page: (p, ps, a, b, n) => `Page ${p} sur ${ps}, lignes ${nf('fr').format(a)} à ${nf('fr').format(b)} sur ${nf('fr').format(n)}.`,
    detailOf: (name) => `Détail de ${name} :`,
    expanded: (name, n) => `${name} déplié. ${plural('fr', n, ROWS.fr)}.`,
    collapsed: (name) => `${name} replié.`,
  };
  return {
    gridLabel: 'المرضى',
    sorted: (c, d, n) => `مرتب حسب ${c}، ${d === 'ascending' ? 'تصاعديًا' : 'تنازليًا'}. ${plural('ar', n, ROWS.ar)}.`,
    unsorted: (n) => `أُزيل الترتيب. ${plural('ar', n, ROWS.ar)}.`,
    filtered: (n) => `طُبّق المرشح: ${plural('ar', n, ROWS.ar)}.`,
    page: (p, ps, a, b, n) => `الصفحة ${p} من ${ps}، الصفوف ${nf('ar').format(a)} إلى ${nf('ar').format(b)} من ${nf('ar').format(n)}.`,
    detailOf: (name) => `تفاصيل ${name}:`,
    expanded: (name, n) => `${name} موسَّع. ${plural('ar', n, ROWS.ar)}.`,
    collapsed: (name) => `${name} مطوي.`,
  };
}
