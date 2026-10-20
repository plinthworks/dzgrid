# Selection rules

## What the user does
Ticks rows in a grid whose application forbids some choices: "if row 4 is ticked, row 8 cannot be", "at most three rows", "only rows of the same ward". They click, Ctrl-click, Shift-click, press Space or Ctrl+A, tick the header box.

## What they observe
- A row the rule refuses stays unticked; what was already ticked stays ticked. A click on a refused row never empties the selection.
- In a range or a "select all", the allowed rows are ticked and the refused ones skipped.
- The refused row's box looks greyed (muted, a "not allowed" pointer) before they try.
- When they try, the screen reader says "Not selectable", or the application's own reason; for a range, "6 rows selected, 2 not selectable". Trying again says it again.
- Unticking is always possible.

## What DzGrid does
- **The rule** (`settings.selection.canSelect`, live): `(row, selection, context) => boolean | string`. `true` allows; `false` refuses; a string refuses and is the sentence said (the application translates it). `selection` is the selection the row would join: the rows kept plus those already accepted in the same action, in the order on screen (a range "4 then 8" with "4 excludes 8" keeps 4); a plain click or a plain Shift range replaces the selection, so it starts from the rows of the new selection that were already ticked. `context` is `settings.context`. The rule is asked only for rows being added, never for a row already selected (unticking is always allowed, owner Q4). It must be pure and fast.
- **Every way in goes through it:** click, Ctrl/Cmd-click, Shift-click, Space, Ctrl+A, the header box, the footer, and the API (`selection.toggle`, `only`, `range`, `allDisplayed`, `all`, `allFiltered`, `set`). It lives in the core (`kernel` gate) and in the optional entry `@dzgrid/dom/rules` (`rules()`), with the pure vetting in `@dzgrid/core/rules` (`vetSelection`).
- **Nothing accepted, nothing changed:** a command whose every added row is refused leaves the selection as it was (no `selectionChanged`). Otherwise `selectionChanged` comes first, then `selectionRefused { source, rows, reason, cause }` (`cause`: `rule`, `unknown-row`, `needs-rows`; `reason`: the rule's first string, or null). The Shift anchor moves only to an accepted row.
- **Rows it cannot see:** with a rule, an everything-except selection (select all matching, a host's exclude set) is refused (`needs-rows`): a rule judges rows, and those rows are not loaded. The header box and Ctrl+A then act on the rows shown, on server pages too (owner Q1); the footer does not offer "Select all N rows". A host's include `selection.set` is vetted the same way: keys it kept are not asked again; keys of rows the grid does not hold (another server page) are refused (`unknown-row`).
- **A live rule change** (a new `canSelect` or a new `context`) does not re-vet what is already selected; it applies from the next addition, and the refused look is painted again.
- **The header box** reads ticked when every row shown is either ticked or refused, so its click can clear; partly ticked otherwise.
- **Said aloud** (user actions only): refused rows "Not selectable", "3 not selectable" (`rules.refused`, plural on n; for a refused select-all matching, n is the filtered count); the rule's own string instead when it gave one (`rules.refusedReason`, `{reason}` as given: the application writes the whole sentence, owner Q2); a partial action "{selected}, {n} not selectable" (`rules.partly`), one sentence. A refusal is always said, even the same twice in a row. A host's `selection.set` refused is told as a problem (`selection-refused`, warning, path `selection`, detail the cause), never said; never a row key in a problem.
- **The refused look:** `data-dzg-refused` on the row's box cell (`.dzg-check`), for unselected rows the rule refuses, painted by `rules()` on the rows mounted only; the rule is asked again only when the selection, the rule or the context changed (0 calls on scroll for rows already asked). No `aria-disabled` on the row (it would read the whole row as unavailable, owner Q2); `aria-selected` stays the truth.
- **Fail closed:** a rule that throws refuses that row and the error is reported (`reportError`). `canSelect` given to a grid without `rules()` is an error problem (`missing-feature`, path `settings.selection.canSelect`, detail `rules`) and the grid's selection mode becomes `none`: no row can be selected unvetted.
- **Texts** in their own bundles `@dzgrid/dom/locales/{en,fr,ar}-rules` (`RULES_KEYS`); `rules()` throws naming a missing one.

## Where DzGrid differs on purpose
- A refused row is not disabled: it stays focusable and readable, and the refusal is told when the user tries (owner Q2, to be checked by ear: `docs/a11y-protocol.md` §15).
- No "select all matching" under a rule: a rule over rows the browser does not hold cannot be honoured.

## Tests
`conformance/cases/selection-rules/*` (a declarative rule: conflict pairs, a maximum, a group), `packages/core/test/rules.test.ts`, `kernel-gate.test.ts`, `selection-scope-property.test.ts` (with a rule, against a naive oracle), `packages/dom/test/rules.test.ts`, `rules-walk.test.ts`; browser checks in `scripts/browser.mjs` (`?rules=1`).
