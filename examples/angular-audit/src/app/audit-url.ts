/**
 * The audit screen with its layout in the page's address (Phase 6 step 12, owner Q12-3; docs/behaviors/angular-example.md
 * « The address screen »): `?screen=audit-url`, this chunk loaded on demand (main.ts) and provided to the same audit
 * screen through `AUDIT_ADDRESS`, so the default screen's first load carries none of the state code. `gridState()`;
 * `[state]` from the address at creation (`fromSearchParams`: restored before the first request, one request);
 * `(stateChanged)` written back with `history.replaceState` (`toSearchParams`: one `grid=1.…` parameter; the language
 * and the screen kept; filters and the search left out, O6). On a server: the address read, nothing written (no grid).
 */
import { DOCUMENT } from '@angular/common';
import { inject, type Provider } from '@angular/core';
import { fromSearchParams, gridState, toSearchParams } from '@dzgrid/dom/state';
import { AUDIT_ADDRESS, type AuditAddress } from './lang';

export const addressProviders = (): Provider[] => [{
  provide: AUDIT_ADDRESS,
  useFactory: (): AuditAddress => {
    const doc = inject(DOCUMENT);
    const w = doc.defaultView;
    return {
      feature: gridState(),
      initial: fromSearchParams(new URLSearchParams(doc.location?.search ?? '')).state,
      keep(state) {
        const l = w?.location;
        if (!l) return;
        const q = new URLSearchParams(l.search);
        q.set('grid', toSearchParams(state).params.get('grid')!);
        w.history.replaceState(null, '', `${l.pathname}?${q}`);
      },
    };
  },
}];
