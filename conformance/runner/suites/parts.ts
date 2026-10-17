import { partNameFor } from '@dzgrid/core';
import type { Suite } from './index.js';

export const parts: Record<string, Suite> = {
  'part-name': ({ slot, column, available }) => {
    const r = partNameFor(slot, column, new Set(available));
    return { name: r.name, problems: r.problems.map((p) => ({ code: p.code, severity: p.severity, path: p.path })) };
  },
};
