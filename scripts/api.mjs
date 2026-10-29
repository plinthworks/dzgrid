/**
 * The public type surface, guarded (2026-10-29, owner after the 1.1.0 close: a 1.0.0 type change
 * once hid behind an `as never` in a test). Reads the built declarations of each package's dist/ —
 * what npm receives — and writes, per public entry, each export's declaration as text (comments
 * dropped, whitespace normalised by the TypeScript printer). `api/*.api.txt` hold the accepted
 * surface; `npm run check:api` (after `npm run build`) compares dist/ against them.
 *
 * Allowed without a word: a new export; a new optional member (`name?:`); any new member of a class
 * (and anything new in Angular's `static ɵ…` metadata); union members added (not `null` or
 * `undefined`: a return type gaining them narrows); a new optional parameter; a version stamp.
 * Anything else — an export or member gone, a line changed otherwise, a required member added to an
 * interface — fails: in a minor or a patch it may break someone. The rules are text rules, pinned
 * by scripts/test/api-surface.test.ts; when in doubt they fail, and the owner decides.
 *
 * A change made on purpose is an owner decision, like a size budget:
 *   npm run build && node scripts/api.mjs --accept "<decision, e.g. owner Q7-3 (2026-11-02)>" --only "@dzgrid/core/tree#treeConflicts"
 * takes those exports from dist/ into the baseline and records the decision in its history. After a
 * release is published, accept its whole surface (no `--only`, « 1.1.0 published ») so its
 * additions are guarded too.
 *
 * Not covered: `./internal` entries (no semver promise); types declared in dist/ but not exported
 * (they are guarded only through the text of the exports that name them); re-exports from another
 * package (recorded as `= @dzgrid/core#Name`, guarded where they are declared).
 */
import ts from 'typescript';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const PACKAGES = ['core', 'dom', 'angular'];
export const baselineFile = (name) => join(root, 'api', `dzgrid-${name}.api.txt`);

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

/** Public entries of a built package: subpath → declaration file. `./internal` is not public. */
function entries(dist) {
  const manifest = JSON.parse(readFileSync(join(dist, 'package.json'), 'utf8'));
  const out = {};
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    if (subpath === './package.json' || subpath === './internal' || typeof target !== 'object' || !target.types) continue;
    out[subpath === '.' ? manifest.name : manifest.name + subpath.slice(1)] = join(dist, target.types);
  }
  return out;
}

/** `{ entry: { exportName: text } }` for the dist/ folder of one package. */
export function surfaceOf(dist) {
  const files = entries(dist);
  const options = { noEmit: true, skipLibCheck: true, types: [], noLib: true, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler };
  // Only the package's own files: another package (`@dzgrid/core`, `@angular/core`) is never
  // resolved, so a published tarball and a workspace build read the same — no node_modules either way.
  const host = ts.createCompilerHost(options);
  host.resolveModuleNameLiterals = (literals, containing, redirected, opts) =>
    literals.map((l) => (l.text.startsWith('.') ? ts.resolveModuleName(l.text, containing, opts, host) : { resolvedModule: undefined }));
  const program = ts.createProgram(Object.values(files), options, host);
  const checker = program.getTypeChecker();
  const inside = (file) => !relative(dist, file).startsWith('..');
  const surface = {};
  for (const [entry, file] of Object.entries(files)) {
    const source = program.getSourceFile(file);
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    const out = {};
    if (moduleSymbol) {
      for (const exported of checker.getExportsOfModule(moduleSymbol)) {
        const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
        const decls = (target.declarations ?? []).filter((d) => inside(d.getSourceFile().fileName));
        if (decls.length === 0) {
          // Re-exported from another package (or unresolved): name where it comes from.
          const d = (exported.declarations ?? []).find(ts.isExportSpecifier);
          const spec = d?.parent.parent.moduleSpecifier;
          out[exported.name] = `= ${spec && ts.isStringLiteral(spec) ? spec.text : '?'}#${d ? (d.propertyName ?? d.name).text : exported.name}`;
          continue;
        }
        // A variable prints with its statement (`export declare const x: T;`), not as `x: T`.
        const node = (d) => (ts.isVariableDeclaration(d) ? d.parent.parent : d);
        out[exported.name] = [...new Set(decls.map((d) => printer.printNode(ts.EmitHint.Unspecified, node(d), d.getSourceFile()).trim()))].join('\n');
      }
    }
    surface[entry] = Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  return surface;
}

/** The baseline text: hand-readable, one `## name` per export under one `# entry` per entry. */
export function format(surface, history) {
  const lines = [
    '# The accepted public type surface — written by scripts/api.mjs, checked by `npm run check:api`.',
    '# Changed only by an owner decision: `node scripts/api.mjs --accept "<decision>"` (see scripts/api.mjs).',
    ...history.map((h) => `# history: ${h}`),
    '',
  ];
  for (const [entry, exports] of Object.entries(surface)) {
    lines.push(`@ ${entry}`);
    for (const [name, text] of Object.entries(exports)) lines.push(`## ${name}`, ...text.split('\n').map((l) => `  ${l}`));
    lines.push('');
  }
  return lines.join('\n');
}

export function parse(text) {
  const surface = {};
  const history = [];
  let entry = null;
  let name = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('# history: ')) history.push(line.slice(11));
    else if (line.startsWith('@ ')) surface[(entry = line.slice(2))] = {};
    else if (line.startsWith('## ')) surface[entry][(name = line.slice(3))] = null;
    else if (line.startsWith('  ') && entry && name) {
      const prev = surface[entry][name];
      surface[entry][name] = prev === null ? line.slice(2) : prev + '\n' + line.slice(2);
    }
  }
  return { surface, history };
}

/** A line that declares an optional member: `name?: T`, `readonly name?: T`, `name?(…)`, `private _x?;`. */
const OPTIONAL = /^\s*((readonly|private|protected|static)\s+)*(\[[^\]]+\]|[\w$]+|"[^"]*"|'[^']*')\?\s*[:(;]/;
const NULLISH = new Set(['null', 'undefined']);

/** Inserted text that is only union members: ` | A | B` or `A | B | `, balanced, none null or undefined. */
function unionChunk(chunk) {
  if (!chunk.startsWith(' | ') && !chunk.endsWith(' | ')) return false;
  const members = chunk.split(' | ').map((m) => m.trim()).filter(Boolean);
  let depth = 0;
  for (const c of chunk) depth += '{([<'.includes(c) ? 1 : '})]>'.includes(c) ? -1 : 0;
  return members.length > 0 && depth === 0 && !members.some((m) => NULLISH.has(m));
}

/** `next` is `prev` with union members inserted, none of them null or undefined (a return type gaining `| null` narrows). */
function unionWidened(prev, next) {
  if (next.length <= prev.length) return false;
  let common = 0;
  while (common < prev.length && prev[common] === next[common]) common++;
  // The insertion starts at a member boundary at or before the first difference: ` | X` or `X | `.
  for (let p = common; p >= 0; p--) {
    if (!next.startsWith(' | ', p) && !next.startsWith(' | ', p - 3)) continue;
    for (let q = p + 1; q <= next.length; q++) {
      if (!unionChunk(next.slice(p, q))) continue;
      const rest = prev.slice(p);
      const more = next.slice(q);
      if (rest === more || unionWidened(rest, more)) return true;
    }
  }
  return false;
}

/** `next` is `prev` with one optional parameter inserted before a `)`: `f(a)` → `f(a, b?: T)`. */
function optionalParamAdded(prev, next) {
  for (let k = prev.indexOf(')'); k >= 0; k = prev.indexOf(')', k + 1)) {
    const head = prev.slice(0, k);
    const tail = prev.slice(k);
    if (next.length > prev.length && next.startsWith(head) && next.endsWith(tail)) {
      const middle = next.slice(head.length, next.length - tail.length);
      if ((head.endsWith('(') ? /^[\w$]+\?:/ : /^, [\w$]+\?:/).test(middle)) return true;
    }
  }
  return false;
}

/** A version constant moving with a release: `declare const X_VERSION = "1.0.0";`. */
const VERSION = /^(export )?declare const [\w$]+ = "\d+\.\d+\.\d+[^"]*";$/;

/** A changed line that only widens: union members added, an optional parameter added, a version stamp. */
const lineWidened = (prev, next) => unionWidened(prev, next) || optionalParamAdded(prev, next) || (VERSION.test(prev) && VERSION.test(next));

const net = (line) => {
  let d = 0;
  for (const c of line) d += '{(['.includes(c) ? 1 : '})]'.includes(c) ? -1 : 0;
  return d;
};

/** Bracket depth at the start of each line. */
function depths(lines) {
  let d = 0;
  return lines.map((l) => {
    const at = d;
    d += net(l);
    return at;
  });
}

/** Consecutive lines cut into balanced blocks, one per member. */
function blocks(lines) {
  const out = [];
  let cur = [];
  let d = 0;
  for (const l of lines) {
    cur.push(l);
    d += net(l);
    if (d <= 0) {
      out.push(cur.join('\n'));
      cur = [];
      d = 0;
    }
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

/** A member's name with its modifiers: `readonly rows`, `static ɵcmp`, `sync`. */
const keyOf = (text) => (text.match(/^\s*((?:readonly|private|protected|public|static|abstract|get|set)\s+)*(\[[^\]\s]*|"[^"]*"|'[^']*'|[^\s:?(<;]+)/)?.[0] ?? text).trim();

/** `lines` is a header that opens, members, and a footer that closes it all (an interface, a class, `f(o: {…}): T`). */
function body(lines) {
  if (lines.length < 2) return false;
  const open = net(lines[0]);
  if (open <= 0) return false;
  let d = open;
  for (const l of lines.slice(1, -1)) {
    d += net(l);
    if (d < open) return false;
  }
  return d + net(lines[lines.length - 1]) === 0;
}

/**
 * Is `next` compatible with `prev`? Declarations with a body are compared member by member: a
 * member gone fails, a member changed is compared the same way, a member added must be optional
 * (any member, in a class body or in Angular's `static ɵ…` metadata: `free`). Other text, line by
 * line: each changed line must only widen (union members, an optional parameter, a version stamp).
 */
export function compatible(prev, next, free = false) {
  if (prev === next) return true;
  const a = prev.split('\n');
  const b = next.split('\n');
  if (body(a) && body(b)) {
    const same = (x, y) => x === y || lineWidened(x, y);
    if (!same(a[0], b[0]) || !same(a[a.length - 1], b[b.length - 1])) return false;
    const isClass = /^(export )?declare (abstract )?class /.test(b[0]);
    const olds = blocks(a.slice(1, -1));
    const news = blocks(b.slice(1, -1));
    const left = new Map();
    for (const m of news) left.set(m, (left.get(m) ?? 0) + 1);
    const take = (m) => left.set(m, left.get(m) - 1);
    const changed = [];
    for (const m of olds) (left.get(m) > 0 ? take(m) : changed.push(m));
    for (const m of changed) {
      const key = keyOf(m);
      const twin = news.find((n) => left.get(n) > 0 && keyOf(n) === key);
      if (twin === undefined || !compatible(m, twin, free || /^static ɵ/.test(key))) return false;
      take(twin);
    }
    for (const [m, n] of left) if (n > 0 && !(free || isClass || OPTIONAL.test(m.split('\n')[0]))) return false;
    return true;
  }
  // Line by line: lines replaced one for one must widen; lines inserted must be whole optional members.
  const depth = depths(b);
  const pairs = [...lcs(a, b), [a.length, b.length]];
  let i = 0;
  let j = 0;
  for (const [pi, pj] of pairs) {
    const removed = pi - i;
    const added = pj - j;
    if (removed > 0 && removed !== added) return false;
    for (let k = 0; k < removed; k++) if (!lineWidened(a[i + k], b[j + k])) return false;
    if (removed === 0 && added > 0 && !free && !membersAdded(b, j, pj, depth)) return false;
    i = pi + 1;
    j = pj + 1;
  }
  return true;
}

/** Lines inserted as whole members: each block balanced and optional. */
function membersAdded(lines, from, to, depth) {
  for (let i = from; i < to; ) {
    const d = depth[i];
    if (!OPTIONAL.test(lines[i])) return false;
    let j = i + 1;
    while (j < to && depth[j] > d) j++;
    if ((j < lines.length ? depth[j] : 0) !== d) return false;
    i = j;
  }
  return true;
}

/** Longest common subsequence of lines, as index pairs. */
function lcs(a, b) {
  const t = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const pairs = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** What breaks between an accepted surface and the current one: `[{ entry, name, kind, before, after }]`. */
export function breaks(accepted, current) {
  const out = [];
  for (const [entry, exports] of Object.entries(accepted)) {
    const now = current[entry];
    if (!now) {
      out.push({ entry, name: '*', kind: 'entry removed' });
      continue;
    }
    for (const [name, before] of Object.entries(exports)) {
      const after = now[name];
      if (after === undefined) out.push({ entry, name, kind: 'removed', before });
      else if (!compatible(before, after)) out.push({ entry, name, kind: 'changed', before, after });
    }
  }
  return out;
}

/** The lines of `before` missing from `after`, and the lines `after` adds — for the message. */
function lineDiff(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  return [...a.filter((l) => !b.includes(l)).map((l) => `    - ${l}`), ...b.filter((l) => !a.includes(l)).map((l) => `    + ${l}`)];
}

export function report(found) {
  const lines = [];
  for (const f of found) {
    lines.push(`  ${f.entry}#${f.name}: ${f.kind}`);
    if (f.kind === 'changed') lines.push(...lineDiff(f.before, f.after));
  }
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const accept = args.includes('--accept') ? args[args.indexOf('--accept') + 1] : null;
  const from = args.includes('--from') ? resolve(args[args.indexOf('--from') + 1]) : null;
  // `--only "<entry>#<name>,…"`: accept these exports alone, the rest of the baseline unchanged.
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',').map((s) => s.trim()).filter(Boolean) : null;
  if (args.includes('--accept') && !accept?.trim()) {
    console.error('--accept needs the decision that allows the change, e.g. --accept "owner Q7-3 (2026-11-02)"');
    process.exit(2);
  }
  let failed = false;
  for (const name of PACKAGES) {
    // `--from <dir>`: read <dir>/<name>/ instead of packages/<name>/dist (a published tarball, unpacked).
    const dist = from ? join(from, name) : join(root, 'packages', name, 'dist');
    if (!existsSync(join(dist, 'package.json'))) {
      console.error(`${relative(root, dist)} is missing: run npm run build first`);
      process.exit(1);
    }
    const current = surfaceOf(dist);
    const file = baselineFile(name);
    const old = existsSync(file) ? parse(readFileSync(file, 'utf8')) : null;
    if (accept) {
      let next = current;
      let names = '';
      if (only) {
        if (!old) {
          console.error(`${relative(root, file)} is missing: --only needs a baseline to change`);
          process.exit(2);
        }
        const mine = only.filter((key) => current[key.split('#')[0]] || old.surface[key.split('#')[0]]);
        if (mine.length === 0) continue;
        next = structuredClone(old.surface);
        for (const key of mine) {
          const [entry, exportName] = key.split('#');
          const text = current[entry]?.[exportName];
          next[entry] ??= {};
          if (text === undefined) delete next[entry][exportName];
          else next[entry][exportName] = text;
        }
        names = ` — ${mine.join(', ')}`;
      }
      writeFileSync(file, format(next, [...(old?.history ?? []), accept + names]));
      console.log(`${relative(root, file)}: accepted (${accept}${names})`);
      continue;
    }
    if (!old) {
      console.error(`${relative(root, file)} is missing: an owner decision creates it (--accept)`);
      failed = true;
      continue;
    }
    const found = breaks(old.surface, current);
    const count = Object.values(current).reduce((n, e) => n + Object.keys(e).length, 0);
    if (found.length === 0) console.log(`@dzgrid/${name}: ${count} exports, nothing removed or narrowed`);
    else {
      failed = true;
      console.error(`@dzgrid/${name}: ${found.length} public type(s) removed or changed incompatibly:\n${report(found)}`);
    }
  }
  if (failed) {
    console.error(
      '\nA removed or narrowed public type breaks consumers in a minor or patch. Undo the change, or, if the owner\n' +
        'decided it (a major, or a type that was never usable), accept it: node scripts/api.mjs --accept "<decision>" --only "<entry>#<name>,…".',
    );
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
