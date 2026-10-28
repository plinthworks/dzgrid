/**
 * The same screens under zone.js (configuration `zone`): an older application's setup. The grid
 * runs outside Angular's zone, its outputs inside it (step 22). `?screen=stock`: the editable screen, on demand.
 */
import 'zone.js';
import { provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AuditScreen } from './app/audit.component';
import { probeProviders } from './app/browser-probe';

const screen = new URLSearchParams(location.search).get('screen');
// Phase 6 step 12 (owner Q12-3): `?screen=audit-url`, the audit screen with its layout in the address: the state code
// in its own chunk, given to the same screen as providers.
(screen === 'stock'
  ? import('./app/stock.component').then((m) => [m.StockScreen, []] as const)
  : screen === 'audit-url' ? import('./app/audit-url').then((m) => [AuditScreen, m.addressProviders()] as const) : Promise.resolve([AuditScreen, []] as const))
  .then(([root, more]) => bootstrapApplication(root, { providers: [provideZoneChangeDetection({ eventCoalescing: true }), ...probeProviders(), ...more] }))
  .catch((e) => console.error(e));
