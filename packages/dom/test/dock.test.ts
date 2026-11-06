// The dock (Phase 9, docs/behaviors/dock.md; owner Q-SB5, « Dock — owner B » 2026-11-06): areas inside the grid's box,
// an application's panels, tabs, the edge (APG window splitter) by keys and pointer, collapse, the place menu, close,
// `float` refused, right to left. jsdom checks the attributes and the model; the layout is checked in real browsers
// (scripts/browser-dock.mjs). Expectations written by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { DockState } from '@dzgrid/core/dock';
import { dock, DOCK_KEYS, type DockFeature, type DockOptions } from '../src/dock.js';
import { EN } from '../src/locales/en.js';
import { AR } from '../src/locales/ar.js';
import { EN_DOCK } from '../src/locales/en-dock.js';
import { AR_DOCK } from '../src/locales/ar-dock.js';
import { FR_DOCK } from '../src/locales/fr-dock.js';
import type { GridMessages } from '../src/messages.js';
import { cleanup, make } from './support-filters.js';

afterEach(cleanup);

const join = (...b: { readonly locale: string; readonly text: object }[]): GridMessages => ({ locale: b[0]!.locale, text: Object.assign({}, ...b.map((x) => x.text)) });
const MSG = join(EN, EN_DOCK);

function grid(o: DockOptions & { rtl?: boolean; label?: string } = {}) {
  const mounted: string[] = [];
  const gone: string[] = [];
  const changes: DockState[] = [];
  const panels = o.panels ?? (['notes', 'help'] as const).map((id) => ({
    id,
    title: id === 'notes' ? 'Notes' : () => 'Help',
    mount(host: HTMLElement) {
      mounted.push(id);
      const b = host.appendChild(document.createElement('button'));
      b.className = `in-${id}`;
      b.textContent = id;
      return () => gone.push(id);
    },
  }));
  const d: DockFeature = dock({ ...o, panels, onChange: (l) => changes.push(l) });
  const t = make({ features: [d], settings: { messages: o.rtl ? join(AR, AR_DOCK) : MSG, ...(o.rtl && { direction: 'rtl' }), ...(o.label && { label: o.label }) } });
  const root = t.host.querySelector<HTMLElement>('.dzg')!;
  const area = (s: string) => root.querySelector<HTMLElement>(`:scope > .dzg-dock[data-area=${s}]`)!;
  const sep = (s: string) => area(s).querySelector<HTMLElement>('.dzg-dock-sep')!;
  const tog = (s: string) => area(s).querySelector<HTMLButtonElement>('.dzg-dock-tog')!;
  const place = (s: string) => area(s).querySelector<HTMLButtonElement>('.dzg-dock-place')!;
  const x = (s: string) => area(s).querySelector<HTMLButtonElement>('.dzg-dock-x')!;
  const tabs = (s: string) => [...area(s).querySelectorAll<HTMLElement>('.dzg-dock-tab')].filter((b) => !b.hidden);
  const boxes = (s: string) => [...area(s).querySelectorAll<HTMLElement>('.dzg-dock-box')];
  const seen = (s: string) => boxes(s).filter((b) => !b.hidden).map((b) => b.firstElementChild!.firstElementChild!.className);
  const room = (s: string) => root.style.getPropertyValue(`--dzg-dock-${s}`);
  const api = () => d.api(t.g)!;
  return { ...t, d, root, area, sep, tog, place, x, tabs, boxes, seen, room, api, mounted, gone, changes };
}

describe('dock: the areas', () => {
  it('needs its texts, naming the missing ones', () => {
    expect(DOCK_KEYS).toEqual(Object.keys(EN_DOCK.text));
    expect(Object.keys(FR_DOCK.text)).toEqual(DOCK_KEYS);
    expect(Object.keys(AR_DOCK.text)).toEqual(DOCK_KEYS);
    expect(() => make({ features: [dock()], settings: { messages: EN } })).toThrow(/^dock: missing dock\.region, dock\.tabs, .*dock\.height$/);
  });

  it('three areas inside the grid’s box, the start one first, the others last; the grid’s own children untouched; none shown without a panel shown', () => {
    const t = grid();
    const kids = [...t.root.children].map((c) => c.className.split(' ')[0]);
    expect(kids[0]).toBe('dzg-dock');
    expect(kids.slice(1, 3)).toEqual(['dzg-viewport', 'dzg-overlay']);
    expect(kids.slice(-2)).toEqual(['dzg-dock', 'dzg-dock']);
    expect(['start', 'end', 'bottom'].map((s) => t.area(s).hidden)).toEqual([true, true, true]);
    expect(t.root.hasAttribute('data-dzg-dock')).toBe(true);
    expect(['start', 'end', 'bottom'].map(t.room)).toEqual(['0px', '0px', '0px']);
    // The application's panels are drawn once, at setup, hidden.
    expect(t.mounted).toEqual(['notes', 'help']);
  });

  it('`open` shows a panel at its area: a region named « panel, grid », its title, its room on the root', () => {
    const t = grid({ open: { notes: 'start' }, label: 'Patients' });
    const a = t.area('start');
    expect(a.hidden).toBe(false);
    expect(a.getAttribute('role')).toBe('region');
    expect(a.getAttribute('aria-label')).toBe('Notes, Patients');
    expect(a.querySelector('.dzg-dock-title')!.textContent).toBe('Notes');
    expect(t.seen('start')).toEqual(['in-notes']);
    expect(t.room('start')).toBe('288px');
    expect([t.tog('start').getAttribute('aria-label'), t.place('start').getAttribute('aria-label'), t.x('start').getAttribute('aria-label')]).toEqual(['Collapse Notes', 'Place Notes', 'Close Notes']);
    expect(t.tog('start').getAttribute('aria-expanded')).toBe('true');
    expect(t.place('start').getAttribute('aria-haspopup')).toBe('menu');
    // One panel: no tablist.
    expect(a.querySelector('[role=tablist]')).toBeNull();
    expect(t.changes).toEqual([]);
  });

  it('show / hide from the API: the focus goes back to what opened it; told by onChange', () => {
    const t = grid();
    const opener = document.body.appendChild(document.createElement('button'));
    opener.focus();
    expect(t.api().show('notes')).toBe(true);
    expect(t.area('end').hidden).toBe(false);
    expect(t.changes.at(-1)).toEqual({ panels: { notes: { area: 'end', open: true }, help: { area: 'end', open: false } }, areas: { end: { active: 'notes' } } });
    (t.area('end').querySelector('.in-notes') as HTMLElement).focus();
    expect(t.api().hide('notes')).toBe(true);
    expect(t.area('end').hidden).toBe(true);
    expect(document.activeElement).toBe(opener);
    expect(t.api().hide('notes')).toBe(false);
    expect(t.api().show('nope')).toBe(false);
    expect(t.changes).toHaveLength(2);
  });

  it('`float` is refused for now: the option, show and move each tell one warning; the panel stays where it was', () => {
    const t = grid({ open: { notes: 'float', help: 'end' } });
    expect(t.area('end').hidden).toBe(false);
    expect(t.api().layout().panels['notes']).toEqual({ area: 'end', open: false });
    expect(t.api().move('help', 'float')).toBe(false);
    expect(t.api().show('help', 'left' as never)).toBe(false); // not an area at all, from an untyped caller
    expect(t.problems().map((p) => [p.code, p.severity, p.path, p.detail])).toEqual([
      ['invalid-setting', 'warning', 'dock.open.notes', 'float'],
      ['invalid-setting', 'warning', 'dock.move', 'float'],
      ['invalid-setting', 'warning', 'dock.area', 'left'],
    ]);
    expect(t.api().layout().panels['help']).toEqual({ area: 'end', open: true });
  });

  it('the grid going removes the areas, runs the panels’ cleanups, and the API is gone', () => {
    const t = grid({ open: { notes: 'end' } });
    t.g.destroy();
    expect(t.host.querySelector('.dzg-dock')).toBeNull();
    expect(t.gone).toEqual(['notes', 'help']);
    expect(t.d.api(t.g)).toBeNull();
  });
});

describe('dock: tabs (two panels in one area)', () => {
  it('a tablist named « Panels »: tabs selected and controlling their tabpanel; one tab stop; only the shown panel’s body', () => {
    const t = grid({ open: { notes: 'end', help: 'end' } });
    const list = t.area('end').querySelector<HTMLElement>('[role=tablist]')!;
    expect(list.getAttribute('aria-label')).toBe('Panels');
    expect(list.getAttribute('aria-orientation')).toBe('horizontal');
    expect(t.tabs('end').map((b) => [b.textContent, b.getAttribute('role'), b.getAttribute('aria-selected'), b.tabIndex])).toEqual([['Notes', 'tab', 'true', 0], ['Help', 'tab', 'false', -1]]);
    const [p1, p2] = t.boxes('end');
    expect([p1!.getAttribute('role'), p1!.getAttribute('aria-labelledby'), t.tabs('end')[0]!.getAttribute('aria-controls')]).toEqual(['tabpanel', t.tabs('end')[0]!.id, p1!.id]);
    expect([p1!.hidden, p2!.hidden]).toEqual([false, true]);
    expect(t.area('end').querySelector<HTMLElement>('.dzg-dock-title')!.hidden).toBe(true);
    // The head's buttons name the shown panel.
    expect(t.x('end').getAttribute('aria-label')).toBe('Close Notes');
  });

  it('arrows move the focus the reading way and wrap; Home / End; a click shows that panel (manual activation)', () => {
    const t = grid({ open: { notes: 'end', help: 'end' } });
    const [a, b] = t.tabs('end');
    a!.focus();
    t.key(a!, 'ArrowRight');
    expect(document.activeElement).toBe(b);
    expect(a!.getAttribute('aria-selected')).toBe('true'); // moving is not showing
    t.key(b!, 'ArrowRight');
    expect(document.activeElement).toBe(a);
    t.key(a!, 'End');
    expect(document.activeElement).toBe(b);
    t.key(b!, 'Home');
    expect(document.activeElement).toBe(a);
    b!.click();
    expect([a!.getAttribute('aria-selected'), b!.getAttribute('aria-selected'), b!.tabIndex]).toEqual(['false', 'true', 0]);
    expect(t.seen('end')).toEqual(['in-help']);
    expect(t.changes.at(-1)!.areas).toEqual({ end: { active: 'help' } });
  });

  it('right to left: ← goes to the next tab', () => {
    const t = grid({ open: { notes: 'end', help: 'end' }, rtl: true });
    const [a, b] = t.tabs('end');
    a!.focus();
    t.key(a!, 'ArrowLeft');
    expect(document.activeElement).toBe(b);
  });
});

describe('dock: the edge (APG window splitter)', () => {
  it('a focusable separator, named, with its size in px between the limits', () => {
    const t = grid({ open: { notes: 'end', help: 'bottom' } });
    const s = t.sep('end');
    expect([s.getAttribute('role'), s.tabIndex, s.getAttribute('aria-orientation'), s.getAttribute('aria-label')]).toEqual(['separator', 0, 'vertical', 'Width of Notes']);
    expect([s.getAttribute('aria-valuenow'), s.getAttribute('aria-valuemin'), s.getAttribute('aria-valuemax')]).toEqual(['288', '160', '800']);
    expect(s.getAttribute('aria-controls')).toBe(t.area('end').querySelector('.dzg-dock-body')!.id);
    const b = t.sep('bottom');
    expect([b.getAttribute('aria-orientation'), b.getAttribute('aria-label'), b.getAttribute('aria-valuenow')]).toEqual(['horizontal', 'Height of Help', '240']);
  });

  it('keys: the arrows move the edge the way they point (16 px, Shift 64), Home / End the limits; on each side and in right to left', () => {
    const t = grid({ open: { notes: 'end', help: 'start' }, sizes: { min: 200, max: 500 } });
    const e = t.sep('end');
    t.key(e, 'ArrowLeft'); // the end area is on the right: the edge goes left, the panel grows
    expect([e.getAttribute('aria-valuenow'), t.room('end')]).toEqual(['304', '304px']);
    t.key(e, 'ArrowRight', { shiftKey: true });
    expect(e.getAttribute('aria-valuenow')).toBe('240');
    t.key(e, 'Home');
    expect(e.getAttribute('aria-valuenow')).toBe('200');
    t.key(e, 'End');
    expect(e.getAttribute('aria-valuenow')).toBe('500');
    t.key(e, 'ArrowUp'); // not this edge's axis
    expect(e.getAttribute('aria-valuenow')).toBe('500');
    t.key(t.sep('start'), 'ArrowRight');
    expect(t.sep('start').getAttribute('aria-valuenow')).toBe('304');
    expect(t.changes.at(-1)!.areas).toEqual({ end: { active: 'notes', size: 500 }, start: { active: 'help', size: 304 } });

    const r = grid({ open: { notes: 'end', help: 'bottom' }, rtl: true });
    r.key(r.sep('end'), 'ArrowLeft'); // right to left the end area is on the left: the edge goes left, the panel shrinks
    expect(r.sep('end').getAttribute('aria-valuenow')).toBe('272');
    r.key(r.sep('bottom'), 'ArrowUp');
    expect(r.sep('bottom').getAttribute('aria-valuenow')).toBe('256');
  });

  it('Enter collapses: the strip, the edge hidden, the focus on « Expand »; « Expand » restores at its size', () => {
    const t = grid({ open: { notes: 'end' } });
    t.key(t.sep('end'), 'ArrowLeft');
    t.sep('end').focus();
    t.key(t.sep('end'), 'Enter');
    expect(t.area('end').hasAttribute('data-collapsed')).toBe(true);
    expect(t.sep('end').hidden).toBe(true);
    expect(t.room('end')).toBe('var(--dzg-dock-strip,2rem)');
    expect(document.activeElement).toBe(t.tog('end'));
    expect([t.tog('end').getAttribute('aria-expanded'), t.tog('end').getAttribute('aria-label')]).toEqual(['false', 'Expand Notes']);
    expect(t.seen('end')).toEqual([]);
    t.tog('end').click();
    expect([t.area('end').hasAttribute('data-collapsed'), t.room('end')]).toEqual([false, '304px']);
    expect(t.changes.at(-1)!.areas).toEqual({ end: { active: 'notes', size: 304 } });
  });

  it('dragged by the pointer: the size follows the pointer from where it was grabbed; told once, at the release', () => {
    const t = grid({ open: { notes: 'end' } });
    const a = t.area('end');
    a.getBoundingClientRect = () => ({ left: 612, right: 900, width: 288, top: 0, bottom: 400, height: 400, x: 612, y: 0, toJSON() {} }) as DOMRect;
    const s = t.sep('end');
    const pe = (type: string, clientX: number) => s.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 3, clientX, clientY: 50 }));
    pe('pointerdown', 620); // grabbed 8 px inside the area
    pe('pointermove', 570);
    expect(s.getAttribute('aria-valuenow')).toBe('338');
    pe('pointermove', 900); // as small as allowed
    expect(s.getAttribute('aria-valuenow')).toBe('160');
    pe('pointermove', 520);
    expect(t.changes).toEqual([]);
    pe('pointerup', 520);
    expect(t.changes).toEqual([{ panels: { notes: { area: 'end', open: true }, help: { area: 'end', open: false } }, areas: { end: { active: 'notes', size: 388 } } }]);
    expect(document.activeElement).toBe(s);
  });
});

describe('dock: place, close, layout', () => {
  it('« Place »: a menu of the three areas, the current one ticked; picking moves the panel, the focus on its new « Place »', () => {
    const t = grid({ open: { notes: 'end' } });
    t.place('end').click();
    const menu = document.querySelector<HTMLElement>('[role=menu]')!;
    const items = [...menu.querySelectorAll<HTMLElement>('[role=menuitemradio]')];
    expect(items.map((i) => [i.textContent, i.getAttribute('aria-checked')])).toEqual([['At the start', 'false'], ['At the end', 'true'], ['At the bottom', 'false']]);
    items[2]!.click();
    expect([t.area('end').hidden, t.area('bottom').hidden]).toEqual([true, false]);
    expect(t.seen('bottom')).toEqual(['in-notes']);
    expect(document.activeElement).toBe(t.place('bottom'));
    expect(t.changes.at(-1)!.panels).toEqual({ notes: { area: 'bottom', open: true }, help: { area: 'end', open: false } });
  });

  it('moving into an area that holds a panel makes tabs there, the moved one shown and focused', () => {
    const t = grid({ open: { notes: 'end', help: 'start' } });
    expect(t.api().move('help', 'end')).toBe(true);
    expect(t.area('start').hidden).toBe(true);
    expect(t.tabs('end').map((b) => [b.textContent, b.getAttribute('aria-selected')])).toEqual([['Notes', 'false'], ['Help', 'true']]);
    expect(document.activeElement).toBe(t.tabs('end')[1]);
  });

  it('× hides the shown panel; the other tab is shown; the last one gone, the area goes; the focus to the grid', () => {
    const t = grid({ open: { notes: 'end', help: 'end' } });
    t.x('end').focus();
    t.x('end').click();
    expect(t.tabs('end')).toHaveLength(1);
    expect(t.seen('end')).toEqual(['in-help']);
    t.x('end').click();
    expect(t.area('end').hidden).toBe(true);
    expect(t.area('end').contains(document.activeElement)).toBe(false);
  });

  it('layout() / setLayout(): a restore replaces the layout, is not told, refuses `float`; the panels it does not name go back to their first place', () => {
    const t = grid({ open: { help: 'end' } });
    const p = t.api().setLayout({ panels: { notes: { area: 'bottom', open: true }, other: { area: 'float', open: true } }, areas: { bottom: { size: 300, collapsed: true } } });
    expect(p.map((x) => [x.code, x.path, x.detail])).toEqual([['state-field', 'dock.panels.other.area', 'float']]);
    expect(t.api().layout()).toEqual({ panels: { notes: { area: 'bottom', open: true }, help: { area: 'end', open: true } }, areas: { bottom: { size: 300, collapsed: true }, end: { active: 'help' } } });
    expect([t.area('bottom').hasAttribute('data-collapsed'), t.area('end').hidden]).toEqual([true, false]);
    expect(t.changes).toEqual([]);
    expect(t.api().collapse('bottom', false)).toBe(true);
    expect(t.room('bottom')).toBe('300px');
    expect(t.api().resize('start', 300)).toBe(false); // nothing shown there
    expect(t.api().collapse('float')).toBe(false);
  });

  it('nothing changed, nothing told (a panel shown again where it is)', () => {
    const t = grid({ open: { notes: 'end' } });
    t.api().show('notes');
    expect(t.changes).toEqual([]);
    vi.useRealTimers();
  });
});
