import { makeQuery } from '@dzgrid/core';
import type { GridContext } from '../context.js';
import type { FeatureHandle, GridFeature, SlotDrivers } from '../features.js';
import type { Part, SlotContext } from '../part.js';
import { mounted, type Mounted } from '../mounted.js';
import { resolver } from './resolve.js';

/**
 * `slots()`: a host's parts draw the column headers' labels, the overlay and the tooltip in
 * place of the grid's own (docs/behaviors/parts.md, step 11). The grid keeps the rest: the
 * header's role, sort state, mark, grip and click; the overlay's place and retry button; the
 * tooltip's element, timing, Escape and placement.
 *
 * ```ts
 * import { slots } from '@dzgrid/dom/slots';
 * createGrid(host, { parts: { header: definePart('header', myHeader) }, features: [slots()], … });
 * ```
 */
export function slots(): GridFeature {
  return { id: 'slots', setup };
}

function setup(g: GridContext<unknown>): FeatureHandle {
  const partFor = resolver(g);
  const heads = new Map<string, Mounted<SlotContext['header']>>();
  const overlay = mounted<SlotContext['overlay']>(g);
  const tip = mounted<SlotContext['tooltip']>(g);
  const send = (cmd: Parameters<typeof g.kernel.dispatch>[0]) => g.kernel.dispatch(cmd, 'user');
  // What the retry button does (render/overlay.ts).
  const retry = (): void => {
    send({ type: 'rows.refresh' });
    g.restoreFocus();
    g.live.announce(g.msg('announce.loading'));
  };
  // One command, so a server is asked once; the sort is kept.
  const clearFilters = (): void => void send({ type: 'query.set', query: makeQuery({ sort: g.kernel.query.sort }) });

  const drivers: SlotDrivers = {
    header(col, label) {
      const part = partFor('header', col) as Part<SlotContext['header']> | null;
      let m = heads.get(col.id);
      if (!m) {
        if (!part) return false;
        heads.set(col.id, (m = mounted(g)));
      }
      const sort = g.kernel.query.sort;
      const at = sort.findIndex((s) => s.column === col.id);
      return m.set(label, part, {
        column: col, label: col.def.header ?? col.id, sort: sort[at] ?? null, sortIndex: at < 0 ? null : at,
        toggleSort: (multi) => void send({ type: 'sort.toggle', column: col.id, multi }),
      });
    },
    overlay(state) {
      if (!state) {
        overlay.clear();
        return false;
      }
      const p = g.parts()['overlay'];
      return overlay.set(g.el.overlay, p?.slot === 'overlay' ? (p.part as Part<SlotContext['overlay']>) : null, {
        phase: state === 'noRows' ? 'empty' : state === 'noMatches' ? 'no-match' : state,
        // A server's failure, under the error overlay only (a host's overlay may have none).
        failure: state === 'error' ? (g.rows.status as { failure?: unknown }).failure ?? null : null,
        retry, clearFilters,
      });
    },
    tooltip(t) {
      // Mounted at show, destroyed at hide: a hidden tooltip keeps no row; another anchor mounts afresh.
      tip.clear();
      return !!t && tip.set(g.el.tooltip, partFor('tooltip', t.col) as Part<SlotContext['tooltip']> | null, { text: t.text, value: t.value, row: t.row, column: t.col });
    },
  };

  return {
    slots: drivers,
    // A header that left the column window (or the page) takes its part with it.
    afterRows() {
      for (const [id, m] of heads) {
        if (m.host && g.el.header.contains(m.host)) continue;
        m.clear();
        heads.delete(id);
      }
    },
    destroy() {
      for (const m of heads.values()) m.clear();
      heads.clear();
      overlay.clear();
      tip.clear();
    },
  };
}
