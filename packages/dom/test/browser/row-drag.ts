// Moving rows on the browser page (Phase 9, scripts/browser-row-drag.mjs, row-move.md): made-up rows (a task list of
// `rows` rows, default 10 000), or a tree of folders (`shape=tree`); the application gives its rows back with `moveRows`.
// Query: locale (fr-FR, ar-DZ), theme. A drop zone under the grid. `window.t` gives the grid, the events, the sentences.
import { createGrid } from '/packages/dom/src/index.ts';
import { FR } from '/packages/dom/src/locales/fr.ts';
import { AR } from '/packages/dom/src/locales/ar.ts';
import { FR_ROW_DRAG } from '/packages/dom/src/locales/fr-row-drag.ts';
import { AR_ROW_DRAG } from '/packages/dom/src/locales/ar-row-drag.ts';
import { FR_TREE } from '/packages/dom/src/locales/fr-tree.ts';
import { AR_TREE } from '/packages/dom/src/locales/ar-tree.ts';
import { FR_CONTEXT_MENU } from '/packages/dom/src/locales/fr-context-menu.ts';
import { AR_CONTEXT_MENU } from '/packages/dom/src/locales/ar-context-menu.ts';
import { rowDrag } from '/packages/dom/src/row-drag.ts';
import { tree } from '/packages/dom/src/tree.ts';
import { contextMenu } from '/packages/dom/src/context-menu.ts';
import { moveRows } from '@dzgrid/core/row-drag';
import type { GridEvent, RowKey } from '@dzgrid/core';

const q = new URLSearchParams(location.search);
const locale = q.get('locale') ?? 'fr-FR';
const ar = locale.startsWith('ar');
const isTree = q.get('shape') === 'tree';
document.documentElement.lang = locale;
document.documentElement.dir = ar ? 'rtl' : 'ltr';
if (q.get('theme')) document.documentElement.dataset['theme'] = q.get('theme')!;

type Row = { id: string; title: string; who: string; parent: string | null };
const N = Number(q.get('rows') ?? 10000);
const TASK = ar ? ['شراء الخبز', 'سقي النباتات', 'ترتيب المكتب', 'كتابة رسالة'] : ['Acheter du pain', 'Arroser les plantes', 'Ranger le bureau', 'Écrire une lettre'];
const WHO = ar ? ['سلمى', 'كريم', 'ليلى'] : ['Léa', 'Hugo', 'Inès'];
let rows: Row[] = isTree
  ? ['A', 'B', 'C'].flatMap((f, i) => [{ id: f, title: `${ar ? 'مجلد' : 'Dossier'} ${f}`, who: WHO[i]!, parent: null }, ...[0, 1, 2].map((j) => ({ id: `${f}${j}`, title: `${ar ? 'ملف' : 'Fichier'} ${f}${j}`, who: WHO[j]!, parent: f }))])
  : Array.from({ length: N }, (_, i) => ({ id: `t${i}`, title: `${TASK[i % 4]} ${i + 1}`, who: WHO[i % 3]!, parent: null }));

const drag = rowDrag<Row>();
const events: GridEvent<Row>[] = [];
const msg = ar ? AR : FR;
const grid = createGrid<Row>(document.getElementById('host')!, {
  rows,
  getRowId: (r) => r.id,
  columns: [
    { id: 'title', header: ar ? 'المهمة' : 'Tâche', width: 320 },
    { id: 'who', header: ar ? 'من' : 'Qui', width: 200 },
  ],
  messages: { locale: msg.locale, text: { ...msg.text, ...(ar ? AR_ROW_DRAG : FR_ROW_DRAG).text, ...(ar ? AR_TREE : FR_TREE).text, ...(ar ? AR_CONTEXT_MENU : FR_CONTEXT_MENU).text } },
  locale,
  selection: { mode: 'multi' },
  features: [...(isTree ? [tree<Row>({ parentId: (r) => r.parent, initial: 'all' })] : []), drag, contextMenu<Row>({ items: (c, d) => [...d, { separator: true }, ...drag.menuItems(c)] })],
  onEvent: (e) => {
    events.push(e);
    if (e.type !== 'rowMove' || e.applied) return;
    rows = moveRows(rows, e, (r) => r.id, isTree ? { parentId: (r) => r.parent, setParent: (r, p) => ({ ...r, parent: p === null ? null : String(p) }) } : {});
    grid.kernel.rows.setRows(rows);
  },
});
const said: string[] = [];
for (const el of document.querySelectorAll('.dzg-live')) new MutationObserver(() => void (el.textContent && said.push(el.textContent))).observe(el, { childList: true, characterData: true, subtree: true });
const zone = document.getElementById('zone')!;
const dropped: RowKey[][] = [];
drag.api(grid)!.dropTargets.add(zone, { accept: () => true, drop: (keys) => void dropped.push([...keys]) });
const order = () => rows.map((r) => r.id);
(window as unknown as { t: unknown }).t = { grid, events, said, dropped, order, moves: () => events.filter((e) => e.type === 'rowMove') };
(window as unknown as { ready: boolean }).ready = true;
