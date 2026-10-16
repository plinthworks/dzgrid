import { createGrid } from './grid.js';
import { columns, flatRows, messages, treeRows, type Lang } from './data.js';

const q = new URLSearchParams(location.search);
const lang = (q.get('lang') ?? 'fr') as Lang;
const mode = q.get('mode') ?? 'grid';          // grid | treegrid | detail | paged | colvirt
const extra = mode === 'colvirt' ? 12 : 0;
document.documentElement.lang = lang;
document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
document.title = q.get('title') ?? `S4 ${mode} ${lang}`;
document.getElementById('h')!.textContent = document.title;
if (lang === 'ar') { document.getElementById('before')!.setAttribute('aria-label', 'قبل'); document.getElementById('after')!.setAttribute('aria-label', 'بعد'); }

const rows = mode === 'treegrid' ? treeRows(lang) : flatRows(10_000, lang, extra);
const g = createGrid(document.getElementById('host')!, {
  columns: columns(lang, extra), rows, lang, dir: lang === 'ar' ? 'rtl' : 'ltr', messages: messages(lang),
  mode: mode === 'treegrid' ? 'treegrid' : 'grid',
  detail: mode === 'detail' ? (r) => (Number(r.id.slice(1)) % 2 === 0 ? `${r.service} — ${r.city}, ${r.day}` : null) : undefined,
  openDetails: mode === 'detail' ? ['r0', 'r2', 'r4998', 'r5000', 'r9998'] : undefined,
  layout: (q.get('layout') as 'arch' | null) ?? 'proposed',
  renderCols: mode === 'colvirt' ? [0, 6, 7, 8, 9, 10] : undefined,
  pageSize: mode === 'paged' ? 100 : undefined,
  retain: q.get('retain') !== '0',
  scrollerTabIndex: q.get('scrollerTabIndex') !== '0',
});
(window as any).grid = g;
(window as any).ready = true;

// ---- manual mode (?manual=1): delayed actions so a screen-reader tester can trigger a change
// while focus sits in the grid (see protocol.md). Not used by run.mjs.
if (q.get('manual') === '1') {
  const T = lang === 'fr'
    ? { go: 'Aller à la ligne 5 000', end: 'Dans 5 s : défiler jusqu’à la fin (focus inchangé)', sort: 'Dans 5 s : trier par Âge', filter: 'Dans 5 s : filtrer sur Oran', clear: 'Dans 5 s : retirer le filtre', update: 'Dans 5 s : mettre à jour les données', page: 'Dans 5 s : page suivante', toolbar: 'Actions de test' }
    : { go: 'الانتقال إلى الصف 5000', end: 'بعد 5 ث: التمرير إلى النهاية (دون تغيير التركيز)', sort: 'بعد 5 ث: الترتيب حسب العمر', filter: 'بعد 5 ث: التصفية على وهران', clear: 'بعد 5 ث: إزالة المرشح', update: 'بعد 5 ث: تحديث البيانات', page: 'بعد 5 ث: الصفحة التالية', toolbar: 'إجراءات الاختبار' };
  const bar = document.createElement('div');
  bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', T.toolbar);
  const later = (fn: () => void) => () => setTimeout(fn, 5000);
  let p = 0;
  const actions: [string, () => void][] = [
    [T.go, () => { g.scrollToIndex(4996); mode === 'treegrid' ? g.focusCell('r5001', 'name') : g.focusCell('r4999', 'city'); }],
    [T.end, later(() => g.scrollToIndex(g.count - 1))],
    [T.sort, later(() => g.setSort('age', 'ascending'))],
    [T.filter, later(() => g.setFilter((r) => r.city === (lang === 'fr' ? 'Oran' : 'وهران')))],
    [T.clear, later(() => g.setFilter(null))],
    [T.update, later(() => g.update((r) => ({ ...r, age: String(Number(r.age) + 1) })))],
  ];
  if (mode === 'paged') actions.push([T.page, later(() => g.setPage(++p))]);
  for (const [label, fn] of actions) {
    const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = label; btn.onclick = fn; bar.append(btn, ' ');
  }
  document.getElementById('before')!.before(bar);
}
