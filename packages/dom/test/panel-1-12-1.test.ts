// 1.13.0 (docs/behaviors/presentation-settings.md 42–43; owner 2026-11-15): the columns panel's search one field — its
// text the placeholder and the accessible name, no text above it; the dock's head buttons with a tooltip equal to their
// name; a narrow header's title first (the filters' layout: the header cell a size container, the unsorted mark and an
// unfiltered filter button without room at rest under 6.5rem, back on hover and focus). Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import { dock } from '../src/dock.js';
import { columnsChooser } from '../src/columns-panel.js';
import { filters } from '../src/filters.js';
import { FILTERS_CSS } from '../src/filters/styles.js';
import { FR } from '../src/locales/fr.js';
import { FR_DOCK } from '../src/locales/fr-dock.js';
import { FR_COLUMNS } from '../src/locales/fr-columns.js';
import { FR_FILTERS } from '../src/locales/fr-filters.js';
import type { GridMessages } from '../src/messages.js';
import { cleanup, make } from './support-filters.js';
import { cmake } from './support-columns-panel.js';

afterEach(cleanup);

const MSG: GridMessages = { locale: 'fr', text: { ...FR.text, ...FR_DOCK.text, ...FR_COLUMNS.text, ...FR_FILTERS.text } };

describe('the search, one field (42)', () => {
  it('docked: the input named and hinted by « Rechercher une colonne », its wrapper without text', () => {
    const ch = columnsChooser();
    const t = make({ features: [filters(), ch, dock()], settings: { messages: MSG } });
    ch.api(t.g)!.open();
    const s = t.host.querySelector<HTMLInputElement>('.dzg-dock .dzg-cp input[type=search]')!;
    expect(s.getAttribute('aria-label')).toBe('Rechercher une colonne');
    expect(s.placeholder).toBe('Rechercher une colonne');
    const q = s.closest('.dzg-cp-q')!;
    expect(q.textContent).toBe('');
    expect(q.tagName).toBe('LABEL');
  });

  it('in the dialog too', () => {
    const t = cmake({ lang: 'fr' });
    t.api().open();
    const s = t.search()!;
    expect(s.getAttribute('aria-label')).toBe('Rechercher une colonne');
    expect(s.placeholder).toBe('Rechercher une colonne');
    expect(s.closest('.dzg-cp-q')!.textContent).toBe('');
  });
});

describe('the dock\'s head buttons (42)', () => {
  it('each with a tooltip equal to its accessible name, kept in step when the area collapses', () => {
    const ch = columnsChooser();
    const t = make({ features: [filters(), ch, dock()], settings: { messages: MSG } });
    ch.api(t.g)!.open();
    const area = t.host.querySelector<HTMLElement>('.dzg-dock[data-area=end]')!;
    const btns = () => [...area.querySelectorAll<HTMLButtonElement>('.dzg-dock-tog, .dzg-dock-place, .dzg-dock-x')];
    expect(btns().map((b) => b.title)).toEqual(btns().map((b) => b.getAttribute('aria-label')));
    expect(btns().every((b) => b.title.length > 0)).toBe(true);
    btns()[0]!.click();
    expect(area.hasAttribute('data-collapsed')).toBe(true);
    expect(btns()[0]!.title).toBe(btns()[0]!.getAttribute('aria-label'));
  });
});

describe('a narrow header keeps its title (43)', () => {
  it('a header with a filter button is a size container; under 6.5rem the unsorted mark gives way, and an unfiltered button at rest', () => {
    expect(FILTERS_CSS).toContain(':where(.dzg-hcell:has(>.dzg-fbtn)){justify-content:end;container-type:inline-size}');
    expect(FILTERS_CSS).toContain('@container (inline-size<6.5rem){:where(.dzg-hcell>.dzg-sort[data-dir=none]){position:absolute;opacity:0}:where(.dzg-hcell:not(:hover,:focus-within,[data-dzg-filtered])>.dzg-fbtn){inline-size:0;opacity:0}:where(.dzg-hcell:not(:hover,:focus-within,[data-dzg-filtered]))::after{display:none}}');
    // Never display: none nor visibility: hidden — still reached and named.
    expect(FILTERS_CSS).not.toMatch(/@container[^}]*(display:none|visibility)/);
  });
});
