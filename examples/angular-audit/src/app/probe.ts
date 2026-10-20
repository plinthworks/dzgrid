/**
 * What the checks read (scripts/example.mjs): on a server, the grid's controller after the render
 * (`kernel()` must be null); in the browser with `?probe=1`, the root's checks and the cell actions
 * (the zone demo). An application would not have this; it changes nothing the user sees.
 */
import { InjectionToken } from '@angular/core';

export interface AuditProbe {
  /** Root checks (ngDoCheck of the root component). */
  checks: number;
  /** `cellAction` events the host received, and whether the last arrived inside Angular's zone. */
  actions: number;
  inZone: boolean | null;
  kernel?: unknown;
  ready?: boolean;
  gridReady: boolean;
  problems: number;
}

export const newProbe = (): AuditProbe => ({ checks: 0, actions: 0, inZone: null, gridReady: false, problems: 0 });

/** Not provided in root: on a server it comes from the platform's providers (renderApplication's). */
export const AUDIT_PROBE = new InjectionToken<AuditProbe>('audit.probe');
