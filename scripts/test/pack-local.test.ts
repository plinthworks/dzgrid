// Local packs (app-feedback 15): every `npm run pack:local` carries a version of its own, so an application's lockfile
// takes the new bytes (same version, same `file:` path: npm kept the old integrity hash and the old peer ranges).
import { describe, it, expect } from 'vitest';
import { localManifest, localVersion } from '../pack-local.mjs';

describe('pack:local versions', () => {
  it('the next patch, a prerelease stamped with the time (UTC, to the second): unique and in order', () => {
    expect(localVersion('0.3.0', new Date(Date.UTC(2026, 9, 27, 17, 5, 9)))).toBe('0.3.1-local.20261027170509');
    expect(localVersion('1.2.9', new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('1.2.10-local.20260102030405');
    expect(localVersion('0.3.0', new Date(Date.UTC(2026, 9, 27, 17, 5, 10))) > localVersion('0.3.0', new Date(Date.UTC(2026, 9, 27, 17, 5, 9)))).toBe(true);
  });

  it('the manifest: its version, and every @dzgrid/* range pinned to it (a caret range does not take a prerelease); others untouched', () => {
    const m = { name: '@dzgrid/angular', version: '0.3.0', peerDependencies: { '@dzgrid/core': '^0.3.0', '@dzgrid/dom': '^0.3.0', '@angular/core': '>=19', '@tzslot/dom': '>=2.4.0 <3' }, dependencies: { tslib: '^2.3.0' } };
    expect(localManifest(m, '0.3.1-local.1')).toEqual({
      name: '@dzgrid/angular', version: '0.3.1-local.1',
      peerDependencies: { '@dzgrid/core': '0.3.1-local.1', '@dzgrid/dom': '0.3.1-local.1', '@angular/core': '>=19', '@tzslot/dom': '>=2.4.0 <3' },
      dependencies: { tslib: '^2.3.0' },
    });
    expect(m.version).toBe('0.3.0');
  });
});
