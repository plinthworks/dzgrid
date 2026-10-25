// The two showcase demo pages (`orders.html`, `hr.html`, demos-plan.md §1): the page's language, light or
// dark, and showcase theme from the query (by default French, light, Clinic), the controls that change them
// (the page reloads), then the demo mounted. The showcase theme is one <style> at a time, as on the main page.
import '../../packages/theme/dzgrid.css';
import MIDNIGHT from '../../packages/theme/midnight.css?inline';
import CLINIC from '../../packages/theme/clinic.css?inline';
import './demos.css';
// The editing marks, the field and the bubble (used by orders-edit.html only; unused rules elsewhere).
import '../../packages/theme/edit.css';
// The block of cells (Phase 5 step 11a; orders-edit.html, `?range=0` turns it off).
import '../../packages/theme/range.css';
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
// `orders-edit.html?focus=range` (owner « je ne trouve aucun exemple pour la sélection »): the selection and clipboard
// bullets in place of the editing steps.
const focus = page === 'orders-edit' && q.get('focus') === 'range';
const skin = q.get('skin') ?? 'clinic';
const form = document.getElementById('controls') as HTMLFormElement;
const field = (name: string) => form.elements.namedItem(name) as HTMLSelectElement;
field('locale').value = locale;
field('theme').value = theme;
field('skin').value = skin;
// The editing page's own selectors (step 7): Enter's move and the paged mode, kept in the query.
const extra = ['enter', 'paged', 'tree'].filter((n) => form.elements.namedItem(n));
for (const n of extra) field(n).value = q.get(n) ?? field(n).value;
form.addEventListener('change', () => {
  location.search = new URLSearchParams({ locale: field('locale').value, theme: field('theme').value, skin: field('skin').value, ...Object.fromEntries(extra.map((n) => [n, field(n).value])), ...(focus ? { focus: 'range' } : {}) }).toString();
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
const RANGE_TEXT = {
  fr: 'Bloc de cellules : Maj+flèches depuis une cellule, ou glissez à la souris (la vue défile près des bords), Maj+clic étend, Ctrl+A (⌘A) tout, Maj+Espace la ligne ; Échap l’efface. Un tri, un filtre ou une recherche l’efface aussi, et le dit (?range=0 l’éteint).',
  ar: 'كتلة خلايا: Shift+الأسهم من خلية، أو اسحب بالفأرة (يتمرّر العرض قرب الحواف)، Shift+نقرة توسّعها، Ctrl+A (⌘A) الكل، Shift+المسافة الصف؛ Escape يلغيها. الفرز أو التصفية أو البحث يلغيها أيضًا ويعلن ذلك (?range=0 يوقفها).',
} as const;
// `?focus=range`: a title and four bullets on blocks of cells and the clipboard (steps 11a, 11b).
const FOCUS_TEXT = {
  fr: ['Sélection de cellules et copier-coller (comme Excel)', [
    'Sélectionner un bloc : cliquez sur une cellule, puis Maj+flèches, ou glissez à la souris. Maj+clic étend le bloc, Ctrl+A (⌘A) sélectionne tout, Échap l’efface.',
    'Copier-coller : Ctrl+C puis Ctrl+V (⌘C / ⌘V sur Mac). Un bloc copié depuis Excel ou Google Sheets se colle aussi. Ctrl+X coupe (les cellules sont vidées tout de suite), Suppr vide le bloc.',
    'Un collage = un seul enregistrement et un seul Ctrl+Z (⌘Z) pour tout annuler. Une valeur refusée (qui finit par 7) est sautée et comptée dans le message.',
    'Essayez : copiez « 1 234,50 € » (depuis ce texte) et collez-le dans une cellule « Montant ».',
  ]],
  ar: ['تحديد الخلايا والنسخ واللصق (مثل Excel)', [
    'تحديد كتلة: انقر على خلية، ثم Shift+الأسهم، أو اسحب بالفأرة. Shift+نقرة توسّعها، Ctrl+A (⌘A) الكل، Escape يلغيها.',
    'النسخ واللصق: Ctrl+C ثم Ctrl+V (⌘C / ⌘V على Mac). الكتلة المنسوخة من Excel أو Google Sheets تُلصق أيضًا. Ctrl+X يقص (تُفرَّغ الخلايا فورًا)، وDelete يمسح الكتلة.',
    'لصقة واحدة = حفظ واحد وCtrl+Z واحد (⌘Z) لإلغاء الكل. القيمة المرفوضة (التي تنتهي بـ 7) تُتخطّى وتُحسب في الرسالة.',
    'جرّب: انسخ «١٢٣٤» (من هذا النص) والصقه في خلية «المبلغ».',
  ]],
} as const;
// Without `?focus=range`: one line at the top to the selection demo.
const HINT_TEXT = { fr: 'Astuce : sélection de blocs et copier-coller → ', ar: 'نصيحة: تحديد كتلة خلايا والنسخ واللصق ← ' } as const;
const HINT_LINK = { fr: 'voir l’exemple', ar: 'انظر المثال' } as const;
const EDIT_TEXT = {
  fr: ['Commandes : modifier les cellules', [
    'Double-cliquez sur une cellule, ou tapez directement, pour la modifier (sauf « Commande », grisée).',
    'Entrée garde (le focus reste, ou descend : sélecteur « Entrée » ci-dessus), Tab passe à la cellule suivante, Échap annule.',
    'Date : Alt+↓ ou le bouton ouvre le calendrier. Statut : une liste, tapez les premières lettres. Urgent : Espace bascule Oui / Non.',
    'Le serveur simulé refuse les valeurs qui finissent par 7 : la cellule clignote et reprend sa valeur ; survolez-la (ou atteignez-la au clavier) pour lire la raison, F2 la rouvre avec la valeur refusée pour réessayer.',
    'Enregistré : une coche, et un bref éclat (case « Animations »). « Serveur injoignable » : chaque enregistrement échoue et la grille le dit.',
    'Choisissez une cellule, « Supprimer cette commande dans 3 s », puis double-cliquez dans sa ligne et tapez : la ligne disparaît, la modification est annulée et dite.',
    'Données « serveur paginé » : la valeur tapée est envoyée dès que la page change (« Page suivante dans 3 s »).',
    'Annuler : Ctrl+Z (⌘Z sur Mac) ; rétablir : Ctrl+Y ou Ctrl+Maj+Z (⌘⇧Z), ou les boutons « Annuler » / « Rétablir » : la valeur revient, est enregistrée de nouveau, et le focus va sur la cellule.',
    'Forme « arbre » : les sous-commandes sous leur commande, Qté et Montant modifiables aux deux niveaux ; « Commande mère » est la structure de l\u2019arbre, non modifiable.',
    'La grille annonce elle-même chaque refus au lecteur d’écran ; le journal ci-dessous ne fait que les montrer.',
  ], 'Derniers événements', ['Entrée', 'reste', 'descend', 'Données', 'dans le navigateur', 'serveur paginé', 'Forme', 'liste', 'arbre']],
  ar: ['الطلبات: تعديل الخلايا', [
    'انقر نقرًا مزدوجًا على خلية، أو اكتب مباشرة، لتعديلها (ما عدا «الطلب»، الرمادية).',
    'Enter يحفظ (يبقى التركيز أو ينزل: محدِّد «Enter» أعلاه)، وTab ينتقل إلى الخلية التالية، وEscape يلغي.',
    'التاريخ: Alt+↓ أو الزر يفتح التقويم. الحالة: قائمة، اكتب الحروف الأولى. عاجل: المسافة تبدّل نعم / لا.',
    'الخادم الوهمي يرفض القيم التي تنتهي بـ 7: تومض الخلية وتعود إلى قيمتها؛ مرّر المؤشر فوقها (أو اصل إليها بلوحة المفاتيح) لقراءة السبب، وF2 يعيد فتحها بالقيمة المرفوضة للمحاولة مجددًا.',
    'حُفظ: علامة صح وومضة قصيرة (خانة «الحركة»). «الخادم غير متاح»: يفشل كل حفظ ويعلن الجدول ذلك.',
    'اختر خلية، ثم «حذف هذا الطلب بعد 3 ث»، ثم انقر مرتين في صفه واكتب: يختفي الصف ويُلغى التعديل ويُعلن ذلك.',
    'البيانات «خادم بصفحات»: تُرسل القيمة المكتوبة فور تغيّر الصفحة («الصفحة التالية بعد 3 ث»).',
    'التراجع: Ctrl+Z (⌘Z على Mac)؛ الإعادة: Ctrl+Y أو Ctrl+Shift+Z (⌘⇧Z)، أو زرّا «تراجع» و«إعادة»: تعود القيمة وتُحفظ من جديد وينتقل التركيز إلى الخلية.',
    'الشكل «شجرة»: الطلبات الفرعية تحت طلبها، والكمية والمبلغ قابلان للتعديل في المستويين؛ «الطلب الأصلي» بنية الشجرة، غير قابل للتعديل.',
    'الجدول نفسه يعلن كل رفض لقارئ الشاشة؛ السجل أدناه يعرضها فقط.',
  ], 'آخر الأحداث', ['Enter', 'يبقى', 'ينزل', 'البيانات', 'في المتصفح', 'خادم بصفحات', 'الشكل', 'قائمة', 'شجرة']],
} as const;
const [title, note] = editing ? [(focus ? FOCUS_TEXT : EDIT_TEXT)[ar ? 'ar' : 'fr'][0], ''] : TEXT[which][ar ? 'ar' : 'fr'];
document.title = `DzGrid — ${title}`;
document.getElementById('title')!.textContent = title;
if (editing) {
  const lang = ar ? 'ar' : 'fr';
  const [, editSteps, logTitle, sel] = EDIT_TEXT[lang];
  const steps = focus ? FOCUS_TEXT[lang][1] : editSteps;
  document.getElementById('steps')!.replaceChildren(...steps.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
  const hint = document.getElementById('hint')!;
  if (focus) hint.remove();
  else {
    const to = new URLSearchParams(q);
    to.set('focus', 'range');
    hint.replaceChildren(HINT_TEXT[lang], Object.assign(document.createElement('a'), { href: `?${to}`, textContent: HINT_LINK[lang] }));
    // Blocks of cells (step 11a): said under the grid, so the rows the checks click stay in a 900 px window.
    document.querySelector('main')!.append(Object.assign(document.createElement('p'), { className: 'note', textContent: RANGE_TEXT[lang] }));
  }
  document.getElementById('log-title')!.textContent = logTitle;
  // The selectors' words in the page's language (« Entrée : reste / descend »).
  document.getElementById('enter-label')!.textContent = sel[0];
  [field('enter').options[0]!.text, field('enter').options[1]!.text] = [sel[1], sel[2]];
  document.getElementById('paged-label')!.textContent = sel[3];
  [field('paged').options[0]!.text, field('paged').options[1]!.text] = [sel[4], sel[5]];
  document.getElementById('tree-label')!.textContent = sel[6];
  [field('tree').options[0]!.text, field('tree').options[1]!.text] = [sel[7], sel[8]];
} else document.getElementById('note')!.textContent = note;

const host = document.getElementById('host')!;
const onEvent = (e: { type: string; problems?: readonly { code: string; path: string; detail?: string }[] }): void => {
  if (e.type === 'problems') for (const p of e.problems!) console.warn('dzgrid', p.code, p.path, p.detail ?? '');
};
const demo = editing
  ? mountOrdersEdit(host, document.getElementById('log')!, { locale, onEvent: onEvent as never, paged: q.get('paged') === '1', enter: q.get('enter') === 'down' ? 'down' : 'stay', tree: q.get('tree') === '1', bar: document.getElementById('live')! })
  : which === 'hr' ? mountHr(host, { locale, onEvent }) : mountOrders(host, { locale, onEvent });
if (which === 'orders') host.classList.add('demo-orders');
(window as unknown as { demo: unknown }).demo = demo;
