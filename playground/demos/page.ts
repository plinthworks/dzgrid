// The two showcase demo pages (`orders.html`, `hr.html`, demos-plan.md §1): the page's language, light or
// dark, and showcase theme from the query (by default French, light, Clinic), the controls that change them
// (the page reloads), then the demo mounted. The showcase theme is one <style> at a time, as on the main page.
import '../../packages/theme/dzgrid.css';
import MIDNIGHT from '../../packages/theme/midnight.css?inline';
import CLINIC from '../../packages/theme/clinic.css?inline';
import './demos.css';
import { mountOrders } from './orders.js';
import { mountHr } from './hr.js';

const which = document.body.dataset['demo'] === 'hr' ? 'hr' : 'orders';
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
    fr: ['Commandes et sous-commandes, mêmes colonnes', 'Des commandes ; une commande ouverte montre ses sous-commandes juste en dessous, dans les mêmes colonnes et sous le même en-tête, sur un fond un peu différent (une variable CSS de l’application, --orders-child-bg). Le chevron (colonne « Commande ») ouvre et ferme ; au clavier, → ouvre, ← ferme. Tri et filtres gardent chaque sous-commande sous sa commande.'],
    ar: ['الطلبات والطلبات الفرعية، الأعمدة نفسها', 'طلبات؛ يُظهر الطلب المفتوح طلباته الفرعية تحته مباشرة، بالأعمدة نفسها وتحت الترويسة نفسها، على خلفية مختلفة قليلاً (متغيّر CSS للتطبيق، ‎--orders-child-bg). الترتيب والمرشحات يُبقيان كل طلب فرعي تحت طلبه.'],
  },
  hr: {
    fr: ['Ressources humaines (organigramme)', 'L’organigramme d’un hôpital (personnes inventées) : les trois responsables les plus proches restent épinglés sous l’en-tête. Lignes de 52 px (rowHeight). Au clavier : → ouvre, ← ferme dans la colonne « Employé » ; dans « Contact », Entrée va sur le premier lien, ← → passent de l’un à l’autre, Échap revient à la cellule.'],
    ar: ['الموارد البشرية (الهيكل التنظيمي)', 'الهيكل التنظيمي لمستشفى (أشخاص من الخيال): يبقى أقرب ثلاثة مسؤولين مثبّتين تحت الترويسة. في عمود «الاتصال»: Enter ينتقل إلى الرابط الأول، والأسهم بين الرابطين، وEscape يعود إلى الخلية.'],
  },
} as const;
const [title, note] = TEXT[which][ar ? 'ar' : 'fr'];
document.title = `DzGrid — ${title}`;
document.getElementById('title')!.textContent = title;
document.getElementById('note')!.textContent = note;

const host = document.getElementById('host')!;
const onEvent = (e: { type: string; problems?: readonly { code: string; path: string; detail?: string }[] }): void => {
  if (e.type === 'problems') for (const p of e.problems!) console.warn('dzgrid', p.code, p.path, p.detail ?? '');
};
const demo = which === 'hr' ? mountHr(host, { locale, onEvent }) : mountOrders(host, { locale, onEvent });
if (which === 'orders') host.classList.add('demo-orders');
(window as unknown as { demo: unknown }).demo = demo;
