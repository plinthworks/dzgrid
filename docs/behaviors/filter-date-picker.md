# Choosing dates in the filter popup (tzslot)

## What the user does
Opens the filter popup of a day or date-and-time column, picks an operator, then a day, two days, a
shortcut (*today*, *last 7 days*…) or a moment, from a calendar that opens under the field.

## What they observe
- The popup opens at once. The first time a date filter opens, the calendar may take a moment to
  arrive: a short "loading" line says so; the operator, Clear and Apply already work.
- One field per operator: a day for *on*, *before*, *after*…; a period (two days, with the
  shortcuts beside the calendar) for *between* and *between days*; a day and a time for *before* /
  *after* a moment; two moments for *between* moments. *Blank* and *not blank* show no field.
- The calendar reads in the grid's language, its digits (Latin, or the locale's own with
  `numerals: 'locale'`) and the Gregorian calendar, right to left in Arabic.
- A date-and-time column says in which time zone its days and times are read.
- A time the clocks skip (Paris, 29 March 2026, 02:30) is moved to the first moment that exists,
  with a note saying so; a time that happens twice (25 October 2026, 02:30) takes the first, and two
  buttons (summer / winter) choose the other.
- Escape closes the calendar first, then the popup. Enter in a date's text applies the filter.
- If the calendar cannot be loaded (offline, blocked), the popup says so, with Retry; *blank* /
  *not blank*, Clear and Escape still work and the filter in force stays.

## What DzGrid does
- **The control is tzslot** (owner decisions Q1, Q4: the owner's library, allowed by CLEANROOM):
  `createDateField`, `createRangeField`, `createDateTimeField` of `@tzslot/dom` 2.2.0. No native
  `<input type="date">`. `@tzslot/dom` and `@tzslot/core` (`>=2.2.0 <3`) are **optional peers** of
  `@dzgrid/dom` (and `@dzgrid/angular`): an application with date filters installs them; without
  them a date filter shows the failure message below, no other control.
- **Loaded on first use**, in three kits so a screen pays for what it opens: `date` (day *on*,
  *not on*, *before*, *on or before*, *after*, *on or after*; instant *on this day*), `range` (day
  *between* and its shortcuts; instant *between days* and its shortcuts; instant *between* two
  moments), `moment` (instant *before*, *after*). A kit is fetched with `import()` when a form
  needs it, and prefetched when the pointer goes over a date column's filter button or the focus
  onto its header. A kit that loaded stays (a later popup draws at once); a kit that failed is
  forgotten, so Retry imports it again.
- **Parts:** `filter.day`, `filter.instant` (a host's part of the same name replaces each). The
  floating row keeps the summary button for these kinds (no inline field: it would load the kit
  with the row).
- **Operators and labels:** day: `equals` *On* (`filter.op.onDay`), `notEqual` *Not on*
  (`notOnDay`), `lt` *Before*, `lte` *On or before*, `gt` *After*, `gte` *On or after*, `between`
  (both ends in), `blank`, `notBlank`; the column's `filter.ops` narrows them, in its order.
  Instant: `onDay` *On this day*, `betweenDays` *Between days*, `before`, `after`, `between`
  (`[from, to)`), `blank`, `notBlank`. A shortcut is no operator of its own: it shows under *between*
  (day) or *between days* (instant), the shortcut pressed (`aria-pressed`).
- **What is stored** (the model's own types, tzslot is only the view): a day as `YYYY-MM-DD`; an
  instant's moment as UTC `YYYY-MM-DDTHH:mm:ss.sssZ`; a range as its two days (day *between*: the
  last day included; *between days*: `day`, `dayTo`); a shortcut as `{op: 'relative', range}`
  (`filter-relative.md`). A day column's range is drawn on UTC midnights only as carriers, its zone
  hidden from the field's summary.
- **The grid's zone, never the machine's:** every field gets `timeZone` (the grid's, UTC unless
  set) and `today` (from the grid's `clock` in that zone), so a browser in Auckland filtering a Paris
  grid picks Paris days. The zone is written above an instant's field (`filter.zone` and the
  identifier in its own `<bdi>`).
- **Locale:** `intlTag(ctx)`: the grid's locale with `-u-ca-gregory-nu-latn` (or the locale's
  digits with `numerals: 'locale'`), so `ar-SA` stays Gregorian. tzslot's words: its `EN`, `FR` or
  `AR` by the language, else English; `filters({ dateMessages: { es: … } })` gives others or
  overrides them. The shortcut labels are tzslot's.
- **Settings always passed:** `ariaLabel` and `title` (`filter.date`, `filter.dateTime`,
  `filter.period`, also the field's visible label), `readingStyle: 'named'`, no buttons under the
  calendar, the range not clearable and not confirmed (Clear and Apply are the popup's),
  `injectStyles: false`, `container` = a node inside the popup (the panel stays in the top layer,
  with the popup's `dir`, owner and theme). Bounds: days 0001-01-01 to 9999-12-31; moments from 1900.
- **Live or draft:** in the browser a picked day or period applies at once, a typed moment after the
  pause; on a server nothing is sent before Apply or Enter (one request). An incomplete period (one
  end), a moment cleared, or a field not loaded yet keeps the filter in force (lead decision L1).
- **The echo:** writing a filter into a field never reports it back (the adapters mute tzslot's
  `onChange` around their own writes; the range field reports a shortcut handed to it). A filter from
  elsewhere rewrites a field not being edited.
- **Uneditable:** a day outside 0001–9999, a moment that is not a whole minute or before 1900, an
  operator not offered, a shortcut name not among the six: the summary and Clear.
- **Loading** (owner Q7): `<p role="status">` `filter.loadingDates`, `aria-busy` on the field's
  box, no focus moved when the kit arrives (the popup's focus stays on the operator). Closed before
  it arrives: nothing is mounted.
- **Failure:** `<p role="alert">` `filter.loadFailed` and a Retry button (`grid.retry`); the error is
  reported (`reportError`). A kit whose module does not export `adapt` is a failure too. Chrome does
  not fetch a failed `import()` again (spike S13): the text says to reload the page; a host that
  serves its own chunks passes `filters({ loadDates })`.
- **Keys:** tzslot closes its panel on Escape from a `document` listener, which our popup's own
  Escape would pre-empt: a capture listener on the field's box closes an open panel and stops the
  event, so the first Escape closes the calendar (focus back on its trigger), the second the popup
  (T8 would remove this). Enter inside a panel is the panel's (the popup does not apply); Enter in a
  typed moment applies. Tab inside a panel stays there (tzslot's trap); the popup's own trap wraps
  at the operator and Apply only, never at a date trigger. A pointer down outside closes the panel,
  not the popup (O7). Closing the popup destroys the widgets: no panel is left behind.
- **Names** (label in name, WCAG 2.5.3): tzslot names a date field's trigger by its subject only
  (T1) and its month title by its action (T9): DzGrid adds the text each shows ("Date, 29 Mar 2026",
  "Choose month, March 2026"), kept up as tzslot repaints. The typed moment is a `combobox` that
  controls the panel's place (T10: tzslot gives a plain text box `aria-expanded`).
- **A day that never was** (Samoa, 2011-12-30): tzslot 2.2.0 reads its times as repeated, on the
  day before and the day after (T7, found by the agreement sweep); the moment fields grey such a
  day, so it can be neither picked nor typed. *On this day* keeps an empty day (the core's rule).
- **Another month's days** are not faded inside a DzGrid popup: tzslot's 0.35 opacity falls under
  4.5:1 (T11).
- **The open calendar covers the popup's footer** (it is drawn over the popup, under its trigger):
  Escape, or a pointer down elsewhere, closes it first; then Apply.
- **CSP:** tzslot injects some of its sheets whatever `injectStyles` says (spike S13 finding 7):
  DzGrid injects tzslot's exported sheets itself before the first widget, once per document or
  shadow root, each as `<style data-tzslot="<id>">` with the grid's `nonce`, so tzslot finds them and
  adds none. With `injectStyles: false` the host loads them itself, with the same `data-tzslot` ids.
- **Theme:** the panel takes `--tz-bg`, `--tz-fg`, `--tz-border` inside a DzGrid popup (the dark
  theme reaches it); the chosen day stays visible in forced colours (`Highlight`).
- **The two engines agree:** the core (rows, wire) and tzslot (what is shown) both read the zone
  data through `Intl`; `tzslot-agreement.test.ts` sweeps 13 zones, 2010–2030, every minute of every
  clock-change day, the day starts and the six shortcuts. If they ever differ, the core decides what
  is filtered and sent, tzslot what is shown, and the sweep fails first. It found one difference
  (T7, Samoa's lost day), recorded there and worked around.
- **Midnight:** while a shortcut is in force (alone or in a combined filter), the filters feature
  calls `kernel.tick()` at the next midnight in the grid's zone (and when the page becomes visible
  again), so an open screen moves to the new day (`filter-relative.md`).
- **Sizes** (step 14 part B): the eager part in `@dzgrid/dom/filters` (forms, loader, notes,
  prefetch, midnight), the lazy adapters apart (DzGrid's code only, budget 2 600 B gz), tzslot's own
  share of each kit recorded (`size-budget.json`, `without`). Requests to tzslot:
  `docs/tzslot-requests.md`.

## Tests
- `packages/dom/test/filters-dates.test.ts` (real tzslot under jsdom: loading, prefetch, failure and
  Retry, each operator to the model, the zone, DST, shortcuts, locale tag, keys, CSP, keys parity),
  `packages/dom/test/tzslot-agreement.test.ts`, the date steps of `filters-popup-walk.test.ts`,
  `structure.test.ts` (tzslot only under `filters/dates/`).
- Browser: `scripts/browser.mjs` (`filters=1&popup=1&dates=1`, fr light Europe/Paris, ar right to
  left dark); spike `spikes/s13-tzslot` (the panel in the top-layer popup, Escape, Tab, locale tag,
  an aborted chunk).
- By ear: `docs/a11y-protocol.md` §10.
