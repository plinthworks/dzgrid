# Phase 5, step 7 — saves in the DOM, end to end: blueprint (architect, 2026-10-24)

Sources: `phase-5-plan.md` step 7, D7, D8, D9; `decisions.md` Q6–Q10 (amended), Q16, Q18, O1–O11, S2-O2, S3-O2,
S4-O1…O4, S5-O*, S6-O* (they win); sheets `edit-save.md` (1–21), `edit-reapply.md` (1–10, 7a), `editing.md`,
`motion.md`; `phase-3-steps/step26-motion-blueprint.md`; `step03-plan.md`–`step06-plan.md` (Done, Review). Code read
at the step-6 head: `dom/src/edit/*`, `editors/{index,host}.ts`, `motion-gsap/**`, `render/tooltip.ts`,
`interact/tooltips.ts`, `features.ts`, `core/src/edit/controller.ts`, `core/src/server/rows.ts`. Clean room: our code
and GSAP's public docs only. Tests first.

## What is already built (do not redo)
Step 4: marks `pending|saving(+still 5 s)|saved 1.5 s|refused 0.5 s + blink a/b + limiter|failed` written per paint
on mounted cells; the refused value held 0.5 s by the seam; descriptions by token; « Saving » once per gesture;
assertive refusal sentence per gesture; muted rows (client only, S4-O3); the header reapply button (F2, Enter/Space,
click, `edit.reapplied {n}`, `edit.stale` once); CSS ring/blink in `edit.css`. Step 5: the editors, O1, `lost` →
commit (no sentence). Core: rollback to last saved, `state().refused`, `reason`/`code`, `error.cells`, lazy drop of
saved/failed on a replaced row, source models keep `pending/saving` of a row off the page (O9).

## Findings (gaps and defects this step owns)
1. **O2 retry is not wired**: `editors/index.ts open()` reads `g.edit.read(...)` — the last saved value — never
   `api().state(k,c).refused`. A failed cell reopens with the old text.
2. **Server page change loses the typed text (defect vs O9)**: `lost()` commits after the paint, when the row is
   no longer held; `kernel.editable` → false → `read-only`, text dropped silently. Same with a blur racing a source
   that answers in a microtask (the blur's commit runs one task later): the user hears O1's « abandonnée » with
   `validation.invalid`. `server/rows.ts` notifies `page`/`query` **at the command** (rows still held) when the source
   is async; a **synchronous** `fetch` answers inside the same commit (rows already replaced at notify).
3. **D8 sentence missing**: `edit.rowRemoved` exists in no bundle, said by nobody.
4. **A removed row's failed save is announced** (`marks.ts` `saveFailed`: `s === undefined` → shout « … Valeur
   précédente rétablie ») for a row the grid no longer has (sheet 21: the host hears it, the user does not).
5. **Server reapply** (S2-O2): `stale.ts` says `edit.reapplied {n}` at the click with the stale page's count, before
   the answer; a failed request keeps the mark but « Remis en ordre » was said.
6. **Failed reason on hover**: `interact/tooltips.ts` only reads `col.def.tooltip`; nothing shows `edit.failedMark`.
   The tooltip also adds its id to `aria-describedby`, so a failed cell would be described twice.
7. **Motion reasons**: `saving|saved|failed` still reserved; the run chunk hears only `rows.subscribe`; `flash.ts`
   reads `col.read` (not the overlay). The run chunk can reach the edits only through `g.edit` (`read`, `api`).
8. **Network failure**: refused as decided (core), but worded « refusé par le serveur » (`edit.reasonUnknown`).
9. Not yet checked: Firefox/WebKit ring (`@property`, mask, `:dir`), the 1 000-permutation paint test, focus
   revealed after an app reapply with the focus in the body (sheet 6).

## Where each piece goes (gz, minified, estimates to measure)
| Piece | Where | Bytes | After / ceiling |
|---|---|---|---|
| `EditSeam.tip(key, col)` read by `tooltipFor` before the column's tooltip; `TipFor.said` (no `aria-describedby` from the tooltip) | dom base `features.ts`, `interact/tooltips.ts`, `render/tooltip.ts` | +40–55 | ~21 470 / 21 700 (no ask) |
| failed tooltip text; removed-row refusal silent; network reason; server reapply sentence at the answer; reveal after an app reapply | `@dzgrid/dom/edit` `edit/{index,marks,stale}.ts` | +115–150 | ~3 690 / 3 650 → **ask 3 750** |
| O2 retry; D8 sentence; server page/query keep-and-close; blur/lost race → removed | `@dzgrid/dom/editors` `editors/index.ts` | +150–190 | ~6 580 / 6 500 → **ask 6 650** |
| `edit.rowRemoved` | `locales/{en,fr,ar}-editors` (lead: the editors say it; the sheet's `-edit` table moves) | +30/35/45 | ~380/420/515 of 450/500/620 |
| `edit.reasonNetwork` (if S7-O2 B) | `locales/{en,fr,ar}-edit` | +25/30/40 | measure first: step 5 recorded 387/444/579 (the 499/563/730 are step 4's, before the five codes moved) of 560/630/810 |
| reasons `saving/saved/failed`, saved flash | motion run chunk, new `run/saves.ts` + `run/index.ts` | +250–330 | 2 854 → ~3 180; line 3 150 → measure, **inside Q16's 3 500** (written grant) |
| `onCell` reason union, `CellMotion` doc | motion shell `index.ts` | 0 (types) | 593 / 700 |
| ring/blink fixes found in Firefox/WebKit | `edit.css` | 0 planned | 2 092 / 2 100 — any fix → **reserve 2 200 asked** |
| core, `core/edit`, `/server`, theme base, Angular | — | **0** | 28 916, 3 098 (frozen), untouched |

## API (only additions)
```ts
// @dzgrid/dom (base, features.ts)
interface EditSeam { …; /** A cell's own tooltip while it needs one (a failed save's reason); null: the column's. */ tip?(key: RowKey, column: string): string | null }
interface TipFor { …; /** Already the cell's description: the tooltip adds no aria-describedby. */ readonly said?: boolean }
// @dzgrid/dom/edit: no new option. EditApi unchanged. Reason order: error.reason › validation.<code> › edit.reasonNetwork (S7-O2 B) › edit.reasonUnknown
// @dzgrid/dom/motion-gsap
onCell?: (el: HTMLElement, c: CellMotion, reason: 'changed' | 'saving' | 'saved' | 'failed') => void | false;
// saving: value/text sent; saved: value/text saved; failed: value/text refused (shown during the hold), previousText = the last saved text (what comes back)
```

## Behaviour
**Retry (O2, edit-save 15)** — `open()`: `st = api().state(k,c)`; `st?.status === 'failed' && 'refused' in st` → the
opening value is `st.refused` (text field `textOf`, day/instant field, list's active option, custom editor's
`value`/`text`); else today's `g.edit.read`. A printable key still replaces. Escape: nothing, the mark stays. Enter on
the refused text: a new gesture (a save). Opening during the 0.5 s hold: the same refused value. Undo stack untouched.

**A row that goes while edited (Q8, O9, sheet 19–21)** — in `/editors`:
- `g.rows.subscribe` while a field is open, **source models only**, change kind `page` or `query` (the request
  leaving, the row still held): keep the text as a blur does (`commit`), close without moving the focus (`shut(false)`;
  the cell stays focused if mounted), `editingStopped {via:'lost', kept}`; a refusal → O1. A refresh of the same page
  (`status`/`rows`) keeps the field open.
- `lost()` / blur: `commit` refused `read-only` **and** `g.rows.row(k)` undefined → no O1, no blink: `api().alert(
  edit.rowRemoved)` once, focus by the host's fallback (nearest row). Client: hidden (filter by the app, parent
  closed, column hidden) = held → kept and saved, nothing said. Source: a refreshed page without the row = removed.
- Synchronous `fetch` sources answer inside the command: the row is gone at the notify → removed + said (documented;
  S7-O3 C would cover it).
- `/edit` `saveFailed`: `ctl.state()` undefined and the row not held → no sentence, no hold (the host hears it).

**Server-paged grids (Q18, sheet 17–18, 7a)** — nothing to build in the reader (core lazy drop); the DOM tests pin:
the saved value stays until an answer carries the row; the answer's value then shows (no flash: not a
transaction), the check goes; `pending/saving` stay over an answer (border kept); no request after a save; the app's
`rows.refresh` = one request. Reapply on a server grid: `rows.reapply` sends one request; `edit.reapplied {n}` is
said at the answer that clears `orderStale` (count from the answer); a failed request: no sentence, mark kept.

**K.14 in full** — besides the above: after `api.reapply()` with the focus in the body, `g.reveal` on the focused
cell (sheet 6, clear of pinned/sticky); with `motion()` the reapply glides (`order` change), focus untouched; an
editor open during an app reapply: its row may move; mounted → the field stays (rule 5), unmounted → `lost` (kept).

**Failed tooltip (sheet 13, O11)** — `tip(key,col)`: `failed` → `edit.failedMark {reason}` (same reason function),
else null. `tooltipFor`: not on `[data-dzg-editing]` (as now); seam text first, column tooltip otherwise (lead; S7-O4);
`said: true` → `Tooltip#show` skips `describe` (the mark's description already holds the same text: read once).
Hover after `tooltips.delayMs` (500), keyboard focus at once, Escape dismisses, below the cell (above near the
bottom), never over it; the pointer may move onto it. Gone when the cell is saved, undone or its source changes
(next hover/focus; a shown tooltip is hidden at the paint where its cell's mark goes).

**Network (O11 note)** — `reason()` in `marks.ts`: no `reason`, no `code`, and (`error instanceof TypeError` ||
`name` ∈ {`TimeoutError`, `NetworkError`} || `navigator.onLine === false`) → `edit.reasonNetwork`. Same refusal flow.

**Motion reasons (D9, Q10 B)** — `run/saves.ts`, attached per grid: `g.kernel.subscribe` collects `editStates`
cells and `saveFailed` cells until the paint; at `afterRows` (independent of the snapshot; the chunk loaded; `live()`):
per mounted cell (`rowRenderer.cell`), reason from `api.state` (`saving` once per generation per cell, `saved`,
`failed` at the refusal start; `pending` nothing); a transition first `guard.finish(el)` (the previous reason's tweens
end at once); hooks through `scene.hook` (the 50-call cap shared with `changed`), `showing(g,el,k,c)` tracked (pooled
cells finished). Built-in: **`saved` only** = the existing flash (`dzg-flash`, `--dzg-flash` 1→0, 0.6 s) under
`effects.flash`, ≤ 50 cells per paint (more: none), one per cell per 500 ms (`marked` shared), none within 150 ms of a
scroll; reduced → the still mark 0.6 s, hooks called with `reduced: true` (S7-O5). `saving`/`failed` built-ins stay
CSS (ring, blink). Without `motion()`: marks only (Q10 B). `motion:false`: nothing, running ones finished.

## Tests first (jsdom; each red before its code)
1. `editors-retry.test.ts` (O2): F2 / Enter / double click on a failed cell → refused text (number « 17 », day,
   list, custom `value`); during the hold; Escape keeps the mark; Enter → one request with the refused value, mark
   cleared on success; source change → opens with the source; no undo entry.
2. `edit-gone.test.ts` (D8): client hidden (app filter, tree collapse, column hidden) → request, no sentence, focus
   not on body; removed by transaction / reload without it → no request, `edit.rowRemoved` assertive once, focus on
   the nearest row; reload with the same id → field stays; removal between blur and its task → `rowRemoved`, not O1;
   removed while saving + refusal → `saveFailed` to the host, nothing said, no mark; server `page.go`/`page.size`/sort/
   filter by the app while open → the request carries the typed value before the answer, field closed, cell focused;
   a microtask-answering source → kept; refresh with the row → open; refresh without → removed; sync source → removed
   (pin of the documented limit).
3. `edit-server.test.ts` (Q18, 7a): the bullets of « Server-paged grids » above, request counts exact.
4. `edit-tip.test.ts`: hover delay / focus at once / Escape; text per reason (host, `code` → « au moins 1 », network,
   unknown), fr and ar; `aria-describedby` holds the mark's id once and never the tooltip's; column tooltip replaced
   while failed and back after; none while editing; hidden when the mark goes; placement below / above (stubbed rects).
5. `edit-network.test.ts`: `TypeError`, `TimeoutError`, offline → network text; `reason` and `code` win; sentence and
   mark both use it.
6. `edit-reapply-full.test.ts`: app reapply reveals the focused cell clear of a pinned column and sticky parents;
   server reapply: one request, sentence at the answer with its count, none on failure; editor open during an app
   reapply (mounted / unmounted); the muted focused row leaving → nearest row.
7. `motion-saves.test.ts` (real GSAP in jsdom, `matchMedia` stubbed): every rule of « Motion reasons » (once per
   generation, transition finishes, `false` skips the flash, `effects.flash:false`, reduced, `motion:false`, cap 50
   shared, > 50 saved → none, 500 ms, 150 ms scroll, pooled, unmounted, chunk not loaded, two nested grids, destroy
   mid-tween leaves no `transform/opacity/--dzg-flash`, 0 layout reads by spies).
8. **Random walk** `edit-saves-walk.test.ts` (300 seeds in `test:ci`, 1 000 in `test:perm`; client, source paged,
   tree): actions = open (F2 / char / dblclick) · type · Enter / Tab / Escape / blur · settle a random in-flight save
   (ok / reason / code / `error.cells` / network, any order) · time +0.1…2 s · scroll · page · host update / add /
   delete · app filter · reapply (header click / API) · undo / redo · hover a cell. Oracle `support/edit-dom-oracle.ts`
   (independent: per cell last saved, in-flight value, status, hold/saved/still deadlines, reason; editor state;
   expected requests and sentences; motion hook log after the guards). After each step: every mounted cell's text,
   `dzg-cell--*` tokens, description, the tooltip text if hovered, the field and its text, focus never on `body`, the
   requests made (no request for a removed row), the sentences, the hook log; source rows deep-equal to their start.
9. `edit-permutations.test.ts` (`test:perm`): 6 gestures over 3 cells × every answer order (720) + 280 random
   outcome sets → after each settle and paint: 0 stale mark, 0 stale value.
10. Guards: texts (`EDITORS_KEYS` has `edit.rowRemoved`; `-edit` `edit.reasonNetwork`; plurals untouched), structure
    (the run chunk never imports `/edit` or `/editors`; base never imports them), public API, rebudget lines after the
    owner's answer, contrast pairs (saved check and failed sign over the flash tint, tooltip in the three themes).

## Mutants (copy of the repo, deleted after)
retry opens the last saved · retry ignores the hold · hidden row dropped · removed row kept · removed said twice /
never · page commit removed · refresh closes the field · blur race says O1 · removed-row refusal shouted · tooltip id
in `aria-describedby` · column tooltip over the failure · tooltip on an open editor · tooltip kept after saved ·
network before `code` · server « reapplied » at the click · said on a failed request · reveal skipped · `saving` hook
each paint · transition without `finish` · `false` ignored for saved · cap not shared · > 50 flashes · reduced moves
· scroll guard off · pooled cell not finished · failed `value` = rolled back · `effects.flash` ignored · unmounted
cell hooked · destroy leaves props.

## Browser (one browser at a time, closed after; never stop 4700)
New group `--only edit-saves` (`packages/dom/test/browser/edit-saves.{html,ts}`: 200 stock rows, a held save the test
answers, `?paged` server variant, `motion()` on/off) **and** the real page via `--only playground` on
`http://127.0.0.1:4700/orders-edit.html` (fr light Clinic; `?locale=ar-DZ&theme=dark&skin=midnight`; `?paged=1`).
The demo gains (lead, S7-O6): `motion()`, « Supprimer cette commande dans 3 s », « Couper le réseau », a paged mode.
Real `page.mouse` and `page.keyboard` only:
1. saving border running (`getAnimations()` on the ring) while held; stopped at the next frame after the answer;
2. saved: check 1.5 s; with motion `dzg-flash` and `--dzg-flash` sampled 1→0 in ~0.6 s; without motion no flash;
3. refusal (« …7 »): blink 0.5 s, last value back, failed sign; hover 500 ms → tooltip with the server's reason, its
   rect clear of the cell, axe 0 with it; keyboard focus → at once; AX tree: the reason once in the description;
4. retry: F2 → field holds « 17 »; « 18 » Enter → saved;
5. reapply: header click sorts Qté, edit a Qté → mark; real click on the mark → rows glide (transform sampled), focus on
   the header cell, polite sentence; F2 → Enter path; ar: mark at the header's left;
6. delete while editing: press the 3 s button, double click a cell of that row, type → field gone, assertive
   « Ligne supprimée, modification annulée », focus on a row's cell, no « envoyé » in the log;
7. paged: open a cell, the page changes (demo timer) → the value sent at once (log), back page → server's value;
8. network cut → « serveur injoignable » in the sentence and the tooltip (S7-O2 B);
9. reduced motion (CDP) and `data-motion="off"`: dashed still border, no running animation, saved still mark 0.6 s;
10. forced colours: sign and tooltip visible; RTL: ring reversed, sign at the inline end, tooltip mirrored;
11. 50 saving cells while scrolling: 0 layout reads in the marks' and motion's `afterRows`, 0 long task;
12. `--only edit-marks --engine firefox` and `--engine webkit` (ring, mask, `:dir(rtl)`, blink, still after 5 s),
    `--only edit-saves --engine webkit` (tooltip in the top layer).
Then `check:contrast` with the new pairs. Gate at the commit as usual (`build`, `test:ci`, `test:perm`, typecheck,
`check:size`, full browser).

## Risks
- Sync server sources lose the text on a page change (finding 2); only S7-O3 C fixes it, in `core/edit` (2 B left).
- `edit.reasonNetwork` guesses from the error's shape: an app's own `TypeError` bug reads « injoignable » (an error
  with `reason`/`code` always wins; documented).
- Two descriptions of one failed cell (mark + tooltip): the `said` flag; a `slots()` tooltip part must honour it.
- Saved flash + check + a live `changed` flash on the same cell in one paint: one `dzg-flash` only (the 500 ms map).
- A host hook tween on `saving` may run for seconds: always finished at the transition and on pooling.
- `/edit` and `/editors` at their ceilings even after the asks; Part B will need its own entries.
- Firefox/WebKit may need CSS fixes with 8 B left in `edit.css` (reserve asked).
- The playground demo grows (three switches): keep it invented data, fr/ar, no library change; vite alias for
  `/editors` still missing (needs a server restart: not by an agent).
- Bench of muted rows at 100 000 (step 4's 4 ms line) still not run: Q17d, quiet machine only.

## Owner questions
- **S7-O1 Tailles.** Pour finir les enregistrements il manque de la place : `@dzgrid/dom/edit` 3 650 → 3 750,
  `@dzgrid/dom/editors` 6 500 → 6 650, et une réserve `edit.css` 2 100 → 2 200 seulement si Firefox ou Safari
  demandent une correction. **A** tout accorder ★ ; **B** seulement `/edit` et `/editors`, `edit.css` redemandé avec la
  mesure ; **C** rien : on retire la phrase « remis en ordre » des grilles serveur et le mot « réseau ».
- **S7-O2 Coupure réseau.** **A** même phrase qu'un refus : « refusé par le serveur » ; **B** une phrase à part,
  « serveur injoignable », quand l'erreur ressemble à une coupure (hors ligne, délai, échec de connexion) ★ ;
  **C** B, plus un nouvel essai automatique au retour du réseau (plus lourd, plus tard).
- **S7-O3 Grille paginée : la page change pendant qu'on tape** (par l'application ou un rafraîchissement).
  **A** le texte est gardé et envoyé au moment où la page est demandée, le champ se ferme ; un rafraîchissement de la
  même page laisse le champ ouvert ; une ligne absente de la réponse compte comme supprimée (annulé, dit) ★ ;
  **B** toujours annulé et dit (contraire à O9) ; **C** A, plus ~30 o dans `@dzgrid/core/edit` (3 100 → 3 130)
  pour couvrir aussi les sources qui répondent sans attendre.
- **S7-O4 Infobulle d'une cellule refusée qui a déjà sa propre infobulle.** **A** la raison du refus la remplace
  tant que l'erreur reste ★ ; **B** les deux, l'une après l'autre.
- **S7-O5 Mouvement réduit et `onCell` pour saving / saved / failed.** **A** appelé avec `reduced: true`
  (l'application peut marquer sans bouger) ★ ; **B** pas appelé (comme `entered` / `moved`).
- **S7-O6 Démo `orders-edit`.** **A** la même page gagne les animations, « supprimer dans 3 s », « couper le
  réseau » et un mode paginé `?paged=1` ★ ; **B** une page à part `orders-paged.html` pour le mode serveur.

## Done (2026-10-24, not committed; owner S7-O1…O6, Q3 revised, the saving border apart from the focus ring)

**Built.** `/editors`: retry by reopening (O2: `open()` reads `state().refused` of a failed cell — text, number,
day, instant, list, the app's editor); `leave()` shared by the blur, the lost cell and a server page or query asked
while open (S7-O3: kept and sent while the row is held, `editingStopped {via:'lost'}`); a refusal there is O1, a
removed row (`read-only` and not held) says `edit.rowRemoved` once (D8), whichever of the paint or the blur's task
sees it first. Enter's default is `'stay'` (owner Q3 revised, mid-step). `/edit`: `edit.reasonNetwork` (S7-O2; a
`TypeError`, `TimeoutError`, `NetworkError` or the browser offline; `reason` and `code` win); a removed row's refusal
unsaid (client rows only: a server row only off the page is said — found while writing the walk); « remis en ordre »
on a server grid at the answer that clears the mark, never after `fetchFailed`; `api.reapply()` scrolls the focused
cell into view (`g.ensureVisible`, the focus untouched); the failed reason as the cell's tooltip (`EditSeam.tip`).
Base: `EditSeam.tip`, `TipFor.said` (no `aria-describedby` from the tooltip), `Tooltip.said` (hidden at the paint
where the cell is no longer failed), `GridContext.ensureVisible`, the column tooltip reads the shown value. Motion:
`run/saves.ts` — `onCell(el, c, 'saving' | 'saved' | 'failed')` and the saved flash (shared helpers `fresh`, `tint`,
`valueOf`, `forget` in `flash.ts`; one scene a paint, the 50-call cap shared); the guard clears only what a tween
left inline. Theme: the saving border in `--tz-warning` (never the focus ring's accent), 3 px inside the focus
ring; contrast.css gives it a cyan in the dark; `check:contrast` gains `hue` pairs (≥ 60° from the focus ring) and
palette entries named in full (`--dzg-*`); 9 pairs over the flash tint. Texts: `edit.reasonNetwork` (-edit),
`edit.rowRemoved` (-editors). Demo `orders-edit.html` (S7-O6): `motion()` and « Animations », « Serveur
injoignable », « Supprimer cette commande dans 3 s », « Données : serveur paginé » (`?paged=1`, a simulated server
that keeps what it saves, « Page suivante dans 3 s »), « Entrée : reste / descend » (`?enter=`), fr and ar.

**Tests that failed first** (each red on the step-6 code, run in the copy with the step-6 sources and the new
texts): `editors-retry` 6 / 11 (green by design: the hold, a printable key, Escape, no undo, a source change),
`edit-gone` 12 / 17 (+ 2 written later, each red before its fix: a server row off the page said; the frame-paint
blur race), `edit-server` 2 / 7, `edit-tip` 7 / 11 (+ the tooltip during the 0.5 s, red before its fix; placement
green by design), `edit-network` 4 / 6, `edit-reapply-full` 3 / 7, `motion-saves` 14 / 16 (+ the offset-parent read,
red before the guard fix), the walk `edit-saves-walk` and `edit-permutations` (red), `editors-end` « Q3 revised »;
the texts (3), the budget pins (6), the contrast `hue` rule and palette names (2), the theme's saving colour and
place (2), the run-chunk structure pin (green: a pin). Old pins changed by design: Enter's 'down' named in 7 tests
(editors-end ×3, -list, -review, -custom ×2) and the browser editors page; the accent fallback (3 theme pins); the
flash pairs count (5 → 14); the budget pins of steps 4–6.

**Defects found and fixed (tests first).** The column tooltip read the row, not the edit (« Stock 1 » over 18); a
tooltip shown during the refusal's 0.5 s stayed after a new value was kept; a server row only off the page had its
refusal silenced; clearing finished tweens read layout (GSAP parsing the transform: 152 offset-parent reads in 60
frames, Chrome). Escape first dismisses a shown tooltip, then gives the field up (as designed; the walk models it).

**Walk and permutations.** `edit-saves-walk`: client, server pages, tree; 40 steps a seed; 300 seeds in test:ci (~3 s),
1 000 in test:perm (~15 s); oracle `support/edit-dom-oracle.ts` over the core's `EditOracle` (DOM clocks, field,
sentences, tooltip). `edit-permutations`: 720 orders + 280 random sets in test:perm, 60 + 20 in test:ci.
Deviations: the walk does not drive `motion()` (motion-saves covers its rules); tree collapse is in the walk and
in edit-gone, sticky parents in the reveal test are not (pinned columns are).

**Mutants** (copy, deleted after): 37 — 34 killed at once, 2 after a new test (the blur race needs frame paints; the
editing tooltip needs a hover on the field), 1 equivalent (`saving` once per gesture: the core tells a cell once per
change; the generation map was dead code, removed).

**Sizes** (gz): `dom/edit` 3 723 / 3 750; `/editors` 6 523 / 6 650; dom 21 516 / 21 700; motion run 3 382 / 3 500 (line
set to 3 500, Q16); motion shell 593; `edit.css` 2 101 / 2 200 (the reserve, for the saving border); `-edit` texts
402 / 461 / 605 (560 / 630 / 810); `-editors` 365 / 410 / 497 (450 / 500 / 620); core 28 916, `core/edit` 3 098
(untouched); K.8 82 349.

**Browser.** `--only edit-saves` Chrome 37 / 37 (fr light Clinic, ar dark Midnight, real mouse and keyboard: the ring
running then stopped, the saved check and the flash fading, the refusal, the reason on hover after 500 ms and at
once by keyboard, clear of the cell, read once in the AX tree, axe 0, retry, the reapply mark gliding the rows, a row
removed while edited, a network cut, forced colours; the focused saving cell: ring and border apart in place and hue,
reduced motion too — red on the step-6 `edit.css`; without motion no flash; reduced: the still mark; paged; 50 saving
cells while scrolling: 0 layout reads, 0 long task); WebKit 2 / 2 (the tooltip in the top layer). `--only edit-marks`
Firefox 29 / 29, WebKit 29 / 29 (now allowed off Chrome; forced colours and long tasks stay Chrome's). `--only editors`
75 / 75, WebKit 3 / 3. `--only playground` 27 / 27 on the real page (4700): fr, ar, `?paged=1`, `?enter=down`.

**Gate** (once, at the end): `test:ci` 353 files, **5 624 / 5 624**; `test:perm` 4 files, 9 / 9 (207 s);
typecheck green; `check:size` 0 over; `build` green; `check:contrast` 798 pairs, 0 below; full browser **795 / 795**.

**For the owner.** By ear: the reason heard once on a failed cell, « Ligne supprimée, modification annulée », « serveur
injoignable » (§19). The Arabic of `edit.reasonNetwork` and `edit.rowRemoved`. Look at the orange running border
inside the blue focus ring (Midnight dark: amber in the light blue). `edit.reasonNetwork` reads any `TypeError` as a
cut (an app's own bug too).

## Review (2026-10-24; reviewer 1–6, test analyser 1–12) — applied, tests first

**Reviewer.**
1. (high) A cell already showing the column's tooltip that is then refused kept « Stock 1 »: the paint asks the
   tooltip again whenever `!!edit.tip(key, col) !== tip.said` (`g.retip`); `#show` describes with `!said` (the
   column tooltip's id goes). Red first: `edit-tip` « review 1 ». Two tests changed by design: after a save or a new
   value the column's tooltip now takes the reason's place at once (it was hidden).
2. Network narrowed: a `TypeError` saying fetch / network / load failed, `TimeoutError` / `NetworkError` by name,
   `code: 'network'`, `g.win.navigator.onLine === false`. Red first: 3 tests (an app's TypeError, a « MyTimeoutError »,
   the code, the grid's window).
3. A synchronous source's page or query: `edit.pageDropped` (new, `-editors`), never « Row removed » — detected by
   the page and query the field opened on. Red first: the sync-source pin (now with a query) and the texts.
4. A page asked before the save lands keeps the server's mark (`core/server`: the mark remembers the gate's
   requests begun; an answer to one of them keeps it). Red first: `source-rows-edit` « review 4 »; DOM pin in
   `edit-server`. `/server` 6 088 / 6 100.
5. The refusal border 3 px inside the focus ring too; forced colours: the saving border CanvasText on a selected row.
   Red first: the theme test; browser check on a focused, refused cell.
6. `a11y-protocol.md` 121: Enter stays. The demo log writes « Ligne supprimée… » and the page sentence as said, without
   « Refus sur place » (pinned in the playground check).

**Test analyser.** All 12 added: retry on a cell scrolled out; a held row made read-only → O1; `page.go` from an
outside button keeps its focus; Enter's default for a list pick and the app's `keep()`; one « remis en ordre » for a
press then an API reapply; nothing scrolled with the focus outside; column tooltips surviving paints (2); motion off
then on; the scroll guard not using up the 500 ms; grey against a colour 180°; `failed` told once (equivalent in
practice: the core tells a refusal once); the leak test (the rows' listeners at destroy, red with `unhear` removed).
None failed on the code.

**Sizes after the review** (gz): `dom/edit` 3 741 / 3 750 (reason's parameters reordered, one generation set, the
cells exposed: −22 B to make room); `/editors` 6 595 / 6 650; dom 21 548 / 21 700; `/server` 6 088 / 6 100;
`edit.css` 2 110 / 2 200; `-editors` 383 / 434 / 533.

**Gate after the review** (once, `caffeinate -i`): `test:ci` **5 644 / 5 644**; `test:perm` 9 / 9; typecheck, `check:size`
(0 over), build green; `check:contrast` 798 / 0; full browser **797 / 797**; `--only edit-saves` 39 / 39, `edit-marks` 35 / 35,
`editors` 75 / 75, `playground` 27 / 27; WebKit edit-saves 2 / 2, editors 3 / 3; edit-marks Firefox 29 / 29, WebKit 29 / 29.
