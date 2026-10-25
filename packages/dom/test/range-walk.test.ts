// `@dzgrid/dom/range`, a seeded random walk against an oracle (Phase 5 step 11a, step11a-plan.md test 8;
// docs/behaviors/range-selection.md). Steps: Shift+arrows, Shift+Home/End, Ctrl+Shift+edges, Shift+Page, Ctrl+A,
// Shift+Space, Escape, plain arrows, clicks, Shift+clicks, drags (some with auto-scroll frames), sorts, filters, the
// quick search, transactions (rows added above or inside, a row removed — a corner sometimes), columns hidden, shown,
// pinned and resized, scrolls, an editor opened and closed; trees opened and closed; details opened and closed.
//
// The oracle is written by hand from the sheet: where the moving corner goes for each key (the router's moves over a
// flat list: a detail one stop, Up from the first row nowhere), when the block is kept or dropped, which sentence, how
// many `rangeChanged`, which cells carry which classes and aria-selected. What is shown (sorting, filtering, the
// tree's and the details' rows) is the core's, read from `displayed` (the core's own suites test it); everything
// about the block is the oracle's. Seeds replay: RANGE_SEED=<n>; RANGE_SEEDS / RANGE_STEPS scale it (the step's run:
// 200 × 400, recorded in step11a-plan.md « Done »).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { CellAddr, ColumnDef, FocusPos, RowKey } from '@dzgrid/core';
import { tree } from '../src/tree.js';
import { detail } from '../src/detail.js';
import { definePart } from '../src/part.js';
import { edit } from '../src/edit.js';
import { editors } from '../src/editors.js';
import { EN } from '../src/locales/en.js';
import { AR } from '../src/locales/ar.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { AR_RANGE } from '../src/locales/ar-range.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { AR_TREE } from '../src/locales/ar-tree.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { AR_DETAIL } from '../src/locales/ar-detail.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { AR_EDIT } from '../src/locales/ar-edit.js';
import { EN_EDITORS } from '../src/locales/en-editors.js';
import { AR_EDITORS } from '../src/locales/ar-editors.js';
import { cleanup, HEADER, join, k, rmake, rowsOf, type R } from './support-range.js';
import { WALK_TEST_MS } from './support/slow.js';

afterEach(cleanup);

/** mulberry32: the tests' own PRNG (the core has no randomness). */
const prng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Config = 'flat' | 'rtl' | 'tree' | 'detail';
interface Block { anchor: CellAddr; focus: CellAddr }
const same = (a: CellAddr | null | undefined, b: CellAddr | null | undefined) => !!a && !!b && a.row === b.row && a.column === b.column;
const show = (b: Block | null) => (b ? `${b.anchor.row}/${b.anchor.column}:${b.focus.row}/${b.focus.column}` : 'null');

function walk(config: Config, seed: number, steps: number): string[] {
  const rnd = prng(seed);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(rnd() * xs.length)]!;
  const ar = config === 'rtl';
  const columns: ColumnDef<R, any>[] = [
    { id: 'name', header: 'Name', width: 120, editable: config === 'flat' },
    { id: 'n', header: 'N', type: 'number', width: 80, editable: config === 'flat' },
    { id: 's', header: 'S', width: 80 },
    { id: 'q', header: 'Q', type: 'number', width: 80 },
  ];
  const part = definePart('detail', { mount: (host) => ((host.textContent = 'panel'), {}) });
  const rows: R[] = config === 'tree'
    ? Array.from({ length: 12 }, (_, p) => [{ ...rowsOf(1)[0]!, id: `p${p}`, name: `P ${p}`, n: p * 10, q: (p * 13) % 7, parent: null }, ...Array.from({ length: 6 }, (_, c): R => ({ id: `p${p}c${c}`, name: `C ${p}.${c}`, n: p * 10 + c, s: `s${c}`, q: (p * 7 + c * 3) % 11, parent: `p${p}` }))]).flat()
    : rowsOf(120);
  const messages = ar ? join(AR, AR_RANGE, AR_TREE, AR_DETAIL, AR_EDIT, AR_EDITORS) : join(EN, EN_RANGE, EN_TREE, EN_DETAIL, EN_EDIT, EN_EDITORS);
  const t = rmake({
    rows, columns, messages, ...(ar && { lang: 'ar' as const }),
    features: (r) => config === 'tree' ? [tree<R>({ parentId: (x) => x.parent ?? null }), r] : config === 'detail' ? [detail<R>({ part, height: 70 }), r] : [edit(), editors(), r],
  });
  const errors: string[] = [];
  const d = () => t.g.kernel.rows.displayed;
  const cols = () => t.ctx.columns.visible().map((c) => c.id);
  const isData = (key: RowKey) => d().nodeAt(d().index(d().indexOf(key))!).kind === 'data';
  const msg = (key: string, p?: Record<string, string | number>) => t.ctx.msg(key as never, p);

  // ---- the oracle's state ----
  let block = null as Block | null;
  let follows = false;
  let changes = 0;
  let cleared = 0;
  let reordered = 0;
  let sizes = 0;
  let pendingAt: number | null = null;
  let now = 0;
  let rowClicks = 0;
  /** A new block; `user`: by the keys or the pointer, its size said after the pause when it changed. */
  const set = (b: Block | null, user: boolean) => {
    const next = b && same(b.anchor, b.focus) ? null : b;
    const changed = show(next) !== show(block);
    if (changed) changes++;
    block = next;
    if (user && block && changed) pendingAt = now;
    if (!block) pendingAt = null;
  };
  /** Whether the core told an event of this type while `act` ran (a filter that changes nothing tells nothing). */
  const told = (type: string, act: () => void) => {
    const n0 = t.events.length;
    act();
    return t.events.slice(n0).some((e) => e.type === type);
  };
  const cornersShown = () => !block || (d().indexOf(block.anchor.row) >= 0 && d().indexOf(block.focus.row) >= 0);
  const drop = (why: 'cleared' | 'reordered') => {
    if (!block) return;
    set(null, false);
    if (why === 'cleared') cleared++;
    else reordered++;
  };
  const advance = (ms: number) => {
    vi.advanceTimersByTime(ms);
    now += ms;
    if (pendingAt !== null && now - pendingAt >= 400) (sizes += block ? 1 : 0), (pendingAt = null);
  };
  const focusCell = (): CellAddr | null => {
    const f = t.g.kernel.focus;
    return f?.kind === 'cell' ? { row: f.row, column: f.column } : null;
  };
  /** Where the router's move takes the focus, by hand (no spans): a detail is one stop, Up from row 0 leads nowhere. */
  const target = (from: CellAddr, key: string, ctrl: boolean): CellAddr | 'none' => {
    const D = d();
    const C = cols();
    const r = D.indexOf(from.row);
    const c = C.indexOf(from.column);
    const n = D.count;
    const at = (ri: number, ci: number): CellAddr => ({ row: D.keyAt(D.index(Math.max(0, Math.min(n - 1, ri)))!), column: C[Math.max(0, Math.min(C.length - 1, ci))]! });
    const whole = D.nodeAt(D.index(r)!).kind === 'detail';
    const fwd = ar ? 'ArrowLeft' : 'ArrowRight';
    const back = ar ? 'ArrowRight' : 'ArrowLeft';
    if (key === 'ArrowDown') return ctrl ? at(n - 1, c) : at(r + 1, c);
    if (key === 'ArrowUp') return ctrl ? at(0, c) : r === 0 ? 'none' : at(r - 1, c);
    if (key === fwd) return whole ? from : at(r, ctrl ? C.length - 1 : c + 1);
    if (key === back) return whole ? from : at(r, ctrl ? 0 : c - 1);
    if (key === 'Home') return ctrl ? at(0, 0) : whole ? from : at(r, 0);
    if (key === 'End') return ctrl ? at(n - 1, C.length - 1) : whole ? from : at(r, C.length - 1);
    const page = Math.max(1, Math.floor(t.box.block / t.h()) - 1);
    if (key === 'PageDown') return at(r + page, c);
    if (key === 'PageUp') return at(r - page, c);
    return from;
  };

  /** Every mounted body cell against the oracle's block; the focus on the corner while it follows; the counts. */
  const check = (what: string) => {
    if (errors.length > 4) return;
    const got = t.api().get();
    if (show(got) !== show(block)) return void errors.push(`${what}: block ${show(got)} ≠ oracle ${show(block)}`);
    const D = d();
    const C = cols();
    const b = block && { a: D.indexOf(block.anchor.row), f: D.indexOf(block.focus.row), ca: C.indexOf(block.anchor.column), cf: C.indexOf(block.focus.column) };
    const box = b && { top: Math.min(b.a, b.f), bottom: Math.max(b.a, b.f), start: Math.min(b.ca, b.cf), end: Math.max(b.ca, b.cf) };
    let first = -1;
    let last = -1;
    if (box) for (let i = box.top; i <= box.bottom; i++) if (D.nodeAt(D.index(i)!).kind === 'data') (first = first < 0 ? i : first), (last = i);
    for (const [key, v] of t.ctx.rowRenderer.mounted) {
      const i = D.indexOf(key);
      const data = isData(key);
      for (const [col, cv] of v.cells) {
        const ci = C.indexOf(col);
        const on = !!box && data && i >= box.top && i <= box.bottom && ci >= box.start && ci <= box.end;
        const want = on ? `r${ci === box!.start ? 's' : ''}${ci === box!.end ? 'e' : ''}${i === first ? 't' : ''}${i === last ? 'b' : ''}+` : '';
        const el = cv.el;
        const x = (n: string) => el.classList.contains(`dzg-cell--${n}`);
        const seen = x('range') || x('rs') || x('re') || x('rt') || x('rb') || el.hasAttribute('aria-selected') ? `r${x('rs') ? 's' : ''}${x('re') ? 'e' : ''}${x('rt') ? 't' : ''}${x('rb') ? 'b' : ''}${el.getAttribute('aria-selected') === 'true' && x('range') ? '+' : el.hasAttribute('aria-selected') ? '?' : x('range') ? '' : '!'}` : '';
        if (seen !== want) errors.push(`${what}: ${key}/${col} shows « ${seen} », oracle « ${want} »`);
      }
    }
    if (block && follows && !same(focusCell(), block.focus)) errors.push(`${what}: focus ${JSON.stringify(t.g.kernel.focus)} not on the corner ${show(block)}`);
    const ch = t.changes().length;
    if (ch !== changes) errors.push(`${what}: ${ch} rangeChanged, oracle ${changes}`);
    const said = t.said();
    const c1 = said.filter((s) => s === msg('range.cleared')).length;
    const c2 = said.filter((s) => s === msg('range.reordered')).length;
    const c3 = said.filter((s) => s.endsWith(ar ? 'محددة' : 'selected')).length;
    if (c1 !== cleared || c2 !== reordered || c3 !== sizes) errors.push(`${what}: said cleared ${c1}/${cleared}, reordered ${c2}/${reordered}, sizes ${c3}/${sizes}`);
    const rc = t.events.filter((e) => e.type === 'rowClicked').length;
    if (rc !== rowClicks) errors.push(`${what}: ${rc} rowClicked, oracle ${rowClicks}`);
  };

  // A focused first cell to start from.
  t.focus(idOf0());
  function idOf0() {
    return String(d().keyAt(d().index(0)!)).replace(/^d:\d+:/, '');
  }
  const mountedCells = () => [...t.ctx.rowRenderer.mounted].flatMap(([key, v]) => (isData(key) ? [...v.cells.keys()].map((c) => [key, c] as const) : []))
    .filter(([key]) => {
      // Fully inside the view (the pointer reaches it).
      const i = d().indexOf(key);
      const top = t.ctx.layout!.offsetOf(i as never) - t.ctx.scroll.logicalTop;
      // Not under the tree's pinned parents either (the pointer there reaches the row under them).
      return top >= (t.ctx.inset ?? 0) && top + t.ctx.layout!.heightOf(i as never) <= t.box.block - 40;
    });
  const pt = (key: RowKey, col: string) => t.at(String(key).replace(/^d:\d+:/, ''), col);
  const cellEl = (key: RowKey, col: string) => t.ctx.rowRenderer.mounted.get(key)?.cells.get(col)?.el ?? null;
  const visibleIds = () => t.ctx.columns.visible().map((c) => c.id);

  for (let step = 0; step < steps && errors.length === 0; step++) {
    const r = rnd();
    let what = '';
    const ctrl = rnd() < 0.2;
    const fc = focusCell();
    const shiftKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ...(config === 'detail' ? [] : ['PageDown', 'PageUp'])];
    if (r < 0.3 && fc) {
      const key = pick(shiftKeys);
      what = `Shift${ctrl ? '+Ctrl' : ''}+${key}`;
      const to = target(fc, key, ctrl && !key.startsWith('Page'));
      t.press(key, { shiftKey: true, ctrlKey: ctrl && !key.startsWith('Page') });
      if (to !== 'none') {
        const anchor = block && follows ? block.anchor : fc;
        set({ anchor, focus: to }, true);
        follows = true;
      }
    } else if (r < 0.34 && fc) {
      what = 'Ctrl+A';
      t.press('a', { ctrlKey: true, code: 'KeyA' });
      const D = d();
      const C = cols();
      set({ anchor: { row: D.keyAt(D.index(0)!), column: C[0]! }, focus: { row: D.keyAt(D.index(D.count - 1)!), column: C[C.length - 1]! } }, true);
      follows = false;
    } else if (r < 0.37 && fc) {
      what = 'Shift+Space';
      t.press(' ', { shiftKey: true });
      if (isData(fc.row)) {
        const C = cols();
        set({ anchor: { row: fc.row, column: C[0]! }, focus: { row: fc.row, column: C[C.length - 1]! } }, true);
        follows = false;
      }
    } else if (r < 0.41) {
      what = 'Escape';
      t.press('Escape');
      drop('cleared');
    } else if (r < 0.48 && fc) {
      const key = pick(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']);
      what = key;
      const rowsBefore = d();
      t.press(key);
      const after = t.g.kernel.focus;
      const moved = !(after?.kind === 'cell' && same(after, fc));
      // The tree's own keys (open, close) keep the focus; any move by the user drops the block.
      if (moved && d() === rowsBefore) drop('cleared');
      else if (!cornersShown()) drop('cleared');
    } else if (r < 0.55) {
      const cs = mountedCells();
      if (!cs.length) continue;
      const [key, col] = pick(cs);
      what = `click ${key}/${col}`;
      const was = t.g.kernel.focus;
      t.down(cellEl(key, col)!, pt(key, col));
      t.up(pt(key, col));
      t.click(cellEl(key, col)!);
      rowClicks++;
      // A press without Shift drops the block (the click elsewhere or on itself).
      drop('cleared');
      void was;
    } else if (r < 0.61) {
      const cs = mountedCells();
      if (!cs.length || !fc) continue;
      const [key, col] = pick(cs);
      what = `Shift+click ${key}/${col}`;
      t.down(cellEl(key, col)!, pt(key, col), { shiftKey: true });
      t.up(pt(key, col));
      t.click(cellEl(key, col)!, { shiftKey: true });
      rowClicks++;
      const anchor = block && follows ? block.anchor : fc;
      set({ anchor, focus: { row: key, column: col } }, true);
      follows = true;
    } else if (r < 0.68) {
      const cs = mountedCells();
      if (cs.length < 2) continue;
      const [ka, ca] = pick(cs);
      const [kb, cb] = pick(cs);
      const auto = rnd() < 0.3;
      what = `drag ${ka}/${ca} → ${kb}/${cb}${auto ? ' + auto-scroll' : ''}`;
      t.down(cellEl(ka, ca)!, pt(ka, ca));
      drop('cleared');
      const p = pt(kb, cb);
      t.move(p);
      if (auto && !same({ row: ka, column: ca }, { row: kb, column: cb })) {
        const y = rnd() < 0.5 ? HEADER + t.box.block - 3 : HEADER - 5;
        t.move({ clientX: p.clientX, clientY: y });
        for (let f = Math.floor(rnd() * 5); f > 0; f--) t.tick();
        t.up({ clientX: p.clientX, clientY: y });
        t.tick();
        const got = t.api().get();
        // The corner the frames reached is the grid's (its speed); the anchor, the column and the focus are checked.
        if (got && (!same(got.anchor, { row: ka, column: ca }) || got.focus.column !== cb)) errors.push(`${what}: auto-scrolled block ${show(got)} from ${ka}/${ca}, column ${cb}`);
        const before = changes;
        set(got && { anchor: got.anchor, focus: got.focus }, true);
        follows = true;
        // Each frame that moved the corner told one change: at least one when a block is there.
        if (got && t.changes().length <= before) errors.push(`${what}: no rangeChanged while dragging`);
        changes = t.changes().length;
        t.click(t.ctx.el.body);
      } else {
        t.up(p);
        t.click(cellEl(kb, cb) ?? t.ctx.el.body);
        if (same({ row: ka, column: ca }, { row: kb, column: cb })) rowClicks++;
        else set({ anchor: { row: ka, column: ca }, focus: { row: kb, column: cb } }, true), (follows = true);
      }
    } else if (r < 0.71) {
      what = 'sort';
      if (told('sortChanged', () => t.g.kernel.dispatch({ type: 'sort.toggle', column: pick(['n', 'q', 'name']), multi: false }, 'user'))) drop('reordered');
    } else if (r < 0.74) {
      what = 'filter';
      const f = rnd() < 0.3 ? null : { type: 'number', op: 'gt', value: Math.floor(rnd() * 40) };
      if (told('filterChanged', () => t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: f } as never, 'user'))) drop('reordered');
    } else if (r < 0.76) {
      what = 'quick';
      const text = rnd() < 0.4 ? '' : String(Math.floor(rnd() * 10));
      if (told('quickChanged', () => t.g.kernel.dispatch({ type: 'quick.set', text }, 'user'))) drop('reordered');
    } else if (r < 0.8 && config !== 'tree') {
      const D = d();
      const kind = rnd();
      if (kind < 0.5) {
        what = 'add';
        const id = `n${step}`;
        t.g.kernel.rows.applyTransaction?.({ add: [{ id, name: `New ${step}`, n: Math.floor(rnd() * 100), s: 's', q: Math.floor(rnd() * 100) }], addAt: Math.floor(rnd() * 5) } as never, 'host');
      } else {
        // A row removed: a corner one time in three.
        const victim = block && rnd() < 0.33 ? pick([block.anchor.row, block.focus.row]) : D.keyAt(D.index(Math.floor(rnd() * D.count))!);
        if (!isData(victim)) continue;
        what = `remove ${victim}`;
        t.g.kernel.rows.applyTransaction?.({ remove: [String(victim).replace(/^d:\d+:/, '')] } as never, 'host');
      }
      if (!cornersShown()) drop('cleared');
    } else if (r < 0.84) {
      const op = rnd();
      const c = pick(['n', 's', 'q']);
      const shown = visibleIds();
      if (op < 0.4) {
        what = `resize ${c}`;
        t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: c, width: 60 + Math.floor(rnd() * 80) }] }, 'user');
      } else {
        const patch = op < 0.6 ? [{ id: c, hidden: shown.includes(c) }] : op < 0.8 ? [{ id: c, pinned: rnd() < 0.5 ? ('start' as const) : null }] : [{ id: c, order: Math.floor(rnd() * 4) }];
        what = `columns ${JSON.stringify(patch)}`;
        const sig = () => { const L = t.ctx.columns.layout; return [L.start, L.center, L.end].map((s) => s.columns.map((x) => x.id).join()).join('|'); };
        const before = sig();
        t.g.kernel.dispatch({ type: 'column.state', patch }, 'user');
        if (sig() !== before) drop('cleared');
      }
    } else if (r < 0.88) {
      what = 'scroll';
      t.scroll(Math.floor(rnd() * 2000));
    } else if (r < 0.93 && (config === 'tree' || config === 'detail')) {
      const D = d();
      const masters = Array.from({ length: D.count }, (_, i) => D.keyAt(D.index(i)!)).filter((key) => isData(key) && (config === 'detail' || /^d:\d+:p\d+$/.test(String(key))));
      if (!masters.length) continue;
      const key = pick(masters);
      const open = rnd() < 0.5;
      what = `${open ? 'open' : 'close'} ${key}`;
      t.g.kernel.dispatch({ type: 'rows.expand', rows: [key], expanded: open }, 'user');
      if (!cornersShown()) drop('cleared');
    } else if (r < 0.95 && config === 'flat' && fc && isData(fc.row) && (fc.column === 'name' || fc.column === 'n')) {
      what = 'editor';
      t.press('F2');
      const field = t.host.querySelector<HTMLElement>('.dzg-field');
      if (field) t.press('Escape', {}, field);
    } else {
      what = 'wait';
    }
    advance(pick([0, 0, 50, 200, 450]));
    check(`seed ${seed} step ${step} ${what}`);
  }
  return errors;
}

const SEEDS = Number(process.env['RANGE_SEEDS']) || 12;
const STEPS = Number(process.env['RANGE_STEPS']) || 150;
const ONE = process.env['RANGE_SEED'] ? Number(process.env['RANGE_SEED']) : null;

describe('range walk: the block against the oracle', () => {
  for (const config of ['flat', 'rtl', 'tree', 'detail'] as const) {
    it(`${config}: ${ONE ?? SEEDS} seed(s) × ${STEPS} steps, 0 difference`, () => {
      vi.useFakeTimers();
      const errors: string[] = [];
      const seeds = ONE !== null ? [ONE] : Array.from({ length: SEEDS }, (_, i) => (i + 1) * 7919 + config.length);
      for (const seed of seeds) {
        if (errors.length) break;
        errors.push(...walk(config, seed, STEPS));
        cleanup();
        vi.useFakeTimers();
      }
      expect(errors).toEqual([]);
    }, WALK_TEST_MS);
  }
});
void k;
void (null as FocusPos | null);
