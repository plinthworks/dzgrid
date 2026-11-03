// Shared fixtures for `@dzgrid/dom/statusbar` (Phase 9, docs/behaviors/status-bar.md): the block feature's grid
// (`rmake`) with `statusBar()` and every text joined; the strip read back as the items' texts, in order.
import type { Problem } from '@dzgrid/core';
import { statusBar, type StatusBarFeature, type StatusBarOptions } from '../src/statusbar.js';
import { EN } from '../src/locales/en.js';
import { FR } from '../src/locales/fr.js';
import { AR } from '../src/locales/ar.js';
import { EN_RANGE } from '../src/locales/en-range.js';
import { FR_RANGE } from '../src/locales/fr-range.js';
import { AR_RANGE } from '../src/locales/ar-range.js';
import { EN_STATUS } from '../src/locales/en-status.js';
import { FR_STATUS } from '../src/locales/fr-status.js';
import { AR_STATUS } from '../src/locales/ar-status.js';
import { EN_PAGINATION } from '../src/locales/en-pagination.js';
import type { GridFeature } from '../src/features.js';
import type { RangeFeature } from '../src/range.js';
import { join, rmake, type RMake } from './support-range.js';

export { cleanup, R_, k, rowsOf, type R } from './support-range.js';

export const SMSG = {
  en: join(EN, EN_RANGE, EN_STATUS, EN_PAGINATION),
  fr: join(FR, FR_RANGE, FR_STATUS),
  ar: join(AR, AR_RANGE, AR_STATUS),
} as const;

export interface SMake extends Omit<RMake, 'features'> {
  readonly status?: StatusBarOptions;
  /** The features around the two (default: range, then the status bar). */
  readonly features?: (r: RangeFeature, s: StatusBarFeature) => readonly GridFeature[];
}

/** A grid with `range()` and `statusBar()`; synchronous paints unless `sync: false`. */
export function smake(o: SMake = {}) {
  const s = statusBar(o.status);
  const t = rmake({ ...o, messages: o.messages ?? SMSG[o.lang ?? 'en'], features: (r) => (o.features ? o.features(r, s) : [r, s]) });
  const strip = () => t.ctx.el.root.querySelector<HTMLElement>(':scope > .dzg-footer');
  const group = () => strip()?.querySelector<HTMLElement>('.dzg-status') ?? null;
  const host = (name: string) => group()?.querySelector<HTMLElement>(`:scope > [data-part="${name}"]`) ?? null;
  /** The items shown (not hidden), each its text, in order. */
  const shown = () => [...(group()?.querySelectorAll<HTMLElement>(':scope > [data-part]') ?? [])].filter((h) => h.textContent && !h.querySelector('[hidden]')).map((h) => h.textContent!);
  const problems = () => t.events.flatMap((e) => (e.type === 'problems' ? e.problems : [])) as Problem[];
  return { ...t, status: s, sapi: () => s.api(t.g)!, strip, group, host, shown, problems };
}
