// The header's `aria-keyshortcuts` built in one place (Phase 6 step 3, column-menu.md 5, step03-plan §1 seam a): each
// feature declares its list for a column header (`FeatureHandle.shortcuts`); the base joins them, drops duplicates,
// sorts them (one value whatever the features' order) and writes the attribute once, none when empty. The filter popup
// no longer writes it (before this step it set it alone and wiped any other). Expectations by hand.
import { describe, it, expect, afterEach } from 'vitest';
import type { GridFeature } from '../src/features.js';
import { cleanup, mmake, MCOLS } from './support-column-menu.js';

afterEach(cleanup);

const keys = (t: ReturnType<typeof mmake>, col: string) => t.hcell(col)!.getAttribute('aria-keyshortcuts');
/** A feature declaring `list` for every column header. */
const declares = (list: string): GridFeature => ({ id: `k${list}`, setup: () => ({ shortcuts: () => list, destroy() {} }) });

describe('the base joins the features\' shortcuts', () => {
  it('joined, deduplicated, sorted; none when every list is empty', () => {
    const t = mmake({ more: [declares('Shift+F10 Alt+R'), declares('Alt+R Control+X'), declares('')] });
    expect(keys(t, 's')).toBe('Alt+ArrowDown Alt+R Control+X Shift+F10');
    const u = mmake({ columns: MCOLS({ s: { menu: false } }), more: [declares(''), declares(' ')] });
    expect(u.hcell('s')!.hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('filters, columns and the menu: the same value in both orders; the filter\'s key no longer wipes the menu\'s', () => {
    for (const first of [false, true]) {
      const t = mmake({ with: ['filters', 'columns'], first, columns: MCOLS({ q: { filter: false } }) });
      // A column with a filter popup: the filter's Alt+ArrowDown, the resize mode's Alt+R and the moves (columns, step 6), the menu's Shift+F10.
      expect(keys(t, 'name'), String(first)).toBe('Alt+ArrowDown Alt+R Control+Shift+ArrowLeft Control+Shift+ArrowRight Shift+F10');
      // No popup: the menu takes Alt+ArrowDown (said once).
      expect(keys(t, 'q'), String(first)).toBe('Alt+ArrowDown Alt+R Control+Shift+ArrowLeft Control+Shift+ArrowRight Shift+F10');
      // A repaint changes nothing.
      t.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' }] }, 'api');
      expect(keys(t, 'name'), String(first)).toBe('Alt+ArrowDown Alt+R Control+Shift+ArrowLeft Control+Shift+ArrowRight Shift+F10');
      t.g.destroy();
    }
  });

  it('a Mac: the moves with Meta; the filters alone: Alt+ArrowDown only where a popup is', () => {
    const t = mmake({ mac: true, with: ['columns'] });
    expect(keys(t, 'n')).toBe('Alt+ArrowDown Alt+R Meta+Shift+ArrowLeft Meta+Shift+ArrowRight Shift+F10');
    t.g.destroy();
    const f = mmake({ with: ['filters'], columns: MCOLS({ q: { filter: false, menu: false } }), more: [] });
    expect(keys(f, 'name')).toBe('Alt+ArrowDown Shift+F10');
    // `menu: false` and no popup: nothing.
    expect(f.hcell('q')!.hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('the ⋮ gone under 96 px: the keys still declared (column-menu.md 2a)', () => {
    const t = mmake({ columns: MCOLS({ n: { width: 90 } }) });
    expect(t.btn('n')).toBeNull();
    expect(keys(t, 'n')).toBe('Alt+ArrowDown Shift+F10');
  });
});
