// `<dz-grid>`, the Web Component (docs/behaviors/web-component.md; Phase 11 L7). Expectations written by hand.
import { describe, it, expect, afterEach } from 'vitest';
import type { ColumnDef, DisplayIndex, Problem } from '@dzgrid/core';
import type { GridEnv } from '@dzgrid/dom';
import { definePart } from '@dzgrid/dom';
import { EN } from '@dzgrid/dom/locales/en';
import { DzGridElement, defineDzGrid } from '../src/index.js';

type R = { id: string; name: string; n: number };
const ROWS: R[] = [
  { id: 'a', name: 'Alger', n: 3 },
  { id: 'b', name: 'Oran', n: 1 },
  { id: 'c', name: 'Blida', n: 2 },
];
const COLUMNS: ColumnDef<R, any>[] = [{ id: 'name' }, { id: 'n', type: 'number' }]; // any: the column's value type is not under test
const env: GridEnv = { sync: true, geometry: { read: () => ({ block: 400, inline: 600, scrollTop: 0, scrollInline: 0 }), writeScrollTop: () => {}, writeScrollInline: () => {} } };

defineDzGrid('dz-grid-test');
afterEach(() => void (document.body.innerHTML = ''));
const tick = () => new Promise<void>((r) => queueMicrotask(r));

/** An element given everything it needs, in the page. */
function make(html = '<dz-grid-test></dz-grid-test>', more: (el: DzGridElement<R>) => void = () => {}): DzGridElement<R> {
  document.body.insertAdjacentHTML('beforeend', html);
  const el = document.body.lastElementChild as DzGridElement<R>;
  el.env = env;
  more(el);
  el.columns = COLUMNS;
  el.getRowId = (r) => r.id;
  el.rows = ROWS;
  el.messages = EN;
  return el;
}
const texts = (el: Element) => [...el.querySelectorAll('.dzg-layer > .dzg-row .dzg-cell[data-col="name"]')].map((c) => c.textContent);
const problemsOf = (el: Element): Problem[] => {
  const seen: Problem[] = [];
  el.addEventListener('dzg-problems', (e) => seen.push(...(e as CustomEvent).detail.problems));
  return seen;
};

describe('<dz-grid> definition (1, 2)', () => {
  it('defineDzGrid defines once; a second call or a taken name does nothing', () => {
    expect(customElements.get('dz-grid-test')).toBeDefined();
    expect(() => defineDzGrid('dz-grid-test')).not.toThrow();
    expect(customElements.get('dz-grid-test')!.prototype).toBeInstanceOf(DzGridElement);
  });

  it('importing the package defines nothing; the define entry defines dz-grid', async () => {
    expect(customElements.get('dz-grid')).toBeUndefined();
    const m = await import('../src/define.js');
    expect([typeof m.defineDzGrid, customElements.get('dz-grid')!.prototype instanceof DzGridElement]).toEqual(['function', true]);
  });

  it('a grid already drawn as its child (Angular’s) is left alone and told', async () => {
    document.body.insertAdjacentHTML('beforeend', '<dz-grid-test><div class="dzg"></div></dz-grid-test>');
    const el = document.body.lastElementChild as DzGridElement<R>;
    const seen = problemsOf(el);
    el.env = env;
    el.columns = COLUMNS;
    el.getRowId = (r) => r.id;
    el.messages = EN;
    await tick();
    expect([el.grid, el.querySelectorAll('.dzg').length, seen.map((p) => [p.code, p.path, p.detail])]).toEqual([null, 1, [['invalid-setting', 'element', 'already-a-grid']]]);
    await expect(el.ready).rejects.toThrow(/already/);
  });
});

describe('<dz-grid> properties (3, 4)', () => {
  it('made once connected with columns, getRowId and messages; in the page, no shadow root; display contents', async () => {
    const el = make();
    expect([el.shadowRoot, el.querySelector(':scope > .dzg') !== null, texts(el), el.style.display]).toEqual([null, true, ['Alger', 'Oran', 'Blida'], 'contents']);
    await expect(el.ready).resolves.toBeUndefined();
  });

  it('nothing drawn, nothing told, until the three required ones are there', async () => {
    document.body.insertAdjacentHTML('beforeend', '<dz-grid-test></dz-grid-test>');
    const el = document.body.lastElementChild as DzGridElement<R>;
    const seen = problemsOf(el);
    el.env = env;
    el.columns = COLUMNS;
    el.rows = ROWS;
    await tick();
    expect([el.grid, el.children.length, seen]).toEqual([null, 0, []]);
    el.getRowId = (r) => r.id;
    el.messages = EN;
    expect(texts(el)).toEqual(['Alger', 'Oran', 'Blida']);
  });

  it('properties set before the element is defined are taken', () => {
    const el = document.createElement('dz-grid-later') as DzGridElement<R>;
    Object.assign(el, { env, columns: COLUMNS, getRowId: (r: R) => r.id, rows: ROWS, messages: EN });
    document.body.append(el);
    defineDzGrid('dz-grid-later');
    expect(texts(el)).toEqual(['Alger', 'Oran', 'Blida']);
  });

  it('a new rows list is an update: the sort stays', () => {
    const el = make();
    el.grid!.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    el.rows = [...ROWS, { id: 'd', name: 'Tlemcen', n: 0 }];
    expect(texts(el)).toEqual(['Tlemcen', 'Oran', 'Blida', 'Alger']);
  });

  it('settings compared key by key: an equal new object updates nothing; a changed key is one update', () => {
    const el = make();
    const rowClass = () => 'x';
    el.settings = { rowClass };
    const calls: object[] = [];
    const update = el.grid!.update.bind(el.grid);
    el.grid!.update = (p) => (calls.push(p), update(p));
    el.settings = { rowClass };
    el.settings = { rowClass, label: 'Villes' };
    expect([calls, el.querySelector('.dzg-viewport')!.getAttribute('aria-label')]).toEqual([[{ label: 'Villes' }], 'Villes']);
  });

  it('parts as functions: a column’s cell part draws the cell', () => {
    const draw = (host: HTMLElement, c: { text: string }) => void (host.textContent = `[${c.text}]`);
    const badge = definePart('cell', { mount: (host, c) => (draw(host, c), { update: (n) => draw(host, n) }) });
    const el = make(undefined, (e) => (e.parts = { badge }));
    el.columns = [{ id: 'name', ui: { cell: 'badge' } }];
    expect(texts(el)).toEqual(['[Alger]', '[Oran]', '[Blida]']);
  });

  it('a fixed key changed later is the grid’s own unsupported-live-change', () => {
    const el = make();
    const seen = problemsOf(el);
    el.getRowId = (r) => r.name;
    expect(seen.map((p) => [p.code, p.path])).toEqual([['unsupported-live-change', 'settings.getRowId']]);
  });

  it('a property of the wrong kind is refused and told, never thrown', async () => {
    const el = make();
    const seen = problemsOf(el);
    el.columns = 'name' as never; // the wrong kind on purpose
    el.settings = 3 as never; // the wrong kind on purpose
    await tick();
    expect([texts(el), seen.map((p) => [p.code, p.severity, p.path])]).toEqual([['Alger', 'Oran', 'Blida'], [['invalid-setting', 'error', 'property:columns'], ['invalid-setting', 'error', 'property:settings']]]);
  });
});

describe('<dz-grid> attributes (5, 6)', () => {
  it('read when made, changed live, taken away back to the default; they win over settings', () => {
    const el = make('<dz-grid-test density="compact" label="Villes" busy></dz-grid-test>', (e) => (e.settings = { label: 'Autre' }));
    const vp = () => el.querySelector('.dzg-viewport')!;
    const root = () => el.querySelector('.dzg')!;
    expect([el.grid!.kernel.columns.visible().length, vp().getAttribute('aria-label'), vp().getAttribute('aria-busy')]).toEqual([2, 'Villes', 'true']);
    el.setAttribute('busy', 'false');
    el.setAttribute('label', 'Communes');
    expect([vp().getAttribute('aria-label'), vp().getAttribute('aria-busy')]).toEqual(['Communes', null]);
    el.removeAttribute('label');
    expect(vp().getAttribute('aria-label')).toBe('Autre');
    el.setAttribute('direction', 'rtl');
    expect(root().getAttribute('dir')).toBe('rtl');
  });

  it('headers="hidden" hides the header row from the eyes (hidden-headers.md 1, 1.9.0); taken away, shown', () => {
    const el = make('<dz-grid-test headers="hidden"></dz-grid-test>');
    const root = () => el.querySelector('.dzg')!;
    expect(root().getAttribute('data-headers')).toBe('hidden');
    el.removeAttribute('headers');
    expect(root().hasAttribute('data-headers')).toBe(false);
  });

  it('row-height and density reach the rows', () => {
    const el = make('<dz-grid-test row-height="48"></dz-grid-test>');
    const h = () => (el.grid as unknown as { context: { rowHeight(): number } }).context.rowHeight(); // the grid's internal context, read for the height it paints
    expect(h()).toBe(48);
    el.removeAttribute('row-height');
    el.setAttribute('density', 'spacious');
    expect(h()).toBe(40);
  });

  it('header-height reaches the header rows, live; taken away, they follow the rows (density.md « Header height »)', () => {
    const el = make('<dz-grid-test row-height="40" header-height="70"></dz-grid-test>');
    const h = () => (el.grid as unknown as { context: { headerHeight(): number } }).context.headerHeight(); // the grid's internal context, read for the height it paints
    expect(h()).toBe(70);
    el.setAttribute('header-height', '56');
    expect(h()).toBe(56);
    el.removeAttribute('header-height');
    expect(h()).toBe(40);
  });

  it('a value it cannot read is left out and told as a warning with the raw value', async () => {
    const el = make('<dz-grid-test density="huge" locale="fr-FR"></dz-grid-test>');
    const seen = problemsOf(el);
    await tick();
    el.setAttribute('locale', 'not a locale!');
    el.setAttribute('time-zone', 'Mars/Olympus');
    el.setAttribute('overlay', 'maybe');
    await tick();
    expect(seen.map((p) => [p.code, p.severity, p.path, p.detail])).toEqual([
      ['invalid-setting', 'warning', 'attribute:density', 'huge'],
      ['invalid-setting', 'warning', 'attribute:locale', 'not a locale!'],
      ['invalid-setting', 'warning', 'attribute:time-zone', 'Mars/Olympus'],
      ['invalid-setting', 'warning', 'attribute:overlay', 'maybe'],
    ]);
    expect(el.grid).not.toBeNull();
  });

  it('a row-height that is no number (empty, text) is left out and told, the density kept (review L9)', async () => {
    const el = make('<dz-grid-test row-height="48"></dz-grid-test>');
    const seen = problemsOf(el);
    const h = () => (el.grid as unknown as { context: { rowHeight(): number } }).context.rowHeight(); // the grid's internal context, read for the height it paints
    el.setAttribute('row-height', '');
    expect(h()).toBe(32);
    el.setAttribute('row-height', 'abc');
    expect(h()).toBe(32);
    await tick();
    expect(seen.map((p) => [p.severity, p.path, p.detail])).toEqual([['warning', 'attribute:row-height', ''], ['warning', 'attribute:row-height', 'abc']]);
  });

  it('without direction, the grid follows the element’s own dir', () => {
    const el = make('<dz-grid-test dir="rtl"></dz-grid-test>');
    expect(el.querySelector('.dzg')!.getAttribute('dir')).toBe('rtl');
  });
});

describe('<dz-grid> events (7, 8, 9)', () => {
  it('every grid event as dzg-<kebab type>, detail the event, bubbling and composed; settings.onEvent after', () => {
    const order: string[] = [];
    document.addEventListener('dzg-selection-changed', (e) => order.push(`doc:${(e as CustomEvent).detail.type}:${e.bubbles}:${e.composed}:${e.cancelable}`), { once: true });
    const el = make(undefined, (e) => (e.settings = { selection: { mode: 'multi' }, onEvent: (g) => g.type === 'selectionChanged' && order.push('onEvent') }));
    el.addEventListener('dzg-sort-changed', (e) => order.push(`sort:${(e as CustomEvent).detail.sort[0].column}`));
    el.grid!.kernel.dispatch({ type: 'selection.set', selection: { mode: 'include', keys: new Set([el.grid!.kernel.rows.displayed.keyAt(0 as DisplayIndex)!]) } }, 'user');
    el.grid!.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    expect(order).toEqual(['doc:selectionChanged:true:true:false', 'onEvent', 'sort:n']);
  });

  it('the creation problems come a microtask later, then dzg-ready; problems keeps them', async () => {
    const seen: string[] = [];
    document.addEventListener('dzg-problems', (e) => seen.push(`problems:${(e as CustomEvent).detail.problems[0].code}`), { once: true });
    document.addEventListener('dzg-ready', (e) => seen.push(`ready:${(e as CustomEvent).detail.grid !== null}`), { once: true });
    const el = make(undefined, (e) => (e.settings = { rowHeight: 2 }));
    expect(seen).toEqual([]);
    await tick();
    expect([seen, el.problems.map((p) => p.path)]).toEqual([['problems:invalid-setting', 'ready:true'], ['settings.rowHeight']]);
  });

  it('a grid createGrid refuses is not drawn, told, and ready rejects', async () => {
    document.body.insertAdjacentHTML('beforeend', '<dz-grid-test></dz-grid-test>');
    const el = document.body.lastElementChild as DzGridElement<R>;
    const seen = problemsOf(el);
    Object.assign(el, { env, columns: COLUMNS, getRowId: (r: R) => r.id, messages: { locale: 'en', text: {} } });
    await tick();
    expect([el.grid, el.children.length, seen.map((p) => [p.path, p.detail])]).toEqual([null, 0, [['element', 'refused']]]);
    await expect(el.ready).rejects.toBeInstanceOf(Error);
  });

  it('a refused grid keeps the text beside it (rule 14, review L9)', async () => {
    document.body.insertAdjacentHTML('beforeend', '<dz-grid-test>Villes<b>!</b></dz-grid-test>');
    const el = document.body.lastElementChild as DzGridElement<R>;
    Object.assign(el, { env, columns: COLUMNS, getRowId: (r: R) => r.id, messages: { locale: 'en', text: {} } });
    await el.ready.catch(() => {});
    expect(el.textContent).toBe('Villes!');
  });

  it('update() is grid.update; nothing before the grid exists', () => {
    const early = document.createElement('dz-grid-test') as DzGridElement<R>;
    expect(() => early.update({ label: 'x' })).not.toThrow();
    const el = make();
    el.update({ label: 'Villes' });
    expect(el.querySelector('.dzg-viewport')!.getAttribute('aria-label')).toBe('Villes');
  });
});

describe('<dz-grid> disconnect and reconnect (10)', () => {
  it('removed: destroyed a microtask later; put back: made again, ready told again', async () => {
    const el = make();
    await tick(); // the first dzg-ready told
    const first = el.grid;
    let readies = 0;
    el.addEventListener('dzg-ready', () => readies++);
    el.remove();
    expect(el.grid).toBe(first);
    await tick();
    expect([el.grid, el.querySelector('.dzg')]).toEqual([null, null]);
    document.body.append(el);
    await tick();
    expect([el.grid !== null && el.grid !== first, texts(el), readies]).toEqual([true, ['Alger', 'Oran', 'Blida'], 1]);
  });

  it('changed while out of the page, put back in the same task: the change reaches the grid (rules 4, 10, review L9)', async () => {
    const el = make();
    const g = el.grid;
    el.remove();
    el.setAttribute('density', 'compact');
    el.setAttribute('label', 'Villes');
    document.body.append(el);
    await tick();
    const h = (el.grid as unknown as { context: { rowHeight(): number } }).context.rowHeight(); // the grid's internal context, read for the height it paints
    expect([el.grid, h, el.querySelector('.dzg-viewport')!.getAttribute('aria-label')]).toEqual([g, 28, 'Villes']);
  });

  it('moved within the page in one task: the same grid, its sort kept', async () => {
    const el = make();
    const g = el.grid;
    el.grid!.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'user');
    const box = document.createElement('section');
    document.body.append(box);
    box.append(el);
    await tick();
    expect([el.grid, texts(el)]).toEqual([g, ['Oran', 'Blida', 'Alger']]);
  });
});
