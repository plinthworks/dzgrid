/**
 * `npm run check:types` (after `npm run build`): the declarations npm receives compile, as an app's compiler reads them
 * (1.11.0: an output's event type was inlined into the Angular package's .d.ts with a type parameter, `T_1`, declared
 * nowhere — every app would have failed to build, and nothing but `release:check`'s real app build saw it). Every
 * `types` file of every package's built exports map, compiled together, `skipLibCheck` off; `@dzgrid/*` resolve to the
 * built packages, never the sources. Any diagnostic fails.
 */
import ts from 'typescript';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
/** The packages with declarations (`@dzgrid/theme` ships stylesheets only). */
const PACKAGES = ['core', 'dom', 'angular', 'element'];

export function check() {
  const files = [];
  const paths = {};
  for (const name of PACKAGES) {
    const dist = join(root, 'packages', name, 'dist');
    const manifest = join(dist, 'package.json');
    if (!existsSync(manifest)) throw new Error(`packages/${name}/dist: not built (npm run build)`);
    const { exports = {} } = JSON.parse(readFileSync(manifest, 'utf8'));
    for (const [key, value] of Object.entries(exports)) {
      const types = typeof value === 'object' && value ? value.types : null;
      if (!types) continue;
      const file = join(dist, types);
      files.push(file);
      paths[`@dzgrid/${name}${key === '.' ? '' : key.slice(1)}`] = [file];
    }
  }
  const program = ts.createProgram(files, {
    strict: true, noEmit: true, skipLibCheck: false, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], types: [], paths, baseUrl: root,
  });
  const ours = (d) => d.file && d.file.fileName.includes('/dist/');
  return { files: files.length, diagnostics: ts.getPreEmitDiagnostics(program).filter(ours) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { files, diagnostics } = check();
  for (const d of diagnostics) {
    const { line } = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
    console.error(`${relative(root, d.file.fileName)}:${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
  }
  if (diagnostics.length) process.exit(1);
  console.log(`Published types: ${files} entry declarations compile.`);
}
