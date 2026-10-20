# Step 22 decisions (owner and lead, 2026-10-20) — @dzgrid/angular

Plan: `step22-angular-blueprint.md` (same folder).

- Q1 (owner, "Oui, dans Angular"): `emit` lives in the Angular wrapper only (0 bytes in core and dom); `cell().emit(name, detail)` → `cellAction {column, key, name, detail}` for cells, `partAction {slot, column|null, name, detail}` for other slots, on `(gridEvent)` and `onEvent`. Plain-DOM parts keep their own closure over the grid.
- Q2 (owner, "`cell` partout"): every Angular part component receives its slot context in one input named `cell` (one interface `DzgPartComponent<S>`).
- Q3 (owner, "19 à 22"): peers `@angular/core` and `@angular/common` `^19 || ^20 || ^21 || ^22`; tests on 21; `ng build` smoke on 19 and 22 at step 23.
- Q4 (owner, "Oui"): `@dzgrid/angular` budget 5 500 B gz (Angular itself external), during Phase 3, reset to the measure + 10 % at the close; a `part-shadowed` warning code in the core (~15 B, within its margin; ask only if over).
- Lead: selector `dz-grid`, directives `dzg-`; zoneless primary, zone.js tested; SSR safe; the registry order features < provideDzGrid < [parts] < dzgPart templates; directives `dzgSearch` and `dzgExport` bind the host's input and button.
