// @vitest-environment node
// Review of step 25: what release.test.ts names in its purpose and does not check — the published
// peers after pinPeers, sideEffects, the theme's files, and no test sources in a tarball.
import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// @ts-expect-error a plain .mjs script
import { pinPeers, peerProblems } from '../manifest.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const pkg = (name: string) => JSON.parse(readFileSync(`${ROOT}packages/${name}/package.json`, 'utf8'));
const NAMES = ['core', 'dom', 'angular', 'theme'];
const VERSIONS = Object.fromEntries(NAMES.map((n) => [pkg(n).name, pkg(n).version]));

describe('1.0.0 as npm would receive it', () => {
  it('each manifest, once pinned as build.mjs does, has its @dzgrid peers on ^1.0.0', () => {
    for (const n of NAMES) {
      const pinned = pinPeers(pkg(n), VERSIONS);
      expect(peerProblems(n, pinned, VERSIONS), n).toEqual([]);
      for (const [dep, range] of Object.entries((pinned.peerDependencies ?? {}) as Record<string, string>)) {
        if (dep.startsWith('@dzgrid/')) expect(range, `${n} → ${dep}`).toBe('^1.0.0');
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

  // After `npm run pack:local`: the tarballs carry no test source, sandbox, capture or measure result, and each
  // non-theme package declares no side effects.
  const packed = `${ROOT}packed`;
  /** The packs' version: 1.0.0 (`npm run pack:release`), or a local one (`npm run pack:local`, app-feedback 15: `1.0.1-local.<stamp>`). */
  const V = existsSync(packed) ? (readdirSync(packed).find((f) => f.startsWith('dzgrid-core-'))?.slice(12, -4) ?? '1.0.0') : '1.0.0';
  const local = V !== '1.0.0';
  it.skipIf(!existsSync(packed))('the packed tarballs: no test sources, sideEffects as declared, version 1.0.0, every exported file present', () => {
    const tgz = readdirSync(packed).filter((f) => f.endsWith('.tgz'));
    expect(V).toMatch(/^(1\.0\.0|1\.0\.1-local\.\d{14})$/);
    expect(tgz.sort()).toEqual(['angular', 'core', 'dom', 'theme'].map((n) => `dzgrid-${n}-${V}.tgz`));
    for (const t of tgz) {
      const list = execFileSync('tar', ['-tzf', `${packed}/${t}`], { encoding: 'utf8' }).split('\n').filter(Boolean);
      expect(list.filter((f) => /(^|\/)(test|tests|__tests__|fixtures|playground|screenshots|results)\/|\.(test|spec)\.|\.d\.ts\.map$/.test(f)), t).toEqual([]);
      expect(list.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')), t).toEqual([]);
      const m = JSON.parse(execFileSync('tar', ['-xOzf', `${packed}/${t}`, 'package/package.json'], { encoding: 'utf8' }));
      expect(m.version, t).toBe(V);
      // Every file the manifest's exports name is in the tarball (a subpath that ships missing fails on import).
      const named = new Set<string>();
      const walk = (v: unknown): void => { if (typeof v === 'string') named.add(v.replace(/^\.\//, '')); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
      walk(m.exports);
      expect([...named].filter((f) => !list.includes(`package/${f}`)), t).toEqual([]);
      expect(m.sideEffects, t).toEqual(t.includes('theme') ? ['*.css'] : false);
    }
  });

  // Phase 5 close (step 13, step13-plan §4): every Phase 5 subpath in the built exports, every relative import
  // (static or lazy) of a shipped module present, no scratch, spike or perf file, a licence and a README in each,
  // no runtime dependency, gsap and tzslot left to the app (peers), never bundled.
  const PHASE5 = {
    core: ['./edit', './range'],
    dom: ['./edit', './editors', './editors-list', './range', './fill', ...['en', 'fr', 'ar'].flatMap((l) => ['edit', 'editors', 'range', 'fill'].map((p) => `./locales/${l}-${p}`))],
    theme: ['./edit.css', './range.css', './fill.css', './midnight.css', './clinic.css', './tailwind.css', './tailwind3.css', './bootstrap.css',
      './dzgrid.unlayered.css', './contrast.unlayered.css', './edit.unlayered.css', './range.unlayered.css', './fill.unlayered.css'],
  } as const;
  const tarOf = (n: string) => `${packed}/dzgrid-${n}-${V}.tgz`;
  const listOf = (n: string) => execFileSync('tar', ['-tzf', tarOf(n)], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const manifestOf = (n: string) => JSON.parse(execFileSync('tar', ['-xOzf', tarOf(n), 'package/package.json'], { encoding: 'utf8' }));
  /** The tarball unpacked once into a fresh folder (reading each file through tar is slow). */
  const unpacked = new Map<string, string>();
  const unpack = (n: string) => {
    if (!unpacked.has(n)) {
      const dir = mkdtempSync(join(tmpdir(), `dzg-${n}-`));
      execFileSync('tar', ['-xzf', tarOf(n), '-C', dir]);
      unpacked.set(n, dir);
    }
    return unpacked.get(n)!;
  };
  afterAll(() => { for (const d of unpacked.values()) rmSync(d, { recursive: true, force: true }); });

  it.skipIf(!existsSync(packed))('the 1.0.0 tarballs export every Phase 5 subpath, the theme every skin, bridge and unlayered copy', () => {
    for (const [n, subs] of Object.entries(PHASE5)) {
      const exp = manifestOf(n).exports as Record<string, unknown>;
      for (const k of subs) expect(exp[k], `${n} ${k}`).toBeDefined();
    }
  });

  it.skipIf(!existsSync(packed))('every relative import of a shipped module, lazy chunks included, is in its tarball', () => {
    for (const n of ['core', 'dom']) {
      const list = new Set(listOf(n));
      const js = [...list].filter((f) => f.endsWith('.js'));
      const missing: string[] = [];
      for (const f of js) {
        const text = readFileSync(join(unpack(n), f), 'utf8');
        for (const m of text.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
          const target = new URL(m[1]!, `file:///${f}`).pathname.slice(1);
          if (!list.has(target)) missing.push(`${f} → ${m[1]}`);
        }
      }
      expect(missing, n).toEqual([]);
      expect(js.length, n).toBeGreaterThan(10);
    }
    // The lazy chunks the entries load on demand are shipped.
    const dom = listOf('dom');
    for (const re of [/^package\/range\/html\//, /^package\/editors\/dates\/calendar\.js$/, /^package\/motion-gsap\/run\/index\.js$/, /^package\/export\//]) expect(dom.some((f) => re.test(f)), String(re)).toBe(true);
  });

  it.skipIf(!existsSync(packed))('no scratch, spike or perf file; a licence and a README; no runtime dependency; gsap and tzslot peers only', () => {
    for (const n of ['core', 'dom', 'angular', 'theme']) {
      const list = listOf(n);
      expect(list.filter((f) => /(^|\/)(a13-|s12-|s13-)|(^|\/)(spikes|perf|node_modules|packed|examples)\/|\.tgz$/.test(f)), n).toEqual([]);
      expect(list, n).toContain('package/LICENSE');
      expect(list, n).toContain('package/README.md');
      const m = manifestOf(n);
      // K.10: no runtime dependency; ng-packagr's `tslib` is the one the Angular package may carry (manifest.mjs).
      expect(Object.keys(m.dependencies ?? {}).filter((d) => !(n === 'angular' && d === 'tslib')), n).toEqual([]);
      expect(m.license, n).toBe('MIT');
      expect(m.repository?.url, n).toBe('git+https://github.com/plinthworks/dzgrid.git');
    }
    const dom = manifestOf('dom');
    expect(Object.keys(dom.peerDependencies)).toEqual(expect.arrayContaining(['@dzgrid/core', 'gsap', '@tzslot/core', '@tzslot/dom']));
    expect(dom.peerDependencies['@dzgrid/core']).toBe(local ? V : '^1.0.0');
    // Not bundled: no shipped module carries gsap's or tzslot's code, only imports of them.
    for (const f of listOf('dom').filter((x) => x.endsWith('.js'))) {
      const text = readFileSync(join(unpack('dom'), f), 'utf8');
      expect(/GreenSock|gsap\.com\/standard-license/i.test(text), f).toBe(false);
    }
  });
});
