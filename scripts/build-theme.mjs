/**
 * `npm run build:theme`: the theme's CSS from its Sass sources (showcase themes, step 2, owner T1).
 *   dzgrid.scss   → dzgrid.css (layered) and dzgrid.unlayered.css ($layered: false)
 *   contrast.scss → contrast.css (layered) and contrast.unlayered.css ($layered: false)
 *   edit.scss     → edit.css (layered) and edit.unlayered.css ($layered: false), Phase 5 step 4 (owner S4-O2)
 *   range.scss    → range.css (layered) and range.unlayered.css ($layered: false), Phase 5 step 11a
 *   fill.scss     → fill.css and fill.unlayered.css, Phase 5 step 12
 *   columns.scss  → columns.css and columns.unlayered.css, Phase 6 step 2
 *   menu.scss     → menu.css and menu.unlayered.css, Phase 9 (the menus' list and submenus; _menu-list.scss shared with columns.scss)
 *   columns-panel.scss → columns-panel.css and columns-panel.unlayered.css, Phase 6 step 4 (owner Q4-2)
 *   pinned-rows.scss → pinned-rows.css and pinned-rows.unlayered.css, Phase 6 step 8b-1 (owner Q2)
 *   print.scss    → print.css and print.unlayered.css, Phase 6 step 11 (the print table)
 *   fresh-rows.scss → fresh-rows.css and fresh-rows.unlayered.css, 1.1.0 step 16h (the rows a refresh brought)
 *   find.scss     → find.css and find.unlayered.css, Phase 9 (find in the grid: the bar, the marks)
 *   filters-panel.scss → filters-panel.css and filters-panel.unlayered.css, Phase 9 (the filters panel)
 *   row-numbers.scss → row-numbers.css and row-numbers.unlayered.css, 1.4.0 (the row numbers' strip)
 *   row-drag.scss → row-drag.css and row-drag.unlayered.css, Phase 9 (moving rows: the grip, the line, the ghost)
 *   dock.scss → dock.css and dock.unlayered.css, Phase 9 (the dock: areas, edge, tabs)
 *   search.scss   → search.css and search.unlayered.css, 1.4.0 (the quick search's words tinted in the cells)
 *   grouping.scss → grouping.css and grouping.unlayered.css, Phase 7 steps 5–6 (grouped rows, the « Regrouper par » band)
 *   comfort.scss  → dzgrid.comfort.css and dzgrid.comfort.unlayered.css, the owner's third look (decisions.md « Comfort stylesheet »)
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
for (const name of ['dzgrid', 'contrast', 'edit', 'menu', 'range', 'fill', 'columns', 'columns-panel', 'pinned-rows', 'print', 'fresh-rows', 'find', 'filters-panel', 'row-numbers', 'search', 'grouping', 'row-drag', 'dock']) {
  out(`@use "${name}";`, `${name}.css`);
  out(`@use "${name}" with ($layered: false);`, `${name}.unlayered.css`);
}
out('@use "comfort";', 'dzgrid.comfort.css');
out('@use "comfort" with ($layered: false);', 'dzgrid.comfort.unlayered.css');
