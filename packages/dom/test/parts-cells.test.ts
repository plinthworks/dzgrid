// Ready cell parts (step 20; docs/behaviors/badge-boolean.md, parts.md): badge() and cellBoolean.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { dataKey, localeCtx, type ColumnDef, type GridEvent } from '@dzgrid/core';
import { toCsv } from '@dzgrid/core/csv';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import type { SlotContext, SlotPart } from '../src/part.js';
import type { GridMessages } from '../src/messages.js';
import { badge, cellBoolean, type Tone } from '../src/parts.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_PARTS } from '../src/locales/en-parts.js';
import { FR_PARTS } from '../src/locales/fr-parts.js';
import { AR_PARTS } from '../src/locales/ar-parts.js';

type R = { id: string; n: number; status: string | null; ok: boolean | null };
const STATUS = [{ value: 'done', label: 'Done' }, { value: 'late', label: 'Late' }, { value: 'held', label: 'On hold' }, { value: 'new', label: 'New' }, { value: 'info', label: 'Note' }];
const TONES: Readonly<Record<string, Tone>> = { done: 'success', late: 'danger', held: 'warning', info: 'info' };
const join = (b: GridMessages, p: { text: object }): GridMessages => ({ ...b, text: { ...b.text, ...p.text } });
const MESSAGES = join(EN, EN_PARTS);

let grids: GridInstance<R>[] = [];
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const rowsOf = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, n: i, status: i % 6 === 5 ? null : STATUS[i % 5]!.value, ok: i % 3 === 2 ? null : i % 3 === 0 }));

function make(settings: Partial<GridSettings<R>> = {}, rows: R[] = rowsOf(200)) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const columns: ColumnDef<R, any>[] = [
    { id: 'n', type: 'number' },
    { id: 'status', type: 'enum', enumOptions: STATUS, ui: { cell: 'statusBadge' } },
    { id: 'ok', type: 'boolean' },
  ];
  const g = createGrid<R>(host, {
    rows, getRowId: (r) => r.id, columns, messages: MESSAGES, onEvent: (e) => events.push(e),
    parts: { statusBadge: badge({ tones: TONES }), 'cell.boolean': cellBoolean }, ...settings,
  }, { geometry, sync: true });
  grids.push(g);
  const vp = host.querySelector<HTMLElement>('.dzg-viewport')!;
  const scroll = (top: number) => { box.scrollTop = top; vp.dispatchEvent(new Event('scroll')); };
  /** The cell of a column on the row at aria-rowindex (2 = the first data row). */
  const cell = (row: number, col: string) => host.querySelector<HTMLElement>(`.dzg-row[aria-rowindex="${row}"] [data-col="${col}"]`)!;
  return { g, host, events, scroll, cell };
}

/** A part mounted by hand into a host, with a context made here: what the grid would give. */
function mountAlone(p: SlotPart<'cell'>, over: Partial<SlotContext['cell']> = {}, messages: GridMessages = MESSAGES) {
  const host = document.createElement('div');
  document.body.append(host);
  const base: SlotContext['cell'] = {
    ctx: localeCtx({ locale: messages.locale }), dir: 'ltr', doc: document, announce: () => {},
    msg: (k) => {
      const v = (messages.text as Record<string, unknown>)[k];
      if (typeof v !== 'string') throw new RangeError(`no message ${k}`);
      return v;
    },
    value: null, text: '', row: {}, key: dataKey('a')!, column: {} as never, focused: false,
  };
  const c = (o: Partial<SlotContext['cell']>): SlotContext['cell'] => ({ ...base, ...over, ...o });
  const handle = p.part.mount(host, c({}));
  return { host, handle, c };
}

const parts = (el: Element) => ({
  badge: el.querySelector<HTMLElement>('.dzg-badge'),
  glyph: el.querySelector<HTMLElement>('.dzg-glyph'),
  label: el.querySelector<HTMLElement>('.dzg-badge > span:not(.dzg-glyph), .dzg-bool > span:not(.dzg-glyph)'),
});

describe('badge()', () => {
  it('shows the cell’s text in a frame toned by the host’s map, the glyph hidden from screen readers', () => {
    const { host } = mountAlone(badge({ tones: TONES }), { value: 'done', text: 'Done' });
    const p = parts(host);
    expect(p.badge!.tagName).toBe('SPAN');
    expect(p.badge!.dataset['tone']).toBe('success');
    expect(p.glyph!.textContent).toBe('✓');
    expect(p.glyph!.getAttribute('aria-hidden')).toBe('true');
    expect(p.label!.textContent).toBe('Done');
    expect(p.label!.getAttribute('dir')).toBe('auto');
    // Glyph first, then the label: the start side in both directions.
    expect([...p.badge!.children]).toEqual([p.glyph, p.label]);
    // The tone is never in the text a screen reader gets.
    expect(p.badge!.getAttribute('aria-label')).toBeNull();
    expect(host.textContent).toBe('✓Done');
  });

  it('gives each tone its shape: success ✓, warning !, danger ✕, info i, neutral none', () => {
    const want: Record<Tone, string | null> = { success: '✓', warning: '!', danger: '✕', info: 'i', neutral: null };
    for (const tone of Object.keys(want) as Tone[]) {
      const { host } = mountAlone(badge({ tones: { x: tone } }), { value: 'x', text: 'X' });
      expect(parts(host).badge!.dataset['tone'], tone).toBe(tone);
      expect(parts(host).glyph?.textContent ?? null, tone).toBe(want[tone]);
      expect(parts(host).label!.textContent).toBe('X');
    }
  });

  it('falls back to neutral, or to the host’s fallback, for a value the map does not name (an inherited key included)', () => {
    expect(parts(mountAlone(badge({ tones: TONES }), { value: 'new', text: 'New' }).host).badge!.dataset['tone']).toBe('neutral');
    expect(parts(mountAlone(badge(), { value: 'new', text: 'New' }).host).badge!.dataset['tone']).toBe('neutral');
    expect(parts(mountAlone(badge({ fallback: 'info' }), { value: 'new', text: 'New' }).host).badge!.dataset['tone']).toBe('info');
    // `constructor`, `toString`: the object's prototype is no tone.
    for (const v of ['constructor', 'toString', '__proto__']) {
      const p = parts(mountAlone(badge({ tones: TONES, fallback: 'warning' }), { value: v, text: v }).host);
      expect(p.badge!.dataset['tone'], v).toBe('warning');
      expect(p.label!.textContent).toBe(v);
    }
  });

  it('shows nothing for a value whose text is empty (a host format giving ""), not an empty frame', () => {
    const { host, handle, c } = mountAlone(badge({ tones: TONES }), { value: 'done', text: '' });
    expect(host.childNodes.length).toBe(0);
    handle.update!(c({ value: 'done', text: 'Done' }));
    expect(host.textContent).toBe('✓Done');
    handle.update!(c({ value: 'done', text: '' }));
    expect(host.childNodes.length).toBe(0);
  });

  it('reads the tone from the value as a string: a number value finds its key', () => {
    expect(parts(mountAlone(badge({ tones: { 2: 'danger' } }), { value: 2, text: '2' }).host).badge!.dataset['tone']).toBe('danger');
  });

  it('leaves the host empty for a null value, and draws again when a value comes back, with the same elements', () => {
    const { host, handle, c } = mountAlone(badge({ tones: TONES }), { value: null, text: '' });
    expect(host.childNodes.length).toBe(0);
    handle.update!(c({ value: 'late', text: 'Late' }));
    const first = parts(host);
    expect(first.badge!.dataset['tone']).toBe('danger');
    expect(first.label!.textContent).toBe('Late');
    handle.update!(c({ value: null, text: '' }));
    expect(host.childNodes.length).toBe(0);
    handle.update!(c({ value: 'done', text: 'Done' }));
    const again = parts(host);
    expect(again.badge).toBe(first.badge);
    expect(again.label).toBe(first.label);
    expect(again.glyph).toBe(first.glyph);
    expect(again.badge!.dataset['tone']).toBe('success');
    expect(again.glyph!.textContent).toBe('✓');
    expect(host.textContent).toBe('✓Done');
  });

  it('rebinds text and tone in place, drops the glyph for neutral and puts it back first', () => {
    const { host, handle, c } = mountAlone(badge({ tones: TONES }), { value: 'done', text: 'Done' });
    const el = parts(host).badge!;
    handle.update!(c({ value: 'new', text: 'New' }));
    expect(parts(host).badge).toBe(el);
    expect(el.dataset['tone']).toBe('neutral');
    expect(el.querySelector('.dzg-glyph')).toBeNull();
    expect(host.textContent).toBe('New');
    handle.update!(c({ value: 'held', text: 'On hold' }));
    expect(el.dataset['tone']).toBe('warning');
    expect(el.firstElementChild!.className).toBe('dzg-glyph');
    expect(el.firstElementChild!.textContent).toBe('!');
    expect(host.textContent).toBe('!On hold');
  });

  it('writes nothing on an update that changes nothing it shows', async () => {
    const { host, handle, c } = mountAlone(badge({ tones: TONES }), { value: 'done', text: 'Done' });
    const seen: MutationRecord[] = [];
    const mo = new MutationObserver((r) => seen.push(...r));
    mo.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
    handle.update!(c({ value: 'done', text: 'Done', focused: true, key: dataKey('b')! }));
    await Promise.resolve();
    mo.disconnect();
    expect(seen).toEqual([]);
  });

  it('removes what it drew on destroy', () => {
    const { host, handle } = mountAlone(badge({ tones: TONES }), { value: 'done', text: 'Done' });
    handle.destroy?.();
    expect(host.querySelector('.dzg-badge')).toBeNull();
  });
});

describe('cellBoolean', () => {
  it('shows ✓ and the yes text, ✗ and the no text, nothing for null; the glyph hidden, no tone', () => {
    const yes = mountAlone(cellBoolean, { value: true, text: 'true' });
    const p = parts(yes.host);
    expect(p.badge).toBeNull();
    expect(yes.host.firstElementChild!.className).toBe('dzg-bool');
    expect(yes.host.firstElementChild!.hasAttribute('data-tone')).toBe(false);
    expect(p.glyph!.textContent).toBe('✓');
    expect(p.glyph!.getAttribute('aria-hidden')).toBe('true');
    expect(p.label!.textContent).toBe('Yes');
    expect(yes.host.textContent).toBe('✓Yes');
    const no = mountAlone(cellBoolean, { value: false, text: 'false' });
    expect(no.host.textContent).toBe('✗No');
    expect(parts(no.host).glyph!.textContent).toBe('✗');
    const none = mountAlone(cellBoolean, { value: null, text: '' });
    expect(none.host.childNodes.length).toBe(0);
  });

  it('speaks the grid’s language, never the codec’s English', () => {
    expect(mountAlone(cellBoolean, { value: true, text: 'true' }, join(FR, FR_PARTS)).host.textContent).toBe('✓Oui');
    expect(mountAlone(cellBoolean, { value: false, text: 'false' }, join(FR, FR_PARTS)).host.textContent).toBe('✗Non');
    expect(mountAlone(cellBoolean, { value: true, text: 'true' }, join(AR, AR_PARTS)).host.textContent).toBe('✓نعم');
    expect(mountAlone(cellBoolean, { value: false, text: 'false' }, join(AR, AR_PARTS)).host.textContent).toBe('✗لا');
  });

  it('rebinds in place: true → null → false, the same elements', () => {
    const { host, handle, c } = mountAlone(cellBoolean, { value: true, text: 'true' });
    const el = host.firstElementChild;
    handle.update!(c({ value: null, text: '' }));
    expect(host.childNodes.length).toBe(0);
    handle.update!(c({ value: false, text: 'false' }));
    expect(host.firstElementChild).toBe(el);
    expect(host.textContent).toBe('✗No');
  });

  it('a text that is no message key fails: the bundle without cell.yes throws (the grid reports it)', () => {
    expect(() => mountAlone(cellBoolean, { value: true, text: 'true' }, EN)).toThrow(/cell\.yes/);
  });
});

describe('in the grid', () => {
  it('draws the badge column and every boolean column (cell.boolean, by type)', () => {
    const { cell } = make();
    // Row 0: done, true; row 1: late, false; row 2: held, null; row 5: null status.
    expect(cell(2, 'status').querySelector<HTMLElement>('.dzg-badge')!.dataset['tone']).toBe('success');
    expect(cell(2, 'status').textContent).toBe('✓Done');
    expect(cell(3, 'status').textContent).toBe('✕Late');
    expect(cell(4, 'status').textContent).toBe('!On hold');
    expect(cell(5, 'status').textContent).toBe('New');
    expect(cell(6, 'status').textContent).toBe('iNote');
    expect(cell(7, 'status').childNodes.length).toBe(0);
    expect(cell(2, 'ok').textContent).toBe('✓Yes');
    expect(cell(3, 'ok').textContent).toBe('✗No');
    expect(cell(4, 'ok').childNodes.length).toBe(0);
    // The number column keeps the plain text.
    expect(cell(3, 'n').textContent).toBe('1');
  });

  it('shows an unknown enum value as the value, in the fallback tone', () => {
    const { cell } = make({}, [{ id: 'a', n: 0, status: 'zzz', ok: true }]);
    expect(cell(2, 'status').textContent).toBe('zzz');
    expect(cell(2, 'status').querySelector<HTMLElement>('.dzg-badge')!.dataset['tone']).toBe('neutral');
  });

  it('mounts once per pooled cell through a scroll, rebinds with the rows, and destroys as many as it mounted', () => {
    const mounts = { n: 0 }, destroys = { n: 0 };
    const counted = (p: SlotPart<'cell'>): SlotPart<'cell'> => ({
      slot: 'cell',
      part: { mount: (h, c) => { mounts.n++; const k = p.part.mount(h, c); return { ...k, destroy: () => { destroys.n++; k.destroy?.(); } }; } },
    });
    const { g, host, scroll, cell } = make({ parts: { statusBadge: counted(badge({ tones: TONES })), 'cell.boolean': counted(cellBoolean) } });
    const peak = mounts.n;
    const before = cell(2, 'status').querySelector('.dzg-badge');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    for (let i = 1; i <= 20; i++) {
      scroll(i * 5 * 32);
      vi.advanceTimersByTime(300);
    }
    vi.useRealTimers();
    expect(mounts.n).toBeLessThanOrEqual(peak + 8);
    // Each row shows its own value after the scroll: row index → status.
    for (const row of host.querySelectorAll<HTMLElement>('.dzg-layer > .dzg-row')) {
      const i = Number(row.getAttribute('aria-rowindex')) - 2;
      const s = rowsOf(200)[i]!.status;
      const text = row.querySelector('[data-col="status"]')!.textContent;
      expect(text, `row ${i}`).toBe(s === null ? '' : `${{ success: '✓', danger: '✕', warning: '!', info: 'i', neutral: '' }[TONES[s] ?? 'neutral']}${STATUS.find((o) => o.value === s)!.label}`);
    }
    expect(before).not.toBeNull();
    g.destroy();
    grids = [];
    expect(destroys.n).toBe(mounts.n);
  });

  it('keeps the same badge element when its row’s value changes, and updates text and tone', () => {
    const rows = rowsOf(5);
    const { g, cell } = make({}, rows);
    const el = cell(2, 'status').querySelector('.dzg-badge');
    g.update({ rows: rows.map((r, i) => (i === 0 ? { ...r, status: 'late' } : r)) });
    expect(cell(2, 'status').querySelector('.dzg-badge')).toBe(el);
    expect(el!.getAttribute('data-tone')).toBe('danger');
    expect(cell(2, 'status').textContent).toBe('✕Late');
    g.update({ rows: rows.map((r, i) => (i === 0 ? { ...r, status: null } : r)) });
    expect(cell(2, 'status').childNodes.length).toBe(0);
    g.update({ rows: rows.map((r, i) => (i === 0 ? { ...r, status: 'held' } : r)) });
    expect(cell(2, 'status').querySelector('.dzg-badge')).toBe(el);
    expect(cell(2, 'status').textContent).toBe('!On hold');
  });

  it('follows the grid’s language live: a new bundle rewrites Yes as Oui', () => {
    const { g, cell } = make({}, rowsOf(3));
    g.update({ messages: join(FR, FR_PARTS), locale: 'fr-FR' });
    expect(cell(2, 'ok').textContent).toBe('✓Oui');
    expect(cell(3, 'ok').textContent).toBe('✗Non');
  });

  it('costs one cell when its tones throw: reported once, not tried again until the row changes', () => {
    const reportError = vi.fn();
    (window as unknown as { reportError: unknown }).reportError = reportError;
    const boom = new Proxy({}, { get() { throw new Error('tones bug'); }, getOwnPropertyDescriptor() { throw new Error('tones bug'); }, has() { throw new Error('tones bug'); } });
    const rows = rowsOf(1);
    const { g, cell } = make({ parts: { statusBadge: badge({ tones: boom as Record<string, Tone> }), 'cell.boolean': cellBoolean } }, rows);
    expect(cell(2, 'status').childNodes.length).toBe(0);
    expect(cell(2, 'ok').textContent).toBe('✓Yes');
    expect(cell(2, 'n').textContent).toBe('0');
    expect(reportError).toHaveBeenCalledTimes(1);
    // A repaint of the same row (the focus moves in) tries nothing again.
    g.api.focusCell(dataKey('r0')!, 'n');
    g.update({ density: 'compact' });
    expect(reportError).toHaveBeenCalledTimes(1);
    // The row's data changed: tried afresh (and fails again, said again).
    g.update({ rows: [{ ...rows[0]!, status: 'late' }] });
    expect(reportError).toHaveBeenCalledTimes(2);
    expect(cell(2, 'status').childNodes.length).toBe(0);
  });

  it('reports a bundle without the parts’ texts: the yes/no cells empty, the rest painted', () => {
    const reportError = vi.fn();
    (window as unknown as { reportError: unknown }).reportError = reportError;
    const { cell } = make({ messages: EN }, rowsOf(3));
    expect(cell(2, 'ok').childNodes.length).toBe(0);
    expect(cell(3, 'ok').childNodes.length).toBe(0);
    expect(cell(2, 'status').textContent).toBe('✓Done');
    expect(reportError).toHaveBeenCalled();
    expect(String(reportError.mock.calls[0]![0])).toMatch(/cell\.yes/);
  });

  it('takes nothing from the grid’s keys: no focusable element in its cells', () => {
    const { host } = make({}, rowsOf(6));
    expect(host.querySelectorAll('.dzg-badge [tabindex], .dzg-bool [tabindex], .dzg-badge button, .dzg-bool button')).toHaveLength(0);
  });
});

describe('sorting, quick search and CSV see the column as plain text', () => {
  const plain = (): Partial<GridSettings<R>> => ({ parts: {} });
  const order = (g: GridInstance<R>) => { const d = g.kernel.rows.displayed; return Array.from({ length: d.count }, (_, i) => String(d.keyAt(d.index(i)!))); };
  const csv = (g: GridInstance<R>) => toCsv({ rows: g.kernel.rows.displayed, columns: g.kernel.columns, ctx: localeCtx({ locale: 'en' }) }, { bom: false });

  it('sorts by the label, the same order with and without the parts', () => {
    const a = make({}, rowsOf(30)).g;
    const b = make(plain(), rowsOf(30)).g;
    for (const g of [a, b]) g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'status', dir: 'asc' }, { column: 'ok', dir: 'desc' }] }, 'user');
    expect(order(a)).toEqual(order(b));
    expect(order(a).length).toBe(30);
  });

  it('finds rows by the label in the quick search, the same rows with and without the parts', () => {
    const a = make({}, rowsOf(30)).g;
    const b = make(plain(), rowsOf(30)).g;
    for (const g of [a, b]) g.kernel.dispatch({ type: 'quick.set', text: 'hold' }, 'user');
    expect(order(a)).toEqual(order(b));
    // "On hold": i % 5 === 2 and not i % 6 === 5 (17 is blank): 2, 7, 12, 22, 27.
    expect(order(a)).toEqual(['r2', 'r7', 'r12', 'r22', 'r27'].map((k) => String(dataKey(k))));
  });

  it('writes the same CSV with and without the parts', () => {
    const a = make({}, rowsOf(12)).g;
    const b = make(plain(), rowsOf(12)).g;
    expect(csv(a)).toBe(csv(b));
    expect(csv(a).split('\r\n')[1]).toBe('0,Done,true');
  });
});
