// Copy on a block (Phase 5 step 11b, docs/behaviors/clipboard.md 1–9 and the « Excel interop » copy table;
// step11b-plan.md L1–L5, L9): `text/plain` and `text/html` written by hand; where the event goes (the document, by the
// focused element, never by the target); what is not the grid's; `canCopy`; `rangeCopied` carries counts only.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createGrid } from '../src/grid.js';
import { range } from '../src/range.js';
import { definePart } from '../src/part.js';
import { detail } from '../src/detail.js';
import { EN_DETAIL } from '../src/locales/en-detail.js';
import { CCOLS, CMSG, cleanup, clip, cmake, crows, flush, join, key, type C } from './support-clip.js';
import { R_ } from './support-range.js';

afterEach(cleanup);

const RLM = String.fromCharCode(0x200f);
const ALL = ['name', 'qty', 'price', 'day', 'at', 'st', 'ok', 'code', 'ref'];

describe('copy: what is written (clipboard.md 4–8)', () => {
  it('a block of every type, at <body> (Firefox): the TSV and the table, by hand', async () => {
    const t = cmake();
    t.at('r0');
    t.api().set(R_(['r0', 'name'], ['r1', 'ref']));
    const { e, text, html } = clip('copy');
    expect(e.defaultPrevented).toBe(true);
    expect(text).toBe(
      'N0\t0\t0.5\t2026-03-01\t2026-03-05 23:59:00\tIn stock\ttrue\t"=""000"""\tR0\r\n' +
      'N1\t1\t1.5\t2026-03-02\t2026-03-05 23:59:00\tRupture\tfalse\t"=""001"""\tR1\r\n');
    expect(html).toBe(
      '<table dir="ltr"><tbody>' +
      '<tr><td>N0</td><td>0</td><td>0.5</td><td>2026-03-01</td><td>2026-03-05 23:59:00</td><td>In stock</td><td>true</td><td>=&#34;000&#34;</td><td>R0</td></tr>' +
      '<tr><td>N1</td><td>1</td><td>1.5</td><td>2026-03-02</td><td>2026-03-05 23:59:00</td><td>Rupture</td><td>false</td><td>=&#34;001&#34;</td><td>R1</td></tr>' +
      '</tbody></table>');
    await flush();
    expect(t.said()).toContain('Cells copied: 18');
  });

  it('numbers in the grid locale\'s decimal mark (QB9): fr and ar-DZ a comma, en a point; raw a point', () => {
    for (const [lang, want] of [['fr', '1234,5'], ['ar', '1234,5'], ['en', '1234.5']] as const) {
      const t = cmake({ lang, rows: [{ ...crows(1)[0]!, price: 1234.5 }] });
      t.at('r0', 'price');
      expect(clip('copy').text, lang).toBe(`${want}\r\n`);
      cleanup();
    }
    const r = cmake({ lang: 'fr', range: { raw: true }, rows: [{ ...crows(1)[0]!, price: 1.5 }] });
    r.at('r0', 'price');
    expect(clip('copy').text).toBe('1.5\r\n');
  });

  it('ar-EG writes a point', () => {
    const t = cmake({ lang: 'ar', settings: { locale: 'ar-EG' }, rows: [{ ...crows(1)[0]!, price: 1.5 }] });
    t.at('r0', 'price');
    expect(clip('copy').text).toBe('1.5\r\n');
  });

  it('the formula guard (QB3): \'=1+1, \'\'=x; guard: false writes as is; a tab, a line break and a quote quoted', () => {
    const rows = ['=1+1', "'=x", '@a', 'a\tb', 'l1\nl2', '5" inch', `${RLM}محمد`, ''].map((name, i) => ({ ...crows(1)[0]!, id: `r${i}`, name }));
    const t = cmake({ rows });
    t.at('r0');
    t.api().set(R_(['r0', 'name'], ['r7', 'name']));
    expect(clip('copy').text).toBe(`'=1+1\r\n''=x\r\n'@a\r\n"a\tb"\r\n"l1\nl2"\r\n"5"" inch"\r\n${RLM}محمد\r\n\r\n`);
    cleanup();
    const g = cmake({ rows, range: { guard: false } });
    g.at('r0');
    g.api().set(R_(['r0', 'name'], ['r1', 'name']));
    expect(clip('copy').text).toBe("=1+1\r\n'=x\r\n");
  });

  it('the HTML escapes every text (& < > ") and writes a line break as <br>; a script is text', () => {
    const rows = ['<script>alert(1)</script>', 'a & "b"', 'l1\r\nl2\nl3'].map((name, i) => ({ ...crows(1)[0]!, id: `r${i}`, name }));
    const t = cmake({ rows });
    t.at('r0');
    t.api().set(R_(['r0', 'name'], ['r2', 'name']));
    expect(clip('copy').html).toBe('<table dir="ltr"><tbody><tr><td>&#60;script&#62;alert(1)&#60;/script&#62;</td></tr><tr><td>a &#38; &#34;b&#34;</td></tr><tr><td>l1<br>l2<br>l3</td></tr></tbody></table>');
  });

  it('right to left: the logical order (the grid\'s first column is column A) and dir="rtl"', () => {
    const t = cmake({ lang: 'ar' });
    t.at('r0');
    t.api().set(R_(['r0', 'name'], ['r0', 'qty']));
    const { text, html } = clip('copy');
    expect(text).toBe('N0\t0\r\n');
    expect(html).toBe('<table dir="rtl"><tbody><tr><td>N0</td><td>0</td></tr></tbody></table>');
  });

  it('one focused cell with no block: that cell', () => {
    const t = cmake();
    t.at('r3', 'qty');
    expect(clip('copy').text).toBe('3\r\n');
  });

  it('the focus on a header while a block exists (Ctrl+A from the header): the block', () => {
    const t = cmake({ rows: crows(2) });
    const h = t.host.querySelector<HTMLElement>('.dzg-hcell[data-col="qty"]')!;
    h.focus();
    t.api().set(R_(['r0', 'name'], ['r1', 'qty']));
    const { e, text } = clip('copy', {}, h);
    expect(e.defaultPrevented).toBe(true);
    expect(text).toBe('N0\t0\r\nN1\t1\r\n');
  });

  it('a header with no block: not the grid\'s', () => {
    const t = cmake({ rows: crows(2) });
    const h = t.host.querySelector<HTMLElement>('.dzg-hcell[data-col="qty"]')!;
    h.focus();
    expect(clip('copy', {}, h).e.defaultPrevented).toBe(false);
  });

  it('headers only through the API (copy({ headers: true })): a first row, the zone after a wall-time instant; <th> in the table', () => {
    const t = cmake({ rows: crows(1) });
    t.at('r0');
    t.api().set(R_(['r0', 'qty'], ['r0', 'at']));
    const c = t.api().copy({ headers: true })!;
    expect(c.text).toBe('Qty\tPrice\tDay\tAt (Africa/Algiers)\r\n0\t0.5\t2026-03-01\t2026-03-05 23:59:00\r\n');
    expect(c.html).toBe('<table dir="ltr"><tbody><tr><th>Qty</th><th>Price</th><th>Day</th><th>At (Africa/Algiers)</th></tr><tr><td>0</td><td>0.5</td><td>2026-03-01</td><td>2026-03-05 23:59:00</td></tr></tbody></table>');
    // The keyboard never writes headers.
    expect(clip('copy').text).toBe('0\t0.5\t2026-03-01\t2026-03-05 23:59:00\r\n');
  });

  it('what the user sees: a value kept by the edit overlay, not the host\'s old one', () => {
    const t = cmake({ save: () => new Promise(() => {}) });
    t.edits!.commit([{ key: key('r2'), column: 'qty', input: { text: '42' } }]);
    t.at('r2', 'qty');
    expect(clip('copy').text).toBe('42\r\n');
  });
});

describe('copy: where the event goes (clipboard.md 1–2, L1)', () => {
  it('at the cell (Chrome, WebKit) as at <body> (Firefox): the same', () => {
    const t = cmake();
    const c = t.at('r1', 'qty');
    expect(clip('copy', {}, c).text).toBe('1\r\n');
    expect(clip('copy').text).toBe('1\r\n');
  });

  it('a textarea elsewhere holding a selection, the focus on the cell (Chrome\'s target): the grid\'s, by the focus', () => {
    const t = cmake();
    const ta = document.body.appendChild(document.createElement('textarea'));
    ta.value = 'page text';
    ta.select();
    t.at('r1', 'qty');
    const { e, text } = clip('copy', {}, ta);
    expect(e.defaultPrevented).toBe(true);
    expect(text).toBe('1\r\n');
  });

  it('the focus outside the grid: not taken', () => {
    const t = cmake();
    t.at('r1', 'qty');
    const b = document.body.appendChild(document.createElement('button'));
    b.focus();
    const { e, text } = clip('copy');
    expect(e.defaultPrevented).toBe(false);
    expect(text).toBeUndefined();
  });

  it('a field, a popup, a filter input, a widget in a cell: theirs, never the grid\'s (not prevented, nothing written)', () => {
    const t = cmake({ editors: 'before' });
    t.at('r1', 'name');
    t.api().set(R_(['r0', 'name'], ['r2', 'qty']));
    const owners: HTMLElement[] = [];
    const popup = Object.assign(document.createElement('div'), { tabIndex: -1 });
    popup.dataset['dzgOwner'] = 'popup';
    const fi = document.createElement('input');
    fi.dataset['dzgOwner'] = 'filter-input';
    t.vp.append(popup, fi);
    const widget = t.cell('r1', 'qty')!.appendChild(document.createElement('button'));
    owners.push(popup, fi, widget);
    for (const el of owners) {
      el.focus();
      expect(document.activeElement).toBe(el);
      for (const type of ['copy', 'cut', 'paste'] as const) {
        const { e, data } = clip(type, { 'text/plain': 'x' }, el);
        expect(e.defaultPrevented, `${el.tagName} ${type}`).toBe(false);
        expect(data.store.get('text/html'), `${el.tagName} ${type}`).toBeUndefined();
      }
    }
    expect(t.requests).toEqual([]);
  });

  it('an open editor: copy, cut and paste are the field\'s', () => {
    const t = cmake({ editors: 'before' });
    t.at('r1', 'name');
    t.press('F2');
    const f = t.host.querySelector<HTMLInputElement>('.dzg-field')!;
    expect(document.activeElement).toBe(f);
    for (const type of ['copy', 'cut', 'paste'] as const) expect(clip(type, { 'text/plain': 'x' }, f).e.defaultPrevented).toBe(false);
    expect(t.host.querySelector('.dzg-field')).toBe(f);
    expect(t.requests).toEqual([]);
  });

  it('a nested grid\'s cell: the inner grid\'s alone (innermost root)', () => {
    const t = cmake();
    const innerHost = t.ctx.el.root.appendChild(document.createElement('div'));
    const inner = createGrid<C>(innerHost, { rows: crows(3).map((r) => ({ ...r, name: `in-${r.id}` })), getRowId: (r) => r.id, columns: CCOLS, messages: CMSG.en, features: [range()] }, { sync: true, geometry: { read: () => ({ block: 300, inline: 600, scrollTop: 0, scrollInline: 0 }), writeScrollTop() {}, writeScrollInline() {} } });
    t.api().set(R_(['r0', 'name'], ['r1', 'name']));
    inner.api.focusCell(key('r2'), 'name');
    innerHost.querySelector<HTMLElement>('.dzg-cell[data-col="name"]')!.focus();
    expect(document.activeElement!.closest('.dzg')).not.toBe(t.ctx.el.root);
    const { text } = clip('copy');
    inner.destroy();
    expect(text).toMatch(/^in-r\d\r\n$/);
  });

  it('review 5: a paragraph selected elsewhere, then the focus to a cell (Tab), no block: Ctrl+C copies the CELL', () => {
    const t = cmake();
    const p = document.body.appendChild(document.createElement('p'));
    p.textContent = 'some page text';
    // (jsdom drops the selection on focus: the focus first, then the selection, as a browser keeps it after Tab.)
    t.at('r1', 'qty');
    const r = document.createRange();
    r.selectNodeContents(p);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(r);
    expect(String(document.getSelection())).toBe('some page text');
    const { e, text } = clip('copy');
    expect(e.defaultPrevented).toBe(true);
    expect(text).toBe('1\r\n');
  });

  it('review 5: a text selection INSIDE the grid with no block: the browser copies it (not prevented); with a block: the grid\'s', () => {
    const t = cmake();
    t.at('r1', 'qty');
    const r = document.createRange();
    r.selectNodeContents(t.cell('r2', 'name')!);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(r);
    expect(clip('copy').e.defaultPrevented).toBe(false);
    expect(clip('cut').e.defaultPrevented).toBe(false);
    t.api().set(R_(['r0', 'qty'], ['r1', 'qty']));
    expect(clip('copy').text).toBe('0\r\n1\r\n');
  });

  it('a host\'s own handler that prevented the event wins: nothing written, nothing said', async () => {
    const t = cmake();
    t.at('r1', 'qty');
    document.body.addEventListener('copy', (e) => e.preventDefault(), { once: true });
    const { text } = clip('copy');
    expect(text).toBeUndefined();
    await flush();
    expect(t.said()).toEqual([]);
    expect(t.of('rangeCopied')).toEqual([]);
  });

  it('the keydown of Ctrl / Cmd + C, X, V is never prevented (a prevented keydown kills the event)', () => {
    for (const mac of [false, true]) {
      const t = cmake({ editors: 'before', settings: {} });
      t.at('r1', 'qty');
      t.api().set(R_(['r0', 'qty'], ['r2', 'price']));
      for (const k of ['c', 'x', 'v', 'C', 'Insert']) {
        const ev = t.press(k, { ctrlKey: !mac, metaKey: mac, code: k === 'Insert' ? 'Insert' : `Key${k.toUpperCase()}` });
        expect(ev.defaultPrevented, `${mac} ${k}`).toBe(false);
      }
      expect(t.press('Insert', { shiftKey: true }).defaultPrevented).toBe(false);
      cleanup();
    }
  });
});

describe('copy and paste in a shadow root (review 1)', () => {
  it('a grid inside an open shadow root: copy and paste are its own (the focus read in its root)', () => {
    const outer = document.body.appendChild(document.createElement('div'));
    const sr = outer.attachShadow({ mode: 'open' });
    const host = sr.appendChild(document.createElement('div'));
    const t = cmake({ host });
    t.at('r1', 'qty');
    expect(document.activeElement).toBe(outer);
    expect(sr.activeElement).toBe(t.cell('r1', 'qty'));
    const { e, text } = clip('copy');
    expect(e.defaultPrevented).toBe(true);
    expect(text).toBe('1\r\n');
    clip('paste', { 'text/plain': '9' });
    expect(t.changes()).toEqual(['r1/qty=9']);
  });

  it('an inner grid in a shadow root inside the outer grid\'s detail panel: the inner grid copies, never the outer\'s block', () => {
    let innerGrid: ReturnType<typeof createGrid<C>> | null = null;
    const part = definePart('detail', {
      mount(h) {
        const sh = h.appendChild(document.createElement('div')).attachShadow({ mode: 'open' });
        const box = sh.appendChild(document.createElement('div'));
        innerGrid = createGrid<C>(box, { rows: crows(3).map((r) => ({ ...r, name: `in-${r.id}` })), getRowId: (r) => r.id, columns: CCOLS, messages: CMSG.en, features: [range()] }, { sync: true, geometry: { read: () => ({ block: 200, inline: 600, scrollTop: 0, scrollInline: 0 }), writeScrollTop() {}, writeScrollInline() {} } });
        return { update() {}, destroy: () => innerGrid?.destroy() };
      },
    });
    const t = cmake({ extra: [detail<C>({ part, height: 220 }) as never], settings: { messages: join(CMSG.en, EN_DETAIL) } as never });
    t.g.kernel.dispatch({ type: 'rows.expand', rows: [key('r1')], expanded: true }, 'api');
    t.api().set(R_(['r2', 'name'], ['r3', 'qty']));
    expect(innerGrid).not.toBeNull();
    innerGrid!.api.focusCell(key('r2'), 'name');
    const sr = [...t.host.querySelectorAll<HTMLElement>('.dzg-dcell div')].find((d) => d.shadowRoot)!.shadowRoot!;
    sr.querySelector<HTMLElement>('.dzg-layer .dzg-cell[data-col="name"]')!.focus();
    expect(sr.activeElement?.closest('.dzg')).not.toBe(t.ctx.el.root);
    const { e, text } = clip('copy');
    expect(e.defaultPrevented).toBe(true);
    expect(text).toMatch(/^in-r\d\r\n$/);
  });
});

describe('copy: canCopy and rangeCopied (clipboard.md 9, L9)', () => {
  it('canCopy refuses: prevented, nothing written, « Copying not allowed » said, no event; asked with ids and counts only', async () => {
    const ask = vi.fn(() => false);
    const t = cmake({ range: { canCopy: ask } });
    t.at('r0');
    t.api().set(R_(['r0', 'name'], ['r2', 'qty']));
    const { e, data } = clip('copy');
    expect(e.defaultPrevented).toBe(true);
    expect(data.types).toEqual([]);
    expect(ask.mock.calls).toEqual([[{ columns: ['name', 'qty'], rows: 3, cells: 6, cut: false }]]);
    expect(t.of('rangeCopied')).toEqual([]);
    await flush();
    expect(t.said()).toContain('Copying not allowed');
    expect(t.api().copy()).toBeNull();
  });

  it('a canCopy that throws counts as a refusal', () => {
    const t = cmake({ range: { canCopy: () => { throw new Error('x'); } } });
    t.at('r0');
    const { e, data } = clip('copy');
    expect(e.defaultPrevented).toBe(true);
    expect(data.types).toEqual([]);
  });

  it('rangeCopied tells counts only, never a value (deep-checked)', () => {
    const t = cmake();
    t.at('r0');
    t.api().set(R_(['r0', 'name'], ['r2', 'qty']));
    clip('copy');
    const ev = t.of('rangeCopied');
    expect(ev).toEqual([{ type: 'rangeCopied', source: 'user', rows: 3, columns: 2, cells: 6, cut: false }]);
    expect(JSON.stringify(ev)).not.toMatch(/N0|N1|N2/);
    t.api().copy();
    expect(t.of('rangeCopied')[1]!.source).toBe('api');
  });
});
