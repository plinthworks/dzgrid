/**
 * The real framework builds for the browser suite (`npm run test:browser -- --only themes`; showcase
 * themes step 5, owner T4): each setup of docs/theme-in-3-lines.md (packages/theme/test/frameworks/)
 * built with the real tool into node_modules/.cache/dzgrid-frameworks/<name>.css. The tools are only
 * run, through their command line (npm's `.bin` links) or esbuild, never read (CLEANROOM.md): Tailwind
 * CSS 4.3.3 (`tailwindcss`), Tailwind CSS 3.4.19 installed as `tailwindcss3` (its CLI is linked as
 * `tailwind`; its imports `tailwindcss/…` are read as `tailwindcss3/…`), Bootstrap 5.3.8's CSS bundled
 * as an application's bundler would (esbuild).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

export const SETUPS = ['tailwind4', 'tailwind4-class', 'tailwind4-noorder', 'tailwind4-bare', 'tailwind3', 'bootstrap', 'bootstrap-unlayered'];
/** The documented pitfalls: built and checked, never offered as a setup (docs/theme-in-3-lines.md names them). */
export const PITFALLS = ['tailwind4-noorder', 'tailwind4-bare'];
/** The file a setup is built from. */
export const inputOf = (root, name) => `${root}packages/theme/test/frameworks/${name}.css`;

/** Builds every setup; returns { name: path of the built CSS, relative to the root }. Throws on a tool's error. */
export async function buildFrameworks(root) {
  const src = `${root}packages/theme/test/frameworks`;
  const out = `${root}node_modules/.cache/dzgrid-frameworks`;
  mkdirSync(out, { recursive: true });
  const run = (bin, args, cwd) => execFileSync(`${root}node_modules/.bin/${bin}`, args, { cwd, stdio: 'pipe', env: { ...process.env, BROWSERSLIST_IGNORE_OLD_DATA: '1' } });
  const built = {};
  for (const name of SETUPS) {
    const target = `${out}/${name}.css`;
    if (name.startsWith('tailwind4')) {
      // Tailwind 4 finds the classes from its working directory: the setups' folder (classes.html).
      run('tailwindcss', ['-i', inputOf(root, name), '-o', target], src);
    } else if (name === 'tailwind3') {
      const input = `${out}/tailwind3.input.css`;
      writeFileSync(input, readFileSync(inputOf(root, name), 'utf8').replaceAll('"tailwindcss/', '"tailwindcss3/'));
      run('tailwind', ['-c', `${src}/tailwind3.config.cjs`, '-i', input, '-o', target], src);
    } else {
      await build({ entryPoints: [inputOf(root, name)], bundle: true, outfile: target, absWorkingDir: root, logLevel: 'error' });
    }
    built[name] = target.slice(root.length);
  }
  return built;
}
