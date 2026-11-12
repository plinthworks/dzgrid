// DzGrid's documentation site: Astro Starlight, English at the root and French under /fr/.
// The library is read from source (../packages/*/src), so every page shows the current code.
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

/**
 * Every entry the packages publish, read from their own `exports` (which point at `src/` in the repository):
 * `@dzgrid/dom/filters-base` → packages/dom/src/filters-base.ts. Exact matches, so no entry swallows a longer one,
 * and a new entry needs no line here.
 */
function aliases() {
  const out = [];
  for (const dir of readdirSync(repo('packages'))) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(repo(`packages/${dir}/package.json`), 'utf8'));
    } catch {
      continue;
    }
    for (const [key, target] of Object.entries(manifest.exports ?? {})) {
      const file = typeof target === 'string' ? target : target.default;
      if (typeof file !== 'string') continue;
      const name = `${manifest.name}${key.slice(1)}`;
      out.push({ find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`), replacement: repo(`packages/${dir}/${file.slice(2)}`) });
    }
  }
  // `@tzslot/*` and `gsap`, imported by the sources, resolve from the root's node_modules (npm ci there).
  return out;
}

/** The guides, by task (moved here from docs/guide/ in batch 2; the order is the old guide index's). */
const GUIDES = [
  'columns',
  'appearance',
  'sort-filter-search',
  'selection-ranges',
  'editing',
  'tree',
  'grouping',
  'pivot',
  'server-data',
  'row-moves',
  'dock-panels',
  'export-print',
  'state',
  'theming-rtl',
  'accessibility',
];

export default defineConfig({
  site: 'https://plinthworks.github.io',
  base: '/dzgrid/',
  trailingSlash: 'always',
  // The playground holds 4700 (`npm start` at the root).
  server: { port: 4720 },
  integrations: [
    starlight({
      title: 'DzGrid',
      description: 'A data grid written from scratch in TypeScript: a pure core, a DOM layer, a theme, Angular and a Web Component.',
      logo: { src: './src/assets/logo.svg', alt: '' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/plinthworks/dzgrid' }],
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        fr: { label: 'Français', lang: 'fr' },
      },
      // The grid's theme on every page: its palette (--tz-*) is the site's accent too.
      customCss: [
        '@dzgrid/theme/dzgrid.css',
        // Each feature's sheet, for the guides' demos (they change nothing on a grid without the feature).
        ...['columns', 'menu', 'grouping', 'pivot', 'edit', 'range', 'fill', 'dock', 'columns-panel', 'filters-panel', 'find', 'search', 'print', 'row-drag', 'pinned-rows', 'vertical-headers', 'variables'].map((s) => `@dzgrid/theme/${s}.css`),
        './src/styles/custom.css',
      ],
      sidebar: [
        {
          label: 'Getting started',
          translations: { fr: 'Prise en main' },
          items: ['typescript', 'angular', 'web-component'].map((page) => ({ slug: `getting-started/${page}` })),
        },
        {
          label: 'Guides',
          translations: { fr: 'Guides' },
          items: GUIDES.map((page) => ({ slug: `guides/${page}` })),
        },
        // One page per option (batch 3): every page written under these folders, the index first (sidebar.order 0).
        { label: 'Settings', translations: { fr: 'Réglages' }, items: [{ autogenerate: { directory: 'settings' } }] },
        { label: 'Column options', translations: { fr: 'Options de colonne' }, items: [{ autogenerate: { directory: 'column-options' } }] },
        { label: 'Features', translations: { fr: 'Fonctions' }, items: [{ autogenerate: { directory: 'features' } }] },
        // Generated from api/*.api.txt (batch 4).
        { label: 'API reference', translations: { fr: 'Référence de l’API' }, items: [{ autogenerate: { directory: 'api' } }] },
      ],
    }),
  ],
  vite: {
    resolve: { alias: aliases() },
    // The packages' sources live outside website/.
    server: { fs: { allow: [repo('')] } },
  },
});
