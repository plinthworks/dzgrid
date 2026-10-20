# Step 21 decisions (owner and lead, 2026-10-20) — selection rules, context, header filter

Plan: `step21-rules-blueprint.md` (first architect pass) and the notes below (second pass, after the owner's clarification). These decisions win.

Owner:
- Q1 ("Oui"): with a selection rule, "Select all N rows" is not offered; the header box and Ctrl+A take the shown rows only (server pages too); refused rows stay unticked; everything-except selections are refused under a rule.
- Q2 ("Oui, à vérifier à l'oreille"): a refused row is greyed (the box, `data-dzg-refused`), NO `aria-disabled` on the row; the screen reader hears "not selectable" (or the rule's own reason text) when the user tries; checked by ear (a11y protocol).
- Q3 ("Oui, plus tard"): `context` reaches every part, `canSelect`, `canExport`/`exportAll` and the tooltip callback; not filter kinds' test/wire, value getters or sort (Phase 4).
- Q4 ("Oui aux deux"): unticking is always allowed (the rule judges additions only). Budgets during Phase 3, reset to the measure + 10 % at the close: core 27 100; dom base 19 300; new `@dzgrid/core/rules` 700 (over the core); new `@dzgrid/dom/rules` 800; `@dzgrid/dom/internal` 800; `@dzgrid/dom/slots` 1 450; bundles `{en,fr,ar}-rules` 150 / 170 / 200.
- Clarification (owner): the main deliverable of the header part is the capability for developers to build their own header control driving the column filter; a built-in header box is an extra (include only if it fits the filters budget, else defer).

Lead (from the second pass, reconciled with the above):
- The rule may return a string = the spoken reason (host-translated); a throwing rule refuses (fail closed) and is reported.
- Fail closed: `canSelect` set without the rules feature is an error problem (`missing-feature`, detail rules) and selection is forced to `none`.
- A command whose every added row is refused changes nothing (a click on a refused row never wipes the selection); additions asked greedily in screen/insertion order (documented: "4 then 8" in a range keeps 4).
- A host `selection.set` refusal is told through `problems` (`selection-refused`), not announced; a user refusal is announced (forced, so a repeated refusal is heard again).
- Header filter seam: type-only `FeatureHandle.headerPart?(col)` (or `GridContext.filter`) filled by filters and merged by slots — neither imports the other; the header filter object is cached per column (same identity while state/kind/where/ms unchanged) so `mounted()` does not update on unrelated paints; it includes `canOpen` / `openFilter()`.
- Keyboard in a header cell holding a control: one tab stop; Enter or F2 enters (Enter does not sort then; keyboard sort through the part's own control via `toggleSort`); Escape flushes and returns to the cell; focusout flushes; IME guarded.
- The anchor moves only for an accepted row.
