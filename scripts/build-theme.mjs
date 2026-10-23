/**
 * `npm run build:theme`: the theme's CSS from its Sass sources (showcase themes, step 2, owner T1).
 *   dzgrid.scss   → dzgrid.css (layered) and dzgrid.unlayered.css ($layered: false)
 *   contrast.scss → contrast.css (layered) and contrast.unlayered.css ($layered: false)
 * The tests compile the same way and fail when a file drifts from its source.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';

const dir = fileURLToPath(new URL('../packages/theme/', import.meta.url));
const out = (source, file) => {
  const { css } = compileString(source, { loadPaths: [dir], style: 'expanded' });
  writeFileSync(`${dir}${file}`, `${css}\n`);
  console.log(`build:theme: ${file}`);
};
for (const name of ['dzgrid', 'contrast']) {
  out(`@use "${name}";`, `${name}.css`);
  out(`@use "${name}" with ($layered: false);`, `${name}.unlayered.css`);
}
