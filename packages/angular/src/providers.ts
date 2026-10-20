import { InjectionToken, type Provider } from '@angular/core';
import type { GridEnv, GridMessages, GridSettings, SlotPart } from '@dzgrid/dom';

/** What an application settles once for its grids; a binding on `<dz-grid>` wins. */
export type DzGridDefaults = Pick<GridSettings<unknown>, 'locale' | 'timeZone' | 'direction' | 'density' | 'numerals'>;

export interface DzGridConfig {
  /** The grid's words, for every `<dz-grid>` that binds none. */
  readonly messages?: GridMessages;
  /** Parts every grid of the application can name (over the features', under `[parts]` and templates). */
  readonly parts?: Readonly<Record<string, SlotPart>>;
  readonly defaults?: DzGridDefaults;
}

export const DZG_DEFAULTS = new InjectionToken<DzGridDefaults>('dzg.defaults', { providedIn: 'root', factory: () => ({}) });
export const DZG_PARTS = new InjectionToken<Readonly<Record<string, SlotPart>>>('dzg.parts', { providedIn: 'root', factory: () => ({}) });
export const DZG_MESSAGES = new InjectionToken<GridMessages | null>('dzg.messages', { providedIn: 'root', factory: () => null });
/** The grid's environment (`createGrid`'s third argument): tests give a geometry; applications leave it. */
export const DZG_ENV = new InjectionToken<GridEnv>('dzg.env', { providedIn: 'root', factory: () => ({}) });

/**
 * `providers: [provideDzGrid({ messages: FR, defaults: { timeZone: 'Africa/Algiers' } })]`, in
 * `bootstrapApplication` or a route. Import-safe on a server.
 */
export function provideDzGrid(c: DzGridConfig): Provider[] {
  return [
    { provide: DZG_DEFAULTS, useValue: c.defaults ?? {} },
    { provide: DZG_PARTS, useValue: c.parts ?? {} },
    { provide: DZG_MESSAGES, useValue: c.messages ?? null },
  ];
}
