// A host with a height but not the documented layout (virtual-scroll.md « A host without the layout »): 100 000 rows.
import type { GridEvent, Problem } from '@dzgrid/core';
import { createGrid } from '../../src/index.js';
import { EN } from '../../src/locales/en.js';

type R = { id: number; name: string; n: number; c: string };
const rows: R[] = Array.from({ length: 100_000 }, (_, i) => ({ id: i, name: `Item ${i}`, n: (i * 7919) % 100_003, c: `C${i % 97}` }));
const told: Problem[] = [];
const grid = createGrid<R>(document.getElementById('host')!, {
  rows, getRowId: (r) => String(r.id), messages: EN,
  columns: [{ id: 'name' }, { id: 'n', type: 'number' }, { id: 'c' }],
  onEvent: (e: GridEvent<R>) => { if (e.type === 'problems') told.push(...e.problems); },
});
Object.assign(window, { grid, told, ready: true });
