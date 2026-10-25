/**
 * The browser, zoneless (the default build). `?probe=1` exposes the checks' counters as `window.auditProbe`.
 * `?screen=stock`: the editable « stock » screen, loaded on demand (its own chunk: the audit screen's first load
 * carries none of the editing, owner S9-Q4).
 */
import { bootstrapApplication } from '@angular/platform-browser';
import { AuditScreen } from './app/audit.component';
import { zoneless } from './app/compat';
import { probeProviders } from './app/browser-probe';

const stock = new URLSearchParams(location.search).get('screen') === 'stock';
(stock ? import('./app/stock.component').then((m) => m.StockScreen) : Promise.resolve(AuditScreen))
  .then((root) => bootstrapApplication(root, { providers: [zoneless(), ...probeProviders()] }))
  .catch((e) => console.error(e));
