// @vitest-environment node
// Review of step 25: what release.test.ts names in its purpose and does not check — the published
// peers after pinPeers, sideEffects, the theme's files, and no test sources in a tarball.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { pinPeers, peerProblems } from '../manifest.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const pkg = (name: string) => JSON.parse(readFileSync(`${ROOT}packages/${name}/package.json`, 'utf8'));
const NAMES = ['core', 'dom', 'angular', 'theme'];
const VERSIONS = Object.fromEntries(NAMES.map((n) => [pkg(n).name, pkg(n).version]));

describe('0.1.0 as npm would receive it', () => {
  it('each manifest, once pinned as build.mjs does, has its @dzgrid peers on ^0.1.0', () => {
    for (const n of NAMES) {
      const pinned = pinPeers(pkg(n), VERSIONS);
      expect(peerProblems(n, pinned, VERSIONS), n).toEqual([]);
      for (const [dep, range] of Object.entries((pinned.peerDependencies ?? {}) as Record<string, string>)) {
        if (dep.startsWith('@dzgrid/')) expect(range, `${n} → ${dep}`).toBe('^0.1.0');
      }
    }
  });

  it('the theme ships every file its exports name, keeps its CSS as side effects, and no test folder', () => {
    const theme = pkg('theme');
    const targets = new Set<string>();
    const walk = (v: unknown): void => { if (typeof v === 'string') targets.add(v.replace(/^\.\//, '')); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    walk(theme.exports);
    targets.add(theme.main.replace(/^\.\//, ''));
    targets.add(theme.sass.replace(/^\.\//, ''));
    expect([...targets].filter((t) => !theme.files.includes(t))).toEqual([]);
    expect(theme.files.some((f: string) => /test|fixture/.test(f))).toBe(false);
    expect(theme.sideEffects).toEqual(['*.css']);
  });

  // After `npm run pack:local`: the tarballs carry no test source, sandbox or capture, and each
  // non-theme package declares no side effects.
  const packed = `${ROOT}packed`;
  it.skipIf(!existsSync(packed))('the packed tarballs: no test sources, sideEffects as declared, version 0.1.0', () => {
    const tgz = readdirSync(packed).filter((f) => f.endsWith('.tgz'));
    expect(tgz.sort()).toEqual(['dzgrid-angular-0.1.0.tgz', 'dzgrid-core-0.1.0.tgz', 'dzgrid-dom-0.1.0.tgz', 'dzgrid-theme-0.1.0.tgz']);
    for (const t of tgz) {
      const list = execFileSync('tar', ['-tzf', `${packed}/${t}`], { encoding: 'utf8' }).split('\n').filter(Boolean);
      expect(list.filter((f) => /(^|\/)(test|tests|__tests__|fixtures|playground|screenshots)\/|\.(test|spec)\.|\.d\.ts\.map$/.test(f)), t).toEqual([]);
      expect(list.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')), t).toEqual([]);
      const m = JSON.parse(execFileSync('tar', ['-xOzf', `${packed}/${t}`, 'package/package.json'], { encoding: 'utf8' }));
      expect(m.version, t).toBe('0.1.0');
      expect(m.sideEffects, t).toEqual(t.includes('theme') ? ['*.css'] : false);
    }
  });
});
