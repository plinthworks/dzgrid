/**
 * `node scripts/gen-api.mjs`: the site's API reference (docs/website-plan.md, batch 4) — one page per package,
 * `website/src/content/docs/api/<package>.mdx` and its French twin, made from the accepted type surface
 * (`api/dzgrid-<package>.api.txt`, the file `npm run check:api` guards): one section per entry, each public name with
 * its declaration. The declarations are the same in both languages; only the page's words change. The texts bundles
 * (`locales/*`) come last, in one section. `--check` fails when a page differs.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { baselineFile, PACKAGES, parse } from './api.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const DOCS = join(root, 'website/src/content/docs');
export const pageFile = (name, lang) => join(DOCS, lang === 'fr' ? 'fr/api' : 'api', `${name}.mdx`);

const WORDS = {
  en: {
    intro: (pkg, file) =>
      `Every public name of \`${pkg}\`, entry by entry, with its declaration as the published types give it. Made from [\`${file}\`](https://github.com/plinthworks/dzgrid/blob/main/${file}), the surface a test keeps from shrinking between versions; the guides and the option pages say what each name does.`,
    files: 'Imported for what they do, with no names of their own:',
    locales: 'Texts bundles',
    localesIntro: 'One bundle per language and feature, spread into the grid\'s `messages` (see [Features](../../features/)).',
  },
  fr: {
    intro: (pkg, file) =>
      `Chaque nom public de \`${pkg}\`, entrée par entrée, avec sa déclaration telle que les types publiés la donnent. Fait depuis [\`${file}\`](https://github.com/plinthworks/dzgrid/blob/main/${file}), la surface qu’un test empêche de rétrécir d’une version à l’autre ; les guides et les pages d’options disent ce que fait chaque nom. Les déclarations sont du code : elles restent en anglais.`,
    files: 'Importées pour ce qu’elles font, sans nom à elles :',
    locales: 'Paquets de textes',
    localesIntro: 'Un paquet par langue et par fonction, ajouté aux `messages` de la grille (voir [Fonctions](../../features/)).',
  },
};

/** The page of one package in one language. */
export function page(name, lang) {
  const w = WORDS[lang];
  const pkg = `@dzgrid/${name}`;
  const file = relative(root, baselineFile(name));
  const { surface } = parse(readFileSync(baselineFile(name), 'utf8'));
  const description = JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8')).description.replace(/"/g, "'");
  const out = ['---', `title: "${pkg}"`, `description: "${description}"`, 'tableOfContents:', '  maxHeadingLevel: 2', '---', '', w.intro(pkg, file), ''];
  const entries = Object.keys(surface);
  const locales = entries.filter((e) => e.includes('/locales/'));
  const empty = entries.filter((e) => !locales.includes(e) && !Object.keys(surface[e]).length);
  const named = entries.filter((e) => !locales.includes(e) && !empty.includes(e));
  const block = (decl) => ['```ts', decl, '```', ''];
  for (const e of named) {
    out.push(`## \`${e}\``, '');
    for (const [n, decl] of Object.entries(surface[e])) out.push(`### ${n}`, '', ...block(decl));
  }
  if (empty.length) out.push(w.files, '', ...empty.map((e) => `- \`${e}\``), '');
  if (locales.length) {
    out.push(`## ${w.locales}`, '', w.localesIntro, '');
    for (const e of locales) {
      out.push(`### \`${e}\``, '');
      for (const decl of Object.values(surface[e])) out.push(...block(decl));
    }
  }
  return out.join('\n').replace(/\n+$/, '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  let stale = false;
  for (const name of PACKAGES)
    for (const lang of ['en', 'fr']) {
      const path = pageFile(name, lang);
      const text = page(name, lang);
      if (check) {
        if (!existsSync(path) || readFileSync(path, 'utf8') !== text) (stale = true), console.error(`${relative(root, path)} is out of date: run node scripts/gen-api.mjs`);
      } else writeFileSync(path, text);
    }
  if (stale) process.exit(1);
  console.log(check ? 'API pages up to date.' : 'API pages written.');
}
