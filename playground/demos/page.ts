// The two showcase demo pages (`orders.html`, `hr.html`, demos-plan.md §1): the page's language, light or
// dark, and showcase theme from the query (by default French, light, Clinic), the controls that change them
// (the page reloads), then the demo mounted. The showcase theme is one <style> at a time, as on the main page.
import '../../packages/theme/dzgrid.css';
import MIDNIGHT from '../../packages/theme/midnight.css?inline';
import CLINIC from '../../packages/theme/clinic.css?inline';
import './demos.css';
// The editing marks, the field and the bubble (used by orders-edit.html only; unused rules elsewhere).
import '../../packages/theme/edit.css';
import { mountOrders } from './orders.js';
import { mountHr } from './hr.js';
import { mountOrdersEdit } from './orders-edit.js';

const page = document.body.dataset['demo'];
const which = page === 'hr' ? 'hr' : 'orders';
// `orders-edit.html` (Phase 5 step 5): the same orders, editable, with a simulated save that sometimes refuses.
const editing = page === 'orders-edit';
const q = new URLSearchParams(location.search);
const locale = q.get('locale') === 'ar-DZ' ? 'ar-DZ' : 'fr-FR';
const ar = locale === 'ar-DZ';
const theme = q.get('theme') ?? 'light';
const skin = q.get('skin') ?? 'clinic';
const form = document.getElementById('controls') as HTMLFormElement;
const field = (name: string) => form.elements.namedItem(name) as HTMLSelectElement;
field('locale').value = locale;
field('theme').value = theme;
field('skin').value = skin;
form.addEventListener('change', () => {
  location.search = new URLSearchParams({ locale: field('locale').value, theme: field('theme').value, skin: field('skin').value }).toString();
});
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
if (theme) document.documentElement.dataset['theme'] = theme;
const css = { midnight: MIDNIGHT, clinic: CLINIC }[skin];
if (css) document.head.append(Object.assign(document.createElement('style'), { id: 'skin', textContent: css }));

const TEXT = {
  orders: {
    fr: ['Commandes et sous-commandes, mêmes colonnes', 'Des commandes ; une commande ouverte montre ses sous-commandes juste en dessous, dans les mêmes colonnes et sous le même en-tête, sur un fond un peu différent (une variable CSS de l’application, --orders-child-bg). Le petit chevron au début de la cellule « Commande » ouvre et ferme (un clic ailleurs dans la cellule la sélectionne seulement) ; au clavier, → ouvre, ← ferme. Tri et filtres gardent chaque sous-commande sous sa commande.'],
    ar: ['الطلبات والطلبات الفرعية، الأعمدة نفسها', 'طلبات؛ يُظهر الطلب المفتوح طلباته الفرعية تحته مباشرة، بالأعمدة نفسها وتحت الترويسة نفسها، على خلفية مختلفة قليلاً (متغيّر CSS للتطبيق، ‎--orders-child-bg). السهم الصغير في بداية خلية «الطلب» يفتح ويغلق؛ بلوحة المفاتيح ← يفتح و→ يغلق. الترتيب والمرشحات يُبقيان كل طلب فرعي تحت طلبه.'],
  },
  hr: {
    fr: ['Ressources humaines (organigramme)', 'L’organigramme d’un hôpital (personnes inventées) : les trois responsables les plus proches restent épinglés sous l’en-tête. Lignes de 52 px (rowHeight). Au clavier : → ouvre, ← ferme dans la colonne « Employé » ; dans « Contact », Entrée va sur le premier lien, ← → passent de l’un à l’autre, Échap revient à la cellule.'],
    ar: ['الموارد البشرية (الهيكل التنظيمي)', 'الهيكل التنظيمي لمستشفى (أشخاص من الخيال): يبقى أقرب ثلاثة مسؤولين مثبّتين تحت الترويسة. في عمود «الاتصال»: Enter ينتقل إلى الرابط الأول، والأسهم بين الرابطين، وEscape يعود إلى الخلية.'],
  },
} as const;
// The editing demo (owner feedback, step 6): a title, four short bullets, the event log's heading.
const EDIT_TEXT = {
  fr: ['Commandes : modifier les cellules', [
    'Double-cliquez sur une cellule, ou tapez directement, pour la modifier (sauf « Commande », grisée).',
    'Entrée garde et descend, Tab passe à la cellule suivante, Échap annule.',
    'Date : Alt+↓ ou le bouton ouvre le calendrier. Statut : une liste, tapez les premières lettres. Urgent : Espace bascule Oui / Non.',
    'Le serveur simulé refuse les valeurs qui finissent par 7 : la cellule clignote et reprend sa valeur.',
    'La grille annonce elle-même chaque refus au lecteur d’écran ; le journal ci-dessous ne fait que les montrer.',
  ], 'Derniers événements'],
  ar: ['الطلبات: تعديل الخلايا', [
    'انقر نقرًا مزدوجًا على خلية، أو اكتب مباشرة، لتعديلها (ما عدا «الطلب»، الرمادية).',
    'Enter يحفظ وينزل، وTab ينتقل إلى الخلية التالية، وEscape يلغي.',
    'التاريخ: Alt+↓ أو الزر يفتح التقويم. الحالة: قائمة، اكتب الحروف الأولى. عاجل: المسافة تبدّل نعم / لا.',
    'الخادم الوهمي يرفض القيم التي تنتهي بـ 7: تومض الخلية وتعود إلى قيمتها.',
    'الجدول نفسه يعلن كل رفض لقارئ الشاشة؛ السجل أدناه يعرضها فقط.',
  ], 'آخر الأحداث'],
} as const;
const [title, note] = editing ? [EDIT_TEXT[ar ? 'ar' : 'fr'][0], ''] : TEXT[which][ar ? 'ar' : 'fr'];
document.title = `DzGrid — ${title}`;
document.getElementById('title')!.textContent = title;
if (editing) {
  const [, steps, logTitle] = EDIT_TEXT[ar ? 'ar' : 'fr'];
  document.getElementById('steps')!.replaceChildren(...steps.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
  document.getElementById('log-title')!.textContent = logTitle;
} else document.getElementById('note')!.textContent = note;

const host = document.getElementById('host')!;
const onEvent = (e: { type: string; problems?: readonly { code: string; path: string; detail?: string }[] }): void => {
  if (e.type === 'problems') for (const p of e.problems!) console.warn('dzgrid', p.code, p.path, p.detail ?? '');
};
const demo = editing
  ? mountOrdersEdit(host, document.getElementById('log')!, { locale, onEvent: onEvent as never })
  : which === 'hr' ? mountHr(host, { locale, onEvent }) : mountOrders(host, { locale, onEvent });
if (which === 'orders') host.classList.add('demo-orders');
(window as unknown as { demo: unknown }).demo = demo;
