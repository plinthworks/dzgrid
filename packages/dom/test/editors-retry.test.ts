// Phase 5 step 7, O2 (edit-save.md 15; step07-plan.md finding 1, « Retry »): a cell whose save the server refused
// reopens with the REFUSED value, not the last saved one; a printable key still replaces; Escape keeps the mark;
// Enter sends the refused value again (one request); a source change opens with the source; no undo entry.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { listEditor } from '../src/editors-list.js';
import { definePart, type SlotContext } from '../src/part.js';
import { dayText } from '../src/editors/dates.js';
import { cleanup, k, rowsOf, type R } from './support-editors.js';
import { flush, keep, saving } from './support-saves.js';

afterEach(cleanup);

/** r1's n is 1: « 17 » is kept, the server refuses it. */
async function refused(o: Parameters<typeof saving>[0] = {}, id = 'r1', col = 'n', text = '17') {
  const t = saving(o);
  keep(t, id, col, text);
  t.held[0]!.no({ reason: 'nope' });
  await flush();
  return t;
}

describe('retry by reopening (O2)', () => {
  it('F2 on a failed cell opens the field holding the refused text (after the 0.5 s hold too)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t = await refused();
    vi.advanceTimersByTime(600);
    expect(t.cls('r1')).toBe('failed');
    expect(t.value('r1')).toBe('1');
    t.at('r1', 'n');
    t.key('F2');
    expect(t.field()!.value).toBe('17');
  });

  it('Enter and a double click open it with the refused text too', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t = await refused();
    vi.advanceTimersByTime(600);
    t.at('r1', 'n');
    t.key('Enter');
    expect(t.field()!.value).toBe('17');
    t.key('Escape');
    t.cell('r1', 'n')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(t.field()!.value).toBe('17');
  });

  it('during the hold: the same refused value', async () => {
    const t = await refused();
    expect(t.cls('r1')).toContain('refused');
    t.at('r1', 'n');
    t.key('F2');
    expect(t.field()!.value).toBe('17');
  });

  it('a printable key still replaces the text', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t = await refused();
    vi.advanceTimersByTime(600);
    t.at('r1', 'n');
    t.key('5');
    expect(t.field()!.value).toBe('5');
  });

  it('Escape gives up: nothing sent, the mark stays, the last saved value shown', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t = await refused();
    vi.advanceTimersByTime(600);
    t.at('r1', 'n');
    t.key('F2');
    t.key('Escape');
    expect(t.held.length).toBe(1);
    expect(t.cls('r1')).toBe('failed');
    expect(t.value('r1')).toBe('1');
  });

  it('Enter on the refused text: one new request with it; saved, the mark goes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t = await refused();
    vi.advanceTimersByTime(600);
    t.at('r1', 'n');
    t.key('F2');
    t.key('Enter');
    expect(t.sent()).toEqual(['r1/n=17', 'r1/n=17']);
    t.held[1]!.ok();
    await flush();
    expect(t.cls('r1')).toBe('saved');
    expect(t.value('r1')).toBe('17');
  });

  it('the refused gesture left nothing to undo', async () => {
    const t = await refused();
    expect(t.api.canUndo).toBe(false);
    t.at('r1', 'n');
    t.key('F2');
    expect(t.api.canUndo).toBe(false);
  });

  it('the source changed meanwhile: the error goes, the field opens with the source', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t = await refused();
    vi.advanceTimersByTime(600);
    t.g.kernel.rows.applyTransaction({ update: [{ ...rowsOf(2)[1]!, n: 30 }] });
    expect(t.cls('r1')).toBe('');
    t.at('r1', 'n');
    t.key('F2');
    expect(t.field()!.value).toBe('30');
  });

  it('a day column reopens with the refused day, written as the field writes days', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    type D = R & { d: string };
    const cols: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', width: 120, editable: true }, { id: 'd', header: 'Day', type: 'day', width: 120, editable: true }];
    const rows = rowsOf(20).map((r) => ({ ...r, d: '2026-01-05' })) as D[];
    const t = saving({ lang: 'fr', columns: cols, rows: rows as never, options: { calendar: false } });
    const typed = dayText(t.ctx.ctx, '2026-03-17');
    keep(t, 'r1', 'd', typed);
    expect(t.sent()).toEqual(['r1/d=2026-03-17']);
    t.held[0]!.no({ reason: 'nope' });
    await flush();
    vi.advanceTimersByTime(600);
    t.at('r1', 'd');
    t.key('F2');
    expect(t.field()!.value).toBe(typed);
  });

  it('a list reopens on the refused option', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const ST = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }, { value: 'c', label: 'Gamma' }];
    const cols: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', width: 120, editable: true }, { id: 'st', header: 'St', type: 'enum', enumOptions: ST, width: 120, editable: true }];
    const rows = rowsOf(20).map((r) => ({ ...r, st: 'a' }));
    const t = saving({ columns: cols, rows: rows as never, options: { list: listEditor } });
    t.api.commit([{ key: k('r1'), column: 'st', input: { value: 'c' } }]);
    t.held[0]!.no({ reason: 'nope' });
    await flush();
    vi.advanceTimersByTime(600);
    expect(t.value('r1', 'st')).toBe('Alpha');
    t.at('r1', 'st');
    t.key('F2');
    const combo = t.host.querySelector<HTMLElement>('.dzg-combo')!;
    expect(combo.textContent).toBe('Gamma');
  });

  it('the application\'s editor is given the refused value and its text', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const seen: { value: unknown; text: string }[] = [];
    const part = definePart('editor', {
      mount(host, c: SlotContext['editor']) {
        seen.push({ value: c.value, text: c.text });
        const i = host.appendChild(document.createElement('input'));
        return { focus: () => (i.focus(), true), read: () => ({ text: i.value }) };
      },
    });
    const cols: ColumnDef<R, any>[] = [{ id: 'name', header: 'Name', width: 120, editable: true }, { id: 'n', header: 'Stock', type: 'number', width: 80, editable: true, edit: { editor: 'mine' } }];
    const t = saving({ columns: cols, settings: { parts: { mine: part } } as never });
    t.api.commit([{ key: k('r1'), column: 'n', input: { text: '17' } }]);
    t.held[0]!.no({ reason: 'nope' });
    await flush();
    vi.advanceTimersByTime(600);
    t.at('r1', 'n');
    t.key('F2');
    expect(seen.at(-1)).toEqual({ value: 17, text: '17' });
  });

  it('analyser 1: a failed cell scrolled out, reached again by the API focus, F2: the refused text', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const t = await refused();
    vi.advanceTimersByTime(600);
    t.at('r150', 'n');
    t.scroll(150 * 32);
    expect(t.cell('r1', 'n')).toBeNull();
    t.g.api.focusCell(k('r1'), 'n');
    t.key('F2');
    expect(t.field()!.value).toBe('17');
  });
});
