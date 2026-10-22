# Saving an edit

Sources: the public documentation of grids that save edits to a server (what a user sees: the new value
at once, a sign while it is being saved, the old value back when the server says no), ARCHITECTURE
§3.10 (save rules 1–6, ported from our own `cell-edits.ts`), WAI-ARIA 1.2 (`aria-describedby`), WCAG 2.2
(1.4.1 not colour only, 2.2.2 and 2.3.3 motion, 2.3.1 three flashes, 2.4.11 focus not obscured, 4.1.3 status messages). Phase 5 plan
D7, D8, D9; owner decisions Q8, Q9 (server refusal), Q10 (amended: running border while saving), Q18.

## What the user does
Keeps a value (Enter, Tab, a click elsewhere, Delete); waits a moment; sometimes the server refuses or
cannot be reached; sometimes the row is reloaded or removed while they type.

## What they observe
- The new value shows at once. While the server works, a thin line runs around the cell's border; when
  it is saved, the line stops and a small check shows for a moment; with the application's motion
  feature (`motion()`) the cell also flashes briefly (without it, the marks alone).
- If the server refuses: the line stops, the border blinks red for half a second, then the old value
  comes back and a small error sign stays on the cell; hovering it or focusing the cell tells why.
- Rows do not jump: an edited row stays where it is (`edit-reapply.md`).

## Behaviours

**The save handler**
1. `edit({ save })` with `save(req, signal) => Promise<void> | void`; `req.changes` = `[{ key, column,
   value, previous, origin }]`. One gesture = one request (a commit, a clear, an undo; Part B: one paste,
   one fill, one bulk edit).
2. Without `save`, a kept value is **saved locally** at once (state `saved`, no border, the flash): the
   host gets `cellEdited` and applies it to its rows if it wants.
3. The source rows are never written by DzGrid: the value lives in the overlay until the source shows it
   (`onSource`: a transaction or a server answer carrying the row).
4. Per cell, saves go in order (a queue); a newer gesture on the same cell waits for the older one.
   Generations are never reused; an old success arriving after a newer failure never shows its value.
5. A rejected promise is a **refusal** (the server said no, or could not be reached; the same for the
   user). Rollback goes to the cell's **last saved** value, never to the value before the gesture if a
   later save already succeeded, never to the source rows.

**States** (one per cell, written by the base from the overlay at each paint, so a pooled or scrolled
cell always shows the right one)
6. `pending` (kept, waiting in the queue): class `dzg-cell--pending`, a small dot at the inline end.
7. `saving` (request in flight): class `dzg-cell--saving`, the **running border** (8–10), and the
   cell's description (`aria-describedby`) says `edit.saving`, so a user arriving on the cell hears it.
   No `aria-busy` on cells (a busy cell may be skipped by readers); the pending state is told by text.
8. **Running border** (Q10 amended): a thin line that travels around the cell's border, one turn in about
   1.2 s, clockwise in a left-to-right grid, counter-clockwise in a right-to-left one. Drawn by the theme
   in CSS (no GSAP needed, no layout read, nothing on other cells); on by default; off with
   `edit({ savingBorder: false })` (then a still border).
9. Reduced motion (`prefers-reduced-motion: reduce`) or `data-motion="off"` on the grid: a still border
   (dashed, same colour); nothing moves.
9b. **Five seconds at most** (WCAG 2.2.2): a cell still saving 5 s after its save started shows the still
   dashed border from then on, until the state changes (theme: the animation runs 5 s then holds the
   still style; a save that restarts on the same cell starts a new 5 s).
10. The border stops **at once** when the state leaves `saving`; then comes the saved flash (11) or the
    refusal animation (13). Never announced.
11. `saved`: class `dzg-cell--saved` for 1.5 s with a check at the inline end, then plain. With
    `motion()` installed, the built-in flash runs (the same as a live value change, under the same caps:
    ≤ 50 cells per paint, never while scrolling) and `onCell(el, c, 'saved')` is offered to the host.
12. A cell whose save is `saving` when it scrolls away and comes back shows the border again (the class
    is repainted); the animation's phase is not kept.
13. **Refused** (Q9): the running border stops; the cell's border blinks red for 0.5 s (two blinks;
    reduced motion: a still red border for 0.5 s; class `dzg-cell--refused`); then the cell shows its
    last saved value and an **error mark** stays (class `dzg-cell--failed`, a sign at the inline end, not
    colour only). The reason is in the cell's description (`aria-describedby`) and in a tooltip on hover
    and on focus; the tooltip never covers the focused cell's editor or the cell reached next (WCAG
    2.4.11: below, or above near the bottom). `saveFailed { key, column, value, error }` carries the
    host's error unchanged.
14. The error mark stays until the cell is saved again, undone, or its source value changes.
15. **Retry**: F2 or Enter on a failed cell opens the field holding the **refused** text (not the last
    saved one); Escape there gives up and keeps the last saved value. The refused gesture leaves no undo
    entry (nothing changed).
16. A host reason: if the rejection's error has a string `reason`, it is shown and said (the host's text,
    already translated); else the generic reason `edit.reasonUnknown`. A reason is never put in a
    `Problem` (rows may be health records).

**Server-paged grids** (Q18)
17. Editing works as on a client grid; the value stays shown from the overlay until the next server
    answer that carries the row; then the answer's value is shown and the `saved` overlay entry dropped;
    `pending` and `saving` entries are kept over an answer.
18. DzGrid never reloads after a save; the application decides (the kernel command `rows.refresh`, or
    nothing).

**A row that goes while it is edited** (Q8)
19. A row only **hidden** (a filter or quick search set by the app, its parent closed, a page change):
    the field closes, the typed value is kept and saved as a blur would; the focus goes where the grid's
    usual fallback puts it.
20. A row **removed** (a host transaction `remove`, or a reload without it): the field closes, the typed
    text is dropped, the focus goes to the nearest row, and it is said once (assertive):
    `edit.rowRemoved`.
21. A row removed while its save is in flight: the answer is ignored for display; `saveFailed` still
    reaches the host if it fails.

## Announcements
| When | Politeness | Text key |
|---|---|---|
| a save starts (once per gesture, not per cell) | polite | `edit.saving` |
| saved | — (the flash and the check) | — |
| refused by the server | assertive | `edit.saveRefused` |
| row removed while editing | assertive | `edit.rowRemoved` |
| the running border | never | — |

## Texts (`locales/{en,fr,ar}-edit`)
| Key | en | fr | ar |
|---|---|---|---|
| `edit.saving` | Saving | Enregistrement en cours | جارٍ الحفظ |
| `edit.saveRefused` | {column}: not saved, {reason}. Previous value restored. | {column} : non enregistré, {reason}. Valeur précédente rétablie. | {column}: لم يُحفظ، {reason}. أُعيدت القيمة السابقة. |
| `edit.reasonUnknown` (generic reason) | refused by the server | refusé par le serveur | رفضه الخادم |
| `edit.failedMark` (tooltip, description) | Not saved: {reason} | Non enregistré : {reason} | لم يُحفظ: {reason} |
| `edit.rowRemoved` | Row removed, change cancelled | Ligne supprimée, modification annulée | حُذف الصف، أُلغي التعديل |

## Right to left
Marks (pending dot, check, error sign) at the inline end; the running border turns the other way; the
tooltip opens at the inline end. Forced colours: the border and the marks in system colours
(`Highlight` while saving, `Mark` / `CanvasText` for the error), the signs stay shapes.

## Choices to confirm
- A network failure and a server « no » are treated the same (refusal: back to the last saved value).
- Retry = the refused text offered again in the field; no undo entry for a refused gesture.
- « Saved » is not said (the pending sentence once, then the flash).
- A page change on a server grid counts as « hidden » (the typed value is saved).
- The host's reason read from `error.reason`.
- Running border: CSS in the theme (works without `motion()` and GSAP), 1.2 s per turn.

## Tests (to be written with the code)
Step 3: conformance `edit-saves/*` (one gesture one request, queue, generations, old success after new
failure, rollback to last saved, `onSource`), 1 000 seeds of out-of-order outcomes against an oracle,
source rows deep-equal before and after, bugs 2 and 5 of `a6c97f5`. Step 7: 1 000 permutations of save
outcomes against paints (0 stale mark); states on a pooled cell; border stops on the next paint after
the answer; reduced motion and `data-motion="off"` still border; `savingBorder: false`; server grid
answers (17); row hidden vs removed (19–20); the 5 s hold (9b, fake timers and the computed
animation); the description while saving and no `aria-busy`; the tooltip placed clear of the field; browser: light, dark, forced colours, RTL direction of the
border, contrast pairs, 50 saving cells while scrolling, no layout read. Manual: §19.
