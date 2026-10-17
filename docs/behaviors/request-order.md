# The order of server responses

## What the user does
Types a filter quickly, clicks "next" twice, sorts while a page is loading, or waits on a server that fails.

## What they observe
- The grid always ends on what they asked last, whatever order the answers arrive in.
- An older answer that arrives late never flashes on screen.
- While waiting, the previous rows stay, dimmed; the grid is busy for screen readers.
- A failure shows an error message with a retry button; retry asks again for the same thing.
- Closing the grid during a load leaves nothing behind.

## What DzGrid does
- Every request passes a **gate**: one channel for the rows, `rows`, and one per value list, `values:<column>`.
- Each request gets a sequence number within an epoch. Only the latest request of the current epoch is applied; a new epoch (another server query) drops everything before it.
- A superseded request is cancelled through the `signal` the host received; a host that honours it stops the work.
- A late answer, success or failure, is dropped silently. A cancelled request is never an error.
- An accepted failure gives `status: error` with the host's error unchanged, the `fetchFailed` event, and the error overlay with retry (`rows.refresh`).
- Retry fetches the same query and page again, under a new sequence number.
- While loading: `status: loading`, `aria-busy="true"`, the previous rows kept with stale styling, so focus and selection keep their rows.
- `destroy` drops every request in flight; their answers are ignored.
- Debouncing lives in the inputs, not in the core: 300 ms when the operation runs on the server, 150 ms in the browser.
- A change of the browser's part of the query never reaches the gate: no request.

## Tests
- `conformance/cases/server-gate/*.json` (20 cases), `conformance/runner/suites/server.ts`: reversed arrival, two filters close together, a page change during a load, an answer after `destroy`, a stale rejection, an abort reason, a new epoch over the same key, the same key twice, independent channels, a completed request never aborted, precedence of the reasons.
- `packages/core/test/gate-property.test.ts`: 1 000 seeded orders of 20 begin/answer/new-epoch steps against an oracle of its own, and 1 000 more with a destroy; run for both source configurations at step 18 (planned). `packages/core/test/gate.test.ts`: diagnostics, destroy, re-entrant aborts.
- `rows.refresh` reaches the model: `packages/core/test/kernel-p3.test.ts`.
- Error then retry, stale error ignored, `destroy` during a fetch: `packages/core/test/source-rows*.test.ts`, `conformance/cases/source-model/*`; in the grid (overlay over the rows kept, `aria-busy`, `data-stale`, the announcement): `packages/dom/test/source-grid.test.ts`.

## Decisions (step 1, 2026-10-17)
- **The row channel is `rows`** (B1.5); the plan's `page` channel is superseded.
- **The failure is the host's error, unchanged:** `status: { phase: 'error', failure }` keeps `failure: unknown` as in the code. The event `fetchFailed {source: 'data', error, key, page: number | null}` gives the context (the request key, the page asked for, null without server pages). It is added to `GridEvent` at step 5.
- **No loading overlay over rows:** while a request runs, the rows shown stay, with stale styling and `aria-busy="true"`. The loading overlay shows only when there are no rows to keep (the first load). The plan's "overlay in the same frame" (step 14, browser budget) is superseded: the measure is "next" to `aria-busy` and stale styling.
- **After an accepted failure** the model keeps the page that was asked (so retry asks for it again) and the rows of the last accepted answer (so focus and selection keep their rows); the error overlay with retry covers them.
- **For hosts (step 3):** an aborted request's `signal.reason` is the gate's reason as a string (`'superseded'`, `'stale-epoch'`, `'aborted'`, `'destroyed'`), not a native `AbortError`: a `fetch` given that signal rejects with that string. The grid drops those rejections itself; a host must not test `name === 'AbortError'`. `cancel(channel)` is what produces `'aborted'` (a values popup closed).
