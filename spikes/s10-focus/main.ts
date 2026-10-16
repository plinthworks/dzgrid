// S10 page: the S4 spike grid (../s4-a11y/grid.ts), plus a log of every focus event.
import { createGrid } from '../s4-a11y/grid.js';
import { columns, flatRows, messages, type Lang } from '../s4-a11y/data.js';

const q = new URLSearchParams(location.search);
const lang = (q.get('lang') ?? 'fr') as Lang;
document.documentElement.lang = lang;
document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

const describe = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return String(t);
  const row = el.closest?.('[data-key]') as HTMLElement | null;
  return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${row ? ' ' + row.dataset.key + '/' + ((el.closest('[data-col]') as HTMLElement)?.dataset.col ?? '') : ''}`;
};
const events: string[] = [];
for (const type of ['blur', 'focus', 'focusout', 'focusin'])
  document.addEventListener(type, (e) => events.push(`${type} ${describe(e.target)}`), true);
(window as any).events = events;

const g = createGrid(document.getElementById('host')!, {
  columns: columns(lang), rows: flatRows(10_000, lang), lang, dir: lang === 'ar' ? 'rtl' : 'ltr', messages: messages(lang),
  retain: q.get('retain') !== '0',
});
(window as any).grid = g;
(window as any).describe = describe;
(window as any).ready = true;
