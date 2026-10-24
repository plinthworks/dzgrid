// Phase 5 step 7, server-paged grids (owner Q18, S2-O2; edit-save.md 17–18, edit-reapply.md 7a; step07-plan.md
// finding 5, « Server-paged grids »): the saved value shows until an answer carries the row; `pending` and `saving`
// stay over an answer; DzGrid asks nothing after a save; the reapply asks the page again once and says « back in
// order » at the answer that puts it in order (its count), never at the click, never after a failed request.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { cleanup, k, rowsOf, type R } from './support-editors.js';
import { flush, saving, server } from './support-saves.js';

afterEach(cleanup);

const COLS: ColumnDef<R, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'n', header: 'Stock', type: 'number', width: 80, editable: true },
];

async function paged() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const all = rowsOf(100);
  const s = server(() => all, 20);
  const t = saving({ columns: COLS, settings: s.settings as never });
  s.calls.at(-1)!.ok();
  await flush();
  const put = (id: string, text: string) => t.api.commit([{ key: k(id), column: 'n', input: { text } }]);
  return { t, s, all, put };
}

describe('saves on server pages (Q18)', () => {
  it('saved: the value stays shown, no request; the check for 1.5 s', async () => {
    const { t, s, put } = await paged();
    put('r1', '42');
    t.held[0]!.ok();
    await flush();
    expect(t.value('r1')).toBe('42');
    expect(t.cls('r1')).toBe('saved');
    expect(s.calls.length).toBe(1);
    vi.advanceTimersByTime(1500);
    expect(t.cls('r1')).toBe('');
    expect(t.value('r1')).toBe('42');
    expect(s.calls.length).toBe(1);
  });

  it('the application\'s refresh: one request; its answer\'s value shows (the server\'s), the check goes at once', async () => {
    const { t, s, put } = await paged();
    put('r1', '42');
    t.held[0]!.ok();
    await flush();
    expect(t.cls('r1')).toBe('saved');
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'api');
    expect(s.calls.length).toBe(2);
    // The server did not keep it (its own rule): its answer is what shows.
    s.calls.at(-1)!.ok();
    await flush();
    expect(t.value('r1')).toBe('1');
    expect(t.cls('r1')).toBe('');
    expect(t.host.querySelector('.dzg-flash')).toBeNull();
  });

  it('an answer carrying the saved value: shown, no flash', async () => {
    const { t, s, all, put } = await paged();
    put('r1', '42');
    t.held[0]!.ok();
    await flush();
    all[1] = { ...all[1]!, n: 42 };
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'api');
    s.calls.at(-1)!.ok();
    await flush();
    expect(t.value('r1')).toBe('42');
    expect(t.host.querySelector('.dzg-flash')).toBeNull();
  });

  it('pending and saving stay over an answer: the value and the border kept', async () => {
    const { t, s, put } = await paged();
    put('r1', '42');
    put('r1', '43');
    expect([t.cls('r1'), t.value('r1')]).toEqual(['pending', '43']);
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'api');
    s.calls.at(-1)!.ok();
    await flush();
    expect([t.cls('r1'), t.value('r1')]).toEqual(['pending', '43']);
    t.held[0]!.ok();
    await flush();
    expect([t.cls('r1'), t.value('r1')]).toEqual(['saving', '43']);
    t.g.kernel.dispatch({ type: 'rows.refresh' }, 'api');
    s.calls.at(-1)!.ok();
    await flush();
    expect([t.cls('r1'), t.value('r1')]).toEqual(['saving', '43']);
    expect(t.descOf('r1')).toBe('Saving');
  });
});

describe('reapply on server pages (S2-O2, edit-reapply.md 7a)', () => {
  const sorted = async () => {
    const x = await paged();
    x.t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'api');
    x.s.calls.at(-1)!.ok();
    await flush();
    x.put('r1', '500');
    x.t.held[0]!.ok();
    await flush();
    expect(x.t.g.kernel.orderStale).toBe(true);
    const mark = () => x.t.host.querySelector<HTMLElement>('.dzg-hcell[data-col="n"] .dzg-reapply');
    expect(mark()).not.toBeNull();
    x.t.announce.mockClear();
    return { ...x, mark };
  };

  it('a press on the mark: one request; « Back in order » said at the answer, with its count, not at the press', async () => {
    const { t, s, mark } = await sorted();
    const before = s.calls.length;
    mark()!.click();
    await flush();
    expect(s.calls.length).toBe(before + 1);
    expect(t.polite().join(' ')).not.toMatch(/Back in order/);
    s.calls.at(-1)!.ok({ rows: rowsOf(100).slice(0, 7), total: 7 });
    await flush();
    expect(t.polite()).toContain('Back in order, 7 rows');
    expect(mark()).toBeNull();
    expect(document.activeElement).toBe(t.host.querySelector('.dzg-hcell[data-col="n"]'));
  });

  it('a failed request: nothing said, the mark kept; a later answer says nothing of it', async () => {
    const { t, s, mark } = await sorted();
    mark()!.click();
    s.calls.at(-1)!.no(new Error('down'));
    await flush();
    expect(t.polite().join(' ')).not.toMatch(/Back in order/);
    expect(t.g.kernel.orderStale).toBe(true);
    expect(mark()).not.toBeNull();
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'api');
    s.calls.at(-1)!.ok();
    await flush();
    expect(t.polite().join(' ')).not.toMatch(/Back in order/);
  });

  it('the application\'s reapply: one request, the same key, nothing said', async () => {
    const { t, s } = await sorted();
    const key = s.calls.at(-1)!.req.key;
    t.api.reapply();
    expect(s.calls.length).toBeGreaterThan(0);
    expect(s.calls.at(-1)!.req.key).toBe(key);
    s.calls.at(-1)!.ok();
    await flush();
    expect(t.g.kernel.orderStale).toBe(false);
    expect(t.polite().join(' ')).not.toMatch(/Back in order/);
  });

  it('review 4: a page asked while typing on a sorted column: the text leaves after the request; that page\'s answer keeps the mark (it knew nothing of the save)', async () => {
    const { t, s } = await paged();
    t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'api');
    s.calls.at(-1)!.ok();
    await flush();
    t.at('r1', 'n');
    t.key('F2');
    t.type('500');
    t.g.kernel.dispatch({ type: 'page.go', index: 1 }, 'api');
    expect(t.sent()).toEqual(['r1/n=500']);
    s.calls.at(-1)!.ok();
    await flush();
    t.held[0]!.ok();
    await flush();
    expect(t.g.kernel.orderStale).toBe(true);
    expect(t.host.querySelector('.dzg-hcell[data-col="n"] .dzg-reapply')).not.toBeNull();
  });
});

