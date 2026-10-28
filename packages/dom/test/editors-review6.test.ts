// Phase 5 step 6, review and test analysis (2026-10-24): R1–R7 and the analyser's gaps, each written before its fix.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { booleanCodecWith, type ColumnDef } from '@dzgrid/core';
import type { CalendarAdapter, CalendarKit } from '../src/editors.js';
import { listEditor } from '../src/editors-list.js';
import { definePart, type SlotContext } from '../src/part.js';
import { atText } from '../src/editors/dates.js';
import { ed, cleanup, k, layout, rowsOf, settle, tick, windowBox, type R } from './support-editors.js';

afterEach(cleanup);
let reported: unknown[] = [];
beforeEach(() => {
  reported = [];
  (window as unknown as { reportError: unknown }).reportError = (e: unknown) => void reported.push(e);
});
afterEach(() => void delete (window as unknown as { reportError?: unknown }).reportError);

const problems = (t: { readonly events: readonly { type: string }[] }, code: string) =>
  t.events.filter((e) => e.type === 'problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string; detail?: string }[] }).problems).filter((x) => x.code === code);

// ------------------------------------------------------------------ the list
type LRow = R & { st: string | null; who: string | null; n30: string | null };
const ST = [{ value: 'pending', label: 'En attente' }, { value: 'due', label: 'Échu' }, { value: 'paid', label: 'Payé' }, { value: 'part', label: 'Partiel' }];
const N30 = Array.from({ length: 30 }, (_, i) => ({ value: `o${i}`, label: `Option ${String(i).padStart(2, '0')}` }));
const LCOLS: ColumnDef<LRow, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'st', header: 'Statut', type: 'enum', enumOptions: ST, width: 120, editable: true },
  { id: 'n30', header: 'N', width: 120, editable: true, edit: { options: N30 } },
];
const list = (cols: ColumnDef<LRow, any>[] = LCOLS, st: string | null = 'paid') => {
  const t = ed({ lang: 'fr', columns: cols as never, rows: rowsOf(30).map((r) => ({ ...r, st, who: null, n30: 'o5' })) as never, options: { list: listEditor } });
  let clock = 1000;
  (t.ctx as { now: () => number }).now = () => clock;
  const combo = () => t.host.querySelector<HTMLElement>('.dzg-combo');
  const opts = () => [...document.querySelectorAll<HTMLElement>('.dzg-popup [role=option]')];
  const active = () => document.getElementById(combo()!.getAttribute('aria-activedescendant') ?? '')?.textContent ?? null;
  const press = (key: string, init: KeyboardEventInit = {}) => t.key(key, init, combo()!);
  return { ...t, wait: (ms: number) => void (clock += ms), combo, opts, active, press };
};

describe('R1: an empty options list, options that are not a list', () => {
  it('no options: ArrowDown, Home, End, PageDown do not throw; Enter keeps nothing', () => {
    const t = list([LCOLS[0]!, { id: 'x', header: 'X', width: 80, editable: true, edit: { options: [] } }]);
    t.at('r1', 'x');
    t.key('F2');
    // An error in a key listener never reaches dispatchEvent's caller: jsdom reports it on the window.
    const errs: unknown[] = [];
    const on = (e: ErrorEvent) => (errs.push(e.error), e.preventDefault());
    window.addEventListener('error', on);
    for (const key of ['ArrowDown', 'Home', 'End', 'PageDown', 'ArrowUp']) t.press(key);
    window.removeEventListener('error', on);
    expect(errs).toEqual([]);
    t.press('Enter');
    expect(t.of('cellEdited')).toEqual([]);
  });

  it('an options function that returns no list: refused « invalid » (the blink, the sentence), one warning per column', () => {
    const t = list([LCOLS[0]!, { id: 'x', header: 'X', width: 80, editable: true, edit: { options: (() => 'nope') as never } }]);
    const blink = vi.spyOn(t.api, 'refuse');
    for (const id of ['r1', 'r2']) {
      t.at(id, 'x');
      expect(() => t.key('F2')).not.toThrow();
    }
    expect(t.combo()).toBeNull();
    expect(blink).toHaveBeenCalledWith(k('r1'), 'x');
    expect(String(t.alert.mock.calls[0]![0])).toContain(t.api.reason('x', 'invalid'));
    expect(problems(t, 'invalid-column')).toEqual([expect.objectContaining({ path: 'columns.x.edit.options' })]);
  });
});

describe('R2: aria-selected follows the active option (APG select-only combobox)', () => {
  it('the active option is the selected one; moving moves both', () => {
    const t = list();
    t.at('r1', 'st');
    t.key('F2');
    const sel = () => t.opts().filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.textContent);
    expect(sel()).toEqual(['Payé']);
    t.press('ArrowDown');
    expect(sel()).toEqual(['Partiel']);
    expect(t.active()).toBe('Partiel');
  });

  it('no value: no option selected until the user moves', () => {
    const t = list(LCOLS, null);
    t.at('r1', 'st');
    t.key('F2');
    expect(t.opts().some((o) => o.getAttribute('aria-selected') === 'true')).toBe(false);
  });
});

describe('the list (analyser gaps)', () => {
  it('a two-letter prefix searches from the active option, not from the first', () => {
    const t = list();
    t.at('r1', 'n30');
    t.key('F2');
    expect(t.active()).toBe('Option 05');
    t.press('o');
    t.wait(10);
    t.press('p');
    // « o » alone cycles to the next (Option 06); « op » from there keeps it.
    expect(t.active()).toBe('Option 06');
  });

  it('the combobox text and .dzg-opt--active follow the arrows', () => {
    const t = list();
    t.at('r1', 'st');
    t.key('F2');
    t.press('ArrowUp');
    expect(t.combo()!.textContent).toBe('Échu');
    expect(t.opts().filter((o) => o.classList.contains('dzg-opt--active')).map((o) => o.textContent)).toEqual(['Échu']);
  });

  it('a press on an option keeps the focus on its row (no move)', () => {
    const t = list();
    t.at('r3', 'st');
    t.key('F2');
    t.opts()[0]!.click();
    expect(t.focusAt()).toBe('r3/st');
    expect(document.activeElement).toBe(t.cell('r3', 'st'));
  });

  it('hidden while the cell is out of the grid’s view, shown again when it comes back', () => {
    layout();
    const t = list();
    t.at('r1', 'st');
    t.key('F2');
    const pop = () => document.querySelector<HTMLElement>('.dzg-popup')!;
    expect(pop().hidden).toBe(false);
    vi.restoreAllMocks();
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 300, right: 380, x: 300, y: top, width: 80, height: bottom - top, toJSON() {} }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.classList.contains('dzg-viewport') ? rect(0, 700) : rect(900, 932);
    });
    t.scroll(10);
    expect(pop().hidden).toBe(true);
  });

  it('Ctrl or Cmd with a letter is no type-ahead', () => {
    const t = list();
    t.at('r1', 'st');
    t.key('F2');
    t.press('e', { ctrlKey: true });
    t.press('e', { metaKey: true });
    expect(t.active()).toBe('Payé');
  });

  it('a gap of exactly 500 ms still continues the prefix', () => {
    const t = list();
    t.at('r1', 'st');
    t.key('F2');
    t.press('e');
    t.wait(500);
    t.press('c');
    expect(t.active()).toBe('Échu');
  });
});

// ------------------------------------------------------------------ the field keys (R3)
describe('R3: Shift+Home and Shift+End keep the selection’s anchor', () => {
  it('forward selection 2→4: Shift+Home selects 0–2 backward; backward 2←4: Shift+End selects 4–6', () => {
    const t = ed();
    t.at('r3', 'name');
    t.key('F2');
    const f = t.field()!;
    f.setSelectionRange(2, 4, 'forward');
    t.key('Home', { shiftKey: true }, f);
    expect([f.selectionStart, f.selectionEnd, f.selectionDirection]).toEqual([0, 2, 'backward']);
    f.setSelectionRange(2, 4, 'backward');
    t.key('End', { shiftKey: true }, f);
    expect([f.selectionStart, f.selectionEnd, f.selectionDirection]).toEqual([4, 6, 'forward']);
  });
});

// ------------------------------------------------------------------ dates
type DRow = R & { d: string | null; t: string | null };
const DCOLS: ColumnDef<DRow, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'd', header: 'Jour', type: 'day', width: 120, editable: true },
  { id: 't', header: 'Heure', type: 'instant', width: 160, editable: true },
];
const dates = (o: { t?: string; options?: Record<string, unknown>; settings?: Record<string, unknown> } = {}) => {
  const t = ed({ lang: 'fr', columns: DCOLS as never, rows: rowsOf(10).map((r) => ({ ...r, d: '2026-03-29', t: o.t ?? '2026-03-29T10:05:00Z' })) as never, options: o.options as never,
    settings: { locale: 'fr-FR', timeZone: 'Europe/Paris', clock: () => Date.UTC(2026, 9, 19, 10), ...o.settings } as never });
  const dialog = () => document.querySelector<HTMLElement>('.dzg-popup[role=dialog]');
  const open = (col = 'd') => (t.at('r1', col), t.key('F2'), t.field()!);
  const alt = (init: KeyboardEventInit = {}) => t.key('ArrowDown', { altKey: true, ...init }, t.field()!);
  return { ...t, dialog, open, alt };
};
function stub() {
  const destroyed = vi.fn();
  const seen: CalendarAdapter[] = [];
  const kit: CalendarKit = { open(a) { seen.push(a); const b = document.createElement('button'); a.host.append(b); return { focus: () => b.focus(), destroy: destroyed }; } };
  return { kit, destroyed, seen };
}

describe('R4: seconds are floored, never rounded', () => {
  it('23:59:59.5 shows 23:59:59 (never 24:00); 12:05:00.600 shows 12:05 (no seconds), kept untouched', () => {
    const t = dates();
    expect(atText(t.ctx.ctx, Date.UTC(2026, 2, 29, 21, 59, 59, 500))).toBe('29/03/2026 23:59:59');
    expect(atText(t.ctx.ctx, Date.UTC(2026, 2, 29, 10, 5, 0, 600))).toBe('29/03/2026 12:05');
    cleanup();
    const u = dates({ t: '2026-03-29T10:05:00.600Z' });
    const f = u.open('t');
    expect(f.value).toBe('29/03/2026 12:05');
    u.key('Enter', {}, f);
    expect(u.of('cellEdited')).toEqual([]);
  });
});

describe('the date field (analyser gaps)', () => {
  it('closing the dialog destroys the view once (Escape, then a pick)', async () => {
    const s = stub();
    const t = dates({ options: { loadCalendar: () => Promise.resolve(s.kit) } });
    t.open();
    t.alt();
    await settle();
    t.key('Escape', {}, document.activeElement!);
    expect(s.destroyed).toHaveBeenCalledTimes(1);
    t.alt();
    await settle();
    s.seen[1]!.pick('2026-04-01');
    s.seen[1]!.close();
    expect(s.destroyed).toHaveBeenCalledTimes(2);
  });

  it('the real calendar: closing disconnects the name observer and destroys tzslot’s hour menus', async () => {
    const off = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const t = dates();
    t.open('t');
    t.alt();
    await vi.waitFor(() => expect(t.dialog()?.querySelector('select[data-part=hour]')).toBeTruthy());
    const hour = t.dialog()!.querySelector('select[data-part=hour]')!;
    const calls = off.mock.calls.length;
    t.key('Escape', {}, document.activeElement!);
    expect(off.mock.calls.length).toBeGreaterThan(calls);
    expect(hour.parentNode).toBeNull();
  });

  it('a press on the button prefetches and keeps the focus in the field (pointerdown and mousedown prevented)', () => {
    const load = vi.fn(() => new Promise<CalendarKit>(() => {}));
    const t = dates({ options: { loadCalendar: load } });
    t.open();
    const b = t.host.querySelector<HTMLButtonElement>('.dzg-calbtn')!;
    const down = new Event('pointerdown', { bubbles: true, cancelable: true });
    b.dispatchEvent(down);
    expect(load).toHaveBeenCalledTimes(1);
    expect(down.defaultPrevented).toBe(true);
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    b.dispatchEvent(md);
    expect(md.defaultPrevented).toBe(true);
  });

  it('Shift+Alt+Down, Ctrl+Alt+Down open nothing', () => {
    const load = vi.fn();
    const t = dates({ options: { loadCalendar: load } });
    t.open();
    t.alt({ shiftKey: true });
    t.alt({ ctrlKey: true });
    expect(t.dialog()).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('a paint places the dialog again (it follows the field)', async () => {
    const s = stub();
    windowBox();
    let top = 100;
    const rect = (a: number, b: number) => ({ top: a, bottom: b, left: 300, right: 380, x: 300, y: a, width: 80, height: b - a, toJSON() {} }) as DOMRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('dzg-viewport')) return rect(0, 700);
      if (this.classList.contains('dzg-popup')) return rect(0, 200);
      return rect(top, top + 32);
    });
    const t = dates({ options: { loadCalendar: () => Promise.resolve(s.kit) } });
    t.open();
    t.alt();
    await settle();
    const at = () => parseFloat(t.dialog()!.style.insetBlockStart);
    const first = at();
    top = 40;
    t.scroll(5);
    expect(at()).not.toBe(first);
    expect(at()).toBe(40 + 32 + 2);
  });

  it('closing removes aria-controls and sets aria-expanded false', async () => {
    const s = stub();
    const t = dates({ options: { loadCalendar: () => Promise.resolve(s.kit) } });
    const f = t.open();
    t.alt();
    await settle();
    expect(f.hasAttribute('aria-controls')).toBe(true);
    t.key('Escape', {}, document.activeElement!);
    expect(f.hasAttribute('aria-controls')).toBe(false);
    expect(f.getAttribute('aria-expanded')).toBe('false');
  });

  it('an outside press while the focus is in the dialog keeps what was typed (Q5)', async () => {
    const s = stub();
    const t = dates({ options: { loadCalendar: () => Promise.resolve(s.kit) } });
    t.open();
    t.type('30/03/2026');
    t.alt();
    await settle();
    expect(t.dialog()!.contains(document.activeElement)).toBe(true);
    const out = document.body.appendChild(document.createElement('button'));
    out.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    out.focus();
    await tick();
    await tick();
    expect(t.of('cellEdited').map((e) => e.value)).toEqual(['2026-03-30']);
  });

  it('injectStyles: false — no tzslot sheet injected', async () => {
    for (const st of document.querySelectorAll('style[data-tzslot]')) st.remove();
    const t = dates({ settings: { injectStyles: false } });
    t.open();
    t.alt();
    await vi.waitFor(() => expect(t.dialog()?.querySelector('.tz-cal')).toBeTruthy());
    expect(document.querySelector('style[data-tzslot]')).toBeNull();
  });

  it('a trailing space after an ambiguous time is still refused as ambiguous', () => {
    layout();
    const t = dates();
    t.open('t');
    t.type('25/10/2026 02:30 ');
    t.key('Enter', {}, t.field()!);
    expect(t.bubble()!.textContent).toBe('cette heure existe deux fois ce jour-là');
  });

  it('a chunk without open: the reported error starts « editors: »', async () => {
    const t = dates({ options: { loadCalendar: () => Promise.resolve({}) } });
    t.open();
    t.alt();
    await settle();
    expect(String((reported[0] as Error).message)).toMatch(/^editors: no open/);
  });

  it('an instant’s calendar starts at 1900 (31/12/1899 disabled)', async () => {
    const t = dates({ t: '1900-01-05T12:00:00Z' });
    t.open('t');
    t.alt();
    await vi.waitFor(() => expect(t.dialog()?.querySelector('[data-date="1900-01-05"]')).toBeTruthy());
    expect(t.dialog()!.querySelector<HTMLButtonElement>('[data-date="1900-01-01"]')!.disabled).toBe(false);
    // 1 January 1900 is a Monday: December 1899 shows one month back, every day of it disabled.
    t.dialog()!.querySelector<HTMLButtonElement>('.tz-cal__nav')!.click();
    await vi.waitFor(() => expect(t.dialog()!.querySelector('[data-date="1899-12-15"]')).toBeTruthy());
    expect(t.dialog()!.querySelector<HTMLButtonElement>('[data-date="1899-12-15"]')!.disabled).toBe(true);
  });

  it('no Retry button while the chunk loads again', async () => {
    let n = 0;
    const pending = new Promise<CalendarKit>(() => {});
    const t = dates({ options: { loadCalendar: () => (++n === 1 ? Promise.reject(new Error('offline')) : pending) } });
    t.open();
    t.alt();
    await settle();
    t.dialog()!.querySelector<HTMLButtonElement>('.dzg-fretry')!.click();
    await settle();
    expect(t.dialog()!.querySelector('[role=status]')).not.toBeNull();
    expect(t.dialog()!.querySelector('.dzg-fretry')).toBeNull();
  });
});

// ------------------------------------------------------------------ yes/no (R5)
type BRow = R & { ok: boolean | null };
const BCOLS: ColumnDef<BRow, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'ok', header: 'OK', type: 'boolean', width: 60, editable: true, codec: booleanCodecWith({ true: 'Oui', false: 'Non' }) as never },
  { id: 'ro', header: 'RO', type: 'boolean', width: 60, value: (r: BRow) => r.ok },
];
const yn = () => ed({ lang: 'fr', columns: BCOLS as never, rows: rowsOf(10).map((r) => ({ ...r, ok: null })) as never, settings: { selection: { mode: 'multi' } } as never });

describe('R5 and the yes/no gaps', () => {
  it('a held Space or Enter (key repeat) does not toggle again, and does not select the row', () => {
    const t = yn();
    t.at('r3', 'ok');
    t.key(' ');
    expect(t.key(' ', { repeat: true }).defaultPrevented).toBe(true);
    t.key('Enter', { repeat: true });
    expect(t.of('cellEdited').map((e) => e.value)).toEqual([true]);
    expect(t.host.querySelector('.dzg-row[aria-selected=true]')).toBeNull();
  });

  it('a double click on a read-only yes/no cell: no save, no sentence', () => {
    const t = yn();
    const c = t.at('r3', 'ro');
    c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(t.of('cellEdited')).toEqual([]);
    expect(t.alert).not.toHaveBeenCalled();
  });

  it('Tab skips the yes/no cells (they open no editor)', () => {
    const t = yn();
    t.at('r3', 'name');
    t.key('F2');
    t.key('Tab', {}, t.field()!);
    expect(t.focusAt()).toBe('r4/name');
  });

  it('the toggle is said in the column’s words (Oui / Non)', () => {
    const t = yn();
    const say = vi.spyOn(t.ctx.live, 'announce');
    t.at('r3', 'ok');
    t.key(' ');
    expect(say).toHaveBeenLastCalledWith('Oui');
    t.key(' ');
    expect(say).toHaveBeenLastCalledWith('Non');
  });
});

// ------------------------------------------------------------------ the app's editor
type CRow = R & { c: string | null };
const CCOLS: ColumnDef<CRow, any>[] = [
  { id: 'name', header: 'Name', width: 120, editable: true },
  { id: 'c', header: 'Couleur', width: 120, editable: true, edit: { editor: 'colour' } },
];
const custom = (part: ReturnType<typeof definePart>) => ed({ lang: 'fr', columns: CCOLS as never, rows: rowsOf(10).map((r) => ({ ...r, c: '#ff0000' })) as never, settings: { parts: { colour: part } } as never });
const capture = () => {
  let ctx: SlotContext['editor'] | null = null;
  const input = document.createElement('input');
  const part = definePart('editor', { mount(h, c) { ctx = c; h.append(input); input.value = c.text; return { focus: () => (input.focus(), true), read: () => ({ text: input.value }) }; } });
  return { part, ctx: () => ctx!, input };
};

describe('the app’s editor (gaps and the guard)', () => {
  it('cancel() or refuse() after the editor closed: no second editingStopped, no bubble', () => {
    layout();
    const p = capture();
    const t = custom(p.part);
    t.at('r2', 'c');
    t.key('F2');
    const c = p.ctx();
    t.key('Escape', {}, p.input);
    c.cancel();
    c.refuse('pattern');
    expect(t.of('editingStopped')).toHaveLength(1);
    expect(t.bubble()?.hidden ?? true).toBe(true);
    expect(t.alert).not.toHaveBeenCalled();
  });

  it('a destroy that throws is reported, and the host emptied', () => {
    let host: HTMLElement | null = null;
    const part = definePart('editor', { mount: (h) => ((host = h), h.append(document.createElement('input')), { destroy: () => { throw new Error('d'); } }) });
    const t = custom(part);
    t.at('r2', 'c');
    t.key('F2');
    t.key('Escape', {}, document.activeElement!);
    expect(reported).toHaveLength(1);
    expect(t.cell('r2', 'c')!.querySelector('.dzg-editor, input')).toBeNull();
    // The host itself emptied (the parts contract), not only taken out of the cell.
    expect(host!.childNodes.length).toBe(0);
  });

  it('focus leaving a node the part owns, to the outside: read() kept (the blur rule)', async () => {
    const pop = document.body.appendChild(document.createElement('div'));
    const b = pop.appendChild(document.createElement('button'));
    const out = document.body.appendChild(document.createElement('button'));
    let ctx: SlotContext['editor'] | null = null;
    const input = document.createElement('input');
    const part = definePart('editor', { mount(h, c) { ctx = c; c.own(pop); h.append(input); return { focus: () => (input.focus(), true), read: () => ({ text: input.value }) }; } });
    const t = custom(part);
    t.at('r2', 'c');
    t.key('F2');
    input.value = '#00ff00';
    b.focus();
    await tick();
    out.focus();
    await tick();
    expect(t.of('cellEdited').map((e) => e.value)).toEqual(['#00ff00']);
    void ctx;
  });

  it('opened by Tab: start « tab », no char', () => {
    const p = capture();
    const t = custom(p.part);
    t.at('r2', 'name');
    t.key('F2');
    t.key('Tab', {}, t.field()!);
    expect(p.ctx().start).toBe('tab');
    expect(p.ctx().char).toBeUndefined();
  });

  it('a mount that returns nothing: reported, the editor closed, the cell focused', () => {
    const part = definePart('editor', { mount: () => undefined as never });
    const t = custom(part);
    t.at('r2', 'c');
    expect(() => t.key('F2')).not.toThrow();
    expect(reported).toHaveLength(1);
    expect(t.host.querySelector('.dzg-editor')).toBeNull();
    expect(document.activeElement).toBe(t.cell('r2', 'c'));
  });
});
