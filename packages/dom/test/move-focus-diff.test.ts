// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { sameFocus } from '@dzgrid/core/internal';
import { dataKey, intentFor, type FocusPos, type Intent, type KeyOwner, type RowKey } from '@dzgrid/core';
import { moveFocus, type Goal, type MoveShape } from '../src/keys/move.js';

/**
 * Differential: the keydown pipeline before step 9b (the router's own apply()
 * and its ArrowUp-on-a-header shortcut, copied from HEAD~1) against the one
 * after (moveFocus with a remembered goal), over random grid shapes and random
 * key sequences, without spans. Every key must land on the same focus.
 */

const k = (s: string): RowKey => dataKey(s)!;
type Rows = MoveShape['rows'];
function rowsOf(keys: readonly RowKey[]): Rows {
  return {
    count: keys.length,
    index: (i: number) => (Number.isInteger(i) && i >= 0 && i < keys.length ? (i as never) : null),
    keyAt: (i) => keys[i as unknown as number]!,
    indexOf: (key) => keys.indexOf(key) as never,
  };
}

// ---- the oracle: HEAD~1 packages/dom/src/keys/router.ts, apply() for move/edge/page, verbatim but for the context ----
type Out = FocusPos | 'checkBox' | null;
interface OldShape { d: Rows; cols: readonly string[]; page: number; headerRows: number; checkBox: boolean }
function oldApply(s: OldShape, from: FocusPos, intent: Intent): Out {
  const d = s.d;
  const cols = s.cols.map((id) => ({ id }));
  const ci = Math.max(0, cols.findIndex((c) => c.id === from.column));
  const ri = from.kind === 'cell' ? d.indexOf(from.row) : -1;
  const lastRow = d.count - 1;
  const page = s.page;
  const colAt = (i: number) => cols[Math.max(0, Math.min(cols.length - 1, i))]!.id;
  const header = (column: string, level?: number): FocusPos => (level ? { kind: 'header', column, level } : { kind: 'header', column });
  const cell = (r: number, c: number): FocusPos | null => (lastRow < 0 ? header(colAt(c), from.kind === 'header' ? from.level : undefined) : { kind: 'cell', row: d.keyAt(d.index(Math.max(0, Math.min(lastRow, r)))!), column: colAt(c) });
  let to: FocusPos | null = null;
  switch (intent.kind) {
    case 'move':
      if (intent.axis === 'row' && from.kind === 'header' && (from.level ?? 0) < s.headerRows) {
        to = { kind: 'header', column: from.column, level: (from.level ?? 0) + 1 };
        break;
      }
      if (intent.axis === 'row' && from.kind === 'cell' && ri === 0 && intent.delta < 0 && s.headerRows) {
        to = { kind: 'header', column: from.column, level: s.headerRows };
        break;
      }
      if (intent.axis === 'col' && from.kind === 'header' && !from.level && ci === 0 && intent.delta < 0 && s.checkBox) return 'checkBox';
      if (intent.axis === 'col') to = from.kind === 'header' ? header(colAt(ci + intent.delta), from.level) : cell(ri, ci + intent.delta);
      else if (from.kind === 'header') to = cell(0, ci);
      else to = ri + intent.delta < 0 ? { kind: 'header', column: colAt(ci) } : cell(ri + intent.delta, ci);
      break;
    case 'edge': {
      const c = intent.axis === 'row' ? ci : intent.to === 'first' ? 0 : cols.length - 1;
      if (intent.axis === 'col' && from.kind === 'header') to = header(colAt(c), from.level);
      else to = cell(intent.axis === 'col' ? ri : intent.to === 'first' ? 0 : lastRow, c);
      break;
    }
    case 'page':
      to = from.kind === 'header' ? cell(page - 1, ci) : cell(ri + intent.delta * page, ci);
      break;
    default:
      return null;
  }
  return to;
}

// ---- a seeded generator ----
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <X>(xs: readonly X[]) => xs[Math.floor(next() * xs.length)]! };
}

const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'] as const;

interface World { all: RowKey[]; rows: RowKey[]; cols: string[]; allCols: string[]; extras: number; checkBox: boolean; page: number; dir: 'ltr' | 'rtl'; mac: boolean }

function randomWorld(r: ReturnType<typeof rng>): World {
  const n = r.pick([0, 1, 2, 3, 7, 40]);
  const all = Array.from({ length: n }, (_, i) => k(`r${i}`));
  const nc = 1 + r.int(7);
  const allCols = Array.from({ length: nc }, (_, i) => `c${i}`);
  return {
    all, rows: all.filter(() => r.next() > 0.15), allCols, cols: allCols.filter((_, i) => i === 0 || r.next() > 0.2),
    extras: r.pick([0, 0, 1, 2]), checkBox: r.next() > 0.5, page: 1 + r.int(12), dir: r.next() > 0.5 ? 'rtl' : 'ltr', mac: r.next() > 0.5,
  };
}

/** Focus as the grid would hold it: in the shape's rows, columns and header levels (or stale on purpose). */
function randomFocus(r: ReturnType<typeof rng>, w: World): FocusPos {
  const col = r.next() > 0.1 ? r.pick(w.cols) : r.pick(w.allCols);
  if (w.all.length && r.next() > 0.3) return { kind: 'cell', row: r.next() > 0.1 && w.rows.length ? r.pick(w.rows) : r.pick(w.all), column: col };
  const level = r.int(w.extras + 1);
  return level ? { kind: 'header', column: col, level } : { kind: 'header', column: col };
}

type State = FocusPos | 'checkBox';

/** The select-all box's own keys: unchanged by the commit, shared by both pipelines. */
function fromCheckBox(w: World, key: string, mods: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): State {
  const step = intentFor({ key, ...mods }, { dir: w.dir, owner: 'header', mac: w.mac });
  const first = w.cols[0]!;
  if (step?.kind === 'move' && step.delta > 0) {
    const down: FocusPos = w.extras ? { kind: 'header', column: first, level: 1 } : w.rows.length ? { kind: 'cell', row: w.rows[0]!, column: first } : { kind: 'header', column: first };
    return step.axis === 'row' ? down : { kind: 'header', column: first };
  }
  return 'checkBox';
}

function shapeOf(w: World): MoveShape {
  return { rows: rowsOf(w.rows), cols: w.cols, page: w.page, bands: 0, extras: w.extras, checkBox: w.checkBox };
}

function oldKey(w: World, at: State, key: string, mods: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): State {
  if (at === 'checkBox') return fromCheckBox(w, key, mods);
  const owner: KeyOwner = at.kind;
  if (owner === 'header' && key === 'ArrowUp' && !mods.altKey && !mods.ctrlKey && !mods.metaKey && !mods.shiftKey && at.kind === 'header' && (at.level ?? 0) > 0) {
    return at.level === 1 ? { kind: 'header', column: at.column } : { kind: 'header', column: at.column, level: at.level! - 1 };
  }
  const intent = intentFor({ key, ...mods }, { dir: w.dir, owner, mac: w.mac });
  if (!intent) return at;
  const to = oldApply({ d: rowsOf(w.rows), cols: w.cols, page: w.page, headerRows: w.extras, checkBox: w.checkBox }, at, intent);
  return to ?? at;
}

function newKeys() {
  let goal: Goal | null = null;
  let set: FocusPos | null = null;
  return (w: World, at: State, key: string, mods: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): State => {
    if (at === 'checkBox') return fromCheckBox(w, key, mods);
    const move = (from: FocusPos, intent: Intent): State => {
      if (!sameFocus(at, set)) goal = null;
      const m = moveFocus(null, shapeOf(w), from, goal, intent);
      if (!m) return at;
      goal = m.goal;
      if (m.to !== 'checkBox') set = m.to;
      return m.to;
    };
    const owner: KeyOwner = at.kind;
    if (owner === 'header' && key === 'ArrowUp' && !mods.altKey && !mods.ctrlKey && !mods.metaKey && !mods.shiftKey && at.kind === 'header' && (at.level ?? 0) > -0) {
      return move(at, { kind: 'move', axis: 'row', delta: -1 });
    }
    const intent = intentFor({ key, ...mods }, { dir: w.dir, owner, mac: w.mac });
    if (!intent) return at;
    if (intent.kind !== 'move' && intent.kind !== 'edge' && intent.kind !== 'page') return at;
    return move(at, intent);
  };
}

const show = (s: State) => (s === 'checkBox' ? 'checkBox' : JSON.stringify(s));

describe('moveFocus + router against the router before step 9b, without spans', () => {
  it('lands on the same focus for every key of 3000 random grids and sequences', () => {
    let keys = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const r = rng(seed);
      let w = randomWorld(r);
      let a: State = randomFocus(r, w);
      let b: State = a;
      const step = newKeys();
      for (let i = 0; i < 40; i++) {
        const roll = r.next();
        if (roll < 0.05) {
          // The host or a click moves the focus: both pipelines start from it.
          a = b = randomFocus(r, w);
          continue;
        }
        if (roll < 0.08) {
          // Rows filtered or columns hidden between two keys (the focus kept as it was).
          w = { ...w, rows: w.all.filter(() => r.next() > 0.3), cols: w.allCols.filter((_, j) => j === 0 || r.next() > 0.3) };
          continue;
        }
        const key = r.pick(KEYS);
        const mods = { ctrlKey: r.next() < 0.15, metaKey: r.next() < 0.15, shiftKey: r.next() < 0.05, altKey: r.next() < 0.03 };
        const before = show(a);
        a = oldKey(w, a, key, mods);
        b = step(w, b, key, mods);
        keys++;
        if (show(a) !== show(b)) {
          throw new Error(`seed ${seed}, key ${i} ${key} ${JSON.stringify(mods)} from ${before} in ${JSON.stringify({ ...w, all: w.all.length })}: old ${show(a)}, new ${show(b)}`);
        }
      }
    }
    expect(keys).toBeGreaterThan(80_000);
  });

  it('agrees on every raw intent from every reachable position of small grids (no key table in between)', () => {
    const intents: Intent[] = [];
    for (const axis of ['row', 'col'] as const) for (const delta of [-1, 1] as const) intents.push({ kind: 'move', axis, delta });
    for (const axis of ['row', 'col', 'both'] as const) for (const to of ['first', 'last'] as const) intents.push({ kind: 'edge', axis, to });
    intents.push({ kind: 'page', delta: -1 }, { kind: 'page', delta: 1 });
    const diffs: string[] = [];
    for (const n of [0, 1, 2, 5]) for (const nc of [1, 2, 4]) for (const extras of [0, 1, 2]) for (const checkBox of [false, true]) for (const page of [1, 3]) {
      const rows = Array.from({ length: n }, (_, i) => k(`r${i}`));
      const cols = Array.from({ length: nc }, (_, i) => `c${i}`);
      const froms: FocusPos[] = [];
      for (const c of cols) {
        for (let l = 0; l <= extras; l++) froms.push(l ? { kind: 'header', column: c, level: l } : { kind: 'header', column: c });
        for (const row of rows) froms.push({ kind: 'cell', row, column: c });
      }
      for (const from of froms) for (const intent of intents) {
        const o = oldApply({ d: rowsOf(rows), cols, page, headerRows: extras, checkBox }, from, intent);
        const m = moveFocus(null, { rows: rowsOf(rows), cols, page, bands: 0, extras, checkBox }, from, null, intent);
        const nw = m ? m.to : null;
        if (JSON.stringify(o) !== JSON.stringify(nw)) diffs.push(`${JSON.stringify(from)} ${JSON.stringify(intent)} n=${n} extras=${extras}: old ${JSON.stringify(o)} new ${JSON.stringify(nw)}`);
      }
    }
    // The only differences: a row move up from a header, which the key table never sends
    // (intentFor drops it for a header owner, and the router answers ArrowUp itself).
    for (const d of diffs) expect(d).toMatch(/"kind":"header".*"axis":"row","delta":-1/);
    expect(diffs.length).toBeGreaterThan(0);
  });
});
