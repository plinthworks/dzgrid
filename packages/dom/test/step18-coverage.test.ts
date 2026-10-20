// Coverage additions for step 18 (test analysis): each test kills a mutant the suite let through.
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { GridContext } from '../src/context.js';
import { filters } from '../src/filters.js';
import { PopupHost } from '../src/popup.js';
import { Scope } from '../src/render/scope.js';
import { cleanup, make } from './support-filters.js';

afterEach(cleanup);

const down = (el: Element) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, cancelable: true }));
const header = (t: ReturnType<typeof make>, col: string) => t.host.querySelector<HTMLElement>(`.dzg-hcell[role=columnheader][data-col="${col}"]`)!;
const button = (t: ReturnType<typeof make>, col: string) => header(t, col).querySelector<HTMLButtonElement>(':scope > .dzg-fbtn')!;
const popup = (t: ReturnType<typeof make>) => t.host.querySelector<HTMLElement>('.dzg-popup');

describe('a pointer down outside, as a browser runs it (step 18, Q4)', () => {
  it('the press blurs to the body after the pointer down (its default action): the focus still ends on the anchor', () => {
    // Kills: closing on an outside press puts the focus back at once (the browser's default
    // action then takes it away again, and the focus is lost).
    vi.useFakeTimers();
    const t = make({ features: [filters()] });
    // What a browser does after a pointer down on something that cannot take the focus.
    const blurAfter = () => (document.activeElement as HTMLElement | null)?.blur();
    document.addEventListener('pointerdown', blurAfter);
    try {
      button(t, 'n').click();
      expect(popup(t)!.contains(document.activeElement)).toBe(true);
      down(document.body);
      expect(popup(t)).toBeNull();
      vi.advanceTimersByTime(0);
      expect(document.activeElement).toBe(button(t, 'n'));
    } finally {
      document.removeEventListener('pointerdown', blurAfter);
    }
  });

  it('a press on a page widget that stops the event still closes it (heard before the page, at capture)', () => {
    // Kills: the outside listener in the bubble phase.
    vi.useFakeTimers();
    const t = make({ features: [filters()] });
    const widget = document.createElement('div');
    widget.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.append(widget);
    button(t, 'n').click();
    expect(popup(t)).not.toBeNull();
    down(widget);
    expect(popup(t)).toBeNull();
  });
});

describe('the sort sentence on a server, superseded (step 18, I3)', () => {
  it('a filter changed before the sort\'s answer: only the filter is said, the sort never', () => {
    // Kills: a user's model change while loading does not take the sort over (then the sort is
    // said too, with the filter's answer: two sentences for one answer).
    const t = make({ server: true });
    t.f.answer(['a', 'b', 'c'], { total: 3 });
    const announce = vi.spyOn((t.g as unknown as { context: GridContext<unknown> }).context.live, 'announce');
    header(t, 'name').querySelector<HTMLElement>('.dzg-hlabel')!.click();
    expect(t.g.kernel.query.sort).toEqual([{ column: 'name', dir: 'asc' }]);
    expect(announce).not.toHaveBeenCalled();
    t.g.kernel.dispatch({ type: 'filter.column', column: 'name', filter: { type: 'text', op: 'contains', value: 'a' } }, 'user');
    t.f.answer(['a'], { total: 1 });
    const said = announce.mock.calls.map((c) => c[0]);
    expect(said.some((s) => s.startsWith('Sorted by'))).toBe(false);
    expect(said).toEqual(['Filtered. 1 row']);
  });
});

describe('the popup host: the anchor it moved to (step 18, Q4)', () => {
  it('a press on the anchor it moved to leaves it open; a press on the anchor it left closes it', () => {
    // Kills: the outside test reading the first anchor, not the current one.
    const root = document.createElement('div');
    const first = document.createElement('button');
    const next = document.createElement('button');
    document.body.append(root, first, next);
    const scope = new Scope();
    const host = new PopupHost(document, root, scope, () => 'ltr');
    const c = document.createElement('div');
    c.append(document.createElement('input'));
    const ref = host.open(first, c, { placement: 'block-end', modal: true });
    ref.move(next);
    down(next);
    expect(ref.open).toBe(true);
    down(first);
    expect(ref.open).toBe(false);
    scope.dispose();
  });

  it('with an opener: a press on it is left to its click; one elsewhere on the anchor closes it', () => {
    // Kills: the outside test still sparing the whole anchor when an opener is given.
    const root = document.createElement('div');
    const cell = document.createElement('div');
    const btn = document.createElement('button');
    const label = document.createElement('span');
    cell.append(label, btn);
    document.body.append(root, cell);
    const scope = new Scope();
    const host = new PopupHost(document, root, scope, () => 'ltr');
    const ref = host.open(cell, document.createElement('div'), { placement: 'block-end', opener: (a) => a.querySelector('button') });
    down(btn);
    expect(ref.open).toBe(true);
    down(label);
    expect(ref.open).toBe(false);
    scope.dispose();
  });
});
