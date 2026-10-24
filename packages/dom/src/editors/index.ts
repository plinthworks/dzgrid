import { problem, type FocusPos, type KeyOwner, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import { emit, intlTag } from '@dzgrid/core/internal';
import { composing } from '@dzgrid/dom/internal';
import type { GridContext } from '../context.js';
import type { EditApi } from '../edit/index.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { EditorsMessageKey } from '../part-texts.js';
import { pointerGap } from '../dir.js';
import { setAttr } from '../render/write.js';
import { bubble } from './bubble.js';
import { editorHost } from './host.js';

/** The texts `editors()` needs, from `@dzgrid/dom/locales/<lang>-editors`. */
export const EDITORS_KEYS = [
  'edit.refused', 'edit.refusedDropped', 'editors.fieldName',
  'validation.parse', 'validation.day', 'validation.invalid-instant', 'validation.wall-time-skipped', 'validation.wall-time-ambiguous',
] as const satisfies readonly EditorsMessageKey[];

export interface EditorsOptions {
  /** Q3: after Enter / Shift+Enter, the cell below / above (`'down'`, default) or the same cell (`'stay'`). */
  readonly enterMoves?: 'down' | 'stay';
  /** D5: Tab opens the next editable cell (`'cell'`, default) or leaves the grid (`'grid'`). */
  readonly tab?: 'cell' | 'grid';
}

/** The field kinds of this step; the others (dates, yes/no, lists, the host's) are step 6's. */
type Kind = 'text' | 'number';
type Start = 'f2' | 'enter' | 'key' | 'dblclick' | 'tap' | 'tab';
type Via = 'enter' | 'tab' | 'escape' | 'blur' | 'lost';
/** The field open: its cell, its element, its column. */
interface Open { readonly k: RowKey; readonly c: string; readonly f: HTMLInputElement; readonly col: ResolvedColumn<unknown> }

/** The editors' layout: no double-tap zoom delay on the body (pinch kept), the bubble fixed; layer `dzgrid.layout`. */
export const EDITORS_CSS =
  '@layer dzgrid.layout{:where(.dzg-body){touch-action:manipulation}' +
  ':where(.dzg-bubble){position:fixed;inset:auto;margin:0;z-index:10;overflow:visible}:where(.dzg-bubble[hidden]){display:none}}';

/**
 * `editors(options)`: the fields that edit a cell (Phase 5 step 5, docs/phase-5-steps/step05-plan.md; editing.md,
 * editors.md 1–5, edit-validation.md 3–9): F2, Enter (a part first), a printable character, an input method, a
 * double click or a double tap open a text or number field over the cell; Enter, Tab, a blur keep it through the
 * grid's edits (`edit()` of `@dzgrid/dom/edit`, reached through the grid), Escape gives it up; Delete clears; a
 * refused value keeps the field open under a bubble that says why.
 *
 * ```ts
 * import { edit } from '@dzgrid/dom/edit';
 * import { editors } from '@dzgrid/dom/editors';
 * createGrid(host, { …, messages: { ...FR, text: { ...FR.text, ...FR_EDIT.text, ...FR_EDITORS.text } }, features: [edit({ save }), editors()] });
 * ```
 */
export function editors(o: EditorsOptions = {}): GridFeature {
  return { id: 'editors', setup: (g) => setup(g, o) };
}

function setup(g: GridContext<unknown>, o: EditorsOptions): FeatureHandle {
  const missing = EDITORS_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
  if (missing.length) throw new TypeError(`editors: missing ${missing.join(', ')}`);
  const { kernel, el, doc, scope } = g;
  // Without the edits nothing is taken: the grid stays as it was (one warning).
  if (!g.settings.features?.some((f) => f.id === 'edit')) {
    emit(kernel, { type: 'problems', source: 'host', problems: [problem('missing-feature', 'warning', 'features.editors', 'edit')] });
    return { destroy() {} };
  }
  const root = el.root.getRootNode() as Document | ShadowRoot;
  if (!root.querySelector('style[data-dzgrid-editors]')) {
    const s = doc.createElement('style');
    s.setAttribute('data-dzgrid-editors', '');
    if (g.settings.nonce) s.setAttribute('nonce', g.settings.nonce);
    s.textContent = EDITORS_CSS;
    ('head' in root ? root.head : root).append(s);
  }
  // Found when used: the edit seam is gathered once every feature is set up.
  const api = (): EditApi<unknown> => g.edit!.api as EditApi<unknown>;
  const msg = (key: EditorsMessageKey, p: Readonly<Record<string, string>>): string => g.msg(key, p);
  const head = (col: ResolvedColumn<unknown>): string => col.def.header ?? col.id;
  const H = editorHost(g);
  const B = bubble(g);
  let cur: Open | null = null;
  /**
   * A field asked for on a cell not mounted yet (reached by Tab, or by Enter's move, keys typed faster than the
   * paint): opened at the paint that mounts it, with the characters typed meanwhile; any other focus drops it.
   */
  let wait: { k: RowKey; c: string; s: Start; t: string; e?: { key: string; shiftKey: boolean } } | null = null;
  const told = new Set<string>();

  const kind = (col: ResolvedColumn<unknown> | undefined): Kind | null => {
    const t = col?.def.edit?.editor ?? col?.type;
    return t === 'text' || t === 'number' ? t : null;
  };
  /** A number as typed: the shortest text that reads back the same, the locale's decimal sign, the grid's digits, no groups. */
  const numText = (v: number): string => {
    const nf = new Intl.NumberFormat(intlTag(g.ctx));
    const dot = nf.formatToParts(0.5).find((p) => p.type === 'decimal')?.value ?? '.';
    return String(v).replace(/[\d.]/g, (c) => (c === '.' ? dot : nf.format(+c)));
  };
  /** A value as the column shows it (the field's row name). */
  const shown = (col: ResolvedColumn<unknown>, v: unknown): string => {
    if (typeof v === 'string' || v == null) return v ?? '';
    try {
      return col.codec.format(col.codec.coerce(v, g.ctx) as never, g.ctx);
    } catch {
      return '';
    }
  };
  /** A value as it opens in a field: numbers as typed, the rest as shown. */
  const textOf = (col: ResolvedColumn<unknown>, v: unknown): string => (typeof v === 'number' ? numText(v) : shown(col, v));

  const stopped = (s: Open, kept: boolean, via: Via): void =>
    emit(kernel, { type: 'editingStopped', source: 'user', key: s.k, column: s.c, kept, via });
  /** The field closed: the bubble gone, the cell focused first unless the focus went elsewhere (`focus` false). */
  const close = (s: Open, focus: boolean, kept: boolean, via: Via): void => {
    cur = null;
    B.hide();
    H.shut(focus);
    stopped(s, kept, via);
  };
  /** The field's text through the edits: the refusal's code, or undefined when kept (or unchanged). */
  const commit = (s: Open): string | undefined => api().commit([{ key: s.k, column: s.c, input: { text: s.f.value } }]).refused[0]?.code;
  /** A refusal said, the cell's refusal shown (`/edit`, limiter applied). */
  const refused = (k: RowKey, c: string, text: string): void => {
    api().refuse(k, c);
    api().alert(text);
  };
  /** Enter or Tab: kept, or refused with the field kept open (edit-validation.md 3, 5, 7). */
  const keep = (s: Open): boolean => {
    const code = commit(s);
    if (!code) return true;
    const why = api().reason(s.c, code);
    setAttr(s.f, 'aria-invalid', 'true');
    B.show(why, s.f, g.editor!.cell);
    refused(s.k, s.c, msg('edit.refused', { column: head(s.col), reason: why }));
    return false;
  };

  const lost = (): void => {
    const s = cur;
    if (!s) return;
    cur = null;
    B.hide();
    // Hidden (a column hidden, a page changed): kept (D8, O9); removed: dropped (the edits refuse a row they no
    // longer have). No sentence here (step 7).
    stopped(s, !commit(s), 'lost');
  };

  const open = (k: RowKey, c: string, start: Start, ch?: string): boolean => {
    const col = g.columns.get(c);
    const node = g.rows.row(k);
    if (cur || !node || !kind(col) || !kernel.editable(k, c)) return false;
    const w = wait;
    wait = null;
    // Not mounted yet: the key taken, the field at the paint with what was typed meanwhile (review R1).
    if (!g.rowRenderer.cell(k, c)) return (wait = w?.k === k && w.c === c ? { ...w, t: w.t + (ch ?? '') } : { k, c, s: start, t: ch ?? textOf(col!, g.edit!.read(col!, node.data, k)) }), true;
    const f = doc.createElement('input');
    const a = (n: string, v: string): void => f.setAttribute(n, v);
    f.className = 'dzg-field';
    a('autocomplete', 'off');
    a('enterkeyhint', 'done');
    // The column's and the row's headers (the header cells carry no id: a name, not aria-labelledby).
    // The row header's value as the column shows it (not its cell's text: a part may draw it otherwise, review R6).
    const rh = g.columns.visible()[0]!;
    a('aria-label', msg('editors.fieldName', { column: head(col!), row: shown(rh, g.edit!.read(rh, node.data, k)) }));
    // The cap (S5-O5, review R3): a whole number ≥ 1 (at most 2^31 − 1); 0 or Infinity: none; anything else 1 000.
    const max = col!.def.edit?.maxLength ?? 1000;
    if (max !== 0 && max !== Infinity) f.maxLength = Number.isInteger(max) && max > 0 ? Math.min(max, 2 ** 31 - 1) : 1000;
    if (kind(col) === 'number') a('dir', 'ltr'), a('inputmode', 'decimal'), a('spellcheck', 'false');
    else a('dir', 'auto');
    f.value = ch ?? textOf(col!, g.edit!.read(col!, node.data, k));
    if (!H.open(k, c, f, lost)) return false;
    g.tip.hide();
    const s: Open = { k, c, f, col: col! };
    cur = s;
    // A blur (Q5) is decided one task later: the window losing focus leaves the field the active element.
    f.addEventListener('focusout', () =>
      scope.timeout(() => {
        if (cur !== s || (f.getRootNode() as Document).activeElement === f) return;
        const code = commit(s);
        close(s, false, !code, 'blur');
        // O1: the text dropped, the last value back; the refusal shown and said; nothing to undo.
        if (code) refused(k, c, msg('edit.refusedDropped', { column: head(s.col) }));
      }, 0),
    );
    f.focus({ preventScroll: true });
    f.setSelectionRange(f.value.length, f.value.length);
    emit(kernel, { type: 'editingStarted', source: 'user', key: k, column: c, start });
    return true;
  };

  /** Escape, Enter (Shift: up) and Tab (Shift: back) in a field: true when taken (`tab: 'grid'` leaves Tab to the browser). */
  const end = (s: Open, key: string, back: boolean): boolean => {
    if (key === 'Escape') return close(s, true, false, 'escape'), true;
    if (key === 'Enter') {
      if (keep(s)) {
        close(s, true, true, 'enter');
        if (o.enterMoves !== 'stay') g.step!({ kind: 'move', axis: 'row', delta: back ? -1 : 1 });
      }
      return true;
    }
    if (key !== 'Tab') return false;
    if (!keep(s)) return true;
    // `tab: 'grid'`: closed on the cell, the browser's Tab goes on from there (one tab stop).
    if (o.tab === 'grid') return close(s, true, true, 'tab'), false;
    const n = next(s.k, s.c, back ? -1 : 1);
    close(s, true, true, 'tab');
    if (n && kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: n.k, column: n.c } }, 'user').ok) {
      // Revealed (pinned columns, sticky rows) and focused; opened now, or at the paint that mounts it.
      g.restoreFocus();
      open(n.k, n.c, 'tab');
    }
    return true;
  };

  /** The next (`d` 1) or previous (−1) editable cell in reading order: visible columns, then the displayed rows. */
  const next = (k: RowKey, c: string, d: 1 | -1): { k: RowKey; c: string } | null => {
    const cols = g.columns.visible().filter((x) => x.def.editable && kind(x)).map((x) => x.id);
    const D = g.rows.displayed;
    let r = D.indexOf(k);
    let i = cols.indexOf(c);
    if (!cols.length || r < 0) return null;
    for (;;) {
      i += d;
      if (i < 0 || i >= cols.length) {
        r += d;
        if (r < 0 || r >= D.count) return null;
        i = d > 0 ? 0 : cols.length - 1;
      }
      const key = D.keyAt(D.index(r)!);
      if (kernel.editable(key, cols[i]!)) return { k: key, c: cols[i]! };
    }
  };

  // Printable characters and input methods: after the router and every feature's keys (Space's selection, a
  // tree's `*`), so a key someone took never starts an edit, whatever the order of the features.
  scope.on(el.viewport, 'keydown', (e: KeyboardEvent) => {
    const at = kernel.focus;
    const t = e.target as HTMLElement;
    // On a cell of ours (the focused one, or the one it leaves while the next waits for its paint): not a widget in
    // it, not a nested grid's.
    if (cur || at?.kind !== 'cell' || !t.matches('.dzg-cell') || t.closest('.dzg') !== el.root) return;
    // The composed text lands in the field: opened empty, the key left to the input method.
    if (composing(e) || e.key === 'Process' || e.key === 'Dead') return void open(at.row, at.column, 'key', '');
    // AltGr makes characters, and Option on a Mac (French Mac: [ ] { } | ~); Ctrl, Cmd and Alt elsewhere do not.
    const gr = e.getModifierState('AltGraph') || (g.mac && !e.ctrlKey);
    if (e.defaultPrevented || [...e.key].length !== 1 || e.key === ' ' || e.metaKey || (!gr && (e.ctrlKey || e.altKey))) return;
    if (open(at.row, at.column, 'key', e.key)) e.preventDefault();
  });
  /** The cell of ours a pointer event is on, as a focus position. */
  const cellAt = (t: EventTarget | null): (FocusPos & { kind: 'cell' }) | null => {
    const c = (t as Element).closest?.<HTMLElement>('.dzg-cell');
    const k = c && c.closest('.dzg') === el.root ? g.rowRenderer.keyOf(c.closest('.dzg-row')!) : undefined;
    return k && c!.dataset['col'] ? { kind: 'cell', row: k, column: c!.dataset['col'] } : null;
  };
  scope.on(el.body, 'dblclick', (e: MouseEvent) => {
    const p = cellAt(e.target);
    if (p) open(p.row, p.column, 'dblclick');
  });
  // A double tap (S5-O4): two touch ups on one cell within 400 ms and 10 px; the field focused in the handler,
  // so the soft keyboard shows. The browser's double click that may follow finds the field open.
  let tap: { p: FocusPos & { kind: 'cell' }; t: number; e: PointerEvent } | null = null;
  scope.on(el.body, 'pointerup', (e: PointerEvent) => {
    const p = cellAt(e.target);
    if (e.pointerType !== 'touch' || !p) return;
    const was = tap;
    const now = g.now();
    tap = { p, t: now, e };
    if (was && was.p.row === p.row && was.p.column === p.column && now - was.t <= 400 && pointerGap(e, was.e) <= 10) {
      tap = null;
      open(p.row, p.column, 'tap');
    }
  });

  return {
    keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
      const s = cur;
      const w = wait;
      const plain = !e.altKey && !e.ctrlKey && !e.metaKey;
      // The field's own keys but these three; a nested grid's field is that grid's.
      if (s) return e.target === s.f && plain && end(s, e.key, e.shiftKey);
      // A field waiting for its paint takes the keys a field would (review R1): Backspace shortens what was typed,
      // Enter and Tab are kept for the opening, F2 and Delete change nothing, Escape gives it up.
      if (w && plain && at?.kind === 'cell' && at.row === w.k && at.column === w.c) {
        if (e.key === 'Escape') wait = null;
        else if (e.key === 'Backspace') w.t = [...w.t].slice(0, -1).join('');
        else if (e.key === 'Enter' || e.key === 'Tab') w.e = { key: e.key, shiftKey: e.shiftKey };
        else if (e.key !== 'F2' && e.key !== 'Delete') return false;
        return true;
      }
      if (owner !== 'cell' || at?.kind !== 'cell' || !plain || e.shiftKey) return false;
      const { row: k, column: c } = at;
      if (e.key === 'F2') return open(k, c, 'f2');
      // Enter: a part that takes the focus first (editing.md 5); a cell that cannot be edited: the grid's Enter.
      if (e.key === 'Enter') return !!kind(g.columns.get(c)) && kernel.editable(k, c) && (!!g.rowRenderer.partAt(k, c)?.focus?.() || open(k, c, 'enter'));
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || !kernel.editable(k, c)) return false;
      // Cleared without a field: the column's empty value, one save; a required column refuses it.
      const code = api().commit([{ key: k, column: c, input: { text: '' } }]).refused[0]?.code;
      if (code) refused(k, c, msg('edit.refused', { column: head(g.columns.get(c)!), reason: api().reason(c, code) }));
      return true;
    },
    afterRows() {
      H.paint();
      const w = wait;
      const f = kernel.focus;
      wait = null;
      // Still the focus: opened once mounted, with what was typed, then the Enter or Tab pressed meanwhile (any
      // other focus drops it).
      if (w && f?.kind === 'cell' && f.row === w.k && f.column === w.c) {
        if (!g.rowRenderer.cell(w.k, w.c)) wait = w;
        else if (open(w.k, w.c, w.s, w.t) && w.e) end(cur!, w.e.key, w.e.shiftKey);
      }
      if (cur) B.place();
      // A name that is not a field of this step: told once (the `editor.<name>` part is step 6's).
      const ps = g.columns.visible().flatMap((x) => {
        const e = x.def.edit?.editor;
        const id = `${x.id}\n${e}`;
        return e == null || kind(x) || told.has(id) ? [] : (told.add(id), [problem('unknown-part', 'warning', `columns.${x.id}.edit.editor`, e)]);
      });
      if (ps.length) emit(kernel, { type: 'problems', source: 'host', problems: ps });
    },
    destroy() {
      cur = null;
      H.destroy();
      B.destroy();
    },
  };
}
