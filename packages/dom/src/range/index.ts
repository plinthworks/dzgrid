import { intentFor, type CellAddr, type CellRange, type DisplayedRows, type FocusPos, type GridKernel, type KeyOwner, type Problem, type ResolvedColumn, type RowKey } from '@dzgrid/core';
import { emit, isCellKey } from '@dzgrid/core/internal';
import { boxRows, boxSize, copyMatrix, decodeTsv, encodeTsv, PASTE_MAX, planPaste, rangeBox, type PlannedCell, type RangeBox } from '@dzgrid/core/range';
import type { EditApi } from '../edit/index.js';
import type { FeatureHandle, GridFeature } from '../features.js';
import { ownerOf } from '../keys/owner.js';
import type { RangeMessageKey } from '../part-texts.js';
import type { Frame, RowView } from '../render/rows.js';
import { setAttr } from '../render/write.js';
import { tableOf } from './clip.js';
import { pointer, same, type Sel } from './pointer.js';

/** The texts `range()` needs, from `@dzgrid/dom/locales/<lang>-range`. */
export const RANGE_KEYS = [
  'range.rows', 'range.cols', 'range.size', 'range.cleared', 'range.reordered',
  'range.copied', 'range.cut', 'range.pasted', 'range.erased', 'range.refused', 'range.readOnly', 'range.tooLong', 'range.outside', 'range.tooBig', 'range.noCopy',
] as const satisfies readonly RangeMessageKey[];

export interface RangeOptions {
  /** A press and a drag of the mouse or a pen makes a block (range-selection.md 8); false: the keys, Shift+click and the API only. Default true. */
  readonly drag?: boolean;
  /** May refuse a copy or a cut (health data): column ids and counts, never values; false or a throw refuses (clipboard.md 9). */
  readonly canCopy?: (c: CopyAsk) => boolean;
  /** The formula guard on copy (owner QB3); default true. */
  readonly guard?: boolean;
  /** Numbers copied with a point whatever the locale (QB9); default false. */
  readonly raw?: boolean;
  /** Over this many cells a paste writes nothing (owner QB4); default 100 000. */
  readonly maxPaste?: number;
  /**
   * A press outside the grid clears the block, said (owner S12-Q13); not inside an element marked
   * `data-dzg-keep-range`, nor on the page's scrollbar. false: kept (Escape clears it). Default true.
   */
  readonly clearOnOutside?: boolean;
}

/** What `canCopy` is asked: the block's column ids, its data rows and cells, a cut or a copy. */
export interface CopyAsk {
  readonly columns: readonly string[];
  readonly rows: number;
  readonly cells: number;
  readonly cut: boolean;
}
/** What a copy writes: the TSV and the HTML table. */
export interface ClipboardText {
  readonly text: string;
  readonly html: string;
}
/** What a paste, a cut or an erase did, as said: `pasted` the cells written (or cleared). */
export interface PasteCounts {
  readonly pasted: number;
  readonly refused: number;
  readonly readOnly: number;
  readonly tooLong: number;
  readonly outside: number;
  readonly tooBig: boolean;
}

/** A grid's block of cells, for the application. */
export interface RangeApi {
  /** The block (two cells at least), else null: corners by keys, never positions. */
  get(): CellRange | null;
  /**
   * Sets it (source `api`: not said, the focus untouched — `api.ensureVisible` brings it into view); false, nothing
   * changed, when a corner's row is not shown or its column not visible (a `problems` event, never a throw); one
   * cell or null clears.
   */
  set(r: CellRange | null): boolean;
  clear(): void;
  /** The block's box for the rows shown now (as `rangeBox` of `@dzgrid/core/range`), null without a block. */
  box(): RangeBox | null;
  /** As Ctrl+C on the block, else the focused data cell (a header row by the API only); null: nothing to copy, or `canCopy` refused. Never the system clipboard. */
  copy(o?: { readonly headers?: boolean }): ClipboardText | null;
  /** As Ctrl+X: the copy, then the cells cleared (one save, origin `cut`); null as `copy`. */
  cut(): ClipboardText | null;
  /**
   * As Ctrl+V with this text (TSV; `html` read only when `text` is empty); null: nowhere to paste, or HTML being read
   * (its reader is a chunk loaded on demand: the paste lands once it is there, said as the keys').
   */
  paste(text: string, html?: string): PasteCounts | null;
  /** As Delete on the block (one save, origin `edit`); null: no block. */
  erase(): PasteCounts | null;
}

export interface RangeFeature extends GridFeature {
  /** The block of a grid this feature is set up on; null before its setup and after it is destroyed. */
  api(grid: { readonly kernel: GridKernel<any, any> }): RangeApi | null;
}

const CLASSES = ['dzg-cell--range', 'dzg-cell--rs', 'dzg-cell--re', 'dzg-cell--rt', 'dzg-cell--rb'];

/** The pasted-HTML reader's chunk (owner S11b-Q5): asked once, asked again after a failed load. */
let reader: Promise<typeof import('./html/index.js')> | null = null;
/**
 * The page's own copy (clipboard.md 22, L7), page-wide: the TSV a grid of the page last wrote, its values shown, each
 * column's kind (its type; an enum's own column: its options are its own), the grid. Replaced by the next copy, dropped at the destroy
 * of the grid that wrote it; never sent anywhere.
 */
let memo: { readonly text: string; readonly values: readonly (readonly unknown[])[]; readonly kinds: readonly unknown[]; readonly owner: object } | null = null;
type Counts = { -readonly [K in keyof PasteCounts]: PasteCounts[K] };


/**
 * `range(options)`: blocks of cells (docs/behaviors/range-selection.md; owner QB1, QB2, QB7, S11-Q1…Q4). Shift with the
 * grid's own moves (mirrored right to left), Ctrl+A (every cell shown), Shift+Space (the row), the pointer (a drag,
 * Shift+click, the auto-scroll); the tint and its logical edges on the mounted cells at each paint, aria-selected on
 * the block's data cells only; the size said after a pause; the block dropped, said once, when the order or the rows
 * shown change. One feature object may serve several grids, each its own block.
 *
 * ```ts
 * import { range } from '@dzgrid/dom/range';
 * import { FR_RANGE } from '@dzgrid/dom/locales/fr-range';
 * import '@dzgrid/theme/range.css';
 * const blocks = range();
 * const grid = createGrid(host, { …, messages: { ...FR, text: { ...FR.text, ...FR_RANGE.text } }, features: [blocks] });
 * grid.kernel.subscribe((e) => e.type === 'rangeChanged' && console.log(blocks.api(grid)!.box()));
 * ```
 */
export function range(o: RangeOptions = {}): RangeFeature {
  const apis = new WeakMap<object, RangeApi>();
  return {
    id: 'range',
    api: (grid) => apis.get(grid.kernel) ?? null,
    setup(g) {
      const missing = RANGE_KEYS.filter((key) => g.settings.messages.text[key] === undefined);
      if (missing.length) throw new TypeError(`range: missing ${missing.join(', ')}`);
      const { kernel, rows, columns } = g;
      g.multi = true;
      let hush = (): void => {};
      /** One sentence in the grid's polite region. */
      const speak = (key: RangeMessageKey | 'announce.error', p?: Readonly<Record<string, string | number>>): void => g.live.announce(g.msg(key, p));
      /** A problem told (never thrown); false for the API's refusals. */
      const tell = (code: Problem['code'], path: string, detail: string, severity: Problem['severity'] = 'error'): false => (emit(kernel, { type: 'problems', source: 'api', problems: [{ code, severity, path, detail }] }), false);
      /** The visible columns' ids, in reading order. */
      const ids = (): string[] => columns.visible().map((c) => c.id);
      /** Which columns sit where: a change drops the block (hidden, moved, pinned); a width does not. */
      const shape = (): string => {
        const L = columns.layout;
        return [L.start, L.center, L.end].map((x) => x.columns.map((c) => c.id)).join('|');
      };
      let shown = shape();
      /** The rows a block lives in: its anchor's pinned band (step 8b-2, O8: a block never crosses its edge), else the body's. */
      const D = (x: CellRange | null): DisplayedRows<unknown> => (x && g.rowsOf?.(x.anchor.row)) || rows.displayed;
      const boxOf = (x: CellRange | null): RangeBox | null => (x ? rangeBox(x, D(x), ids()) : null);
      /** « 3 rows, 2 columns selected »: data rows only (details, fillers, loading rows count for nothing). */
      const size = (): void => {
        const b = boxOf(s.r);
        if (!b) return;
        const z = boxSize(b, D(s.r));
        g.live.announce(g.msg('range.size', { rows: g.msg('range.rows', { n: z.rows }), cols: g.msg('range.cols', { n: z.cols }) }));
      };
      let own = false;
      const s: Sel & { r: CellRange | null; drop(source: 'user' | 'data' | 'api', key?: RangeMessageKey): void } = {
        r: null,
        follows: false,
        set(next, source, say = source === 'user') {
          // One cell is none; nor two corners across a band's edge (a Shift+click from a pinned cell onto the body, O8).
          if (next && (same(next.anchor, next.focus) || !boxOf(next))) next = null;
          const r = s.r;
          if (next === r || (next && r && same(next.anchor, r.anchor) && same(next.focus, r.focus))) return;
          s.r = next;
          hush();
          if (say) s.say();
          emit(kernel, { type: 'rangeChanged', source, range: next });
          g.schedule();
        },
        say() {
          hush();
          if (s.r) hush = g.scope.timeout(size, 400);
        },
        drop(source, key: RangeMessageKey = 'range.cleared') {
          if (!s.r) return;
          s.set(null, source);
          if (source !== 'api') speak(key);
        },
        focusTo(a) {
          own = true;
          try {
            if (kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: a.row, column: a.column } }, 'user').ok) g.restoreFocus();
          } finally {
            own = false;
          }
        },
      };
      const drag = pointer(g, s, o.drag !== false);
      // A press outside this grid's root (its popups are in it; the path crosses shadow roots), not on the page's
      // scrollbar (the document element) nor in a `data-dzg-keep-range` element, clears the block (S12-Q13).
      // In a shadow root (closed: the document's path stops at its host), that root decides for the presses inside it.
      const sr = g.el.root.getRootNode() as ShadowRoot;
      const host = sr.host;
      const out = (top: boolean) => (e: Event) => void (s.r && e.target !== g.doc.documentElement && !e.composedPath().some((x) => x === g.el.root || (top && x === host) || (x as Element).hasAttribute?.('data-dzg-keep-range')) && s.drop('user'));
      if (o.clearOnOutside !== false) {
        g.scope.on(g.doc, 'pointerdown', out(true), { capture: true });
        if (host) g.scope.on(sr, 'pointerdown', out(false), { capture: true });
      }

      const off = kernel.subscribe((e) => {
        if (e.type === 'columnsChanged') {
          const now = shape();
          if (now !== shown) (shown = now), s.drop('data');
        }
        if (!s.r) return;
        // The model is told before the sort, filter or search event (the rows first): its `query` change is theirs.
        if (e.type === 'focusChanged' && !own && e.source !== 'data') s.drop('user');
        else if (e.type === 'sortChanged' || e.type === 'filterChanged' || e.type === 'quickChanged' || (e.type === 'modelUpdated' && (e.kind === 'order' || e.kind === 'query'))) s.drop('data', 'range.reordered');
        else if (e.type === 'pageChanged' || ((e.type === 'modelUpdated' || e.type === 'pinnedChanged') && !boxOf(s.r))) s.drop('data');
      });

      /** The first cell, where the keys start from with nothing focused (the router's own rule). */
      const first = (): CellAddr | null => {
        const d = rows.displayed;
        const c = ids()[0];
        return d.count && c ? { row: d.keyAt(d.index(0)!), column: c } : null;
      };
      /** Every cell shown (Ctrl+A), or one row's (Shift+Space); the focus stays where it is (owner S11-Q2). */
      const all = (row?: RowKey): void => {
        const d = rows.displayed;
        const c = ids();
        if (!d.count || !c.length) return;
        s.set({ anchor: { row: row ?? d.keyAt(d.index(0)!), column: c[0]! }, focus: { row: row ?? d.keyAt(d.index(d.count - 1)!), column: c[c.length - 1]! } }, 'user');
        s.follows = false;
      };

      let decorated = new Set<HTMLElement>();
      /** The tint and the edges on the mounted cells (the tree's pinned copies too: classes only, S11-Q3); the cells no longer in the block undone. */
      const paint = (f: Frame<unknown>): void => {
        const b = boxOf(s.r);
        if (!b && !decorated.size) return;
        const now = new Set<HTMLElement>();
        const ed = g.editor?.cell;
        if (b) {
          const d = D(s.r);
          // The edges go on the first and last data rows: a detail at the box's top or bottom draws none.
          let top = b.top;
          let bottom = b.bottom;
          while (top < bottom && !isCellKey(d.keyAt(d.index(top)!))) top++;
          while (bottom > top && !isCellKey(d.keyAt(d.index(bottom)!))) bottom--;
          const at = new Map(ids().map((id, i) => [id, i]));
          const each = (m: ReadonlyMap<RowKey, RowView>, read: boolean): void => {
            for (const [key, v] of m) {
              const i = d.indexOf(key);
              if (i < top || i > bottom || !isCellKey(key)) continue;
              for (const [id, cv] of v.cells) {
                const ci = at.get(id) ?? -1;
                const x = cv.el;
                // The editor's cell keeps what it shows (retained-row contract 5).
                if (ci < b.start || ci > b.end || x === ed) continue;
                now.add(x);
                [true, ci === b.start, ci === b.end, i === top, i === bottom].forEach((on, k) => x.classList.toggle(CLASSES[k]!, on));
                setAttr(x, 'aria-selected', read ? 'true' : null);
              }
            }
          };
          each(g.rowRenderer.mounted, true);
          // The spawned renderers: the tree's copies (classes only), and a band's rows — said selected when the block is there.
          for (const r of g.rowRenderer.spawned) each(r.mounted, d !== rows.displayed);
        }
        // The editor's cell keeps its classes while it edits; with no block it is no longer said selected (review 7).
        if (ed && decorated.has(ed)) now.add(ed), b || ed.removeAttribute('aria-selected');
        for (const x of decorated) if (!now.has(x)) x.classList.remove(...CLASSES), x.removeAttribute('aria-selected');
        decorated = now;
      };
      // Painted after every other feature (a tree draws its pinned copies in its own `afterRows`): a handle of its own,
      // put last at the first paint; the keys keep the feature's place.
      const tail: FeatureHandle = { afterRows: paint, destroy() {} };

      // ---- The clipboard (step 11b, clipboard.md; step11b-plan.md L1–L12) ----
      const cap = typeof o.maxPaste === 'number' && o.maxPaste > 0 ? o.maxPaste : PASTE_MAX;
      if (o.maxPaste !== undefined && cap !== o.maxPaste) tell('invalid-setting', 'range.maxPaste', String(o.maxPaste), 'warning');
      /** Where a copy reads and a paste writes (L2): the block, else the focused cell when it is a data row's and its column visible. */
      const where = (): CellRange | null => {
        const f = kernel.focus;
        return s.r ?? (f?.kind === 'cell' && isCellKey(f.row) ? { anchor: f, focus: f } : null);
      };
      const target = (): RangeBox | null => boxOf(where());
      /** The editors' cap (S5-O5): a whole number ≥ 1; 0 or Infinity none; anything else 1 000. */
      const capOf = (id: string): number => {
        const m = (columns.get(id)?.def.edit as { maxLength?: number } | undefined)?.maxLength;
        return m === 0 || m === Infinity ? Infinity : Number.isInteger(m) && m! > 0 ? m! : 1000;
      };
      /** A box's data cells, cleared (a cut, Delete); `d` its rows. */
      const clears = (b: RangeBox, d: DisplayedRows<unknown>): PlannedCell[] => {
        const cols = ids().slice(b.start, b.end + 1);
        return boxRows(b, d).flatMap((n) => cols.map((column) => ({ key: n.key, column, input: { text: '' } })));
      };
      let q = '';
      const zero = (): Counts => ({ pasted: 0, refused: 0, readOnly: 0, tooLong: 0, outside: 0, tooBig: false });
      /** A column's kind for the memo: its type; an enum, the column itself (its options are its own: this grid, this column). */
      const kind = (c: ResolvedColumn<unknown>): unknown => (c.type === 'enum' ? c : c.type);
      /** Pastes so far: an HTML paste overtaken by a later one is dropped when its reader comes (review 4); NaN once destroyed. */
      let seq = 0;
      /**
       * One gesture (clipboard.md 18, 23, 24): the cells over their cap set aside, the rest given to the edits as ONE
       * commit; read-only refusals counted, the others counted and blinked when mounted; without `edit()` all read-only.
       * The sentence is said from a microtask queued after the commit's own (« Saving »), joined with it (L11).
       */
      const write = (cells: readonly PlannedCell[], origin: 'paste' | 'cut' | 'edit', source: 'user' | 'api', main: RangeMessageKey, c: Counts): PasteCounts => {
        const ed = g.edit?.api as EditApi<unknown> | undefined;
        const rest = cells.filter((x) => {
          const v = 'text' in x.input ? x.input.text : x.input.value;
          return !(typeof v === 'string' && v.length > capOf(x.column) && ++c.tooLong);
        });
        g.live.said = '';
        if (!ed) c.readOnly += rest.length;
        else for (const r of ed.commit(rest, { origin, source }).refused) r.code === 'read-only' ? c.readOnly++ : (c.refused++, g.rowRenderer.cell(r.key, r.column) && ed.refuse(r.key, r.column));
        c.pasted = cells.length - c.tooLong - c.readOnly - c.refused;
        // Two gestures in one task (the API called twice): both said, in order, then the saving sentence once — by the
        // microtask of the last one, queued after every commit's own.
        const mine = (q = (q && `${q}. `) + [g.msg(main, { n: c.pasted }), ...(['refused', 'readOnly', 'tooLong', 'outside'] as const).filter((k) => c[k]).map((k) => g.msg(`range.${k}`, { n: c[k] }))].join(''));
        queueMicrotask(() => {
          const x = g.live.said;
          q === mine && ((q = ''), g.live.announce(x ? `${mine}. ${x}` : mine));
        });
        return c;
      };
      /** A copy or a cut of the target (L4): `canCopy` asked, the values read before any clear, the memo, the event, the sentence. */
      const copy = (cut: boolean, source: 'user' | 'api', headers?: boolean): ClipboardText | null => {
        const b = target();
        if (!b) return null;
        const d = D(where());
        const vis = columns.visible();
        const cols = vis.slice(b.start, b.end + 1);
        const z = boxSize(b, d);
        let ok: unknown = 0;
        try {
          ok = !o.canCopy || o.canCopy({ columns: cols.map((c) => c.id), rows: z.rows, cells: z.cells, cut });
        } catch {}
        if (!ok) return speak('range.noCopy'), null;
        const m = copyMatrix(b, d, vis, { ctx: g.ctx, reader: kernel.reader, guard: o.guard !== false, raw: !!o.raw, headers: !!headers });
        const r = { text: encodeTsv(m.text), html: tableOf(m.text, g.dir, !!headers) };
        if (!headers) memo = { text: r.text, values: m.values, kinds: cols.map(kind), owner: kernel };
        emit(kernel, { type: 'rangeCopied', source, rows: z.rows, columns: cols.length, cells: z.cells, cut });
        if (cut) write(clears(b, d), 'cut', source, 'range.cut', zero());
        else speak('range.copied', { n: z.cells });
        return r;
      };
      /**
       * A paste (L6): the TSV, else the first table of the HTML. The HTML, and a plain text over 64 K characters, are read
       * by the chunk loaded on demand (S11b-Q5, review 3): null at once, written when it is there at the corners of the
       * paste's moment (none shown any more, or a later paste made: nothing); a failed load refuses it, said. Then the
       * plan, the memo's values where the column is of the copied one's kind, the block after.
       */
      const paste = (text: string, html: string, source: 'user' | 'api'): PasteCounts | null => {
        const at = where();
        const b = boxOf(at);
        if (!b) return null;
        const my = ++seq;
        // HTML only, or a plain text over 64 K characters (review 3: counted there before it is decoded): read by the chunk.
        if (text ? text.length <= 1 << 16 : !html) return put(b, text ? decodeTsv(text) : null, text, source, D(at));
        const win = g.win!;
        (reader ??= import('./html/index.js')).then(
          (m) => {
            const now = my === seq && boxOf(at);
            if (now) put(now, text ? m.tsv(text, cap) : m.readTable(html, win, cap), text, source, D(at));
          },
          () => void ((reader = null), my === seq && speak('announce.error')),
        );
        return null;
      };
      /** `d`: the rows the target lives in (a band's: a paste past its last row is counted outside, pinned-rows.md 17). */
      const put = (b: RangeBox, src: string[][] | false | null, text: string, source: 'user' | 'api', d: DisplayedRows<unknown>): PasteCounts => {
        const c = zero();
        if (src === null) return c;
        const p = src && planPaste(src.map((r) => r.map((t) => ({ text: t }))), b, d, columns.visible(), { max: cap });
        if (!p || p.tooBig) return (c.tooBig = true), speak('range.tooBig', { max: cap }), c;
        c.outside = p.outside;
        const mine = memo?.text === text ? memo : null;
        const wide = p.box ? p.box.end - p.box.start + 1 : 1;
        const w = mine?.kinds.length ?? 1;
        write(mine ? p.cells.map((x, i) => {
          const j = (i % wide) % w;
          return mine.kinds[j] === kind(columns.get(x.column)!) ? { ...x, input: { value: mine.values[((i / wide) | 0) % mine.values.length]![j] } } : x;
        }) : p.cells, 'paste', source, 'range.pasted', c);
        // The block written (clipboard.md 21): its first and last planned cells, row then column order.
        const a = p.cells[0];
        const z = p.cells.at(-1)!;
        if (a) s.set({ anchor: { row: a.key, column: a.column }, focus: { row: z.key, column: z.column } }, source, false), (s.follows = false);
        return c;
      };
      const erase = (source: 'user' | 'api'): PasteCounts | null => {
        const b = boxOf(s.r);
        return b && write(clears(b, D(s.r)), 'edit', source, 'range.erased', zero());
      };
      /**
       * Ours (L1): not prevented by the host; the focus — followed into shadow roots (review 1) — in this grid's own root,
       * on a cell or a header; a target; a copy with no block leaves to the browser a text selection made INSIDE the grid
       * (review 5: a paragraph selected elsewhere, then Tab to a cell, copies the cell).
       */
      const ours = (e: Event): boolean => {
        let a = g.doc.activeElement;
        while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
        const w = a?.closest('.dzg') === g.el.root ? ownerOf(a, g.el.viewport) : 'outside';
        // `copy` and `cut` sort before `paste`.
        const sel = (g.el.root.getRootNode() as Document).getSelection?.() ?? g.doc.getSelection();
        return !e.defaultPrevented && (w === 'cell' || w === 'header') && !!target() && !(e.type < 'p' && !s.r && String(sel) && g.el.root.contains(sel!.anchorNode));
      };
      for (const type of ['copy', 'cut', 'paste']) {
        g.scope.on(g.doc, type, (e) => {
          if (!ours(e)) return;
          e.preventDefault();
          const dt = (e as ClipboardEvent).clipboardData;
          // The HTML read now: the event's data is readable during the event only.
          if (type === 'paste') paste(dt?.getData('text/plain') ?? '', dt?.getData('text/html') ?? '', 'user');
          else {
            const r = copy(type === 'cut', 'user');
            r && (dt?.setData('text/plain', r.text), dt?.setData('text/html', r.html));
          }
        });
      }
      // Delete / Backspace on a block (L10): asked before every other feature (the editors clear one cell), a handle put first.
      const head: FeatureHandle = {
        keys: (e, _at, owner) => owner === 'cell' && !!s.r && (e.key === 'Delete' || e.key === 'Backspace') && !(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) && (erase('user'), true),
        destroy() {},
      };

      const api: RangeApi = {
        get: () => s.r,
        set(x) {
          // Never a throw (review 4): a value of the wrong shape is told and refused, nothing changed.
          const cell = (a: unknown): boolean => typeof (a as CellAddr | null)?.row === 'string' && typeof (a as CellAddr).column === 'string';
          if (x !== null && !(cell((x as CellRange | undefined)?.anchor) && cell(x.focus))) {
            return tell('invalid-setting', 'range', 'shape');
          }
          if (x && !boxOf(x)) {
            // A corner's row not shown, else a column not visible: told, never thrown.
            const row = rows.displayed.indexOf(x.anchor.row) < 0 || rows.displayed.indexOf(x.focus.row) < 0;
            return tell(row ? 'unknown-row-id' : 'unknown-column', 'range', row ? 'row' : 'column');
          }
          s.set(x, 'api');
          s.follows = false;
          return true;
        },
        // A drag under way stops first: its release must not bring a block back (review of the 2026-10-26 fix).
        clear: () => (drag.stop(), s.set(null, 'api')),
        box: () => boxOf(s.r),
        copy: (x) => copy(false, 'api', x?.headers),
        cut: () => copy(true, 'api'),
        paste: (text, html = '') => paste(text, html, 'api'),
        erase: () => erase('api'),
      };
      apis.set(kernel, api);

      return {
        afterRows(f: Frame<unknown>) {
          if (g.features.includes(tail)) return;
          g.features = [head, ...g.features, tail];
          paint(f);
        },
        keys(e: KeyboardEvent, at: FocusPos | null, owner: KeyOwner): boolean {
          if (owner !== 'cell' && owner !== 'header') return false;
          if (e.key === 'Escape') return !!s.r && (drag.stop(), s.drop('user'), true);
          // The key's meaning without Shift (mirrored right to left there): Shift with it extends the block.
          const i = intentFor({ key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: false }, { dir: g.dir, owner, mac: g.mac });
          if (!e.shiftKey) return i?.kind === 'selectAll' && (all(), true);
          const from = at?.kind === 'cell' ? at : at ? null : first();
          if (owner !== 'cell' || !from || !i) return false;
          if (i.kind === 'toggleSelect') return isCellKey(from.row) && all(from.row), true;
          if (i.kind !== 'move' && i.kind !== 'edge' && i.kind !== 'page') return false;
          // From the far corner while the focus follows the block (after a drag the focus is on the anchor, S12-Q15).
          const c = s.r && s.follows ? s.r.focus : from;
          // Never into the header: Up from the first row leads there (the key is still taken).
          if (i.kind === 'move' && i.axis === 'row' && i.delta < 0 && rows.displayed.indexOf(c.row) === 0) return true;
          const anchor = s.r && s.follows ? s.r.anchor : from;
          // The focus to that corner first (a step that moves nothing leaves it there, the block kept).
          if (c !== from) s.focusTo(c);
          own = true;
          try {
            g.step?.(i);
          } finally {
            own = false;
          }
          const f = kernel.focus;
          if (f?.kind === 'cell') s.set({ anchor, focus: { row: f.row, column: f.column } }, 'user'), (s.follows = true);
          return true;
        },
        destroy() {
          off();
          drag.stop();
          hush();
          apis.delete(kernel);
          for (const x of decorated) x.classList.remove(...CLASSES), x.removeAttribute('aria-selected');
          decorated.clear();
          g.features = g.features.filter((h) => h !== tail && h !== head);
          if (memo?.owner === kernel) memo = null;
          seq = NaN;
          delete g.multi;
        },
      };
    },
  };
}
