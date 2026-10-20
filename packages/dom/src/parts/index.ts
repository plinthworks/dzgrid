import type { PartsMessageKey } from '../part-texts.js';

export { badge } from './badge.js';
export type { BadgeOptions, Tone } from './badge.js';
export { cellBoolean } from './boolean.js';

/** The texts the parts need, in `locales/<lang>-parts` (step 20). */
export const PARTS_KEYS = ['cell.yes', 'cell.no'] as const satisfies readonly PartsMessageKey[];
