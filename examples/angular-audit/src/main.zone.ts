/**
 * The same screens under zone.js (configuration `zone`): an older application's setup. The grid
 * runs outside Angular's zone, its outputs inside it (step 22). `?screen=stock`: the editable screen, on demand.
 */
import 'zone.js';
import { provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AuditScreen } from './app/audit.component';
import { probeProviders } from './app/browser-probe';

const stock = new URLSearchParams(location.search).get('screen') === 'stock';
(stock ? import('./app/stock.component').then((m) => m.StockScreen) : Promise.resolve(AuditScreen))
  .then((root) => bootstrapApplication(root, { providers: [provideZoneChangeDetection({ eventCoalescing: true }), ...probeProviders()] }))
  .catch((e) => console.error(e));
