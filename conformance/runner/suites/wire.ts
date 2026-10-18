import { createColumnModel, localeCtx, type ColumnDef } from '@dzgrid/core';
import { toWire } from '@dzgrid/core/server';
import { kindsOf } from '../kinds.js';
import type { Suite } from './index.js';

const run: Suite = (input: { locale: string; timeZone?: string; columns: ColumnDef<any>[]; filter: any; kinds?: string[] }) => {
  const ctx = localeCtx({ locale: input.locale, ...(input.timeZone && { timeZone: input.timeZone }) });
  const w = toWire(input.filter, { ctx, columns: createColumnModel<any>(input.columns), kinds: kindsOf(input.kinds ?? []) });
  // Through JSON: what the server receives.
  const filter = JSON.parse(JSON.stringify(w.filter));
  return w.problems.length ? { filter, problems: w.problems.map((p) => [p.code, p.path]) } : { filter };
};

export const wire: Record<string, Suite> = { wire: run };
