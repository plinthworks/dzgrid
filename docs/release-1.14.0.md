# Publier DzGrid 1.14.0 — la liste du propriétaire

Préparée le 2026-11-19 (« vérification puis tu publies »). **Rien n'est publié, aucune étiquette n'est poussée.** C'est
toi qui publies. Les **cinq** paquets sont en **1.14.0** (`@dzgrid/core`, `dom`, `theme`, `angular`, `element`), leurs
pairs `@dzgrid/*` en `^1.14.0`. Une mineure : des ajouts seulement, tous optionnels, aucun défaut changé, rien retiré.

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit de la 1.14.0
npm ci
npm run release:check     # « Release check: the 5 packages at 1.14.0. »
```

## Publier — une des deux façons

**A. Depuis ton Mac** : `npm run publish:latest -- --otp=CODE`.

**B. Par l'étiquette** : `git tag v1.14.0 && git push origin v1.14.0`.

Puis `npm run publish:verify`, et dans les applications `npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular`.

## Ce que la 1.14.0 ajoute (chacun optionnel)

- **Glisser un titre hors de la grille le masque** — `columns({ dragOutHides: true })` (fiche `column-move.md` 22–28) :
  40 px hors du cadre, tout côté ; le fantôme dit « ⊘ {colonne} masquée » ; relâché là, la colonne est masquée comme
  en la décochant dans le panneau (état, événement, `gridState`). Jamais une colonne `hideable: false` ni la dernière.
- **Une valeur en part** — `showAs: 'percentOfTotal' | 'percentOfGroup'` avec `showAs()` (`@dzgrid/dom/show-as`,
  `aggregation.md` 19–24) : l'écran, la recherche, l'impression disent la part ; tri, filtres, édition, presse-papiers,
  **CSV et Excel gardent la valeur**. Lignes d'un serveur : la valeur et un avertissement.
- **Un éditeur de texte long** — `edit: { editor: 'textarea' }` avec `editors({ textarea: textareaEditor })`
  (`@dzgrid/dom/editors-textarea`, `editors.md` 18–22) : Entrée = une ligne, Ctrl/Cmd+Entrée garde, Échap abandonne.
- **Titre et pied dans Excel** — `xlsx: { title, subtitle, footer }` (texte, textes, ou fonction de l'export ;
  `xlsx-export.md` 6–11) : lignes fusionnées ; filtres et volets figés restent sur le tableau.
- **Cocher un groupe coche ses lignes** — `groupSelect()` (`@dzgrid/dom/group-select`, `row-grouping.md` 25–29) :
  coché, décoché ou partiel ; groupes d'un serveur : les lignes tenues.
- **Hauteur de ligne par fonction** — `rowHeight: (row) => number` avec `rowHeights()` (`@dzgrid/dom/row-heights`,
  `virtual-scroll.md`) ; Angular `[rowHeight]` aussi. 100 000 lignes : première peinture 50 / 82 / 71 ms, défilement
  p95 18 ms comme une hauteur unique.

## Ce qui peut te concerner

- **`GridSettings.rowHeight` peut être une fonction** (accepté dans `check:api`, ta réponse « AA ») : un code qui relit
  ce réglage en supposant un nombre doit tester `typeof`.
- `api.refresh()` refait aussi la disposition des lignes (aucune requête ; redemande la fonction de hauteur).

## Revue indépendante avant publication (2026-11-19)

Deux défauts trouvés et corrigés, chacun avec un test rouge d'abord :
- `showAs` : une ligne épinglée (hors du total) s'imprimait vide dans la colonne en part ; elle imprime sa valeur, comme
  à l'écran (`show-as.test.ts`).
- `groupSelect()` avec une règle de sélection (`rules()`) : un groupe dont une ligne est refusée restait « partiel » et
  sa case ne pouvait plus décocher ; il se lit coché (comme la case d'en-tête) et son clic décoche
  (`grouping-select.test.ts`). Nouveau point de contact interne `g.refused`, posé par `rules()`.

Vu sans défaut : le glisser-masquer (épinglées, `hideable: false`, dernière colonne, état gardé), `showAs` avec
groupes, filtres et serveur, les touches et la direction de l'éditeur long, les lignes fusionnées d'Excel (filtre,
`_FilterDatabase`, volets), les cases de groupe à trois états (serveur, « tout sauf »), les hauteurs variables
(défilement virtuel, lignes épinglées, détails, `ensureVisible`, Page bas — test ajouté). Deux épingles de taille
périmées (`@dzgrid/dom` 26 120) remises à jour.

## Tailles

Tes « A » / « AA » : `@dzgrid/dom/columns` 4 250 → 4 500, `@dzgrid/core/xlsx` 7 150 → 7 350. Règle des +2 % :
`@dzgrid/dom` 26 000 → 26 120, `/editors` 6 765, `/find` 2 690, morceau xlsx 1 122, `columns.css` 1 290 ; nouvelles
lignes show-as, row-heights, editors-textarea, group-select ; appli Angular réelle 103 650 → 103 800 (mesuré 103 734). K.8 92 611 / 93 000.

## Vérifié (2026-11-19)

`pack:local` ; `gate:step` vert (680 fichiers / 9 587 tests, 3 sautés ; `test:tz`, `typecheck`, `build`, `check:size`,
`check:api` — rien retiré ni rétréci, ajouts seulement —, `check:types` ; premier passage rouge sur 5 tests laissés par
les commits de la 1.14.0 : épingle `columns` 4 250 → 4 500, `--dzg-textarea-max-block` absente du tableau du guide (en,
fr ; variable CSS seule), `left`/`right` physiques dans le glisser-masquer (réécrit par `logicalX`) ; après correction,
un typage de test, puis la suite du gate relancée de `typecheck` à `check:types`, verte). `test:real-app` 58 / 58 ;
matrice `browser-1-14.mjs` 75 / 75 (Chrome, Firefox, WebKit ; 100 000 lignes : première peinture 55 / 90 / 76 ms, une
hauteur 36 / 50 / 65, p95 17,6 / 18 / 17 ms) ; matrice complète `browser-1-12.mjs` 15 836 / 15 836 ; `release:check`
« the 5 packages at 1.14.0 » (appli Angular réelle 103 650 → 103 800 par la règle des +2 %, mesuré 103 734 ; épingles
`example-bytes`, `step12-budgets`) ; site 36 / 36 ; mots interdits verts (`packages/angular/browser/build/` supprimé).
K.8 92 611 / 93 000. Ton appli (`dz-grid-migration`, paquet local 1.14.1-local, DzTooltip 1.0.0) : `npm run check`
199 OK, aucun échec (le HTTP 500 est la panne simulée par la vérification).
