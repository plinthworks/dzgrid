/**
 * The same screen under zone.js (configuration `zone`): an older application's setup. The grid
 * runs outside Angular's zone, its outputs inside it (step 22).
 */
import 'zone.js';
import { provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { AuditScreen } from './app/audit.component';
import { probeProviders } from './app/browser-probe';

bootstrapApplication(AuditScreen, { providers: [provideZoneChangeDetection({ eventCoalescing: true }), ...probeProviders()] }).catch((e) => console.error(e));
