// Phase 5 step 7, a row that goes while it is edited (owner Q8, O9, S7-O3; edit-save.md 19–21; step07-plan.md
// findings 2–4, « A row that goes while edited »): hidden = kept and saved, nothing said; removed = dropped, said
// once (assertive, `edit.rowRemoved`), focus on the nearest row; a server page or query change keeps and sends the
// typed text while the row is still held; a removed row's refused save is the host's to hear, not the user's.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { tree } from '../src/tree.js';
import { EN_TREE } from '../src/locales/en-tree.js';
import { BASE, EDIT, EDITORS, cleanup, join, k, rowsOf, type R } from './support-editors.js';
import { flush, saving, server, type Held } from './support-saves.js';

afterEach(cleanup);

const REMOVED = 'Row removed, change cancelled';
/** Opens r1/n and types « 42 » (not kept yet). */
const typing = (t: ReturnType<typeof saving>, id = 'r1', col = 'n', text = '42') => {
  t.at(id, col);
  t.key('F2');
  t.type(text);
};
const onBody = () => document.activeElement === document.body;

describe('client grid: a row only hidden is kept and saved, nothing said (Q8, edit-save.md 19)', () => {
  it('a filter set by the application: one request with the typed value, no sentence, focus not on body', () => {
    const t = saving();
    typing(t);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'gt', value: 100 } }, 'api');
    expect(t.field()).toBeNull();
    expect(t.sent()).toEqual(['r1/n=42']);
    expect(t.loud()).toEqual([]);
    expect(t.of('editingStopped').at(-1)).toMatchObject({ kept: true, via: 'lost' });
    expect(onBody()).toBe(false);
  });

  it('its column hidden: kept and saved, nothing said', () => {
    const t = saving();
    typing(t);
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'n', hidden: true }] } as never, 'api');
    expect(t.field()).toBeNull();
    expect(t.sent()).toEqual(['r1/n=42']);
    expect(t.loud()).toEqual([]);
    expect(onBody()).toBe(false);
  });

  it('its parent closed in a tree: kept and saved, nothing said', () => {
    type T = R & { parent: string | null };
    const rows: T[] = rowsOf(10).map((r, i) => ({ ...r, parent: i === 0 ? null : 'r0' }));
    const t = saving({ rows: rows as never, features: (e, x) => [tree<T>({ parentId: (r) => r.parent }) as never, e, x], settings: { messages: join(BASE.en, EDIT.en, EDITORS.en, EN_TREE) } as never });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('r0')], expanded: true }, 'api');
    typing(t, 'r2');
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [k('r0')], expanded: false }, 'api');
    expect(t.field()).toBeNull();
    expect(t.sent()).toEqual(['r2/n=42']);
    expect(t.loud()).toEqual([]);
  });
});

describe('client grid: a row removed is dropped and said once (D8, edit-save.md 20)', () => {
  it('by a host transaction: no request, « Row removed » assertive once, focus on the nearest row', () => {
    const t = saving();
    typing(t, 'r3');
    t.g.kernel.rows.applyTransaction({ remove: ['r3'] });
    expect(t.field()).toBeNull();
    expect(t.held).toEqual([]);
    expect(t.loud()).toEqual([REMOVED]);
    expect(t.of('editingStopped').at(-1)).toMatchObject({ kept: false, via: 'lost' });
    // No O1 (« value refused »), no blink on another cell.
    expect(t.host.querySelector('.dzg-cell--refused')).toBeNull();
    expect(onBody()).toBe(false);
    expect(document.activeElement!.closest('.dzg-row')).not.toBeNull();
  });

  it('by a reload without it (the host gives its rows again)', () => {
    const t = saving();
    typing(t, 'r3');
    t.g.update({ rows: rowsOf(200).filter((r) => r.id !== 'r3') });
    expect(t.field()).toBeNull();
    expect(t.held).toEqual([]);
    expect(t.loud()).toEqual([REMOVED]);
    expect(onBody()).toBe(false);
  });

  it('a reload with the same id: the field stays open with its text', () => {
    const t = saving();
    typing(t, 'r3');
    t.g.update({ rows: rowsOf(200) });
    expect(t.field()?.value).toBe('42');
    expect(t.loud()).toEqual([]);
  });

  it('removed between the blur and its task: « Row removed », not O1 « value refused »', async () => {
    const t = saving();
    typing(t, 'r3');
    // The focus leaves the field (a click outside); the row goes before the blur's task.
    const out = document.body.appendChild(document.createElement('button'));
    out.focus();
    t.g.kernel.rows.applyTransaction({ remove: ['r3'] });
    await new Promise((r) => setTimeout(r, 5));
    expect(t.held).toEqual([]);
    expect(t.loud()).toEqual([REMOVED]);
  });

  it('paints on frames (a browser): the blur\'s task runs before the frame that unmounts the row: « Row removed » from the blur, not O1', async () => {
    const queue: FrameRequestCallback[] = [];
    const raf = { requestAnimationFrame: (f: FrameRequestCallback) => queue.push(f), cancelAnimationFrame: () => {} };
    const frame = () => { for (let i = 0; queue.length && i < 20; i++) queue.shift()!(0); };
    const t = saving({ raf });
    frame();
    t.at('r3', 'n');
    frame();
    t.key('F2');
    frame();
    t.type('42');
    document.body.appendChild(document.createElement('button')).focus();
    t.g.kernel.rows.applyTransaction({ remove: ['r3'] });
    // The blur is decided one task later; no frame has run yet.
    await new Promise((r) => setTimeout(r, 5));
    expect(t.held).toEqual([]);
    expect(t.loud()).toEqual([REMOVED]);
    expect(t.of('editingStopped').at(-1)).toMatchObject({ kept: false, via: 'blur' });
    frame();
    expect(t.loud()).toEqual([REMOVED]);
  });

  it('removed while saving, then refused: saveFailed reaches the host, nothing said, no mark', async () => {
    const t = saving();
    typing(t, 'r3');
    t.key('Enter');
    expect(t.sent()).toEqual(['r3/n=42']);
    t.g.kernel.rows.applyTransaction({ remove: ['r3'] });
    t.held[0]!.no({ reason: 'nope' });
    await flush();
    await new Promise((r) => setTimeout(r, 120));
    expect(t.of('saveFailed')).toHaveLength(1);
    expect(t.loud()).toEqual([]);
    expect(t.host.querySelector('.dzg-live[aria-live="assertive"]')!.textContent).toBe('');
    expect(t.host.querySelector('.dzg-cell--failed, .dzg-cell--refused')).toBeNull();
  });
});

describe('server pages: a page or query change while open keeps and sends the typed text (O9, S7-O3)', () => {
  const COLS: ColumnDef<R, any>[] = [
    { id: 'name', header: 'Name', width: 120, editable: true },
    { id: 'n', header: 'Stock', type: 'number', width: 80, editable: true },
  ];
  const all = rowsOf(100);
  const paged = () => {
    const s = server(() => all);
    const t = saving({ columns: COLS, settings: s.settings as never });
    return { t, s };
  };

  for (const [what, cmd] of [
    ['page.go', { type: 'page.go', index: 1 }],
    ['page.size', { type: 'page.size', size: 50 }],
    ['a sort by the app', { type: 'sort.set', sort: [{ column: 'name', dir: 'desc' }] }],
    ['a filter by the app', { type: 'filter.column', column: 'n', filter: { type: 'number', op: 'gt', value: 50 } }],
  ] as const) {
    it(`${what}: the save carries the typed value before the answer; the field closes, the cell keeps the focus`, async () => {
      const { t, s } = paged();
      s.calls.at(-1)!.ok();
      await flush();
      typing(t, 'r1');
      t.g.kernel.dispatch(cmd as never, 'api');
      // Asked, not answered yet: the row is still held, the value sent.
      expect(s.calls.length).toBe(2);
      expect(t.sent()).toEqual(['r1/n=42']);
      expect(t.field()).toBeNull();
      expect(t.of('editingStopped').at(-1)).toMatchObject({ kept: true, via: 'lost' });
      expect(t.loud()).toEqual([]);
      expect(document.activeElement).toBe(t.cell('r1', 'n'));
      s.calls.at(-1)!.ok();
      await flush();
      expect(t.loud()).toEqual([]);
      expect(onBody()).toBe(false);
    });
  }

  it('a value kept at a page change, then refused: said (the row is only off the page, O9), not silenced as a removed one', async () => {
    const { t, s } = paged();
    s.calls.at(-1)!.ok();
    await flush();
    typing(t, 'r1');
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'api');
    s.calls.at(-1)!.ok();
    await flush();
    expect(t.g.kernel.rows.row(k('r1'))).toBeUndefined();
    t.held[0]!.no({ reason: 'locked' });
    await flush();
    await new Promise((r) => setTimeout(r, 120));
    expect(t.host.querySelector('.dzg-live[aria-live="assertive"]')!.textContent).toBe('Stock: not saved, locked. Previous value restored.');
  });

  it('a source answering in a microtask: kept and sent the same', async () => {
    const all2 = rowsOf(100);
    const s = server(() => all2);
    const src = { fetch: (req: Parameters<typeof s.pageOf>[0]) => Promise.resolve(s.pageOf(req)) };
    const { sourceRows } = await import('@dzgrid/core/server');
    const t = saving({ columns: COLS, settings: { ...s.settings, source: sourceRows(src) } as never });
    await flush();
    typing(t, 'r1');
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'api');
    expect(t.sent()).toEqual(['r1/n=42']);
    await flush();
    expect(t.loud()).toEqual([]);
  });

  it('a refresh of the same page with the row: the field stays open', async () => {
    const { t, s } = paged();
    s.calls.at(-1)!.ok();
    await flush();
    typing(t, 'r1');
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'api');
    expect(t.field()?.value).toBe('42');
    s.calls.at(-1)!.ok();
    await flush();
    expect(t.field()?.value).toBe('42');
    expect(t.held).toEqual([]);
  });

  it('a refresh whose answer lacks the row: removed (dropped, said once)', async () => {
    const { t, s } = paged();
    s.calls.at(-1)!.ok();
    await flush();
    typing(t, 'r1');
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'api');
    s.calls.at(-1)!.ok({ rows: all.filter((r) => r.id !== 'r1').slice(0, 20), total: 99 });
    await flush();
    expect(t.field()).toBeNull();
    expect(t.held).toEqual([]);
    expect(t.loud()).toEqual([REMOVED]);
    expect(onBody()).toBe(false);
  });

  it('a synchronous source answers inside the command: the row is gone at the notice, the text cannot be sent: « change not sent, the page changed » (review 3), never « Row removed » (the documented limit; S7-O3 C not taken)', async () => {
    const all2 = rowsOf(100);
    const s = server(() => all2);
    const src = { fetch: (req: Parameters<typeof s.pageOf>[0]) => s.pageOf(req) };
    const { sourceRows } = await import('@dzgrid/core/server');
    const t = saving({ columns: COLS, settings: { ...s.settings, source: sourceRows(src) } as never });
    typing(t, 'r1');
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'api');
    expect(t.field()).toBeNull();
    expect(t.held as Held[]).toEqual([]);
    expect(t.loud()).toEqual(['Stock: change not sent, the page changed']);
    // A query (a sort by the app) too.
    t.at('r20', 'n');
    t.key('F2');
    t.type('43');
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' }] }, 'api');
    expect(t.loud()).toEqual(['Stock: change not sent, the page changed', 'Stock: change not sent, the page changed']);
  });

describe('analyser gaps (step 7)', () => {
  it('2: a held row made read-only while open: the blur refuses it as O1 (« change cancelled »), never « Row removed »', async () => {
    const cols: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', width: 120, editable: true }, { id: 'n', header: 'Stock', type: 'number', width: 80, editable: (_r: R, c: unknown) => !(c as { ro?: boolean } | undefined)?.ro }];
    const t = saving({ columns: cols, settings: { context: { ro: false } } as never });
    typing(t, 'r3');
    t.g.update({ context: { ro: true } } as never);
    document.body.appendChild(document.createElement('button')).focus();
    await new Promise((r) => setTimeout(r, 5));
    expect(t.held).toEqual([]);
    expect(t.loud()).toEqual(['Stock: value refused, change cancelled']);
  });

  it('3: page.go from a button outside the grid while a field is open: the text sent, the focus stays on the button', async () => {
    const all = rowsOf(100);
    const s = server(() => all);
    const t = saving({ columns: [{ id: 'name', header: 'Name', width: 120, editable: true }, { id: 'n', header: 'Stock', type: 'number', width: 80, editable: true }], settings: s.settings as never });
    s.calls.at(-1)!.ok();
    await flush();
    typing(t, 'r1');
    const b = document.body.appendChild(document.createElement('button'));
    b.addEventListener('click', () => t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'api'));
    b.focus();
    b.click();
    expect(t.sent()).toEqual(['r1/n=42']);
    expect(document.activeElement).toBe(b);
    s.calls.at(-1)!.ok();
    await flush();
    await new Promise((r) => setTimeout(r, 5));
    expect(document.activeElement).toBe(b);
    expect(t.loud()).toEqual([]);
  });

  it('leak: destroyed, the grid and its features leave no listener on a server\'s rows (the editors\' page listener among them)', async () => {
    const { sourceRows } = await import('@dzgrid/core/server');
    const all = rowsOf(100);
    const s = server(() => all);
    const binding = sourceRows(s.source);
    const create = binding.create.bind(binding);
    let live = 0;
    (binding as { create: typeof create }).create = (env) => {
      const m = create(env);
      const sub = m.subscribe.bind(m);
      (m as { subscribe: typeof sub }).subscribe = (fn) => {
        live++;
        const off = sub(fn);
        return () => void (live--, off());
      };
      return m;
    };
    const t = saving({ settings: { ...s.settings, source: binding } as never });
    expect(live).toBeGreaterThan(1);
    t.g.destroy();
    expect(live).toBe(0);
  });
});
});
