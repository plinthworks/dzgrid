# Requests for tzslot (found on 2.2.0; reviewed against 2.4.0 on 2026-10-26; DzGrid on 2.4.0 since 2026-10-27), from DzGrid's date filters (step 14)

For the owner of tzslot. Nothing here blocks DzGrid: each item has a workaround in our lazy kits
(`packages/dom/src/filters/dates/`), to remove once tzslot ships the fix. Paths are in
`~/Dev/tzslot/packages`. Found by the plan (`docs/phase-3-steps/step14-tzslot-blueprint.md` §6),
spike S13 (`spikes/s13-tzslot/README.md`) and the tests of step 14 part B.

| # | What is wrong | Where | What DzGrid does meanwhile |
|---|---|---|---|
| **T1** (a11y, first) | The date field's trigger is named by its subject only ("Date"): the chosen date is not in its name, so a screen reader never says it. The range field does it right ("subject, value"). | `dom/src/date-field.ts:166`; same in the date-and-time field's button mode, `dom/src/datetime-field.ts:676` (compare `dom/src/range-field.ts:2112`) | `named()` (`dates/shared.ts`): a MutationObserver gives every named button the text it shows ("Date, 29 mars 2026"), kept up as tzslot repaints. |
| **T2** | No `nonce` option, and `injectStyles: false` does not stop every sheet: each opened panel injects `field`, the date-and-time panel `datetime`, `calendar`, `time`, the period panel six sheets, unconditionally. A strict CSP blocks them. | `dom/src/panel.ts:255`; `dom/src/datetime-field.ts:839-841`; `dom/src/range-field.ts:2183-2188`; `dom/src/styles.ts:1426` (`ensureStyles`) | We inject tzslot's exported sheets ourselves, before the first widget, each as `<style data-tzslot="<id>" nonce>`: `ensureStyles` finds the id and adds none. Ask: honour `injectStyles: false` everywhere, and take a `nonce`. |
| **T3** (size, ~23 kB gz) | The Temporal polyfill is a static import, bundled even where Temporal is native (Chrome 155 has it). | `core/src/temporal.ts:29` | Nothing: the kits are lazy, so only a screen that opens a date filter pays it (date kit 36.4 kB gz with tzslot, all three 65.0 kB). Ask: a native-only entry, or the polyfill behind `import()`. |
| **T4** | `formatWith` writes Latin digits only, while the read-only fields format with Intl: with `numerals: 'locale'` in Arabic the two disagree. | `dom/src/format.ts:38` | Nothing yet: our typed moment follows tzslot (Latin), the read-only fields show the locale's digits (`-u-nu-arab`). Noted in `filter-date-picker.md`. |
| **T5** (note) | Widgets default `timeZone` and `today` to the machine's (`Temporal.Now`). Easy to get wrong in a grid whose zone is not the machine's. | `dom/src/date-field.ts:104`; `dom/src/datetime-field.ts:206,235`; `dom/src/range-field.ts:479,513` | We always pass both (the grid's zone, today from the grid's clock); tested under `TZ=Pacific/Auckland`. |
| **T6** | The period summary always prints the zone ("5 j · UTC"): wrong for a day column, which has no zone (we draw it on UTC midnights). | `dom/src/range-field.ts:2051` | `messages.periodSummary: ({ length }) => length` on day columns. Ask: a `showZone` setting. |
| **T7** (found by the agreement sweep) | `resolveWallTime` calls every time of a day that never existed (Samoa, 2011-12-30) *repeated*: its two readings are on the day before and the day after, because `keepsItsFace` compares the clock face, not the date. The field would then take a moment on the 29th. | `core/src/slots.ts:129-134` | `isDateDisabled` greys a day whose zone length is zero (`lost()` in `dates/shared.ts`) for the moment fields, so it can be neither picked nor typed; `tzslot-agreement.test.ts` records the divergence and fails when it is fixed. |
| **T8** | The panel's Escape is a `document` listener that neither stops nor prevents the event: a host dialog around the field (our popup, a modal) closes too, or, as with our popup's own handler, closes first and tzslot never hears it. | `dom/src/panel.ts:262-268` | A capture `keydown` on the field's box: an open panel is closed, the event stopped; the next Escape closes our popup. Ask: `capture: true` and `stopPropagation()` when it closes a panel. |
| **T9** (a11y, found by axe) | The month title button is named by its action ("Choisir le mois") without the month it shows ("mars 2026"): axe `label-content-name-mismatch` (WCAG 2.5.3). | `dom/src/calendar.ts:372`; `dom/src/date-range.ts:361` | `named()` adds the shown text: "Choisir le mois, mars 2026". |
| **T10** (a11y, found by axe) | The typed date-and-time field is an `<input>` with `aria-expanded` and `aria-haspopup="dialog"` but no role: `aria-expanded` is not allowed on a text box (axe `aria-allowed-attr`). | `dom/src/datetime-field.ts:286`, `:675` | `role="combobox"` and `aria-controls` (the panel's container) on that input (ARIA 1.2's editable combobox with a dialog). |
| **T11** (a11y, found by axe) | Another month's days are faded with `opacity: 0.35`: their text falls under 4.5:1 (axe `color-contrast`), worse on a selected start or end. | `dom/src/styles.ts:98-99`, `:433`, `:504` | The theme sets `--tz-cal-outside-opacity: 1` inside a DzGrid popup. Ask: a muted colour that keeps 4.5:1 instead of an opacity. |

**Status against tzslot 2.4.0 (CHANGELOG read 2026-10-26):** T3 is addressed by `@tzslot/core/lazy` (2.3.0) and `@tzslot/dom/lazy` (2.4.0) — DzGrid can adopt them when it moves to 2.4.0. T1, T2, T4, T6–T11 are not mentioned in the 2.3.0/2.4.0 notes: presumed still open, to be confirmed by removing each workaround behind its test. T5 is a note. DzGrid still pins 2.2.0.

## Feedback pass (2026-10-27): DzGrid on tzslot 2.4.0

**DzGrid now pins `@tzslot/core` and `@tzslot/dom` 2.4.0** (devDependencies, exact; `npm view` on 2026-10-27: 2.4.0
is the latest of both) and asks `>=2.4.0 <3` as its optional peers (`@dzgrid/dom`, `@dzgrid/angular`).

| # | State on 2.4.0 (what the published package does) | DzGrid |
|---|---|---|
| **T3** | **Fixed**: `@tzslot/dom/lazy` (no polyfill bundled). | **Adopted.** The kits and the editors' calendar import `@tzslot/dom/lazy` / `@tzslot/core/lazy`; each chunk exports `ready` (`loadTemporal()`), awaited by DzGrid's loader before the chunk is used. Measured: the shared tzslot chunk 66 491 → 32 847 B gz; the first use of a date kit 66 962 → 33 317 B gz (Chrome with a native Temporal fetches no polyfill; Safari fetches it as a chunk of its own). |
| **T6** | Open in 2.4.0 (`showZone` is on tzslot's main, unreleased). | **No workaround left**: the period is the popup's own form since feedback pass K (no range field, no summary). The `periodSummary` override is gone with `createRangeField`. |
| **T8** | Open in 2.4.0 (the panel's Escape is still a bubbling `document` listener, `panel.js` 2.4.0 l. 206; the capture and stop are on main, unreleased). | Kept for the date and moment fields (the capture on `.dzg-fdate`); **gone for the period** (no panel, so no second Escape). |
| **T2** | Open in 2.4.0 (`ensureStyles` still unconditional in the panel; `setStyleNonce` is on main, unreleased). | Kept: DzGrid injects the sheets first, marked, with the nonce (`styles()`); the period form's own layout sheet rides with them (`dzg-period`). |
| **T11** | Open in 2.4.0 (`opacity: var(--tz-cal-outside-opacity, 0.35)`). | Kept, widened: `--tz-cal-outside-opacity: 1` on `.dzg-popup` (the panel and the period form's calendar). The browser checks found it: the inline calendar's neighbouring days at 2.05:1 under axe until the theme rule covered it. |
| **T1, T9** | Open in 2.4.0 (on main, unreleased). | Kept: `named()` (the trigger's date, the month title's month; the period form's calendar too). |
| **T4** | Open in 2.4.0 (on main, unreleased: « a typed field and a read-only one wrote different figures »). | Nothing to do on our side: with `numerals: 'locale'` in Arabic the calendar writes Latin day numbers and names the days in Arabic-Indic: axe `label-content-name-mismatch` on the day cells. The browser check (`--only dates`, ar-EG) records that state and will fail, to be updated, when tzslot ships. |
| **T7** | Open in 2.4.0 (`keepsItsFace`, `core/slots.js`). | Kept: `lost()` greys the day for the moment fields and the period between two moments; `tzslot-agreement.test.ts` still records the divergence. |
| **T10** | Open in 2.4.0. | Kept (`role="combobox"` on the typed moment). |
| **T5** | A note. | Unchanged: the grid's zone and today always passed. |

**Every fix the owner listed (T2 nonce, T6 showZone, T8 Escape, T11 neighbouring months), and T1, T4, T7, T9, are on
tzslot's main branch, under « Unreleased » in its CHANGELOG (commits of 2026-10-26), not in 2.4.0, which is the latest
on npm.** DzGrid cannot remove those workarounds against 2.4.0: each one's test still holds against the published
package (the browser and jsdom suites ran on 2.4.0). Next step, for the tzslot session: release 2.5.0; then DzGrid
moves its pin and peer floor to it and removes T1, T2, T4's note, T7, T8, T9, T10, T11 behind their tests.

When one is fixed in a tzslot release: raise the peer range's floor, remove the workaround and its
test's special case, and say so in the CHANGELOG.

## The owner's third look (2026-10-27): the typed date field's width

| # | What is wrong | Where | What DzGrid does meanwhile |
|---|---|---|---|
| **T12** | The typed date field's input is `width: 8.5rem; flex: 0 1 auto` inside its box (`.tz-dateinput__row`). When the box is wider (a form that stretches it, here DzGrid's period form at 18rem and more), the input covers half the box: the focus ring an app draws on the input then draws a box inside the box (the owner: « I don't understand why the input covers half the field »). The box already shows the focus (`.tz-dateinput__row:focus-within`). | `dom/src/styles.ts`, `DATEINPUT_CSS` (2.4.0: `styles.js` l. 965–977) | The period form undoes it outside the layer: `.dzg-fends .tz-dateinput__input{flex:1;width:0}` (the input fills its box); the theme rings the box (`.dzg-fpop .tz-dateinput__row:has(:focus-visible)`), never the input. Tests: `packages/dom/test/owner-look-3.test.ts`, `packages/theme/test/owner-look-3.test.ts`. Ask: the input `flex: 1 1 8.5rem; min-width: 0` (its 8.5rem a basis, not a width), or a `--tz-dateinput-width` custom property; and say in the docs that the box, not the input, carries the focus. |
