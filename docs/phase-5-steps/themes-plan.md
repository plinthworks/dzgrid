# Showcase themes and the customisation story (architect's plan, 2026-10-23)

Inserted after Phase 5 step 2, before step 3 (`showcase-plan.md`, item 1). Plan only: no code, test,
budget or config change was made. The owner's answers to the questions at the end go into
`decisions.md`; budgets go into `size-budget.json` only after them.

Read for this plan: `CLAUDE.md`, `CLEANROOM.md`, `docs/STATUS.md`, `showcase-plan.md`, `decisions.md`,
`packages/theme/*` (scss, css, contrast.css, tailwind.css, contrast-pairs.json, tests, fixtures),
`scripts/check-contrast.mjs`, `packages/dom/src/styles.ts`, `core/src/columns/defs.ts` (`ui`),
`docs/behaviors/cell-class.md`, the badge part, ARCHITECTURE §3.11 and the step-26 decisions, the
Phase 5 plan (D6, D7, D9), `size-budget.json`, the playground's theme switch. Public docs only for the
frameworks: tailwindcss.com/docs/preflight and /docs/theme (fetched 2026-10-23); Bootstrap 5.3's
"Color modes" and "CSS variables" pages (getbootstrap.com returned 503 today: the Bootstrap facts below
are from prior knowledge of those public pages and **must be re-checked against them at step 5**, with
the URLs cited in the sheet). No framework or grid source was read, `node_modules` included.

## 0. What exists today (facts)

- **Palette**: ten shared colours `--tz-bg`, `--tz-bg-raised`, `--tz-fg`, `--tz-fg-muted`, `--tz-border`,
  `--tz-accent`, `--tz-accent-fg`, `--tz-danger`, `--tz-warning`, `--tz-success`, each a `light-dark()` pair
  on `:root` (tzslot's values; `theme.test.ts` pins them). Light/dark follows the system, or
  `data-theme` on any ancestor (`--tz-color-scheme` → `color-scheme` on `.dzg`).
- **Own knobs** `--dzg-*`, read at the point of use with a palette fallback (never on `:root`, a test
  forbids it): `--dzg-font`, `--dzg-radius`, `--dzg-cell-padding-inline`, `--dzg-header-bg`,
  `--dzg-row-hover-bg`, `--dzg-row-selected-bg`, `--dzg-focus-ring`, `--dzg-stale-fg`, `--dzg-toggle-fg`,
  `--dzg-context-fg`, `--dzg-detail-bg`, `--dzg-refused-bg`, `--dzg-flash(-color)`, `--dzg-target-min`.
  `--dzg-row-height` is an **output** (the JS `density` setting writes it; ARCH §3.7).
- **contrast**: `contrast-pairs.json` (88 pairs, × light/dark = 176 checks), `derived` map,
  `check:contrast -- --palette file.json`. The script reads hex/rgb only (no `oklch()`).
  `contrast.css`: `prefers-contrast: more` / `data-contrast`, forced colours.
- **`tailwind.css`** (v4 bridge) exists: `:root` maps `--tz-*` to `--color-zinc-*`, `--color-primary-*`
  (blue fallback), red/amber/green; `--dzg-font: var(--font-sans)`, `--dzg-radius: var(--radius-md)`;
  `.dark { --tz-color-scheme: dark }`. No Tailwind 3 or Bootstrap bridge (ARCH lists `tailwind3.css`, never made).
- **Cascade**: nothing is layered. The DOM injects `LAYOUT_CSS` (unlayered, all `:where()`, zero
  specificity) into the document or the grid's shadow root, with an optional `nonce`, or not at all
  (`injectStyles: false`). The theme is unlayered, selectors of 0,1,0 to 0,3,0.
- **Classes the app can give**: only `columns[].ui.cellClass(ctx)` (diffed, `dzg-` tokens ignored).
  No row class, no header class. Badges take a tone (`data-tone`), not a class. The host element is
  the app's own, so classes and variables on it reach the grid by inheritance.
- **Sizes** (gzip -9 of the files as they are, not the measured minified figure): `dzgrid.css` 2 545,
  `contrast.css` 877, `tailwind.css` 527. Budget `@dzgrid/theme` 2 500, granted 2 900 for Phase 5 (Q16).

## 1. The main tokens: a theme is a handful of variables

No colour is renamed: the `--tz-*` palette is a contract shared with tzslot and DzCalendar. The plan
**sorts** what exists into two tiers and adds three small knobs.

| Tier | Token | Status | Drives |
|---|---|---|---|
| main | `--tz-accent` | exists | focus ring, selection tint, hover tint, ticked boxes, info pills, flash, saving ring |
| main | `--tz-bg` | exists | surface; every tint is mixed into it |
| main | `--tz-fg` | exists | text |
| main | `--tz-border` | exists | grid frame, cell rules |
| main | `--dzg-radius` | exists | grid corners, buttons, fields, popups |
| main | `--dzg-font` | exists | the `font` shorthand of the grid |
| main | `density` (setting) | exists | row height 28/32/40 px (JS, not CSS: it feeds the virtualisation) |
| new | `--dzg-line` | **new** | rule width (default `1px`; "thin lines" themes keep 1px but soften the colour) |
| new | `--dzg-pill-radius` | **new** | badge/pill corners (default `1em`, today hard-coded: no visual change) |
| second | `--tz-bg-raised`, `--tz-fg-muted`, `--tz-accent-fg`, `--tz-danger`, `--tz-warning`, `--tz-success` | exist | header/footer/detail surfaces, secondary text, text on accent, states |
| Phase 5 slot | `--dzg-saving-color` (→ `--tz-accent`), `--dzg-refused-color` (→ `--tz-danger`) | **new names, reserved now** | the running border while saving (Q10) and the 0.5 s red blink (Q9) |

All new names follow the existing rule: read at the point of use, `var(--dzg-x, <fallback>)`, never on `:root`.

**The secondary tier is the catch.** A theme that sets only the four main colours keeps tzslot's zinc
`--tz-bg-raised` / `--tz-fg-muted`, which clash with, say, a midnight-blue surface. Three ways out
(owner question T2): write all ten (today's contract, what the two showcase themes do anyway);
derive the three neutral ones (`bg-raised`, `fg-muted`, `accent-fg`) from the main ones inside a theme's
own scope with `color-mix()` (checked by `check:contrast`, which already reads `color-mix`); or derive them
in the base `:root` (changes tzslot's exact default values: breaks parity and `theme.test.ts`).
Bridges make the question moot for framework users: they map all ten.

## 2. The cascade layer

### Shape
- Every rule of `dzgrid.css`, `contrast.css`, the showcase themes and the bridges lives in **sub-layers
  of one top-level layer `dzgrid`**. Each file starts with the same statement:
  `@layer dzgrid.layout, dzgrid.theme, dzgrid.skin, dzgrid.bridge, dzgrid.contrast;`
  so inside the grid: layout < base theme < showcase skin < framework bridge < more-contrast.
- The DOM's `LAYOUT_CSS` is wrapped in `@layer dzgrid.layout { … }` (same string for the injected
  `<style>`, with or without nonce, in a shadow root, and for the exported string an app with
  `injectStyles: false` loads itself). Its `:where()` stays.
- Why the layout must move too: an **unlayered** style beats every layered one, whatever the
  specificity. Left unlayered, `:where(.dzg-popup)[popover] { border: 0; padding: 0; background:
  transparent }` would beat the layered theme's popup look (the one real overlap found), and
  `white-space: nowrap` on cells would keep beating a Tailwind 4 `whitespace-normal` (it already does today).
- Where `dzgrid` sits among the app's layers is decided by **first appearance**. The app's one line
  (the "3 lines" pages give it) puts it after resets and before utilities, e.g. with Tailwind 4:
  `@layer theme, base, dzgrid, components, utilities;` before `@import "tailwindcss";`. Without that line,
  `dzgrid` lands where the theme file is imported.

### Risks, checked one by one
| Risk | What happens | Answer |
|---|---|---|
| Unlayered app CSS | always beats the layered grid — wanted for the app's classes, unwanted for **resets**: Tailwind 3 preflight (`* { border-width: 0 }` style, unlayered in v3) erases every grid rule and padding; Bootstrap 5.3 Reboot (unlayered) resets `button`/`select`/`input` corners and fonts in the footer and filters | keep an **unlayered copy** for those setups (owner question T1), or the app layers its framework (`@import "bootstrap.css" layer(bootstrap)` with `@layer bootstrap, dzgrid;`); the "3 lines" pages say which |
| Tailwind 4's own layers | its `@import "tailwindcss"` declares `theme, base, components, utilities` (public docs); preflight is in `base` | `dzgrid` must come after `base` and before `utilities`: the order line above. If `dzgrid` is declared after `utilities`, the grid beats utilities again: a browser test pins both orders |
| Bootstrap | unlayered; its utilities carry `!important`, so they win over a layered or unlayered grid alike | `!important` in a layer reverses the layer order: a Bootstrap utility made `!important` still wins over our normal declarations. Fine; tested with a hand fixture |
| Shadow roots | layer order is per tree; the document's order never reaches inside | the grid's layout is already injected into the shadow root; the app adopts the theme there too (`adoptedStyleSheets` accepts `@layer`, not `@import`); the leading statement in each file keeps our sub-layer order. Browser test with a shadow host |
| CSP nonce | layers change nothing for CSP; the wrapper is inside the nonce'd `<style>` | `injectStyles: false` apps load the exported `LAYOUT_CSS`, which now carries its wrapper; a test compares the two |
| Order of layers | the injected `<style>` is often the **first** place `dzgrid.layout` appears at runtime if the app imports no theme | the layout's rules have zero specificity and never conflict with the app; and the theme file, when present, has declared the order first |
| Browser floor | `@layer`: Chrome 99, Firefox 97, Safari 15.4 | below the floor `light-dark()` already sets (Chrome 123, Firefox 120, Safari 17.5): nothing new |
| `@property` (saving ring) | not affected by layers | — |
| Tests reading the CSS | `paletteFromCss` takes the first `:root {}`; regex tests on rules | still match inside a layer block; checked at step 2 |

## 3. Bridges: tiny optional files

Each bridge maps the ten `--tz-*` (and font, radius) to the framework's public variables, lives in
`dzgrid.bridge`, and follows the framework's dark mode. **Scope rule**: a variable that names another is
frozen where it is declared, so a bridge declares on `:root` only when the framework's variables are
root-only (Tailwind); otherwise on `:root, [data-bs-theme]` (Bootstrap, whose colour mode can be set on
any subtree).

| Bridge | Entry | Maps | Dark mode |
|---|---|---|---|
| Tailwind 4 | `tailwind.css` (exists; keep the name) | `--color-white`, `--color-zinc-*`, `--color-primary-600/-400` (blue fallback), `--color-red/amber/green-*`, `--font-sans`, `--radius-md` | `light-dark()` follows the system (Tailwind 4's default is the media query); `.dark` class → `--tz-color-scheme: dark`; a `[data-theme=dark]` variant likewise |
| Tailwind 3 | `tailwind3.css` (new) | the same names through `theme('colors.zinc.900')` etc.: Tailwind 3 has **no colour variables** by default, so the bridge must pass through the app's Tailwind build | `darkMode: 'media'` (default) → `light-dark()`; `'class'`/`'selector'` → `.dark` |
| Bootstrap 5.3 | `bootstrap.css` (new) | `--bs-body-bg`, `--bs-tertiary-bg`, `--bs-body-color`, `--bs-secondary-color`, `--bs-border-color`, `--bs-primary`, `--bs-danger/-warning/-success-text-emphasis`, `--bs-body-font-family`, `--bs-border-radius` (to re-check on the public pages) | Bootstrap swaps its own variables under `[data-bs-theme=dark]`; the bridge only sets `--tz-color-scheme` from that attribute |

Notes found while planning:
- **Tailwind 4 emits only the theme variables it sees used** (tailwindcss.com/docs/theme: "By default
  only used CSS variables will be generated"; `@theme static` forces all). The docs do not say whether a
  `var(--color-zinc-900)` inside an imported file counts. If it does not, today's `tailwind.css` silently
  falls back to nothing. This is a latent bug in the existing bridge and the main reason for a real-build
  test (T4).
- Bootstrap's `--bs-secondary-color` carries alpha (75 %): the contrast script already composites alpha.
  `--bs-focus-ring-color` is a 25 % tint, too faint for 3:1: the focus ring stays on the accent.
- Tailwind 3 alternative: a plugin (`plugins: [require('@dzgrid/theme/tailwind3')]`, a plain function
  using `addBase` and `theme()`, no import of Tailwind) works in every v3 setup, where a CSS file with
  `theme()` needs the app's PostCSS to process an `@import` from `node_modules`. But it is the first
  JavaScript in a "plain CSS" package (owner question T3).

### Testing bridges without reading the frameworks
1. **Mapping tests (node, no install)**: a hand-written table per framework, from its public docs (URL in
   the test's `refs`), lists our variable → their variable and the dark-mode selector. The test parses the
   bridge and checks each line, the scope rule, and that no `--tz-*` is left unmapped.
2. **Contrast of the default palettes (node, no install)**: fixtures `tailwind3-defaults.json`,
   `tailwind4-defaults.json`, `bootstrap-defaults.json` with the frameworks' default colours transcribed
   by hand from their public colour pages (values are facts, not code), run through `check:contrast
   --palette`. Tailwind 4's defaults are `oklch()`: the script needs an `oklch()` reader (~30 lines, own
   tests with values worked by hand).
3. **Cascade fixtures (browser, no install)**: hand-written stand-ins that imitate the **documented**
   behaviour: a Tailwind-4-like stack (`@layer theme, base, components, utilities`, a preflight-like
   `* { border: 0 solid; padding: 0 }` in `base`, a `.bg-x` in `utilities`), a Tailwind-3-like unlayered
   stack, a Bootstrap-like unlayered Reboot plus an `!important` utility and `[data-bs-theme=dark]`
   variables. Checks: the app's class on a cell wins, the grid's rules survive the reset, dark follows.
4. **Real build (needs devDependencies — owner question T4)**: `tailwindcss@4` + its CLI, `tailwindcss@3`,
   `bootstrap@5.3` as devDependencies, only **run** (compile a 3-line file, render in Chrome, read computed
   colours), never read. It is the only way to prove the "used variables" point and the Tailwind 3 `theme()`
   path. Without it, those two stay "documented, not proven".

## 4. Utility classes where the grid takes classes

- **Today**: `ui.cellClass` (cells), and the host element (any class, any variable: Tailwind's arbitrary
  properties `[--tz-accent:var(--color-teal-600)]`, Bootstrap's `.text-bg-*` do not apply to inner parts).
  With the layer in place, a Tailwind 4 utility returned by `cellClass` wins with no `!` prefix; Bootstrap
  utilities win already (`!important`).
- **Gaps** (owner question T5): no `rowClass(ctx)` (zebra, a highlighted row), no `ui.headerClass`
  (static string per column), no class per badge tone. Estimated dom cost: `rowClass` ~60–80 B (diffed
  like `cellClass`, same guard on `dzg-` tokens), `headerClass` ~25 B, badge `classes` ~30 B in the part.
- **Documented** in `docs/theming.md` (one section per framework): the same three examples each time —
  a negative amount in red, a status pill, a highlighted row — written with that framework's classes.
  The examples run as browser fixtures (§3.3), so the docs cannot rot.

## 5. The docs page "un thème en 3 lignes"

`docs/theme-in-3-lines.md` (English body, French title kept as the owner wrote it), one block per setup,
each verified by a browser fixture:
- **Plain CSS**: `@import "@dzgrid/theme";` then `:root { --tz-accent: …; --tz-bg: …; --tz-fg: …; }` (plus
  the secondary tier per T2).
- **Showcase theme**: `@import "@dzgrid/theme"; @import "@dzgrid/theme/midnight.css";` (+ `data-theme`).
- **Tailwind 4**: the layer order line, `@import "tailwindcss";`, `@import "@dzgrid/theme/tailwind.css";`.
- **Tailwind 3**: per T3 (CSS file before `@tailwind utilities`, unlayered copy, or the plugin line).
- **Bootstrap 5.3**: `@layer bootstrap, dzgrid;`, Bootstrap imported `layer(bootstrap)` (or the unlayered
  copy), `@import "@dzgrid/theme/bootstrap.css";`.
- **Angular** `angular.json` `styles` arrays cannot layer: point them at the right entry per T1.

## 6. The two themes

Both are `@dzgrid/theme/<name>.css`, in `dzgrid.skin`, applied by import to `:root` **and** scoped by
`[data-dzg-skin="<name>"]` on any ancestor (so a showcase page can show both side by side; owner question
T6 on names and scoping). Each sets the ten colours as `light-dark()` pairs, so `data-theme` and the
system work unchanged. No font file, no image: system font stacks only (zero assets, no licence).

Values below were run through the existing `check()` of `scripts/check-contrast.mjs` against all 88
pairs (scratch run, nothing written to the repo): **0 failures in all four**; the smallest margin over a
pair's minimum is noted.

### "Midnight" (dark elegant, with its light twin)
| token | dark | light |
|---|---|---|
| `--tz-bg` | `#0b1424` | `#ffffff` |
| `--tz-bg-raised` | `#111d33` | `#f1f4fa` |
| `--tz-fg` | `#e6ecf7` | `#0b1424` |
| `--tz-fg-muted` | `#9fadc6` | `#4a5775` |
| `--tz-border` | `#26344f` | `#d3dae8` |
| `--tz-accent` | `#8ab4ff` | `#2b4bce` |
| `--tz-accent-fg` | `#0b1424` | `#ffffff` |
| `--tz-danger` | `#ff8a8a` | `#b4232f` |
| `--tz-warning` | `#f2c46d` | `#8f5400` |
| `--tz-success` | `#5fd3a0` | `#176f47` |
| shape | `--dzg-radius: .75rem`, `--dzg-pill-radius: 999px`, `--dzg-line: 1px`, header 600 weight, `.8125rem`, `letter-spacing: .02em` (0 under `:lang(ar)`), cell padding `.75rem` |

Measured: text 15.5:1 dark / 18.4:1 light; muted on raised 7.4 / 6.6; accent on surface 8.8 / 7.0;
text on selected row 12.1 / 14.8; danger on selected row 6.3 / 5.2; smallest margin ×1.34 dark, ×1.25 light.

### "Clinic" (light medical, with its dark twin)
| token | light | dark |
|---|---|---|
| `--tz-bg` | `#ffffff` | `#0d1b20` |
| `--tz-bg-raised` | `#f1f8f9` | `#13262d` |
| `--tz-fg` | `#102a33` | `#e2f0f3` |
| `--tz-fg-muted` | `#4a6570` | `#9bb6be` |
| `--tz-border` | `#d3e5e9` | `#29424a` |
| `--tz-accent` | `#0a6f84` | `#4cc7d8` |
| `--tz-accent-fg` | `#ffffff` | `#05222a` |
| `--tz-danger` | `#b3261e` | `#ff8f85` |
| `--tz-warning` | `#8a5300` | `#efc062` |
| `--tz-success` | `#1a7442` | `#6ad49a` |
| shape | `--dzg-radius: .5rem`, `--dzg-pill-radius: 999px`, cell padding `.875rem`; demos use `density: 'spacious'` (the theme cannot set row height: it is JS) |

Measured: text 15.0 / 15.1; muted on raised 5.8 / 7.3; accent on surface 5.8 / 8.8; text on selected
12.3 / 11.5; smallest margin ×1.09 light (the tightest: a teal accent under 4.5:1 would fail the chosen-day
pair, keep `#0a6f84` or darker), ×1.33 dark.

### Shared look (both themes, light and dark)
- **Pills/badges**: existing badge rule, `--dzg-pill-radius`, 12 % tint, frame in the tone; all 20 badge
  pairs pass (in the run above). Shape per tone stays (never colour-only).
- **Focus ring**: 2 px `--tz-accent`, offset −2 px in cells, +2 px on buttons (existing); ≥ 3:1 on bg,
  hover, selected, header (passes).
- **Selected row**: existing 14 % accent mix + the ticked box; Midnight adds a 2 px inline-start accent bar
  (logical side, mirrors in RTL); never colour-only (`aria-selected`, box).
- **Saving border (Q10)**: `--dzg-saving-color` → accent; accent on bg / hover / selected ≥ 3:1 measured
  (lowest 5.3 Clinic light on hover). **Refusal blink (Q9)**: `--dzg-refused-color` → danger; on bg /
  hover / selected ≥ 5.2 in all four. New pairs added to `contrast-pairs.json` with the Phase 5 step that
  draws them; the themes need no change then.
- **Forced colours**: the themes add only colour variables and shapes; system colours replace them. The
  Midnight selection bar and any shadow get `Highlight` / none under `forced-colors: active`.
- **RTL/Arabic**: no physical side (existing `checkScss` guard runs on the new files); `letter-spacing: 0`
  under `:lang(ar)` (spacing breaks Arabic joining); font stack ends with Arabic-capable system fonts.

## 7. Steps (tests first)

1. **Sheet and answers.** `docs/behaviors/theming.md` (the customisation contract in our words, public
   URLs used), owner answers T1–T7 into `decisions.md`, budgets after. No code.
2. **Layer and tokens in the base.** Red first: a node test that every rule of every theme file is inside
   `@layer dzgrid.*` and the file opens with the order statement; that `LAYOUT_CSS` (injected, nonce'd,
   shadow root, exported) is wrapped; that `--dzg-line`, `--dzg-pill-radius`, `--dzg-saving-color`,
   `--dzg-refused-color` are read with their fallbacks and never on `:root`; browser test: popup look kept,
   a later-layer class on a cell wins, a shadow-root grid styled. Then the unlayered copy per T1 (a test:
   same rules, no wrapper). `check-contrast.mjs` gains `oklch()` (hand-worked values first).
3. **Midnight.** Red first: fixture `test/fixtures/midnight.json` (the table above, written by hand);
   a test that the CSS equals the fixture (no drift); `check:contrast --palette` 0 failures light and dark,
   more-contrast still wins when asked; forced-colours rules present; `checkScss` 0 findings.
4. **Clinic.** Same as 3.
5. **Bridges.** Mapping tables (§3.1), default-palette contrast (§3.2), cascade fixtures (§3.3), the scope
   rule, dark selectors; the Tailwind 4 bridge fixed per the "used variables" finding; real builds if T4 = A.
6. **Class hooks and docs.** Per T5; `docs/theming.md`, `docs/theme-in-3-lines.md`; their snippets are
   the browser fixtures. Playground: a skin switch (`?skin=midnight|clinic`) beside the existing theme switch.
7. **Browser suite `--only themes` and close.** For each theme × light/dark × fr (LTR) / ar (RTL) ×
   normal/forced colours (Chrome `forcedColors: 'active'`): computed colours equal the fixture, axe colour
   contrast 0, no horizontal overflow, focus visible, Arabic `letter-spacing` 0, selection bar on the
   inline-start side; screenshots for a person to look at. Firefox and WebKit for the RTL checks (as the
   spike says). Then the full gate once, review and test analysis, `docs/STATUS.md` updated.

## 8. Sizes (asked, not decided)

| Entry | Estimate (gzip, minified) | Budget asked |
|---|---|---|
| `@dzgrid/theme` base: layer wrapper + 4 new tokens | +60–120 B on the measure | inside the 2 900 grant if the edit states fit; otherwise +150 (T7) |
| `@dzgrid/dom` base: `LAYOUT_CSS` wrapper | +20–30 B | inside the 21 800 grant |
| `@dzgrid/theme/midnight.css` | 400–550 B | 650 |
| `@dzgrid/theme/clinic.css` | 380–520 B | 650 |
| `@dzgrid/theme/tailwind.css` (v4, revised) | ~420 B (today 527 with comments, gzip -9) | 500 |
| `@dzgrid/theme/tailwind3.css` (or plugin) | ~400 B | 500 |
| `@dzgrid/theme/bootstrap.css` | ~380 B | 500 |
| unlayered copy (if T1 = A or C) | same as the base | same as the base, never on a profile |
| dom `rowClass` / `headerClass` / badge classes (if T5 = A) | ~120 B total | +150 on dom (21 800 → 21 950) |

Zero cost for apps that do not import them: each is its own file; profiles (K.8, real example) import
none of them and must not move except by the base's few bytes.

## 9. Owner questions (en français simple)

**T1 — La couche CSS (`@layer dzgrid`).** Pour que les classes de l'application gagnent sans `!important`,
la grille passe dans une couche. Mais les « remises à zéro » non rangées (Tailwind 3, Bootstrap) gagnent
alors contre la grille.
- **A ★** : `dzgrid.css` en couche par défaut, plus une copie sans couche (`dzgrid.unlayered.css`) pour
  Tailwind 3 et les vieux montages Bootstrap. Rien n'est publié encore : changer maintenant ne casse personne.
- B : `dzgrid.css` reste sans couche ; la version en couche est un fichier à part.
- C : tout en couche, pas de copie ; Tailwind 3 et Bootstrap doivent ranger leur CSS en couche eux-mêmes.

**T2 — Une palette en 4 couleurs ?** Changer accent, fond, texte, bordure laisse les gris secondaires de
tzslot (en-tête, texte discret), qui jurent avec un fond bleu nuit.
- A : on garde 10 couleurs ; la doc montre les 4 principales et dit « le reste si besoin ».
- **B ★** : dans les deux thèmes vitrines et un petit sélecteur documenté, les 3 couleurs secondaires se
  calculent depuis les 4 principales (vérifié par le script de contraste).
- C : calcul partout, même dans le thème de base (les valeurs par défaut changent un peu, on n'est plus
  identique à tzslot).

**T3 — Tailwind 3 (pas de variables CSS de couleurs).**
- **A ★** : un fichier CSS `tailwind3.css` avec `theme(...)`, passé par la chaîne Tailwind de l'appli.
- B : un petit greffon JavaScript (`plugins: [...]`), qui marche partout mais met du JS dans un paquet CSS.
- C : les deux.

**T4 — Tester avec les vrais Tailwind et Bootstrap ?** Sans eux, on teste notre côté avec des imitations
écrites d'après leur doc publique. Un point reste non prouvé : Tailwind 4 ne garde que les variables
« utilisées », notre pont actuel pourrait ne rien recevoir.
- **A ★** : ajouter `tailwindcss` 4 et 3 et `bootstrap` 5.3 en dépendances de développement, seulement
  exécutés (jamais lus), dans un test navigateur à part.
- B : imitations seulement ; on écrit « non prouvé » dans la doc.
- C : seulement Tailwind 4 (le risque connu).

**T5 — Des classes ailleurs que sur les cellules ?**
- **A ★** : `rowClass` (lignes), `headerClass` (en-têtes) et une classe par ton de pastille, maintenant
  (~120 o dans `dom`, budget 21 800 → 21 950).
- B : seulement `rowClass` maintenant, le reste avec la démo RH.
- C : rien de plus ; `cellClass` et les variables suffisent.

**T6 — Noms et usage des thèmes.**
- **A ★** : `midnight.css` et `clinic.css` ; importer applique à la page, `data-dzg-skin="…"` sur un
  conteneur l'applique à une seule zone (pour montrer les deux côte à côte).
- B : mêmes noms, seulement par attribut (importer ne change rien tant qu'on n'a pas mis l'attribut).
- C : d'autres noms (à donner).

**T7 — Tailles.** Accepter les budgets du §8 : thèmes 650 o chacun, ponts 500 o chacun, base du thème dans
l'accord 2 900 (+150 si les états d'édition ne tiennent pas), `dom` +30 o pour la couche ?
- **A ★** : oui, tels quels.
- B : oui, mais remis à « mesure + 10 % » dès qu'ils sont faits.
- C : on en reparle après mesure.

## Done — part 1, steps 1–4 (2026-10-23, not committed)

Owner answers T1–T7 are in `decisions.md` (« Showcase themes »); they won over this plan where they
differ (T2: every colour by hand, nothing computed).

**Step 1.** Sheet `docs/behaviors/theming.md` (the contract in our words; public sources: CSS Cascade 5,
MDN `@layer`, `light-dark()`, `forced-colors`, CSS Color 4 for `oklch()`, WCAG 2.2). No code.

**Step 2 — the layer and the tokens.** Red first, for the right reason (the files had no layer, no
copy, no token; `oklch()` unread; the ceilings were 21 300 / 2 500):
- `packages/theme/test/layer.test.ts`: 11 of 12 failed (order statement first and every rule in its
  layer, for `dzgrid.css`, `contrast.css`, `tailwind.css`; both unlayered copies equal to their layered
  file but the palette; both drift tests from Sass; exports; `--dzg-line` ×7; `--dzg-pill-radius`;
  saving/refusal pairs). The twelfth (no `--dzg-*` on `:root`) already held.
- `packages/dom/test/layer.test.ts`: 10 of 11 failed (each of the 7 injected sheets wrapped, the export,
  zero specificity inside, the injected `<style>` with a nonce and in a shadow root).
- `scripts/test/contrast.test.ts`: `oklch()` (hand-worked: white, black, L 0.5 grey = 99.1, the spec's
  red and blue, alpha, clipping) failed (« cannot read colour »).
- `scripts/test/rebudget.test.ts`: the T7 ceilings failed (21 300 ≠ 21 980; `midnight.css` null).
- Browser (`npm run test:browser -- --only themes`, written after the node tests went green, then shown
  to discriminate by mutation): with `dzgrid.unlayered.css` in place of the layered file, « the app's
  classes win » fails (padding 8px, not 3px); with `LAYOUT_CSS` unwrapped, « the popup keeps its look »
  fails (padding 0, border 0, transparent: the risk §2 named).
- Then: `dzgrid.scss` (`$layered`, the `layer()` mixin, the palette always in `dzgrid.theme`), new
  `contrast.scss`, `scripts/build-theme.mjs` (`npm run build:theme` builds the four CSS files),
  `tailwind.css` in `dzgrid.bridge`, the 7 DOM sheets wrapped, 6 contrast pairs (saving border and
  refusal blink on the row, hovered, selected; min 3), `oklch()` in the checker, ceilings.
- Existing tests adjusted, not weakened: `infra.test.ts` (zero specificity: skip the wrapper's
  prelude), `spans-fixes.test.ts` (selectors read inside the wrapper), `theme.test.ts` (the colour after
  `--dzg-line` is the one drawn), `rebudget.test.ts` (dom and theme grants moved by T7).

**Steps 3–4 — Midnight, then Clinic.** Red first: `packages/theme/test/skins.test.ts`, 16 of 17 failed
(files absent; exports; budget entries; fixture equality; contrast from the fixture and from the CSS;
no physical side and no colour outside the palette; Arabic spacing and the font stack; the base's
header knobs and the selection bar (+ `Highlight`); Midnight's knobs vs Clinic's; more contrast naming
`[data-dzg-skin]`), and `contrast.test.ts` « checks Midnight and Clinic by default ». After Midnight:
the 7 Clinic tests and the default-run test still failed; after Clinic, all green. Fixtures
`test/fixtures/{midnight,clinic}.json` written by hand from §6's tables.

**Departures from the plan (lead decisions, for the owner to confirm):**
- **No rule in a showcase theme**: both are variables only. What Midnight needs beyond colours became
  base knobs any theme can set: `--dzg-header-size` and `--dzg-header-tracking` (on header rows, not the
  tree's pinned parents; `letter-spacing: 0` under `:lang(ar)`) and `--dzg-select-bar` (the bar on
  `.dzg-seg-start::before`, sticky at the start edge; `Highlight` in forced colours; a contrast pair).
  Each theme sets every knob (Clinic sets them neutral), so an area of one in a page of the other keeps
  nothing of the page.
- **`contrast.unlayered.css`** too (the plan named one copy): layered forced-colours rules lose to the
  unlayered base copy (a selected row would keep the theme's colours). In both copies the palette blocks
  stay layered, so a layered showcase theme still replaces the base palette.
- **tzslot's date panel**: tzslot's sheets are unlayered, so the theme's three rules restyling its panel
  (surface, other months' days, the chosen day in forced colours) stay unlayered; named in a test. If an app ships
  tzslot's own CSS, the panel takes tzslot's look (contrast still held by the system colours).
- **More contrast in an area**: `contrast.css` declares its palette on `[data-dzg-skin]` areas too (an
  area's own declaration would beat the root's inherited one).
- **`--dzg-saving-color` / `--dzg-refused-color`** are reserved in `contrast-pairs.json` (derived and 6
  pairs) but not read by any CSS yet: nothing draws the save states before their Phase 5 step.
- **Fonts**: both themes set `--dzg-font` as a full `font` shorthand (system stack ending in « Noto Sans
  Arabic », Tahoma, sans-serif). Found while doing it: `tailwind.css`'s `--dzg-font: var(--font-sans)` is a
  family list only, invalid as a `font` shorthand, so the grid falls back to inheriting: for step 5.

**Review (code reviewer agent, 2026-10-23) and fixes, tests first.** Two findings, both fixed:
- R1: `FILTERS_CSS`'s rule fitting tzslot's date field into the popup (`min-inline-size: 0`) was layered
  and lost to tzslot's unlayered `min-width`: it now closes the layer and stands after it, the one
  exception, pinned in `packages/dom/test/layer.test.ts` (failed first).
- R2: in forced colours with `contrast.css`, the selected row is `Highlight`, so Midnight's bar in
  `Highlight` vanished: `contrast.scss` draws it in `HighlightText` there (`skins.test.ts` failed first;
  browser check « forced colours with more contrast » added).
- Below the threshold, for the owner: with the Tailwind bridge (`dzgrid.bridge`, after `dzgrid.skin`) and a
  page-wide showcase theme, the bridge's colours win on `:root` (areas keep the theme): to settle at step 5.
  Persian and Urdu (also joined scripts) keep the header tracking; only `:lang(ar)` resets it.
- `contrast.scss`'s palette map is named `$tz-palette` (the SCSS guard allows hex only there).
- `motion-gsap.test.ts` « a popup opening fades in… » failed after this work, every run (not on HEAD; an
  earlier note here calling it pre-existing load noise was wrong: a flawed worktree comparison). Root cause:
  GSAP's ticker runs on the real clock while the harness owns time; the first tick after a long synchronous
  setup advances by the whole gap unless it exceeds GSAP's 500 ms lag threshold. jsdom does not resolve
  `@layer` rules, so with the layout layered mounting got faster (gap 0.45 s, under 500 ms) and the 0.14 s
  fade was done before the test looked. Not a product defect (GSAP's documented lag smoothing). Fixed in
  the harness: `gsap.ticker.lagSmoothing(1, 0)` per test (restored after); pinned by « the harness: GSAP's
  clock never jumps over a setup » (failed first).

**Measures.** Sizes (gzip): theme base 2 423 (budget 2 500 kept, ceiling 3 050), `midnight.css` 446,
`clinic.css` 454 (650 each), dom 20 695 (21 300 kept, ceiling 21 980), `dom/tree` 3 679 / 3 700 (the
wrapper, +15), `dom/detail` 3 826 / 3 900, `dom/filters` 9 888 / 10 000, K.8 81 397 / 83 500. Contrast:
570 pairs (base, Midnight, Clinic; light and dark), 0 under their minimum; tightest Clinic light, « date
panel outside day inside a chosen period » 4.92:1 (min 4.5); pills ≥ 4.74 (Clinic light), focus ring ≥ 4.74,
saving border ≥ 4.74, refusal ≥ 5.23 (Midnight light). Browser `--only themes`: 24 / 24.

**Gate (once, at the end, 2026-10-23, after the harness fix).** `test:ci` 310 files, 4 960 tests, all
green. `test:perm` 6/6. `typecheck` green. `check:size` 0 over. `build` green. `check:contrast` 570 pairs,
0 under. `test:browser` (full) 523/523 and `--only themes` 24/24 (run before the harness fix, which
touches a jsdom test only). No orphan worker or browser left; port 4700 untouched. Not committed.

**Second review and test analysis (2026-10-23), fixed tests first.**
- R1 the other month's days rule joined tzslot's exceptions (unlayered; tzslot's days carry `color: inherit`).
- R2 shadow roots: theming.md says how to keep the order (an order `<style>` before the grid mounts, or
  `injectStyles: false` and the sheets adopted in order); browser checks for both and for the naive pitfall.
- R3 more contrast names `[data-dzg-skin]:not(:root[data-contrast=normal] *)` (reaches shadow roots).
- R4 header tracking reset by `:is(:lang(ar), :dir(rtl))`.
- R5 the spans' `!important` rule stands after the layer; noted in theming.md.
- R6 `check-contrast.mjs`: numbers need a digit, `turn`/`rad` hues refused, a non-finite ratio fails. Found by
  T-1: run through a symlinked path (macOS `/tmp`, `/var`) the script exited 0 without checking anything;
  it now compares real paths.
- T-1…T-6 added (`skinFromCss` keys, a planted bad theme fails, oklch `%`/`deg`/`none`/near-black, the bar's
  `content`/`position`, zero specificity in every injected sheet, font shorthand, GSAP lag smoothing restored).
- `contrast.scss` exported and shipped.
- Failed first: 11 node tests (R5 ×2, R4 ×2, R3, R1, `contrast.scss` export, R2 and R5 docs, R6, T-1 planted).
  T-2…T-6 pinned behaviour that already held. The new browser checks (R1 dates ×2, R3, R4) were shown to
  fail on the old CSS by mutation; R2's browser checks pass (documentation fix; the naive case shows the pitfall).
- Gate: `test:ci` 4 969/4 969; `test:perm` 6/6; typecheck, build green; `check:size` 0 over (theme 2 427,
  Midnight 446, Clinic 454, dom 20 695, spans 4 466, K.8 81 401); contrast 570 pairs, 0 under;
  browser `--only themes` 29/29, `--only dates` 44/44. Not committed.
