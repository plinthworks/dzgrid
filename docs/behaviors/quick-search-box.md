# The quick search box (the page's own input)

What the search matches (words, folding, hidden columns) is in `quick-filter.md`. This sheet is the
box: how a text field of the page drives the grid's search (step 16, plan
`docs/phase-3-steps/step16-search-blueprint.md`, decisions `step16-decisions.md`).

## What the user does
Types words into a search field above the grid; pauses; presses Enter, Escape or ArrowDown; leaves
the field; empties it with the field's own clear button.

## What they observe
- The list narrows shortly after they stop typing, not at each key.
- The number of rows found is read out once the list has settled.
- Escape empties the field and shows every row again; ArrowDown goes down into the rows.
- Nothing found: the grid's own "no rows match" message.

## What DzGrid does
- **The page's field, not ours** (owner decision Q1): the grid draws no search box. The host writes
  its own `<input>` (its label, its place, its style) and hands it to the feature:
  ```ts
  import { quickSearch } from '@dzgrid/dom/search';
  const search = quickSearch();
  createGrid(host, { features: [search], … });
  const unbind = search.bind(document.querySelector('#q')!, { debounceMs: 200 });
  ```
  A feature in its own optional entry `@dzgrid/dom/search` (owner decision Q2): an app with only a
  search box does not load the filters. `bind` may be called several times, for several fields. A
  field bound drives every grid the feature is set up in, now and later: a bind before the grid is
  made waits for it; a bind after the grid is gone waits for the next grid (a component mounted again,
  a hot reload: the same `quickSearch()` set up again picks up the fields still bound). One
  `quickSearch()` in two live grids at once is allowed: its fields drive both (each grid says its own
  count). Binding a field already bound to that grid unbinds it first. The grid's end unbinds its
  fields. `unbind` removes our listeners, drops an edit still waiting for its pause without applying
  it, gives back the attributes we set, and leaves the grid's search as it is.
- **Pause:** 150 ms when the search runs in the browser, 300 ms when it runs on the server
  (`operations.quick`), or the bind's `debounceMs` (a finite number of 0 or more; anything else: the
  default). It is separate from `filters({ debounceMs })`. One edit waits per field, replaced by the
  next. Emptying the field (typing, or the field's own clear button) waits for the pause too.
- **Trimmed:** the text sent is the field's text without spaces at its ends (spaces inside are kept).
  A trailing space changes nothing and, on a server, asks nothing. An empty search is never sent to a
  server.
- **Keys** (the user's keys always win over a page's form):
  - Enter applies at once, stays in the field, and never submits a form around it (a host that wants
    Enter to submit its form listens itself, or does not bind that field).
  - Escape on a field with text empties it and applies at once; the key does not reach the page (a
    dialog around stays open). On an empty field Escape goes on to the page.
  - ArrowDown (no modifier) moves focus into the grid, on its focused cell (the one it had before, or
    the grid itself when none). Leaving the field applies what was typed at once.
  - Escape that empties the field sends the field an `input` event first (a host framework bound to
    the field's value hears it), then applies at once: one search, nothing left waiting.
  - **A host's combobox keeps its keys:** when the field says its list is open (`aria-expanded="true"`)
    or an option is active (`aria-activedescendant`), Enter and ArrowDown are left to the host (no
    search at once, no move to the grid; what the host writes in the field applies after the pause).
    A field with a `<datalist>` (`list`) keeps ArrowDown for the browser's suggestions; Enter applies.
  - Inside an input method (Arabic, Chinese, Japanese keyboards), nothing applies until the
    composition ends; Enter and Escape that only end a composition do nothing else. Safari reports the
    composition's last Enter as a key of code 229 after the composition ended: that key is ignored too.
    The filter boxes of `filter-ui.md` follow the same rule. Leaving the field ends a composition whose
    end never comes (some browsers do not send it): nothing applies then, the next edit applies.
- **The grid wins** (echo): a field keeps the text it last sent. The same search coming back leaves
  the field alone (the caret, the spaces inside). Another search (a host's `quick.set`, the overlay's
  "clear all", another bound field) cancels the field's waiting edit and rewrites it, unless the user
  is in the middle of a composition there: that field is left alone and applies its own text after its
  pause. Two bound fields therefore show the same text. At bind, a grid that already searches writes
  its text into the field; otherwise a field that already holds text (the browser restoring a page)
  applies it, silently.
  Design points, on purpose:
  - A composition cancelled (the text back as it was) still applies the field's own text after its
    pause: a host's search that arrived during the composition is replaced by what the field shows.
  - One field bound to two grids: a host's `quick.set` on one grid rewrites the field but is not sent
    to the other grid (each grid keeps the search it was given); the next edit sends to both.
- **Announcement** (owner decision Q3): after a search the user made, the grid says the number of rows
  found, with its existing `announce.rows` text ("12 rows", "0 rows"); when nothing matches, the
  overlay says why. In the browser it is said at once after the pause; on a server once the answer is
  in. Nothing is said when the answer failed (the grid says the error) or when the server does not know
  the count. No new text: the box needs no filter bundle. A "clear all" that also removes filters says
  two sentences in the same beat; the live region reads the last one.
- **Preparing the search** (D13 stays off by default): the first time a bound field takes focus, the
  grid prepares the search in idle time (in the browser only; a server's search needs nothing). While
  a field is bound, new rows or a language change prepare it again. Once the last field is unbound, a
  preparation under way stops (unless the grid prepares anyway, `searchWarmup: 'idle'`). Never at load,
  never at each key.
- **Selection:** "all rows" is tied to the search as to the filters: a search that changes the rows
  clears it once, said once (`selection.md`); `selection.keepOnFilter: false` clears any selection on a
  search too.
- **With filters:** the search and the filters both apply (AND); a value list counts over the search;
  a server's `values()` request carries `quick`.
- **What we set on the field**, only when absent; given back by the field's last unbind, each only when
  it still holds our value (a value the host set meanwhile stays): `aria-controls` (the grid's id,
  ours `dzg-N` set on the grid element if it had none, and kept there after unbind; only when field
  and grid share a document or shadow root; a field bound to several grids names the last one still
  bound), `dir="auto"` (an Arabic query is laid out right to left in a French page), `autocomplete="off"`,
  `enterkeyhint="search"`, `spellcheck="false"`. Never its `type`, name (`aria-label`,
  `aria-labelledby`), `aria-describedby`, `aria-live`, `aria-busy`, `id`, classes or styles. The
  field's accessible name is the host's job: an unlabelled field fails axe. `<input type="search">`
  gives the `searchbox` role.
- **Not yet:** the words found are not highlighted in the cells (Phase 6: it needs a map from the
  folded text back to the shown text).

## Tests
`packages/dom/test/search.test.ts`, `search-extra.test.ts` (review fixes), `search-walk.test.ts` (seeded, `WALK_SEEDS`, `WALK_SEED`),
`structure.test.ts` (the base never imports the entry); browser checks in `scripts/browser.mjs`
(`search=1`, French light and Arabic right to left dark); by ear: `docs/a11y-protocol.md` §12.

## Decisions (step 18, 2026-10-20)
- **One sentence per action:** when one change moves the filters too (a clear-all), the filters feature says it ("Filtered. N rows") and the search says nothing more. Found by the audit screen's permutations; test `search-extra.test.ts`.
- **A slow server** (§12 item 63): heard on the audit screen, `/audit.html?config=server&latency=1200` (`docs/a11y-protocol.md` §12, §14).
