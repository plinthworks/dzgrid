// The editing demo (`orders-edit.html`, Phase 5 step 6; owner feedback 2026-10-24: « ça ne fonctionne pas »): a FLAT
// list of orders where every visible column but « Commande » can be edited on every row, so a double click or a key
// on any cell opens its editor at once: Client (text), Date (a day, with the calendar), Statut (a list, type-ahead),
// Qté and Montant (numbers), Urgent (yes/no: Space, Enter or a double click toggles). « Commande » is visibly read-only
// (muted, a lock, a tooltip). The save is simulated (0.6 s) and refuses every value ending in 7. The last five events
// are written under the grid. Invented data only (seed 2026).
import { createGrid, type GridInstance } from '@dzgrid/dom';
import { badge } from '@dzgrid/dom/parts';
import { FR } from '@dzgrid/dom/locales/fr';
import { AR } from '@dzgrid/dom/locales/ar';
import { edit } from '@dzgrid/dom/edit';
// No `@dzgrid/dom/editors` alias in vite.config.ts (editing it restarts the running server): the sources, by path.
import { editors } from '../../packages/dom/src/editors.js';
import { listEditor } from '../../packages/dom/src/editors-list.js';
import { FR_EDIT } from '@dzgrid/dom/locales/fr-edit';
import { AR_EDIT } from '@dzgrid/dom/locales/ar-edit';
import { FR_EDITORS } from '@dzgrid/dom/locales/fr-editors';
import { AR_EDITORS } from '@dzgrid/dom/locales/ar-editors';
import { booleanCodecWith, type ColumnDef, type GridEvent, type LocaleCtx, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import { orders, type Status } from './orders.js';

interface Order {
  readonly id: string;
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
    sent: '{col} : « {v} » envoyé…', saved: '{col} : enregistré', refused: '{col} refusé : {why}', local: 'Refus sur place : {why}', nothing: 'Rien encore.' },
  ar: { title: 'الطلبات', ref: 'الطلب', client: 'العميل', day: 'التاريخ', status: 'الحالة', qty: 'الكمية', amount: 'المبلغ', urgent: 'عاجل',
    yes: 'نعم', no: 'لا', locked: 'غير قابل للتعديل', integer: 'المطلوب عدد صحيح', server: 'رفضه خادم العرض',
    statuses: { pending: 'قيد الانتظار', ready: 'جاهزة', shipped: 'مُرسلة', delivered: 'مُسلّمة', cancelled: 'ملغاة' },
    sent: '{col}: «{v}» أُرسل…', saved: '{col}: حُفظ', refused: '{col} مرفوض: {why}', local: 'رفض فوري: {why}', nothing: 'لا شيء بعد.' },
} as const;

/** Answers after 0.6 s, as a server would; refuses every value ending in 7, with a reason of its own. */
function fakeSave(why: string) {
  return (req: { changes: readonly { value: unknown }[] }, signal: { readonly aborted: boolean; addEventListener?(type: 'abort', fn: () => void): void }) =>
    new Promise<void>((ok, no) => {
      if (signal.aborted) return no(new Error('aborted'));
      const t = setTimeout(() => (req.changes.some((c) => /7$/.test(String(c.value ?? ''))) ? no({ reason: why }) : ok()), 600);
      signal.addEventListener?.('abort', () => (clearTimeout(t), no(new Error('aborted'))));
    });
}

export interface OrdersEditDemo {
  readonly grid: GridInstance<Order>;
  /** The event log's lines, newest first. */
  readonly log: string[];
}

export function mountOrdersEdit(host: HTMLElement, logEl: HTMLElement, o: { locale: string; onEvent?: (e: GridEvent<Order>) => void }): OrdersEditDemo {
  const ar = o.locale.startsWith('ar');
  const w = ar ? W.ar : W.fr;
  const base = ar ? AR : FR;
  const messages = { ...base, text: { ...base.text, ...(ar ? AR_EDIT : FR_EDIT).text, ...(ar ? AR_EDITORS : FR_EDITORS).text, 'validation.integer': w.integer } };
  // The orders of the tree demo, without their sub-orders: one flat list; « Urgent » added.
  const rows: Order[] = orders().filter((l) => l.parent === null).map((l, i) => ({ id: l.id, ref: l.ref, client: l.client, day: l.day, status: l.status, qty: l.qty, amount: l.amount, urgent: i % 5 === 0 }));
  const columns: ColumnDef<Order, any>[] = [
    // Read-only, and seen so: muted, a lock (demos.css), the tooltip says it.
    { id: 'ref', header: w.ref, width: 150, headerTooltip: w.locked, tooltip: () => w.locked, ui: { cellClass: () => 'demo-locked', headerClass: 'demo-locked' } },
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
  const editing = edit<Order>({ save: fakeSave(w.server) });
  /** The cells whose save we are waiting for, to say « saved » once. */
  const waiting = new Set<string>();
  const id = (k: RowKey, c: string): string => `${k}\n${c}`;
  let grid!: GridInstance<Order>;
  grid = createGrid<Order>(host, {
    rows, getRowId: (r: Order) => r.id, columns, messages, locale: o.locale, direction: 'auto', label: w.title,
    parts: { status: badge({ tones: { pending: 'warning', ready: 'info', shipped: 'neutral', delivered: 'success', cancelled: 'danger' } }) },
    features: [editing, editors({ list: listEditor })],
    onEvent(e: GridEvent<Order>) {
      o.onEvent?.(e);
      if (e.type === 'cellEdited') {
        waiting.add(id(e.key, e.column));
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
  // The editors' own refusals (a value the column's rules refuse), said by the grid: written in the log too.
  const api = editing.api(grid)!;
  const alert = api.alert.bind(api);
  (api as { alert: (t: string) => void }).alert = (t) => (say(fill(w.local, { why: t })), alert(t));
  return { grid, log };
}
