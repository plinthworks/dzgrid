// `@dzgrid/dom/group-zone` and the column menu's grouping items (Phase 7 step 6): docs/behaviors/group-drop-zone.md 8–17,
// column-menu.md « Grouping »; APG toolbar. Expectations by hand, from the sheets and support-grouping.ts' made-up rows.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { groupZone } from '../src/group-zone.js';
import { grouping } from '../src/grouping.js';
import { columnMenu } from '../src/column-menu.js';
import { EN_COLUMN_MENU } from '../src/locales/en-column-menu.js';
import { BUNDLES, cleanup, click, gmake } from './support-grouping.js';

afterEach(cleanup);

type Target = { accept(c: string): boolean; drop(c: string): void; readonly label?: string };

/** A grid grouped by `by`, with the zone, and a stand-in for `columns()` that records the drop target. */
function zmake(by: string[] = ['region'], o: { lang?: 'en' | 'ar'; noColumns?: boolean } = {}) {
  const g = grouping({ by });
  const reg: { el: Element; t: Target; removed: boolean }[] = [];
  const cols = { api: () => ({ dropTargets: { add: (el: Element, t: Target) => (reg.push({ el, t, removed: false }), () => void (reg.at(-1)!.removed = true)) } }) };
  const t = gmake({ grouping: null, ...(o.lang && { lang: o.lang }), features: [g, groupZone({ use: { grouping: g, ...(!o.noColumns && { columns: cols }) } })] });
  // The made-up grid's own feature is off (`grouping: null`): this one's.
  const api = () => g.api(t.g)!;
  api().setBy(by);
  const zone = () => t.host.querySelector<HTMLElement>('.dzg-gzone')!;
  const items = () => [...zone().querySelectorAll<HTMLElement>('.dzg-chip, .dzg-chip-x')];
  const names = () => items().map((b) => b.getAttribute('aria-label') ?? b.textContent);
  const key = (el: HTMLElement, k: string, mods: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }));
  return { ...t, api, zone, items, names, key, reg };
}

describe('the band (group-drop-zone.md 8, 13, 14, 17)', () => {
  it("is a named toolbar, first in the grid's root, outside the grid, its chips in grouping order: name, then ×", () => {
    const t = zmake(['region', 'fruit']);
    const z = t.zone();
    expect(z.getAttribute('role')).toBe('toolbar');
    expect(z.getAttribute('aria-label')).toBe('Row grouping');
    expect(z.parentElement!.firstElementChild).toBe(z);
    expect(z.closest('[role=grid],[role=treegrid]')).toBeNull();
    expect(t.names()).toEqual(['Region', 'Stop grouping by Region', 'Fruit', 'Stop grouping by Fruit']);
    expect(t.items().every((b) => b.tagName === 'BUTTON' && (b as HTMLButtonElement).type === 'button')).toBe(true);
  });

  it('empty: its text, no chip', () => {
    const t = zmake([]);
    expect(t.items()).toEqual([]);
    expect(t.zone().textContent).toBe('Drag a column here to group');
  });

  it('one tab stop: the first item, then the one last focused', () => {
    const t = zmake(['region', 'fruit']);
    expect(t.items().map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
    t.items()[2]!.focus();
    expect(t.items().map((b) => b.tabIndex)).toEqual([-1, -1, 0, -1]);
  });

  it('follows the grouping changed elsewhere (the API), and shows no chip for an unknown or refused column', () => {
    const t = zmake(['region']);
    t.api().setBy(['fruit', 'nope', 'fruit']);
    expect(t.names()).toEqual(['Fruit', 'Stop grouping by Fruit']);
  });
});

describe.each([
  { dir: 'ltr', forward: 'ArrowRight', back: 'ArrowLeft', lang: 'en' },
  { dir: 'rtl', forward: 'ArrowLeft', back: 'ArrowRight', lang: 'ar' },
] as const)('keys (APG toolbar, group-drop-zone.md 9, 14; $dir)', ({ forward, back, lang }) => {
  it('forward and back go through every item, Home and End to the ends; the arrows never leave the band', () => {
    const t = zmake(['region', 'fruit'], { lang });
    const [a, , c, d] = t.items();
    a!.focus();
    t.key(a!, forward);
    expect(document.activeElement).toBe(t.items()[1]);
    t.key(document.activeElement as HTMLElement, 'End');
    expect(document.activeElement).toBe(d);
    t.key(d!, forward);
    expect(document.activeElement).toBe(d);
    t.key(d!, back);
    expect(document.activeElement).toBe(c);
    t.key(c!, 'Home');
    expect(document.activeElement).toBe(a);
  });

  it('Ctrl+Shift+forward moves a chip one place toward the end, said; the focus stays on it', () => {
    const t = zmake(['region', 'fruit'], { lang });
    const a = t.items()[0]!;
    a.focus();
    t.announce.mockClear();
    t.key(a, forward, { ctrlKey: true, shiftKey: true });
    expect(t.api().by()).toEqual(['fruit', 'region']);
    expect(t.shown()[0]).toBe('[apple]');
    expect((document.activeElement as HTMLElement).textContent).toBe('Region');
    expect(t.said()).toEqual([lang === 'en' ? 'Region: level 2 of 2' : 'Region: المستوى 2 من 2']);
    t.key(document.activeElement as HTMLElement, back, { ctrlKey: true, shiftKey: true });
    expect(t.api().by()).toEqual(['region', 'fruit']);
  });

  it('Delete or Backspace on a chip or its × removes it, said once; the focus at the same place', () => {
    const t = zmake(['region', 'fruit'], { lang });
    const x = t.items()[1]!;
    x.focus();
    t.announce.mockClear();
    t.key(x, 'Delete');
    expect(t.api().by()).toEqual(['fruit']);
    expect(t.said()).toEqual([lang === 'en' ? 'No longer grouped by Region' : 'لم يعد مجمّعًا حسب Region']);
    expect(document.activeElement).toBe(t.items()[1]);
    // With a modifier held, nothing (Ctrl+Backspace belongs to the page).
    t.key(t.items()[0]!, 'Backspace', { ctrlKey: true });
    expect(t.api().by()).toEqual(['fruit']);
    t.key(t.items()[0]!, 'Backspace');
    expect(t.api().by()).toEqual([]);
    // Emptied: back to the grid.
    expect(document.activeElement).toBe(t.vp);
  });
});

describe('pointer (group-drop-zone.md 10, 16)', () => {
  it('a click on × removes its column, said', () => {
    const t = zmake(['region', 'fruit']);
    click(t.items()[3]!);
    expect(t.api().by()).toEqual(['region']);
    expect(t.said().at(-1)).toBe('No longer grouped by Fruit');
  });

  /** Boxes: the band 0–600 × 0–40; chips of 100 px from x 10, 120 apart (logical, left to right). */
  const boxes = (t: ReturnType<typeof zmake>) => {
    const box = (l: number, w: number) => () => ({ left: l, right: l + w, top: 0, bottom: 40, width: w, height: 40, x: l, y: 0, toJSON: () => ({}) }) as DOMRect;
    t.zone().getBoundingClientRect = box(0, 600);
    [...t.zone().querySelectorAll<HTMLElement>('.dzg-gchip')].forEach((c, i) => (c.getBoundingClientRect = box(10 + i * 120, 100)));
  };
  const pt = (type: string, x: number, y = 20, extra: PointerEventInit = {}) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: 'mouse', ...extra });

  it('a chip dragged past another moves there on release, the gap marked meanwhile; one move, said', () => {
    const t = zmake(['region', 'fruit', 'day']);
    boxes(t);
    const first = t.zone().querySelector<HTMLElement>('.dzg-chip')!;
    first.dispatchEvent(pt('pointerdown', 50));
    t.zone().dispatchEvent(pt('pointermove', 200));
    // Past Fruit's middle (190), before Day's (310): the gap before Day.
    expect(t.zone().querySelector('[data-dzg-gap]')?.getAttribute('data-col')).toBe('day');
    expect(t.zone().querySelector('[data-dzg-gap]')?.getAttribute('data-dzg-gap')).toBe('before');
    t.zone().dispatchEvent(pt('pointerup', 200));
    expect(t.api().by()).toEqual(['fruit', 'region', 'day']);
    expect(t.said().at(-1)).toBe('Region: level 2 of 3');
    expect(t.zone().querySelector('[data-dzg-gap]')).toBeNull();
  });

  it('past the last chip: after it; released outside the band, by a finger, or under 4 px: nothing', () => {
    const t = zmake(['region', 'fruit']);
    boxes(t);
    const first = () => t.zone().querySelector<HTMLElement>('.dzg-chip')!;
    first().dispatchEvent(pt('pointerdown', 50));
    t.zone().dispatchEvent(pt('pointermove', 500));
    expect(t.zone().querySelector('[data-dzg-gap]')?.getAttribute('data-dzg-gap')).toBe('after');
    t.zone().dispatchEvent(pt('pointermove', 500, 200));
    expect(t.zone().querySelector('[data-dzg-gap]')).toBeNull();
    t.zone().dispatchEvent(pt('pointerup', 500, 200));
    expect(t.api().by()).toEqual(['region', 'fruit']);
    first().dispatchEvent(pt('pointerdown', 50, 20, { pointerType: 'touch' }));
    t.zone().dispatchEvent(pt('pointermove', 500, 20, { pointerType: 'touch' }));
    t.zone().dispatchEvent(pt('pointerup', 500, 20, { pointerType: 'touch' }));
    first().dispatchEvent(pt('pointerdown', 50));
    t.zone().dispatchEvent(pt('pointerup', 52));
    expect(t.api().by()).toEqual(['region', 'fruit']);
  });

  it('Escape during a chip drag cancels it', () => {
    const t = zmake(['region', 'fruit']);
    boxes(t);
    t.zone().querySelector<HTMLElement>('.dzg-chip')!.dispatchEvent(pt('pointerdown', 50));
    t.zone().dispatchEvent(pt('pointermove', 500));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    t.zone().dispatchEvent(pt('pointerup', 500));
    expect(t.api().by()).toEqual(['region', 'fruit']);
  });
});

describe('a header dropped on the band (group-drop-zone.md 15)', () => {
  it('registers the band with columns(): accepts a groupable column not grouped yet; a drop adds it last, said', () => {
    const t = zmake(['region']);
    expect(t.reg.length).toBe(1);
    const { el, t: target } = t.reg[0]!;
    expect(el).toBe(t.zone());
    expect(target.accept('fruit')).toBe(true);
    expect(target.accept('region')).toBe(false);
    expect(target.accept('nope')).toBe(false);
    target.drop('fruit');
    expect(t.api().by()).toEqual(['region', 'fruit']);
    expect(t.said().at(-1)).toBe('Grouped by Fruit');
  });

  it('a column marked `groupable: false` is refused', () => {
    const g = grouping({ by: [] });
    const reg: Target[] = [];
    const t = gmake({ grouping: null, columns: [{ id: 'name', header: 'Shop', width: 120 }, { id: 'fruit', header: 'Fruit', groupable: false, width: 100 }], features: [g, groupZone({ use: { grouping: g, columns: { api: () => ({ dropTargets: { add: (_el: Element, x: Target) => (reg.push(x), () => {}) } }) } } })] });
    expect(t.host.querySelector('.dzg-gzone')).not.toBeNull();
    expect(reg[0]!.accept('fruit')).toBe(false);
  });

  it('without columns(): no target, the band still shows the chips', () => {
    const t = zmake(['region'], { noColumns: true });
    expect(t.reg).toEqual([]);
    expect(t.names()).toEqual(['Region', 'Stop grouping by Region']);
  });

  it('destroyed: the band and its target go', () => {
    const t = zmake(['region']);
    t.g.destroy();
    expect(t.host.querySelector('.dzg-gzone')).toBeNull();
    expect(t.reg[0]!.removed).toBe(true);
  });

  it('needs its texts: a missing one throws at creation, naming it', () => {
    const g = grouping();
    const messages = { ...BUNDLES.en, text: { ...BUNDLES.en.text, 'zone.label': undefined } };
    // A text taken out (undefined) is no `MessageValue`: cast to test the check.
    expect(() => gmake({ grouping: null, settings: { messages } as never, features: [g, groupZone({ use: { grouping: g } })] })).toThrow(/groupZone: missing zone\.label/);
  });
});

describe('the column menu (column-menu.md « Grouping », WCAG 2.5.7)', () => {
  const menuMake = (by: string[]) => {
    const g = grouping({ by });
    const menu = columnMenu({ use: { grouping: g } });
    const messages = { ...BUNDLES.en, text: { ...BUNDLES.en.text, ...EN_COLUMN_MENU.text } };
    const t = gmake({ grouping: null, settings: { messages }, features: [g, menu] });
    const open = (col: string) => menu.api(t.g)!.open(col);
    const item = (id: string) => document.querySelector<HTMLElement>(`[role=menu] [data-id="${id}"]`);
    return { ...t, api: () => g.api(t.g)!, open, item };
  };

  it('« Group by this column » on a column not grouped: it groups, says it, the column stays shown', () => {
    const t = menuMake([]);
    t.open('fruit');
    expect(t.item('group.by')!.textContent).toContain('Group by this column');
    expect(t.item('group.off')).toBeNull();
    click(t.item('group.by')!);
    expect(t.api().by()).toEqual(['fruit']);
    expect(t.said()).toContain('Grouped by Fruit');
    expect(t.ctx.columns.visible().map((c) => c.id)).toContain('fruit');
  });

  it('« Stop grouping by this column » on a grouped one: the others kept, said', () => {
    const t = menuMake(['region', 'fruit']);
    t.open('region');
    expect(t.item('group.by')).toBeNull();
    click(t.item('group.off')!);
    expect(t.api().by()).toEqual(['fruit']);
    expect(t.said()).toContain('No longer grouped by Region');
  });

  it('none on a `groupable: false` column; none without `use.grouping`', () => {
    const g = grouping();
    const menu = columnMenu({ use: { grouping: g } });
    const messages = { ...BUNDLES.en, text: { ...BUNDLES.en.text, ...EN_COLUMN_MENU.text } };
    const t = gmake({ grouping: null, settings: { messages }, columns: [{ id: 'name', header: 'Shop', width: 120 }, { id: 'fruit', header: 'Fruit', groupable: false, width: 120 }], features: [g, menu] });
    menu.api(t.g)!.open('fruit');
    expect(document.querySelector('[role=menu] [data-id^="group."]')).toBeNull();
    menu.api(t.g)!.close();
    const plain = columnMenu();
    const u = gmake({ settings: { messages }, features: [plain] });
    plain.api(u.g)!.open('fruit');
    expect(document.querySelector('[role=menu] [data-id^="group."]')).toBeNull();
  });

  it('with use.grouping, its texts are needed: a missing one throws at creation', () => {
    const g = grouping();
    const messages = { ...BUNDLES.en, text: { ...BUNDLES.en.text, ...EN_COLUMN_MENU.text, 'menu.groupBy': undefined } };
    // A text taken out (undefined) is no `MessageValue`: cast to test the check.
    expect(() => gmake({ grouping: null, settings: { messages } as never, features: [g, columnMenu({ use: { grouping: g } })] })).toThrow(/column-menu: missing menu\.groupBy/);
  });

  it('the grouping listed after the menu: still found when the menu opens', () => {
    const g = grouping();
    const menu = columnMenu({ use: { grouping: g } });
    const messages = { ...BUNDLES.en, text: { ...BUNDLES.en.text, ...EN_COLUMN_MENU.text } };
    const t = gmake({ grouping: null, settings: { messages }, features: [menu, g] });
    menu.api(t.g)!.open('fruit');
    expect(document.querySelector('[role=menu] [data-id="group.by"]')).not.toBeNull();
    vi.restoreAllMocks();
  });
});
