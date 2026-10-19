/**
 * `@dzgrid/dom/search`: the quick search box (docs/behaviors/quick-search-box.md, step 16), a
 * feature that binds the page's own search fields, kept out of the base and out of the filters
 * so an app with only a search box carries neither. It reaches the base only through the grid
 * it is set up on.
 */
export { quickSearch, type QuickSearch, type QuickSearchOptions } from './search/index.js';
