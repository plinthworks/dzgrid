# Advanced filter (1.17.0) — the plan

Owner 2026-11-21 (« on passe au filtre avancé… tu peux continuer en autonome »). Opt-in, defaults unchanged. Sheet
first: `docs/behaviors/advanced-filter.md`. Sizes: the builder in new entries; existing lines +2 %; K.8 ≤ 94 000.

## API

| Item | Entry | Use |
|---|---|---|
| Model | `@dzgrid/core` | types `FilterExpression`, `FilterGroup`, `FilterCondition`; `ColumnFilter` gains `{ type: 'advanced', expression }` (under the key `''` only); `advancedOf(filter)`, `withAdvanced(filter, expression \| null)`, `setAdvanced(kernel, expression \| null, source?)` |
| Wire | `@dzgrid/core/server` | `WireFilter` gains `{ type: 'advanced', expression: WireExpression }` |
| Builder | `@dzgrid/dom/advanced-filter` | `const af = advancedFilter()`; `features: [filters(), af]`; `af.api(grid)` → `{ open(), close(), bind(button), get(), set(expression \| null), isOpen }` |
| Texts | `@dzgrid/dom/locales/<lang>-advanced-filter` | `EN_ADVANCED_FILTER`, `FR_ADVANCED_FILTER`, `AR_ADVANCED_FILTER` |
| Look | `@dzgrid/theme/advanced-filter.css` | `--dzg-adv-*` variables |
| Angular | `@dzgrid/angular` | `<dz-grid [(advancedFilter)]="expression">` (`(advancedFilterChange)`) |
| Element | `@dzgrid/element` | `el.advancedFilter`; its changes with `dzg-filter-changed` |

## How it is built

- **Core** (base, small): `compileFilter` and `toWire` read the `''` entry: a group walks its items, a condition is
  `compileOne` / `wireOne` of its column (the same checks, codes, paths under `advancedFilter`). The kernel copies the
  entry as JSON (cycles, BigInt refused). The client model leaves it out of value lists and, when it is in force, any
  edited column runs the filter again. The three server sources leave it out of value-list requests. `core/state`
  keeps the `''` entry on restore.
- **Builder**: a modal popup (`popupsFor`), each condition mounting the column's `filter.<kind>` part (from
  `filters()`' bridge `panel.resolve`) on a local context: `state` the condition's filter, `set` writes the draft,
  `close` = Apply. Enum columns take `filter.set`.
- **Angular**: a model of `DzGrid` beside `[(filter)]` (a directive of its own weighed 224 B gz, past the line's +2 %;
  the model weighs 123 B gz and 197 B in K.8).
- **Element**: a property only (its line had no room for an event of its own).

## Sizes (measured, minified and gzipped)

K.8 93 073 → 93 768 / 94 000 (the core's evaluation and wire form, Angular's model). Lines +2 % at most:
`@dzgrid/core` 30 228 / 30 240, `core/server` 6 311 / 6 320, `core/edit` 3 259 / 3 270 and `core/spans` 4 077 / 4 100
(code unchanged, base gzip), Angular 8 949 / 8 960, element 1 781 / 1 785. New lines (measure + 10 %): `dom/advanced-filter`
4 029 / 4 400, texts 304 / 354 / 422 → 350 / 400 / 500, `advanced-filter.css` 509 / 600.

## Interactions (each place that reads the filter)

| Place | What it does with the expression |
|---|---|
| Screen (client model) | AND with the column filters and the search |
| Server request (3 sources) | wire form under `''`; left out of value-list requests |
| Value lists (client) | left out of the counts |
| Select all / membership | part of the applied filter key |
| Saved state | saved; restored, checked |
| Export / print / clipboard | the rows shown (no own rule) |
| Clear all | removed |

## Décisions prises en autonome

- Rangement : l'expression est une entrée du modèle de filtre sous la clé `''` (aucune colonne n'a d'id vide) — état, serveur, `[(filter)]`, événements la portent sans nouveau canal, et la base grossit peu (K.8).
- Combinaison ★ : filtres de colonne ET expression s'appliquent tous deux (ET entre eux) ; pas de mode « remplace ».
- « Effacer tous les filtres » efface aussi l'expression (un seul geste vide tout ce qui cache des lignes).
- Une condition = une colonne + un filtre de colonne tel quel (`ColumnFilter`) : tous les types et opérateurs existants, rien de nouveau à apprendre.
- Une condition fautive fait tomber toute l'expression (comme un filtre combiné), problèmes dits avec leur chemin ; une condition à moitié tapée est ignorée sans bruit.
- Groupes imbriqués sur 5 niveaux au plus ; pas de NON pour l'instant.
- Les listes de valeurs ignorent l'expression (sinon impossible d'ajouter « OU Statut = Alerte »), côté navigateur comme serveur.
- Constructeur = dialogue modal (l'hôte des popups de filtre), pas un panneau du dock ; brouillon appliqué par « Appliquer » ou Entrée, Échap / Annuler l'abandonnent.
- Le constructeur réutilise les formulaires de `filters()` (obligatoire, sinon avertissement `missing-feature`) ; une colonne `enum` y reçoit la liste de valeurs.
- Sémantique liste (groupes `group`, éléments `ul`/`li`, contrôles natifs) plutôt qu'un `tree` ARIA : les éléments contiennent des champs, un arbre ARIA ne le permet pas proprement.
- Forme texte (`Statut = "Erreur" ET …`) : laissée pour plus tard (le constructeur couvre le besoin ; un analyseur propre avec positions d'erreur ne tient pas « petit »).
- Angular : `[(advancedFilter)]` sur `<dz-grid>` (à côté de `[(filter)]`) ; une directive à part dépassait la ligne Angular de +2 % (224 o) — le modèle coûte 123 o, et 197 o dans K.8 (93 768 / 94 000).
- Élément : propriété `advancedFilter` seulement ; ses changements arrivent par `dzg-filter-changed` (un événement à lui dépassait la ligne de l'élément de +2 %).
- Une condition vide (sans colonne ou sans valeur) est laissée de côté à l'application ; un groupe vidé aussi ; plus rien : l'entrée `''` est retirée.
- Échap, Annuler, un appui dehors abandonnent le brouillon (comme une boîte de dialogue), pas d'application implicite.
- `setAdvanced(kernel, expression)` ajouté au cœur (petit) : partagé par le constructeur, Angular et l'élément.
- Valeur illisible (un nombre) au moment d'appliquer : la boîte reste ouverte, le focus sur le champ marqué.
