# Theming and the showcase themes

Written before the code (clean room). Plan: `docs/phase-5-steps/themes-plan.md`; the owner's answers
T1–T7 in `docs/phase-5-steps/decisions.md` (« Showcase themes ») win over the plan. Sources: public
documents only — CSS Cascading and Inheritance Level 5 (https://www.w3.org/TR/css-cascade-5/), MDN
`@layer` (https://developer.mozilla.org/en-US/docs/Web/CSS/@layer), MDN `light-dark()`
(https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark), MDN `forced-colors`
(https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors), CSS Color 4 for `oklch()`
(https://www.w3.org/TR/css-color-4/#ok-lab), WCAG 2.2 success criteria 1.4.3 and 1.4.11
(https://www.w3.org/TR/WCAG22/). For the bridges (step 5), the frameworks' public pages only:
https://tailwindcss.com/docs/theme, https://tailwindcss.com/docs/colors, https://tailwindcss.com/docs/dark-mode,
https://v3.tailwindcss.com/docs/functions-and-directives, https://v3.tailwindcss.com/docs/customizing-colors,
https://v3.tailwindcss.com/docs/dark-mode, https://getbootstrap.com/docs/5.3/customize/css-variables/ and
https://getbootstrap.com/docs/5.3/customize/color-modes/ (fetched 2026-10-23; Bootstrap's names and values
checked there that day). No grid library's or CSS framework's source is read, `node_modules` included: the
frameworks (Tailwind CSS 4.3.3 and 3.4.19, Bootstrap 5.3.8, root devDependencies, owner T4) are only run.

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
  contrast. The bridge wins over a showcase theme (owner T9): an application using a bridge sees its
  framework's colours; to show Midnight or Clinic, it does not load a bridge. (An area under
  `data-dzg-skin` declares the theme on itself, and a bridge declared on `:root` only reaches it by
  inheritance: the area keeps its theme. Bootstrap's bridge is also declared on every `[data-bs-theme]`
  element: an element carrying both shows Bootstrap's colours.) The layout `@dzgrid/dom` injects (the base's and each feature's: tree, detail, filters, value
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
- **An app with an unlayered reset: use the unlayered copy** (feedback pass A and G, 2026-10-27). Tailwind 3's
  `@tailwind base` (its preflight, `*,::before,::after{border-width:0;border-style:solid}`) and Bootstrap's Reboot
  are unlayered: with `@dzgrid/theme/dzgrid.css` (layered) every border the theme draws is erased (button frames,
  the floating box's edge, the cell rules). Import `@dzgrid/theme/dzgrid.unlayered.css` (and
  `contrast.unlayered.css`) instead: same rules, outside the layer, compared by specificity with the reset's
  universal selector, so they win. Whatever the stylesheet, the grid's own marks no longer depend on a border: the
  pager's arrows are characters in the DOM, the tree, detail and group chevrons characters in `::before`, the
  selection box's edge an outline (`outline: 1px solid var(--tz-fg-muted); outline-offset: -1px`; dashed when
  refused, `CanvasText` in forced colours): an unticked box stays visible under the reset, which it did not (« on ne
  voyait la colonne qu'une fois tout sélectionné »). `scripts/browser-glyphs.mjs` checks it with a stand-in reset.
- **Styling what the popup holds** (feedback pass H, owner Q5). The filter popup is in the browser's top layer
  (`popover`), outside the grid's host: a component's scoped styles (Angular's emulated encapsulation, a CSS
  module) never reach it. Style it from a global sheet; the popup's content carries `data-column` (the column's id)
  and `data-kind` (`text`, `number`, `day`, `instant`, `boolean`, `set`, a custom kind):
  `.dzg-fpop[data-column="price"] { … }`, `.dzg-fpop[data-kind="set"] .pill { … }`. In a layer of the app's
  above `dzgrid` or unlayered. `::ng-deep` is deprecated: use a global sheet or `ViewEncapsulation.None`.
- **`--dzg-row-height` is read-only** (feedback pass F, owner Q4). The grid writes it on its root (inline style) from
  `rowHeight` or the density, and the theme reads it; a stylesheet declaring it loses to the inline value and never
  moves a row (the virtual rows count on the setting). To change the height: `rowHeight` (a number from 24), or
  `density`; in Angular, `[rowHeight]`.
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
  row height is a setting (`density: 'spacious'`, or `rowHeight` in px: virtual-scroll.md « Row height »), not CSS: it feeds the virtualisation.
- **Contrast**: every pair of `contrast-pairs.json` (text 4.5:1, parts 3:1) holds for each theme, light and
  dark — pills, focus ring, selected row, the saving border, the refusal colour included. `npm run
  check:contrast` checks the base palette and both showcase themes as shipped (read from their CSS); a
  hand-written fixture per theme (`packages/theme/test/fixtures/<name>.json`) pins the values.
- **More contrast** (`contrast.css`, layer `dzgrid.contrast`) declares its palette on the root and on every
  `[data-dzg-skin]` area (in a shadow root too, unless the page opted out), so it wins in a themed area too.

- **Bridges** (step 5, T3, T4): `tailwind.css` (Tailwind CSS 4), `tailwind3.css` (Tailwind CSS 3) and
  `bootstrap.css` (Bootstrap 5.3), each one block in `dzgrid.bridge` mapping the ten colours, `--dzg-font`
  (a full `font` shorthand: weight, `0.875rem` and a line height, then the framework's sans family) and
  `--dzg-radius` to the framework's public variables, and following its dark mode. Tailwind 4: its
  `--color-*` variables in `light-dark()` pairs, the accent on the app's `--color-primary-600 / -400` when
  its theme has them, `.dark` for a class-based dark mode; with a class-based dark mode the application adds
  `:root:not(.dark) { --tz-color-scheme: light; }`, or under a dark system and no `.dark` the grid would
  follow the system and turn dark on a light page (review of part 2). Tailwind 3 has no colour variables: `theme()`,
  so the file must go through Tailwind's build. Bootstrap: its `--bs-*` variables, declared on
  `:root, [data-bs-theme]` (Bootstrap's colour mode can be set on any element: the names are resolved there
  again: a `data-bs-theme="light"` container inside a `"dark"` root draws its grid light, and the reverse,
  as Bootstrap's own components do), `--tz-color-scheme` from `data-bs-theme`; the accent is the link's hover colour (Bootstrap's
  primary one shade deeper; the primary itself falls under 3:1 for a mark on a selected row). Each bridge
  passes every contrast pair with the framework's default colours, light and dark.
- **What the real builds showed** (browser suite, step 5): Tailwind 4 emits the theme variables a bridge
  reads when the bridge is imported through Tailwind (in the CSS Tailwind builds); linked beside Tailwind's
  output, every colour is lost (the setup pages say so). Without the application's order line, `dzgrid`
  lands after Tailwind's `utilities` and the grid beats them. Tailwind 3 keeps native `@layer` blocks and
  resolves `theme()` inside `light-dark()`. Bootstrap bundled `layer(bootstrap)` or left unlayered (with the
  unlayered copy) both keep the grid's rules and let Bootstrap's `!important` utilities win.
- **Class hooks** (step 6, T5): `ui.cellClass`, `settings.rowClass`, `ui.headerClass`, `badge({ classes })`
  (`cell-class.md`, `badge-boolean.md`); their framework examples in `docs/theme-in-3-lines.md`.

## Where DzGrid differs on purpose
- Themes as **variables plus a few rules in a layer**, not a set of classes to put on the grid: the grid's
  look follows the page (`data-theme`, an area's attribute) and the application's classes always win.
- **No computed secondary colours** (owner, T2): a theme's author sees and checks every colour.
- More contrast is a layer above the showcase themes: a person's need beats a brand.

## Tests
`packages/theme/test/layer.test.ts` (the layer, the copies, the tokens), `packages/theme/test/skins.test.ts`
(Midnight and Clinic), `packages/theme/test/bridges.test.ts` (the bridges' mappings, scopes, dark mode,
contrast with each framework's defaults: `test/fixtures/{tailwind4,tailwind3,bootstrap}-defaults.json`),
`packages/theme/test/docs.test.ts` (the setup page quotes what the browser builds), `packages/dom/test/layer.test.ts` (the injected layout), `scripts/test/contrast.test.ts`
(`oklch()`, the skins checked), `scripts/test/rebudget.test.ts` (the T7 ceilings), `npm run test:browser --
--only themes` (layer order, popup, an application class on a cell, a shadow root, each theme light and dark,
French and Arabic: its ten colours, no horizontal overflow, the focus ring; forced colours for both; the
right-to-left checks in Firefox and WebKit with `--all`; then each framework setup built by the real tool,
`scripts/frameworks.mjs`).

## Phase 5 step 4: `edit.css`
`@dzgrid/theme/edit.css` (and `edit.unlayered.css`, source `edit.scss`), loaded after the theme by the applications that edit (owner S4-O2): the save marks, the running border, the refusal blink, the muted row and the reapply button, in `dzgrid.theme`. Reserved colours `--dzg-saving-color`, `--dzg-saved-color` (new, `--tz-success` by default), `--dzg-refused-color`; a showcase theme or a bridge colours them through the palette.
