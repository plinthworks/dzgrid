# Where filtering, search, sorting and paging run

## What the user does
Filters a column, types in the search box, clicks a header to sort, moves to another page — in a grid fed by the host's rows or by a server.

## What they observe
- The same gestures and the same results, wherever the work is done.
- A change done in the browser is instant; a change the server does shows the loading state first.
- The counts and the "51–100 of 1 234" text are always true for the whole result, never for one page alone.

## What DzGrid does
- One setting, `operations`, places each of `filter`, `quick`, `sort` on `client` or `server`, and `page` on `client`, `server` or `off` (one scrolling list, no pager).
- Defaults: with `rows`, everything in the browser and `page: 'off'`; with a `source`, all four on the server.
- Shorthands: `'server'` puts all four on the server. `'client'` puts all in the browser, with `page: 'client'` for a source and `'off'` for rows.
- A placement left unsaid follows paging: server pages mean server, otherwise the browser.
- The order never changes: filter and search, then sort, then page. Filtering and sorting commute, so any mix of them gives the right rows; a page is a cut of the final ordered list, so it commutes with nothing.
- **The one rule: server pages ⇒ filter, search and sort on the server too.** A browser stage over one page would filter or sort 50 rows and present them as the whole result.
- **The fetched set:** with `page` off or client and some stage on the server, the server returns everything its part matches; the browser finishes the rest and pages it. A browser-side change costs no request.
- The server receives only its own parts of the query (filter, search, sort), each present only when placed there; an empty or blank search is not sent. The parts carry one canonical key: equal parts in another key order give the same key.
- `operations` is fixed at creation: changing it live is refused with `unsupported-live-change`, and the host recreates the grid. `source` is live: a new one fetches again.
- A column the server cannot sort or filter keeps `sortable: false` or `filter: false`. One filter in the browser and the others on the server is not offered (Phase 7).

### Refusals
Every refusal is the error problem `invalid-operations` at `operations.<op>` (or `operations` for the whole value). It is never silent, and the reading taken is the only sensible one:
- a browser stage under server pages: refused for each such stage, read as server;
- a server placement without a `source`: refused, read as the browser (`page` server falls back to `off`);
- a value that is neither `client` nor `server` (nor `off` for `page`): refused, the default for that operation kept;
- a setting that is not a shorthand nor an object: refused, the defaults kept.

## Tests
- `conformance/cases/operations/*` (defaults, shorthands, the fetched set, every refusal), `conformance/cases/split-query/*`, `conformance/cases/problems/invalid-operations.json`.
- `packages/core/test/review-p3a.test.ts` (C7 branches, C8 split keys).
- The fetched set through `sourceRows`: `packages/core/test/source-rows-fetched.test.ts`, `conformance/cases/source-model/client-part-no-request`, `blank-quick-not-sent`, `fetched-set-total-null-when-filtered`, `client-shorthand-fetches-once`, `fetched-set-max-rows` (step 5 part 3).
- Planned: `operations` and `source` in `GridSettings` and `UPDATE_POLICY` (`operations` fixed with `unsupported-live-change`, step 5 part 4).

## Decisions (step 1, 2026-10-17)
- **An invalid setting follows the code, not "all server".** Each refusal above keeps its stated reading: a browser stage under server pages is read as server; a server placement without a `source` is read as the browser (`page` server as `off`); an unknown value keeps that operation's default; a setting that is neither a shorthand nor an object keeps the defaults. `phase-3-plugins.md` B1.2 and B5 decision 1 are corrected to this.
- **`operations` and `source` become settings at step 5**, with `sourceRows`: `operations` fixed (`unsupported-live-change`), `source` live. Nothing reads them before, so step 0.5 does not carry them.

## Decisions (step 5 part 3, 2026-10-17) — the fetched set
- The server's part of the query is the epoch: a change there fetches the set again; a change of the browser's part only filters, sorts or pages the rows held, with no request and no loading state.
- Both parts changed at once: the browser's part applies at once to the rows held (shown stale while the new set loads), the server's when its answer comes; the end state is the same.
- The server's set is the result of its filter and search: `counts.total` is null while the server filters or searches (it does not know the whole), and `counts.filtered` is what the browser kept of the set.
- `operations: 'client'` with a source: the request carries only `params` and `zone`; it is sent at creation and again only on a refresh, another zone, other params or another source. A language change asks nothing.
- The quick search warm-up runs on the rows held when the search is in the browser; when the server searches there is nothing to warm.
- Select-all in a fetched set takes the rows shown, as keys (the browser's *all*); a host's everything-except selection counts the rows the browser kept, and is told again when an answer moves that count.

## Decisions (step 6, 2026-10-17) — the filter on the wire
- The server's filter is sent in its wire form (`toWire`, `docs/behaviors/server-filter.md`), and the epoch and request keys are made from it, not from the model: a half-typed or refused filter edit changes neither, so it starts no epoch, resets no page and asks nothing. The refused filter is in the model's `problems`.
- `counts.total` is known when the wire form has no filter (and no search): a filter that is all half-typed or refused does not filter on the server.
