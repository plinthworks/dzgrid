// Dragging a header out hides it, opt-in (1.14.0, owner 2026-11-18; docs/behaviors/column-move.md 22–28): 40 px or more
// outside the grid's box on any side is « out »; the ghost shows the hide state (`data-dzg-hide`, « B hidden »), the
// bar hidden; coming back gives them back; released out: one patch `hidden: true`, one columnsChanged (user), said;
// `hideable: false` and the last shown column never; pinned the same; a drop target wins; default off (rule 9 as before);
// the texts required only with the option. Six columns of 100 px in a 600 px view, the grid's box 0–600 × 0–(header+320):
// the points by hand.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, colmake, SIX, HEADER, join } from './support-columns.js';
import { gridState } from '../src/state.js';
import { EN } from '../src/locales/en.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { EN_COLUMNS } from '../src/locales/en-columns.js';

afterEach(cleanup);

const ON = { dragOutHides: true } as const;
const BOTTOM = HEADER + 320;

describe('out of the grid: the hide state (22, 23)', () => {
  it('39 px above the grid is not out (the bar may hide, no hide state); 40 px above is: the ghost says « B hidden », no bar', () => {
    const t = colmake({ columns: SIX(), cols: ON });
    t.drag('b', 250, { y: -39, noUp: true });
    expect(t.ghost()!.hasAttribute('data-dzg-hide')).toBe(false);
    t.move(t.pt(250, -40));
    t.tick();
    expect(t.ghost()!.hasAttribute('data-dzg-hide')).toBe(true);
    expect(t.ghost()!.textContent).toBe('⊘ B hidden');
    expect(t.bar()!.hidden).toBe(true);
    // Back inside: the plain ghost and the bar again.
    t.move(t.pt(250));
    t.tick();
    expect(t.ghost()!.hasAttribute('data-dzg-hide')).toBe(false);
    expect(t.ghost()!.textContent).toBe('B');
    expect(t.bar()!.hidden).toBe(false);
  });

  it('every side counts: below the last row, past the start edge, past the end edge (40 px)', () => {
    const t = colmake({ columns: SIX(), cols: ON });
    t.drag('b', 250, { y: BOTTOM + 40, noUp: true });
    expect(t.ghost()!.hasAttribute('data-dzg-hide')).toBe(true);
    t.move({ clientX: -40, clientY: HEADER / 2 });
    t.tick();
    expect(t.ghost()!.hasAttribute('data-dzg-hide')).toBe(true);
    t.move({ clientX: 639, clientY: HEADER / 2 });
    t.tick();
    expect(t.ghost()!.hasAttribute('data-dzg-hide')).toBe(false);
    t.move({ clientX: 640, clientY: HEADER / 2 });
    t.tick();
    expect(t.ghost()!.hasAttribute('data-dzg-hide')).toBe(true);
  });

  it('released out: hidden in one patch, one columnsChanged from the user, said « B hidden »; order and pin kept; no sort', () => {
    const t = colmake({ columns: SIX(), cols: ON });
    t.drag('b', 250, { y: -60 });
    expect(t.shown()).toEqual(['a', 'c', 'd', 'e', 'f']);
    expect(t.moved()).toHaveLength(1);
    expect((t.moved()[0] as { source?: string }).source).toBe('user');
    expect(t.g.kernel.columns.state().find((s) => s.id === 'b')).toMatchObject({ hidden: true });
    expect(t.said()).toEqual(['B hidden']);
    expect(t.sorted()).toHaveLength(0);
    expect(t.layer()).toBeNull();
    // Shown again (the chooser's tick): back in its old place.
    t.g.kernel.dispatch({ type: 'column.state', patch: [{ id: 'b', hidden: false }] }, 'api');
    expect(t.shown()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('released back inside after being out: a move as usual, nothing hidden', () => {
    const t = colmake({ columns: SIX(), cols: ON });
    t.drag('b', 250, { y: -60, noUp: true });
    t.move(t.pt(360));
    t.tick();
    t.up(t.pt(360));
    expect(t.shown()).toEqual(['a', 'c', 'd', 'b', 'e', 'f']);
  });

  it('Escape while out: cancelled and said, nothing hidden', () => {
    const t = colmake({ columns: SIX(), cols: ON });
    t.drag('b', 250, { y: -60, noUp: true });
    t.press('Escape', {}, document.body);
    t.up(t.pt(250, -60));
    expect(t.shown()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(t.said()).toEqual(['Move cancelled']);
  });

  it('pinned columns behave the same (start and end)', () => {
    const t = colmake({ columns: SIX({ a: { pinned: 'start' }, f: { pinned: 'end' } }), cols: ON });
    t.drag('a', 250, { y: -60 });
    t.drag('f', 250, { y: -60 });
    expect(t.shown()).toEqual(['b', 'c', 'd', 'e']);
    expect(t.said()).toEqual(['A hidden', 'F hidden']);
  });

  it('the hide state\'s ghost is placed in the window (fixed by the theme: the grid and its holders clip; found in Chrome)', () => {
    const w = vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000);
    const t = colmake({ columns: SIX(), cols: ON, lang: 'ar' });
    t.drag('b', 250, { noUp: true });
    // Inside: in the layer (600 px wide), from its start edge (the right).
    expect(t.ghost()!.style.getPropertyValue('inset-inline-start')).toBe('250px');
    t.move({ clientX: 640, clientY: 90 });
    t.tick();
    // Out: from the window's start edge (its right, 1000 px), 1000 − 640.
    expect(t.ghost()!.style.getPropertyValue('inset-inline-start')).toBe('360px');
    expect(t.ghost()!.style.getPropertyValue('inset-block-start')).toBe('90px');
    t.up({ clientX: 640, clientY: 90 });
    w.mockRestore();
  });

  it('right to left: the same box, the same 40 px (mirrored points), said in Arabic', () => {
    const t = colmake({ columns: SIX(), cols: ON, lang: 'ar' });
    t.drag('b', 250, { y: -40, noUp: true });
    expect(t.ghost()!.textContent).toBe('⊘ B مخفي');
    t.move({ clientX: 640, clientY: HEADER / 2 });
    t.tick();
    expect(t.ghost()!.hasAttribute('data-dzg-hide')).toBe(true);
    t.up({ clientX: 640, clientY: HEADER / 2 });
    expect(t.shown()).toEqual(['a', 'c', 'd', 'e', 'f']);
    expect(t.said()).toEqual(['B مخفي']);
  });
});

describe('never hidden by dragging out (24, 27, 10)', () => {
  it('hideable: false: no hide state, released out cancels quietly', () => {
    const t = colmake({ columns: SIX({ b: { hideable: false } }), cols: ON });
    t.drag('b', 250, { y: -60, noUp: true });
    expect(t.ghost()!.hasAttribute('data-dzg-hide')).toBe(false);
    expect(t.ghost()!.textContent).toBe('B');
    expect(t.bar()!.hidden).toBe(true);
    t.up(t.pt(250, -60));
    expect(t.shown()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(t.moved()).toHaveLength(0);
    expect(t.said()).toEqual([]);
  });

  it('the next drag after one that hid starts plain (found in Chrome: the ghost is reused)', () => {
    const t = colmake({ columns: SIX({ c: { hideable: false } }), cols: ON });
    t.drag('b', 250, { y: -60 });
    t.drag('c', 250, { y: -60, noUp: true });
    expect(t.ghost()!.hasAttribute('data-dzg-hide')).toBe(false);
    expect(t.ghost()!.textContent).toBe('C');
    t.up(t.pt(250, -60));
    expect(t.shown()).toEqual(['a', 'c', 'd', 'e', 'f']);
  });

  it('the last shown column: never', () => {
    const t = colmake({ columns: SIX({ a: { hidden: true }, b: { hidden: true }, c: { hidden: true }, d: { hidden: true }, e: { hidden: true } }), cols: ON });
    t.drag('f', 250, { y: -60, noUp: true });
    expect(t.ghost()!.hasAttribute('data-dzg-hide')).toBe(false);
    t.up(t.pt(250, -60));
    expect(t.shown()).toEqual(['f']);
    expect(t.moved()).toHaveLength(0);
  });

  it('default (no option): rule 9 as before — no hide state, the word not shown, nothing hidden', () => {
    const t = colmake({ columns: SIX() });
    t.drag('b', 250, { y: -60, noUp: true });
    expect(t.ghost()!.hasAttribute('data-dzg-hide')).toBe(false);
    expect(t.ghost()!.textContent).toBe('B');
    t.up(t.pt(250, -60));
    expect(t.shown()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('a drop target that takes the column wins over « out »', () => {
    const t = colmake({ columns: SIX(), cols: ON });
    const zone = document.body.appendChild(document.createElement('div'));
    zone.getBoundingClientRect = () => ({ left: 0, right: 600, top: -100, bottom: -50, width: 600, height: 50, x: 0, y: -100, toJSON: () => ({}) }) as DOMRect;
    const got: string[] = [];
    t.api().dropTargets.add(zone, { accept: () => true, drop: (c) => void got.push(c) });
    t.drag('b', 250, { y: -60, noUp: true });
    expect(t.ghost()!.hasAttribute('data-dzg-hide')).toBe(false);
    t.up(t.pt(250, -60));
    expect(got).toEqual(['b']);
    expect(t.shown()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    zone.remove();
  });

  it('a finger or a pen: nothing dragged, nothing hidden (Q-M3)', () => {
    const t = colmake({ columns: SIX(), cols: ON });
    t.drag('b', 250, { y: -60, init: { pointerType: 'touch' }, noClick: true });
    t.drag('b', 250, { y: -60, init: { pointerType: 'pen' }, noClick: true });
    expect(t.shown()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});

describe('the state and the texts (25, « Texts »)', () => {
  it('gridState saves the hidden column', () => {
    const st = gridState();
    const t = colmake({ columns: SIX(), cols: ON, more: [st] });
    t.drag('c', 250, { y: -60 });
    const s = st.api(t.g)!.state();
    expect(s.columns?.find((c) => c.id === 'c')).toMatchObject({ hidden: true });
  });

  it('the words are the chooser\'s « {column} hidden » (no new key); required only with the option', () => {
    const { 'chooser.hidden': _h, ...old } = EN_COLUMNS.text;
    const msgs = join(EN, EN_RANGE, { locale: 'en', text: old } as never); // a bundle without the chooser's sentence
    expect(() => colmake({ columns: SIX(), messages: msgs, cols: ON })).toThrow(/chooser\.hidden/);
  });

  it('without the option, a bundle without it is fine', () => {
    const { 'chooser.hidden': _h, ...old } = EN_COLUMNS.text;
    expect(() => colmake({ columns: SIX(), messages: join(EN, EN_RANGE, { locale: 'en', text: old } as never) })).not.toThrow(); // a bundle without the chooser's sentence
  });

  it('said in French « B masquée »', () => {
    const t = colmake({ columns: SIX(), cols: ON, lang: 'fr' });
    t.drag('b', 250, { y: -60 });
    expect(t.said()).toEqual(['B masquée']);
  });
});
