# Phase 9 — decisions

## Cell context menu (owner, 2026-11-02)

Started on its own, before Phases 7 and 8 (no dependency on them). Plan: `context-menu-plan.md`.
- Q-CM1 A: no menu on a touch long-press (iOS never sends it); an app may add its own ⋮ button that opens it.
- Q-CM2 A: nothing to offer → the browser's own menu on right-click.
- Q-CM3 A: « Pin row » copies the row to the top (or bottom) band and keeps it in the body; the app is told (`onPin`).
- Q-CM4: sizes accepted as estimated in the plan (new `context-menu`, `internal` with the shared menu list, `popup`,
  `tree`, `fill` raises, locales and `menu.css` lines; `column-menu` shrinks). The audit screen (K.8) must not move;
  if it would, the shared code becomes its own entry `@dzgrid/dom/menu`.
