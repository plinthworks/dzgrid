# Publier DzGrid 1.11.0 — la liste du propriétaire

Préparé le 2026-11-10 (ta réponse « A » : les quatre défauts trouvés en écrivant le site ; puis « C » : les trois
du lot 2 ; puis « il n'y a plus de 1.10.1, il y a que 1.11 » : les manques trouvés au contrôle, dans la même version). **Rien n'est publié, aucune
étiquette n'est poussée.** C'est toi qui publies. Les **cinq** paquets sont en **1.11.0** (`@dzgrid/core`, `dom`,
`theme`, `angular`, `element`), leurs pairs `@dzgrid/*` en `^1.11.0`. Une version mineure : rien de la 1.10.0 n'est retiré
(`check:api` vert après ton accord sur `LAYOUT_CSS` ; il garde maintenant chaque entrée publiée, et la surface a été
comparée aux paquets 1.10.0 de npm : seul `LAYOUT_CSS` a changé).

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit « release: 1.11.0 »
npm ci
npm run release:check     # « Release check: the 5 packages at 1.11.0. »
```

## Publier — une des deux façons

**A. Depuis ton Mac** : `npm run publish:latest -- --otp=CODE` (relancer la même commande si le code expire).

**B. Par l'étiquette** (si le « trusted publisher » est déclaré sur les cinq) : `git tag v1.11.0 && git push origin v1.11.0`.

Puis `npm run publish:verify`, et dans les applications `npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular`.

## Ce que la 1.11.0 ajoute

- **Angular : `[motion]`** (`false` coupe le mouvement, en direct) : le seul réglage de la grille qui n'avait pas son
  entrée.
- **Angular : une sortie pour chaque événement de la grille** (19 de plus : `(sortChanged)`, `(filterChanged)`,
  `(pageChanged)`, `(columnResized)`, `(editingStarted)`…) ; avant, seulement par `(gridEvent)`. Un test échoue
  désormais si un réglage ou un événement arrive sans son entrée ou sa sortie.
- **Une colonne `editable` (ou `validate`, `edit`) sans `edit()`, `fill()` ni `range()`** est signalée (un
  avertissement `missing-feature`) : elle restait en lecture seule sans rien dire.

## Ce que la 1.11.0 corrige

- **Une grille avec peu de lignes remplit maintenant son conteneur** (hauteur fixe, colonne flex, part de flex) :
  la racine de la grille ne grandissait pas. Vu dans Chrome, Firefox et WebKit avec 3 et 10 000 lignes, en
  TypeScript, avec l'hôte d'Angular et avec l'élément.
- **`<dz-grid>` (l'élément) posé directement dans un hôte flex** remplit la hauteur, comme celui d'Angular.
- **Un build depuis les sources du dépôt** (le site) garde `import '@dzgrid/element/define'` ; le paquet publié
  reste le même (`./define.js`).
- **Le guide et le site** disent que `filters-base` ne donne aucun filtre aux colonnes de jours (un avertissement) ;
  les filtres de jours viennent de `@dzgrid/dom/filters`.
- **Quelque chose qui n'est pas une fonction dans `features`** (`pivot()` hors de `grouping({ pivot })`, une fonction
  non appelée, `null`…) ne fait plus planter `createGrid` : un avertissement `invalid-setting` à `features[i]`, l'élément
  ignoré.
- **Un titre sur plusieurs lignes coupé à `maxLines`** montre son « … » dans Chrome aussi (colonnes de nombres,
  arabe) : il se place au début de sa cellule (`data-hclamp`). Vu dans Chrome (fr, ar), Firefox et WebKit.
- **`check:api` garde chaque entrée publiée** (les paquets de langue français et arabe, `statusbar`, `row-numbers`…,
  les feuilles de `@dzgrid/theme`, les quatre « inputs » du composant Angular qui manquaient) ; un test échoue si une nouvelle entrée
  n'a pas sa section.

## À regarder après (CHANGELOG « Upgrading from 1.10.0 »)

- **Bordure comprise dans la hauteur** : une appli qui fixe elle-même la hauteur de `.dzg` (`block-size: 360px`)
  obtient 360 px en tout, 2 px de moins qu'avant.
- **L'élément porte `data-dzg-host`** et n'a plus de boîte à lui, même sous un parent flex ou grid ; une page qui veut
  une boîte écrit son `display` (sa règle gagne). L'hôte d'Angular ne change pas.
- **Un titre de colonne de nombres coupé à `maxLines`** est maintenant au début de sa cellule (les autres restent à la
  fin).

Tailles : K.8 90 105 / 91 000 (1.10.0 : 90 077) ; base DOM 24 749 / 24 750.
