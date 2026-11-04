# Publier DzGrid 1.4.0 — la liste du propriétaire

Préparé le 2026-11-04 (barre d'état, export Excel, recherche Ctrl+F, panneau des filtres, numéros de ligne, surlignage, barre et part de chargement, composant direct en Angular). **Rien n'est publié, aucune étiquette n'est poussée.** C'est toi qui
publies. Les quatre paquets sont en **1.4.0** (`@dzgrid/core`, `dom`, `theme`, `angular`), leurs pairs `@dzgrid/*` en
`^1.4.0`. Une version mineure : rien de la 1.3.0 n’a été retiré (`npm run check:api`).

## Avant

```sh
cd /Users/nadou/Dev/dzgrid
git pull                  # main, le commit « release: 1.4.0 »
npm ci
npm run release:check     # reconstruit l'exemple Angular s'il est périmé, le mesure, puis :
                          # « Release check: the four packages at 1.4.0. »
```

## Publier — une des deux façons

**A. Depuis ton Mac (comme la 1.0.0)** — un seul code à 6 chiffres pour les quatre :

```sh
npm whoami                               # luffysamy
npm run publish:latest -- --otp=CODE     # build, puis core → dom → theme → angular, puis vérifie sur npm
```

Si le code expire au milieu : relance la même commande, ce qui est déjà publié est sauté.

**B. Par l'étiquette** — seulement si le « trusted publisher » est déclaré sur les quatre paquets
(npmjs.com → paquet → Settings → Trusted Publisher : `plinthworks` / `dzgrid` / `release.yml`) :

```sh
git tag v1.4.0
git push origin v1.4.0
```

GitHub refait tout (build, exemple Angular construit et mesuré, tests, tailles, contraste, contrôle de version), puis
publie avec provenance, sans jeton.

## Vérifier

```sh
npm run publish:verify    # « All four are on npm. »
```

## Dans les applications

```sh
cd /Users/nadou/Dev/allergie-detector/admin-web   # (ou une autre appli)
npm update @dzgrid/core @dzgrid/dom @dzgrid/theme @dzgrid/angular
```

`^1.0.0` accepte déjà la 1.4.0. À lire avant (CHANGELOG « Upgrade notes ») : `[(selected)]` ou `(selectionChanged)`
(l'un ou l'autre) ; les clés ne sont pas des id (`selectedIds()`) ; l'impression (`print.css` ou `print.unlayered.css`) ;
la feuille de confort (`dzgrid.comfort.css`) pour garder les barres fines et le spinner.

## Ce que la 1.4.0 ajoute (tout est à activer, rien ne change seul)

- **Barre d'état** `@dzgrid/dom/statusbar` (+ `menu.css` pour son menu) : lignes, filtrées, sélection, somme, moyenne, min, max.
- **Export Excel** : `csvExport({ canExport, xlsx: {} })`, `bind(bouton, { format: 'xlsx' })` ; droite-à-gauche, styles par cellule.
  À faire avant de publier : ouvrir `~/Desktop/dzgrid-excel-check/` dans le vrai Excel (`VERIFIER-EXCEL.md`).
- **Recherche Ctrl+F** `@dzgrid/dom/find` (+ `find.css`) et « Effacer tous les filtres ».
- **Panneau des filtres** `@dzgrid/dom/filters-panel` (+ `filters-panel.css`).
- **Numéros de ligne** `@dzgrid/dom/row-numbers` (+ `row-numbers.css`).
- **Surlignage** du texte cherché (recherche rapide et Ctrl+F, `search.css`), actif par défaut, `highlight: false` pour l'enlever.
- **Barre de chargement** pendant un rechargement qui garde les lignes ; `update({ busy })`, Angular `[busy]` ;
  **part `busy`** pour la remplacer (une animation GSAP par exemple).
- **Angular** : `ui: { cell: MonComposant }` en plus du nom + `[parts]`.

## Tailles relevées (règle des +2 % ou décision du propriétaire)

`@dzgrid/angular` 7 650 (propriétaire, 2026-11-03) puis 7 665 ; base `dom` 23 250 ; `theme` 2 907 ; l'exemple Angular
réel 98 800 (mesuré 98 624 à la préparation).
