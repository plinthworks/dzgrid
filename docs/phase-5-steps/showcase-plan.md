# Showcase work inserted after step 2 (owner, 2026-10-22)

Order, after step 2 is committed and before step 3:
1. **Showcase themes** (owner: « mettre bien en évidence le travail avec une très belle CSS »). Two themes shipped as separate optional entries of `@dzgrid/theme` (zero cost for apps that do not import them): a **dark elegant** theme (midnight blue, thin lines, rounded pills, crisp type) with a matching light version, and a **light medical** theme (white, teal-blue, airy, Sehhaty spirit) with a dark version. Contrast-checked (`check:contrast`), forced colours, RTL/Arabic. Architect first; sizes asked to the owner.
2. **Master/detail "same columns" demo** (owner): each master row opens a nested grid with exactly the master's columns (e.g. an order and its sub-orders).
3. **HR demo** (owner, from a screenshot of another grid's public demo page; invented data only, no copied code or assets): org tree (parent column) with sticky parents, avatar + name + title cell, department pills, status pills, flag + country, contact buttons reachable by keyboard, pinned first column, dates and amounts by locale; fr light and ar RTL dark versions; uses the showcase themes.

## Owner requirement on all customisation (2026-10-22)

« Tout ce qui est customisation, je veux qu'il soit le plus simple possible, avec des possibilités d'utiliser Tailwind CSS 3 ou 4, Bootstrap ou autre chose. » Lead direction for the theme architect (to be checked and sized, then asked):
- a **short list of main tokens** (accent, surface, text, border, radius, font, density) that drive everything else; a theme = a handful of variables;
- the grid's CSS inside a **cascade layer** (`@layer dzgrid`) so an app's own classes (Tailwind utilities, Bootstrap) win without `!important`;
- **bridges** as tiny optional files: Tailwind 4 (map its `--color-*` / `@theme` variables), Tailwind 3 (a preset/plugin), Bootstrap 5.3 (map its `--bs-*` variables) — the grid then follows the app's colours, dark mode and font with no extra work;
- utility classes usable where the grid takes classes (`ui.cellClass`, parts, header classes), and documented examples for each framework;
- one page in the docs: "theme in 3 lines" per framework.
