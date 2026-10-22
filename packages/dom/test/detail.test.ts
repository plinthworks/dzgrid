// `@dzgrid/dom/detail`, the feature (Phase 4 step 10, docs/phase-4-steps/step10-plan.md,
// docs/behaviors/master-detail.md, D8, owner Q4–Q5). Written before the code.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, detailKey, type ColumnDef, type GridEvent, type Problem, type RowKey } from '@dzgrid/core';
import type { SparseLayout } from '@dzgrid/core/detail';
import { csvRows } from '@dzgrid/core/csv';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { GridSettings } from '../src/settings.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext } from '../src/context.js';
import type { GridFeature } from '../src/features.js';
import { definePart, type SlotContext, type SlotPart } from '../src/part.js';
import { detail, DETAIL_KEYS, type DetailFeatureOptions } from '../src/detail.js';
import { tree } from '../src/tree.js';
import { EN } from '../src/locales/en.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { FR_DETAIL } from '../src/locales/fr-detail.js';
import { AR_DETAIL } from '../src/locales/ar-detail.js';
import { EN_TREE } from '../src/locales/en-tree.js';

type T = { id: string; name: string; n: number; secret: string };
const ROWS = (n: number): T[] => Array.from({ length: n }, (_, i) => ({ id: `R${i}`, name: `Row ${i}`, n: i, secret: `S3CR3T${i}` }));
const COLUMNS: ColumnDef<T, any>[] = [
  { id: 'name', header: 'Name', width: 160 },
  { id: 'n', header: 'N', type: 'number', width: 100 },
  { id: 't', header: 'T', value: (r: T) => `t${r.n}`, width: 100 },
];
const MSG = { ...EN, text: { ...EN.text, ...EN_DETAIL.text } };
const k = (id: string): RowKey => dataKey(id)!;
const x = (id: string): RowKey => detailKey(k(id));
const idOf = (key: RowKey | null | undefined): string | null => (key == null ? null : String(key).replace(/^x:/, 'x').replace(/d:\d+:/, ''));
const problemsOf = (events: GridEvent<T>[]): Problem[] => events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: Problem[] }).problems);

/** The detail's observer: made after the base's own (the viewport's). */
const ours = (): FakeRO => FakeRO.all.at(-1)!;
/** A ResizeObserver the test drives: `fire` hands the callback the boxes' new block sizes, as one batch (one frame). */
class FakeRO {
  static all: FakeRO[] = [];
  readonly observed = new Set<Element>();
  observes = 0;
  constructor(readonly cb: (entries: unknown[], o: unknown) => void) {
    FakeRO.all.push(this);
  }
  observe(el: Element): void {
    this.observes++;
    this.observed.add(el);
  }
  unobserve(el: Element): void {
    this.observed.delete(el);
  }
  disconnect(): void {
    this.observed.clear();
  }
  fire(sizes: readonly (readonly [Element, number])[]): void {
    this.cb(sizes.map(([target, h]) => ({ target, borderBoxSize: [{ blockSize: h, inlineSize: 500 }], contentRect: { height: h, width: 500 } })), this);
  }
}

interface Log {
  readonly lines: string[];
  readonly last: Map<string, SlotContext['detail']>;
}
/** A test part: a button in the panel; mount, update and destroy logged by master id. */
function logPart(log: Log, o: { focusable?: boolean; throws?: boolean } = {}): SlotPart<'detail'> {
  return definePart('detail', {
    mount(host, c) {
      if (o.throws) throw new Error('part failed');
      const b = document.createElement('button');
      b.textContent = `in ${idOf(c.master)}`;
      host.append(b);
      log.lines.push(`mount ${idOf(c.master)}`);
      log.last.set(idOf(c.master)!, c);
      return {
        update: (n) => void (log.lines.push(`update ${idOf(n.master)} ${n.height}`), log.last.set(idOf(n.master)!, n)),
        destroy: () => void log.lines.push(`destroy ${idOf(c.master)}`),
        ...(o.focusable !== false && { focus: () => (b.focus(), true) }),
      };
    },
  });
}

const grids: GridInstance<T, any>[] = [];
afterEach(() => {
  for (const g of grids.splice(0)) g.destroy();
  document.body.innerHTML = '';
  FakeRO.all = [];
  delete (window as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  vi.restoreAllMocks();
});

interface Make {
  readonly rows?: T[];
  readonly detail?: Partial<DetailFeatureOptions<T>>;
  readonly settings?: Partial<GridSettings<T>>;
  readonly features?: readonly GridFeature[];
  readonly before?: readonly GridFeature[];
  readonly block?: number;
  readonly open?: readonly string[];
  readonly ro?: boolean;
  readonly part?: SlotPart<'detail'>;
}

function make(o: Make = {}) {
  if (o.ro) (window as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeRO;
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: o.block ?? 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<T>[] = [];
  const log: Log = { lines: [], last: new Map() };
  const g = createGrid<T>(host, {
    rows: o.rows ?? ROWS(50), getRowId: (r) => r.id, columns: COLUMNS, messages: MSG,
    features: [...(o.before ?? []), detail<T>({ part: o.part ?? logPart(log), ...o.detail }), ...(o.features ?? [])], onEvent: (e) => events.push(e), ...o.settings,
  }, { geometry, sync: true });
  grids.push(g);
  const ctx = (g as unknown as { context: GridContext<T> }).context;
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const rowEl = (key: RowKey) => [...host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')].find((r) => ctx.rowRenderer.keyOf(r) === key) ?? null;
  const dcell = (id: string) => rowEl(x(id))?.querySelector<HTMLElement>(':scope > .dzg-dcell') ?? null;
  const body = (id: string) => dcell(id)?.querySelector<HTMLElement>('.dzg-dbody') ?? null;
  const cell = (id: string, col = 'name') => rowEl(k(id))?.querySelector<HTMLElement>(`.dzg-cell[data-col="${col}"]`) ?? null;
  const active = () => document.activeElement as HTMLElement;
  const where = () => {
    const a = active();
    const r = a.closest('.dzg-row');
    const key = r ? ctx.rowRenderer.keyOf(r) : null;
    return `${idOf(key)}/${a.classList.contains('dzg-dcell') ? '*' : a.dataset['col'] ?? a.tagName.toLowerCase()}`;
  };
  const press = (key: string, mods: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
    active().dispatchEvent(e);
    return e;
  };
  const expand = (ids: readonly string[], expanded = true, source: 'api' | 'user' = 'api') => g.kernel.dispatch({ type: 'rows.expand', rows: ids.map(k), expanded }, source);
  const scroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  const top = () => ctx.scroll.logicalTop;
  const d = () => g.kernel.rows.displayed;
  const topKey = () => d().keyAt(ctx.layout!.indexAt(top()));
  const heightOf = (id: string) => ctx.layout!.heightOf(d().indexOf(x(id)) as never);
  if (o.open) expand(o.open);
  return { g, ctx, host, vp, box, events, log, rowEl, dcell, body, cell, active, where, press, expand, scroll, top, d, topKey, heightOf };
}

describe('detail(): the panels, mounted lazily and destroyed in balance', () => {
  it('mounts nothing before a master opens, one part at the first paint showing it, never twice', () => {
    const t = make();
    expect(t.log.lines).toEqual([]);
    expect(t.host.querySelector('.dzg-dbody')).toBeNull();
    t.expand(['R1']);
    expect(t.log.lines).toEqual(['mount R1']);
    // The part is in a content box inside the detail cell, a widget owner (D8).
    expect(t.body('R1')!.dataset['dzgOwner']).toBe('cell-widget');
    expect(t.body('R1')!.textContent).toBe('in R1');
    t.g.api.refresh();
    t.scroll(10);
    t.expand(['R3']);
    expect(t.log.lines.filter((l) => l.startsWith('mount'))).toEqual(['mount R1', 'mount R3']);
  });

  it('destroys a panel on collapse and when its row leaves the window; mounts and destroys balance', () => {
    const t = make({ rows: ROWS(300), open: ['R1', 'R2'] });
    t.expand(['R1'], false);
    expect(t.log.lines).toEqual(['mount R1', 'mount R2', 'destroy R1']);
    // Far down: R2's detail leaves the window; back up: mounted again.
    t.scroll(5000);
    expect(t.log.lines.at(-1)).toBe('destroy R2');
    t.scroll(0);
    expect(t.log.lines.at(-1)).toBe('mount R2');
    t.g.destroy();
    const count = (w: string) => t.log.lines.filter((l) => l.startsWith(w)).length;
    expect(count('mount')).toBe(3);
    expect(count('destroy')).toBe(3);
  });

  it('gives the part the master row, the keys, the height, the depth, the grid’s words, and leave()', () => {
    const t = make({ open: ['R1'] });
    const c = t.log.last.get('R1')!;
    expect(c.row).toEqual(ROWS(50)[1]);
    expect(c.key).toBe(x('R1'));
    expect(c.master).toBe(k('R1'));
    expect(c.height).toBe(240);
    expect(c.depth).toBe(2);
    expect(c.dir).toBe('ltr');
    expect(c.msg('detail.label', { name: 'X' })).toBe('Details of X');
    expect(typeof c.announce).toBe('function');
    // leave(): the focus on this panel's cell.
    t.g.api.focusCell(k('R1'), 'n');
    t.press('ArrowDown');
    t.press('Enter');
    expect(t.where()).toBe('xR1/button');
    c.leave!();
    expect(t.where()).toBe('xR1/*');
    // From anywhere else (the focus on another row): to this panel's cell.
    t.g.api.focusCell(k('R4'), 't');
    c.leave!();
    expect(t.where()).toBe('xR1/*');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('R1'), column: 'name' });
  });

  it('updates the part when its height changes, not at a paint that changes nothing for it', () => {
    let h = 240;
    const t = make({ open: ['R1'], detail: { height: () => h } });
    t.g.api.refresh();
    t.scroll(3);
    expect(t.log.lines).toEqual(['mount R1']);
    h = 300;
    // A new build (another sort) reads the function again.
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'api');
    expect(t.log.lines).toEqual(['mount R1', 'update R1 300']);
  });

  it('takes a part by its name in settings.parts (Angular registers by name); none missing is told', () => {
    const log: Log = { lines: [], last: new Map() };
    const t = make({ detail: { part: 'visits' }, settings: { parts: { visits: logPart(log) } }, open: ['R1'] });
    expect(log.lines).toEqual(['mount R1']);
    expect(problemsOf(t.events).filter((p) => p.code === 'missing-feature')).toEqual([]);
  });

  it('reports a part that throws once, leaves its box empty, does not try again at each paint', () => {
    const errors: unknown[] = [];
    const w = window as unknown as { reportError?: (e: unknown) => void };
    w.reportError ??= () => {};
    vi.spyOn(w as { reportError: (e: unknown) => void }, 'reportError').mockImplementation((e) => void errors.push(e));
    const log: Log = { lines: [], last: new Map() };
    const t = make({ part: logPart(log, { throws: true }), open: ['R1'] });
    t.g.api.refresh();
    t.scroll(4);
    expect(errors.length).toBe(1);
    expect(t.body('R1')!.childElementCount).toBe(0);
  });
});

describe('detail(): the cell’s name, the chevron and the keys of the master', () => {
  it('names the detail cell « Details of » its master through a named group, its content (fr, ar too)', () => {
    const t = make({ open: ['R1'] });
    // No aria-label on the cell (its content's text would not be in it: axe label-content-name-mismatch): the
    // cell's name comes from its content, a group whose own name is the bundle's sentence.
    const name = () => [t.dcell('R1')!.getAttribute('aria-label'), t.body('R1')!.getAttribute('role'), t.body('R1')!.getAttribute('aria-label')];
    expect(name()).toEqual([null, 'group', 'Details of Row 1']);
    t.g.update({ messages: { ...EN, text: { ...EN.text, ...FR_DETAIL.text } } });
    expect(name()).toEqual([null, 'group', 'Détails de Row 1']);
    t.g.update({ messages: { ...EN, text: { ...EN.text, ...AR_DETAIL.text } } });
    expect(name()).toEqual([null, 'group', `${String.fromCharCode(0x62a, 0x641, 0x627, 0x635, 0x64a, 0x644)} Row 1`]);
  });

  it('draws a decorative chevron in the first column; aria-expanded on that cell, never on the row (axe: a grid row)', () => {
    const t = make({ open: ['R1'] });
    const toggle = t.cell('R0')!.querySelector('.dzg-toggle')!;
    expect(toggle.getAttribute('aria-hidden')).toBe('true');
    expect(t.cell('R0')!.getAttribute('aria-expanded')).toBe('false');
    expect(t.cell('R1')!.getAttribute('aria-expanded')).toBe('true');
    expect(t.cell('R1')!.querySelector('.dzg-toggle')!.hasAttribute('data-open')).toBe(true);
    expect(t.rowEl(k('R1'))!.hasAttribute('aria-expanded')).toBe(false);
    expect(t.cell('R1', 'n')!.hasAttribute('aria-expanded')).toBe(false);
    // Another chevron column.
    const u = make({ detail: { column: 'n' } });
    expect(u.cell('R0', 'n')!.querySelector('.dzg-toggle')).not.toBeNull();
    expect(u.cell('R0', 'name')!.querySelector('.dzg-toggle')).toBeNull();
  });

  it('opens and closes by a click on the chevron: no selection, no row click, said', () => {
    const t = make({ settings: { selection: { mode: 'multi' } } });
    t.cell('R2')!.querySelector('.dzg-toggle')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect([...t.g.kernel.expansion]).toEqual([k('R2')]);
    expect(t.g.kernel.selection.keys.size).toBe(0);
    expect(t.events.some((e) => e.type === 'rowClicked' || e.type === 'cellClicked')).toBe(false);
    expect(t.ctx.live.said).toBe('Row 2 expanded');
    t.cell('R2')!.querySelector('.dzg-toggle')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(t.g.kernel.expansion.size).toBe(0);
    expect(t.ctx.live.said).toBe('Row 2 collapsed');
  });

  it('forward on a closed master’s chevron cell opens, then moves; back on an open one closes (mirrored in RTL)', () => {
    const t = make();
    t.g.api.focusCell(k('R1'), 'name');
    t.press('ArrowRight');
    expect(t.g.kernel.expansion.has(k('R1'))).toBe(true);
    expect(t.where()).toBe('R1/name');
    t.press('ArrowRight');
    expect(t.where()).toBe('R1/n');
    t.press('ArrowLeft');
    expect(t.where()).toBe('R1/name');
    t.press('ArrowLeft');
    expect(t.g.kernel.expansion.has(k('R1'))).toBe(false);
    // Another column: plain moves.
    t.g.api.focusCell(k('R2'), 'n');
    t.press('ArrowRight');
    expect(t.g.kernel.expansion.size).toBe(0);
    const r = make({ settings: { direction: 'rtl' } });
    r.g.api.focusCell(k('R1'), 'name');
    r.press('ArrowLeft');
    expect(r.g.kernel.expansion.has(k('R1'))).toBe(true);
    r.press('ArrowRight');
    expect(r.g.kernel.expansion.has(k('R1'))).toBe(false);
  });

  it('Down reaches the panel as one stop, Enter goes in, Escape comes back, Down goes on (goal column kept)', () => {
    const t = make({ open: ['R1'] });
    t.g.api.focusCell(k('R1'), 'n');
    t.press('ArrowDown');
    expect(t.where()).toBe('xR1/*');
    t.press('Enter');
    expect(t.where()).toBe('xR1/button');
    t.press('Escape');
    expect(t.where()).toBe('xR1/*');
    t.press('F2');
    expect(t.where()).toBe('xR1/button');
    t.press('Escape');
    t.press('ArrowDown');
    expect(t.where()).toBe('R2/n');
  });

  it('closing the master while in its panel puts the focus on the master', () => {
    const t = make({ open: ['R1'] });
    t.g.api.focusCell(k('R1'), 'name');
    t.press('ArrowDown');
    t.press('Enter');
    t.expand(['R1'], false, 'user');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('R1'), column: 'name' });
  });

  it('says only the user’s openings and closings, never the host’s', () => {
    const t = make();
    t.expand(['R3']);
    expect(t.ctx.live.said).toBe('');
    t.expand(['R3'], false);
    expect(t.ctx.live.said).toBe('');
    t.expand(['R4'], true, 'user');
    expect(t.ctx.live.said).toBe('Row 4 expanded');
  });

  it('refuses to start without its texts, naming the missing ones', () => {
    const host = document.createElement('div');
    document.body.append(host);
    expect(() => createGrid<T>(host, { rows: ROWS(3), getRowId: (r) => r.id, columns: COLUMNS, messages: EN, features: [detail<T>({ part: logPart({ lines: [], last: new Map() }) })] }, { sync: true })).toThrow(`detail: missing ${DETAIL_KEYS.join(', ')}`);
  });
});

describe('detail(): heights', () => {
  it('a fixed height and a function of the master (Q4); the content box fills a fixed panel, not observed', () => {
    const t = make({ ro: true, open: ['R1', 'R2'], detail: { height: (r: T) => 100 + r.n } });
    expect(t.heightOf('R1')).toBe(101);
    expect(t.heightOf('R2')).toBe(102);
    expect(t.body('R1')!.hasAttribute('data-auto')).toBe(false);
    expect(FakeRO.all.flatMap((r) => [...r.observed]).filter((e) => e.classList.contains('dzg-dbody'))).toEqual([]);
  });

  it('\'auto\': 240 until measured, then the measure; one setHeights and one paint per batch of resizes', () => {
    const t = make({ ro: true, open: ['R1', 'R2'], detail: { height: 'auto' } });
    expect(t.heightOf('R1')).toBe(240);
    const ro = ours();
    expect(ro.observed.size).toBe(2);
    expect(t.body('R1')!.hasAttribute('data-auto')).toBe(true);
    const L = t.ctx.layout as SparseLayout;
    const set = vi.spyOn(L, 'setHeights');
    const sched = vi.spyOn(t.ctx, 'schedule');
    ro.fire([[t.body('R1')!, 90], [t.body('R2')!, 130]]);
    expect(set).toHaveBeenCalledTimes(1);
    expect(sched).toHaveBeenCalledTimes(1);
    expect(t.heightOf('R1')).toBe(90);
    expect(t.heightOf('R2')).toBe(130);
    expect(t.rowEl(x('R1'))!.style.blockSize).toBe('90px');
    expect(t.log.lines).toContain('update R1 90');
    // The same sizes again (or within half a pixel): nothing.
    ro.fire([[t.body('R1')!, 90.3], [t.body('R2')!, 130]]);
    expect(set).toHaveBeenCalledTimes(1);
    // No observer loop: painting the new heights observes nothing new.
    expect(ro.observes).toBe(2);
  });

  it('\'auto\': a panel above the view that grows keeps the top row in place', () => {
    const t = make({ ro: true, rows: ROWS(300), open: ['R1', 'R40'], detail: { height: 'auto' } });
    const b = t.body('R1')!;
    // R1's panel just above the view, still mounted (the overscan): it is measured and grows.
    t.scroll(t.ctx.layout!.offsetOf(t.d().indexOf(k('R3')) as never) + 5);
    expect(idOf(t.topKey())).toBe('R3');
    expect(t.body('R1')).toBe(b);
    const before = t.top();
    ours().fire([[b, 500]]);
    expect(idOf(t.topKey())).toBe('R3');
    expect(t.top()).toBe(before + 260);
  });

  it('\'auto\': a measure survives a close and a reopen, and a new row height (was carried over)', () => {
    const t = make({ ro: true, open: ['R1'], detail: { height: 'auto' } });
    ours().fire([[t.body('R1')!, 77]]);
    t.expand(['R1'], false);
    expect(ours().observed.size).toBe(0);
    t.expand(['R1']);
    expect(t.heightOf('R1')).toBe(77);
    ours().fire([[t.body('R1')!, 88]]);
    t.g.update({ density: 'spacious' });
    expect(t.heightOf('R1')).toBe(88);
  });

  it('a height set on the layout (not measured by the feature) survives a new row height: was carried over', () => {
    const t = make({ open: ['R1'] });
    (t.ctx.layout as SparseLayout).setHeights([[t.d().indexOf(x('R1')) as never, 333]]);
    t.g.update({ density: 'spacious' });
    expect(t.heightOf('R1')).toBe(333);
  });

  it('\'auto\' without a ResizeObserver (old engine, SSR): the estimate stays, nothing throws', () => {
    const t = make({ open: ['R1'], detail: { height: 'auto' } });
    expect(t.heightOf('R1')).toBe(240);
    expect(t.log.lines).toEqual(['mount R1']);
  });
});

describe('detail(): never data, never in the events, refused beside spans and a tree', () => {
  it('Space and clicks on a panel select nothing and send no click events; select-all and CSV skip details', () => {
    const t = make({ open: ['R1'], settings: { selection: { mode: 'multi' } } });
    t.g.api.focusCell(k('R1'), 'n');
    t.press('ArrowDown');
    t.press(' ');
    expect(t.g.kernel.selection.keys.size).toBe(0);
    t.body('R1')!.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    t.dcell('R1')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(t.events.some((e) => e.type === 'rowClicked' || e.type === 'cellClicked')).toBe(false);
    expect(t.g.kernel.selection.keys.size).toBe(0);
    t.press('a', { ctrlKey: true });
    const sel = t.g.kernel.selection;
    expect(sel.mode === 'include' ? [...sel.keys].some((key) => String(key).startsWith('x:')) : sel.keys.size === 0).toBe(false);
    const csv = csvRows(t.g.kernel.rows, 'displayed', t.g.kernel.selection)!;
    expect(csv.count).toBe(50);
  });

  it('no event carries a row’s data: open, close, focus, keys, clicks, measures', () => {
    const t = make({ ro: true, detail: { height: 'auto' }, settings: { selection: { mode: 'multi' } } });
    t.cell('R1')!.querySelector('.dzg-toggle')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    t.g.api.focusCell(k('R1'), 'name');
    t.press('ArrowDown');
    t.press('Enter');
    t.press('Escape');
    ours().fire([[t.body('R1')!, 99]]);
    t.press('ArrowUp');
    t.press('ArrowLeft');
    expect(t.events.length).toBeGreaterThan(3);
    const text = JSON.stringify(t.events, (_k, v) => (typeof v === 'bigint' ? String(v) : v instanceof Set ? [...v] : v));
    expect(text).not.toMatch(/S3CR3T/);
  });

  it('told beside spans (and the spans off) and beside a tree (the first shape wins; the other is refused)', () => {
    const spans: GridFeature = { id: 'spans', setup: () => ({ destroy() {} }) };
    const t = make({ features: [spans], open: ['R1'] });
    expect(problemsOf(t.events)).toContainEqual(expect.objectContaining({ code: 'unsupported-combination', severity: 'warning', path: 'spans', detail: 'detail' }));
    const u = make({ features: [tree<T>({ parentId: () => null })], settings: { messages: { ...MSG, text: { ...MSG.text, ...EN_TREE.text } } }, open: ['R1'] });
    expect(problemsOf(u.events)).toContainEqual(expect.objectContaining({ code: 'unsupported-combination', path: 'tree', detail: 'detail' }));
    expect(u.dcell('R1')).not.toBeNull();
    // A tree first: its shape is the grid's; the detail draws nothing and tells the conflict.
    const log: Log = { lines: [], last: new Map() };
    const v = make({ before: [tree<T>({ parentId: () => null })], part: logPart(log), settings: { messages: { ...MSG, text: { ...MSG.text, ...EN_TREE.text } } } });
    expect(problemsOf(v.events)).toContainEqual(expect.objectContaining({ code: 'unsupported-combination', path: 'tree' }));
    expect(v.host.querySelectorAll('.dzg-dbody').length).toBe(0);
    expect(v.ctx.layoutFor).toBeUndefined();
  });

  it('cleans up at the grid’s end: the observer, the chevrons, the listeners', () => {
    const t = make({ ro: true, open: ['R1'], detail: { height: 'auto' } });
    const ro = ours();
    const off = vi.spyOn(ro, 'disconnect');
    const cells = [t.cell('R0')!, t.cell('R2')!];
    t.g.destroy();
    expect(off).toHaveBeenCalledTimes(1);
    expect(ro.observed.size).toBe(0);
    // The chevrons and their state taken off the cells.
    for (const c of cells) expect([c.querySelector('.dzg-toggle'), c.getAttribute('aria-expanded')]).toEqual([null, null]);
    expect(t.log.lines).toEqual(['mount R1', 'destroy R1']);
  });
});
