// The paste against an oracle written by hand (Phase 5 step 11b, step11b-plan.md « Tests to write FIRST » 1;
// docs/behaviors/clipboard.md 14–22, 25–26; owner Q9, QB4, QB6, S3-O2, S5-O5): through the REAL `edit()` with a
// recording save. Random rows shown (flat, a tree with a structure column, a path tree's fillers, details, a page),
// random visible columns of every type and rule, a random block or a focused cell, a random clipboard drawn from
// per-type tables (text → value | refusal code) written by hand from the sheet's paste table, sometimes ragged,
// sometimes our own copy (the memo), sometimes over a lowered `maxPaste`. The oracle tiles, counts and judges each cell
// by itself (never `planPaste`): at most one request, its changes; the sentence (joined with « Saving »); the blinked
// cells; the block after; a server naming some cells (S3-O2); one undo gives every value back.
// `PASTE_DOM_RUNS` (default 300; 3 000 once, step11b-plan « Done »), `PASTE_DOM_SEED` replays one seed.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isDataKey } from '@dzgrid/core/internal';
import { dataKey, type ColumnDef, type RowKey } from '@dzgrid/core';
import type { SaveRequest } from '@dzgrid/core/edit';
import { encodeTsv } from '@dzgrid/core/range';
import { definePart } from '../src/part.js';
import { detail } from '../src/detail.js';
import { pagination } from '../src/pagination.js';
import { tree } from '../src/tree.js';
import { msg } from '../src/messages.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { FR_DETAIL } from '../src/locales/fr-detail.js';
import { AR_DETAIL } from '../src/locales/ar-detail.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { FR_TREE } from '../src/locales/fr-tree.js';
import { AR_TREE } from '../src/locales/ar-tree.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import { FR_PAGINATION } from '../src/locales/fr-pagination.js';
import { AR_PAGINATION } from '../src/locales/ar-pagination.js';
import { CMSG, cleanup, clip, cmake, flush, join, type C } from './support-clip.js';

afterEach(cleanup);

type Lang = 'en' | 'fr' | 'ar';
type P = C & { parent: string | null; path: string[]; tx: string; nolim: string; req: string };
type Kind = 'text' | 'number' | 'day' | 'instant' | 'enum' | 'boolean';
/** A refusal's code, else the value kept. */
type Out = { readonly code: string } | { readonly v: unknown };
const V = (v: unknown): Out => ({ v });
const NO = (code: string): Out => ({ code });
const RLM = String.fromCharCode(0x200f);
const LONG = 'x'.repeat(1001);
const AT = Date.parse('2026-03-05T22:59:00Z');

// The tables, by hand from clipboard.md (the paste table, 18–19). [text, outcome] per type and language.
const TEXT: [string, Out][] = [['abc', V('abc')], ["'=1+1", V('=1+1')], ['="0123"', V('0123')], ["''=x", V("'=x")], ['a\tb', V('a\tb')], ['l1\nl2', V('l1\nl2')], ['5" inch', V('5" inch')], [`${RLM}محمد`, V(`${RLM}محمد`)], ['', V(null)], [LONG, V(LONG)], ['abcdef', V('abcdef')], ['="a1"', V('="a1"')]];
const NUMBER: Record<Lang, [string, Out][]> = {
  en: [['12', V(12)], ['1,234.50', V(1234.5)], ['$1,234.50', V(1234.5)], ['-$1,234.50', V(-1234.5)], ['1,5', NO('parse')], ['(1 234)', NO('parse')], ['SKU 100', NO('parse')], ['100 PCS', NO('parse')], ["'=1+1", NO('parse')], ['', V(null)], ['0', V(0)]],
  fr: [['12', V(12)], ['1 234,50', V(1234.5)], ['1 234,50 €', V(1234.5)], ['1 234,50 DZD', V(1234.5)], ['(1 234)', NO('parse')], ['-3', V(-3)], ['', V(null)]],
  ar: [['١٢٫٥', V(12.5)], [`${RLM}-1.234,50 د.ج.${RLM}`, V(-1234.5)], ['12', V(12)], ['', V(null)]],
};
const DAY: Record<Lang, [string, Out][]> = {
  en: [['2026-03-05', V('2026-03-05')], ['2026-03-05 00:00:00', V('2026-03-05')], ['5-Mar-2026', NO('day')], ['46086', NO('day')], ['3/5/2026', V('2026-03-05')], ['', V(null)]],
  fr: [['2026-03-05', V('2026-03-05')], ['2026-03-05 00:00:00', V('2026-03-05')], ['5-Mar-2026', NO('day')], ['05/03/2026', V('2026-03-05')], ['', V(null)]],
  ar: [['2026-03-05', V('2026-03-05')], ['2026-03-05 00:00:00', V('2026-03-05')], ['46086', NO('day')], ['', V(null)]],
};
const INSTANT: [string, Out][] = [['2026-03-05 23:59:00', V(AT)], ['x', NO('invalid-instant')], ['', V(null)]];
const ENUM: [string, Out][] = [['Rupture', V('out')], ['In stock', V('in')], ['nope', NO('options')], ['', V(null)]];
const BOOL: Record<Lang, [string, Out][]> = {
  en: [['true', V(true)], ['false', V(false)], ['', V(null)]],
  fr: [['VRAI', V(true)], ['faux', V(false)], ['', V(null)]],
  ar: [['نعم', V(true)], ['', V(null)]],
};
const table = (kind: Kind, lang: Lang): [string, Out][] =>
  kind === 'text' ? TEXT : kind === 'number' ? NUMBER[lang] : kind === 'day' ? DAY[lang] : kind === 'instant' ? INSTANT : kind === 'enum' ? ENUM : BOOL[lang];

/** The column pool: the type, the rules, the cap (S5-O5), editable or not. */
interface Spec { readonly id: string; readonly kind: Kind; readonly min?: number; readonly required?: boolean; readonly cap: number; readonly ro?: boolean }
const POOL: Spec[] = [
  { id: 'name', kind: 'text', cap: 1000 }, { id: 'tx', kind: 'text', cap: 5 }, { id: 'nolim', kind: 'text', cap: Infinity }, { id: 'req', kind: 'text', required: true, cap: 1000 },
  { id: 'qty', kind: 'number', min: 0, cap: 1000 }, { id: 'price', kind: 'number', cap: 1000 }, { id: 'day', kind: 'day', cap: 1000 }, { id: 'at', kind: 'instant', cap: 1000 },
  { id: 'st', kind: 'enum', cap: 1000 }, { id: 'ok', kind: 'boolean', cap: 1000 }, { id: 'ref', kind: 'text', cap: 1000, ro: true },
];
const defOf = (s: Spec): ColumnDef<P, any> => ({
  id: s.id, header: s.id, width: 40, ...(s.kind !== 'text' && { type: s.kind }), ...(!s.ro && { editable: true }),
  ...(s.id === 'tx' && { edit: { maxLength: 5 } }), ...(s.id === 'nolim' && { edit: { maxLength: 0 } }), ...(s.required && { edit: { required: true } }), ...(s.min !== undefined && { edit: { min: s.min } }),
  ...(s.kind === 'enum' && { enumOptions: [{ value: 'in', label: 'In stock' }, { value: 'out', label: 'Rupture' }] }),
});

function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return { next, int, pick: <X>(xs: readonly X[]): X => xs[int(xs.length)]!, chance: (p: number) => next() < p };
}

const panel = definePart('detail', { mount: (host) => (host.append('panel'), { update() {}, destroy() {} }) });
const BUNDLES = { en: [EN_DETAIL, EN_TREE, EN_PAGINATION], fr: [FR_DETAIL, FR_TREE, FR_PAGINATION], ar: [AR_DETAIL, AR_TREE, AR_PAGINATION] } as const;

/** What the seeds reached, so the suite cannot pass by never meeting a case. */
const hit: Record<string, number> = {};
const saw = (k: string, on: unknown) => void (on && (hit[k] = (hit[k] ?? 0) + 1));

async function run(seed: number): Promise<void> {
  const r = rng(seed);
  const lang = r.pick<Lang>(['en', 'fr', 'ar']);
  const shape = r.pick(['flat', 'tree', 'path', 'detail', 'page'] as const);
  // Columns: 2 to 7 visible from the pool, sometimes one hidden; the tree's structure column, the path tree's own.
  const pool = [...POOL].sort(() => r.next() - 0.5);
  let specs = pool.slice(0, 2 + r.int(6));
  if (shape === 'path' && !specs.some((s) => s.id === 'name')) specs = [POOL[0]!, ...specs];
  const hidden = r.chance(0.3) ? pool.find((s) => !specs.includes(s)) : undefined;
  const parentSpec: Spec = { id: 'parent', kind: 'text', cap: 1000, ro: true };
  if (shape === 'tree') specs.splice(r.int(specs.length + 1), 0, parentSpec);
  // The path tree's column is read-only (followed); the oracle says so by hand.
  if (shape === 'path') specs = specs.map((s) => (s.id === 'name' ? { ...s, ro: true } : s));
  const defs: ColumnDef<P, any>[] = [...specs.map((s) => (s.id === 'parent' ? { id: 'parent', header: 'parent', width: 40, editable: true, value: (x: P) => x.parent ?? '' } : defOf(s))), ...(hidden ? [{ ...defOf(hidden), hidden: true }] : [])];
  const visible = specs;
  // Rows.
  const N = 14;
  const rows: P[] = Array.from({ length: N }, (_, i) => ({
    id: `r${i}`, name: `n${i}`, tx: 'abc', nolim: 'z', req: `q${i}`, qty: i, price: i + 0.25, day: '2026-03-01', at: AT as never, st: i % 2 ? 'out' : 'in', ok: i % 2 === 0, code: '', ref: `R${i}`,
    parent: shape === 'tree' && i % 4 ? `r${i - (i % 4)}` : null,
    path: i % 5 === 3 ? ['g', `x${i}`, `leaf${i}`] : [`p${i}`],
  }));
  const maxPaste = r.chance(0.2) ? 2 + r.int(20) : undefined;
  const requests: SaveRequest<P>[] = [];
  const answers: { req: SaveRequest<P>; ok: () => void; no: (e: unknown) => void }[] = [];
  const extra = shape === 'tree' ? [tree<P>({ parentId: (x) => x.parent, structure: ['parent'] })]
    : shape === 'path' ? [tree<P>({ path: (x) => x.path, column: 'name' })]
    : shape === 'detail' ? [detail<P>({ part: panel, height: 60 })]
    : shape === 'page' ? [pagination()] : [];
  const t = cmake({
    rows: rows as never, columns: defs as never, lang, ...(maxPaste !== undefined && { range: { maxPaste } }), extra: extra as never, block: 2000,
    save: (req) => new Promise<void>((ok, no) => void answers.push({ req: req as never, ok, no })),
    settings: { messages: join(CMSG[lang], ...BUNDLES[lang]), ...(shape === 'page' && { pagination: { pageSize: 6 } }) } as never,
  });
  const k = t.g.kernel;
  if (shape === 'tree') k.dispatch({ type: 'rows.expand', rows: rows.filter((x) => !x.parent && r.chance(0.7)).map((x) => dataKey(x.id)!), expanded: true }, 'api');
  if (shape === 'path') k.dispatch({ type: 'rows.expandAll', expanded: true }, 'api');
  if (shape === 'detail') k.dispatch({ type: 'rows.expand', rows: rows.filter(() => r.chance(0.4)).map((x) => dataKey(x.id)!), expanded: true }, 'api');
  if (shape === 'page') k.dispatch({ type: 'page.go', index: r.int(3) }, 'api');
  const d = k.rows.displayed;
  const kinds = Array.from({ length: d.count }, (_, i) => d.nodeAt(d.index(i)!).kind);
  const keys = Array.from({ length: d.count }, (_, i) => d.keyAt(d.index(i)!));
  const dataIdx = kinds.flatMap((x, i) => (x === 'data' ? [i] : []));
  if (!dataIdx.length) return;
  const idOf = (key: RowKey) => String(key).replace(/^d:\d+:/, '');
  const byId = new Map(rows.map((x) => [x.id, x]));
  // The oracle's model: each cell's value as shown (the initial data, canonical).
  const model = new Map<string, unknown>();
  const cellId = (key: RowKey, col: string) => `${idOf(key)}/${col}`;
  for (const x of rows) for (const s of POOL) model.set(`${x.id}/${s.id}`, (x as never)[s.id]);
  const before = new Map(model);

  // The target: a focused data cell, or a block whose corners may rest on any shown row.
  const c0 = r.int(visible.length);
  const focusRow = r.pick(dataIdx);
  t.at(idOf(keys[focusRow]!), visible[c0]!.id);
  let box = { top: focusRow, bottom: focusRow, start: c0, end: c0 };
  if (r.chance(0.5)) {
    const a = r.int(d.count), b = r.int(d.count), ca = r.int(visible.length), cb = r.int(visible.length);
    const ok = t.api().set({ anchor: { row: keys[a]!, column: visible[ca]!.id }, focus: { row: keys[b]!, column: visible[cb]!.id } });
    expect(ok).toBe(true);
    if (t.api().get()) box = { top: Math.min(a, b), bottom: Math.max(a, b), start: Math.min(ca, cb), end: Math.max(ca, cb) };
  }
  const blockBefore = t.block();

  // The clipboard: our own copy (the memo), or a matrix drawn from the tables.
  let text: string;
  let memo: { values: unknown[][]; kinds: Kind[]; cols: string[] } | null = null;
  let src: string[][];
  const inside = dataIdx.filter((i) => i >= box.top && i <= box.bottom).length;
  const cols = box.end - box.start + 1;
  if (r.chance(0.2) && !t.api().get()) {
    // Copy a block at the focused cell's column (another row), paste it on the focused cell: every landing column the copied one's.
    const from = r.pick(dataIdx);
    const h = 1 + r.int(3);
    const w = 1 + r.int(Math.min(3, visible.length - c0));
    const rowsC = dataIdx.filter((i) => i >= from).slice(0, h);
    t.at(idOf(keys[rowsC[0]!]!), visible[c0]!.id);
    if (rowsC.length * w > 1) t.api().set({ anchor: { row: keys[rowsC[0]!]!, column: visible[c0]!.id }, focus: { row: keys[rowsC.at(-1)!]!, column: visible[c0 + w - 1]!.id } });
    text = clip('copy').text!;
    memo = { values: rowsC.map((i) => visible.slice(c0, c0 + w).map((s) => model.get(cellId(keys[i]!, s.id)) ?? null)), kinds: visible.slice(c0, c0 + w).map((s) => s.kind), cols: visible.slice(c0, c0 + w).map((s) => s.id) };
    src = memo.values.map((row) => row.map(() => ''));
    t.at(idOf(keys[focusRow]!), visible[c0]!.id);
    box = { top: focusRow, bottom: focusRow, start: c0, end: c0 };
    t.requests.length = 0;
  } else {
    const h = 1 + r.int(4);
    const w = 1 + r.int(4);
    const tile = inside > 0 && inside % h === 0 && cols % w === 0;
    const W = tile ? cols : w;
    const wide = Math.min(W, visible.length - box.start);
    src = Array.from({ length: h }, () => Array.from({ length: w }, (_, j) => {
      const land = visible.slice(box.start, box.start + wide).filter((_, c) => c % w === j);
      const one = land.length && land.every((s) => s.kind === land[0]!.kind) ? land[0]!.kind : null;
      return one ? r.pick(table(one, lang))[0] : '';
    }));
    // Ragged: a row's last cells left out (read as empty); the first row whole, so the source keeps the width its texts
    // were drawn for (seed 317 of 3 000 trimmed every row: a text column's text landed in an instant column).
    if (r.chance(0.25)) src.forEach((row, i) => void (i && row.length > 1 && r.chance(0.5) && (row.length = 1 + r.int(row.length - 1))));
    text = encodeTsv(src);
    if (!src.some((row) => row.some((x) => x !== ''))) text = r.chance(0.5) ? text : '';
  }
  // Fill the source with what the memo text would give for the ragged / empty reasoning below.
  const h = src.length;
  const w = Math.max(...src.map((row) => row.length));

  // ---- The oracle (clipboard.md 14–21, by hand) ----
  const tile = inside > 0 && inside % h === 0 && cols % w === 0;
  const H = tile ? inside : h;
  const W = tile ? cols : w;
  const written = dataIdx.filter((i) => i >= box.top).slice(0, H);
  const wide = Math.min(W, visible.length - box.start);
  const planned = written.length * wide;
  const max = maxPaste ?? 100_000;
  const empty = text === '';
  const tooBig = !empty && planned > max;
  const outside = H * W - planned;
  let readOnly = 0, refused = 0, tooLong = 0;
  const accepted: { key: RowKey; column: string; value: unknown; previous: unknown }[] = [];
  const blink: string[] = [];
  const isRo = (s: Spec) => !!s.ro;
  if (!empty && !tooBig) {
    for (let ri = 0; ri < written.length; ri++) {
      for (let c = 0; c < wide; c++) {
        const s = visible[box.start + c]!;
        const key = keys[written[ri]!]!;
        const si = ri % h, sj = c % w;
        let out: Out;
        let str: string | null;
        if (memo && memo.kinds[sj] === s.kind && (s.kind !== 'enum' || memo.cols[sj] === s.id)) {
          const v = memo.values[si]![sj];
          out = V(v ?? null);
          str = typeof v === 'string' ? v : null;
        } else {
          const raw = memo ? '' : src[si]![sj] ?? '';
          const row = table(s.kind, lang).find(([x]) => x === raw) ?? (raw === '' ? ['', V(null)] as [string, Out] : null);
          if (!row) throw new Error(`seed ${seed}: no outcome for ${JSON.stringify(raw)} in ${s.kind}`);
          out = row[1];
          str = s.kind === 'text' && 'v' in out && typeof out.v === 'string' ? out.v : null;
        }
        if (str !== null && str.length > s.cap) { tooLong++; continue; }
        if (isRo(s)) { readOnly++; continue; }
        if ('v' in out && out.v === null && s.required) out = NO('required');
        if ('v' in out && typeof out.v === 'number' && s.min !== undefined && out.v < s.min) out = NO('min');
        if ('code' in out) {
          refused++;
          if (t.cell(idOf(key), s.id)) blink.push(cellId(key, s.id));
          continue;
        }
        const prev = model.get(cellId(key, s.id)) ?? null;
        if (prev !== out.v) accepted.push({ key, column: s.id, value: out.v, previous: prev });
      }
    }
  }
  const pasted = planned - readOnly - refused - tooLong;
  const m = t.ctx.settings.messages;
  const ours = tooBig ? msg(m, 'range.tooBig', { max }) : [msg(m, 'range.pasted', { n: pasted }), ...(['refused', 'readOnly', 'tooLong', 'outside'] as const).filter((x) => ({ refused, readOnly, tooLong, outside })[x]).map((x) => msg(m, `range.${x}`, { n: ({ refused, readOnly, tooLong, outside })[x] }))].join('');
  const sentence = empty ? null : accepted.length ? `${ours}. ${msg(m, 'edit.saving')}` : ours;

  saw(shape, true); saw('accepted', accepted.length); saw('refused', refused); saw('readOnly', readOnly); saw('tooLong', tooLong); saw('outside', outside); saw('tooBig', tooBig);
  saw('memo', memo); saw('tile', tile && (H > h || W > w)); saw('block', t.api().get()); saw('empty', empty); saw('non-data in box', kinds.slice(box.top, box.bottom + 1).some((x) => x !== 'data'));
  // ---- The paste ----
  const said0 = t.said().length;
  const viaApi = r.chance(0.3);
  if (viaApi) {
    const counts = t.api().paste(text);
    if (!empty) expect(counts, `seed ${seed}`).toEqual({ pasted: tooBig ? 0 : pasted, refused: tooBig ? 0 : refused, readOnly: tooBig ? 0 : readOnly, tooLong: tooBig ? 0 : tooLong, outside: tooBig ? 0 : outside, tooBig });
  } else expect(clip('paste', { 'text/plain': text }).e.defaultPrevented, `seed ${seed}`).toBe(true);
  await flush();
  // The saving sentence asked first is replaced, not yet said, by the joined one (LiveRegion: a newer sentence wins).
  const said = t.said().slice(said0).filter((x) => x !== msg(m, 'edit.saving'));
  expect(said, `seed ${seed} said`).toEqual(sentence ? [sentence] : []);
  expect(t.requests.length, `seed ${seed} requests`).toBe(accepted.length ? 1 : 0);
  if (accepted.length) {
    const req = t.requests[0]!;
    expect(req.origin).toBe('paste');
    expect(req.changes.map((c) => ({ key: c.key, column: c.column, value: c.value, previous: c.previous })), `seed ${seed} changes`).toEqual(accepted);
    for (const c of req.changes) expect(isDataKey(c.key)).toBe(true);
  }
  expect(t.blinked().sort(), `seed ${seed} blink`).toEqual(blink.sort());
  // The block after: the block written (two cells at least), else none; unchanged when nothing was written.
  if (empty || tooBig) expect(t.block(), `seed ${seed} block`).toBe(blockBefore);
  else {
    const two = planned >= 2;
    const want = two ? `${idOf(keys[written[0]!]!)}/${visible[box.start]!.id}:${idOf(keys[written.at(-1)!]!)}/${visible[box.start + wide - 1]!.id}` : null;
    expect(t.block(), `seed ${seed} block`).toBe(want);
  }
  // The server's answer: sometimes it names some cells (S3-O2), refused alone; the others kept.
  if (answers.length) {
    const a = answers[0]!;
    const named = a.req.changes.filter(() => r.chance(0.3));
    saw('server names cells', named.length);
    if (named.length) a.no({ cells: named.map((c) => ({ key: c.key, column: c.column })) });
    else a.ok();
    await flush();
    await new Promise((x) => setTimeout(x, 0));
    for (const c of accepted) if (!named.some((n) => n.key === c.key && n.column === c.column)) model.set(cellId(c.key, c.column), c.value);
  }
  const shown = (id: string, col: string) => {
    const colm = t.ctx.columns.get(col)!;
    const data = byId.get(id)!;
    const reader = k.reader;
    const v = reader.overlay ? reader.value(colm as never, data as never, id) : colm.read(data as never);
    return v === undefined || v === '' ? null : v;
  };
  const canon = (v: unknown) => (v === undefined || v === '' ? null : v);
  for (const [cid, v] of model) {
    const [id, col] = cid.split('/') as [string, string];
    if (!visible.some((s) => s.id === col) || col === 'parent') continue;
    const got = shown(id, col);
    const want = col === 'at' && typeof got === 'string' ? got : canon(v);
    expect(col === 'at' && typeof got === 'string' ? Date.parse(got) : canon(got), `seed ${seed} ${cid}`).toEqual(col === 'at' && typeof want === 'string' ? Date.parse(want) : want);
  }
  // One undo gives every value back.
  if (t.edits!.canUndo) {
    t.edits!.undo();
    for (const x of answers.slice(1)) x.ok();
    await flush();
    for (const x of answers.slice(1)) x.ok();
  }
  for (const [cid, v] of before) {
    const [id, col] = cid.split('/') as [string, string];
    if (!visible.some((s) => s.id === col) || col === 'parent') continue;
    const got = shown(id, col);
    expect(col === 'at' && typeof got === 'string' ? Date.parse(got) : canon(got), `seed ${seed} undo ${cid}`).toEqual(canon(v));
  }
  void byId;
}

describe('paste: random pastes against the oracle (clipboard.md 14–22)', () => {
  const runs = Number(process.env['PASTE_DOM_RUNS'] ?? 300);
  const one = process.env['PASTE_DOM_SEED'];
  it(`${one ? `seed ${one}` : `${runs} seeds`}: one request, the changes, the counts and the sentence, the blinks, the block, S3-O2, one undo`, { timeout: 600_000 }, async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const seed of one ? [Number(one)] : Array.from({ length: runs }, (_, i) => i + 1)) {
      await run(seed);
      cleanup();
    }
    if (!one && runs >= 100) for (const k of ['flat', 'tree', 'path', 'detail', 'page', 'accepted', 'refused', 'readOnly', 'tooLong', 'outside', 'tooBig', 'memo', 'tile', 'block', 'empty', 'non-data in box', 'server names cells']) expect(hit[k] ?? 0, k).toBeGreaterThan(2);
  });
});
