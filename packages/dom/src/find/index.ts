import { fold, formattersFor, isBlank, problem, type DisplayIndex, type DisplayedRows, type GridKernel, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import { emit, positions } from '@dzgrid/core/internal';
import { composing, needTexts } from '@dzgrid/dom/internal';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import type { FindMessageKey } from '../part-texts.js';
import { marker } from '../highlight/use.js';
import { injectFindStyles } from './styles.js';

/** The texts `find()` needs, from `@dzgrid/dom/locales/<lang>-find`. */
export const FIND_KEYS = 'label count said none prev next close page'.split(' ').map((k) => `find.${k}`) as readonly FindMessageKey[];

export interface FindOptions {
  /** The pause before typed text is searched (a finite number of 0 or more); default 150 ms. */
  readonly debounceMs?: number;
  /** The text tinted inside the hit cells the grid draws, the current hit's more (search-highlight.md); default true. */
  readonly highlight?: boolean;
}
/** A hit: a cell, by its row and its column. */
export interface FindHit {
  readonly row: RowKey;
  readonly column: string;
}
export interface FindState {
  readonly open: boolean;
  /** The text searched (trimmed); empty: none. */
  readonly text: string;
  readonly count: number;
  /** The current hit's place among them, from 0; -1: none. */
  readonly index: number;
  readonly current: FindHit | null;
}
/** A grid's find bar, for the application (its own button, a test). */
export interface FindApi {
  /** Opens the bar, the focus in its field; `text`: searched at once (else the last text, searched again). */
  open(text?: string): boolean;
  /** Closes it: the marks cleared, the focus back on the grid's focused cell. */
  close(): void;
  /** To the next hit (wrapping), as Enter; false without hits. */
  next(): boolean;
  /** To the previous hit (wrapping), as Shift+Enter; false without hits. */
  previous(): boolean;
  state(): FindState;
}
export interface FindFeature extends GridFeature {
  /** The find bar of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<any, any> }): FindApi | null;
}

type Hit = FindHit & { readonly i: number; readonly j: number };
const ATTR = 'data-dzg-find';

/**
 * `find(options)`: find in the grid (docs/behaviors/find.md; owner answers 2026-11-03). Ctrl+F (⌘F on a Mac) while the
 * focus is in the grid opens a bar above the headers: the displayed text of the visible columns searched, case and
 * accents ignored, rows never hidden; a closed tree node's rows too (opened to show a hit); every hit marked, the current
 * one more, scrolled to and focused as the grid's cell; « 3 / 12 », ↑ ↓, Enter / Shift+Enter, Escape; said politely
 * once the typing settles. A server's grid: the loaded page only, said in the bar. Without it, Ctrl+F is the browser's.
 *
 * ```ts
 * import { find } from '@dzgrid/dom/find';
 * import { FR_FIND } from '@dzgrid/dom/locales/fr-find';
 * import '@dzgrid/theme/find.css';
 * createGrid(host, { messages: { ...FR, text: { ...FR.text, ...FR_FIND.text } }, features: [find()], … });
 * ```
 */
export function find(o: FindOptions = {}): FindFeature {
  const apis = new WeakMap<object, FindApi>();
  return { id: 'find', api: (grid) => apis.get(grid.kernel) ?? null, setup: (g) => setup(g, o, apis) };
}

function setup(g: GridContext<unknown>, o: FindOptions, apis: WeakMap<object, FindApi>): FeatureHandle {
  needTexts(g, FIND_KEYS, 'find');
  const { kernel: k, doc, el, scope } = g;
  const ms = o.debounceMs;
  const wait = ms === undefined || (Number.isFinite(ms) && ms >= 0) ? (ms ?? 150) : (emit(k, { type: 'problems', source: 'host', problems: [problem('invalid-setting', 'warning', 'find.debounceMs')] }), 150);
  const target = el.root.getRootNode();
  if (g.settings.injectStyles !== false) injectFindStyles(target.nodeType === 11 ? (target as ShadowRoot) : doc, g.settings.nonce);

  // ---- The bar: a search landmark above the headers, outside role=grid (find.md 3) ----
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] => {
    const x = doc.createElement(tag);
    if (cls) x.className = cls;
    return x;
  };
  const bar = make('div', 'dzg-find');
  bar.setAttribute('role', 'search');
  bar.hidden = true;
  const input = make('input');
  input.type = 'text';
  for (const [a, v] of [['dir', 'auto'], ['autocomplete', 'off'], ['spellcheck', 'false'], ['enterkeyhint', 'search']]) input.setAttribute(a!, v!);
  const count = make('span', 'dzg-find-count');
  const note = make('span', 'dzg-find-note');
  const button = (name: string, glyph: string): HTMLButtonElement => {
    const b = make('button');
    b.type = 'button';
    b.dataset['find'] = name;
    b.textContent = glyph;
    return b;
  };
  const prev = button('prev', '↑');
  const next = button('next', '↓');
  const shut = button('close', '×');
  bar.append(input, count, note, prev, next, shut);
  // The text inside the hits (search-highlight.md 4, 5): over the quick search's, the current hit's over both.
  const tint = o.highlight !== false ? marker(g, true) : null;
  el.root.insertBefore(bar, el.viewport);

  let open = false;
  let text = '';
  let hits: Hit[] = [];
  let cur = -1;
  /** What the hits were found from: the rows, the edits, the language, the text, the columns. */
  let seen: readonly unknown[] = [];
  /** The folded texts of the searched rows (one string a row), for `hay[0]` (the rows, the edits, the language, the columns). */
  let hay: [readonly unknown[], string[], number[]] = [[], [], []];
  let byRow = new Map<RowKey, Map<string, boolean>>();
  let pending: (() => void) | null = null;
  let typing = false;

  /** The rows searched: a tree's all open (its closed nodes' rows too, find.md 6); a server's page; else the rows shown. */
  const rowsOf = (): DisplayedRows<unknown> => {
    const d = g.rows.displayed;
    return (g.rows.kind !== 'source' && d.parentOf && g.rows.allRows) || d;
  };
  /** A cell's text as it shows it (through the edits): its codec's display, blank for a blank or unreadable value. */
  const textOf = (col: ResolvedColumn<unknown>, row: object, key: RowKey): string => {
    try {
      const raw = g.edit ? g.edit.read(col, row, key) : col.read(row);
      const v = isBlank(raw) ? null : col.codec.coerce(raw, g.ctx);
      return v === null ? '' : col.codec.format(v, g.ctx);
    } catch {
      return '';
    }
  };
  /** Finds the hits again when what they come from changed; the current one kept when it still is one (`fresh`: from the focus). */
  const search = (fresh = false): void => {
    const R = rowsOf();
    const vis = g.columns.visible();
    const base = [R, R.version, k.reader.version, g.ctx, ...vis];
    const now = [text, ...base];
    if (!fresh && now.length === seen.length && now.every((v, i) => Object.is(v, seen[i]))) return;
    seen = now;
    const was = hits[cur];
    hits = [];
    if (text) {
      if (base.length !== hay[0].length || !base.every((v, i) => Object.is(v, hay[0][i]))) {
        // One string per row, its cells joined by U+0000 (never in a typed text): few objects for a big grid.
        const h: string[] = [];
        const ix: number[] = [];
        // A block list: its rows held only (infinite-scroll.md).
        for (const i of positions(R)) {
          const n = R.nodeAt(i);
          ix.push(i);
          h.push(n.kind === 'data' ? vis.map((c) => fold(textOf(c, n.data as object, n.key))).join('\0') : '');
        }
        hay = [base, h, ix];
      }
      const q = fold(text);
      const [, h, ix] = hay;
      for (let x = 0; x < h.length; x++) {
        const s = h[x]!;
        const i = ix[x]!;
        // Each cell holding the text once, in column order: the cell of `at` found by its separators.
        for (let at = s.indexOf(q), j = 0, p = 0; at >= 0; ) {
          let e = s.indexOf('\0', p);
          while (e >= 0 && e < at) (j++, (p = e + 1), (e = s.indexOf('\0', p)));
          hits.push({ row: R.keyAt(i as DisplayIndex), column: vis[j]!.id, i, j });
          if (e < 0) break;
          (p = e + 1), j++, (at = s.indexOf(q, p));
        }
      }
    }
    if (fresh) {
      // The first hit at or after the grid's focused cell (find.md 10).
      const f = k.focus;
      const fi = f?.kind === 'cell' ? R.indexOf(f.row) : -1;
      const fj = f?.kind === 'cell' ? vis.findIndex((c) => c.id === f.column) : 0;
      const at = fi < 0 ? 0 : hits.findIndex((h) => h.i > fi || (h.i === fi && h.j >= fj));
      cur = hits.length ? Math.max(0, at) : -1;
    } else {
      const same = was ? hits.findIndex((h) => h.row === was.row && h.column === was.column) : -1;
      cur = same >= 0 ? same : hits.length ? Math.min(Math.max(cur, 0), hits.length - 1) : -1;
    }
    byRow = new Map();
    hits.forEach((h, x) => {
      let m = byRow.get(h.row);
      if (!m) byRow.set(h.row, (m = new Map()));
      m.set(h.column, x === cur);
    });
  };
  const num = (n: number): string => formattersFor(g.ctx).number({ maximumFractionDigits: 0 })(n);
  const say = (): void => g.live.announce(hits.length ? g.msg('find.said', { i: num(cur + 1), n: num(hits.length) }) : g.msg('find.none'));
  /** The bar's texts and the marks on the mounted cells (`data-dzg-find`, `current` for the current hit). */
  const paint = (): void => {
    bar.setAttribute('aria-label', g.msg('find.label'));
    input.setAttribute('aria-label', g.msg('find.label'));
    prev.setAttribute('aria-label', g.msg('find.prev'));
    next.setAttribute('aria-label', g.msg('find.next'));
    shut.setAttribute('aria-label', g.msg('find.close'));
    count.textContent = hits.length ? g.msg('find.count', { i: num(cur + 1), n: num(hits.length) }) : text ? g.msg('find.none') : '';
    note.hidden = g.rows.kind !== 'source';
    note.textContent = note.hidden ? '' : g.msg('find.page');
    // The letters, inside the hit cells the grid draws (the lazy chunk).
    tint?.(hits.length ? [text, byRow] : null);
    // No hit: every mark gone, a pooled row's too (re-mounted later, it would keep it).
    if (!hits.length) return el.root.querySelectorAll(`[${ATTR}]`).forEach((c) => c.removeAttribute(ATTR));
    g.rowRenderer.forEach((key, v) => {
      const m = byRow.get(key);
      for (const [id, c] of v.cells) {
        const x = m?.get(id);
        const want = x === undefined ? null : x ? 'current' : '';
        if (c.el.getAttribute(ATTR) !== want) want === null ? c.el.removeAttribute(ATTR) : c.el.setAttribute(ATTR, want);
      }
    });
  };
  /** To hit `x`: its closed ancestors opened (find.md 6), the grid's focused cell, scrolled into view (find.md 9). */
  const go = (x: number, tell: boolean): boolean => {
    const h = hits[x];
    if (!h) return false;
    cur = x;
    for (const m of byRow.values()) for (const c of m.keys()) m.set(c, false);
    byRow.get(h.row)?.set(h.column, true);
    const R = rowsOf();
    if (R !== g.rows.displayed && g.rows.displayed.indexOf(h.row) < 0) {
      const up: RowKey[] = [];
      for (let p = R.parentOf!(h.row); p !== null; p = R.parentOf!(p)) if (!g.rows.isExpanded?.(p)) up.unshift(p);
      if (up.length) k.dispatch({ type: 'rows.expand', rows: up, expanded: true }, 'api');
      // Opening shows rows: the rows searched are the same ones (all open), the hits and the texts unchanged.
      const S = rowsOf();
      const re = (a: readonly unknown[], at: number): unknown[] => a.map((v, y) => (y === at ? S : y === at + 1 ? S.version : v));
      seen = re(seen, 1);
      hay = [re(hay[0], 0), hay[1], hay[2]];
    }
    k.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: h.row, column: h.column } }, 'api');
    g.ensureVisible(h.row, h.column);
    paint();
    g.schedule();
    if (tell) say();
    return true;
  };
  /** The typed text searched now: from the focus, the first hit gone to, said. */
  const apply = (): void => {
    pending?.();
    pending = null;
    text = input.value.trim();
    // What a cell part is told (`search.find`), at the next paint.
    g.findText = text;
    g.schedule();
    search(true);
    if (!(cur >= 0 && go(cur, false))) paint();
    if (text) say();
  };
  const step = (by: 1 | -1): boolean => {
    if (pending) return apply(), hits.length > 0;
    const n = hits.length;
    return n > 0 && go((cur + by + n) % n, true);
  };

  const api: FindApi = {
    open(t) {
      if (t !== undefined) input.value = t;
      open = true;
      bar.hidden = false;
      input.focus();
      input.select();
      apply();
      return true;
    },
    close() {
      if (!open) return;
      pending?.();
      pending = null;
      open = false;
      bar.hidden = true;
      hits = [];
      cur = -1;
      seen = [];
      byRow = new Map();
      g.findText = '';
      paint();
      g.schedule();
      g.restoreFocus();
    },
    next: () => step(1),
    previous: () => step(-1),
    state: () => ({ open, text: open ? text : '', count: hits.length, index: cur, current: hits[cur] ? { row: hits[cur]!.row, column: hits[cur]!.column } : null }),
  };
  apis.set(k, api);

  // ---- Keys: Ctrl/Cmd+F inside the grid (find.md 2); the bar's own (find.md 9, 12) ----
  scope.on(el.root, 'keydown', (e: KeyboardEvent) => {
    // A nested grid's bar took it first; an editor keeps it (the browser's).
    if (e.defaultPrevented || e.altKey || e.shiftKey || (g.mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'f' || g.editor) return;
    e.preventDefault();
    if (open) input.focus(), input.select();
    else api.open();
  });
  /** Typed: searched after the pause (find.md 10); nothing inside an input method, its text once it ends. */
  const later = (): void => {
    pending?.();
    pending = null;
    if (wait) pending = scope.timeout(apply, wait);
    else apply();
  };
  scope.on(input, 'input', (e) => void ((e as InputEvent).isComposing || typing || later()));
  scope.on(input, 'compositionstart', () => void (typing = true));
  scope.on(input, 'compositionend', () => ((typing = false), later()));
  scope.on(bar, 'keydown', (e: KeyboardEvent) => {
    if (composing(e)) return;
    if (e.key === 'Escape') e.preventDefault(), e.stopPropagation(), api.close();
    else if (e.key === 'Enter' && e.target === input) e.preventDefault(), step(e.shiftKey ? -1 : 1);
  });
  scope.on(prev, 'click', () => void step(-1));
  scope.on(next, 'click', () => void step(1));
  scope.on(shut, 'click', () => api.close());

  return {
    afterRows() {
      if (!open && !el.root.querySelector(`[${ATTR}]`)) return;
      if (open) search();
      paint();
    },
    destroy() {
      pending?.();
      delete g.findText;
      hits = [];
      byRow = new Map();
      paint();
      bar.remove();
      apis.delete(k);
    },
  };
}
