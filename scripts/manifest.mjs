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
