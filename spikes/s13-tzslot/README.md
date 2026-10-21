# S13 — tzslot 2.2.0 inside DzGrid's filter popup (step 14 part B)

Run: `node spikes/s13-tzslot/run.mjs` (or `npm run spike -- s13`). Chrome, headless, one browser,
closed in `finally`. tzslot (the owner's library, allowed by CLEANROOM) is bundled once for the page
(`build/`, gitignored: two entries, one shared core). Results in `results/result.json`.

2026-10-19, Chrome 155: **23 checks passed, 0 failed.** The jsdom half was run the same day as a
throwaway vitest file (its findings are below; the real tests are `packages/dom/test/filters-dates.test.ts`).

The page uses the real `PopupHost` (`packages/dom/src/popup.ts`): a modal popup in the top layer
(`popover="manual"`), inside a card with `transform`, `overflow: hidden` and `contain: paint`, and
again inside a modal `<dialog>`. Each of the three fields (`createDateField`, `createRangeField`,
`createDateTimeField`) gets `container` = a node inside the popup.

## Findings

1. **The panel inside the top-layer popup works, in a transformed card and in a dialog.** With
   `container` inside the popup, the panel is a descendant of the popover: drawn in the top layer,
   on top under the pointer (`elementFromPoint`), placed by tzslot under its trigger, above it
   when there is no room below, or held 8 px from the window's edge when taller than the room
   (the range field's two-month panel, 635 px). Right to left (ar-DZ), the panel reads `rtl` and
   its right edge is on the trigger's.
2. **Escape: tzslot never hears it without our rule.** Its panel listens on `document` (bubble);
   our popup's own handler sits on the popup element, closes it and stops the event. Measured
   without a rule: one Escape with the panel open closes the whole popup. With a capture
   `keydown` on the form (`field.isOpen` → `close()`, `preventDefault`, `stopPropagation`): the
   first Escape closes the panel, focus back on the trigger inside the popup; the second closes
   the popup. Same for the three fields, in the card and in the dialog. (T8.)
3. **Tab inside an open panel stays there** (tzslot's trap), 40 presses forward and back, three
   fields. The typed moment field keeps the focus in its text when it opens: ArrowDown twice walks
   into the panel (tzslot's design).
4. **Temporal is native in Chrome 155** (`usingPolyfill: false`); the polyfill is bundled anyway (T3).
   Under jsdom (Node 22) the polyfill runs: the real widgets work in the unit tests.
5. **The locale tag.** `ar-SA-u-ca-gregory-nu-latn` writes `29‏/03‏/2026` (Latin digits, RLM marks);
   `ar-EG-u-ca-gregory-nu-arab` writes `٢٩‏/٠٣‏/٢٠٢٦`. `firstDayFor` reads the region through the
   extensions: Sunday for ar-SA, Saturday for ar-DZ, Monday for fr-FR.
6. **An aborted chunk is not fetched again by the same `import()`** (Chrome 155): the first fails
   ("Failed to fetch dynamically imported module"), the second fails at once with no request; the
   same URL with a new query loads. So Retry re-imports, and in Chrome 155 it failed again until the
   page was reloaded. **Update (Chrome 156):** current Chrome fetches a failed `import()` again, so
   Retry loads the kit once the network is back (the browser check asserts it); older engines may
   still keep the failure, so the failure text keeps "reload the page"; a host that bundles tzslot
   its own way passes `filters({ loadDates })` and can bust its URLs itself.
7. **`injectStyles: false` does not stop every sheet** (jsdom and Chrome): `panel.js:190` injects
   `field` into every opened panel, `datetime-field.js:630-632` `datetime`, `calendar`, `time`, and
   `range-field.js:1729-1734` six sheets, unconditionally. `ensureStyles` skips an id already present
   (`style[data-tzslot="<id>"]` in the head or the shadow root). Workaround: DzGrid injects tzslot's
   exported sheets itself before the first widget, each as `<style data-tzslot="<id>" nonce>`, so
   tzslot finds them and adds none (strict CSP holds). Request T2 widened.
8. **`update({ preset })` on the range field reports** through `onChange` (it applies the shortcut);
   `update({ value })` and the single fields' `update` never do. The adapters mute `onChange` around
   their own writes.
9. **The trigger's name lacks the value** on the date field (`aria-label` = the subject only, T1);
   the range field says "subject, value". Clicking a shortcut closes the range panel.
10. **DST in the moment field, as the blueprint read it:** Paris 2026-03-29 02:30 typed → reported
    01:30Z, the text moved to 03:30 with the notice "02:30 n'existe pas ce jour-là"; 2026-10-25 02:30 →
    00:30Z (the first reading) and two buttons "été" (pressed) / "hiver" with `readingStyle: 'named'`.
