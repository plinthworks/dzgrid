/** `?probe=1`: the probe of probe.ts, provided and exposed as `window.auditProbe` for scripts/example.mjs. */
import type { Provider } from '@angular/core';
import { AUDIT_PROBE, newProbe } from './probe';

export function probeProviders(): Provider[] {
  if (new URLSearchParams(location.search).get('probe') !== '1') return [];
  const probe = newProbe();
  (window as unknown as { auditProbe: unknown }).auditProbe = probe;
  return [{ provide: AUDIT_PROBE, useValue: probe }];
}
