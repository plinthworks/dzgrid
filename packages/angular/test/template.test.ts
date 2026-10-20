import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DZGRID_ANGULAR_VERSION, DzGrid, DzgPart } from '@dzgrid/angular';

/**
 * The toolchain compiles ahead of time: a binding that silently failed to compile would leave
 * the element empty, which plain tsc never notices. The rendering itself is tested in every
 * other file of this folder (step 22 replaced the probe component with the real one).
 */
describe('the Angular toolchain', () => {
  it('compiled the grid and the template directive ahead of time, not left to the JIT compiler', () => {
    // setup.ts loads @angular/compiler, so a missing plugin would still render through JIT and
    // hide the fault. AOT output defines the component as a plain static field; JIT behind a getter.
    for (const [type, key] of [[DzGrid, 'ɵcmp'], [DzgPart, 'ɵdir']] as const) {
      const own = Object.getOwnPropertyDescriptor(type, key);
      expect(own && 'value' in own, key).toBe(true);
    }
  });

  it('exposes the version written in its package.json', () => {
    const manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'));
    expect(DZGRID_ANGULAR_VERSION).toBe(manifest.version);
  });
});
