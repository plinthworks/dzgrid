/** The screen's language: French, or Arabic right to left with `?lang=ar` (in the browser and on a server). */
import { DOCUMENT } from '@angular/common';
import { InjectionToken, inject } from '@angular/core';

export type AuditLang = 'fr' | 'ar';

export const langOf = (search: string): AuditLang => (new URLSearchParams(search).get('lang') === 'ar' ? 'ar' : 'fr');

export const AUDIT_LANG = new InjectionToken<AuditLang>('audit.lang', {
  providedIn: 'root',
  factory: () => langOf(inject(DOCUMENT).location?.search ?? ''),
});
