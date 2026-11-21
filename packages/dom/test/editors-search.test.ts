// The searching list (1.15.0, docs/behaviors/editors.md 23–29): `edit: { search }` with
// `editors({ search: searchEditor })`. Written before the code; expectations by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { ColumnDef, EnumOption } from '@dzgrid/core';
import { searchEditor } from '../src/editors-search.js';
import { EN_FORMS } from '../src/locales/en-forms.js';
import { BASE, EDIT, EDITORS, cleanup, ed, join, settle, type R } from './support-editors.js';

afterEach(cleanup);

type Ask = { text: string; signal: AbortSignal; ok(v: readonly EnumOption[]): void; no(e: unknown): void };
const CITIES = ['Oran', 'Orléans', 'Osaka', 'Oslo'];

const grid = (o: { bare?: boolean; answer?: 'promise' | 'list' | 'observable'; options?: boolean } = {}) => {
  const asks: Ask[] = [];
  const search = (text: string, x: { signal: AbortSignal }) => {
    if (o.answer === 'list') return CITIES.filter((c) => c.startsWith(text)).map((c) => ({ value: c }));
    if (o.answer === 'observable') {
      return { subscribe: (s: { next(v: readonly EnumOption[]): void }) => (s.next([{ value: 'Oslo' }]), { unsubscribe: () => void asks.push({ text: 'unsubscribed' } as Ask) }) };
    }
    return new Promise<readonly EnumOption[]>((ok, no) => void asks.push({ text, signal: x.signal as AbortSignal, ok, no }));
  };
  const cols: ColumnDef<R, any>[] = [
    { id: 'name', header: 'Name', width: 120, editable: true },
    { id: 's', header: 'City', width: 120, editable: true, edit: { search: search as never, ...(o.options && { options: [{ value: 'Paris' }] }) } }, // the test's search, typed loosely
  ];
  const t = ed({ columns: cols, rows: [{ id: 'r0', name: 'Ann', n: 1, s: 'Oran', q: 0 }, { id: 'r1', name: 'Ben', n: 2, s: '', q: 0 }], options: o.bare ? {} : { search: searchEditor }, settings: { messages: join(BASE.en, EDIT.en, EDITORS.en, EN_FORMS) } as never }); // the four bundles joined
  const box = () => t.host.querySelector<HTMLInputElement>('input.dzg-field');
  const list = () => document.querySelector<HTMLElement>('.dzg-search');
  const opts = () => [...(list()?.querySelectorAll<HTMLElement>('[role=option]') ?? [])].map((x) => x.textContent);
  const note = () => list()?.querySelector<HTMLElement>('.dzg-search-note')?.textContent ?? null;
  const open = (id = 'r0') => (t.at(id, 's'), t.key('F2'), box()!);
  const press = (key: string, init: KeyboardEventInit = {}) => t.key(key, init, box()!);
  const typing = (text: string) => {
    const b = box()!;
    b.value = text;
    b.dispatchEvent(new Event('input', { bubbles: true }));
  };
  return { ...t, asks, box, list, opts, note, open, press, typing };
};

describe('the searching list (editors.md 23–29)', () => {
  it('opens an editable combobox with the cell text, asks at once, shows « Searching… » and the busy list', async () => {
    const t = grid();
    const b = t.open();
    expect(b.getAttribute('role')).toBe('combobox');
    expect(b.getAttribute('aria-autocomplete')).toBe('list');
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(b.getAttribute('aria-label')).toBe('City, Ann');
    expect(b.value).toBe('Oran');
    expect(t.asks.map((a) => a.text)).toEqual(['Oran']);
    expect(t.note()).toBe('Searching…');
    expect(t.list()!.querySelector('[role=listbox]')!.getAttribute('aria-busy')).toBe('true');
    t.asks[0]!.ok([{ value: 'Oran' }, { value: 'Orléans', label: 'Orléans (FR)' }]);
    await settle();
    expect(t.opts()).toEqual(['Oran', 'Orléans (FR)']);
    expect(t.note()).toBe('');
    expect(t.list()!.querySelector('[role=listbox]')!.hasAttribute('aria-busy')).toBe(false);
    // The cell's own value is the active option, not a pick.
    expect(document.getElementById(b.getAttribute('aria-activedescendant')!)!.textContent).toBe('Oran');
  });

  it('asks 250 ms after the last keystroke; a newer ask aborts the one before and its late answer is ignored', async () => {
    vi.useFakeTimers();
    const t = grid();
    t.open();
    t.typing('Os');
    vi.advanceTimersByTime(200);
    t.typing('Osl');
    vi.advanceTimersByTime(249);
    expect(t.asks.map((a) => a.text)).toEqual(['Oran']);
    vi.advanceTimersByTime(1);
    expect(t.asks.map((a) => a.text)).toEqual(['Oran', 'Osl']);
    expect(t.asks[0]!.signal.aborted).toBe(true);
    t.asks[1]!.ok([{ value: 'Oslo' }]);
    t.asks[0]!.ok([{ value: 'Oran' }]);
    await settle();
    expect(t.opts()).toEqual(['Oslo']);
  });

  it('no result and a failed search are shown and said; typing again asks again', async () => {
    vi.useFakeTimers();
    const t = grid();
    const said = vi.spyOn(t.ctx.live, 'announce');
    t.open();
    t.asks[0]!.ok([]);
    await settle();
    expect(t.note()).toBe('No result');
    t.typing('x');
    vi.advanceTimersByTime(250);
    t.asks[1]!.no(new Error('offline'));
    await settle();
    expect(t.note()).toBe('Search failed');
    expect(t.opts()).toEqual([]);
    expect(said.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['Searching…', 'No result', 'Search failed']));
    t.typing('y');
    vi.advanceTimersByTime(250);
    expect(t.asks).toHaveLength(3);
  });

  it('Down moves the active option, Enter keeps it; Enter without a pick changes nothing', async () => {
    const t = grid();
    const b = t.open();
    t.asks[0]!.ok(CITIES.map((value) => ({ value })));
    await settle();
    t.press('ArrowDown');
    expect(document.getElementById(b.getAttribute('aria-activedescendant')!)!.textContent).toBe('Orléans');
    t.press('Enter');
    expect(t.box()).toBeNull();
    expect(t.of('cellEdited').map((e) => e.value)).toEqual(['Orléans']);
    expect(t.value('r0', 's')).toBe('Orléans');
    t.open();
    t.asks[1]!.ok(CITIES.map((value) => ({ value })));
    await settle();
    t.press('Enter');
    expect(t.of('cellEdited')).toHaveLength(1);
  });

  it('a value outside the column options is kept: options are not checked with search (editors.md 28)', async () => {
    const t = grid({ options: true });
    t.open();
    t.asks[0]!.ok([{ value: 'Oran' }, { value: 'Oslo' }]);
    await settle();
    t.press('ArrowDown');
    t.press('Enter');
    expect(t.of('cellEdited').map((e) => e.value)).toEqual(['Oslo']);
  });

  it('Escape closes the list first, then gives up; the open ask is aborted', async () => {
    const t = grid();
    const b = t.open();
    t.press('Escape');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(t.box()).toBe(b);
    t.press('Escape');
    expect(t.box()).toBeNull();
    expect(t.asks[0]!.signal.aborted).toBe(true);
    expect(t.of('cellEdited')).toEqual([]);
  });

  it('closing aborts the ask: its rejection (a fetch aborted) says nothing — no « Search failed » after the field is gone', async () => {
    const t = grid();
    t.open();
    const said = vi.spyOn(t.ctx.live, 'announce');
    t.press('Escape');
    t.press('Escape');
    expect(t.asks[0]!.signal.aborted).toBe(true);
    // What a fetch does with an aborted signal: it rejects.
    t.asks[0]!.no(new DOMException('aborted', 'AbortError'));
    await settle();
    expect(said.mock.calls.map((c) => c[0])).not.toContain('Search failed');
  });

  it('a click on an option keeps it', async () => {
    const t = grid();
    t.open();
    t.asks[0]!.ok([{ value: 'Osaka' }]);
    await settle();
    t.list()!.querySelector<HTMLElement>('[role=option]')!.click();
    expect(t.of('cellEdited').map((e) => e.value)).toEqual(['Osaka']);
  });

  it('a list or an observable as the answer (its first value, then unsubscribed)', async () => {
    const t = grid({ answer: 'list' });
    t.open();
    expect(t.opts()).toEqual(['Oran']);
    cleanup();
    const u = grid({ answer: 'observable' });
    u.open();
    expect(u.opts()).toEqual(['Oslo']);
    expect(u.asks.map((a) => a.text)).toEqual(['unsubscribed']);
  });

  it('without searchEditor: the column opens as without search (a text field), one missing-feature warning', () => {
    const t = grid({ bare: true });
    const b = t.open();
    expect(b.getAttribute('role')).toBeNull();
    expect(t.asks).toEqual([]);
    const ps = t.of('problems').flatMap((e) => e.problems).filter((p) => p.code === 'missing-feature');
    expect(ps.map((p) => [p.path, p.detail])).toEqual([['columns.s.edit', '@dzgrid/dom/editors-search']]);
  });

  it('without its texts the editors refuse to start, naming them', () => {
    expect(() => ed({ options: { search: searchEditor } })).toThrow(/editors: missing edit\.searching, edit\.noResult, edit\.searchFailed/);
  });
});
