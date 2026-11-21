import { problem, type EnumOption, type FocusPos, type KeyOwner, type OptionSearch, type Problem, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import type { RowRule } from '@dzgrid/core/edit';
import { emit } from '@dzgrid/core/internal';
import { composing, type Once } from '@dzgrid/dom/internal';
import type { GridContext } from '../context.js';
import type { EditApi } from '../edit/index.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { EditorsMessageKey } from '../part-texts.js';
import type { CellInput, EditorHandle, Part, SlotContext } from '../part.js';
import { pointerGap } from '../dir.js';
import { setAttr } from '../render/write.js';
import { bubble } from './bubble.js';
import { calendars, dateEd, dayText, today, type CalendarKit } from './dates.js';
import { editorHost } from './host.js';
import { caretOf, fieldOf, kindOf, listOf, optionsOf, shownOf, textOf as textIn, type Kind } from './cells.js';

/** The texts `editors()` needs, from `@dzgrid/dom/locales/<lang>-editors` (Retry is the base's `grid.retry`). */
export const EDITORS_KEYS = [
  'edit.refused', 'edit.refusedDropped', 'editors.fieldName',
  'validation.parse', 'validation.day', 'validation.invalid-instant', 'validation.wall-time-skipped', 'validation.wall-time-ambiguous',
  'edit.calendar', 'edit.calendarLoading', 'edit.calendarFailed', 'edit.optionNotInList', 'edit.rowRemoved', 'edit.pageDropped',
] as const satisfies readonly EditorsMessageKey[];

export interface EditorsOptions {
  /** Q3 (revised by the owner, step 7): after Enter / Shift+Enter, the same cell (`'stay'`, default) or the cell below / above (`'down'`). */
  readonly enterMoves?: 'down' | 'stay';
  /** D5: Tab opens the next editable cell (`'cell'`, default) or leaves the grid (`'grid'`). */
  readonly tab?: 'cell' | 'grid';
  /** The calendar button and Alt+Down on day and instant fields (default true); false: typing only, nothing loaded. */
  readonly calendar?: boolean;
  /** Where the calendar's chunk comes from (a host serving its own chunks), as `filters({ loadDates })`. */
  readonly loadCalendar?: () => Promise<CalendarKit>;
  /** tzslot's words by language, over its own EN / FR / AR (as `filters({ dateMessages })`). */
  readonly dateMessages?: Readonly<Record<string, object>>;
  /**
   * The list editor, `listEditor` of `@dzgrid/dom/editors-list` (owner S6-O7: its own entry). Without it a list
   * column opens a text field read by its codec, and one warning `missing-feature` per column.
   */
  readonly list?: ListEditor;
  /**
   * The long-text editor, `textareaEditor` of `@dzgrid/dom/editors-textarea` (1.14.0, editors.md 18–22), for the columns
   * with `edit: { editor: 'textarea' }`. Without it they open the one-line field, and one warning `missing-feature` per column.
   */
  readonly textarea?: (x: EdEnv, field: HTMLTextAreaElement) => Ed;
  /**
   * The searching list, `searchEditor` of `@dzgrid/dom/editors-search` (1.15.0, editors.md 23–29), for the columns with
   * `edit: { search }`. Without it they open as without `search`, and one warning `missing-feature` per column.
   */
  readonly search?: SearchEditor;
  /** Full-row editing, `rowEditor` of `@dzgrid/dom/editors-row` (1.15.0, edit-row.md): every editable cell of a row at once. */
  readonly row?: RowEditor;
  /** With `row`: a rule over the whole row, checked before it is kept (edit-row.md 9). */
  readonly validateRow?: RowRule<any>;
}
/** The searching list's shape (`@dzgrid/dom/editors-search`): `keys` the texts it needs. */
export type SearchEditor = ((x: EdEnv, value: unknown, search: OptionSearch<unknown>, label: (v: unknown) => string, name: string, done: (move: boolean) => void, row: unknown) => Ed) & { readonly keys: readonly string[] };
/** The row editor's shape (`@dzgrid/dom/editors-row`): set up once per grid (it checks its own texts, `keys`). */
export type RowEditor = ((x: EdEnv) => RowPlug) & { readonly keys: readonly string[] };
/** What the row editor does for the editors (`@dzgrid/dom/editors-row`). */
export interface RowPlug {
  /** In place of a cell's editor: the row opened, or its field focused. */
  open(k: RowKey, c: string, start: Start, ch?: string): boolean;
  paint(): void;
  destroy(): void;
}
/** The list editor's shape (`@dzgrid/dom/editors-list`). */
export type ListEditor = (x: EdEnv, value: unknown, opts: readonly EnumOption[], label: (v: unknown) => string, name: string, done: (move: boolean) => void) => Ed;

/** What an open editor is, whatever its kind: what goes in the cell, what is focused, what Enter, Tab and a blur keep. */
export interface Ed {
  readonly root: HTMLElement;
  readonly focus: HTMLElement;
  /** What Enter, Tab and a blur keep (undefined: nothing). */
  input(): CellInput | undefined;
  /** The editor's own keys (Alt+Down, the list's): true when taken. */
  keys?(e: KeyboardEvent): boolean;
  /** A node outside the cell that counts as inside (its popup). */
  inside?(n: Node | null): boolean;
  /** Once in the cell and focused, with the character that opened it. */
  ready?(seed?: string): void;
  /** At each paint while open. */
  place?(): void;
  /** A refusal at keep (the list closes). */
  refused?(): void;
  drop(): void;
}
/** What the kinds' modules get from the entry. */
export interface EdEnv {
  readonly g: GridContext<unknown>;
  readonly o: EditorsOptions;
  readonly msg: (key: EditorsMessageKey, p: Readonly<Record<string, string>>) => string;
  /** None: no calendar (`@dzgrid/dom/editors-base` without `loadCalendar`). */
  readonly cal: Once<0, CalendarKit> | null;
}
export type { Kind } from './cells.js';
export type Start = SlotContext['editor']['start'];
type Via = 'enter' | 'tab' | 'escape' | 'blur' | 'lost';
/** The editor open: its cell, its column, what it is, the nodes a part owns, the server page and query it opened on. */
interface Open { readonly k: RowKey; readonly c: string; readonly col: ResolvedColumn<unknown>; readonly e: Ed; readonly own: Set<Node>; readonly at: unknown }

/** More options than this: a text field read by the codec (the searchable list is later; editors.md 16). */
const MAX = 500;

/** The editors' layout: no double-tap zoom delay on the body (pinch kept), the bubble fixed, the date box, the list's scroller; layer `dzgrid.layout`. */
export const EDITORS_CSS =
  '@layer dzgrid.layout{:where(.dzg-body){touch-action:manipulation}' +
  ':where(.dzg-bubble){position:fixed;inset:auto;margin:0;z-index:10;overflow:visible}:where(.dzg-bubble[hidden],.dzg-popup[hidden]){display:none}' +
  ':where(.dzg-datebox){display:flex;align-items:center}:where(.dzg-datebox>.dzg-field){flex:1;min-inline-size:0;align-self:stretch}' +
  ':where(.dzg-listbox){position:relative;overflow:auto;max-block-size:16em}}';

/**
 * `editors(options)`: the editors of a cell (Phase 5 steps 5–6, docs/phase-5-steps/step05-plan.md, step06-plan.md;
 * editing.md, editors.md, edit-validation.md 3–9): text and number fields; day and instant fields with a calendar
 * loaded on demand; a yes/no cell toggled in place; a list (an APG combobox with type-ahead); the application's own
 * editor (a part of slot `editor`). F2, Enter (a part first), a printable character, an input method, a double click
 * or a double tap open one; Enter, Tab, a blur keep it through the grid's edits (`edit()` of `@dzgrid/dom/edit`,
 * reached through the grid), Escape gives it up; Delete clears; a refused value keeps it open under a bubble.
 *
 * ```ts
 * import { edit } from '@dzgrid/dom/edit';
 * import { editors } from '@dzgrid/dom/editors';
 * createGrid(host, { …, messages: { ...FR, text: { ...FR.text, ...FR_EDIT.text, ...FR_EDITORS.text } }, features: [edit({ save }), editors()] });
 * ```
 */
export function editorsWith(o: EditorsOptions, load?: () => Promise<CalendarKit>): GridFeature {
  // One loader per feature object: the chunk is imported once for all its grids.
  const cal = load ? calendars(load) : null;
  return { id: 'editors', setup: (g) => setup(g, o, cal) };
}

function setup(g: GridContext<unknown>, o: EditorsOptions, cal: Once<0, CalendarKit> | null): FeatureHandle {
  const missing = [...EDITORS_KEYS, ...(o.search?.keys ?? [])].filter((key) => g.settings.messages.text[key as 'edit.refused'] === undefined);
  if (missing.length) throw new TypeError(`editors: missing ${missing.join(', ')}`);
  const { kernel, el, doc, scope } = g;
  // Without the edits nothing is taken: the grid stays as it was (one warning).
  if (!g.settings.features?.some((f) => f.id === 'edit')) {
    emit(kernel, { type: 'problems', source: 'host', problems: [problem('missing-feature', 'warning', 'features.editors', 'edit')] });
    return { destroy() {} };
  }
  const root = el.root.getRootNode() as Document | ShadowRoot;
  if (g.settings.injectStyles !== false && !root.querySelector('style[data-dzgrid-editors]')) {
    const s = doc.createElement('style');
    s.setAttribute('data-dzgrid-editors', '');
    if (g.settings.nonce) s.setAttribute('nonce', g.settings.nonce);
    s.textContent = EDITORS_CSS;
    ('head' in root ? root.head : root).append(s);
  }
  // Found when used: the edit seam is gathered once every feature is set up.
  const api = (): EditApi<unknown> => g.edit!.api as EditApi<unknown>;
  const msg = (key: EditorsMessageKey, p: Readonly<Record<string, string>>): string => g.msg(key, p);
  const env: EdEnv = { g, o, msg, cal };
  const head = (col: ResolvedColumn<unknown>): string => col.def.header ?? col.id;
  /** A server grid's page and query now (a browser's: none). */
  const at = (): unknown => g.rows.kind === 'source' && `${g.rows.page?.index}/${g.rows.page?.size}/${JSON.stringify(kernel.query)}`;
  const H = editorHost(g);
  const B = bubble(g);
  let cur: Open | null = null;
  /**
   * An editor asked for on a cell not mounted yet (reached by Tab, or by Enter's move, keys typed faster than the
   * paint): opened at the paint that mounts it, with the characters typed meanwhile; any other focus drops it.
   */
  let wait: { k: RowKey; c: string; s: Start; t: string; e?: { key: string; shiftKey: boolean } } | null = null;
  const told = new Set<string>();
  const tell = (ps: Problem[]): void => void (ps.length && emit(kernel, { type: 'problems', source: 'host', problems: ps }));
  /** Once per column and rule. */
  const once = (id: string, p: Problem): Problem[] => (told.has(id) ? [] : (told.add(id), [p]));
  /** A part that threw on a cell: not tried again until that row's data changes (the parts rule). */
  const broken = new Map<string, unknown>();
  /** When a double tap last opened something (the browser's double click after it is not a second one). */
  let tapped = -1e9;

  const stopped = (s: Open, kept: boolean, via: Via): void =>
    emit(kernel, { type: 'editingStopped', source: 'user', key: s.k, column: s.c, kept, via });
  /** The editor closed: its popups and part gone, the bubble gone, the cell focused first unless the focus went elsewhere. */
  const close = (s: Open, focus: boolean, kept: boolean, via: Via): void => {
    cur = null;
    B.hide();
    s.e.drop();
    H.shut(focus);
    stopped(s, kept, via);
  };
  /** An input through the edits: the refusal's code, or undefined when kept (or unchanged, or nothing to keep). */
  const commit = (s: Open, input: CellInput | undefined): string | undefined => (input ? api().commit([{ key: s.k, column: s.c, input }]).refused[0]?.code : undefined);
  /** A refusal said, the cell's refusal shown (`/edit`, limiter applied). */
  const refused = (k: RowKey, c: string, text: string): void => {
    api().refuse(k, c);
    api().alert(text);
  };
  /** A code's sentence: a day that does not read quotes the field's example (`{pattern}`). */
  const why = (c: string, code: string): string => (code === 'day' ? msg('validation.day', { pattern: dayText(g.ctx, today(g)) }) : api().reason(c, code));
  /** Refused while open: invalid, the bubble from the cell, the sentence (edit-validation.md 3, 5, 7). */
  const deny = (s: Open, text: string): void => {
    setAttr(s.e.focus, 'aria-invalid', 'true');
    s.e.refused?.();
    B.show(text, s.e.focus, g.editor!.cell);
    refused(s.k, s.c, msg('edit.refused', { column: head(s.col), reason: text }));
  };
  /** Enter or Tab: kept, or refused with the editor kept open. */
  const keep = (s: Open, input = s.e.input()): boolean => {
    const code = commit(s, input);
    return !code || (deny(s, why(s.c, code)), false);
  };
  /** Kept by the editor itself (a list's pick, a part's keep): closed, then down as Enter when `move`. */
  const done = (s: Open, move: boolean, input = s.e.input()): boolean => {
    if (cur !== s || !keep(s, input)) return false;
    close(s, true, true, 'enter');
    if (move && o.enterMoves === 'down') g.step!({ kind: 'move', axis: 'row', delta: 1 });
    return true;
  };

  /**
   * Kept as a blur keeps it (Q5, rule 7), then closed (`focus`: the cell focused first); refused: O1 — the text
   * dropped, the last value back, said — or, the row removed (D8, Q8: a host removal, a reload without it), said once.
   */
  const leave = (s: Open, focus: boolean, via: Via): void => {
    const code = commit(s, s.e.input());
    close(s, focus, !code, via);
    // Gone with another page or query of a server grid whose answer came at once (a synchronous source): its text
    // could not leave (review 3: said so, never « removed »; the documented limit of S7-O3).
    if (code) code === 'read-only' && !kernel.rowOf(s.k) ? api().alert(at() !== s.at ? msg('edit.pageDropped', { column: head(s.col) }) : msg('edit.rowRemoved', {})) : refused(s.k, s.c, msg('edit.refusedDropped', { column: head(s.col) }));
  };
  /** The focus in the editor, its popup or a node its part owns. */
  const within = (s: Open, a = (s.e.root.getRootNode() as Document).activeElement): boolean => s.e.root.contains(a) || !!s.e.inside?.(a) || [...s.own].some((n) => n.contains(a));
  // Its cell gone from the page (a column hidden, a filter, a parent closed: kept, D8, O9; a row removed: said).
  const lost = (): void => void (cur && leave(cur, false, 'lost'));
  /** A blur (Q5, rule 7), one task later: the focus still in the editor is none. */
  const blur = (s: Open): void => void scope.timeout(() => cur === s && !within(s) && leave(s, false, 'blur'), 0);
  // A server page or query asked while open (O9, S7-O3): kept and sent now, while the row is still held.
  const unhear = g.rows.kind === 'source' ? g.rows.subscribe((c) => void (cur && (c.kind === 'page' || c.kind === 'query') && leave(cur, within(cur), 'lost'))) : null;

  /** A yes/no cell toggled in place (editors.md 10–11, O8): `null → true → false → true`, one save, the new text said. */
  const toggle = (k: RowKey, c: string): boolean => {
    const col = g.columns.get(c)!;
    const v = col.codec.coerce(g.edit!.read(col, kernel.rowOf(k)!.data, k), g.ctx) !== true;
    const code = api().commit([{ key: k, column: c, input: { value: v } }]).refused[0]?.code;
    if (code) refused(k, c, msg('edit.refused', { column: head(col), reason: api().reason(c, code) }));
    else g.live.announce(shownOf(g, col, v));
    return true;
  };

  const open = (k: RowKey, c: string, start: Start, ch?: string): boolean => {
    if (R) return R.open(k, c, start, ch);
    const col = g.columns.get(c);
    const node = kernel.rowOf(k);
    let kd = kindOf(g, o, col);
    const id = `${k}\n${c}`;
    if (cur || !node || !kd || kd === 'boolean' || !kernel.editable(k, c) || broken.get(id) === node.data) return false;
    const w = wait;
    wait = null;
    // A failed save reopens with the refused value (O2, edit-save.md 15), else what the cell shows.
    const st = api().state(k, c);
    const v = st?.status === 'failed' ? st.refused : g.edit!.read(col!, node.data, k);
    // Not mounted yet: the key taken, the editor at the paint with what was typed meanwhile (review R1).
    if (!g.rowRenderer.cell(k, c)) return (wait = w?.k === k && w.c === c ? { ...w, t: w.t + (ch ?? '') } : { k, c, s: start, t: ch ?? textIn(g, col!, v) }), true;
    // The row header's value as its column shows it (not its cell's text: a part may draw it otherwise, review R6).
    const rh = g.columns.visible()[0]!;
    const name = msg('editors.fieldName', { column: head(col!), row: shownOf(g, rh, g.edit!.read(rh, node.data, k)) });
    let opts: readonly EnumOption[] | null = null;
    const srch = o.search && col!.def.edit?.search;
    if (col!.def.edit?.search && !o.search) tell(once(`${c}\ns`, problem('missing-feature', 'warning', `columns.${c}.edit`, '@dzgrid/dom/editors-search')));
    if (kd === 'list' && !o.list && !srch) (kd = 'text'), tell(once(`${c}\nl`, problem('missing-feature', 'warning', `columns.${c}.edit`, '@dzgrid/dom/editors-list')));
    if (kd === 'textarea' && !o.textarea) (kd = 'text'), tell(once(`${c}\nt`, problem('missing-feature', 'warning', `columns.${c}.edit`, '@dzgrid/dom/editors-textarea')));
    if (kd === 'list' && !srch) {
      const src = optionsOf(col!);
      try {
        opts = typeof src === 'function' ? (src as (r: unknown, x: unknown) => readonly EnumOption[])(node.data, g.settings.context) : (src as readonly EnumOption[]);
      } catch (err) {
        return g.report(err), false;
      }
      // Not a list (review R1): refused « invalid » (the blink, the sentence), told once per column; nothing opens.
      if (!Array.isArray(opts)) {
        tell(once(`${c}\nx`, problem('invalid-column', 'warning', `columns.${c}.edit.options`, 'not a list')));
        return refused(k, c, msg('edit.refused', { column: head(col!), reason: api().reason(c, 'invalid') })), false;
      }
      // More than 500: a text field read by the codec, told once (an enum's labels still read).
      if (opts.length > MAX) (kd = 'text'), tell(once(`${c}\no`, problem('invalid-column', 'warning', `columns.${c}.edit.options`, String(MAX))));
    }
    const own = new Set<Node>();
    // Set before any of the editor's own callbacks can run (they need the open editor).
    const s = { k, c, col: col!, own, at: at() } as Open & { e: Ed };
    let handle: EditorHandle | null = null;
    if (typeof kd === 'object') {
      const host = doc.createElement('div');
      host.className = 'dzg-editor';
      host.tabIndex = -1;
      s.e = {
        // A read() that throws: reported, nothing kept (the editor closes, the value stays; review of step 9, 5).
        root: host, focus: host, input: () => {
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
          host.replaceChildren();
        },
      };
    } else if (kd === 'list') s.e = srch ? o.search!(env, col!.codec.coerce(v, g.ctx), srch, (x) => shownOf(g, col!, x), name, (m) => void done(s, m), node.data) : o.list!(env, col!.codec.coerce(v, g.ctx), opts!, (x) => shownOf(g, col!, x), name, (m) => void done(s, m));
    else {
      const f = fieldOf(g, col!, kd, name);
      const d = kd === 'day' || kd === 'instant';
      if (!d) f.value = ch ?? textIn(g, col!, v);
      s.e = d ? dateEd(env, f, col!, v, ch, () => blur(s)) : kd === 'textarea' ? o.textarea!(env, f as never) : { root: f, focus: f, input: () => ({ text: f.value }), drop() {} };
    }
    const e = s.e;
    if (!H.open(k, c, e.root, lost)) return false;
    g.tip.hide();
    cur = s;
    e.root.addEventListener('focusout', () => blur(s));
    if (typeof kd === 'object') {
      try {
        handle = (kd as { mount(h: HTMLElement, c: SlotContext['editor']): EditorHandle }).mount(e.root, {
          ...g.partBase!, value: col!.codec.coerce(v, g.ctx), text: shownOf(g, col!, v), row: node.data, key: k, column: col!, start, ...(start === 'key' && ch && { char: ch }),
          keep: (input) => done(s, true, input),
          cancel: () => void (cur === s && close(s, true, false, 'escape')),
          refuse: (code) => void (cur === s && deny(s, api().reason(c, code))),
          own(n) {
            own.add(n);
            const out = (): void => blur(s);
            n.addEventListener('focusout', out);
            return () => void (own.delete(n), n.removeEventListener('focusout', out));
          },
        });
        // A part that gives no handle is a broken part (the parts rule).
        if (!handle) throw new TypeError('editors: the editor part gave no handle');
      } catch (err) {
        g.report(err);
        broken.set(id, node.data);
        cur = null;
        H.shut(true);
        return false;
      }
      if (!handle.focus?.()) e.focus.focus({ preventScroll: true });
    } else e.focus.focus({ preventScroll: true });
    if (e.focus instanceof HTMLInputElement) e.focus.setSelectionRange(e.focus.value.length, e.focus.value.length);
    e.ready?.(ch);
    emit(kernel, { type: 'editingStarted', source: 'user', key: k, column: c, start });
    return true;
  };

  /** Escape, Enter (Shift: up) and Tab (Shift: back) in an editor: true when taken (`tab: 'grid'` leaves Tab to the browser). */
  const end = (s: Open, key: string, back: boolean): boolean => {
    if (key === 'Escape') return close(s, true, false, 'escape'), true;
    if (key === 'Enter') {
      if (keep(s)) {
        close(s, true, true, 'enter');
        if (o.enterMoves === 'down') g.step!({ kind: 'move', axis: 'row', delta: back ? -1 : 1 });
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

  /**
   * Ctrl/Cmd+Enter (owner QB5, S12-Q5; fill.md 17): with `fill()`, the value in every cell of the block when the field's
   * cell is in it (its own refusal keeps the field open, said); otherwise kept as Enter. Never a move.
   */
  const all = (s: Open): true => {
    const r = g.bulk?.({ row: s.k, column: s.c }, s.e.input());
    if (r?.own) deny(s, why(s.c, r.own));
    else if (r || keep(s)) close(s, true, true, 'enter');
    return true;
  };

  /** The next (`d` 1) or previous (−1) cell with an editor in reading order (a yes/no cell has none): visible columns, then the displayed rows (a pinned row's: its band's, step 8b-1). */
  const next = (k: RowKey, c: string, d: 1 | -1): { k: RowKey; c: string } | null => {
    const cols = g.columns.visible().filter((x) => x.def.editable && kindOf(g, o, x) && kindOf(g, o, x) !== 'boolean').map((x) => x.id);
    const D = g.rowsOf?.(k) ?? g.rows.displayed;
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
  /** A double click or a double tap: the editor, or a yes/no toggled once. */
  const twice = (p: FocusPos & { kind: 'cell' }, s: Start): unknown =>
    kindOf(g, o, g.columns.get(p.column)) === 'boolean' && !R ? kernel.editable(p.row, p.column) && toggle(p.row, p.column) : open(p.row, p.column, s);
  scope.on(el.body, 'dblclick', (e: MouseEvent) => {
    const p = cellAt(e.target);
    if (p && g.now() - tapped > 500) twice(p, 'dblclick');
  });
  // A double tap (S5-O4): two touch ups on one cell within 400 ms and 10 px; the field focused in the handler,
  // so the soft keyboard shows. The browser's double click that may follow is not a second one.
  let tap: { p: FocusPos & { kind: 'cell' }; t: number; e: PointerEvent } | null = null;
  scope.on(el.body, 'pointerup', (e: PointerEvent) => {
    const p = cellAt(e.target);
    if (e.pointerType !== 'touch' || !p) return;
    const was = tap;
    const now = g.now();
    tap = { p, t: now, e };
    if (was && was.p.row === p.row && was.p.column === p.column && now - was.t <= 400 && pointerGap(e, was.e) <= 10) {
      tap = null;
      tapped = now;
      twice(p, 'tap');
    }
  });

  /** Full-row editing (1.15.0, edit-row.md): the row editor in place of the cell's field. */
  const R = o.row?.(env);

  return {
    keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
      const s = cur;
      const w = wait;
      const plain = !e.altKey && !e.ctrlKey && !e.metaKey;
      // The editor's own keys, then these three; a nested grid's editor is that grid's.
      // Ctrl/Cmd+Enter (QB5, fill.md 17): before the editor's own keys (a list's Enter).
      if (s) return s.e.root.contains(e.target as Node) && (caretOf(s.e.focus, e, plain) || (e.key === 'Enter' && !e.altKey && !e.shiftKey && e.ctrlKey !== e.metaKey && e.metaKey === g.mac && all(s)) || !!s.e.keys?.(e) || (plain && end(s, e.key, e.shiftKey)));
      // An editor waiting for its paint takes the keys a field would (review R1): Backspace shortens what was typed,
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
      const kd = kindOf(g, o, g.columns.get(c));
      const ok = !!kd && kernel.editable(k, c);
      // A held Space or Enter (key repeat) toggles once, and selects nothing either (review R5).
      if (e.repeat && ok && kd === 'boolean' && (e.key === ' ' || e.key === 'Enter')) return true;
      if (e.key === 'F2') return open(k, c, 'f2');
      // Space toggles an editable yes/no cell instead of selecting the row (O8).
      if (e.key === ' ') return ok && kd === 'boolean' && toggle(k, c);
      // Enter: a part that takes the focus first (editing.md 5); a cell that cannot be edited: the grid's Enter.
      if (e.key === 'Enter') return ok && (!!g.rowRenderer.partAt(k, c)?.focus?.() || (kd === 'boolean' && !R ? toggle(k, c) : open(k, c, 'enter')));
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || !kernel.editable(k, c)) return false;
      // Cleared without a field: the column's empty value, one save; a required column refuses it.
      const code = api().commit([{ key: k, column: c, input: { text: '' } }]).refused[0]?.code;
      if (code) refused(k, c, msg('edit.refused', { column: head(g.columns.get(c)!), reason: api().reason(c, code) }));
      return true;
    },
    afterRows() {
      R?.paint();
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
      if (cur) B.place(), cur.e.place?.();
      // An editor name nobody registered, a list without options: told once per column and name.
      tell(g.columns.visible().flatMap((x) => {
        const e = x.def.edit?.editor;
        if (e == null) return [];
        const id = `${x.id}\n${e}`;
        if (e === 'list') return listOf(o, x) ? [] : once(id, problem('invalid-column', 'warning', `columns.${x.id}.edit.editor`, e));
        return kindOf(g, o, x) ? [] : once(id, problem('unknown-part', 'warning', `columns.${x.id}.edit.editor`, e));
      }));
    },
    destroy() {
      unhear?.();
      R?.destroy();
      cur?.e.drop();
      cur = null;
      H.destroy();
      B.destroy();
    },
  };
}
