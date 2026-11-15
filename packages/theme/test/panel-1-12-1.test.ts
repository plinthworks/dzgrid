// @vitest-environment node
// 1.12.1, the columns panel's look and its dock frame (docs/behaviors/presentation-settings.md 42; owner 2026-11-15, « pas
// du tout stylé, c'est moche »): rows a grid whose first line takes the row (box and name on one line), a compact height
// and a hover tint from `--dzg-panel-*`; the search one field (a magnifier, an outline edge a reset cannot erase); the
// lock in the box's place; the footer's buttons on the grid's button variables; the dock's head a title and square
// buttons. Both copies of each sheet; no colour literal, no physical side. Expectations by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sheet, type Rule } from './css-tree.js';
import { checkScss } from '../../dom/test/guards.js';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (f: string) => readFileSync(here(`../${f}`), 'utf8');
const plain = (r: Rule) => r.at.length === 0;
const forced = (r: Rule) => r.at.some((a) => a.includes('forced-colors'));
const of = (f: string) => {
  const s = sheet(read(f));
  /** The declarations of the rules whose whole selector (or one of its comma parts) is `sel`. */
  return (sel: string, at: (r: Rule) => boolean = plain) => s.rules.filter((r) => (r.selector === sel || r.selector.split(/,\s*/).includes(sel)) && at(r)).map((r) => r.body).join(' ');
};

describe.each(['columns-panel.css', 'columns-panel.unlayered.css'])('%s (42)', (f) => {
  const d = of(f);
  it('the panel: its gap, line height and accent; the title from its variables', () => {
    expect(d('.dzg-cp')).toMatch(/gap: var\(--dzg-panel-gap, 0\.5rem\);/);
    expect(d('.dzg-cp')).toMatch(/line-height: 1\.25;/);
    expect(d('.dzg-cp')).toMatch(/accent-color: var\(--tz-accent\);/);
    expect(d('.dzg-cp-title')).toBe('font-size: var(--dzg-panel-title-font-size, 0.9375rem); font-weight: var(--dzg-panel-title-font-weight, 600);');
  });

  it('a row: its first line takes the row (1fr), the description under it; box and buttons over both; compact, tinted on hover', () => {
    const r = d('.dzg-cp-row');
    expect(r).toMatch(/display: grid; grid-template-columns: 1rem minmax\(0, 1fr\) repeat\(3, auto\); grid-template-rows: 1fr auto; align-items: center;/);
    expect(r).toMatch(/min-block-size: var\(--dzg-panel-row-height, 2rem\);/);
    expect(r).toMatch(/padding: 0\.125rem 0\.5rem;/);
    expect(d('.dzg-cp-row:hover')).toBe('background: var(--dzg-panel-hover-bg, var(--tz-bg-raised));');
    // The box placed in the first column over both lines (the lock's place too), the buttons auto-placed after the name.
    expect(d('.dzg-cp-row > input')).toMatch(/grid-area: 1\/1\/3;/);
    expect(d('.dzg-cp-row > button')).toBe('grid-row: span 2;');
    expect(d('.dzg-cp-desc')).toMatch(/grid-area: 2\/2;/);
    // The native box: 1rem, no margin (the browsers' own differ; a reset takes it).
    expect(d('.dzg-cp-row > input')).toMatch(/inline-size: 1rem; block-size: 1rem; margin: 0;/);
    expect(d('.dzg-cp-list[data-dzg-long] .dzg-cp-row')).toMatch(/contain-intrinsic-size: auto var\(--dzg-panel-row-height, 2rem\);/);
  });

  it('the search: one field, a magnifier at its start, its edge and ring an outline; the input bare inside', () => {
    const q = d('.dzg-cp-q');
    expect(q).toMatch(/display: flex; align-items: center;/);
    expect(q).toMatch(/block-size: 2rem;/);
    expect(q).toMatch(/outline: var\(--dzg-line, 1px\) solid var\(--dzg-input-border, var\(--tz-fg-muted\)\);/);
    expect(q).toMatch(/background: var\(--dzg-input-bg, var\(--tz-bg\)\);/);
    expect(q).not.toMatch(/border:/);
    const m = d('.dzg-cp-q::before');
    expect(m).toMatch(/content: "";/);
    expect(m).toMatch(/background: currentColor;/);
    expect(m).toMatch(/clip-path: path\(evenodd, /);
    expect(d('.dzg-cp-q:focus-within')).toBe('outline: 2px solid var(--dzg-focus-ring, var(--tz-accent)); outline-offset: -2px;');
    const i = d('.dzg-cp .dzg-cp-q input');
    expect(i).toMatch(/flex: 1;/);
    expect(i).toMatch(/border: 0;/);
    expect(i).toMatch(/outline: 0;/);
    expect(d('.dzg-cp-q input::placeholder')).toBe('color: var(--tz-fg-muted); opacity: 1;');
  });

  it('a box that cannot flip: a lock in its place (the row\'s ::before over the box\'s cell), the box kept, transparent', () => {
    const lock = d('.dzg-cp-row:has(> input[aria-disabled=true])::before');
    expect(lock).toMatch(/content: "";/);
    expect(lock).toMatch(/grid-area: 1\/1\/3;/);
    expect(lock).toMatch(/justify-self: center;/);
    expect(lock).toMatch(/background: currentColor;/);
    expect(lock).toMatch(/clip-path: path\(/);
    expect(d('.dzg-cp-row > input[aria-disabled=true]')).toMatch(/appearance: none;/);
    // Not before the name any more.
    expect(read(f)).not.toMatch(/\+ label::before/);
    expect(d('.dzg-cp-row:has(> input[aria-disabled=true])::before', forced)).toMatch(/background: CanvasText/);
  });

  it('the footer: a separator line, its buttons on the grid\'s button variables, their edge an outline', () => {
    expect(d('.dzg-cp-foot')).toMatch(/box-shadow: inset 0 var\(--dzg-line, 1px\) var\(--dzg-panel-border, var\(--tz-border\)\);/);
    const b = d('.dzg-cp-foot button');
    expect(b).toMatch(/min-block-size: var\(--dzg-button-height, 2rem\);/);
    // The side room as empty items, not a padding (a reset's `button { padding: 0 }`).
    expect(b).toMatch(/display: inline-flex; align-items: center;/);
    expect(b).toMatch(/padding: 0;/);
    expect(d('.dzg-cp-foot button::before')).toBe("content: \"\"; inline-size: var(--dzg-button-padding-inline, 0.75rem);");
    expect(b).toMatch(/outline: var\(--dzg-line, 1px\) solid var\(--dzg-button-border, var\(--tz-border\)\);/);
    expect(b).toMatch(/border-radius: var\(--dzg-button-radius, var\(--dzg-radius, 0\.375rem\)\);/);
    expect(b).toMatch(/color: var\(--dzg-button-fg, var\(--tz-fg\)\);/);
    expect(b).toMatch(/background: var\(--dzg-button-bg, var\(--tz-bg\)\);/);
    expect(b).toMatch(/font-weight: var\(--dzg-button-font-weight, inherit\);/);
    // Its display would show the docked « Close » the dock's layout hides: hidden again here.
    expect(d('.dzg-dock-box .dzg-cp-foot [data-act=close]')).toBe('display: none;');
    expect(d('.dzg-cp-foot button:hover')).toBe('color: var(--dzg-button-hover-fg, var(--tz-fg)); background: var(--dzg-button-hover-bg, var(--tz-bg-raised));');
    expect(d('.dzg-cp-foot button:active')).toMatch(/^background: var\(--dzg-button-active-bg, /);
  });

  it('no colour literal, no physical side', () => {
    expect(checkScss(read(f)).filter((x) => x.rule === 'physical')).toEqual([]);
  });
});

describe.each(['dock.css', 'dock.unlayered.css'])('%s (42)', (f) => {
  const d = of(f);
  it('the head: the panel\'s padding, a separator a reset cannot erase; the title from the panel\'s variables', () => {
    const h = d('.dzg-dock-head');
    expect(h).toMatch(/padding-inline: var\(--dzg-panel-padding, 0\.75rem\) 0\.375rem;/);
    expect(h).toMatch(/box-shadow: inset 0 calc\(-1 \* var\(--dzg-line, 1px\)\) var\(--dzg-panel-border, var\(--tz-border\)\);/);
    expect(d('.dzg-dock-title')).toBe('font-size: var(--dzg-panel-title-font-size, 0.9375rem); font-weight: var(--dzg-panel-title-font-weight, 600);');
  });

  it('the head\'s buttons but the tabs: 1.75rem squares, one glyph size; the ring on the dock\'s own parts', () => {
    expect(d('.dzg-dock-head button:not(.dzg-dock-tab)')).toBe('inline-size: 1.75rem; block-size: 1.75rem; padding: 0; font-size: 1.125rem; line-height: 1;');
    expect(d('.dzg-dock-head :focus-visible')).toMatch(/outline: 2px solid var\(--dzg-focus-ring, var\(--tz-accent\)\);/);
    expect(d('.dzg-dock :focus-visible')).toBe('');
  });

  it('the area\'s edge and the panel inside it from the panel\'s variables', () => {
    expect(d('.dzg-dock[data-area=end]')).toBe('border-inline-start: var(--dzg-line, 1px) solid var(--dzg-panel-border, var(--tz-border));');
    expect(d('.dzg-dock-box > .dzg-cp')).toMatch(/padding: var\(--dzg-panel-padding, 0\.75rem\);/);
  });
});
