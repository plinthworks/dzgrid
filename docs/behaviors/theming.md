# Theming and the showcase themes

Written before the code (clean room). Plan: `docs/phase-5-steps/themes-plan.md`; the owner's answers
T1–T7 in `docs/phase-5-steps/decisions.md` (« Showcase themes ») win over the plan. Sources: public
documents only — CSS Cascading and Inheritance Level 5 (https://www.w3.org/TR/css-cascade-5/), MDN
`@layer` (https://developer.mozilla.org/en-US/docs/Web/CSS/@layer), MDN `light-dark()`
(https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark), MDN `forced-colors`
(https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors), CSS Color 4 for `oklch()`
(https://www.w3.org/TR/css-color-4/#ok-lab), WCAG 2.2 success criteria 1.4.3 and 1.4.11
(https://www.w3.org/TR/WCAG22/). Tailwind and Bootstrap pages are read for the bridges (a later part).
No grid library's or CSS framework's source is read, `node_modules` included.

## What the person does
- An application developer imports the theme, and maybe one of the two showcase themes, and changes a
  handful of colours to match their brand.
- They put their own classes on cells (Tailwind utilities, Bootstrap helpers, their own CSS) and expect
  those to win over the grid's look without `!important`.
- A user reads the grid in light or dark (system or `data-theme`), with more contrast if they asked, in
  forced colours (Windows High Contrast), left to right or right to left (Arabic).

## What they observe
- **One import, a presentable grid.** `@dzgrid/theme` alone gives tzslot's palette, light and dark.
- **A showcase theme by one more import.** `@dzgrid/theme/midnight.css` (dark elegant, with a light twin)
  or `@dzgrid/theme/clinic.css` (light medical, with a dark twin) restyles every grid of the page. The same
  file also styles only one area: `data-dzg-skin="midnight"` (or `"clinic"`) on any container, so a page can
  show both side by side. Importing both: the last one imported themes the page; each area keeps its own.
- **Light and dark still work the same way**: each theme gives both, by the system or `data-theme`.
- **The application's classes win.** A class the app puts on a cell (through `ui.cellClass`) or on its own
  container beats the grid's look, whatever its specificity, without `!important`, because the grid's CSS
  sits in a cascade layer and the application's (unlayered, or in a later layer) comes after it.
- **More contrast wins over a showcase theme** when the user asks for it (`prefers-contrast: more` or
  `data-contrast="more"`), in a themed area too.
- **Forced colours**: the system's colours replace the theme's; every state keeps a mark that is not colour
  alone (the ticked box, the selection bar drawn in `Highlight`, a badge's shape).
- **Arabic**: no letter spacing in headers (it breaks the joining of letters), by the language (`:lang(ar)`)
  or by a right-to-left grid (`:dir(rtl)`: Persian, Urdu, an Arabic grid in a page of another language); every side is logical, so the
  selection bar sits at the row's start: left in French, right in Arabic.

## What DzGrid does
- **The cascade layer** (T1). Every rule of the grid lives in a sub-layer of one top-level layer `dzgrid`.
  Each theme file opens with the same order statement:
  `@layer dzgrid.layout, dzgrid.theme, dzgrid.skin, dzgrid.bridge, dzgrid.contrast;`
  so, inside the grid: the injected layout < the base theme < a showcase theme < a framework bridge < more
  contrast. The layout `@dzgrid/dom` injects (the base's and each feature's: tree, detail, filters, value
  list, pagination, spans) is wrapped in `@layer dzgrid.layout { … }`, in the `<style>` it injects (with or
  without a nonce, in the document or a shadow root) and in the exported `LAYOUT_CSS` an application with
  `injectStyles: false` loads itself. Its `:where()` stays: zero specificity inside the layer too.
- **Where the layer sits among the application's layers** is decided by where `dzgrid` first appears. An
  application that layers its own CSS names the order once, before everything, e.g. with Tailwind 4:
  `@layer theme, base, dzgrid, components, utilities;`. Without that line, `dzgrid` lands where the theme file
  is imported; unlayered application CSS always wins over it.
- **In a shadow root** the layer order is the shadow tree's own, and the `<style>` the grid injects comes
  before the sheets the application adopts there: `dzgrid` would then be the shadow tree's first layer, the
  lowest, under, say, Tailwind 4's `base`. The application names the order there first, either with a
  `<style>` holding its order line (`@layer theme, base, dzgrid, components, utilities;`) put in the shadow
  root before the grid mounts, or with `injectStyles: false` and its adopted sheets in order: the order line,
  its framework, then `LAYOUT_CSS` and the theme (a browser test does both).
- **`!important` stays out of the layer.** The layout's few `!important` declarations (the spans' full-width
  row) stand after the layer, outside the layer: inside one they would beat every unlayered `!important`, so an
  application could no longer override them as it could before.
- **The unlayered copy** (T1). An application whose reset is unlayered (Tailwind 3's preflight, Bootstrap's
  Reboot) would beat the layered grid. For it, `@dzgrid/theme/dzgrid.unlayered.css` and
  `@dzgrid/theme/contrast.unlayered.css` carry the same rules outside the layer. Only their palette blocks
  (the `--tz-*` colours on `:root`, and more contrast's) stay in their layer, so a showcase theme or a bridge,
  layered, still replaces them in order. A showcase theme needs no copy: it only sets variables and adds
  rules of its own, which no reset overrides. The injected layout stays layered (its `:where()` rules lose to
  any reset anyway; apps in that setup already style what a reset removes).
- **One exception: tzslot's date panel.** tzslot's sheets (the date filters' calendar) are tzslot's own and
  unlayered, so the theme's three rules that restyle tzslot's panel (its surface, another month's days in the
  muted colour — tzslot gives its days `color: inherit` — and the chosen day in forced
  colours) stay unlayered beside them, or they would lose; so does the filters' one rule fitting tzslot's
  field into the popup (after the layer in `FILTERS_CSS`). They name only tzslot's classes, inside a grid's
  popup.
- **The tokens.** Nothing is renamed: the ten `--tz-*` colours are a contract shared with tzslot and
  DzCalendar. Two new shape knobs, read at their point of use with a fallback, never declared by the base on
  `:root`: `--dzg-line` (the width of the grid's rules: frame, cell rule, group rule, footer, popup, value
  list, detail rule; default `1px`) and `--dzg-pill-radius` (a badge's corners; default `1em`, today's look).
  Two colour names reserved for Phase 5's save states, checked for contrast now so a theme never needs
  changing when they are drawn: `--dzg-saving-color` (the running border while a value saves, Q10; default
  the accent) and `--dzg-refused-color` (the 0.5 s refusal blink, Q9; default the danger colour).
- **A showcase theme gives every colour by hand** (T2): the ten `--tz-*` colours, each a `light-dark()` pair,
  nothing computed from the main four. It may also set the shape knobs (`--dzg-radius`, `--dzg-pill-radius`,
  `--dzg-line`, `--dzg-cell-padding-inline`, `--dzg-font`). It lives in `dzgrid.skin`, declared on
  `:root, [data-dzg-skin="<name>"]`. No font file, no image: system font stacks that end with fonts that
  carry Arabic.
- **Midnight**: midnight blue surface, soft blue rules, a cool blue accent; radius `.75rem`, pills fully
  round, cell padding `.75rem`; headers `.8125rem`, weight 600, letter spacing `.02em` (`0` in Arabic); a
  selected row also carries a 2 px bar in the accent at its inline start (in `Highlight` under forced colours;
  `HighlightText` with `contrast.css`, whose selected row is `Highlight`).
- **Clinic**: white, teal-blue accent, airy; radius `.5rem`, pills fully round, cell padding `.875rem`. The
  row height is a setting (`density: 'spacious'` in its demos), not CSS: it feeds the virtualisation.
- **Contrast**: every pair of `contrast-pairs.json` (text 4.5:1, parts 3:1) holds for each theme, light and
  dark — pills, focus ring, selected row, the saving border, the refusal colour included. `npm run
  check:contrast` checks the base palette and both showcase themes as shipped (read from their CSS); a
  hand-written fixture per theme (`packages/theme/test/fixtures/<name>.json`) pins the values.
- **More contrast** (`contrast.css`, layer `dzgrid.contrast`) declares its palette on the root and on every
  `[data-dzg-skin]` area (in a shadow root too, unless the page opted out), so it wins in a themed area too.

## Where DzGrid differs on purpose
- Themes as **variables plus a few rules in a layer**, not a set of classes to put on the grid: the grid's
  look follows the page (`data-theme`, an area's attribute) and the application's classes always win.
- **No computed secondary colours** (owner, T2): a theme's author sees and checks every colour.
- More contrast is a layer above the showcase themes: a person's need beats a brand.

## Tests
`packages/theme/test/layer.test.ts` (the layer, the copies, the tokens), `packages/theme/test/skins.test.ts`
(Midnight and Clinic), `packages/dom/test/layer.test.ts` (the injected layout), `scripts/test/contrast.test.ts`
(`oklch()`, the skins checked), `scripts/test/rebudget.test.ts` (the T7 ceilings), `npm run test:browser --
--only themes` (layer order, popup, an application class on a cell, a shadow root, each theme light and dark,
French and Arabic, forced colours).
