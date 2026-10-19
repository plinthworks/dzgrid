// Header parts through `slots()` (docs/behaviors/parts.md, step 11 decisions O1, O4).
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import { definePart, type SlotContext } from '../src/part.js';
import { slots } from '../src/slots.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';

type R = { id: string; n: number; s: string };
let grids: GridInstance<R>[] = [];
const hadReport = (window as unknown as { reportError?: unknown }).reportError;
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; vi.restoreAllMocks(); (window as unknown as { reportError?: unknown }).reportError = hadReport; });
/** What the grid reports (`reportError`), caught. */
function catchReports(): unknown[] {
  const reported: unknown[] = [];
  (window as unknown as { reportError: unknown }).reportError = (e: unknown) => { reported.push(e); };
  return reported;
}

type HC = SlotContext['header'];

/** A header part that draws a button and a label, and counts what the grid asks of it. */
function headerPart(tag = 'h', opts: { throwOn?: (c: HC) => boolean } = {}) {
  const calls = { mount: 0, update: 0, destroy: 0, last: null as HC | null, all: [] as HC[] };
  const part = definePart('header', {
    mount(host, c) {
      if (opts.throwOn?.(c)) throw new Error('header part broke');
      calls.mount++;
      calls.last = c;
      calls.all.push(c);
      const label = document.createElement('span');
      label.className = `p-${tag}`;
      label.textContent = `${tag}:${c.label}`;
      const b = document.createElement('button');
      b.className = 'p-menu';
      b.textContent = 'menu';
      host.append(label, b);
      return {
        update(next) {
          if (opts.throwOn?.(next)) throw new Error('header part broke');
          calls.update++;
          calls.last = next;
          label.textContent = `${tag}:${next.label}`;
        },
        destroy() { calls.destroy++; },
      };
    },
  });
  return { calls, part };
}

function make(settings: Partial<GridSettings<R>> = {}, columns?: ColumnDef<R, any>[], inline = 600) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const cols: ColumnDef<R, any>[] = columns ?? [{ id: 'n', header: 'Number', type: 'number' }, { id: 's', header: 'Status' }];
  const g = createGrid<R>(host, { rows: Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, n: i, s: i % 2 ? 'odd' : 'even' })), getRowId: (r) => r.id, columns: cols, messages: EN, features: [slots()], onEvent: (e) => events.push(e), ...settings }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const head = (c: string) => host.querySelector<HTMLElement>(`.dzg-header .dzg-hcell[data-col="${c}"]`)!;
  const label = (c: string) => head(c).querySelector<HTMLElement>('.dzg-hlabel')!;
  // What the label shows first: the part's own label, or the grid's text.
  const shown = (c: string) => label(c).firstChild?.textContent ?? '';
  const scrollInline = (x: number) => { box.scrollInline = x; vp.dispatchEvent(new Event('scroll')); };
  const problems = () => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  return { g, host, events, head, label, shown, scrollInline, problems };
}

describe('header parts', () => {
  it('draw the label’s content only, with the column, its label and no sort', () => {
    const { calls, part } = headerPart();
    const t = make({ parts: { header: part } });
    expect(calls.mount).toBe(2);
    expect(t.label('n').querySelector('.p-h')!.textContent).toBe('h:Number');
    // The grid wrote no text of its own into the label.
    expect([...t.label('n').childNodes].every((n) => n.nodeType === 1)).toBe(true);
    const c = calls.all.find((x) => x.column.id === 'n')!;
    expect(c.label).toBe('Number');
    expect(c.sort).toBeNull();
    expect(c.sortIndex).toBeNull();
    expect(c.ctx.locale).toBe('en');
    expect(c.dir).toBe('ltr');
    expect(c.doc).toBe(document);
    expect(c.msg('grid.label')).toBe(EN.text['grid.label']);
    // A column with no `header` is labelled by its id.
    const u = headerPart('u');
    const v = make({ parts: { header: u.part } }, [{ id: 'plain' }]);
    expect(v.shown('plain')).toBe('u:plain');
  });

  it('update only when what they see changed: not on a repaint, but on a sort, a language or a new label', () => {
    const { calls, part } = headerPart();
    const t = make({ parts: { header: part } });
    t.g.api.refresh();
    t.g.update({ density: 'compact' });
    expect(calls.update).toBe(0);
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    const n = calls.all.length;
    expect(calls.update).toBeGreaterThanOrEqual(1);
    const last = calls.last!;
    expect(last.column.id === 'n' ? last : null).not.toBeNull();
    expect(last.sort).toEqual({ column: 'n', dir: 'asc' });
    expect(last.sortIndex).toBe(0);
    expect(calls.all.length).toBe(n);
    const before = calls.update;
    t.g.update({ messages: FR });
    expect(calls.update).toBeGreaterThan(before);
    // Another bundle in the same language (a host's own keys added): parts reading msg are told.
    const same = calls.update;
    t.g.update({ messages: { ...FR, text: { ...FR.text, 'app.more': 'plus' } } as never });
    expect(calls.update).toBeGreaterThan(same);
    const b2 = calls.update;
    t.g.update({ columns: [{ id: 'n', header: 'Nombre', type: 'number' }, { id: 's', header: 'Status' }] });
    expect(calls.update).toBeGreaterThan(b2);
    expect(t.label('n').textContent).toContain('h:Nombre');
  });

  it('leave the grid’s role, aria-sort, sort mark, resize grip and name in place', () => {
    const { part } = headerPart();
    const t = make({ parts: { header: part } });
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    const h = t.head('n');
    expect(h.getAttribute('role')).toBe('columnheader');
    expect(h.getAttribute('aria-colindex')).toBe('1');
    expect(h.getAttribute('aria-sort')).toBe('ascending');
    expect(h.classList.contains('dzg-sortable')).toBe(true);
    expect(h.querySelector(':scope > .dzg-sort')!.getAttribute('data-dir')).toBe('asc');
    expect(h.querySelector(':scope > .dzg-resize')).not.toBeNull();
    // The label holds the part; the mark and the grip sit beside it.
    expect(h.querySelector('.dzg-hlabel .dzg-sort, .dzg-hlabel .dzg-resize')).toBeNull();
    // A multi-column sort: the precedence in the mark and in the name, the part told its index.
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 's', multi: true }, 'user');
    expect(t.head('s').querySelector('.dzg-sort')!.textContent).toBe('2');
    expect(t.head('s').getAttribute('aria-label')).toBe('Status, Sort 2');
  });

  it('a click on a control the part draws does not sort; a click elsewhere in the header does', () => {
    const { part } = headerPart();
    const t = make({ parts: { header: part } });
    t.head('n').querySelector<HTMLButtonElement>('.p-menu')!.click();
    expect(t.g.kernel.query.sort).toEqual([]);
    t.head('n').querySelector<HTMLElement>('.p-h')!.click();
    expect(t.g.kernel.query.sort).toEqual([{ column: 'n', dir: 'asc' }]);
    t.head('s').querySelector<HTMLElement>('.p-h')!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(t.g.kernel.query.sort).toEqual([{ column: 'n', dir: 'asc' }, { column: 's', dir: 'asc' }]);
  });

  it('toggleSort sorts as the user, multi adding to the sort; the part sees its index', () => {
    const { calls, part } = headerPart();
    const t = make({ parts: { header: part } });
    calls.all.find((c) => c.column.id === 'n')!.toggleSort(false);
    calls.all.find((c) => c.column.id === 's')!.toggleSort(true);
    const sorted = t.events.filter((e) => e.type === 'sortChanged');
    expect(sorted.map((e) => (e as { source: string }).source)).toEqual(['user', 'user']);
    expect(t.g.kernel.query.sort).toEqual([{ column: 'n', dir: 'asc' }, { column: 's', dir: 'asc' }]);
    const s = [...calls.all, calls.last!].filter((c) => c.column.id === 's').at(-1)!;
    expect(calls.last!.column.id).toBe('s');
    expect(s.sortIndex).toBe(1);
    expect(s.sort).toEqual({ column: 's', dir: 'asc' });
  });

  it('are found by ui.header, then header.<type>, then the bare name header, then the built-in', () => {
    const own = headerPart('own');
    const typed = headerPart('typed');
    const bare = headerPart('bare');
    const columns: ColumnDef<R, any>[] = [
      { id: 'a', header: 'A', ui: { header: 'mine' } },
      { id: 'n', header: 'N', type: 'number' },
      { id: 's', header: 'S' },
    ];
    const t = make({ parts: { mine: own.part, 'header.number': typed.part, header: bare.part } }, columns);
    expect(t.shown('a')).toBe('own:A');
    expect(t.shown('n')).toBe('typed:N');
    expect(t.shown('s')).toBe('bare:S');
    // No bare name: a column without its own or typed part keeps the grid's text.
    const t2 = make({ parts: { 'header.number': typed.part } }, columns);
    expect(t2.shown('s')).toBe('S');
    expect(t2.shown('a')).toBe('A');
    // Live: a new registry without header parts gives every label back its text.
    t.g.update({ parts: {} });
    expect(t.shown('a')).toBe('A');
    expect(t.shown('n')).toBe('N');
    expect(own.calls.destroy).toBe(own.calls.mount);
    expect(typed.calls.destroy + bare.calls.destroy).toBeGreaterThan(0);
  });

  it('an unknown or wrong-slot ui.header is unknown-part, told once per registry', () => {
    const cell = definePart('cell', { mount: () => ({}) });
    const { part } = headerPart();
    const columns: ColumnDef<R, any>[] = [{ id: 'a', header: 'A', ui: { header: 'nope' } }, { id: 'b', header: 'B', ui: { header: 'aCell' } }];
    const t = make({ parts: { header: part, aCell: cell } }, columns);
    const unknown = () => t.problems().filter((p) => p.code === 'unknown-part');
    expect(unknown()).toEqual([
      { code: 'unknown-part', severity: 'error', path: 'columns.a.ui.header', detail: 'nope' },
      { code: 'unknown-part', severity: 'error', path: 'columns.b.ui.header', detail: 'aCell' },
    ]);
    // The next choice is taken: the bare name.
    expect(t.shown('a')).toBe('h:A');
    t.g.api.refresh();
    t.g.kernel.dispatch({ type: 'column.resize', column: 'a', width: 180, finished: true }, 'user');
    expect(unknown()).toHaveLength(2);
    // A new registry tells again.
    t.g.update({ parts: { header: part } });
    expect(unknown()).toHaveLength(4);
  });

  it('a part that throws: its label shows the grid’s text, the error reported, not tried again until it changes', () => {
    const reported = catchReports();
    let broken = true;
    const { calls, part } = headerPart('h', { throwOn: (c) => broken && c.column.id === 'n' });
    const t = make({ parts: { header: part } });
    expect(t.shown('n')).toBe('Number');
    expect(t.shown('s')).toBe('h:Status');
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).message).toBe('header part broke');
    t.g.api.refresh();
    expect(reported).toHaveLength(1);
    // Its context changes (a sort): mounted afresh.
    broken = false;
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    expect(t.shown('n')).toBe('h:Number');
    // An update that throws: destroyed, the text back.
    broken = true;
    const d = calls.destroy;
    t.g.kernel.dispatch({ type: 'sort.toggle', column: 'n', multi: false }, 'user');
    expect(calls.destroy).toBe(d + 1);
    expect(t.shown('n')).toBe('Number');
    expect(reported).toHaveLength(2);
    // The sort mark survives a broken part.
    expect(t.head('n').querySelector('.dzg-sort')).not.toBeNull();
  });

  it('a destroy that throws is reported, and the grid goes on', () => {
    const reported = catchReports();
    const part = definePart('header', { mount: (host) => { host.append('x'); return { destroy() { throw new Error('bad destroy'); } }; } });
    const t = make({ parts: { header: part } });
    t.g.update({ parts: {} });
    expect(reported.map((e) => (e as Error).message)).toEqual(['bad destroy', 'bad destroy']);
    expect(t.shown('n')).toBe('Number');
  });

  it('are destroyed when their header leaves the column window, and on the grid’s destroy: mounts equal destroys', () => {
    const { calls, part } = headerPart();
    const columns: ColumnDef<R, any>[] = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, header: `C${i}`, width: 100, value: () => i }));
    const t = make({ parts: { header: part } }, columns, 400);
    const first = calls.mount;
    expect(first).toBeLessThan(30);
    for (let x = 0; x <= 2600; x += 200) t.scrollInline(x);
    expect(calls.destroy).toBeGreaterThan(0);
    // Each mounted header holds its part, no more.
    expect(calls.mount - calls.destroy).toBe(t.host.querySelectorAll('.dzg-header .p-h').length);
    t.g.destroy();
    grids = [];
    expect(calls.destroy).toBe(calls.mount);
  });

  it('never draw the cells of a row a feature adds under the headers', () => {
    const { calls, part } = headerPart();
    const extra = { id: 'below', mount: (cell: HTMLElement) => cell.append('f') };
    const feature = { id: 'rows', setup: () => ({ headerRows: [extra], destroy() {} }) };
    const t = make({ parts: { header: part }, features: [slots(), feature] });
    expect(calls.mount).toBe(2);
    expect(t.host.querySelectorAll('.dzg-hextra .p-h')).toHaveLength(0);
  });
});
