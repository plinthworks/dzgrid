// Phase 5 step 8, the random walk over undo and redo in the DOM (step08-plan.md « Tests first »): fields typed and
// kept (Enter), cleared (Delete), Ctrl/Cmd+Z, Ctrl+Y and Ctrl+Shift+Z on random layouts (QWERTY, AZERTY, Arabic by
// `code`, a Mac's Cmd), the API's undo and redo, Ctrl+Z inside an open field (the field's own), sorting, filtering,
// reapplying, host updates and removals, saves answered in any order (saved, refused, a network cut), time, a tree's
// parents closed and opened, a nested grid's own edit and undo. After each step: every mounted cell's text, canUndo
// and canRedo as the oracle says (support/edit-dom-oracle.ts, from the sheets), the focus on the first cell given back
// when it is shown and unmoved otherwise, the undo's sentence first in its announcement, no row moved by an undo, the
// rows given to the grid never written. 300 seeds in test:ci, 1 000 in test:perm.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import type { ColumnDef, RowKey } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { tree } from '../src/tree.js';
import { detail, nestedGrid } from '../src/detail.js';
import { edit } from '../src/edit.js';
import { editors } from '../src/editors.js';
import type { GridContext } from '../src/context.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { BASE, EDIT, EDITORS, cleanup, ed, join, k } from './support-editors.js';
import { EditDomOracle, col, idOfCell } from './support/edit-dom-oracle.js';

afterEach(cleanup);

type W = { id: string; name: string | null; n: number | null; s: string; q: number | null; parent?: string | null };
const COLS: ColumnDef<W, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true, edit: { required: true } },
  { id: 'n', header: 'Stock', type: 'number', width: 80, editable: true, edit: { min: 0 } },
  { id: 'q', header: 'Price', type: 'number', width: 80, editable: true },
];
const EDITABLE = ['name', 'n', 'q'];
const HEAD: Record<string, string> = { name: 'Name', n: 'Stock', q: 'Price' };
const T = EN_EDIT.text as unknown as Record<string, string | Record<string, string>>;
const plural = (key: string, n: number) => {
  const v = T[key]!;
  return (typeof v === 'string' ? v : n === 1 ? v['one']! : v['other']!).replace('{n}', String(n));
};
const WORDS = {
  header: (c: string) => HEAD[c]!, code: () => '', unknown: '', network: '', failed: () => '', saveRefused: () => '', refused: () => '', dropped: () => '', removed: '',
};
/** The undo's sentence (edit-undo.md « Announcements »), from the oracle's result. */
const sentence = (dir: 'undo' | 'redo', r: { cells: string[]; skipped: number } | null): string => {
  const U = dir === 'undo' ? 'Undo' : 'Redo';
  if (!r) return T[`edit.nothingTo${U}`] as string;
  const n = r.cells.length;
  const one = n === 1 ? (T[`edit.${dir}ne`] as string).replace('{column}', HEAD[col(r.cells[0]!)]!) : n ? plural(`edit.${dir}neMany`, n) : '';
  return [one, r.skipped ? plural(`edit.${dir}Skipped`, r.skipped) : ''].filter(Boolean).join('. ');
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const idOf = (key: RowKey) => String(key).replace(/^d:\d+:/, '');
const fmt = (v: unknown) => (v === null || v === undefined ? '' : String(v));
function read(c: string, text: string): { v: unknown } | { code: string } {
  if (c === 'name') return text === '' ? { code: 'required' } : { v: text };
  if (text === '') return { v: null };
  if (!/^-?\d+$/.test(text)) return { code: 'parse' };
  const v = Number(text);
  return c === 'n' && v < 0 ? { code: 'min' } : { v };
}
const TEXTS = { name: ['Alpha', 'Beta', '', 'Zed'], num: ['5', '17', '250', '-5', 'abc', '', '0'] };
/** The undo keys: [key, init, mac]; z then the redos. */
const UNDO_KEYS: [string, KeyboardEventInit, boolean][] = [['z', { code: 'KeyZ', ctrlKey: true }, false], ['z', { code: 'KeyW', ctrlKey: true }, false], ['ظ', { code: 'KeyZ', ctrlKey: true }, false], ['z', { code: 'KeyZ', metaKey: true }, true]];
const REDO_KEYS: [string, KeyboardEventInit, boolean][] = [['y', { code: 'KeyY', ctrlKey: true }, false], ['Z', { code: 'KeyZ', ctrlKey: true, shiftKey: true }, false], ['غ', { code: 'KeyY', ctrlKey: true }, false], ['z', { code: 'KeyZ', metaKey: true, shiftKey: true }, true], ['y', { code: 'KeyY', metaKey: true }, true]];

type Cfg = 'client' | 'tree' | 'nested';

async function walk(seed: number, cfg: Cfg, steps = 40): Promise<string[]> {
  const r = rng(seed);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)]!;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const errors: string[] = [];
  const given: [W, string][] = [];
  const give = (w: W): W => (given.push([w, JSON.stringify(w)]), w);
  let data: W[] = Array.from({ length: 20 }, (_, i) => give({ id: `r${i}`, name: `Name ${i}`, n: i, s: '', q: (i * 37) % 101, ...(cfg === 'tree' && { parent: i % 4 === 0 ? null : `r${i - (i % 4)}` }) }));
  const held: { req: SaveRequest<W>; ok(): void; no(e: unknown): void; done: boolean }[] = [];
  const save = (req: SaveRequest<W>) => new Promise<void>((ok, no) => void held.push({ req, ok: () => ok(), no, done: false }));
  // The nested configuration: each row's panel a grid of its own (its own edit and undo); r1's panel open.
  const innerSaves: { ok(): void }[] = [];
  let inner = null as { ctx: GridContext<W>; kernel: { focus: unknown } } | null;
  const lines = nestedGrid<W>({
    env: () => ({ geometry: { read: () => ({ block: 120, inline: 400, scrollTop: 0, scrollInline: 0 }), writeScrollTop() {}, writeScrollInline() {} }, sync: true }),
    settings: (c) => ({
      rows: [0, 1, 2].map((i) => ({ id: `${(c.row as W).id}-${i}`, name: `Line ${i}`, n: i, s: '', q: i })), getRowId: (w: W) => w.id, columns: COLS, messages: join(BASE.en, EDIT.en, EDITORS.en),
      features: [edit<W>({ save: () => new Promise<void>((ok) => void innerSaves.push({ ok: () => ok() })) }), editors()],
    }),
    onGrid: (grid) => void (inner = { ctx: (grid as unknown as { context: GridContext<W> }).context, kernel: grid.kernel }),
  });
  const t = ed({
    columns: COLS as never, rows: data as never, block: 240, save: save as never,
    ...(cfg === 'tree' && { settings: { messages: join(BASE.en, EDIT.en, EDITORS.en, EN_TREE) }, features: (e, x) => [tree<W>({ parentId: (w) => w.parent ?? null }) as never, e, x] }),
    ...(cfg === 'nested' && { settings: { messages: join(BASE.en, EDIT.en, EDITORS.en, EN_DETAIL) }, features: (e, x) => [e, x, detail<W>({ part: lines as never, height: 140 }) as never] }),
  });
  const g = t.g;
  if (cfg === 'tree') g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
  if (cfg === 'nested') g.kernel.dispatch({ type: 'rows.expand', rows: [k('r1')], expanded: true }, 'api');
  const polite: string[] = [];
  vi.spyOn(t.ctx.live, 'announce').mockImplementation((s: string) => void polite.push(s));
  const flushAll = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  const toks = new WeakMap<object, number>();
  let tokN = 0;
  const tok = (o: object) => toks.get(o) ?? (toks.set(o, ++tokN), tokN);
  const src = (cell: string) => {
    const node = g.kernel.rows.row(k(idOfCell(cell)));
    return node ? { v: (node.data as Record<string, unknown>)[col(cell)], tok: tok(node.data as object) } : undefined;
  };
  const o = new EditDomOracle(src, true, WORDS as never);
  const heldRow = (cell: string) => g.kernel.rows.row(k(idOfCell(cell))) !== undefined;
  const mounted = (): string[] => {
    const out: string[] = [];
    t.ctx.rowRenderer.forEach((key, v) => {
      for (const c of v.cells.keys()) if (EDITABLE.includes(c)) out.push(`${idOf(key)}.${c}`);
    });
    return out;
  };
  const shown = (cell: string) => g.kernel.rows.displayed.indexOf(k(idOfCell(cell))) >= 0;
  const order = () => Array.from({ length: g.kernel.rows.displayed.count }, (_, i) => g.kernel.rows.displayed.keyAt(g.kernel.rows.displayed.index(i)!)).join();
  const focusOf = () => {
    const f = g.kernel.focus;
    return f?.kind === 'cell' ? `${idOf(f.row)}.${f.column}` : JSON.stringify(f);
  };
  /** A mounted, editable cell focused (the user's click), no field open. */
  const land = (): string | null => {
    const ms = mounted();
    if (!ms.length) return null;
    const cell = pick(ms);
    t.at(idOfCell(cell), col(cell));
    return cell;
  };

  const check = (step: string) => {
    if (errors.length > 4) return;
    o.idle();
    const ce = t.ctx.editor;
    const editing = ce ? `${idOf(ce.key)}.${ce.column}` : null;
    t.ctx.rowRenderer.forEach((key, v) => {
      for (const [c, cv] of v.cells) {
        if (!EDITABLE.includes(c)) continue;
        const cell = `${idOf(key)}.${c}`;
        if (cell === editing || !heldRow(cell)) continue;
        const text = fmt(o.value(cell));
        if (cv.el.textContent !== text) errors.push(`${seed}/${cfg} ${step}: ${cell} text "${cv.el.textContent}" want "${text}"`);
      }
    });
    const can = [t.api.canUndo, t.api.canRedo].join();
    const want = [o.core.undo.length > 0, o.core.redo.length > 0].join();
    if (can !== want) errors.push(`${seed}/${cfg} ${step}: canUndo,canRedo ${can} want ${want}`);
    const got = held.map((h) => h.req.changes.map((c) => `${idOf(c.key)}.${c.column}=${String(c.value)}`).join(','));
    const sent = o.core.sent.map((s) => s.changes.map(([c, v]) => `${c}=${String(v)}`).join(','));
    if (got.join(' | ') !== sent.join(' | ')) errors.push(`${seed}/${cfg} ${step}: requests ${got.join(' | ')} want ${sent.join(' | ')}`);
    if (document.activeElement === document.body && focused) errors.push(`${seed}/${cfg} ${step}: focus on body`);
  };
  let focused = false;

  /** An undo or a redo by `how` ('key' or 'api'): its oracle, its focus and its sentence checked. */
  const move = async (dir: 'undo' | 'redo', how: 'key' | 'api', what: string) => {
    const before = focusOf();
    const rows = order();
    const res = o.move(dir, heldRow);
    if (how === 'api') dir === 'undo' ? t.api.undo() : t.api.redo();
    else {
      const [key, init, mac] = pick(dir === 'undo' ? UNDO_KEYS : REDO_KEYS);
      (t.ctx as { mac: boolean }).mac = mac;
      const ev = t.key(key, init);
      if (!ev.defaultPrevented) errors.push(`${seed}/${cfg} ${what}: ${key} not taken`);
    }
    await flushAll();
    const first = res?.cells[0];
    const want = first && shown(first) && !t.ctx.editor ? first : before;
    if (focusOf() !== want) errors.push(`${seed}/${cfg} ${what}: focus ${focusOf()} want ${want}`);
    if (first && want === first && document.activeElement !== t.cell(idOfCell(first), col(first))) errors.push(`${seed}/${cfg} ${what}: the DOM focus not on ${first}`);
    const s = sentence(dir, res);
    if (STATS) for (const tag of [`${what}`, res ? (res.skipped ? 'skipped' : 'clean') : 'nothing', want === before ? 'focus stays' : 'focus moves', first && !shown(first) ? 'hidden target' : '']) if (tag) STATS[tag] = (STATS[tag] ?? 0) + 1;
    if (!polite.at(-1)?.startsWith(s)) errors.push(`${seed}/${cfg} ${what}: said ${JSON.stringify(polite.at(-1))} want it to start with ${JSON.stringify(s)}`);
    if (order() !== rows) errors.push(`${seed}/${cfg} ${what}: rows moved by an undo`);
  };

  for (let step = 0; step < steps && errors.length < 3; step++) {
    const x = r();
    let what = '';
    o.begin();
    if (x < 0.22) {
      const cell = land();
      if (!cell) continue;
      focused = true;
      const text = pick(col(cell) === 'name' ? TEXTS.name : TEXTS.num);
      what = `type ${cell} "${text}"`;
      t.key('F2');
      t.type(text);
      // Ctrl+Z inside the field, sometimes: the field's own, nothing undone.
      if (r() < 0.3) {
        const was = [t.api.canUndo, t.api.canRedo].join();
        const ev = t.key('z', { code: 'KeyZ', ctrlKey: true }, t.field()!);
        if (ev.defaultPrevented || [t.api.canUndo, t.api.canRedo].join() !== was || !t.field()) errors.push(`${seed}/${cfg} ${what}: Ctrl+Z in the field reached the grid`);
      }
      const rd = read(col(cell), text);
      t.key('Enter', {}, t.field()!);
      if ('code' in rd) {
        o.refuse(cell);
        t.key('Escape', {}, t.field() ?? document.activeElement!);
        if (t.field()) t.key('Escape', {}, t.field()!);
      } else o.commit([[cell, rd.v]]);
    } else if (x < 0.3) {
      const cell = land();
      if (!cell) continue;
      focused = true;
      what = `delete ${cell}`;
      t.key('Delete');
      const rd = read(col(cell), '');
      if ('code' in rd) o.refuse(cell);
      else o.commit([[cell, rd.v]]);
    } else if (x < 0.5) {
      if (!land()) continue;
      focused = true;
      const dir = r() < 0.6 ? 'undo' : 'redo';
      what = `${dir} key`;
      await move(dir, 'key', what);
    } else if (x < 0.58) {
      const dir = r() < 0.6 ? 'undo' : 'redo';
      what = `${dir} api`;
      await move(dir, 'api', what);
    } else if (x < 0.7) {
      const open = held.map((h, i) => [h, i] as const).filter(([h]) => !h.done);
      if (!open.length) continue;
      const [h, i] = pick(open);
      h.done = true;
      const kind = pick(['ok', 'ok', 'reason', 'net'] as const);
      what = `answer #${i} ${kind}`;
      const refused = new Map<string, { why: string | null; code: string | null; net: boolean }>();
      if (kind === 'ok') h.ok();
      else {
        for (const c of h.req.changes) refused.set(`${idOf(c.key)}.${c.column}`, { why: kind === 'reason' ? 'no' : null, code: null, net: kind === 'net' });
        h.no(kind === 'reason' ? { reason: 'no' } : new TypeError('Failed to fetch'));
      }
      await flushAll();
      o.settle(i, refused, heldRow);
    } else if (x < 0.76) {
      const d = pick([300, 600, 1500, 5000]);
      what = `time ${d}`;
      o.now += d;
      vi.advanceTimersByTime(d);
    } else if (x < 0.84 && cfg !== 'nested') {
      const op = pick(['update', 'update', 'remove'] as const);
      const w = pick(data);
      if (cfg === 'tree' && op === 'remove') continue;
      what = `${op} ${w.id}`;
      if (op === 'update') {
        const nw = give({ ...w, n: Math.floor(r() * 900) });
        data = data.map((y) => (y.id === w.id ? nw : y));
        g.kernel.rows.applyTransaction({ update: [nw] as never });
      } else {
        data = data.filter((y) => y.id !== w.id);
        g.kernel.rows.applyTransaction({ remove: [w.id] });
      }
      o.rowsChanged();
    } else if (x < 0.92) {
      const how = pick(['sort', 'filter', 'reapply', cfg === 'tree' ? 'fold' : 'sort'] as const);
      what = how;
      if (how === 'sort') g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'api');
      else if (how === 'filter') {
        const v = r() < 0.4 ? null : Math.floor(r() * 80);
        what = `filter ${v}`;
        g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: v === null ? null : { type: 'number', op: 'gt', value: v } }, 'api');
      } else if (how === 'reapply') t.api.reapply();
      else {
        const p = `r${Math.floor(r() * 5) * 4}`;
        const open = !g.kernel.expansion.has(k(p));
        what = `${open ? 'expand' : 'collapse'} ${p}`;
        g.kernel.dispatch({ type: 'rows.expand', rows: [k(p)], expanded: open }, 'api');
      }
    } else if (cfg === 'nested' && inner?.ctx.el.root.isConnected && inner.ctx.rowRenderer.cell(k('r1-1'), 'q')) {
      // The inner grid's own: an edit and Ctrl+Z there; the outer grid's stacks untouched.
      what = 'inner';
      const was = [t.api.canUndo, t.api.canRedo].join();
      const ic = inner.ctx;
      const api = ic.edit!.api as { commit(c: unknown[]): unknown };
      api.commit([{ key: k('r1-0'), column: 'n', input: { text: String(Math.floor(r() * 50)) } }]);
      ic.rowRenderer.cell(k('r1-1'), 'q')?.focus();
      ic.kernel.dispatch({ type: 'focus.set', focus: { kind: 'cell', row: k('r1-1'), column: 'q' } }, 'user');
      ic.restoreFocus();
      if (document.activeElement?.closest('.dzg') !== ic.el.root) errors.push(`${seed}/${cfg} ${what}: the inner cell not focused`);
      t.key('z', { code: 'KeyZ', ctrlKey: true });
      for (const s of innerSaves.splice(0)) s.ok();
      await flushAll();
      if ([t.api.canUndo, t.api.canRedo].join() !== was) errors.push(`${seed}/${cfg} ${what}: the outer grid's stacks changed`);
    } else continue;
    await flushAll();
    check(`${step} ${what}`);
  }
  for (const [w, copy] of given) if (JSON.stringify(w) !== copy) errors.push(`${seed}/${cfg}: a row given to the grid was written: ${copy} → ${JSON.stringify(w)}`);
  g.destroy();
  cleanup();
  return errors;
}

/** S8_STATS=<file>: what the walk reached, written there. */
const STATS: Record<string, number> | null = process.env['S8_STATS'] ? {} : null;
const SEEDS = Number(process.env['PERMS'] ?? 0) >= 1000 ? 1000 : 300;
const CFGS: Cfg[] = ['client', 'tree', 'nested'];

describe('the undo walk (client, tree, nested)', () => {
  it(`${SEEDS} seeds: values, canUndo/canRedo, the focus, the sentence, the rows in place, as the oracle says`, async () => {
    const errors: string[] = [];
    for (let seed = 1; seed <= SEEDS && errors.length < 5; seed++) errors.push(...(await walk(seed * 2654435761, CFGS[seed % 3]!)));
    if (STATS) writeFileSync(process.env['S8_STATS']!, JSON.stringify(STATS));
    expect(errors).toEqual([]);
  }, 600_000);
});
