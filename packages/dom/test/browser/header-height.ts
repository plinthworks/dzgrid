// `headerHeight` in Chrome (scripts/browser-header-height.mjs; density.md « Header height »): a 70 px header over 40 px
// rows, a pinned top row; `?mode=groups` with column groups. Made-up rows: a seed library's packets.
import type { ColumnOrGroup, GridEvent, Problem } from '@dzgrid/core';
import { createGrid, type GridMessages } from '../../src/index.js';
import { pinnedRows } from '../../src/pinned-rows.js';
import { spans } from '../../src/spans.js';
import { FR } from '../../src/locales/fr.js';
import { FR_PINNED } from '../../src/locales/fr-pinned.js';

const groups = new URLSearchParams(location.search).get('mode') === 'groups';
type P = { id: string; seed: string; grams: number; jan: number; feb: number };
const rows: P[] = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, seed: `Graine ${i}`, grams: i % 9, jan: i % 4, feb: (i * 3) % 5 }));
const leaves = { seed: { id: 'seed', header: 'Graine', width: 220 }, grams: { id: 'grams', header: 'Grammes', type: 'number', width: 110 }, jan: { id: 'jan', header: 'Janvier', type: 'number', width: 100 }, feb: { id: 'feb', header: 'Février', type: 'number', width: 100 } } as const;
const columns: ColumnOrGroup<P>[] = groups
  ? [leaves.seed, { id: 'stock', header: 'Stock', children: [leaves.grams] }, { id: 'months', header: 'Semis', children: [leaves.jan, leaves.feb] }]
  : [leaves.seed, leaves.grams, leaves.jan, leaves.feb];
const messages: GridMessages = { ...FR, text: { ...FR.text, ...FR_PINNED.text } };
const told: Problem[] = [];
document.documentElement.lang = 'fr';
const grid = createGrid<P>(document.getElementById('host')!, {
  rows, getRowId: (p) => p.id, columns, messages, locale: 'fr-FR', timeZone: 'UTC', rowHeight: 40, headerHeight: 70,
  features: [pinnedRows<P>({ top: [{ id: 'ref', seed: 'Référence', grams: 10, jan: 1, feb: 1 }] }), ...(groups ? [spans()] : [])],
  onEvent: (e: GridEvent<P>) => { if (e.type === 'problems') told.push(...e.problems); },
});
Object.assign(window, { grid, told, ready: true });
