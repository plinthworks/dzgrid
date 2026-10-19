# Step 13 decisions (owner and lead, 2026-10-19) — the filter popup

Plan: `step13-popup-blueprint.md` (same folder).

- O1 (owner, "Oui à tout"): during Phase 3, reset to the measure + 10 % at the close: `@dzgrid/dom/filters` 3 500 → 7 000 B gz, measured over `@dzgrid/dom/popup` (a consumer pays the popup once); filter bundles en 520, fr 620, ar 830 (22 new keys); theme 1 400 → 1 520; base unchanged (18 750). Warned: about 3 kB of headroom left in the audit profile for steps 14–16, cuts may be needed.
- O3 (owner, "Bouton Appliquer"): on a server grid the popup keeps a draft and sends nothing until Apply or Enter (closing without Apply drops the draft); on the client the filter applies live (typed text after the pause, discrete choices at once) and Apply just closes.
- O7 (owner, "Ne ferme pas"): an outside click does not close the popup (step 1 rule); exits are Apply, Escape, or the filter button again; revisited at the step 18 audit.
- O4 (owner, "Reporter"): AND/OR (two conditions), the match-case checkbox and an inactive "filter" button in the floating row wait for Phase 5; a stored combined filter shows "Filter active" + Clear; a stored caseSensitive is kept.
- O2 (lead): Alt+ArrowDown (open the filter) is handled by the feature on the header, no core `openMenu` intent (core and conformance unchanged); ARCHITECTURE.md and the plan amended.
- O5 (lead): a header filter button on every column with a `filter.<kind>` part; `filters({ popup: false })` turns them off.
- O6 (lead): `openFilter(column)` / `closeFilter()` are methods on the feature object, not the grid handle (Angular wires them at step 22).
- O8 (lead): `aria-keyshortcuts="Alt+ArrowDown"` on header cells with a popup; no aria-controls; the button stays out of the tab order (one header tab stop); owner checks by ear (a11y protocol §9).
- O9 (lead): the popup closes on a dir change while open and when its column leaves the window (focus to restoreFocus).
- O10 (lead): the new required filter keys are a breaking change for step 12 adopters: CHANGELOG.
