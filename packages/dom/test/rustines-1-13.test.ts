// 1.13.0 — the owner's app's last patches, as options (owner 2026-11-16, « A, monte à 93 000 »): the focus ring for the
// keyboard only (presentation-settings.md 48), a header row that never shows (hidden-headers.md 8), a column the keys
// skip (reading-keyboard.md « A column the keyboard skips »), the arrows through a detail's grid and that grid following
// the master's sideways scroll (master-detail.md). jsdom checks the notes, the focus and the scroll values; the rings
// and the clipping are looked at in real browsers (scripts/browser-1-12.mjs (14)). Expectations by hand.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKey, detailKey, type ColumnDef, type RowKey } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridContext, GridEnv } from '../src/context.js';
import { detail, nestedGrid, type NestedGridOptions } from '../src/detail.js';
import { DETAIL_CSS } from '../src/detail/styles.js';
import { EN } from '../src/locales/en.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { cleanup, emake, k, rowsOf, type R } from './support-edit.js';

afterEach(cleanup);

const rootOf = (m: { host: HTMLElement }) => m.host.querySelector<HTMLElement>('.dzg')!;
const down = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));

describe("focusVisible: 'keyboard' (presentation-settings.md 48)", () => {
  it('by default the grid notes no gesture: the ring shows after a click as before', () => {
    const m = emake();
    down(m.cell('r0')!);
    m.press('ArrowDown', {}, m.cell('r0')!);
    expect(rootOf(m).hasAttribute('data-dzg-ring')).toBe(false);
  });

  it('notes the last gesture on the root: « keys » at first, « pointer » after a press, « keys » again after any key', () => {
    const m = emake({ settings: { focusVisible: 'keyboard' } });
    expect(rootOf(m).getAttribute('data-dzg-ring')).toBe('keys');
    down(m.cell('r1', 'n')!);
    m.cell('r1', 'n')!.focus();
    expect(rootOf(m).getAttribute('data-dzg-ring')).toBe('pointer');
    // The focus is where the click put it: only its look changes.
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r1'), column: 'n' });
    m.press('Shift');
    expect(rootOf(m).getAttribute('data-dzg-ring')).toBe('keys');
    down(m.host.querySelector('.dzg-hcell[data-col="s"]')!);
    expect(rootOf(m).getAttribute('data-dzg-ring')).toBe('pointer');
    m.press('ArrowDown', {}, m.cell('r1', 'n')!);
    expect(rootOf(m).getAttribute('data-dzg-ring')).toBe('keys');
  });

  it('the focus coming back from outside the grid shows the ring (Tab, a shortcut)', () => {
    const m = emake({ settings: { focusVisible: 'keyboard' } });
    const out = document.body.appendChild(document.createElement('button'));
    down(m.cell('r0')!);
    m.cell('r0')!.focus();
    expect(rootOf(m).getAttribute('data-dzg-ring')).toBe('pointer');
    out.focus();
    expect(rootOf(m).getAttribute('data-dzg-ring')).toBe('keys');
  });

  it('live both ways; a press without the setting notes nothing', () => {
    const m = emake({ settings: { focusVisible: 'keyboard' } });
    m.g.update({ focusVisible: 'always' });
    expect(rootOf(m).hasAttribute('data-dzg-ring')).toBe(false);
    down(m.cell('r0')!);
    expect(rootOf(m).hasAttribute('data-dzg-ring')).toBe(false);
    m.g.update({ focusVisible: 'keyboard' });
    expect(rootOf(m).getAttribute('data-dzg-ring')).toBe('keys');
  });
});

describe("headers: 'none' (hidden-headers.md 8)", () => {
  const rows = (m: { host: HTMLElement }) => [...m.host.querySelectorAll<HTMLElement>('.dzg-header > .dzg-hrow')].map((r) => [r.style.position, r.style.clipPath]);

  it('marks the root, keeps the header rows for screen readers, hidden from the eyes even while focused', () => {
    const shown = emake();
    const m = emake({ settings: { headers: 'none' } });
    expect(rootOf(m).getAttribute('data-headers')).toBe('none');
    const shape = (h: HTMLElement) => [...h.querySelectorAll('.dzg-header [role]')].map((e) => [e.getAttribute('role'), e.getAttribute('aria-label'), e.getAttribute('aria-rowindex')]);
    expect(shape(m.host)).toEqual(shape(shown.host));
    expect(rows(m)).toEqual([['absolute', 'inset(50%)']]);
    // A focus the application gives by its own code: still not shown.
    m.g.kernel.dispatch({ type: 'focus.set', focus: { kind: 'header', column: 'n' } }, 'api');
    m.host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"]')!.focus();
    m.g.update({});
    expect(rows(m)).toEqual([['absolute', 'inset(50%)']]);
  });

  it('ArrowUp from the first row stays there (no header on the way); hidden still goes up', () => {
    const m = emake({ settings: { headers: 'none' } });
    m.g.api.focusCell(k('r0'), 'n');
    m.press('ArrowUp');
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'n' });
    expect(m.active()).toBe(m.cell('r0', 'n'));
    m.g.update({ headers: 'hidden' });
    m.press('ArrowUp');
    expect(m.g.kernel.focus).toEqual({ kind: 'header', column: 'n' });
  });

  it('a grid without rows offers no tab stop in its header', () => {
    const m = emake({ rows: [], settings: { headers: 'none' } });
    expect(m.host.querySelectorAll('.dzg-header [tabindex="0"]')).toHaveLength(0);
    const h = emake({ rows: [], settings: { headers: 'hidden' } });
    expect(h.host.querySelectorAll('.dzg-header [tabindex="0"]')).toHaveLength(1);
  });
});

describe('a column the keyboard skips (reading-keyboard.md)', () => {
  const COLS: ColumnDef<R, any>[] = [
    { id: 'name', header: 'Name', width: 120 },
    { id: 'n', header: 'N', type: 'number', width: 80, keyboard: false },
    { id: 's', header: 'S', width: 80 },
    { id: 'q', header: 'Q', type: 'number', width: 80, keyboard: false },
  ];

  it('the arrows jump over it in the body, Home and End land on the columns the keys take', () => {
    const m = emake({ columns: COLS });
    m.g.api.focusCell(k('r0'), 'name');
    m.press('ArrowRight');
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 's' });
    // Nothing after « s » the keys take: it stays.
    m.press('ArrowRight');
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 's' });
    m.press('ArrowLeft');
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'name' });
    m.press('End');
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 's' });
    m.press('Home');
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'name' });
  });

  it('and in the header row', () => {
    const m = emake({ columns: COLS });
    m.g.api.focusCell(k('r0'), 'name');
    m.press('ArrowUp');
    m.press('ArrowRight');
    expect(m.g.kernel.focus).toEqual({ kind: 'header', column: 's' });
    m.press('ArrowLeft');
    expect(m.g.kernel.focus).toEqual({ kind: 'header', column: 'name' });
  });

  it('a first column skipped: the tab stop and Home on the next one', () => {
    const cols: ColumnDef<R, any>[] = [{ id: 'gap', header: 'Gap', width: 24, keyboard: false }, ...COLS.slice(0, 1), { id: 's', header: 'S', width: 80 }];
    const m = emake({ columns: cols });
    expect(m.cell('r0', 'name')!.tabIndex).toBe(0);
    expect(m.cell('r0', 'gap')!.tabIndex).toBe(-1);
    m.g.api.focusCell(k('r2'), 's');
    m.press('Home');
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 'name' });
    m.press('ArrowLeft');
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 'name' });
  });

  it('a click still focuses it; Up and Down stay in it, Left and Right leave it', () => {
    const m = emake({ columns: COLS });
    m.cell('r1', 'n')!.focus();
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r1'), column: 'n' });
    m.press('ArrowDown');
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 'n' });
    m.press('ArrowRight');
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r2'), column: 's' });
  });

  it('Ctrl+Home and Ctrl+End land on the first / last column the keys take, from the body and the header, both directions', () => {
    const cols: ColumnDef<R, any>[] = [{ id: 'gap', header: 'Gap', width: 24, keyboard: false }, ...COLS];
    for (const direction of ['ltr', 'rtl'] as const) {
      const m = emake({ columns: cols, rows: rowsOf(5), settings: { direction } });
      m.g.api.focusCell(k('r2'), 's');
      m.press('Home', { ctrlKey: true });
      expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'name' });
      m.press('End', { ctrlKey: true });
      expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r4'), column: 's' });
      // From the header row: Home and End there, then Ctrl+Home into the body.
      m.g.api.focusCell(k('r0'), 's');
      m.press('ArrowUp');
      m.press('Home');
      expect(m.g.kernel.focus).toEqual({ kind: 'header', column: 'name' });
      m.press('End');
      expect(m.g.kernel.focus).toEqual({ kind: 'header', column: 's' });
      m.press('Home', { ctrlKey: true });
      expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'name' });
      m.press('ArrowUp');
      m.press('End', { ctrlKey: true });
      expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r4'), column: 's' });
      cleanup();
    }
  });

  it('from the select-all box, Right and Down go to the first column the keys take', () => {
    const cols: ColumnDef<R, any>[] = [{ id: 'gap', header: 'Gap', width: 24, keyboard: false }, ...COLS];
    const m = emake({ columns: cols, rows: rowsOf(5), settings: { selection: { mode: 'multi', checkbox: true } } });
    const box = m.host.querySelector<HTMLElement>('.dzg-hcell .dzg-box')!;
    box.focus();
    m.press('ArrowRight', {}, box);
    expect(m.g.kernel.focus).toEqual({ kind: 'header', column: 'name' });
    box.focus();
    m.press('ArrowDown', {}, box);
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'name' });
  });

  it('every column skipped: the keys stay', () => {
    const m = emake({ columns: COLS.map((c) => ({ ...c, keyboard: false as const })) });
    m.cell('r0', 'n')!.focus();
    m.press('ArrowRight');
    m.press('End');
    expect(m.g.kernel.focus).toEqual({ kind: 'cell', row: k('r0'), column: 'n' });
  });
});

// ---- A detail's grid (master-detail.md, 1.13.0) ----
type P = { id: string; name: string; n: number };
type V = { id: string; date: string; n: number };
const MSG = { ...EN, text: { ...EN.text, ...EN_DETAIL.text } };
const x = (id: string): RowKey => detailKey(dataKey(id)!);
const PCOLS: ColumnDef<P, any>[] = [{ id: 'name', header: 'Name', width: 200 }, { id: 'n', header: 'N', type: 'number', width: 300 }, { id: 'more', header: 'More', width: 400 }];
const VCOLS: ColumnDef<V, any>[] = [{ id: 'gap', header: '', width: 24, keyboard: false }, { id: 'date', header: 'Date', width: 176 }, { id: 'n', header: 'N', type: 'number', width: 300 }, { id: 'more', header: 'More', width: 400 }];

function geometryOf(block: number, inline: number) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block, inline, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  return { box, geometry };
}

const made: GridInstance<any, any>[] = [];
afterEach(() => {
  for (const g of made.splice(0)) g.destroy();
});

/** Patients, each panel a grid of visits (`visits` per patient, 3 by default). */
function nest(o: Partial<NestedGridOptions<V>> = {}, visits: (id: string) => number = () => 3) {
  const inner = new Map<string, { grid: GridInstance<V, any>; box: ViewportBox & { scrollInline: number } }>();
  let last: ReturnType<typeof geometryOf>['box'] | null = null;
  const part = nestedGrid<V>({
    ...o,
    env: (): GridEnv => {
      const g = geometryOf(200, 560);
      last = g.box;
      return { geometry: g.geometry, sync: true };
    },
    settings: (c) => ({
      rows: Array.from({ length: visits((c.row as P).id) }, (_, i) => ({ id: `${(c.row as P).id}-V${i}`, date: `2026-01-0${i + 1}`, n: i })),
      getRowId: (r) => r.id, columns: VCOLS, messages: MSG, headers: 'none',
    }),
    onGrid: (grid, c) => void inner.set((c.row as P).id, { grid: grid as GridInstance<V, any>, box: last! }),
  });
  const { box, geometry } = geometryOf(400, 600);
  const host = document.body.appendChild(document.createElement('div'));
  const g = createGrid<P>(host, {
    rows: Array.from({ length: 10 }, (_, i) => ({ id: `P${i}`, name: `Patient ${i}`, n: i })), getRowId: (r) => r.id, columns: PCOLS, messages: MSG,
    features: [detail<P>({ part, height: 160 })],
  }, { geometry, sync: true });
  made.push(g);
  const ctx = (g as unknown as { context: GridContext<P> }).context;
  // jsdom lays nothing out: the outer view given the room a browser would measure (wider than its 600 px).
  Object.defineProperties(ctx.el.viewport, { scrollWidth: { value: 1200 }, clientWidth: { value: 600 } });
  const active = () => document.activeElement as HTMLElement;
  const press = (key: string, mods: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
    active().dispatchEvent(e);
    return e;
  };
  // The arrows and the sideways follow are a chunk loaded with the first panel that wants them (through.ts).
  const open = async (id: string) => {
    g.kernel.dispatch({ type: 'rows.expand', rows: [k(id)], expanded: true }, 'api');
    await vi.dynamicImportSettled();
  };
  const innerRoot = (id: string) => (inner.get(id)!.grid as unknown as { context: GridContext<V> }).context.el;
  return { g, ctx, host, box, inner, innerRoot, active, press, open };
}

describe("nestedGrid({ arrows: 'rows' }) (master-detail.md « The arrows through a nested grid's rows »)", () => {
  it('Down from an open master: the inner grid\'s first row, same column; its first column the keys take otherwise', async () => {
    const t = nest({ arrows: 'rows' });
    await t.open('P1');
    t.g.api.focusCell(k('P1'), 'n');
    t.press('ArrowDown');
    expect(t.inner.get('P1')!.grid.kernel.focus).toEqual({ kind: 'cell', row: k('P1-V0'), column: 'n' });
    expect(t.innerRoot('P1').root.contains(t.active())).toBe(true);
    // From « name », which the inner grid has not: « date » (« gap » is skipped by the keys).
    t.g.api.focusCell(k('P1'), 'name');
    t.press('ArrowDown');
    expect(t.inner.get('P1')!.grid.kernel.focus).toEqual({ kind: 'cell', row: k('P1-V0'), column: 'date' });
  });

  it('Up from its first row: back to the master (same column; the one it left from otherwise)', async () => {
    const t = nest({ arrows: 'rows' });
    await t.open('P1');
    t.g.api.focusCell(k('P1'), 'n');
    t.press('ArrowDown');
    expect(t.innerRoot('P1').root.contains(t.active())).toBe(true);
    const e = t.press('ArrowUp');
    expect(e.defaultPrevented).toBe(true);
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('P1'), column: 'n' });
    expect(t.active()).toBe(t.ctx.rowRenderer.cell(k('P1'), 'n'));
    t.g.api.focusCell(k('P1'), 'name');
    t.press('ArrowDown');
    t.press('ArrowUp');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('P1'), column: 'name' });
  });

  it('Down from its last row: the row after the panel; Up from there: its last row', async () => {
    const t = nest({ arrows: 'rows' });
    await t.open('P1');
    t.g.api.focusCell(k('P1'), 'n');
    t.press('ArrowDown');
    t.press('ArrowDown');
    t.press('ArrowDown');
    expect(t.inner.get('P1')!.grid.kernel.focus).toEqual({ kind: 'cell', row: k('P1-V2'), column: 'n' });
    t.press('ArrowDown');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: k('P2'), column: 'n' });
    expect(t.active()).toBe(t.ctx.rowRenderer.cell(k('P2'), 'n'));
    t.press('ArrowUp');
    expect(t.inner.get('P1')!.grid.kernel.focus).toEqual({ kind: 'cell', row: k('P1-V2'), column: 'n' });
    expect(t.innerRoot('P1').root.contains(t.active())).toBe(true);
  });

  it('a panel whose grid has no row stays one stop; a modifier leaves each grid its own keys', async () => {
    const t = nest({ arrows: 'rows' }, (id) => (id === 'P1' ? 0 : 3));
    await t.open('P1');
    t.g.api.focusCell(k('P1'), 'n');
    t.press('ArrowDown');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('P1'), column: 'n' });
    t.press('ArrowDown');
    t.press('ArrowUp');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('P1'), column: 'n' });
    await t.open('P3');
    t.g.api.focusCell(k('P3'), 'n');
    t.press('ArrowDown', { shiftKey: true });
    expect(t.inner.get('P3')!.grid.kernel.focus).toBeNull();
  });

  it("by default ('panel') Down reaches the panel's stop, as before", async () => {
    const t = nest();
    await t.open('P1');
    t.g.api.focusCell(k('P1'), 'n');
    t.press('ArrowDown');
    expect(t.g.kernel.focus).toEqual({ kind: 'cell', row: x('P1'), column: 'n' });
    expect(t.active().classList.contains('dzg-dcell')).toBe(true);
  });
});

describe("nestedGrid({ inlineScroll: 'master' }) (master-detail.md « A nested grid that follows the master's sideways scroll »)", () => {
  // The outer view's own scroll (the chunk reads and writes the page, as for the user's scroll).
  const sideways = (t: ReturnType<typeof nest>, px: number) => {
    t.ctx.el.viewport.scrollLeft = px;
    t.ctx.el.viewport.dispatchEvent(new Event('scroll'));
  };

  it('the inner grid has no sideways scroll of its own and moves with the master\'s, from its opening on', async () => {
    const t = nest({ inlineScroll: 'master' });
    sideways(t, 120);
    await t.open('P1');
    expect(t.innerRoot('P1').viewport.style.overflowX).toBe('hidden');
    expect(t.inner.get('P1')!.box.scrollInline).toBe(120);
    sideways(t, 300);
    expect(t.inner.get('P1')!.box.scrollInline).toBe(300);
  });

  it('a key that brings an inner column into view moves the master with it', async () => {
    const t = nest({ inlineScroll: 'master' });
    await t.open('P1');
    t.inner.get('P1')!.grid.api.focusCell(k('P1-V0'), 'more');
    const at = t.inner.get('P1')!.box.scrollInline;
    expect(at).toBeGreaterThan(0);
    expect(t.ctx.el.viewport.scrollLeft).toBe(at);
  });

  it('the browser scrolling the inner view sideways (Tab, find in page, scrollIntoView) moves the master; its own echo left alone', async () => {
    const t = nest({ inlineScroll: 'master' });
    await t.open('P1');
    const vp = t.innerRoot('P1').viewport;
    // jsdom lays nothing out: the inner view's room as a browser would measure it.
    Object.defineProperties(vp, { scrollWidth: { value: 1200 }, clientWidth: { value: 560 } });
    vp.scrollLeft = 500;
    vp.dispatchEvent(new Event('scroll'));
    expect(t.ctx.el.viewport.scrollLeft).toBe(500);
    // The master's scroll comes back to the inner grid (the follow).
    t.ctx.el.viewport.dispatchEvent(new Event('scroll'));
    expect(t.inner.get('P1')!.box.scrollInline).toBe(500);
    // A scroll event of the inner view that moved nothing sideways (its vertical scroll): the master not written again.
    t.ctx.el.viewport.scrollLeft = 0;
    vp.dispatchEvent(new Event('scroll'));
    expect(t.ctx.el.viewport.scrollLeft).toBe(0);
  });

  it('the wheel rule reaches a panel grid wherever it sits in the panel, never the grid around it', async () => {
    const t = nest();
    await t.open('P1');
    const sel = /:where\(([^)]*)\)\{overscroll-behavior:auto\}/.exec(DETAIL_CSS)![1]!;
    expect(t.innerRoot('P1').viewport.matches(sel)).toBe(true);
    expect(t.ctx.el.viewport.matches(sel)).toBe(false);
    // A grid wrapped by a host's element inside the panel (Angular's component): still matched.
    const wrap = document.createElement('div');
    const r = t.innerRoot('P1').root;
    r.replaceWith(wrap);
    wrap.append(r);
    expect(t.innerRoot('P1').viewport.matches(sel)).toBe(true);
  });

  it("by default ('own') the inner grid scrolls by itself, apart", async () => {
    const t = nest();
    sideways(t, 120);
    await t.open('P1');
    expect(t.innerRoot('P1').viewport.style.overflowX).toBe('');
    expect(t.inner.get('P1')!.box.scrollInline).toBe(0);
  });
});
