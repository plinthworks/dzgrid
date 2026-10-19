import { partNameFor, type Problem, type ResolvedColumn } from '@dzgrid/core';
import { emit } from '@dzgrid/core/internal';
import type { GridContext } from '../context.js';
import type { Part } from '../part.js';

export type ColumnSlot = 'header' | 'tooltip';

/**
 * The header and tooltip part of each column: its own name (`ui.header`, `ui.tooltip`), then
 * `<slot>.<type>`, then the bare name `header` or `tooltip`, then none (the grid's own). Names
 * are looked up among that slot's parts only; a name nobody registered is `unknown-part`, told
 * once per registry. Resolved again when the columns or the registry change.
 */
export function resolver(g: GridContext<unknown>): (slot: ColumnSlot, col: ResolvedColumn<unknown>) => Part<never> | null {
  let registry: unknown = null;
  let version = -1;
  let told = new Set<string>();
  const by = {} as Record<ColumnSlot, Map<string, Part<never> | null>>;
  return (slot, col) => {
    const reg = g.settings.parts;
    if (reg !== registry || g.columns.version !== version) {
      if (reg !== registry) told = new Set();
      registry = reg;
      version = g.columns.version;
      const problems: Problem[] = [];
      for (const s of ['header', 'tooltip'] as const) {
        const names = new Set(Object.keys(reg ?? {}).filter((n) => reg![n]!.slot === s));
        by[s] = new Map();
        for (const c of g.columns.visible()) {
          const r = partNameFor(s, { id: c.id, type: c.type, ...(c.def.ui && { ui: c.def.ui }) }, names);
          for (const p of r.problems) if (!told.has(p.path)) told.add(p.path), problems.push(p);
          const name = r.name ?? (names.has(s) ? s : null);
          by[s].set(c.id, name ? (reg![name]!.part as Part<never>) : null);
        }
      }
      if (problems.length) emit(g.kernel, { type: 'problems', source: 'host', problems });
    }
    return by[slot].get(col.id) ?? null;
  };
}
