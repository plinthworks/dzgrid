// Demo 1 (docs/phase-5-steps/demos-plan.md §2, owner D4): orders and their sub-orders, « same columns ». One
// grid, one header: a sub-order is a child row of its order (a tree by parent id), in the very same columns.
// Sub-orders take a slightly different background, which the application sets through a CSS variable of its
// own (`--orders-child-bg`, demos.css) on the rows `rowClass` marks (`orders-child`). No library change.
// Invented data only (seed 2026): clients, references and figures are ours.
import { createGrid, type GridInstance } from '@dzgrid/dom';
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
  fr: { title: 'Commandes et sous-commandes', ref: 'Commande', client: 'Client', day: 'Date', status: 'Statut', qty: 'Qté', amount: 'Montant',
    statuses: { pending: 'En attente', ready: 'Préparée', shipped: 'Expédiée', delivered: 'Livrée', cancelled: 'Annulée' } },
  ar: { title: 'الطلبات والطلبات الفرعية', ref: 'الطلب', client: 'العميل', day: 'التاريخ', status: 'الحالة', qty: 'الكمية', amount: 'المبلغ',
    statuses: { pending: 'قيد الانتظار', ready: 'جاهزة', shipped: 'مُرسلة', delivered: 'مُسلّمة', cancelled: 'ملغاة' } },
} as const;

export interface OrdersDemo {
  readonly grid: GridInstance<Line>;
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

export function mountOrders(host: HTMLElement, o: { locale: string; onEvent?: (e: GridEvent<Line>) => void; editing?: boolean }): OrdersDemo {
  const ar = o.locale.startsWith('ar');
  const W = ar ? WORDS.ar : WORDS.fr;
  const base = ar ? AR : FR;
  const messages = { ...base, text: { ...base.text, ...(ar ? AR_FILTERS : FR_FILTERS).text, ...(ar ? AR_TREE : FR_TREE).text, ...(ar ? AR_PRINT : FR_PRINT).text, ...(o.editing && { ...(ar ? AR_EDIT : FR_EDIT).text, ...(ar ? AR_EDITORS : FR_EDITORS).text, 'validation.integer': ar ? 'المطلوب عدد صحيح' : 'nombre entier attendu' }) } };
  // Editing: the sub-orders' client, quantity and amount (an order's figures are its sub-orders' sums).
  const sub = (r: Line) => r.parent !== null;
  const ed = o.editing ? { editable: sub } : {};
  const rows = orders();
  /** The one column array: orders and sub-orders alike. */
  const columns: ColumnDef<Line, any>[] = [
    { id: 'ref', header: W.ref, width: 190 },
    { id: 'client', header: W.client, width: 210, ...ed, ...(o.editing && { edit: { required: true, maxLength: 60 } }) },
    { id: 'day', header: W.day, type: 'day', width: 130 },
    { id: 'status', header: W.status, type: 'enum', width: 150, enumOptions: STATUSES.map((value) => ({ value, label: W.statuses[value] })), ui: { cell: 'status' } },
    { id: 'qty', header: W.qty, type: 'number', width: 110, ...ed, ...(o.editing && { edit: { required: true, min: 1 }, validate: (v: number | null) => (v !== null && !Number.isInteger(v) ? 'integer' : null) }) },
    { id: 'amount', header: W.amount, type: 'number', width: 150, ...ed, ...(o.editing && { edit: { min: 0 } }), numberFormat: { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 } },
  ];
  const grid = createGrid<Line>(host, {
    rows, getRowId: (r) => r.id, columns, messages, locale: o.locale, direction: 'auto', label: W.title,
    parts: { status: badge({ tones: { pending: 'warning', ready: 'info', shipped: 'neutral', delivered: 'success', cancelled: 'danger' } }) },
    // The app's mark on a sub-order; its colour is the app's variable (demos.css).
    rowClass: (c) => (c.row.parent ? 'orders-child' : null),
    features: [tree<Line>({ parentId: (r) => r.parent, sticky: 1 }), filters({ popup: true }), ...(o.editing ? [edit<Line>({ save: fakeSave(ar) }), editors()] : [])],
    ...(o.onEvent && { onEvent: o.onEvent }),
  });
  return { grid, rows, columns };
}
