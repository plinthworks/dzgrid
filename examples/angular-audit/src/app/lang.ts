/** The screen's language: French, or Arabic right to left with `?lang=ar` (in the browser and on a server). */
import { DOCUMENT } from '@angular/common';
import { InjectionToken, inject } from '@angular/core';
import type { GridState } from '@dzgrid/core/state';
import type { GridFeature } from '@dzgrid/dom';

export type AuditLang = 'fr' | 'ar';

export const langOf = (search: string): AuditLang => (new URLSearchParams(search).get('lang') === 'ar' ? 'ar' : 'fr');

export const AUDIT_LANG = new InjectionToken<AuditLang>('audit.lang', {
  providedIn: 'root',
  factory: () => langOf(inject(DOCUMENT).location?.search ?? ''),
});

/**
 * The layout kept in the address (Phase 6 step 12, owner Q12-3): provided only by the `?screen=audit-url` chunk
 * (audit-url.ts, loaded on demand); the audit screen reads it optionally, so its first load carries none of the
 * state code — only this token and two bindings.
 */
export interface AuditAddress {
  readonly feature: GridFeature;
  readonly initial: GridState | null;
  keep(state: GridState): void;
}
export const AUDIT_ADDRESS = new InjectionToken<AuditAddress>('audit.address');
