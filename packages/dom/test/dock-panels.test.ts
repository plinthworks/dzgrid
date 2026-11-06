// The columns panel and the filters panel in the dock (Phase 9, docs/behaviors/dock.md 1, 3, 6; columns-chooser.md,
// filters-panel.md 15): with `dock()` they stand in its areas instead of the dialog and the own side; their options and
// `api(grid)` unchanged; the columns panel keeps its list and keys but is not modal. Expectations written by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { makeQuery } from '@dzgrid/core';
import { dock, type DockOptions } from '../src/dock.js';
import { columnsChooser } from '../src/columns-panel.js';
import { filters } from '../src/filters.js';
import { filtersPanel, type FiltersPanelOptions } from '../src/filters-panel.js';
import { EN } from '../src/locales/en.js';
import { EN_DOCK } from '../src/locales/en-dock.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';
import { EN_FILTERS } from '../src/locales/en-filters.js';
import { EN_FILTERS_PANEL } from '../src/locales/en-filters-panel.js';
import type { GridMessages } from '../src/messages.js';
import { cleanup, make } from './support-filters.js';

afterEach(cleanup);

const MSG: GridMessages = { locale: 'en', text: { ...EN.text, ...EN_DOCK.text, ...EN_COLUMNS.text, ...EN_FILTERS.text, ...EN_FILTERS_PANEL.text } };

function grid(o: { dock?: DockOptions; columns?: boolean; filters?: FiltersPanelOptions | false; noDock?: boolean } = {}) {
  const ch = columnsChooser();
  const fp = filtersPanel(o.filters || {});
  const t = make({ features: [filters(), ...(o.columns === false ? [] : [ch]), ...(o.filters === false ? [] : [fp]), ...(o.noDock ? [] : [dock(o.dock)])], settings: { messages: MSG } });
  const root = t.host.querySelector<HTMLElement>('.dzg')!;
  const area = (s: string) => root.querySelector<HTMLElement>(`:scope > .dzg-dock[data-area=${s}]`)!;
  const app = document.body.appendChild(Object.assign(document.createElement('button'), { textContent: 'Columns' }));
  return { ...t, root, area, app, ch: () => ch.api(t.g)!, fp: () => fp.api(t.g)!, cp: () => root.querySelector<HTMLElement>('.dzg-dock .dzg-cp'), fpanel: () => root.querySelector<HTMLElement>('.dzg-dock .dzg-fpanel') };
}

describe('the columns panel in the dock', () => {
  it('opened by its API: in the end area, not a dialog, nothing modal; the focus in its search; its own title left to the head', () => {
    const t = grid({ filters: false });
    expect(t.area('end').hidden).toBe(true);
    t.app.focus();
    expect(t.ch().open(t.app)).toBe(true);
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(document.querySelector('[aria-modal]')).toBeNull();
    expect(t.area('end').hidden).toBe(false);
    expect(t.area('end').getAttribute('aria-label')).toBe('Choose columns, Data grid');
    expect(t.cp()).not.toBeNull();
    expect(document.activeElement).toBe(t.cp()!.querySelector('input[type=search]'));
    expect(t.cp()!.querySelector('.dzg-cp-title')!.closest('.dzg-dock-box')).not.toBeNull(); // hidden by the dock's layout (dock/styles.ts)
    expect([...t.cp()!.querySelectorAll<HTMLElement>('li.dzg-cp-row')].map((r) => r.dataset['col'])).toEqual(['name', 'n', 'd']);
    expect(t.ch().isOpen).toBe(true);
  });

  it('works as the dialog: a box unticked hides its column; Tab is the page’s (no trap); « Close » hides it, the focus back to the button', () => {
    const t = grid({ filters: false });
    t.app.focus();
    t.ch().open(t.app);
    const box = t.cp()!.querySelector<HTMLInputElement>('li[data-col=n] input')!;
    box.click();
    expect(t.g.kernel.columns.visible().map((c) => c.id)).toEqual(['name', 'd']);
    const s = t.cp()!.querySelector<HTMLInputElement>('input[type=search]')!;
    expect(t.key(s, 'Tab').defaultPrevented).toBe(false);
    t.cp()!.querySelector<HTMLButtonElement>('.dzg-cp-foot [data-act=close]')!.click();
    expect(t.area('end').hidden).toBe(true);
    expect(t.ch().isOpen).toBe(false);
    expect(document.activeElement).toBe(t.app);
  });

  it('`dock({ open: { columns } })`: shown from the start, its list drawn; new definitions redraw it, it stays', () => {
    const t = grid({ filters: false, dock: { open: { columns: 'start' } } });
    expect(t.area('start').hidden).toBe(false);
    expect(t.cp()!.querySelectorAll('li.dzg-cp-row')).toHaveLength(3);
    t.g.update({ columns: [{ id: 'name', header: 'Name' }, { id: 'n', header: 'N', type: 'number' }] } as never); // the support's rows type
    expect(t.cp()!.querySelectorAll('li.dzg-cp-row')).toHaveLength(2);
    expect(t.ch().isOpen).toBe(true);
  });

  it('without the dock: the dialog, as before', () => {
    const t = grid({ filters: false, noDock: true });
    t.ch().open(t.app);
    expect(document.querySelector('.dzg-popup[role=dialog] .dzg-cp')).not.toBeNull();
    expect(t.root.querySelector('.dzg-dock')).toBeNull();
  });
});

describe('the filters panel in the dock', () => {
  it('by default its strip: the end area collapsed, titled « Filters »; no side of its own', () => {
    const t = grid({ columns: false });
    expect(t.root.querySelector('.dzg-fside')).toBeNull();
    expect(t.root.hasAttribute('data-dzg-fside')).toBe(false);
    const a = t.area('end');
    expect([a.hidden, a.hasAttribute('data-collapsed')]).toEqual([false, true]);
    expect(a.querySelector('.dzg-dock-title')!.textContent).toBe('Filters');
    expect(document.querySelector('style[data-dzgrid-dock]')!.textContent).toContain(':where(.dzg-dock-box :is(.dzg-cp-title,.dzg-fp-head)){display:none}');
    expect(t.fp().isOpen).toBe(false);
  });

  it('open() restores the area, the focus in its search; × collapses it again (its strip stays); the title counts the filters in force', () => {
    const t = grid({ columns: false });
    expect(t.fp().open()).toBe(true);
    expect(t.area('end').hasAttribute('data-collapsed')).toBe(false);
    expect(document.activeElement).toBe(t.fpanel()!.querySelector('input[type=search]'));
    expect(t.fp().isOpen).toBe(true);
    t.area('end').querySelector<HTMLButtonElement>('.dzg-dock-x')!.click();
    expect([t.area('end').hidden, t.area('end').hasAttribute('data-collapsed'), t.fp().isOpen]).toEqual([false, true, false]);
    t.g.kernel.dispatch({ type: 'query.set', query: makeQuery({ filter: { n: { kind: 'number', op: 'gt', value: 3 } } as never }) }, 'api'); // a number filter, written as the filters store it
    expect(t.area('end').querySelector('.dzg-dock-title')!.textContent).toBe('Filters Active: 1');
    expect(t.fp().toggle()).toBe(true);
    expect(t.fp().toggle()).toBe(false);
  });

  it('`button: false`: hidden until opened; close() hides it; `side: start`, `open: true`', () => {
    const t = grid({ columns: false, filters: { button: false } });
    expect(t.area('end').hidden).toBe(true);
    t.fp().open();
    expect(t.area('end').hidden).toBe(false);
    t.fp().close();
    expect(t.area('end').hidden).toBe(true);
    const s = grid({ columns: false, filters: { side: 'start', open: true } });
    expect([s.area('start').hidden, s.area('start').hasAttribute('data-collapsed'), s.fp().isOpen]).toEqual([false, false, true]);
  });

  it('with the columns panel: two tabs in the end area', () => {
    const t = grid({ dock: { open: { columns: 'end', filters: 'end' } } });
    const tabs = [...t.area('end').querySelectorAll<HTMLElement>('[role=tab]')];
    expect(tabs.map((b) => [b.textContent, b.getAttribute('aria-selected')])).toEqual([['Choose columns', 'true'], ['Filters', 'false']]);
    tabs[1]!.click();
    expect(t.fp().isOpen).toBe(true);
    expect(t.ch().isOpen).toBe(false);
  });
});
