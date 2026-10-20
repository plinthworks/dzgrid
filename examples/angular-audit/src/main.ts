/** The browser, zoneless (the default build). `?probe=1` exposes the checks' counters as `window.auditProbe`. */
import { bootstrapApplication } from '@angular/platform-browser';
import { AuditScreen } from './app/audit.component';
import { zoneless } from './app/compat';
import { probeProviders } from './app/browser-probe';

bootstrapApplication(AuditScreen, { providers: [zoneless(), ...probeProviders()] }).catch((e) => console.error(e));
