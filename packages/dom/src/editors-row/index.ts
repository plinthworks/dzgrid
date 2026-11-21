import { problem, type EnumOption, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import type { CellInput, EditController } from '@dzgrid/core/edit';
import { emit } from '@dzgrid/core/internal';
import type { EditApi } from '../edit/index.js';
import { rowRefusals, same } from '../edit/row-rule.js';
import { bubble } from '../editors/bubble.js';
import { caretOf, fieldOf, kindOf, optionsOf, shownOf, textOf } from '../editors/cells.js';
import { dateEd, dayText, today } from '../editors/dates.js';
import type { Ed, EdEnv, Kind, RowEditor, RowPlug, Start } from '../editors/index.js';
import type { FormsMessageKey } from '../part-texts.js';
import type { EditorHandle, SlotContext } from '../part.js';
import { setAttr } from '../render/write.js';

/** The texts the row editor needs besides the editors' own, from `@dzgrid/dom/locales/<lang>-forms`. */
export const ROW_KEYS = ['edit.rowEditing', 'edit.rowCancelled'] as const satisfies readonly FormsMessageKey[];

type Via = 'enter' | 'tab' | 'escape' | 'blur' | 'lost';
/** One field of the row: its column, its editor, the cell it sits in, the nodes a part owns, typed into since opened. */
interface F { readonly c: string; readonly e: Ed; readonly cell: HTMLElement; readonly own: Set<Node>; touched?: boolean }
/** The row open: its key, the column focused, its editable columns, its fields, what was typed in a field scrolled out. */
interface S {
  readonly k: RowKey;
  cur: string;
  readonly cols: readonly string[];
  readonly fields: Map<string, F>;
  readonly draft: Map<string, CellInput | undefined>;
  readonly at: unknown;
  row: HTMLElement | null;
  /** The field to focus once its cell is mounted, and what opened it. */
  want: { readonly c: string; readonly ch?: string | undefined } | null;
}

/**
 * Full-row editing (1.15.0, docs/behaviors/edit-row.md): F2, Enter, a character, a double click or tap opens every
 * editable cell of the row, each with its own editor (the editors' kinds; a yes/no cell a checkbox). Tab moves between
 * them; Enter keeps the row — its fields checked, then the row by `validateRow`, all or nothing — as one gesture (one
 * save, `origin: 'row'`, or pending with `editBatch()`); Escape gives it up; a blur keeps it. Its own entry,
 * `@dzgrid/dom/editors-row`: `editors({ row: rowEditor })`.
 */
export const rowEditor: RowEditor = Object.assign((x: EdEnv) => plug(x), { keys: ROW_KEYS });

function plug(x: EdEnv): RowPlug {
  const { g, o } = x;
  const { kernel, doc, scope } = g;
  const missing = ROW_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
  if (missing.length) throw new TypeError(`editors: missing ${missing.join(', ')}`);
  const api = (): EditApi<unknown> => g.edit!.api as EditApi<unknown>;
  // The edit seam's internal handle `x` (no coordinate), read by index for the physical-names guard.
  const ctl = (): EditController<unknown> => g.edit!['x'] as EditController<unknown>;
  const B = bubble(g);
  const head = (col: ResolvedColumn<unknown>): string => col.def.header ?? col.id;
  const told = new Set<string>();
  const tell = (id: string, path: string, detail: string): unknown =>
    !told.has(id) && (told.add(id), emit(kernel, { type: 'problems', source: 'host', problems: [problem('missing-feature', 'warning', path, detail)] }));
  /** A part that threw on a cell: not tried again until that row's data changes (the parts rule). */
  const broken = new Map<string, unknown>();
  /** A server grid's page and query now (a browser's: none). */
  const at = (): unknown => g.rows.kind === 'source' && `${g.rows.page?.index}/${g.rows.page?.size}/${JSON.stringify(kernel.query)}`;
  let S: S | null = null;

  /** A column's editor kind in the row; a list or long text without its entry is a text field, told once. */
  const kind = (col: ResolvedColumn<unknown>): Kind | null => {
    const kd = kindOf(g, o, col);
    const c = col.id;
    if (col.def.edit?.search && !o.search) tell(`${c}\ns`, `columns.${c}.edit`, '@dzgrid/dom/editors-search');
    if (kd === 'list' && !o.list && !(o.search && col.def.edit?.search)) return tell(`${c}\nl`, `columns.${c}.edit`, '@dzgrid/dom/editors-list'), 'text';
    if (kd === 'textarea' && !o.textarea) return tell(`${c}\nt`, `columns.${c}.edit`, '@dzgrid/dom/editors-textarea'), 'text';
    return kd;
  };
  /** The row's editable columns, in the columns' order (visible ones). */
  const editable = (k: RowKey): string[] => {
    const node = kernel.rowOf(k);
    return g.columns.visible().filter((col) => kind(col) && kernel.editable(k, col.id) && broken.get(`${k}\n${col.id}`) !== node?.data).map((col) => col.id);
  };
  /** The row's name: its first visible column's value as shown. */
  const rowName = (k: RowKey): string => {
    const rh = g.columns.visible()[0]!;
    return shownOf(g, rh, g.edit!.read(rh, kernel.rowOf(k)!.data, k));
  };
  const why = (c: string, code: string): string => (code === 'day' ? g.msg('validation.day', { pattern: dayText(g.ctx, today(g)) }) : api().reason(c, code));
  /** The focus in a field of the row, its popup or a node its part owns. */
  const within = (s: S, a = doc.activeElement): boolean => [...s.fields.values()].some((f) => f.e.root.contains(a) || !!f.e.inside?.(a) || [...f.own].some((n) => n.contains(a)));
  /** A blur, one task later: the focus out of every field of the row keeps it (as a cell's blur). */
  const blur = (): void => void scope.timeout(() => S && !within(S) && keep(S, 'blur'), 0);

  /** A cell's field in the row, made from what the cell shows (or what was typed before it scrolled out). */
  const make = (s: S, col: ResolvedColumn<unknown>, cell: HTMLElement, ch: string | undefined): F | null => {
    const c = col.id;
    const node = kernel.rowOf(s.k)!;
    let kd = kind(col)!;
    const d = s.draft.get(c);
    // A failed save reopens with the refused value (edit-save.md 15), else what the cell shows; what was typed wins.
    const st = api().state(s.k, c);
    const v = d && 'value' in d ? d.value : st?.status === 'failed' ? st.refused : g.edit!.read(col, node.data, s.k);
    const text = d && 'text' in d ? d.text : ch;
    const name = g.msg('editors.fieldName', { column: head(col), row: rowName(s.k) });
    const own = new Set<Node>();
    let e: Ed;
    let mount: (() => boolean) | null = null;
    const srch = o.search && col.def.edit?.search;
    let opts: readonly EnumOption[] | null = null;
    if (kd === 'list' && !srch) {
      const src = optionsOf(col);
      try {
        opts = typeof src === 'function' ? (src as (r: unknown, x: unknown) => readonly EnumOption[])(node.data, g.settings.context) : (src as readonly EnumOption[]);
      } catch (err) {
        g.report(err);
      }
      if (!Array.isArray(opts) || opts.length > 500) kd = 'text';
    }
    const label = (y: unknown): string => shownOf(g, col, y);
    // A list's pick (Space, a click) closes its list, the row stays open.
    const pick = (): void => f.e.refused?.();
    if (kd === 'boolean') {
      // The whole cell its label (the target); the box named as any field.
      const lab = doc.createElement('label');
      lab.className = 'dzg-field dzg-yesno';
      const box = lab.appendChild(doc.createElement('input'));
      box.type = 'checkbox';
      box.setAttribute('aria-label', name);
      box.checked = col.codec.coerce(v, g.ctx) === true;
      e = { root: lab, focus: box, input: () => (f.touched ? { value: box.checked } : undefined), drop() {} };
    } else if (typeof kd === 'object') {
      const host = doc.createElement('div');
      host.className = 'dzg-editor';
      host.tabIndex = -1;
      let handle: EditorHandle | null = null;
      e = {
        root: host, focus: host,
        input: () => {
          try {
            return handle?.read?.();
          } catch (err) {
            g.report(err);
          }
        },
        drop() {
          try {
            handle?.destroy?.();
          } catch (err) {
            g.report(err);
          }
        },
      };
      const part = kd as { mount(h: HTMLElement, c: SlotContext['editor']): EditorHandle };
      mount = () => {
        try {
          handle = part.mount(host, {
            ...g.partBase!, value: col.codec.coerce(v, g.ctx), text: label(v), row: node.data, key: s.k, column: col, start: 'f2',
            keep: (input) => (s.draft.set(c, input), S === s && keep(s, 'enter', input && c)),
            cancel: () => void (S === s && cancel(s)),
            refuse: (code) => void (S === s && deny(s, [{ c, code }])),
            own(n) {
              own.add(n);
              n.addEventListener('focusout', blur);
              return () => void (own.delete(n), n.removeEventListener('focusout', blur));
            },
          });
          if (!handle) throw new TypeError('editors: the editor part gave no handle');
          return true;
        } catch (err) {
          g.report(err);
          broken.set(`${s.k}\n${c}`, node.data);
          return false;
        }
      };
    } else if (kd === 'list') e = srch ? o.search!(x, col.codec.coerce(v, g.ctx), srch, label, name, pick, node.data) : o.list!(x, col.codec.coerce(v, g.ctx), opts!, label, name, pick);
    else {
      const fld = fieldOf(g, col, kd, name);
      const dt = kd === 'day' || kd === 'instant';
      if (!dt) fld.value = text ?? textOf(g, col, v);
      e = dt ? dateEd(x, fld, col, v, text, blur) : kd === 'textarea' ? o.textarea!(x, fld as never) : { root: fld, focus: fld, input: () => ({ text: fld.value }), drop() {} };
    }
    const f: F = { c, e, cell, own };
    const root = e.root;
    root.setAttribute('data-dzg-owner', 'editor');
    cell.setAttribute('data-dzg-editing', '');
    cell.append(root);
    if (mount && !mount()) return root.remove(), cell.removeAttribute('data-dzg-editing'), null;
    // Typed into: a yes/no box counts only once changed; what was typed before a scroll counts too.
    f.touched = !!d;
    root.addEventListener('input', () => (f.touched = true));
    root.addEventListener('change', () => (f.touched = true));
    root.addEventListener('focusout', blur);
    root.addEventListener('focusin', () => {
      if (S !== s || s.cur === c) return;
      s.cur = c;
      kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: s.k, column: c } }, 'user');
      seat(s);
    });
    root.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (S !== s || ev.defaultPrevented) return;
      const plain = !ev.altKey && !ev.ctrlKey && !ev.metaKey;
      const cmd = ev.key === 'Enter' && !ev.altKey && !ev.shiftKey && ev.ctrlKey !== ev.metaKey && ev.metaKey === g.mac;
      if (caretOf(e.focus, ev, plain) || (cmd && (keep(s, 'enter'), true)) || e.keys?.(ev) || (plain && end(s, f, ev))) ev.preventDefault();
    });
    s.fields.set(c, f);
    return f;
  };

  /** `g.editor`: the focused field's cell (the base leaves every cell of the row alone, `cols`). */
  const seat = (s: S): void => {
    const f = s.fields.get(s.cur) ?? s.fields.values().next().value;
    g.editor = f ? { key: s.k, column: f.c, cell: f.cell, field: f.e.root, cols: new Set(s.cols) } : null;
  };
  /** The fields of the mounted cells; a field whose cell went keeps what was typed. */
  const fill = (s: S): void => {
    for (const [c, f] of s.fields) {
      if (g.rowRenderer.cell(s.k, c) === f.cell) continue;
      if (f.touched) s.draft.set(c, f.e.input());
      f.e.drop();
      f.e.root.remove();
      f.cell.removeAttribute('data-dzg-editing');
      s.fields.delete(c);
    }
    for (const c of s.cols) {
      const cell = g.rowRenderer.cell(s.k, c);
      if (cell && !s.fields.has(c)) make(s, g.columns.get(c)!, cell, s.want?.c === c ? s.want.ch : undefined);
    }
    // The row marked (edit-row.md 3); a pooled row element keeps no mark of another row.
    const row = g.rowRenderer.cell(s.k, s.cols[0]!)?.closest<HTMLElement>('.dzg-row') ?? [...s.fields.values()][0]?.cell.closest<HTMLElement>('.dzg-row') ?? null;
    if (row !== s.row) s.row?.removeAttribute('data-dzg-row-editing'), row?.setAttribute('data-dzg-row-editing', '');
    s.row = row;
    seat(s);
    const w = s.want;
    const f = w && s.fields.get(w.c);
    if (f) {
      s.want = null;
      s.cur = w.c;
      f.e.focus.focus({ preventScroll: true });
      if (f.e.focus instanceof HTMLInputElement && f.e.focus.type !== 'checkbox') f.e.focus.setSelectionRange(f.e.focus.value.length, f.e.focus.value.length);
      f.e.ready?.(w.ch);
      if (w.ch) f.touched = true;
      seat(s);
    }
  };
  /** A field focused (Tab, or opened again): brought into view, mounted at the paint if it is not yet. */
  const go = (s: S, c: string): void => {
    s.want = { c };
    s.cur = c;
    kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: s.k, column: c } }, 'user');
    g.ensureVisible(s.k, c);
    fill(s);
  };

  /** Closed: the fields gone, the cell last focused focused first (`focus`), the row bound again, told. */
  const close = (s: S, focus: boolean, kept: boolean, via: Via): void => {
    S = null;
    B.hide();
    if (focus) g.rowRenderer.cell(s.k, s.cur)?.focus({ preventScroll: true });
    for (const f of s.fields.values()) f.e.drop(), f.e.root.remove(), f.cell.removeAttribute('data-dzg-editing');
    s.row?.removeAttribute('data-dzg-row-editing');
    g.editor = null;
    g.rowRenderer.touch([s.k]);
    g.schedule();
    emit(kernel, { type: 'editingStopped', source: 'user', key: s.k, column: s.cur, kept, via });
  };
  const cancel = (s: S): void => {
    close(s, true, false, 'escape');
    g.live.announce(g.msg('edit.rowCancelled'));
  };
  /** Refused (edit-row.md 9): every refused field invalid, the first focused with the bubble and the sentence. */
  const deny = (s: S, bad: readonly { readonly c: string; readonly code: string }[]): void => {
    for (const f of s.fields.values()) setAttr(f.e.focus, 'aria-invalid', bad.some((b) => b.c === f.c) ? 'true' : null);
    const b = bad[0]!;
    const col = g.columns.get(b.c)!;
    const text = why(b.c, b.code);
    const f = s.fields.get(b.c);
    if (f) {
      s.cur = b.c;
      f.e.focus.focus({ preventScroll: true });
      f.e.refused?.();
      seat(s);
      B.show(text, f.e.focus, f.cell);
    }
    api().refuse(s.k, b.c);
    api().alert(g.msg('edit.refused', { column: head(col), reason: text }));
  };

  /**
   * The row kept (edit-row.md 5, 7–9): each changed field read and checked, then the row by `validateRow`; any refusal
   * keeps nothing — the row stays open, or, left by a blur or a page change, its values dropped and said. Kept: one
   * gesture (`origin: 'row'`), then closed. `part`: a part's own keep (its input already in the draft).
   */
  const keep = (s: S, via: Via, part?: string | false): boolean => {
    const node = kernel.rowOf(s.k);
    const list: { key: RowKey; column: string; input: CellInput }[] = [];
    const over = new Map<string, unknown>();
    const bad: { c: string; code: string }[] = [];
    for (const c of s.cols) {
      const f = s.fields.get(c);
      const input = f && (f.touched || c === part) ? (c === part ? s.draft.get(c) : f.e.input()) : s.draft.get(c);
      const col = g.columns.get(c)!;
      if (!input || !node) continue;
      const now = g.edit!.read(col, node.data, s.k);
      // Unchanged: nothing to check nor send (a value already wrong in the data never blocks the row).
      if ('text' in input ? input.text === textOf(g, col, now) : same(g, col, input.value, now)) continue;
      const r = ctl().check(s.k, c, input);
      if (!r.ok) bad.push({ c, code: r.code });
      else if (!same(g, col, r.value, now)) list.push({ key: s.k, column: c, input }), over.set(c, r.value);
    }
    if (!bad.length && list.length) for (const r of rowRefusals(g, o.validateRow, s.k, list[0]!.column, over)) bad.push({ c: r.column, code: r.code });
    if (bad.length) {
      if (via !== 'blur' && via !== 'lost') return deny(s, bad), false;
      close(s, false, false, via);
      const col = g.columns.get(bad[0]!.c)!;
      api().refuse(s.k, col.id);
      api().alert(at() !== s.at ? g.msg('edit.pageDropped', { column: head(col) }) : g.msg('edit.refusedDropped', { column: head(col) }));
      return false;
    }
    if (list.length) api().commit(list, { origin: 'row' });
    close(s, via !== 'blur' && via !== 'lost', true, via);
    return true;
  };

  /** The next (1) or previous (−1) row's first (last) editable cell, in the displayed rows. */
  const nextRow = (k: RowKey, d: 1 | -1): { k: RowKey; c: string } | null => {
    const D = g.rowsOf?.(k) ?? g.rows.displayed;
    for (let r = D.indexOf(k) + d; r >= 0 && r < D.count && D.indexOf(k) >= 0; r += d) {
      const key = D.keyAt(D.index(r)!);
      const cols = kernel.rowOf(key) ? editable(key) : [];
      if (cols.length) return { k: key, c: cols[d > 0 ? 0 : cols.length - 1]! };
    }
    return null;
  };

  /** Escape, Enter (Shift: up) and Tab (Shift: back) in a field of the row: true when taken. */
  const end = (s: S, f: F, ev: KeyboardEvent): boolean => {
    const back = ev.shiftKey;
    if (ev.key === 'Escape') return cancel(s), true;
    if (ev.key === 'Enter') {
      if (keep(s, 'enter') && o.enterMoves === 'down') g.step!({ kind: 'move', axis: 'row', delta: back ? -1 : 1 });
      return true;
    }
    if (ev.key !== 'Tab') return false;
    const i = s.cols.indexOf(f.c) + (back ? -1 : 1);
    if (i >= 0 && i < s.cols.length) return go(s, s.cols[i]!), true;
    // Past the row's last (first) field: the row kept, then the next (previous) row opened, as a cell's Tab.
    if (o.tab === 'grid') return !keep(s, 'tab');
    const n = nextRow(s.k, back ? -1 : 1);
    if (keep(s, 'tab') && n && kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: n.k, column: n.c } }, 'user').ok) {
      g.restoreFocus();
      open(n.k, n.c, 'tab');
    }
    return true;
  };

  const open = (k: RowKey, c: string, start: Start, ch?: string): boolean => {
    if (S?.k === k && S.cols.includes(c)) return go(S, c), true;
    if (S && !keep(S, 'enter')) return false;
    if (!kernel.rowOf(k)) return false;
    const cols = editable(k);
    if (!cols.includes(c)) return false;
    const s: S = { k, cur: c, cols, fields: new Map(), draft: new Map(), at: at(), row: null, want: { c, ch } };
    S = s;
    g.tip.hide();
    fill(s);
    g.live.announce(g.msg('edit.rowEditing', { row: rowName(k), n: cols.length }));
    emit(kernel, { type: 'editingStarted', source: 'user', key: k, column: c, start });
    return true;
  };

  // A server page or query asked while a row is open (O9): kept and sent now, while the row is still held.
  const unhear = g.rows.kind === 'source' ? g.rows.subscribe((ch) => void (S && (ch.kind === 'page' || ch.kind === 'query') && keep(S, 'lost'))) : null;

  return {
    open,
    paint() {
      const s = S;
      if (!s) return;
      // Its row removed (a host removal, a reload without it): given up, said once.
      if (!kernel.rowOf(s.k)) return close(s, false, false, 'lost'), api().alert(g.msg('edit.rowRemoved'));
      fill(s);
      for (const f of s.fields.values()) f.e.place?.();
      B.place();
    },
    destroy() {
      unhear?.();
      if (S) for (const f of S.fields.values()) f.e.drop();
      S = null;
      B.destroy();
    },
  };
}
