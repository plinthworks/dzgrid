/**
 * The browser, zoneless (the default build). `?probe=1` exposes the checks' counters as `window.auditProbe`.
 * `?screen=stock`: the editable « stock » screen, loaded on demand (its own chunk: the audit screen's first load
 * carries none of the editing, owner S9-Q4).
 */
import { bootstrapApplication } from '@angular/platform-browser';
import { AuditScreen } from './app/audit.component';
import { zoneless } from './app/compat';
import { probeProviders } from './app/browser-probe';

const screen = new URLSearchParams(location.search).get('screen');
// Phase 6 step 12 (owner Q12-3): `?screen=audit-url`, the audit screen with its layout in the address: the state code
// in its own chunk, given to the same screen as providers.
(screen === 'stock'
  ? import('./app/stock.component').then((m) => [m.StockScreen, []] as const)
  : screen === 'audit-url' ? import('./app/audit-url').then((m) => [AuditScreen, m.addressProviders()] as const) : Promise.resolve([AuditScreen, []] as const))
  .then(([root, more]) => bootstrapApplication(root, { providers: [zoneless(), ...probeProviders(), ...more] }))
  .catch((e) => console.error(e));
