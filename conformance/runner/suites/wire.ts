import { createColumnModel, localeCtx, type ColumnDef } from '@dzgrid/core';
import { toWire, type WireKind } from '@dzgrid/core/server';
import type { Suite } from './index.js';

/** Custom filter kinds a case may name in `kinds`: a fixture table, the same for every implementation. */
const KINDS: Record<string, WireKind> = {
  // A range on a number column; no wire function: the state travels as it is.
  between: {
    types: ['number'],
    read: (s) => (s !== null && typeof s === 'object' && !Array.isArray(s) && typeof (s as any).lo === 'number' && typeof (s as any).hi === 'number' ? s : 'invalid'),
    active: () => true,
  },
  throws: {
    read: (s) => s,
    active: () => true,
    wire: () => {
      throw new Error('the kind failed');
    },
  },
  'bad-json': { read: (s) => s, active: () => true, wire: () => Number.NaN },
};

const run: Suite = (input: { locale: string; timeZone?: string; columns: ColumnDef<any>[]; filter: any; kinds?: string[] }) => {
  const ctx = localeCtx({ locale: input.locale, ...(input.timeZone && { timeZone: input.timeZone }) });
  const named = new Set(input.kinds ?? []);
  const w = toWire(input.filter, {
    ctx,
    columns: createColumnModel<any>(input.columns),
    kinds: (name) => (named.has(name) ? KINDS[name] : undefined),
  });
  // Through JSON: what the server receives.
  const filter = JSON.parse(JSON.stringify(w.filter));
  return w.problems.length ? { filter, problems: w.problems.map((p) => [p.code, p.path]) } : { filter };
};

export const wire: Record<string, Suite> = { wire: run };
