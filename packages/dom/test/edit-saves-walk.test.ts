// Phase 5 step 7, the random walk over saves in the DOM, end to end (step07-plan.md « Tests first » 8): fields opened
// (F2, a character, a double click), typed, kept or given up (Enter, Tab, Escape, a blur), saves answered in any
// order (saved, a reason, a code, some cells named, a network cut), time, scrolling, server pages, host updates,
// additions and removals, the application's filter, a tree's parents closed, reapply, undo and redo, hovering. After
// each step, every mounted cell's text, marks and description, the field, the tooltip, the focus and the requests
// equal the oracle (support/edit-dom-oracle.ts, from the sheets); the assertive sentences at the end; the rows given
// to the grid never written. 300 seeds in test:ci, 1 000 in test:perm.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { appendFileSync } from 'node:fs';
import type { ColumnDef, RowKey } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { sourceRows, type DataRequest, type DataResponse } from '@dzgrid/core/server';
import { tree } from '../src/tree.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { EN_EDIT } from '../src/locales/en-edit.js';
import { EN_EDITORS } from '../src/locales/en-editors.js';
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
const T = { ...EN_EDIT.text, ...EN_EDITORS.text } as unknown as Record<string, string>;
const fill = (s: string, p: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, x: string) => p[x] ?? '');
const CODE = (c: string, code: string) => fill(T[`validation.${code}`] ?? T['validation.invalid']!, { min: c === 'n' ? '0' : '' });
const WORDS = {
  header: (c: string) => HEAD[c]!,
  code: CODE,
  unknown: T['edit.reasonUnknown']!,
  network: T['edit.reasonNetwork']!,
  failed: (reason: string) => fill(T['edit.failedMark']!, { reason }),
  saveRefused: (c: string, reason: string) => fill(T['edit.saveRefused']!, { column: HEAD[c]!, reason }),
  refused: (c: string, reason: string) => fill(T['edit.refused']!, { column: HEAD[c]!, reason }),
  dropped: (c: string) => fill(T['edit.refusedDropped']!, { column: HEAD[c]! }),
  removed: T['edit.rowRemoved']!,
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const idOf = (key: RowKey) => String(key).replace(/^d:\d+:/, '');
/** A value as the cell writes it (integers 0–999, no groups; '' blank). */
const fmt = (v: unknown) => (v === null || v === undefined ? '' : String(v));
/** What a kept text reads as (the sheets' rules for these columns), or a refusal code. */
function read(c: string, text: string): { v: unknown } | { code: string } {
  if (c === 'name') return text === '' ? { code: 'required' } : { v: text };
  if (text === '') return { v: null };
  if (!/^-?\d+$/.test(text)) return { code: 'parse' };
  const v = Number(text);
  return c === 'n' && v < 0 ? { code: 'min' } : { v };
}
const TEXTS = { name: ['Alpha', 'Beta 7', '', 'Zed'], num: ['5', '17', '250', '-5', 'abc', '', '999', '0'] };

type Cfg = 'client' | 'source' | 'tree';

async function walk(seed: number, cfg: Cfg, steps = 40): Promise<string[]> {
  const r = rng(seed);
  const pick = <X>(xs: readonly X[]): X => xs[Math.floor(r() * xs.length)]!;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const errors: string[] = [];
  // The rows given to the grid, each with a copy: never written by it.
  const given: [W, string][] = [];
  const give = (w: W): W => (given.push([w, JSON.stringify(w)]), w);
  let data: W[] = Array.from({ length: 24 }, (_, i) =>
    give({ id: `r${i}`, name: `Name ${i}`, n: i, s: '', q: (i * 37) % 101, ...(cfg === 'tree' && { parent: i % 4 === 0 ? null : `r${i - (i % 4)}` }) }),
  );
  let nextId = 24;
  // Saves held for the test.
  const held: { req: SaveRequest<W>; ok(): void; no(e: unknown): void; done: boolean }[] = [];
  const save = (req: SaveRequest<W>) => new Promise<void>((ok, no) => void held.push({ req, ok: () => ok(), no, done: false }));
  // A paged source answered by the test (new objects each answer, as JSON).
  const fetches: { req: DataRequest; ok(v: DataResponse<W>): void; done: boolean }[] = [];
  const answer = (req: DataRequest): DataResponse<W> => {
    const p = req.page!;
    return { rows: data.slice(p.offset, p.offset + p.size).map((w) => give({ ...w })), total: data.length };
  };
  const settings: Record<string, unknown> =
    cfg === 'source'
      ? { rows: undefined, source: sourceRows({ fetch: (req) => new Promise<DataResponse<W>>((ok) => void fetches.push({ req, ok, done: false })) }), operations: 'server', pagination: { pageSize: 8 } }
      : {};
  if (cfg === 'tree') settings['messages'] = join(BASE.en, EDIT.en, EDITORS.en, EN_TREE);
  const t = ed({
    columns: COLS as never, rows: (cfg === 'source' ? undefined : data) as never, block: 200, save: save as never, settings: settings as never,
    ...(cfg === 'tree' && { features: (e, x) => [tree<W>({ parentId: (w) => w.parent ?? null }) as never, e, x] }),
  });
  const g = t.g;
  const outside = document.body.appendChild(document.createElement('button'));
  const answerFetches = async () => {
    const f = fetches.filter((x) => !x.done);
    for (const x of f) x.done = true;
    if (f.length) f.at(-1)!.ok(answer(f.at(-1)!.req));
    await flushAll();
  };
  const flushAll = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  if (cfg === 'source') await answerFetches();
  if (cfg === 'tree') g.kernel.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');

  // The sentences written in the assertive region.
  const said: string[] = [];
  const region = t.host.querySelector('.dzg-live[aria-live="assertive"]')!;
  const tc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
  Object.defineProperty(region, 'textContent', { get() { return tc.get!.call(this); }, set(v: string) { if (v) said.push(v); tc.set!.call(this, v); } });

  // The oracle: the source a cell reads (the rows the grid holds, by object), the DOM's layer over the core's.
  const toks = new WeakMap<object, number>();
  let tokN = 0;
  const tok = (o: object) => toks.get(o) ?? (toks.set(o, ++tokN), tokN);
  const src = (cell: string) => {
    const node = g.kernel.rows.row(k(idOfCell(cell)));
    return node ? { v: (node.data as Record<string, unknown>)[col(cell)], tok: tok(node.data as object) } : undefined;
  };
  const o = new EditDomOracle(src, cfg !== 'source', WORDS);
  const held2 = (cell: string) => g.kernel.rows.row(k(idOfCell(cell))) !== undefined;
  const openText = (cell: string): string => {
    const e = o.core.entries.get(cell);
    const v = o.core.status(cell) === 'failed' ? e!.latest.v : o.value(cell);
    return fmt(v);
  };
  const mounted = (): string[] => {
    const out: string[] = [];
    t.ctx.rowRenderer.forEach((key, v) => {
      for (const c of v.cells.keys()) if (EDITABLE.includes(c)) out.push(`${idOf(key)}.${c}`);
    });
    return out;
  };
  const displayed = (id: string) => g.kernel.rows.displayed.indexOf(k(id)) >= 0;
  /** A field closed keeping its text (a blur, its row hidden, a page asked): kept, or refused (O1), or its row removed. */
  const leave = (keepIt: boolean) => {
    const ed0 = o.editor!;
    o.editor = null;
    if (!keepIt) return;
    const cell = ed0.cell;
    if (!held2(cell)) return void o.loud.push(WORDS.removed);
    const x = read(col(cell), ed0.text);
    if ('code' in x) o.refuse(cell), o.loud.push(WORDS.dropped(col(cell)));
    else o.commit([[cell, x.v]]);
  };
  const nextCell = (cell: string): string | null => {
    const D = g.kernel.rows.displayed;
    let ri = D.indexOf(k(idOfCell(cell)));
    let ci = EDITABLE.indexOf(col(cell)) + 1;
    if (ci >= EDITABLE.length) (ci = 0), ri++;
    if (ri >= D.count) return null;
    return `${idOf(D.keyAt(D.index(ri)!))}.${EDITABLE[ci]}`;
  };
  let lastHover: string | null = null;
  /** The grid was given the focus (by a cell opened): from then on it is never on the page. */
  let focused = false;

  const check = (step: string) => {
    if (errors.length > 4) return;
    o.idle();
    const ce = t.ctx.editor;
    const editing = ce ? `${idOf(ce.key)}.${ce.column}` : null;
    t.ctx.rowRenderer.forEach((key, v) => {
      for (const [c, cv] of v.cells) {
        if (!EDITABLE.includes(c)) continue;
        const cell = `${idOf(key)}.${c}`;
        if (cell === editing || !held2(cell)) continue;
        const text = fmt(o.value(cell));
        if (cv.el.textContent !== text) errors.push(`${seed}/${cfg} ${step}: ${cell} text "${cv.el.textContent}" want "${text}"`);
        const got = [...cv.el.classList].filter((x) => x.startsWith('dzg-cell--')).map((x) => x.slice(10)).sort().join(' ');
        const want = o.tokens(cell);
        if (got !== want) errors.push(`${seed}/${cfg} ${step}: ${cell} marks "${got}" want "${want}"`);
        const d = (cv.el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((x) => document.getElementById(x)?.textContent ?? '').filter((x) => x !== T['edit.rowStale']).join('|');
        const wd = o.desc(cell, T['edit.saving']!);
        if (d !== wd) errors.push(`${seed}/${cfg} ${step}: ${cell} described "${d}" want "${wd}"`);
      }
    });
    // The field.
    const f = t.field();
    if (!!f !== !!o.editor) errors.push(`${seed}/${cfg} ${step}: field ${f ? 'open' : 'closed'}, want ${o.editor ? `open on ${o.editor.cell}` : 'closed'}`);
    else if (f && o.editor) {
      if (editing !== o.editor.cell) errors.push(`${seed}/${cfg} ${step}: field on ${editing}, want ${o.editor.cell}`);
      if (f.value !== o.editor.text) errors.push(`${seed}/${cfg} ${step}: field "${f.value}" want "${o.editor.text}"`);
    }
    // The tooltip: shown only on a failed cell, with its reason; read once (never in the description).
    const tip = t.host.querySelector<HTMLElement>('.dzg-tooltip')!;
    const a = t.ctx.tip.anchor;
    if (!tip.hidden && a) {
      const row = a.closest('.dzg-row');
      const cell = row ? `${idOf(t.ctx.rowRenderer.keyOf(row)!)}.${a.dataset['col']}` : '?';
      const wt = o.failedText(cell);
      if (tip.textContent !== wt) errors.push(`${seed}/${cfg} ${step}: tooltip "${tip.textContent}" on ${cell}, want ${wt}`);
      if ((a.getAttribute('aria-describedby') ?? '').includes(tip.id)) errors.push(`${seed}/${cfg} ${step}: tooltip id in ${cell}'s description`);
    } else if (lastHover && step.includes('hover') && o.failedText(lastHover) && lastHover !== editing && mounted().includes(lastHover)) errors.push(`${seed}/${cfg} ${step}: no tooltip on failed ${lastHover}`);
    // The focus never on the page.
    if (focused && document.activeElement === document.body) errors.push(`${seed}/${cfg} ${step}: focus on body`);
    // The requests.
    const got = held.map((h) => h.req.changes.map((c) => `${idOf(c.key)}.${c.column}=${String(c.value)}`).join(','));
    const want = o.core.sent.map((s) => s.changes.map(([c, v]) => `${c}=${String(v)}`).join(','));
    if (got.join(' | ') !== want.join(' | ')) errors.push(`${seed}/${cfg} ${step}: requests ${got.join(' | ')} want ${want.join(' | ')}`);
  };

  for (let step = 0; step < steps && errors.length < 3; step++) {
    const x = r();
    let what = '';
    o.begin();
    const ms = mounted();
    if ((x < 0.16 || (x < 0.4 && !o.editor)) && !o.editor && ms.length) {
      const cell = pick(ms);
      const how = pick(['f2', 'char', 'dbl'] as const);
      what = `open ${cell} ${how}`;
      t.at(idOfCell(cell), col(cell));
      focused = true;
      const ch = col(cell) === 'name' ? 'x' : String(Math.floor(r() * 10));
      if (how === 'f2') t.key('F2');
      else if (how === 'char') t.key(ch);
      else t.cell(idOfCell(cell), col(cell))!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      o.editor = { cell, text: how === 'char' ? ch : openText(cell) };
    } else if (x < 0.26 && o.editor) {
      const text = pick(col(o.editor.cell) === 'name' ? TEXTS.name : TEXTS.num);
      what = `type "${text}"`;
      t.type(text);
      o.editor.text = text;
    } else if (x < 0.4 && o.editor) {
      const key = pick(['Enter', 'Enter', 'Tab', 'Escape', 'blur'] as const);
      const { cell, text } = o.editor;
      what = `${key} on ${cell}`;
      // Escape first dismisses a tooltip shown (WCAG 1.4.13), then gives the field up.
      if (key === 'Escape') {
        if (t.host.querySelector<HTMLElement>('.dzg-tooltip')!.hidden) o.editor = null;
        t.key('Escape', {}, t.field()!);
      }
      else if (key === 'blur') {
        outside.focus();
        vi.advanceTimersByTime(0);
        leave(true);
      } else {
        const rd = read(col(cell), text);
        const nx = key === 'Tab' ? nextCell(cell) : null;
        t.key(key, {}, t.field()!);
        if ('code' in rd) {
          o.refuse(cell);
          o.loud.push(WORDS.refused(col(cell), CODE(col(cell), rd.code)));
        } else {
          o.commit([[cell, rd.v]]);
          o.editor = nx ? { cell: nx, text: openText(nx) } : null;
        }
      }
    } else if (x < 0.56) {
      const open = held.map((h, i) => [h, i] as const).filter(([h]) => !h.done);
      if (open.length) {
        const [h, i] = pick(open);
        h.done = true;
        const cells = h.req.changes.map((c) => `${idOf(c.key)}.${c.column}`);
        const kind = pick(['ok', 'ok', 'reason', 'code', 'net', 'unknown', 'named'] as const);
        what = `answer #${i} ${kind}`;
        const refused = new Map<string, { why: string | null; code: string | null; net: boolean }>();
        if (kind === 'ok') h.ok();
        else if (kind === 'named') {
          const some = cells.filter(() => r() < 0.6);
          const named = some.length ? some : [cells[0]!];
          for (const c of named) refused.set(c, { why: 'part', code: null, net: false });
          h.no({ cells: named.map((c) => ({ key: idOfCell(c), column: col(c), reason: 'part' })) });
        } else {
          const err = kind === 'reason' ? { reason: 'no' } : kind === 'code' ? { code: 'required' } : kind === 'net' ? new TypeError('Failed to fetch') : new Error('500');
          for (const c of cells) refused.set(c, { why: kind === 'reason' ? 'no' : null, code: kind === 'code' ? 'required' : null, net: kind === 'net' });
          h.no(err);
        }
        await flushAll();
        o.settle(i, refused, held2);
      }
    } else if (x < 0.64) {
      const d = pick([100, 300, 499, 500, 600, 1000, 1500, 2000, 5000]);
      what = `time ${d}`;
      o.now += d;
      vi.advanceTimersByTime(d);
    } else if (x < 0.7 && cfg !== 'source') {
      const top = Math.floor(r() * 18) * 32;
      what = `scroll ${top}`;
      t.scroll(top);
    } else if (x < 0.76 && cfg === 'source') {
      const p = pick(['page', 'refresh', 'answer', 'answer'] as const);
      what = p;
      if (p === 'answer') {
        const ed0 = o.editor;
        await answerFetches();
        o.rowsChanged();
        // The field's row not in the answer: removed (said once).
        if (ed0 && o.editor && !held2(ed0.cell)) (o.editor = null), o.loud.push(WORDS.removed);
      } else if (p === 'page') {
        const i = Math.floor(r() * 3);
        what = `page ${i}`;
        const moves = g.kernel.rows.page!.index !== i;
        g.kernel.dispatch({ type: 'page.go', index: i }, 'api');
        if (moves && o.editor) leave(true);
      } else g.kernel.dispatch({ type: 'rows.refresh' }, 'api');
    } else if (x < 0.84) {
      const op = pick(['update', 'update', 'add', 'delete'] as const);
      const i = Math.floor(r() * data.length);
      const w = data[i]!;
      if (cfg === 'tree' && op !== 'update') continue;
      what = `${op} ${w.id}`;
      if (op === 'update') {
        const nw = give({ ...w, n: Math.floor(r() * 900) });
        data = data.map((y) => (y.id === w.id ? nw : y));
        if (cfg !== 'source') g.kernel.rows.applyTransaction({ update: [nw] as never });
      } else if (op === 'add') {
        const nw = give({ id: `r${nextId++}`, name: 'New', n: 1, s: '', q: 2 });
        data = [...data, nw];
        if (cfg !== 'source') g.kernel.rows.applyTransaction({ add: [nw] as never });
      } else {
        data = data.filter((y) => y.id !== w.id);
        if (cfg !== 'source') g.kernel.rows.applyTransaction({ remove: [w.id] });
      }
      if (cfg !== 'source') {
        o.rowsChanged();
        if (o.editor && !held2(o.editor.cell)) (o.editor = null), o.loud.push(WORDS.removed);
      }
    } else if (x < 0.88 && cfg === 'client') {
      const v = r() < 0.4 ? null : Math.floor(r() * 80);
      what = `filter ${v}`;
      g.kernel.dispatch({ type: 'filter.column', column: 'q', filter: v === null ? null : { type: 'number', op: 'gt', value: v } }, 'api');
      if (o.editor && !displayed(idOfCell(o.editor.cell))) leave(true);
    } else if (x < 0.88 && cfg === 'tree') {
      const p = `r${Math.floor(r() * 6) * 4}`;
      const open = !g.kernel.rows.isExpanded?.(k(p));
      what = `${open ? 'expand' : 'collapse'} ${p}`;
      g.kernel.dispatch({ type: 'rows.expand', rows: [k(p)], expanded: open }, 'api');
      if (o.editor && !displayed(idOfCell(o.editor.cell))) leave(true);
    } else if (x < 0.92) {
      const how = pick(['sort', 'reapply', 'mark'] as const);
      what = how;
      if (how === 'sort') {
        g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'api');
        // A server's query asked while open: kept and sent now (S7-O3).
        if (cfg === 'source' && o.editor) leave(true);
      }
      else if (how === 'reapply') t.api.reapply();
      else {
        const b = t.host.querySelector<HTMLElement>('.dzg-reapply');
        if (b && !o.editor) b.click();
      }
      if (cfg === 'source') {
        await answerFetches();
        o.rowsChanged();
        if (o.editor && !held2(o.editor.cell)) (o.editor = null), o.loud.push(WORDS.removed);
      }
      if (o.editor && !displayed(idOfCell(o.editor.cell))) leave(true);
    } else if (x < 0.96) {
      const dir = pick(['undo', 'redo'] as const);
      what = dir;
      o.move(dir, held2);
      if (dir === 'undo') t.api.undo();
      else t.api.redo();
    } else if (ms.length) {
      // Mostly a failed cell (its reason's tooltip), else any.
      const bad = ms.filter((c) => o.core.status(c) === 'failed');
      const cell = bad.length && r() < 0.7 ? pick(bad) : pick(ms);
      what = `hover ${cell}`;
      lastHover = cell;
      t.cell(idOfCell(cell), col(cell))!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
      o.now += 600;
      vi.advanceTimersByTime(600);
    }
    await flushAll();
    if (STATS) {
      STATS[what.split(' ')[0] || 'none'] = (STATS[what.split(' ')[0] || 'none'] ?? 0) + 1;
      if (!t.host.querySelector<HTMLElement>('.dzg-tooltip')!.hidden) STATS['tip shown'] = (STATS['tip shown'] ?? 0) + 1;
      if (t.host.querySelector('.dzg-cell--failed')) STATS['failed mark'] = (STATS['failed mark'] ?? 0) + 1;
    }
    check(`${step} ${what}`);
  }
  // The sentences, once their queue has run.
  vi.advanceTimersByTime(20_000);
  if (STATS) for (const x of said) STATS[`said ${x.replace(/^[^:]*: /, '').slice(0, 22)}`] = (STATS[`said ${x.replace(/^[^:]*: /, '').slice(0, 22)}`] ?? 0) + 1;
  if (said.join(' / ') !== o.loud.join(' / ')) errors.push(`${seed}/${cfg} sentences ${JSON.stringify(said)} want ${JSON.stringify(o.loud)}`);
  for (const [w, copy] of given) if (JSON.stringify(w) !== copy) errors.push(`${seed}/${cfg}: a row given to the grid was written: ${copy} → ${JSON.stringify(w)}`);
  g.destroy();
  cleanup();
  return errors;
}

/** S7_STATS=<file>: what the walk did, counted (to see that it reaches every path). */
const STATS: Record<string, number> | null = process.env['S7_STATS'] ? {} : null;
const SEEDS = Number(process.env['PERMS'] ?? 0) >= 1000 ? 1000 : 300;
const CFGS: Cfg[] = ['client', 'source', 'tree'];

describe('the saves walk (client, server pages, tree)', () => {
  it(`${SEEDS} seeds: every mounted cell, the field, the tooltip, the focus, the requests and the sentences as the oracle says`, async () => {
    const errors: string[] = [];
    for (let seed = 1; seed <= SEEDS && errors.length < 5; seed++) errors.push(...(await walk(seed * 2654435761, CFGS[seed % 3]!)));
    if (STATS) appendFileSync(process.env['S7_STATS']!, JSON.stringify(STATS, null, 1));
    expect(errors).toEqual([]);
  }, 600_000);
});
