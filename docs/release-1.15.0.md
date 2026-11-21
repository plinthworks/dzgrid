# Publier DzGrid 1.15.0 — la liste du propriétaire

Préparée le 2026-11-21 (« vérification puis tu publies »). **Rien n'est publié, aucune étiquette n'est poussée.** C'est
toi qui publies. Les **cinq** paquets sont en **1.15.0** (`@dzgrid/core`, `dom`, `theme`, `angular`, `element`), leurs
pairs `@dzgrid/*` en `^1.15.0`. Une mineure : des ajouts seulement, tous optionnels, aucun défaut changé, rien retiré.

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit de la 1.15.0
npm ci
npm run release:check     # « Release check: the 5 packages at 1.15.0. »
```

## Publier — une des deux façons

**A. Depuis ton Mac** : `npm run publish:latest -- --otp=CODE`.

**B. Par l'étiquette** : `git tag v1.15.0 && git push origin v1.15.0`.

Puis `npm run publish:verify`, et dans les applications `npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular`.

## Ce que la 1.15.0 ajoute (chacun optionnel)

- **La marque de tri toujours là** — `sortMark: 'always'` sur une colonne (fiche `presentation-settings.md` 49) : sur
  une colonne triable, la marque se montre aussi sans tri (⇅, ou `icons.sortNone`) et c'est un bouton « Trier par
  {colonne} » ; clic = tri comme un titre, Maj ajoute ; atteint par Tab depuis la part de l'en-tête. Retire la
  dernière rustine de ton appli.
- **L'édition par lot** — `editBatch()` (`@dzgrid/dom/edit-batch`, `edit-batch.md`) : chaque geste vérifié, montré,
  gardé en attente (triangle au coin + teinte, « Non enregistré ») ; `saveAll()` envoie tout en **une** requête
  (`origin: 'batch'`), après avoir revérifié les colonnes puis `validateRow` (un refus local n'envoie rien) ;
  `discardAll()`, `discard(clé, colonne?)` ; annuler / rétablir à travers ; gardé par clé (tri, filtre, pages
  serveur). Un collage et une recopie s'enregistrent aussitôt par défaut (`paste` / `fill: 'pending'` pour les
  garder). `pendingChange` pour prévenir avant de quitter : Angular `(pendingChange)` et `ctrl.batch()`, l'élément
  `dzg-pending-change`.
- **Toute la ligne en édition** — `editors({ row: rowEditor })` (`@dzgrid/dom/editors-row`, `edit-row.md`) : chaque
  cellule modifiable de la ligne en champ (oui/non = case), Tab entre eux, Entrée garde la ligne en un geste
  (`origin: 'row'`), Échap abandonne, `validateRow` ; tout ou rien.
- **Une liste cherchée sur le serveur** — colonne `edit: { search }` avec `editors({ search: searchEditor })`
  (`@dzgrid/dom/editors-search`, `editors.md` 23–29) : combobox, 250 ms après la dernière touche, la demande d'avant
  abandonnée (`signal`), états « Recherche… », « Aucun résultat », « La recherche a échoué ».
- Textes dans `@dzgrid/dom/locales/<en|fr|ar>-forms`, look dans `@dzgrid/theme/forms.css`.

## Ce qui peut te concerner

- **`GridEvent` gagne `pendingChange`** (accepté dans `check:api`, comme `groupByChanged` et `rowMove` avant) : un
  `switch` exhaustif sur le type d'événement demande un cas de plus. `SaveOrigin` gagne `'batch'` et `'row'` (seulement
  avec le lot ou l'éditeur de ligne).
- **Les textes de base gagnent `header.sortButton`** (en / fr / ar) : un paquet de textes à toi peut l'ajouter ; sinon
  le bouton porte le titre de la colonne.

## Revue indépendante avant publication (2026-11-21)

Trois défauts trouvés et corrigés, chacun avec un test rouge d'abord :
- Liste cherchée : fermer le champ abandonne la demande, mais un `fetch` abandonné rejette — l'éditeur disait alors
  « La recherche a échoué » au lecteur d'écran, champ déjà fermé. Il ne dit plus rien (`editors-search.test.ts`).
- `editBatch()` : `saveAll()` ne se résolvait jamais si la grille était détruite avant la réponse ; il se résout
  (`edit-batch.test.ts`, fiche `edit-batch.md` 12).
- `editBatch()` : l'attribut `data-dzg-pending` de la racine restait après un abandon quand aucune cellule en attente
  n'était à l'écran (filtrée, défilée, autre page) ; il part (`edit-batch.test.ts`).

Vu sans défaut : l'attente gardée par clé (tri, filtre, pages serveur, ligne retirée, ligne remplacée) ; `saveAll()`
une requête, refus par cellule, rien envoyé sur un refus local ; `discard` ; annuler / rétablir à travers attente et
enregistré ; collage / recopie enregistrés aussitôt et la cellule en attente qu'ils prennent ; les touches de
l'éditeur de ligne (Tab, Entrée, Échap, retour du focus, page serveur changée) ; la liste cherchée (attente de 250 ms,
abandon, réponses en retard, erreurs, désabonnement d'un observable, clavier, lecteurs d'écran) ; `sortMark`
(`aria-sort` sur l'en-tête, clavier, droite à gauche) ; rien qui reste après `destroy` ; aucun `Problem` ne porte de
donnée de ligne ; côtés logiques seulement.

## Tailles

Règle des +2 % : `@dzgrid/core/edit` 3 238, `@dzgrid/dom/edit` 4 190, `/editors` 6 900, `@dzgrid/angular` 8 830,
`@dzgrid/dom` 26 250, `@dzgrid/theme` 3 170, `variables.css` 1 970 ; nouvelles lignes edit-batch, editors-row,
editors-search, `forms.css`, textes -forms. Nouvelles lignes mesurées après la revue : edit-batch 1 774 / 1 800, editors-row 2 899 / 3 200, editors-search
1 224 / 1 350. K.8 92 853 / 93 000. Appli Angular réelle 103 800 → **104 000** par la règle des +2 % (mesuré 103 979).

## Vérifié (2026-11-21)

`pack:local` ; `gate:step` vert (690 fichiers / 9 692 tests, 3 sautés ; `test:tz`, `typecheck`, `build`,
`check:size`, `check:api` — rien retiré ni rétréci, ajouts seulement —, `check:types`). Premier passage rouge sur 7
tests laissés par les commits de la 1.15.0, réparés : épingles de taille (`@dzgrid/core/edit` 3 238, Angular 8 830),
listes de fichiers des gardes de structure (`edit/row-rule.ts`, `editors/cells.ts`, les entrées edit-batch /
editors-row / editors-search posées « par-dessus » edit et editors), et la garde des noms physiques qui prenait la
poignée interne `x` pour une coordonnée (lue par index). `test:real-app` 58 / 58 ; matrices `browser-1-15.mjs`
336 / 336, `browser-1-14.mjs` 75 / 75 (100 000 lignes : première peinture 53 / 78 / 73 ms, p95 18 ms),
`browser-1-12.mjs` 15 836 / 15 836 ; `test:element` 81 / 81 (Chrome, Firefox, WebKit) ; `release:check` « the 5
packages at 1.15.0 » (appli Angular réelle 103 979 / 104 000 ; épingles `example-bytes`, `step12-budgets`, README) ;
site 36 / 36 ; mots interdits verts (`packages/angular/browser/build/` supprimé). Ton appli (`dz-grid-migration`,
paquet local 1.15.1-local, DzTooltip 1.0.0) : `npm run check` 202 OK, aucun échec (le HTTP 500 est la panne simulée) ;
elle tourne sur 4730.
