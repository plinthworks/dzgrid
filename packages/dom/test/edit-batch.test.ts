// Batch editing (1.15.0, docs/behaviors/edit-batch.md): `editBatch()` beside `edit()` keeps every gesture pending
// until `saveAll()` (one request) or `discardAll()`. Written before the code; expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef, GridEvent } from '@dzgrid/core';
import { editBatch } from '../src/edit-batch.js';
import { EN_FORMS } from '../src/locales/en-forms.js';
import { AR_FORMS } from '../src/locales/ar-forms.js';
import { BASE, EDIT, EDITORS, ECOLS, cleanup, join, k, rowsOf, type R } from './support-editors.js';
import { flush, keep, saving, server } from './support-saves.js';

afterEach(cleanup);

const batched = (o: { columns?: ColumnDef<R, any>[]; validateRow?: Parameters<typeof editBatch<R>>[0] extends infer X ? X extends { validateRow?: infer V } ? V : never : never; lang?: 'en' | 'ar'; settings?: object; paste?: 'pending' } = {}) => {
  const b = editBatch<R>({ ...(o.validateRow && { validateRow: o.validateRow }), ...(o.paste && { paste: o.paste }) });
  const lang = o.lang ?? 'en';
  const t = saving({
    lang, ...(o.columns && { columns: o.columns }),
    features: (e, x) => [e, x, b],
    settings: { messages: join(BASE[lang], EDIT[lang], EDITORS[lang], lang === 'ar' ? AR_FORMS : EN_FORMS), ...o.settings } as never, // the four bundles joined
  });
  const bapi = () => b.api(t.g)!;
  const counts = () => t.events.filter((e): e is Extract<GridEvent<R>, { type: 'pendingChange' }> => e.type === 'pendingChange').map((e) => e.count);
  const list = () => bapi().pending().map((p) => `${String(p.key).replace(/^d:\d+:/, '')}/${p.column}:${String(p.previous)}→${String(p.value)}`);
  return { ...t, b, bapi, counts, list };
};

describe('kept, not sent (edit-batch.md 2–4)', () => {
  it('a kept field shows its value, sends nothing, is marked « Not saved » and listed', () => {
    const t = batched();
    keep(t, 'r3', 'n', '42');
    expect(t.value('r3')).toBe('42');
    expect(t.held).toEqual([]);
    expect(t.cell('r3', 'n')!.classList.contains('dzg-cell--unsaved')).toBe(true);
    expect(t.descOf('r3')).toContain('Not saved');
    expect(t.list()).toEqual(['r3/n:3→42']);
    expect(t.bapi().count).toBe(1);
    expect(t.counts()).toEqual([1]);
    expect(t.bapi().pending()[0]!.row).toMatchObject({ id: 'r3', n: 3 });
  });

  it('a cell changed twice is one change whose previous stays the saved value; typed back, it leaves the list', () => {
    const t = batched();
    keep(t, 'r3', 'n', '42');
    keep(t, 'r3', 'n', '43');
    expect(t.list()).toEqual(['r3/n:3→43']);
    keep(t, 'r3', 'n', '3');
    expect(t.list()).toEqual([]);
    expect(t.value('r3')).toBe('3');
    expect(t.cell('r3', 'n')!.classList.contains('dzg-cell--unsaved')).toBe(false);
    expect(t.descOf('r3')).not.toContain('Not saved');
    expect(t.counts()).toEqual([1, 0]);
  });

  it('a refused value never becomes pending (the column rule refuses at keep)', () => {
    const t = batched();
    keep(t, 'r3', 'n', '-1');
    expect(t.list()).toEqual([]);
    expect(t.field()).not.toBeNull();
  });

  it("several cells in one commit (a paste kept by paste: 'pending'): one gesture of pending changes, one undo", () => {
    const t = batched({ paste: 'pending' });
    t.e.api(t.g)!.commit([{ key: k('r1'), column: 'n', input: { text: '10' } }, { key: k('r2'), column: 'q', input: { text: '20' } }], { origin: 'paste' });
    expect(t.list()).toEqual(['r1/n:1→10', 'r2/q:74→20']);
    expect(t.held).toEqual([]);
    t.e.api(t.g)!.undo();
    expect(t.list()).toEqual([]);
    expect(t.value('r1')).toBe('1');
  });

  it('in Arabic the mark is described in Arabic', () => {
    const t = batched({ lang: 'ar' });
    keep(t, 'r3', 'n', '42');
    expect(t.descOf('r3')).toContain('غير محفوظ');
  });
});

describe('saveAll (edit-batch.md 5–8)', () => {
  it('sends every pending change in one request, origin batch, previous the saved values; resolves once answered', async () => {
    const t = batched();
    keep(t, 'r1', 'n', '10');
    keep(t, 'r2', 'q', '20');
    keep(t, 'r1', 'name', 'Uno');
    const p = t.bapi().saveAll();
    expect(t.held).toHaveLength(1);
    expect(t.held[0]!.req.origin).toBe('batch');
    expect(t.sent()).toEqual(['r1/n=10,r2/q=20,r1/name=Uno']);
    expect(t.held[0]!.req.changes.map((c) => c.previous)).toEqual([1, 74, 'Name 1']);
    expect(t.list()).toEqual([]);
    expect(t.cls('r1')).toBe('saving');
    let done: unknown = null;
    void p.then((r) => (done = r));
    await flush();
    expect(done).toBeNull();
    t.held[0]!.ok();
    await flush();
    expect(done).toEqual({ sent: 3, refused: [] });
    expect(t.cls('r1')).toBe('saved');
    expect(t.value('r1')).toBe('10');
    expect(t.counts()).toEqual([1, 2, 3, 0]);
  });

  it('the application refuses one cell: only it goes back with its reason, the others saved; listed in the result', async () => {
    const t = batched();
    keep(t, 'r1', 'n', '10');
    keep(t, 'r2', 'n', '20');
    const p = t.bapi().saveAll();
    t.held[0]!.no({ cells: [{ key: 'r2', column: 'n', reason: 'Locked by stock' }] });
    const r = await p;
    expect(r).toEqual({ sent: 2, refused: [{ key: k('r2'), column: 'n', code: null, reason: 'Locked by stock' }] });
    expect(t.value('r1')).toBe('10');
    // The refused value blinks for its 0.5 s (edit-validation.md 2), then the saved one is back.
    await new Promise((ok) => setTimeout(ok, 600));
    expect(t.value('r2')).toBe('2');
    expect(t.cls('r2')).toContain('failed');
    expect(t.bapi().count).toBe(0);
  });

  it('a value that fails its column rule now: nothing is sent, said assertively, the cells stay pending', async () => {
    // Stock may not exceed the price: the rule reads the row as it is when checked.
    const cols: ColumnDef<R, any>[] = ECOLS.map((c) => (c.id === 'n' ? { ...c, validate: (v: number, r: R) => (v > r.q ? 'max' : null) } : c));
    const t = batched({ columns: cols });
    keep(t, 'r2', 'n', '50');
    expect(t.list()).toEqual(['r2/n:2→50']);
    // The application lowers the price under it (its own row, same key).
    t.g.kernel.rows.kind === 'client' && (t.g.kernel.rows as never as { applyTransaction(x: object): void }).applyTransaction({ update: [{ ...rowsOf(3)[2]!, q: 10 }] }); // the client model's own transaction
    const r = await t.bapi().saveAll();
    expect(r.sent).toBe(0);
    expect(r.refused).toEqual([{ key: k('r2'), column: 'n', code: 'max', reason: null }]);
    expect(t.held).toEqual([]);
    expect(t.loud().at(-1)).toMatch(/^Nothing sent: Stock, /);
    expect(t.list()).toEqual(['r2/n:2→50']);
  });

  it('validateRow refuses a row: nothing is sent, the refusal on its column', async () => {
    const t = batched({ validateRow: (v) => ((v['n'] as number) > (v['q'] as number) ? { column: 'q', code: 'min' } : null) });
    keep(t, 'r1', 'n', '5');
    keep(t, 'r2', 'n', '90');
    const r = await t.bapi().saveAll();
    expect(r).toEqual({ sent: 0, refused: [{ key: k('r2'), column: 'q', code: 'min', reason: null }] });
    expect(t.held).toEqual([]);
    expect(t.loud().at(-1)).toMatch(/^Nothing sent: Price, /);
  });

  it('nothing pending: resolves at once, nothing sent', async () => {
    const t = batched();
    expect(await t.bapi().saveAll()).toEqual({ sent: 0, refused: [] });
    expect(t.held).toEqual([]);
  });

  it('a change made while a batch is being saved is pending again (a next batch)', async () => {
    const t = batched();
    keep(t, 'r1', 'n', '10');
    const p = t.bapi().saveAll();
    keep(t, 'r1', 'n', '11');
    expect(t.list()).toEqual(['r1/n:1→11']);
    t.held[0]!.ok();
    await p;
    expect(t.held).toHaveLength(1);
    expect(t.list()).toEqual(['r1/n:10→11']);
  });
});

describe('discard (edit-batch.md 5)', () => {
  it('discardAll: the saved values back, nothing sent, said; discard(key) one row only', () => {
    const t = batched();
    keep(t, 'r1', 'n', '10');
    keep(t, 'r2', 'n', '20');
    keep(t, 'r2', 'q', '30');
    expect(t.bapi().discard(k('r2'), 'q')).toBe(1);
    expect(t.list()).toEqual(['r1/n:1→10', 'r2/n:2→20']);
    expect(t.bapi().discard(k('r2'))).toBe(1);
    expect(t.value('r2')).toBe('2');
    expect(t.bapi().discardAll()).toBe(1);
    expect(t.value('r1')).toBe('1');
    expect(t.list()).toEqual([]);
    expect(t.held).toEqual([]);
    expect(t.polite()).toContain('1 change discarded');
    expect(t.cell('r1', 'n')!.classList.contains('dzg-cell--unsaved')).toBe(false);
    expect(t.counts().at(-1)).toBe(0);
  });
});

describe('undo across pending changes (edit-batch.md 9)', () => {
  it('Ctrl+Z gives the last gesture back; undone to the saved value it leaves the list; redo brings it back', () => {
    const t = batched();
    keep(t, 'r1', 'n', '10');
    keep(t, 'r2', 'n', '20');
    t.at('r2', 'n');
    t.key('z', { ctrlKey: true });
    expect(t.list()).toEqual(['r1/n:1→10']);
    t.key('y', { ctrlKey: true });
    expect(t.list()).toEqual(['r1/n:1→10', 'r2/n:2→20']);
    expect(t.held).toEqual([]);
  });
});

describe('rows that move or leave (edit-batch.md 10)', () => {
  it('sorted and filtered away then back: kept and shown; a row the application removes: its changes go', () => {
    const t = batched();
    keep(t, 'r1', 'n', '10');
    keep(t, 'r2', 'n', '20');
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: { type: 'number', op: 'gt', value: 15 } }, 'api');
    expect(t.cell('r1', 'n')).toBeNull();
    expect(t.list()).toEqual(['r1/n:1→10', 'r2/n:2→20']);
    t.g.kernel.dispatch({ type: 'filter.column', column: 'n', filter: null }, 'api');
    expect(t.value('r1')).toBe('10');
    expect(t.cell('r1', 'n')!.classList.contains('dzg-cell--unsaved')).toBe(true);
    (t.g.kernel.rows as never as { applyTransaction(x: object): void }).applyTransaction({ remove: ['r2'] }); // the client model's own transaction
    expect(t.list()).toEqual(['r1/n:1→10']);
    expect(t.counts().at(-1)).toBe(1);
  });

  it('a server source: kept by key on another page and shown again when the page comes back', async () => {
    const all = rowsOf(60);
    const s = server(() => all);
    const t = batched({ settings: s.settings });
    s.calls.at(-1)!.ok();
    await flush();
    keep(t, 'r1', 'n', '42');
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'api');
    s.calls.at(-1)!.ok();
    await flush();
    expect(t.cell('r1', 'n')).toBeNull();
    expect(t.list()).toEqual(['r1/n:1→42']);
    t.g.kernel.dispatch({ type: 'page.go', index: 0 }, 'api');
    s.calls.at(-1)!.ok();
    await flush();
    expect(t.value('r1')).toBe('42');
    expect(t.cell('r1', 'n')!.classList.contains('dzg-cell--unsaved')).toBe(true);
    expect(t.held).toEqual([]);
  });
});

describe('set up', () => {
  it('without edit(): one missing-feature warning, no api', () => {
    const b = editBatch<R>();
    const t = saving({ features: (_e, x) => [x, b], settings: { messages: join(BASE.en, EDIT.en, EDITORS.en, EN_FORMS) } as never }); // the four bundles joined
    expect(b.api(t.g)).toBeNull();
    expect(t.events.some((e) => e.type === 'problems' && e.problems.some((p) => p.code === 'missing-feature' && p.path === 'features.editBatch'))).toBe(true);
  });

  it('without its texts it refuses to start, naming them', () => {
    expect(() => saving({ features: (e, x) => [e, x, editBatch<R>()] })).toThrow(/editBatch: missing edit\.unsaved, edit\.discarded, edit\.notSent/);
  });
});
