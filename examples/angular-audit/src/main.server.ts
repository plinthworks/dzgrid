/**
 * The server: the same application for `renderApplication` (@angular/platform-server). The grid
 * renders nothing there (its host only, no kernel); no hydration is asked of the browser.
 * `renderApplication` and the probe's token are re-exported so the check (scripts/example.mjs
 * ssr) uses this bundle's own Angular.
 */
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering } from '@angular/platform-server';
import { AuditScreen } from './app/audit.component';
import { zoneless, type ServerContext } from './app/compat';

export default function bootstrap(context: ServerContext) {
  return bootstrapApplication(AuditScreen, { providers: [zoneless(), provideServerRendering()] }, context);
}

/** The « stock » screen on a server (`example:ssr --screen stock`): the same rule, no grid, no editor, no timer. */
export async function bootstrapStock(context: ServerContext) {
  const { StockScreen } = await import('./app/stock.component');
  return bootstrapApplication(StockScreen, { providers: [zoneless(), provideServerRendering()] }, context);
}

export { renderApplication } from '@angular/platform-server';
export { AUDIT_PROBE, newProbe } from './app/probe';
