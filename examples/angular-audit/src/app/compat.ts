/**
 * What changes between Angular majors, in one file (the 19 smoke rewrites it: zoneless was
 * `provideExperimentalZonelessChangeDetection` there).
 */
import { provideZonelessChangeDetection, type EnvironmentProviders } from '@angular/core';
import type { BootstrapContext } from '@angular/platform-browser';

export type ServerContext = BootstrapContext;
export const zoneless = (): EnvironmentProviders => provideZonelessChangeDetection();
