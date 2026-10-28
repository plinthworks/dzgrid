// @vitest-environment node
// 1.0.0 (2026-10-28): what the release workflow checks before it publishes, and the order it publishes in
// (scripts/release.mjs, .github/workflows/release.yml).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { ORDER, releaseProblems, toPublish } from '../release.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('release.mjs', () => {
  const at = (v: string, peer = `^${v}`) => ({
    '@dzgrid/core': { name: '@dzgrid/core', version: v },
    '@dzgrid/dom': { name: '@dzgrid/dom', version: v, peerDependencies: { '@dzgrid/core': peer } },
    '@dzgrid/theme': { name: '@dzgrid/theme', version: v },
    '@dzgrid/angular': { name: '@dzgrid/angular', version: v, peerDependencies: { '@dzgrid/core': peer, '@dzgrid/dom': peer } },
  });

  it('publishes dependencies before dependents: core, dom, theme, angular', () => {
    expect(ORDER).toEqual(['core', 'dom', 'theme', 'angular']);
  });

  it('accepts four manifests at the tag\'s version, peers on ^version', () => {
    expect(releaseProblems(at('1.0.0'), 'v1.0.0')).toEqual([]);
    expect(releaseProblems(at('1.0.0'), undefined)).toEqual([]);
  });

  it('refuses a tag that is not the version, versions that differ, a peer off the version, a prerelease', () => {
    expect(releaseProblems(at('1.0.0'), 'v1.0.1')).toEqual(['tag v1.0.1 is not v1.0.0, the packages\' version']);
    const mixed = { ...at('1.0.0'), '@dzgrid/theme': { name: '@dzgrid/theme', version: '0.3.0' } };
    expect(releaseProblems(mixed, 'v1.0.0')).toEqual(['@dzgrid/theme is 0.3.0, not 1.0.0']);
    expect(releaseProblems(at('1.0.0', '^0.3.0'), 'v1.0.0')).toHaveLength(3);
    expect(releaseProblems(at('1.0.1-local.20261028000000', '1.0.1-local.20261028000000'), undefined)[0]).toMatch(/prerelease/);
  });

  it('skips what the registry already has, publishes the rest in order', () => {
    expect(toPublish('1.0.0', { core: ['1.0.0'], dom: [], theme: ['0.9.0'], angular: [] })).toEqual(['dom', 'theme', 'angular']);
    expect(toPublish('1.0.0', { core: ['1.0.0'], dom: ['1.0.0'], theme: ['1.0.0'], angular: ['1.0.0'] })).toEqual([]);
  });

  it('the workflow publishes on a v* tag over OIDC, runs the gates first, stores no token', () => {
    const wf = readFileSync(`${ROOT}.github/workflows/release.yml`, 'utf8');
    expect(wf).toMatch(/tags: \['v\*'\]/);
    expect(wf).toContain('id-token: write');
    expect(wf).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|secrets\./);
    const order = ['npm run test:ci', 'npm run typecheck', 'npm run build', 'npm run check:size', 'npm run release:check', 'npm run publish:release'];
    const where = order.map((s) => wf.indexOf(s));
    expect(where.every((i) => i >= 0), String(where)).toBe(true);
    expect([...where].sort((a, b) => a - b)).toEqual(where);
  });
});
