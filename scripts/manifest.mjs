/**
 * The checks build.mjs runs on each dist/package.json before anything leaves
 * for npm. Kept apart from build.mjs so they can be tested without a build.
 */

/**
 * Runtime dependencies a published package may carry (K.10: none for the core,
 * the DOM layer and the theme). The Angular package may need `tslib`, which
 * ng-packagr's output imports when a helper is emitted; everything else is a
 * peer.
 */
const ALLOWED_DEPENDENCIES = { angular: ['tslib'] };

/** Problems with one built manifest, as sentences; empty when it can ship. */
export function manifestProblems(name, manifest) {
  const problems = [];
  // A published manifest that points at src/ points at a file npm never
  // received: the install succeeds and the import fails.
  const entries = JSON.stringify([manifest.main, manifest.module, manifest.types, manifest.typings, manifest.exports]);
  if (entries.includes('src/')) problems.push(`packages/${name}/dist/package.json still points at src/`);
  const allowed = ALLOWED_DEPENDENCIES[name] ?? [];
  const extra = Object.keys(manifest.dependencies ?? {}).filter((dep) => !allowed.includes(dep));
  if (extra.length > 0) problems.push(`packages/${name} has runtime dependencies: ${extra.join(', ')}`);
  return problems;
}

/**
 * The subpaths a package declares in build.mjs against the ones its source
 * package.json exports: a subpath added to one and not the other would ship
 * missing, or ship unchecked.
 */
export function entryProblems(name, declared, sourceExports) {
  const exported = Object.keys(sourceExports ?? {}).filter((k) => k !== './package.json');
  const missing = exported.filter((k) => !declared.includes(k));
  const unknown = declared.filter((k) => !exported.includes(k));
  return [
    ...(missing.length ? [`packages/${name} exports ${missing.join(', ')}, not listed in build.mjs PACKAGES`] : []),
    ...(unknown.length ? [`build.mjs PACKAGES lists ${unknown.join(', ')} for ${name}, not in its package.json exports`] : []),
  ];
}

/**
 * A manifest whose `@dzgrid/*` peers are a caret range on each sibling's
 * version: the repository writes 0.0.0 or a workspace marker, npm needs the
 * range a consumer's install can meet.
 */
export function pinPeers(manifest, versions) {
  const peers = manifest.peerDependencies;
  if (!peers) return manifest;
  const pinned = Object.fromEntries(Object.entries(peers).map(([dep, range]) => [dep, dep in versions ? `^${versions[dep]}` : range]));
  return { ...manifest, peerDependencies: pinned };
}

/** `@dzgrid/*` peers that would not accept the sibling released with them. */
export function peerProblems(name, manifest, versions) {
  const problems = [];
  for (const [dep, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (!dep.startsWith('@dzgrid/')) continue;
    if (!(dep in versions)) problems.push(`packages/${name} peer ${dep} is not a workspace package`);
    else if (range !== `^${versions[dep]}`) problems.push(`packages/${name} peer ${dep} is ${range}, not ^${versions[dep]}`);
  }
  return problems;
}

/** The repository every shipped manifest names, with the package's folder (npm links the source). */
export const REPOSITORY = 'git+https://github.com/plinthworks/dzgrid.git';

/** A manifest without `repository`, or with another folder than `packages/<name>`. */
export function repositoryProblems(name, manifest) {
  const r = manifest.repository;
  if (!r || typeof r !== 'object' || !r.url) return [`packages/${name} has no repository`];
  const problems = [];
  if (r.url !== REPOSITORY) problems.push(`packages/${name} repository.url is ${r.url}, not ${REPOSITORY}`);
  if (r.directory !== `packages/${name}`) problems.push(`packages/${name} repository.directory is ${r.directory}, not packages/${name}`);
  return problems;
}

/**
 * Source maps in a built dist/ that point at a file npm will not receive: a
 * source neither shipped beside the map nor inlined in its `sourcesContent`
 * (a `.d.ts.map` naming ../src/*.ts, for one). `files` lists every path
 * under dist/, relative and with forward slashes; `read` returns one's text.
 */
export function mapProblems(name, files, read) {
  const shipped = new Set(files);
  const problems = [];
  for (const file of files.filter((f) => f.endsWith('.map'))) {
    let map;
    try { map = JSON.parse(read(file)); } catch { problems.push(`packages/${name}/dist/${file} is not JSON`); continue; }
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
    (map.sources ?? []).forEach((source, i) => {
      if (typeof map.sourcesContent?.[i] === 'string') return;
      const parts = [];
      // The source map spec joins sourceRoot and a source with '/'; a '..' past the root stays a '..'.
      const root = map.sourceRoot ? `${map.sourceRoot}/` : ''; // an empty segment is skipped below
      for (const part of (dir + root + source).split('/')) {
        if (part === '..') { if (parts.length && parts.at(-1) !== '..') parts.pop(); else parts.push('..'); }
        else if (part !== '.' && part !== '') parts.push(part);
      }
      const target = parts.join('/');
      if (!shipped.has(target)) problems.push(`packages/${name}/dist/${file} points at ${source}, which is not shipped`);
    });
  }
  return problems;
}

/**
 * How every package reaches npm (1.0.0, 2026-10-28): public under the `@dzgrid` organisation, with a provenance
 * attestation that the release workflow (.github/workflows/release.yml, trusted publishing over OIDC) signs. A
 * manual publish from a laptop has no such identity: it passes `--provenance=false` (docs/release-1.0.0.md).
 */
export const PUBLISH_CONFIG = { access: 'public', provenance: true };

/** The Node the packages are checked on (ARCHITECTURE K.7: Node ≥ 22 for the tools); a browser ignores it. */
export const ENGINES = { node: '>=22' };

/** A manifest missing what the registry page and a consumer's install read; empty when it can ship. */
export function publishProblems(name, manifest) {
  const problems = [];
  const pc = manifest.publishConfig;
  if (!pc || pc.access !== 'public' || pc.provenance !== true) problems.push(`packages/${name} publishConfig is not { access: public, provenance: true }`);
  if (!manifest.engines?.node) problems.push(`packages/${name} has no engines.node`);
  if (!Array.isArray(manifest.keywords) || manifest.keywords.length === 0) problems.push(`packages/${name} has no keywords`);
  if (!manifest.homepage) problems.push(`packages/${name} has no homepage`);
  if (!manifest.bugs?.url) problems.push(`packages/${name} has no bugs.url`);
  if (manifest.license !== 'MIT') problems.push(`packages/${name} license is ${manifest.license}, not MIT`);
  return problems;
}
