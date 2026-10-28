// Demo 1 (docs/phase-5-steps/demos-plan.md §2, owner D4): orders and their sub-orders, « same columns ». One
// grid, one header: a sub-order is a child row of its order (a tree by parent id), in the very same columns.
// Sub-orders take a slightly different background, which the application sets through a CSS variable of its
// own (`--orders-child-bg`, demos.css) on the rows `rowClass` marks (`orders-child`). No library change.
// Invented data only (seed 2026): clients, references and figures are ours.
import { createGrid, definePart, type GridFeature, type GridInstance } from '@dzgrid/dom';
import { tree } from '@dzgrid/dom/tree';
import { filters } from '@dzgrid/dom/filters';
import { badge } from '@dzgrid/dom/parts';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { FR_TREE } from '@dzgrid/dom/locales/fr-tree';
import { AR_TREE } from '@dzgrid/dom/locales/ar-tree';
import { FR_FILTERS } from '@dzgrid/dom/locales/fr-filters';
import { edit } from '@dzgrid/dom/edit';
// No `@dzgrid/dom/editors` alias in vite.config.ts yet (adding one restarts the running server): the source, by path.
import { editors } from '../../packages/dom/src/editors.js';
import { FR_EDIT } from '@dzgrid/dom/locales/fr-edit';
import { AR_EDIT } from '@dzgrid/dom/locales/ar-edit';
import { FR_EDITORS } from '@dzgrid/dom/locales/fr-editors';
import { AR_EDITORS } from '@dzgrid/dom/locales/ar-editors';
import { AR_FILTERS } from '@dzgrid/dom/locales/ar-filters';
import { FR_PRINT } from '@dzgrid/dom/locales/fr-print';
import { AR_PRINT } from '@dzgrid/dom/locales/ar-print';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
// Phase 6 step 12 (`o.tools`, orders.html only): moving, the ⋮ menu (an item drawn by a part), the chooser, the state.
import { columns as moveColumns } from '@dzgrid/dom/columns';
import { columnMenu } from '@dzgrid/dom/column-menu';
import { columnsChooser } from '@dzgrid/dom/columns-panel';
import { gridState, fromSearchParams, toSearchParams } from '@dzgrid/dom/state';
import { FR_COLUMNS } from '@dzgrid/dom/locales/fr-columns';
import { AR_COLUMNS } from '@dzgrid/dom/locales/ar-columns';
import { FR_COLUMN_MENU } from '@dzgrid/dom/locales/fr-column-menu';
import { AR_COLUMN_MENU } from '@dzgrid/dom/locales/ar-column-menu';
import { seeded } from './seed.js';

export type Status = 'pending' | 'ready' | 'shipped' | 'delivered' | 'cancelled';
/** An order or a sub-order: the same shape, so the same columns; `parent` is the order of a sub-order. */
export interface Line {
  readonly id: string;
  readonly parent: string | null;
  readonly ref: string;
  readonly client: string;
  readonly day: string;
  readonly status: Status;
  readonly qty: number;
  readonly amount: number;
}

const CLIENTS = ['Pharmacie Atlas', 'Clinique des Oliviers', 'Cabinet Rimel', 'Officine du Port', 'Polyclinique Hoggar', 'Centre Tassili', 'Dispensaire Ouarsenis', 'Laboratoire Sahel', 'Clinique El Bahia', 'Cabinet Medjerda'];
const STATUSES: readonly Status[] = ['pending', 'ready', 'shipped', 'delivered', 'cancelled'];

/** 200 orders, each followed by its 1 to 8 sub-orders; an order's quantity and amount are its sub-orders' sums. */
export function orders(count = 200): Line[] {
  const r = seeded(2026);
  const out: Line[] = [];
  for (let o = 1; o <= count; o++) {
    const ref = `O-${String(o).padStart(4, '0')}`;
    const client = r.pick(CLIENTS);
    const lines: Line[] = [];
    const n = r.int(1, 8);
    for (let s = 1; s <= n; s++) {
      const qty = r.int(1, 40);
      lines.push({ id: `${ref}-${s}`, parent: ref, ref: `${ref}-${s}`, client, day: r.day(2025, 2026), status: r.pick(STATUSES), qty, amount: qty * r.int(4, 120) * 50 });
    }
    const day = lines.reduce((a, l) => (l.day < a ? l.day : a), lines[0]!.day);
    out.push({ id: ref, parent: null, ref, client, day, status: r.pick(STATUSES), qty: lines.reduce((a, l) => a + l.qty, 0), amount: lines.reduce((a, l) => a + l.amount, 0) }, ...lines);
  }
  return out;
}

const WORDS = {
  fr: { mark: 'Mettre en évidence', marked: 'Colonne {c} mise en évidence', unmarked: 'Mise en évidence retirée', title: 'Commandes et sous-commandes', ref: 'Commande', client: 'Client', day: 'Date', status: 'Statut', qty: 'Qté', amount: 'Montant',
    statuses: { pending: 'En attente', ready: 'Préparée', shipped: 'Expédiée', delivered: 'Livrée', cancelled: 'Annulée' } },
  ar: { mark: 'إبراز العمود', marked: 'أُبرز العمود {c}', unmarked: 'أُزيل الإبراز', title: 'الطلبات والطلبات الفرعية', ref: 'الطلب', client: 'العميل', day: 'التاريخ', status: 'الحالة', qty: 'الكمية', amount: 'المبلغ',
    statuses: { pending: 'قيد الانتظار', ready: 'جاهزة', shipped: 'مُرسلة', delivered: 'مُسلّمة', cancelled: 'ملغاة' } },
} as const;

export interface OrdersDemo {
  readonly grid: GridInstance<Line>;
  /** With `tools`: the features the page's buttons drive (« Colonnes », « Densité », « Réinitialiser »). */
  readonly tools?: { readonly chooser: ReturnType<typeof columnsChooser>; readonly state: ReturnType<typeof gridState>; readonly key: string };
  readonly rows: readonly Line[];
  readonly columns: readonly ColumnDef<Line, any>[];
}

/**
 * The demo's save (Phase 5 step 5): answers after 0.6 s, as a server would; refuses every value ending in 7 (so the
 * owner can make it refuse on purpose), with a reason of its own.
 */
function fakeSave(ar: boolean) {
  return (req: { changes: readonly { value: unknown }[] }, signal: { readonly aborted: boolean; addEventListener?(type: 'abort', fn: () => void): void }) =>
    new Promise<void>((ok, no) => {
      // The grid gone (or the request given up): the answer never comes, as a real request aborted.
      if (signal.aborted) return no(new Error('aborted'));
      const t = setTimeout(() => (req.changes.some((c) => /7$/.test(String(c.value ?? ''))) ? no({ reason: ar ? 'رفضه خادم العرض' : 'refusé par le serveur de démonstration' }) : ok()), 600);
      signal.addEventListener?.('abort', () => (clearTimeout(t), no(new Error('aborted'))));
    });
}

/** The browser storage key of orders.html's layout (`tools`). */
export const ORDERS_STATE_KEY = 'dzg-demo-orders';

/**
 * `tools` (Phase 6 step 12, orders.html; off for orders-edit.html and the demos' browser harness): moving columns, the ⋮
 * menu with the density line and an application item drawn by a `menuItem` part (a coloured dot and its text: « Mettre
 * en évidence » marks the column), the chooser, and the layout kept in the browser storage and in the address (`?grid=1.…`).
 */
export function mountOrders(host: HTMLElement, o: { locale: string; onEvent?: (e: GridEvent<Line>) => void; editing?: boolean; tools?: boolean }): OrdersDemo {
  const ar = o.locale.startsWith('ar');
  const W = ar ? WORDS.ar : WORDS.fr;
  const base = ar ? AR : FR;
  const messages = { ...base, text: { ...base.text, ...(o.tools && { ...(ar ? AR_COLUMNS : FR_COLUMNS).text, ...(ar ? AR_COLUMN_MENU : FR_COLUMN_MENU).text }), ...(ar ? AR_FILTERS : FR_FILTERS).text, ...(ar ? AR_TREE : FR_TREE).text, ...(ar ? AR_PRINT : FR_PRINT).text, ...(o.editing && { ...(ar ? AR_EDIT : FR_EDIT).text, ...(ar ? AR_EDITORS : FR_EDITORS).text, 'validation.integer': ar ? 'المطلوب عدد صحيح' : 'nombre entier attendu' }) } };
  // Editing: the sub-orders' client, quantity and amount (an order's figures are its sub-orders' sums).
  const sub = (r: Line) => r.parent !== null;
  const ed = o.editing ? { editable: sub } : {};
  const rows = orders();
  /** The one column array: orders and sub-orders alike. */
  const columns: ColumnDef<Line, any>[] = [
    // The tree's column (its chevrons): never hidden, never moved away from the start.
    { id: 'ref', header: W.ref, width: 190, hideable: false },
    { id: 'client', header: W.client, width: 210, ...ed, ...(o.editing && { edit: { required: true, maxLength: 60 } }) },
    { id: 'day', header: W.day, type: 'day', width: 130 },
    { id: 'status', header: W.status, type: 'enum', width: 150, enumOptions: STATUSES.map((value) => ({ value, label: W.statuses[value] })), ui: { cell: 'status' } },
    { id: 'qty', header: W.qty, type: 'number', width: 110, ...ed, ...(o.editing && { edit: { required: true, min: 1 }, validate: (v: number | null) => (v !== null && !Number.isInteger(v) ? 'integer' : null) }) },
    { id: 'amount', header: W.amount, type: 'number', width: 150, ...ed, ...(o.editing && { edit: { min: 0 } }), numberFormat: { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 } },
  ];
  // ---- the tools (step 12) ----
  const moves = moveColumns();
  const chooser = columnsChooser();
  const state = gridState({ persist: { key: ORDERS_STATE_KEY } });
  /** The column « Mettre en évidence » marks: the host's attribute, its look in demos.css (cells carry `data-col`). */
  const mark = (id: string | null): void => void (id ? (host.dataset['mark'] = id) : delete host.dataset['mark']);
  const menu = columnMenu({
    use: { columns: moves, chooser },
    density: true,
    items: (col, d) => [...d, { separator: true }, {
      id: 'mark', label: W.mark, kind: 'check', checked: host.dataset['mark'] === col.id, part: 'swatch',
      action: (c) => {
        const on = host.dataset['mark'] !== c.column;
        mark(on ? c.column : null);
        c.say(on ? W.marked.replace('{c}', col.def.header ?? col.id) : W.unmarked);
      },
    }],
  });
  /** The menu item's content: a dot of the accent colour, then its text (the item's name stays its label). */
  const swatch = definePart('menuItem', {
    mount(el, c) {
      const dot = el.ownerDocument.createElement('span');
      dot.className = 'orders-swatch';
      const text = el.ownerDocument.createTextNode(c.label);
      el.append(dot, text);
      const set = (x: typeof c): void => void (dot.dataset['on'] = String(x.checked), (text.data = x.label));
      set(c);
      return { update: set };
    },
  });
  const tools: GridFeature[] = o.tools ? [moves, menu, chooser, state] : [];
  // The storage is restored at creation (`persist`); then the address (`?grid=1.…`), when it has one, wins.
  const fromUrl = o.tools ? fromSearchParams(new URLSearchParams(location.search)).state : null;
  const grid = createGrid<Line>(host, {
    rows, getRowId: (r) => r.id, columns, messages, locale: o.locale, direction: 'auto', label: W.title,
    parts: { status: badge({ tones: { pending: 'warning', ready: 'info', shipped: 'neutral', delivered: 'success', cancelled: 'danger' } }), ...(o.tools && { swatch }) },
    // The app's mark on a sub-order; its colour is the app's variable (demos.css).
    rowClass: (c) => (c.row.parent ? 'orders-child' : null),
    features: [tree<Line>({ parentId: (r) => r.parent, sticky: 1 }), filters({ popup: true }), ...(o.editing ? [edit<Line>({ save: fakeSave(ar) }), editors()] : []), ...tools],
    onEvent: (e) => {
      // Each gesture's layout written into the address (no history entry); the other parameters kept.
      if (o.tools && e.type === 'stateChanged') {
        const q = new URLSearchParams(location.search);
        for (const [k, v] of toSearchParams(e.state).params) q.set(k, v);
        history.replaceState(history.state, '', `?${q}`);
      }
      o.onEvent?.(e);
    },
  });
  if (fromUrl) state.api(grid)!.setState(fromUrl);
  return { grid, rows, columns, ...(o.tools && { tools: { chooser, state, key: ORDERS_STATE_KEY } }) };
}
