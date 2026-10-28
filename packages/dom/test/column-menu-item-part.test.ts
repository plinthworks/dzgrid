// A content part per item of the column ⋮ menu (Phase 6 step 12, owner Q12-2; docs/behaviors/column-menu.md « Item
// content »): `MenuItem.part` names a part of slot `menuItem` in the grid's registry. The part paints the item's
// content inside the menuitem; the grid keeps the item (its role, `aria-checked`, `aria-disabled`, the roving focus,
// the keys, the type-ahead), and its name stays the item's text (`aria-label`); the part's host is `inert` and
// `aria-hidden` (no control of the part's takes the focus, nothing of it joins the name). A part that throws, an
// unknown name or another slot's part: the plain text, the grid's (unknown name: `unknown-part`). One mount per drawn
// item, destroyed when the menu redraws or closes. Expectations by hand; written before the code.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { definePart, type SlotContext } from '../src/part.js';
import type { MenuEntry } from '../src/column-menu.js';
import { cleanup, mmake } from './support-column-menu.js';

afterEach(cleanup);

type MC = SlotContext['menuItem'];
const seen: MC[] = [];
const life = { mounts: 0, updates: 0, destroys: 0 };
const reset = () => ((seen.length = 0), (life.mounts = life.updates = life.destroys = 0));
/** A swatch and the label in bold, plus a button (it must never take the focus: the host is inert). */
const swatch = definePart('menuItem', {
  mount(host, c) {
    life.mounts++;
    seen.push(c);
    const doc = host.ownerDocument;
    const dot = doc.createElement('i');
    dot.className = 'sw';
    const b = doc.createElement('b');
    b.textContent = c.label;
    const btn = doc.createElement('button');
    btn.textContent = 'x';
    host.append(dot, b, btn);
    return {
      update: (n) => void (life.updates++, seen.push(n), (b.textContent = n.label)),
      destroy: () => void life.destroys++,
    };
  },
});
const boom = definePart('menuItem', { mount() { throw new Error('boom'); } });
const cellPart = definePart('cell', { mount: () => ({}) });

/** The app's two items after the defaults: « Colour red » with the swatch, « Keep » (keepOpen, checkable) with it too. */
const withItems = (part = 'swatch') => ({
  items: (_c: unknown, d: readonly MenuEntry[]): MenuEntry[] => [
    ...d,
    { separator: true },
    { id: 'red', label: 'Colour red', part, action: () => {} },
    { id: 'keep', label: 'Keep open', kind: 'check' as const, checked: true, keepOpen: true, part, action: () => {} },
  ],
});
const open = (t: ReturnType<typeof mmake>, col = 'name') => {
  t.focusHeader(col);
  t.key('F10', { shiftKey: true });
};

describe('an item drawn by its part', () => {
  it('the part paints inside the menuitem; the host is inert and aria-hidden; the item is named by its text', () => {
    reset();
    const t = mmake({ menu: withItems(), settings: { parts: { swatch } } });
    open(t);
    const x = t.item('red')!;
    const host = x.querySelector<HTMLElement>(':scope > .dzg-mpart')!;
    expect(host).not.toBeNull();
    expect(host.hasAttribute('inert')).toBe(true);
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.sw')).not.toBeNull();
    expect(host.querySelector('b')!.textContent).toBe('Colour red');
    expect(x.getAttribute('aria-label')).toBe('Colour red');
    expect(x.getAttribute('role')).toBe('menuitem');
    // The text is drawn once: by the part (the grid's own text node is not added beside it).
    expect([...x.childNodes].filter((n) => n.nodeType === 3)).toEqual([]);
    // Items without a part keep their plain text and no aria-label.
    expect(t.item('hide')!.hasAttribute('aria-label')).toBe(false);
    expect(t.item('hide')!.textContent).toBe('Hide column');
  });

  it('its context: the item (id, label, kind, checked, disabled), the column, and what every part gets', () => {
    reset();
    const t = mmake({ menu: withItems(), settings: { parts: { swatch } } });
    open(t, 'n');
    const red = seen.find((c) => c.id === 'red')!;
    expect([red.label, red.kind, red.checked, red.disabled, red.column.id]).toEqual(['Colour red', 'item', false, false, 'n']);
    const keep = seen.find((c) => c.id === 'keep')!;
    expect([keep.kind, keep.checked]).toEqual(['check', true]);
    expect(t.item('keep')!.getAttribute('role')).toBe('menuitemcheckbox');
    expect(t.item('keep')!.getAttribute('aria-checked')).toBe('true');
    expect(red.dir).toBe('ltr');
    expect(typeof red.msg).toBe('function');
  });

  it('the roving focus and the keys are the grid\'s: the part\'s button never takes the focus; the type-ahead reads the label', () => {
    reset();
    const t = mmake({ menu: withItems(), settings: { parts: { swatch } } });
    open(t);
    t.key('End');
    expect(t.focused()).toBe('keep');
    t.key('ArrowUp');
    expect(t.focused()).toBe('red');
    t.key('Home');
    t.key('c');
    expect(t.focused()).toBe('red');
    // Every focusable thing in the menu is a menuitem: the part's button sits in an inert host.
    const btn = t.item('red')!.querySelector('button')!;
    expect(btn.closest('[inert]')).not.toBeNull();
  });

  it('one mount per drawn item; a redraw (an item that keeps the menu open) destroys and mounts again; closing destroys them all', () => {
    reset();
    const t = mmake({ menu: withItems(), settings: { parts: { swatch } } });
    open(t);
    expect([life.mounts, life.destroys]).toEqual([2, 0]);
    t.item('keep')!.click();
    expect(t.list()).not.toBeNull();
    expect([life.mounts, life.destroys]).toEqual([4, 2]);
    t.key('Escape');
    expect(t.list()).toBeNull();
    expect([life.mounts, life.destroys]).toEqual([4, 4]);
  });

  it('a part that throws: reported, the item shows its text as without a part', () => {
    reset();
    const t = mmake({ menu: withItems('boom'), settings: { parts: { boom } } });
    const report = vi.fn();
    t.ctx.report = report;
    open(t);
    const x = t.item('red')!;
    expect(x.textContent).toBe('Colour red');
    expect(x.hasAttribute('aria-label')).toBe(false);
    expect(report).toHaveBeenCalledTimes(2);
    expect(String(report.mock.calls[0]![0])).toContain('boom');
  });

  it('an unknown name, or a part of another slot: the plain text; the unknown name told (`unknown-part`)', () => {
    reset();
    const t = mmake({ menu: withItems('nope'), settings: { parts: { swatch } } });
    open(t);
    expect(t.item('red')!.textContent).toBe('Colour red');
    const told = t.of('problems').flatMap((e) => (e as unknown as { problems: { code: string; path: string; detail?: string }[] }).problems);
    expect(told).toContainEqual({ code: 'unknown-part', severity: 'error', path: 'menu.red.part', detail: 'nope' });
    cleanup();
    const u = mmake({ menu: withItems('cellPart'), settings: { parts: { cellPart } } });
    open(u);
    expect(u.item('red')!.textContent).toBe('Colour red');
    expect(u.item('red')!.querySelector('.dzg-mpart')).toBeNull();
  });
});
