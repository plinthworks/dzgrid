// The application's editor (Phase 5 step 6, step06-plan « Behaviour » 18–19; editors.md 18–19; parts.md): a part
// of slot `editor`, named by `edit.editor` or replacing a type's built-in (`editor.<type>`); its context; keep,
// cancel, refuse, own; Enter / Tab / Escape reaching its root not prevented; read() at a blur (O1); a part that
// throws; destroy before the host is emptied.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef } from '@dzgrid/core';
import { definePart, type SlotContext } from '../src/part.js';
import { ed, cleanup, layout, rowsOf, tick, type R } from './support-editors.js';

afterEach(cleanup);
type C = SlotContext['editor'];
type Row = R & { c: string | null; d: string };

/** A colour editor: one input of its own; `read` gives its text. */
function colour(o: { focus?: boolean; read?: boolean; prevent?: boolean; onMount?: (c: C, host: HTMLElement) => void; mountThrows?: boolean } = {}) {
  const log: string[] = [];
  let ctx: C | null = null;
  const part = definePart('editor', {
    mount(host, c) {
      if (o.mountThrows) throw new Error('mount');
      ctx = c;
      const i = document.createElement('input');
      i.className = 'colour';
      i.value = c.char ?? c.text;
      if (o.prevent) i.addEventListener('keydown', (e) => e.key === 'Enter' && e.preventDefault());
      host.append(i);
      log.push(`mount ${host.isConnected}`);
      o.onMount?.(c, host);
      return {
        focus: () => (o.focus === false ? false : (i.focus(), true)),
        ...(o.read !== false && { read: () => ({ text: i.value }) }),
        destroy: () => log.push(`destroy ${host.contains(i)}`),
      };
    },
  });
  return { part, log, ctx: () => ctx!, input: () => document.querySelector<HTMLInputElement>('input.colour') };
}
const COLS: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'c', header: 'Couleur', width: 120, editable: true, edit: { editor: 'colour', pattern: '#[0-9a-f]{6}' } },
  { id: 'd', header: 'Jour', type: 'day', width: 120, editable: true },
];
const grid = (p: ReturnType<typeof colour>, o: { cols?: ColumnDef<Row, any>[]; name?: string } = {}) => {
  const t = ed({ lang: 'fr', columns: (o.cols ?? COLS) as never, rows: rowsOf(10).map((r) => ({ ...r, c: '#ff0000', d: '2026-03-29' })) as never, settings: { parts: { [o.name ?? 'colour']: p.part }, context: { app: 1 }, locale: 'fr-FR', timeZone: 'UTC' } as never });
  const saved = () => t.of('cellEdited').map((e) => [e.column, e.value]);
  const host = () => t.host.querySelector<HTMLElement>('.dzg-editor');
  return { ...t, saved, host };
};

describe('the application’s editor', () => {
  it('mounted in a host in the cell, focused by its focus(); its context: value, text, row, key, column, start, char, the base', () => {
    const p = colour();
    const t = grid(p);
    t.at('r2', 'c');
    t.key('F2');
    const h = t.host()!;
    expect(h.closest('.dzg-cell')).toBe(t.cell('r2', 'c'));
    expect(h.getAttribute('data-dzg-owner')).toBe('editor');
    expect(document.activeElement).toBe(p.input());
    const c = p.ctx();
    expect([c.value, c.text, (c.row as Row).id, c.column.id, c.start, c.char, c.context, c.dir]).toEqual(['#ff0000', '#ff0000', 'r2', 'c', 'f2', undefined, { app: 1 }, 'ltr']);
    expect(String(c.key)).toMatch(/r2$/);
    expect(p.log).toEqual(['mount true']);
    expect(t.of('editingStarted').map((e) => e.start)).toEqual(['f2']);
  });

  it('a character opens it with start key and the char; focus() false: the host itself is focused', () => {
    const p = colour({ focus: false });
    const t = grid(p);
    t.at('r2', 'c');
    t.key('x');
    expect(p.ctx().start).toBe('key');
    expect(p.ctx().char).toBe('x');
    expect(document.activeElement).toBe(t.host());
  });

  it('keep(input): through the column’s checks and the save, closed, moves as Enter; refused: stays open, the bubble, one sentence', () => {
    layout();
    const p = colour();
    const t = grid(p);
    t.at('r2', 'c');
    t.key('F2');
    expect(p.ctx().keep({ text: 'red' })).toBe(false);
    expect(t.host()).not.toBeNull();
    expect(t.bubble()!.hidden).toBe(false);
    expect(t.alert).toHaveBeenCalledTimes(1);
    expect(p.ctx().keep({ text: '#00ff00' })).toBe(true);
    expect(t.saved()).toEqual([['c', '#00ff00']]);
    expect(t.host()).toBeNull();
    expect(t.focusAt()).toBe('r3/c');
    expect(p.log).toEqual(['mount true', 'destroy true']);
  });

  it('cancel() gives up; refuse(code): the bubble, the blink, the sentence of that code, stays open', () => {
    layout();
    const p = colour();
    const t = grid(p);
    const blink = vi.spyOn(t.api, 'refuse');
    t.at('r2', 'c');
    t.key('F2');
    p.ctx().refuse('pattern');
    expect(blink).toHaveBeenCalled();
    expect(t.bubble()!.textContent).toBe(t.api.reason('c', 'pattern'));
    expect(t.host()).not.toBeNull();
    p.ctx().cancel();
    expect(t.host()).toBeNull();
    expect(t.saved()).toEqual([]);
    expect(t.focusAt()).toBe('r2/c');
  });

  it('Enter, Tab, Escape reaching its root not prevented: read() kept and moved / kept and next / given up', () => {
    const p = colour();
    const t = grid(p);
    t.at('r2', 'c');
    t.key('F2');
    p.input()!.value = '#0000ff';
    t.key('Enter', {}, p.input()!);
    expect(t.saved()).toEqual([['c', '#0000ff']]);
    expect(t.focusAt()).toBe('r3/c');
    t.key('F2');
    p.input()!.value = '#111111';
    t.key('Tab', {}, p.input()!);
    expect(t.saved()).toEqual([['c', '#0000ff'], ['c', '#111111']]);
    expect(t.focusAt()).toBe('r3/d');
    t.key('Escape', {}, t.field()!);
    t.at('r4', 'c');
    t.key('F2');
    p.input()!.value = '#222222';
    t.key('Escape', {}, p.input()!);
    expect(t.saved()).toHaveLength(2);
  });

  it('a key the part prevented is the part’s: Enter it prevented keeps nothing; without read(), Enter closes and keeps nothing', () => {
    let p = colour({ prevent: true });
    let t = grid(p);
    t.at('r2', 'c');
    t.key('F2');
    t.key('Enter', {}, p.input()!);
    expect(t.host()).not.toBeNull();
    expect(t.saved()).toEqual([]);
    cleanup();
    p = colour({ read: false });
    t = grid(p);
    t.at('r2', 'c');
    t.key('F2');
    t.key('Enter', {}, p.input()!);
    expect(t.host()).toBeNull();
    expect(t.saved()).toEqual([]);
  });

  it('a blur keeps read(); refused: O1 (dropped, the last value back, the sentence)', async () => {
    const p = colour();
    const t = grid(p);
    const out = document.body.appendChild(document.createElement('button'));
    t.at('r2', 'c');
    t.key('F2');
    p.input()!.value = '#333333';
    out.focus();
    await tick();
    expect(t.saved()).toEqual([['c', '#333333']]);
    t.at('r4', 'c');
    t.key('F2');
    p.input()!.value = 'nope';
    out.focus();
    await tick();
    expect(t.host()).toBeNull();
    expect(t.saved()).toHaveLength(1);
    expect(String(t.alert.mock.calls.at(-1)![0])).toMatch(/modification annulée/);
  });

  it('own(el): focus in a node of the part outside the cell is no blur; after its disposer it is', async () => {
    const pop = document.body.appendChild(document.createElement('div'));
    const b = pop.appendChild(document.createElement('button'));
    let off: () => void = () => {};
    const p = colour({ onMount: (c) => (off = c.own(pop)) });
    const t = grid(p);
    t.at('r2', 'c');
    t.key('F2');
    b.focus();
    await tick();
    expect(t.host()).not.toBeNull();
    p.input()!.focus();
    off();
    b.focus();
    await tick();
    expect(t.host()).toBeNull();
  });

  it('editor.<type> replaces that type’s built-in editor', () => {
    const p = colour();
    const t = grid(p, { name: 'editor.day' });
    t.at('r2', 'd');
    t.key('F2');
    expect(t.host()).not.toBeNull();
    expect(t.field()).toBeNull();
    expect(p.ctx().value).toBe('2026-03-29');
  });

  it('an unknown name: told once (unknown-part), nothing opens', () => {
    const p = colour();
    const t = grid(p, { name: 'other' });
    t.at('r2', 'c');
    t.key('F2');
    t.at('r3', 'c');
    t.key('F2');
    expect(t.host()).toBeNull();
    const ps = t.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string }[] }).problems).filter((x) => x.code === 'unknown-part');
    expect(ps).toEqual([expect.objectContaining({ path: 'columns.c.edit.editor' })]);
  });

  it('a mount that throws: reported, the editor closed, not tried again on that cell until its data changes', () => {
    const reported: unknown[] = [];
    (window as unknown as { reportError: unknown }).reportError = (e: unknown) => void reported.push(e);
    const p = colour({ mountThrows: true });
    const t = grid(p);
    t.at('r2', 'c');
    t.key('F2');
    expect(reported).toHaveLength(1);
    expect(t.host()).toBeNull();
    expect(document.activeElement).toBe(t.cell('r2', 'c'));
    t.key('F2');
    expect(reported).toHaveLength(1);
    delete (window as unknown as { reportError?: unknown }).reportError;
  });

  it('destroyed before its host is emptied; nothing left in the cell once closed', () => {
    const p = colour();
    const t = grid(p);
    t.at('r2', 'c');
    t.key('F2');
    t.key('Escape', {}, p.input()!);
    expect(p.log).toEqual(['mount true', 'destroy true']);
    expect(t.cell('r2', 'c')!.querySelector('.dzg-editor, input')).toBeNull();
  });
});
