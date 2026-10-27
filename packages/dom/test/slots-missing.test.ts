// Header, overlay and tooltip parts without `slots()`: missing-feature (step 11 decisions).
import { describe, it, expect, afterEach } from 'vitest';
import type { GridEvent, Problem } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import { definePart } from '../src/part.js';
import { slots } from '../src/slots.js';
import * as entry from '../src/slots.js';
import { EN } from '../src/locales/en.js';

type R = { id: string };
let grids: GridInstance<R>[] = [];
afterEach(() => { for (const g of grids) g.destroy(); grids = []; document.body.innerHTML = ''; });

const parts = {
  myHeader: definePart('header', { mount: (host) => { host.append('H'); return {}; } }),
  overlay: definePart('overlay', { mount: (host) => { host.append('O'); return {}; } }),
  tip: definePart('tooltip', { mount: (host) => { host.append('T'); return {}; } }),
  badge: definePart('cell', { mount: (host) => { host.append('C'); return {}; } }),
};

function make(features: readonly ReturnType<typeof slots>[]) {
  const host = document.createElement('div');
  document.body.append(host);
  const events: GridEvent<R>[] = [];
  const g = createGrid<R>(host, { rows: [], getRowId: (r) => r.id, columns: [{ id: 'a', header: 'A', ui: { header: 'myHeader' } }], messages: EN, parts, features, onEvent: (e) => events.push(e) }, { sync: true });
  grids.push(g);
  const problems = (): Problem[] => events.flatMap((e) => (e.type === 'problems' ? e.problems : []));
  return { g, host, problems };
}

describe('slot parts without slots()', () => {
  it('are missing-feature, a warning each, told once; the grid draws its own', () => {
    const t = make([]);
    expect(t.problems().filter((p) => p.code === 'missing-feature')).toEqual([
      { code: 'missing-feature', severity: 'warning', path: 'parts.myHeader', detail: 'slots' },
      { code: 'missing-feature', severity: 'warning', path: 'parts.overlay', detail: 'slots' },
      { code: 'missing-feature', severity: 'warning', path: 'parts.tip', detail: 'slots' },
      // Feedback pass E: the column naming it is said too.
      { code: 'missing-feature', severity: 'warning', path: 'columns[0].ui.header', detail: 'slots' },
    ]);
    t.g.api.refresh();
    t.g.update({ density: 'compact' });
    expect(t.problems().filter((p) => p.code === 'missing-feature')).toHaveLength(4);
    expect(t.host.querySelector('.dzg-hlabel')!.textContent).toBe('A');
    expect(t.host.querySelector('.dzg-overlay')!.textContent).toBe(EN.text['grid.noRows']);
    // An unknown-part is not said for a slot nobody draws.
    expect(t.problems().filter((p) => p.code === 'unknown-part')).toEqual([]);
  });

  it('are not with slots(), which draws them', () => {
    const t = make([slots()]);
    expect(t.problems().filter((p) => p.code === 'missing-feature')).toEqual([]);
    expect(t.host.querySelector('.dzg-hlabel')!.textContent).toBe('H');
    expect(t.host.querySelector('.dzg-overlay')!.textContent).toBe('O');
  });

  it('the entry exports slots() alone, a feature named slots', () => {
    expect(Object.keys(entry)).toEqual(['slots']);
    expect(slots().id).toBe('slots');
  });
});
