// The base's motion seams (step 26; docs/behaviors/motion.md): `beforeRows` once per paint before
// the rows are placed, `settings.motion` live and its `data-motion="off"` on the root.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ColumnDef } from '@dzgrid/core';
import { createGrid, type GridInstance } from '../src/grid.js';
import type { Geometry, ViewportBox } from '../src/render/measure.js';
import type { GridSettings } from '../src/settings.js';
import type { GridFeature } from '../src/features.js';
import { UPDATE_POLICY } from '../src/update.js';
import { EN } from '../src/locales/en.js';

type R = { id: string; n: number };
let grids: GridInstance<R>[] = [];
afterEach(() => {
  for (const g of grids) g.destroy();
  grids = [];
  document.body.innerHTML = '';
});

function make(settings: Partial<GridSettings<R>> = {}) {
  const box: { -readonly [K in keyof ViewportBox]: ViewportBox[K] } = { block: 320, inline: 600, scrollTop: 0, scrollInline: 0 };
  const geometry: Geometry = { read: () => ({ ...box }), writeScrollTop: (px) => { box.scrollTop = px; }, writeScrollInline: (px) => { box.scrollInline = px; } };
  const host = document.createElement('div');
  document.body.append(host);
  const columns: ColumnDef<R, any>[] = [{ id: 'id' }, { id: 'n', type: 'number' }];
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, n: (i * 7) % 50 }));
  const g = createGrid<R>(host, { rows, getRowId: (r) => r.id, columns, messages: EN, ...settings }, { geometry, sync: true });
  grids.push(g);
  return { g, host, root: host.querySelector<HTMLElement>('.dzg')! };
}

describe('the beforeRows seam', () => {
  it('runs once per paint, before the rows are placed (it sees the old order), in sync mode', () => {
    const log: string[] = [];
    const firstKey = () => document.querySelector('.dzg-row[aria-rowindex="2"] [data-col="id"]')?.textContent ?? '-';
    const spy: GridFeature = {
      id: 'spy',
      setup: () => ({ beforeRows: () => log.push(`before:${firstKey()}`), afterRows: () => log.push(`after:${firstKey()}`), destroy() {} }),
    };
    const m = make({ features: [spy] });
    const paints = (m.g as unknown as { paints: number }).paints;
    expect(log.filter((l) => l.startsWith('before')).length).toBe(paints);
    log.length = 0;
    m.g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'desc' } as never] }, 'api');
    // One paint: before (the old first row r0), then after (the new one, n = 49: r7).
    expect(log).toEqual(['before:r0', 'after:r7']);
  });

  it('is optional: a grid without a feature paints as before', () => {
    const { g, host } = make();
    g.kernel.dispatch({ type: 'sort.set', sort: [{ column: 'n', dir: 'asc' } as never] }, 'api');
    expect(host.querySelector('.dzg-row[aria-rowindex="2"] [data-col="id"]')!.textContent).toBe('r0');
  });
});

describe('settings.motion', () => {
  it('is live', () => {
    expect(UPDATE_POLICY.motion).toBe('live');
  });

  it('sets data-motion="off" on the root when false, and removes it when back on (or unset)', () => {
    const { g, root } = make({ motion: false });
    expect(root.getAttribute('data-motion')).toBe('off');
    g.update({ motion: true });
    expect(root.hasAttribute('data-motion')).toBe(false);
    g.update({ motion: false });
    expect(root.getAttribute('data-motion')).toBe('off');
    g.update({ motion: undefined });
    expect(root.hasAttribute('data-motion')).toBe(false);
  });

  it('is absent by default', () => {
    expect(make().root.hasAttribute('data-motion')).toBe(false);
  });
});

describe('the size lines (owner, 2026-10-20, step 26, Q4; reset at the Phase 3 close, step 25)', () => {
  it('hold the budgets set at the close: dom 21 300, theme 2 300, the motion shell 700 and its run chunk 2 900 over it; gsap and the motion profile recorded; K.8 guard 83 500', () => {
    const b = (JSON.parse(readFileSync(`${process.cwd()}/size-budget.json`, 'utf8')) as { entries: Record<string, { file?: string; files?: string[]; maxGzip: number | null; external?: string[]; over?: string; without?: string[] }> }).entries;
    expect([b['@dzgrid/dom']!.maxGzip, b['@dzgrid/theme']!.maxGzip, b['@dzgrid/core']!.maxGzip]).toEqual([21300, 2300, 28000]);
    expect(b['@dzgrid/dom/motion-gsap']).toEqual({ file: 'packages/dom/src/motion-gsap.ts', maxGzip: 700, external: ['@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/dom/internal', './run/*'] });
    expect(b['@dzgrid/dom/motion-gsap: run (lazy)']).toEqual({ file: 'packages/dom/src/motion-gsap/run/index.ts', maxGzip: 2900, over: '@dzgrid/dom/motion-gsap', external: ['gsap', 'gsap/*', '@dzgrid/core', '@dzgrid/core/internal', '@dzgrid/dom/internal', './run/*'] });
    expect(b['gsap kit: core']).toMatchObject({ maxGzip: null, without: ['gsap', 'gsap/*'] });
    expect(b['profile: audit screen + motion']).toMatchObject({ file: 'perf/profiles/audit-motion.ts', maxGzip: null, split: true });
    expect(b['profile: audit screen (K.8)']!.maxGzip).toBe(83500); // owner Q3: the measure + 10 %; 85 000 guards example:bytes
  });
});
