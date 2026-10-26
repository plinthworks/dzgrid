// The editing demo (`orders-edit.html`, Phase 5 step 6; owner feedback 2026-10-24: « ça ne fonctionne pas »): a FLAT
// list of orders where every visible column but « Commande » can be edited on every row, so a double click or a key
// on any cell opens its editor at once: Client (text), Date (a day, with the calendar), Statut (a list, type-ahead),
// Qté and Montant (numbers), Urgent (yes/no: Space, Enter or a double click toggles). « Commande » is visibly read-only
// (muted, a lock, a tooltip). The save is simulated (0.6 s) and refuses every value ending in 7. The last five events
// are written under the grid. Invented data only (seed 2026).
// Phase 5 step 7 (owner S7-O6): the saves end to end — `motion()` (the saved flash, a switch « Animations »), the
// refusal's reason on hover and on focus, retry by reopening, « Supprimer cette commande dans 3 s » (a row removed
// while it is edited), « Serveur injoignable » (a network cut: the save fails with a TypeError, as `fetch` does), a
// server-paged mode (`?paged=1`: a simulated server, 20 rows a page, « Page suivante dans 3 s »), and Enter's move
// (`?enter=stay|down`, owner Q3 revised: stay by default).
// Phase 5 step 8 (owner S8-O5): « Annuler » / « Rétablir » buttons (enabled by `undoChanged`, `api.undo()` /
// `api.redo()`: the focus goes to the cell given back, the grid says it), the log's « Annulé : … » / « Rétabli : … »;
// `?tree=1`: the sub-orders as child rows (the D4 shape, `parentId`), Qté and Montant editable on both levels, the
// « Commande mère » column read-only as the tree's structure (`tree({ structure })`, its tooltip says it).
import { createGrid, type GridInstance } from '@dzgrid/dom';
import { badge } from '@dzgrid/dom/parts';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { edit } from '@dzgrid/dom/edit';
// No `@dzgrid/dom/editors` alias in vite.config.ts (editing it restarts the running server): the sources, by path.
import { editors } from '../../packages/dom/src/editors.js';
import { listEditor } from '../../packages/dom/src/editors-list.js';
import { motion } from '@dzgrid/dom/motion-gsap';
// Phase 5 step 11a: blocks of cells (`?range=0` turns them off).
import { range } from '@dzgrid/dom/range';
import { FR_RANGE } from '@dzgrid/dom/locales/fr-range';
import { AR_RANGE } from '@dzgrid/dom/locales/ar-range';
// Phase 5 step 12: the fill handle, Ctrl+D / Ctrl+R, the fill mode, bulk edit by Ctrl+Enter (`?fill=0` turns them off).
import { fill as fillHandle } from '@dzgrid/dom/fill';
import { FR_FILL } from '@dzgrid/dom/locales/fr-fill';
import { AR_FILL } from '@dzgrid/dom/locales/ar-fill';
import { pagination } from '@dzgrid/dom/pagination';
import { tree } from '@dzgrid/dom/tree';
import { FR_TREE } from '@dzgrid/dom/locales/fr-tree';
import { AR_TREE } from '@dzgrid/dom/locales/ar-tree';
import { sourceRows, type DataRequest, type DataResponse } from '@dzgrid/core/server';
import { FR_PAGINATION } from '@dzgrid/dom/locales/fr-pagination';
import { AR_PAGINATION } from '@dzgrid/dom/locales/ar-pagination';
import { FR_EDIT } from '@dzgrid/dom/locales/fr-edit';
import { AR_EDIT } from '@dzgrid/dom/locales/ar-edit';
import { FR_EDITORS } from '@dzgrid/dom/locales/fr-editors';
import { AR_EDITORS } from '@dzgrid/dom/locales/ar-editors';
import { booleanCodecWith, idOfDataKey, type ColumnDef, type GridEvent, type LocaleCtx, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import { orders, type Status } from './orders.js';

interface Order {
  readonly id: string;
  readonly parent?: string | null;
  readonly ref: string;
  readonly client: string;
  readonly day: string;
  readonly status: Status;
  readonly qty: number;
  readonly amount: number;
  readonly urgent: boolean;
}

const STATUSES: readonly Status[] = ['pending', 'ready', 'shipped', 'delivered', 'cancelled'];
const W = {
  fr: { title: 'Commandes', ref: 'Commande', client: 'Client', day: 'Date', status: 'Statut', qty: 'Qté', amount: 'Montant', urgent: 'Urgent',
    yes: 'Oui', no: 'Non', locked: 'Non modifiable', integer: 'nombre entier attendu', server: 'refusé par le serveur de démonstration',
    statuses: { pending: 'En attente', ready: 'Préparée', shipped: 'Expédiée', delivered: 'Livrée', cancelled: 'Annulée' },
    sent: '{col} : « {v} » envoyé…', saved: '{col} : enregistré', refused: '{col} refusé : {why}', local: 'Refus sur place : {why}', nothing: 'Rien encore.',
    motion: 'Animations', offline: 'Serveur injoignable', remove: 'Supprimer cette commande dans 3 s', removed: 'Commande {ref} supprimée', next: 'Page suivante dans 3 s', pick: 'Choisissez d\u2019abord une cellule.',
    undo: 'Annuler', redo: 'Rétablir', undone: 'Annulé : {col}', redone: 'Rétabli : {col}', parent: 'Commande mère', structure: 'Structure de l\u2019arbre : non modifiable' },
  ar: { title: 'الطلبات', ref: 'الطلب', client: 'العميل', day: 'التاريخ', status: 'الحالة', qty: 'الكمية', amount: 'المبلغ', urgent: 'عاجل',
    yes: 'نعم', no: 'لا', locked: 'غير قابل للتعديل', integer: 'المطلوب عدد صحيح', server: 'رفضه خادم العرض',
    statuses: { pending: 'قيد الانتظار', ready: 'جاهزة', shipped: 'مُرسلة', delivered: 'مُسلّمة', cancelled: 'ملغاة' },
    sent: '{col}: «{v}» أُرسل…', saved: '{col}: حُفظ', refused: '{col} مرفوض: {why}', local: 'رفض فوري: {why}', nothing: 'لا شيء بعد.',
    motion: 'الحركة', offline: 'الخادم غير متاح', remove: 'حذف هذا الطلب بعد 3 ث', removed: 'حُذف الطلب {ref}', next: 'الصفحة التالية بعد 3 ث', pick: 'اختر خلية أولاً.',
    undo: 'تراجع', redo: 'إعادة', undone: 'تراجع: {col}', redone: 'إعادة: {col}', parent: 'الطلب الأصلي', structure: 'بنية الشجرة: غير قابلة للتعديل' },
} as const;

/**
 * Answers after 0.6 s, as a server would; refuses every value ending in 7, with a reason of its own; « server
 * unreachable » on: fails as `fetch` does when it cannot connect (a TypeError), the grid says « serveur injoignable ».
 */
function fakeSave(why: string, offline: () => boolean, kept: (changes: readonly { key: unknown; column: string; value: unknown }[]) => void) {
  return (req: { changes: readonly { key: unknown; column: string; value: unknown }[] }, signal: { readonly aborted: boolean; addEventListener?(type: 'abort', fn: () => void): void }) =>
    new Promise<void>((ok, no) => {
      if (signal.aborted) return no(new Error('aborted'));
      const t = setTimeout(() => (offline() ? no(new TypeError('Failed to fetch')) : req.changes.some((c) => /7$/.test(String(c.value ?? ''))) ? no({ reason: why }) : (kept(req.changes), ok())), 600);
      signal.addEventListener?.('abort', () => (clearTimeout(t), no(new Error('aborted'))));
    });
}

export interface OrdersEditDemo {
  readonly grid: GridInstance<Order>;
  /** The event log's lines, newest first. */
  readonly log: string[];
}

export function mountOrdersEdit(host: HTMLElement, logEl: HTMLElement, o: { locale: string; onEvent?: (e: GridEvent<Order>) => void; paged?: boolean; enter?: 'stay' | 'down'; bar?: HTMLElement; tree?: boolean }): OrdersEditDemo {
  const ar = o.locale.startsWith('ar');
  const w = ar ? W.ar : W.fr;
  const base = ar ? AR : FR;
  // A tree (`?tree=1`) on the browser's rows only.
  const asTree = !!o.tree && !o.paged;
  const messages = { ...base, text: { ...base.text, ...(ar ? AR_EDIT : FR_EDIT).text, ...(ar ? AR_EDITORS : FR_EDITORS).text, ...(ar ? AR_PAGINATION : FR_PAGINATION).text, ...(ar ? AR_TREE : FR_TREE).text, ...(ar ? AR_RANGE : FR_RANGE).text, ...(ar ? AR_FILL : FR_FILL).text, 'validation.integer': w.integer } };
  // The orders of the tree demo, without their sub-orders: one flat list; « Urgent » added. `?tree=1`: with them, as child rows.
  const rows: Order[] = orders().filter((l) => asTree || l.parent === null).map((l, i) => ({ id: l.id, ...(asTree && { parent: l.parent }), ref: l.ref, client: l.client, day: l.day, status: l.status, qty: l.qty, amount: l.amount, urgent: i % 5 === 0 }));
  const columns: ColumnDef<Order, any>[] = [
    // Read-only, and seen so: muted, a lock (demos.css), the tooltip says it.
    { id: 'ref', header: w.ref, width: 150, headerTooltip: w.locked, tooltip: () => w.locked, ui: { cellClass: () => 'demo-locked', headerClass: 'demo-locked' } },
    // The tree's structure (`?tree=1`): marked editable, locked by `tree({ structure })` — read-only, its tooltip says why.
    ...(asTree ? [{ id: 'parent', header: w.parent, width: 140, editable: true, value: (r: Order) => r.parent ?? '', headerTooltip: w.structure, tooltip: () => w.structure, ui: { cellClass: () => 'demo-locked', headerClass: 'demo-locked' } }] : []),
    { id: 'client', header: w.client, width: 210, editable: true, edit: { required: true, maxLength: 60 } },
    { id: 'day', header: w.day, type: 'day', width: 140, editable: true },
    { id: 'status', header: w.status, type: 'enum', width: 160, editable: true, enumOptions: STATUSES.map((value) => ({ value, label: w.statuses[value] })), ui: { cell: 'status' } },
    { id: 'qty', header: w.qty, type: 'number', width: 100, editable: true, edit: { required: true, min: 1 }, validate: (v: number | null) => (v !== null && !Number.isInteger(v) ? 'integer' : null) },
    { id: 'amount', header: w.amount, type: 'number', width: 150, editable: true, edit: { min: 0 }, numberFormat: { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 } },
    { id: 'urgent', header: w.urgent, type: 'boolean', width: 100, editable: true, codec: booleanCodecWith({ true: w.yes, false: w.no }) as never },
  ];
  const head = (c: string): string => columns.find((x) => x.id === c)?.header ?? c;
  const log: string[] = [];
  const say = (line: string): void => {
    log.unshift(line);
    log.length = Math.min(log.length, 5);
    logEl.replaceChildren(...log.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
  };
  logEl.replaceChildren(Object.assign(document.createElement('li'), { textContent: w.nothing }));
  const fill = (t: string, p: Record<string, string>): string => t.replace(/\{(\w+)\}/g, (_, k: string) => p[k] ?? '');
  let offline = false;
  // The paged mode: a simulated server holding the orders (its own copy), answering after 0.3 s with new objects;
  // what it saves it keeps (a page asked again shows it).
  let served = rows.map((r) => ({ ...r }));
  const editing = edit<Order>({
    save: fakeSave(w.server, () => offline, (changes) => {
      for (const c of changes) served = served.map((r) => (idOfDataKey(c.key as RowKey) === r.id ? { ...r, [c.column]: c.value } : r));
    }),
  });
  const fetchPage = (req: DataRequest): Promise<DataResponse<Order>> =>
    new Promise((ok) => setTimeout(() => {
      const p = req.page ?? { offset: 0, size: served.length };
      ok({ rows: served.slice(p.offset, p.offset + p.size).map((r) => ({ ...r })), total: served.length });
    }, 300));
  /** The cells whose save we are waiting for, to say « saved » once. */
  const waiting = new Set<string>();
  /** The Undo / Redo buttons (made with the bar), enabled by `undoChanged`. */
  const undoB: HTMLButtonElement[] = [];
  const sync = (u: boolean, r: boolean): void => undoB.forEach((b, i) => b.setAttribute('aria-disabled', String(!(i ? r : u))));
  const id = (k: RowKey, c: string): string => `${k}\n${c}`;
  /** Blocks of cells (`?range=0` none) and the fill over them (`?fill=0` none). */
  const blockFeatures = () => {
    const q = new URLSearchParams(location.search);
    if (q.get('range') === '0') return [];
    const blocks = range();
    return q.get('fill') === '0' ? [blocks] : [blocks, fillHandle(blocks)];
  };
  let grid!: GridInstance<Order>;
  grid = createGrid<Order>(host, {
    ...(o.paged ? { source: sourceRows<Order>({ fetch: fetchPage }), operations: 'server', pagination: { pageSize: 20 } } : { rows }),
    getRowId: (r: Order) => r.id, columns, messages, locale: o.locale, direction: 'auto', label: w.title,
    parts: { status: badge({ tones: { pending: 'warning', ready: 'info', shipped: 'neutral', delivered: 'success', cancelled: 'danger' } }) },
    ...(asTree && { rowClass: (c: { row: Order }) => (c.row.parent ? 'orders-child' : null) }),
    features: [...(asTree ? [tree<Order>({ parentId: (r) => r.parent ?? null, column: 'ref', structure: ['parent'], sticky: 1 })] : []), editing, editors({ list: listEditor, enterMoves: o.enter ?? 'stay' }), ...blockFeatures(), motion(), ...(o.paged ? [pagination()] : [])],
    onEvent(e: GridEvent<Order>) {
      o.onEvent?.(e);
      if (e.type === 'undoChanged') sync(e.canUndo, e.canRedo);
      if (e.type === 'cellEdited') {
        waiting.add(id(e.key, e.column));
        // An undo or a redo (the buttons or the keys): said as such.
        if (e.origin === 'undo' || e.origin === 'redo') return say(fill(e.origin === 'undo' ? w.undone : w.redone, { col: head(e.column) }));
        // The value as the column shows it (the grid's internal context: a demo's shortcut, not an API).
        const g = (grid as unknown as { context: { columns: { get(id: string): ResolvedColumn<Order> | undefined }; ctx: LocaleCtx } }).context;
        const c = g.columns.get(e.column);
        let v = String(e.value ?? '');
        try {
          v = e.value == null ? '' : c!.codec.format(c!.codec.coerce(e.value, g.ctx) as never, g.ctx);
        } catch { /* the raw value */ }
        say(fill(w.sent, { col: head(e.column), v }));
      } else if (e.type === 'saveFailed') {
        waiting.delete(id(e.key, e.column));
        say(fill(w.refused, { col: head(e.column), why: e.reason ?? '' }));
      } else if (e.type === 'editStates') {
        const api = editing.api(grid);
        for (const x of e.cells) {
          if (waiting.has(id(x.key, x.column)) && api?.state(x.key, x.column)?.status === 'saved') waiting.delete(id(x.key, x.column)), say(fill(w.saved, { col: head(x.column) }));
        }
      }
    },
  } as never);
  // The editors' own refusals (a value the column's rules refuse), said by the grid: written in the log too. A row
  // removed or a page changed under the field is no refusal: written as the grid says it (review 6).
  const api = editing.api(grid)!;
  const alert = api.alert.bind(api);
  const ed = (ar ? AR_EDITORS : FR_EDITORS).text;
  const [head0, tail0] = String(ed['edit.pageDropped']).split('{column}');
  const plain = (t: string): boolean => t === ed['edit.rowRemoved'] || (t.startsWith(head0!) && t.endsWith(tail0!));
  (api as { alert: (t: string) => void }).alert = (t) => (say(plain(t) ? t : fill(w.local, { why: t })), alert(t));

  // The live switches (no reload): animations, the network cut, a row removed in 3 s, the next page in 3 s.
  if (o.bar) {
    const check = (label: string, on: boolean, fn: (v: boolean) => void): HTMLLabelElement => {
      const l = document.createElement('label');
      const i = Object.assign(document.createElement('input'), { type: 'checkbox', checked: on });
      i.addEventListener('change', () => fn(i.checked));
      l.append(i, ` ${label}`);
      return l;
    };
    const button = (label: string, fn: () => void): HTMLButtonElement => {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label });
      b.addEventListener('click', fn);
      return b;
    };
    const focused = (): Order | undefined => {
      const f = grid.kernel.focus;
      return f?.kind === 'cell' ? grid.kernel.rows.row(f.row)?.data : undefined;
    };
    // Undo / Redo (owner S8-O5): as Ctrl+Z / Ctrl+Y; aria-disabled (still focusable) while there is nothing.
    for (const [label, back] of [[w.undo, true], [w.redo, false]] as const) {
      const b = button(label, () => void (b.getAttribute('aria-disabled') !== 'true' && (back ? api.undo() : api.redo())));
      b.dataset['undo'] = back ? 'undo' : 'redo';
      undoB.push(b);
    }
    sync(false, false);
    o.bar.replaceChildren(
      check(w.motion, true, (v) => grid.update({ motion: v })),
      check(w.offline, false, (v) => void (offline = v)),
      button(w.remove, () => {
        const r = focused();
        if (!r) return say(w.pick);
        // In 3 s: time to double-click one of its cells and start typing.
        setTimeout(() => {
          if (o.paged) served = served.filter((x) => x.id !== r.id), grid.kernel.dispatch({ type: 'rows.refresh' }, 'api');
          else grid.kernel.rows.applyTransaction({ remove: [r.id] });
          say(fill(w.removed, { ref: r.ref }));
        }, 3000);
      }),
      ...(o.paged ? [button(w.next, () => void setTimeout(() => grid.kernel.dispatch({ type: 'page.go', index: (grid.kernel.rows.page?.index ?? 0) + 1 }, 'api'), 3000))] : []),
      // Last, in a group of their own (the page's other controls keep their places).
      Object.assign(document.createElement('span'), { className: 'undo' }),
    );
    o.bar.lastElementChild!.append(...undoB);
  }
  return { grid, log };
}
